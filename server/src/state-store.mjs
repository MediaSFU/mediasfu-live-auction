import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const LOTS = Object.freeze([
  { id: 'lot-1', title: 'Studio microphone', art: '🎙️', reserveCents: 8500, minIncrementCents: 2500 },
  { id: 'lot-2', title: 'Vintage camera', art: '📷', reserveCents: 14500, minIncrementCents: 2500 },
  { id: 'lot-3', title: 'Signed print', art: '🖼️', reserveCents: 6000, minIncrementCents: 2500 },
]);
const digest = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');
const now = () => Date.now();
export class AuctionStore {
  constructor(filename = ':memory:') {
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auctions (id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, host_name TEXT NOT NULL, host_token_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', active_lot INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, ended_at INTEGER) STRICT;
      CREATE TABLE IF NOT EXISTS lots (auction_id TEXT NOT NULL REFERENCES auctions(id) ON DELETE CASCADE, id TEXT NOT NULL, title TEXT NOT NULL, art TEXT NOT NULL, reserve_cents INTEGER NOT NULL, min_increment_cents INTEGER NOT NULL, state TEXT NOT NULL, position INTEGER NOT NULL, highest_bid_cents INTEGER NOT NULL DEFAULT 0, highest_bidder_name TEXT, bid_count INTEGER NOT NULL DEFAULT 0, deadline_at INTEGER, PRIMARY KEY (auction_id,id)) STRICT;
      CREATE TABLE IF NOT EXISTS grants (token_hash TEXT PRIMARY KEY, auction_id TEXT NOT NULL REFERENCES auctions(id) ON DELETE CASCADE, role TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER) STRICT;
      CREATE TABLE IF NOT EXISTS participants (token_hash TEXT PRIMARY KEY, auction_id TEXT NOT NULL REFERENCES auctions(id) ON DELETE CASCADE, role TEXT NOT NULL, display_name TEXT NOT NULL, created_at INTEGER NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS bids (id TEXT PRIMARY KEY, auction_id TEXT NOT NULL, lot_id TEXT NOT NULL, participant_hash TEXT NOT NULL REFERENCES participants(token_hash), amount_cents INTEGER NOT NULL, idempotency_key TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(participant_hash,idempotency_key), FOREIGN KEY(auction_id,lot_id) REFERENCES lots(auction_id,id)) STRICT;
    `);
  }
  createAuction({ meetingId, hostName }) {
    const id = crypto.randomUUID(); const hostToken = randomToken(); const timestamp = now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO auctions(id,meeting_id,host_name,host_token_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id, meetingId, hostName, digest(hostToken), timestamp, timestamp);
      const insert = this.db.prepare('INSERT INTO lots(auction_id,id,title,art,reserve_cents,min_increment_cents,state,position,deadline_at) VALUES(?,?,?,?,?,?,?,?,?)');
      LOTS.forEach((lot, position) => insert.run(id, lot.id, lot.title, lot.art, lot.reserveCents, lot.minIncrementCents, position === 0 ? 'open' : 'queued', position, position === 0 ? timestamp + 45000 : null));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return { auctionId: id, hostToken, state: this.snapshot(id) };
  }
  hostAuction(auctionId, token) { return this.db.prepare('SELECT * FROM auctions WHERE id=? AND host_token_hash=?').get(auctionId, digest(token || '')) || null; }
  issueInvite(auctionId, role, ttlSeconds = 3600) {
    const grant = randomToken(); this.db.prepare('INSERT INTO grants(token_hash,auction_id,role,expires_at) VALUES(?,?,?,?)').run(digest(grant), auctionId, role, now() + ttlSeconds * 1000); return grant;
  }
  redeemInvite(grant, displayName) {
    const hash = digest(grant || ''); this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT * FROM grants WHERE token_hash=?').get(hash);
      if (!row || row.used_at || row.expires_at < now()) throw Object.assign(new Error('Invite is invalid, expired, or already used.'), { statusCode: 410 });
      const participantToken = randomToken(); const participantHash = digest(participantToken);
      this.db.prepare('UPDATE grants SET used_at=? WHERE token_hash=?').run(now(), hash);
      this.db.prepare('INSERT INTO participants(token_hash,auction_id,role,display_name,created_at) VALUES(?,?,?,?,?)').run(participantHash, row.auction_id, row.role, displayName, now());
      const auction = this.db.prepare("SELECT meeting_id FROM auctions WHERE id=? AND status='open'").get(row.auction_id);
      if (!auction) throw Object.assign(new Error('Auction has ended.'), { statusCode: 410 });
      this.db.exec('COMMIT'); return { auctionId: row.auction_id, meetingId: auction.meeting_id, role: row.role, participantToken };
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
  }
  rollbackRedemption(grant, participantToken) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM participants WHERE token_hash=?').run(digest(participantToken || ''));
      this.db.prepare('UPDATE grants SET used_at=NULL WHERE token_hash=?').run(digest(grant || ''));
      this.db.exec('COMMIT');
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
  }
  participant(auctionId, token) { return this.db.prepare('SELECT * FROM participants WHERE auction_id=? AND token_hash=?').get(auctionId, digest(token || '')) || null; }
  placeBid({ auctionId, participantToken, amountCents, idempotencyKey }) {
    const participant = this.participant(auctionId, participantToken);
    if (!participant || participant.role !== 'bidder') throw Object.assign(new Error('Only a bidder may bid.'), { statusCode: 403 });
    if (!Number.isSafeInteger(amountCents) || amountCents < 1) throw Object.assign(new Error('Bid amount is invalid.'), { statusCode: 400 });
    if (!/^[A-Za-z0-9_-]{16,96}$/.test(idempotencyKey || '')) throw Object.assign(new Error('Idempotency key is invalid.'), { statusCode: 400 });
    const participantHash = digest(participantToken);
    const previous = this.db.prepare('SELECT id,amount_cents FROM bids WHERE participant_hash=? AND idempotency_key=?').get(participantHash, idempotencyKey);
    if (previous) return { accepted: true, replayed: true, bidId: previous.id, amountCents: previous.amount_cents, state: this.snapshot(auctionId) };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const lot = this.db.prepare("SELECT * FROM lots WHERE auction_id=? AND state='open'").get(auctionId);
      if (!lot) throw Object.assign(new Error('No lot is open.'), { statusCode: 409 });
      const minimum = lot.highest_bid_cents ? lot.highest_bid_cents + lot.min_increment_cents : lot.reserve_cents;
      if (amountCents < minimum) throw Object.assign(new Error(`Bid must be at least ${minimum} cents.`), { statusCode: 409 });
      const bidId = crypto.randomUUID();
      this.db.prepare('INSERT INTO bids(id,auction_id,lot_id,participant_hash,amount_cents,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?)').run(bidId, auctionId, lot.id, participantHash, amountCents, idempotencyKey, now());
      const deadline = lot.deadline_at && lot.deadline_at - now() <= 10000 ? lot.deadline_at + 10000 : lot.deadline_at;
      this.db.prepare('UPDATE lots SET highest_bid_cents=?,highest_bidder_name=?,bid_count=bid_count+1,deadline_at=? WHERE auction_id=? AND id=?').run(amountCents, participant.display_name, deadline, auctionId, lot.id);
      this.db.prepare('UPDATE auctions SET updated_at=? WHERE id=?').run(now(), auctionId); this.db.exec('COMMIT');
      return { accepted: true, replayed: false, bidId, amountCents, state: this.snapshot(auctionId) };
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
  }
  settle(auctionId) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const active = this.db.prepare("SELECT * FROM lots WHERE auction_id=? AND state='open'").get(auctionId);
      if (!active) throw Object.assign(new Error('No lot is open.'), { statusCode: 409 });
      this.db.prepare('UPDATE lots SET state=? WHERE auction_id=? AND id=?').run(active.highest_bid_cents >= active.reserve_cents ? 'sold' : 'passed', auctionId, active.id);
      const next = this.db.prepare("SELECT * FROM lots WHERE auction_id=? AND state='queued' ORDER BY position LIMIT 1").get(auctionId);
      if (next) this.db.prepare("UPDATE lots SET state='open',deadline_at=? WHERE auction_id=? AND id=?").run(now() + 45000, auctionId, next.id); else this.db.prepare("UPDATE auctions SET status='settled' WHERE id=?").run(auctionId);
      this.db.prepare('UPDATE auctions SET active_lot=active_lot+1,updated_at=? WHERE id=?').run(now(), auctionId); this.db.exec('COMMIT'); return this.snapshot(auctionId);
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
  }
  markEnded(auctionId) { this.db.prepare("UPDATE auctions SET status='ended',ended_at=?,updated_at=? WHERE id=?").run(now(), now(), auctionId); return this.snapshot(auctionId); }
  snapshot(auctionId) {
    const auction = this.db.prepare('SELECT id,host_name,status,active_lot,created_at,updated_at,ended_at FROM auctions WHERE id=?').get(auctionId); if (!auction) return null;
    const lots = this.db.prepare('SELECT id,title,art,reserve_cents,min_increment_cents,state,position,highest_bid_cents,highest_bidder_name,bid_count,deadline_at FROM lots WHERE auction_id=? ORDER BY position').all(auctionId);
    return { id: auction.id, hostName: auction.host_name, status: auction.status, activeLotIndex: auction.active_lot, createdAt: auction.created_at, updatedAt: auction.updated_at, endedAt: auction.ended_at, lots: lots.map((lot) => ({ id: lot.id, title: lot.title, art: lot.art, reserveCents: lot.reserve_cents, minIncrementCents: lot.min_increment_cents, state: lot.state, position: lot.position, highestBidCents: lot.highest_bid_cents, highestBidderName: lot.highest_bidder_name, bidCount: lot.bid_count, deadlineAt: lot.deadline_at, remainingSeconds: lot.deadline_at ? Math.max(0, Math.ceil((lot.deadline_at - now()) / 1000)) : 0 })) };
  }
  close() { this.db.close(); }
}
