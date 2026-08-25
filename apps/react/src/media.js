export function selectAuctionMedia(room, role) {
  const screen = room?.screenShare?.stream || null;
  const remote = (room?.remoteVideos || []).filter((entry) => entry?.stream && hasLiveVideo(entry.stream));
  const local = room?.localVideo && hasLiveVideo(room.localVideo) ? room.localVideo : null;
  const hostCamera = role === 'host' ? local : remote[0]?.stream || null;
  return { primary: screen ? { kind: 'screen', stream: screen } : hostCamera ? { kind: role === 'host' ? 'local' : 'remote', stream: hostCamera } : null, screenActive: Boolean(screen), bidderStreams: role === 'host' ? remote : remote.slice(1), local };
}
export function hasLiveVideo(stream) {
  try { return Boolean(stream?.getVideoTracks?.().some((track) => track?.readyState === 'live')); } catch { return false; }
}
export function money(cents) { return `$${(Number(cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`; }
export function nextBid(lot, increment = 2500) { return Math.max(lot?.reserveCents || 0, (lot?.highestBidCents || 0) + increment); }
