/**
 * Media Stream Helper: Provides real webcam/mic stream with a zero-failure synthetic fallback canvas.
 */

export async function getLocalMediaStream(preferredVideo = true, preferredAudio = true): Promise<MediaStream> {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: preferredVideo ? { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } : false,
        audio: preferredAudio,
      });
      return stream;
    } catch (err) {
      console.warn('Webcam/Mic not accessible or denied, initializing high-fps synthetic stream:', err);
    }
  }

  return createSyntheticMediaStream('Peer Pilot');
}

export function createSyntheticMediaStream(label: string): MediaStream {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');

  let frame = 0;
  function render() {
    if (!ctx) return;
    frame++;
    const t = frame / 30;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dynamic grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Avatar silhouette with motion
    const cx = canvas.width / 2 + Math.sin(t * 1.5) * 15;
    const cy = canvas.height / 2 + Math.cos(t * 2) * 8;

    // Torso
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.ellipse(cx, canvas.height + 20, 160, 120, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = '#f87171';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 20, 65, 80, 0, 0, Math.PI * 2);
    ctx.fill();

    // Animated mouth speaking
    const mouthOpen = Math.abs(Math.sin(t * 4)) * 20;
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 25, 24, Math.max(4, mouthOpen), 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes blinking
    const blink = Math.sin(t * 1.2) > 0.85 ? 2 : 12;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(cx - 24, cy - 25, 14, blink, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 24, cy - 25, 14, blink, 0, 0, Math.PI * 2);
    ctx.fill();

    // Timestamp & HUD
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`SYNTHETIC WEBCAM // ${label}`, 16, 26);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.fillText(`FRAME: #${frame} | ${new Date().toLocaleTimeString()}`, 16, 44);

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);

  const videoStream = canvas.captureStream(30);

  // Synthesize an audio track with gentle pink noise or periodic click
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    gain.gain.value = 0.001; // virtually silent
    osc.connect(gain);
    const dest = audioCtx.createMediaStreamDestination();
    gain.connect(dest);
    osc.start();
    dest.stream.getAudioTracks().forEach((track) => {
      videoStream.addTrack(track);
    });
  } catch {
    // Handled
  }

  return videoStream;
}
