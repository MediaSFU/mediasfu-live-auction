import assert from 'node:assert/strict';
import test from 'node:test';
import { hasLiveVideo, nextBid, selectAuctionMedia } from '../src/media.js';
const stream = (readyState = 'live') => ({ getVideoTracks: () => [{ readyState }] });
test('screen is primary, local camera is host fallback, and ended tracks are rejected', () => {
  const room = { screenShare: { stream: stream() }, localVideo: stream(), remoteVideos: [{ stream: stream(), producerId: 'peer' }] };
  assert.equal(selectAuctionMedia(room, 'host').primary.kind, 'screen');
  assert.equal(selectAuctionMedia({ ...room, screenShare: {} }, 'host').primary.kind, 'local');
  assert.equal(hasLiveVideo(stream('ended')), false);
});
test('next bid respects reserve and increment', () => { assert.equal(nextBid({ reserveCents: 8500, highestBidCents: 0 }, 2500), 8500); assert.equal(nextBid({ reserveCents: 8500, highestBidCents: 8500 }, 2500), 11000); });
