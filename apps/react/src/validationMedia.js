const FPS = 12;

export function localValidationMediaRequested(search = globalThis.location?.search || '') {
  const host = globalThis.location?.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') return false;
  const value = new URLSearchParams(search).get('fakeMedia');
  return value === '1' || value === 'camera' || value === 'video';
}

function syntheticCamera() {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext('2d');
  if (!context || typeof canvas.captureStream !== 'function') throw new Error('Canvas capture is unavailable.');
  let frame = 0;
  const draw = () => {
    frame += 1;
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#081827');
    gradient.addColorStop(1, '#173f4f');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#ffd60a';
    context.font = '900 86px system-ui, sans-serif';
    context.textAlign = 'center';
    context.fillText('LIVE AUCTION', canvas.width / 2, 260);
    context.fillStyle = '#f8fbff';
    context.font = '700 42px system-ui, sans-serif';
    context.fillText('Synthetic host camera · staging validation', canvas.width / 2, 340);
    context.fillStyle = '#5ce0d3';
    context.fillRect(110, 470, ((frame * 14) % (canvas.width - 220)), 18);
    context.fillStyle = '#a9bac8';
    context.font = '600 24px ui-monospace, monospace';
    context.fillText(`moving frame ${frame}`, canvas.width / 2, 540);
  };
  draw();
  const timer = globalThis.setInterval(draw, Math.round(1000 / FPS));
  const stream = canvas.captureStream(FPS);
  stream.getVideoTracks().forEach((track) => {
    try { Object.defineProperty(track, 'label', { value: 'MediaSFU synthetic auction camera', configurable: true }); } catch { /* cosmetic */ }
    const stop = track.stop.bind(track);
    track.stop = () => { globalThis.clearInterval(timer); stop(); };
  });
  return stream;
}

export function installLocalValidationMedia(search) {
  if (!localValidationMediaRequested(search) || !navigator.mediaDevices) return () => {};
  const devices = navigator.mediaDevices;
  if (devices.__mediasfuAuctionValidationInstalled) return devices.__mediasfuAuctionValidationUninstall;
  const original = devices.getUserMedia;
  const streams = new Set();
  devices.getUserMedia = async (constraints = {}) => {
    if (!constraints.video) return original.call(devices, constraints);
    const output = syntheticCamera();
    streams.add(output);
    if (constraints.audio) {
      const audio = await original.call(devices, { audio: constraints.audio }).catch(() => null);
      audio?.getAudioTracks().forEach((track) => output.addTrack(track));
    }
    return output;
  };
  const uninstall = () => {
    streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    streams.clear();
    devices.getUserMedia = original;
    delete devices.__mediasfuAuctionValidationInstalled;
    delete devices.__mediasfuAuctionValidationUninstall;
  };
  devices.__mediasfuAuctionValidationInstalled = true;
  devices.__mediasfuAuctionValidationUninstall = uninstall;
  return uninstall;
}
