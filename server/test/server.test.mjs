import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createAuctionServer } from '../src/app.mjs';
import { AuctionStore } from '../src/state-store.mjs';
const servers = [];
afterEach(() => servers.splice(0).forEach((server) => server.close()));
async function start(upstream) { const calls = []; const fetchImpl = async (_url, options) => { const value = JSON.parse(options.body); calls.push({ payload: value, headers: options.headers }); if (upstream) return upstream(value, options); return { ok: true, status: 200, text: async () => JSON.stringify(value.action === 'create' ? { meetingID: 'room-test', token: 'room-scoped' } : { meetingID: value.meetingID, token: 'joined-room-scoped' }) }; }; const server = createAuctionServer({ env: { MEDIASFU_API_USERNAME: 'test-user', MEDIASFU_API_KEY: 'test-key' }, fetchImpl, store: new AuctionStore() }); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); servers.push(server); return { base: `http://127.0.0.1:${server.address().port}`, calls }; }
async function json(url, options = {}) { const response = await fetch(url, { headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options }); return { response, value: await response.json() }; }
test('host creates, grant is single use, bid is idempotent, and end is confirmed', async () => {
  const { base, calls } = await start(); const created = await json(`${base}/api/auctions`, { method: 'POST', body: JSON.stringify({ hostName: 'Auctioneer' }) }); assert.equal(created.response.status, 201); assert.equal(created.value.auction.lots.length, 3);
  const auth = { authorization: `Bearer ${created.value.hostToken}` }; const invite = await json(`${base}/api/auctions/${created.value.auction.id}/invites`, { method: 'POST', headers: auth, body: JSON.stringify({ role: 'bidder' }) }); const redeemed = await json(`${base}/api/invites/redeem`, { method: 'POST', body: JSON.stringify({ grant: invite.value.grant, displayName: 'Bidder1' }) }); assert.equal(redeemed.value.role, 'bidder');
  const reused = await json(`${base}/api/invites/redeem`, { method: 'POST', body: JSON.stringify({ grant: invite.value.grant, displayName: 'Bidder2' }) }); assert.equal(reused.response.status, 410);
  const bidHeaders = { authorization: `Bearer ${redeemed.value.participantToken}` }; const idempotencyKey = 'bid_test_key_0001'; const bid = await json(`${base}/api/auctions/${created.value.auction.id}/bids`, { method: 'POST', headers: bidHeaders, body: JSON.stringify({ amountCents: 8500, idempotencyKey }) }); assert.equal(bid.value.replayed, false); const replay = await json(`${base}/api/auctions/${created.value.auction.id}/bids`, { method: 'POST', headers: bidHeaders, body: JSON.stringify({ amountCents: 8500, idempotencyKey }) }); assert.equal(replay.value.replayed, true);
  const ended = await json(`${base}/api/auctions/${created.value.auction.id}/end`, { method: 'POST', headers: auth, body: '{}' }); assert.deepEqual(ended.value.data, { outcome: 'ended', residue: 'clear' }); assert.deepEqual(calls.map((entry) => entry.payload.action), ['create', 'join', 'delete']);
});

test('forwards create and join idempotency keys and rejects malformed keys', async () => {
  const { base, calls } = await start();
  const created = await json(`${base}/api/auctions`, { method: 'POST', headers: { 'idempotency-key': 'auction-create-0001' }, body: JSON.stringify({ hostName: 'Auctioneer' }) });
  const auth = { authorization: `Bearer ${created.value.hostToken}` };
  const invite = await json(`${base}/api/auctions/${created.value.auction.id}/invites`, { method: 'POST', headers: auth, body: JSON.stringify({ role: 'bidder' }) });
  await json(`${base}/api/invites/redeem`, { method: 'POST', headers: { 'idempotency-key': 'auction-join-0001' }, body: JSON.stringify({ grant: invite.value.grant, displayName: 'Bidder1' }) });
  assert.equal(calls[0].headers['idempotency-key'], 'auction-create-0001');
  assert.equal(calls[1].headers['idempotency-key'], 'auction-join-0001');
  const rejected = await json(`${base}/api/auctions`, { method: 'POST', headers: { 'idempotency-key': 'short' }, body: JSON.stringify({ hostName: 'Auctioneer' }) });
  assert.equal(rejected.response.status, 400);
  assert.equal(calls.length, 2);
});

test('HTTP 2xx with success false cannot create an auction', async () => {
  const { base } = await start(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ success: false, error: 'Room creation rejected.' }) }));
  const created = await json(`${base}/api/auctions`, { method: 'POST', body: JSON.stringify({ hostName: 'Auctioneer' }) });
  assert.equal(created.response.status, 502);
  assert.equal(created.value.success, false);
});

test('HTTP 2xx with success false rolls back join redemption', async () => {
  let rejectJoin = true;
  const { base } = await start(async (value) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(value.action === 'create'
      ? { success: true, meetingID: 'room-test', token: 'room-scoped' }
      : value.action === 'join' && rejectJoin
        ? { success: false, error: 'Room is unavailable.' }
        : { success: true, meetingID: value.meetingID, token: 'joined-room-scoped' }),
  }));
  const created = await json(`${base}/api/auctions`, { method: 'POST', body: JSON.stringify({ hostName: 'Auctioneer' }) });
  const auth = { authorization: `Bearer ${created.value.hostToken}` };
  const invite = await json(`${base}/api/auctions/${created.value.auction.id}/invites`, { method: 'POST', headers: auth, body: JSON.stringify({ role: 'bidder' }) });
  const failed = await json(`${base}/api/invites/redeem`, { method: 'POST', body: JSON.stringify({ grant: invite.value.grant, displayName: 'Bidder1' }) });
  assert.equal(failed.response.status, 502);
  rejectJoin = false;
  const retried = await json(`${base}/api/invites/redeem`, { method: 'POST', body: JSON.stringify({ grant: invite.value.grant, displayName: 'Bidder1' }) });
  assert.equal(retried.response.status, 200);
});

test('HTTP 2xx with success false cannot falsely confirm end or abandon', async () => {
  const { base } = await start(async (value) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(value.action === 'create'
      ? { success: true, meetingID: 'room-test', token: 'room-scoped' }
      : { success: false, error: 'Room cleanup rejected.' }),
  }));
  const created = await json(`${base}/api/auctions`, { method: 'POST', body: JSON.stringify({ hostName: 'Auctioneer' }) });
  const auth = { authorization: `Bearer ${created.value.hostToken}` };
  for (const route of ['end', 'abandon']) {
    const ended = await json(`${base}/api/auctions/${created.value.auction.id}/${route}`, { method: 'POST', headers: auth, body: '{}' });
    assert.equal(ended.response.status, 502);
    const state = await json(`${base}/api/auctions/${created.value.auction.id}`, { headers: auth });
    assert.equal(state.value.auction.status, 'open');
  }
});
