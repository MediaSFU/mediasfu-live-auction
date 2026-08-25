export const ROOM_CONNECTION_GRACE_MS = 15000;

export function roomConnectionPresentation({ ready, readinessReason, failure, wasReady, elapsedMs }) {
  if (ready) return { state: 'live', label: 'LIVE SALESROOM', detail: 'Media connected · bids are authoritative' };
  if (failure || wasReady || elapsedMs >= ROOM_CONNECTION_GRACE_MS) {
    return {
      state: 'unavailable',
      label: 'ROOM UNAVAILABLE',
      detail: failure || readinessReason || 'The room did not become available.',
    };
  }
  return { state: 'connecting', label: 'SECURING ROOM', detail: readinessReason || 'Connecting to MediaSFU.' };
}

export function createOneShotCleanup(work) {
  let handled = false;
  return {
    run() {
      if (handled) return false;
      handled = true;
      Promise.resolve().then(work).catch(() => {});
      return true;
    },
    markHandled() { handled = true; },
  };
}
