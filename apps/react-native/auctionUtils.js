export const money = cents =>
  '$' + (Number(cents || 0) / 100).toLocaleString();

export const liveVideo = stream => {
  try {
    return Boolean(
      stream?.getVideoTracks?.().some(track => track?.readyState === 'live'),
    );
  } catch {
    return false;
  }
};

export const invitationUrl = grant =>
  'mediasfu-auction://join?invite=' + encodeURIComponent(grant);
