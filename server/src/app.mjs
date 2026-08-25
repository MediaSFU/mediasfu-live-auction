import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { AuctionStore } from './state-store.mjs';
export const DEFAULT_ROOM_API_URL = 'https://mediasfu.com/v1/rooms/';
const namePattern = /^[A-Za-z0-9]{2,10}$/;
const idempotencyKeyPattern = /^[\x21-\x7E]{8,128}$/;
const bearer = (request) => String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
const roomId = (data) => data?.meetingID || data?.meetingId || data?.roomName || data?.roomId;
const boundedTimeout = (value) => Math.min(15000, Math.max(1000, Number(value) || 8000));
const roomIdempotencyKey = (request) => {
  const value = request.headers['idempotency-key'];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !idempotencyKeyPattern.test(value)) throw Object.assign(new Error('Idempotency-Key must be 8-128 visible ASCII characters.'), { statusCode: 400 });
  return value;
};
async function body(request) { let raw = ''; for await (const chunk of request) { raw += chunk; if (Buffer.byteLength(raw) > 32768) throw Object.assign(new Error('Request is too large.'), { statusCode: 413 }); } try { return JSON.parse(raw || '{}'); } catch { throw Object.assign(new Error('Request body must be JSON.'), { statusCode: 400 }); } }
export function createAuctionServer({ env = process.env, fetchImpl = fetch, store } = {}) {
  if (!store) { const databasePath = path.resolve(import.meta.dirname, '..', env.AUCTION_DATABASE_PATH || 'data/auction.sqlite'); fs.mkdirSync(path.dirname(databasePath), { recursive: true }); store = new AuctionStore(databasePath); }
  const apiUserName = env.MEDIASFU_API_USERNAME; const apiKey = env.MEDIASFU_API_KEY; const roomApiUrl = env.MEDIASFU_ROOM_API_URL || DEFAULT_ROOM_API_URL; const origin = env.CORS_ORIGIN || '*'; const upstreamTimeoutMs = boundedTimeout(env.MEDIASFU_UPSTREAM_TIMEOUT_MS);
  const send = (response, status, value) => { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,content-type,idempotency-key', 'access-control-allow-methods': 'GET,POST,OPTIONS' }); response.end(JSON.stringify(value)); };
  const upstream = async (payload, idempotencyKey) => {
    if (!apiUserName || !apiKey) throw Object.assign(new Error('Backend is not configured with MediaSFU credentials.'), { statusCode: 503 });
    let response;
    try {
      response = await fetchImpl(roomApiUrl, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiUserName}:${apiKey}`, ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) }, body: JSON.stringify(payload), signal: AbortSignal.timeout(upstreamTimeoutMs) });
    } catch (error) {
      const timedOut = error?.name === 'AbortError' || error?.name === 'TimeoutError';
      throw Object.assign(new Error(timedOut ? 'MediaSFU room request timed out.' : 'MediaSFU room request could not be completed.'), { statusCode: timedOut ? 504 : 502 });
    }
    const raw = await response.text(); let data;
    try { data = JSON.parse(raw.replace(/^\uFEFF/, '').trim()); } catch { throw Object.assign(new Error('MediaSFU returned invalid JSON.'), { statusCode: 502 }); }
    if (!response.ok || data?.success === false) {
      const message = data?.error || data?.message || 'MediaSFU room request failed.';
      throw Object.assign(new Error(message), { statusCode: response.ok || response.status >= 500 ? 502 : 400 });
    }
    return data;
  };
  return http.createServer(async (request, response) => {
    if (request.method === 'OPTIONS') return send(response, 204, {}); const url = new URL(request.url || '/', 'http://localhost');
    try {
      if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { success: true, data: { status: 'ok', service: 'mediasfu-live-auction', configured: Boolean(apiUserName && apiKey) } });
      if (request.method === 'POST' && url.pathname === '/api/auctions') {
        const input = await body(request); const hostName = String(input.hostName || '').trim(); if (!namePattern.test(hostName)) throw Object.assign(new Error('hostName must be 2-10 letters or numbers.'), { statusCode: 400 });
        const data = await upstream({ action: 'create', userName: hostName, duration: 120, capacity: 8, eventType: 'conference', recordOnly: false }, roomIdempotencyKey(request)); const meetingId = roomId(data); if (!meetingId) throw Object.assign(new Error('Room creation did not return a meeting ID.'), { statusCode: 502 });
        const created = store.createAuction({ meetingId: String(meetingId), hostName }); return send(response, 201, { success: true, data, auction: created.state, hostToken: created.hostToken });
      }
      const inviteMatch = url.pathname.match(/^\/api\/auctions\/([^/]+)\/invites$/);
      if (request.method === 'POST' && inviteMatch) { const auctionId = decodeURIComponent(inviteMatch[1]); if (!store.hostAuction(auctionId, bearer(request))) throw Object.assign(new Error('Host authorization required.'), { statusCode: 403 }); const input = await body(request); const role = input.role === 'viewer' ? 'viewer' : 'bidder'; const grant = store.issueInvite(auctionId, role); return send(response, 201, { success: true, grant, role, expiresInSeconds: 3600 }); }
      if (request.method === 'POST' && url.pathname === '/api/invites/redeem') { const input = await body(request); const displayName = String(input.displayName || '').trim(); const grant = String(input.grant || ''); if (!namePattern.test(displayName)) throw Object.assign(new Error('displayName must be 2-10 letters or numbers.'), { statusCode: 400 }); const redeemed = store.redeemInvite(grant, displayName); let data; try { data = await upstream({ action: 'join', meetingID: redeemed.meetingId, userName: displayName }, roomIdempotencyKey(request)); } catch (error) { store.rollbackRedemption(grant, redeemed.participantToken); throw error; } return send(response, 200, { success: true, data, auction: store.snapshot(redeemed.auctionId), ...redeemed }); }
      const stateMatch = url.pathname.match(/^\/api\/auctions\/([^/]+)$/);
      if (request.method === 'GET' && stateMatch) { const auctionId = decodeURIComponent(stateMatch[1]); const authorized = store.hostAuction(auctionId, bearer(request)) || store.participant(auctionId, bearer(request)); if (!authorized) throw Object.assign(new Error('Auction authorization required.'), { statusCode: 403 }); const auction = store.snapshot(auctionId); return auction ? send(response, 200, { success: true, auction }) : send(response, 404, { success: false, error: 'Auction not found.' }); }
      const bidMatch = url.pathname.match(/^\/api\/auctions\/([^/]+)\/bids$/);
      if (request.method === 'POST' && bidMatch) { const input = await body(request); const result = store.placeBid({ auctionId: decodeURIComponent(bidMatch[1]), participantToken: bearer(request), amountCents: Number(input.amountCents), idempotencyKey: input.idempotencyKey }); return send(response, 201, { success: true, ...result }); }
      const settleMatch = url.pathname.match(/^\/api\/auctions\/([^/]+)\/settle$/);
      if (request.method === 'POST' && settleMatch) { const auctionId = decodeURIComponent(settleMatch[1]); if (!store.hostAuction(auctionId, bearer(request))) throw Object.assign(new Error('Host authorization required.'), { statusCode: 403 }); return send(response, 200, { success: true, auction: store.settle(auctionId) }); }
      const endMatch = url.pathname.match(/^\/api\/auctions\/([^/]+)\/end$/);
      if (request.method === 'POST' && endMatch) { const auctionId = decodeURIComponent(endMatch[1]); const host = store.hostAuction(auctionId, bearer(request)); if (!host) throw Object.assign(new Error('Host authorization required.'), { statusCode: 403 }); await upstream({ action: 'delete', meetingID: host.meeting_id }); const auction = store.markEnded(auctionId); return send(response, 200, { success: true, data: { outcome: 'ended', residue: 'clear' }, auction }); }
      const abandonMatch = url.pathname.match(/^\/api\/auctions\/([^/]+)\/abandon$/);
      if (request.method === 'POST' && abandonMatch) { const auctionId = decodeURIComponent(abandonMatch[1]); const host = store.hostAuction(auctionId, bearer(request)); if (!host) throw Object.assign(new Error('Host authorization required.'), { statusCode: 403 }); await upstream({ action: 'delete', meetingID: host.meeting_id }); const auction = store.markEnded(auctionId); return send(response, 200, { success: true, data: { outcome: 'ended', residue: 'clear' }, auction }); }
      return send(response, 404, { success: false, error: 'Not found.' });
    } catch (error) { return send(response, Number(error.statusCode) || 500, { success: false, error: error.message || 'Unexpected server error.' }); }
  });
}
