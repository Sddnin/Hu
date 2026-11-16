/**
 * Converts a browser-recorded audio Blob (webm/mp4/ogg) into a lightweight
 * 16kHz mono 16-bit PCM WAV Blob for maximum compatibility across AI audio APIs.
 * Falls back to the original Blob if Web Audio decoding is unavailable.
 */
export async function convertBlobToWav(blob: Blob): Promise<Blob> {
  if (typeof window === 'undefined') return blob;
  const lowerType = (blob.type || '').toLowerCase();
  if (lowerType.includes('wav')) return blob;

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  const OfflineCtx =
    window.OfflineAudioContext ||
    (
      window as unknown as {
        webkitOfflineAudioContext?: typeof OfflineAudioContext;
      }
    ).webkitOfflineAudioContext;

  if (!AudioCtx || !OfflineCtx) {
    return blob;
  }

  let ctx: AudioContext | null = null;
  try {
    const rawBuffer = await blob.arrayBuffer();
    ctx = new AudioCtx();
    const decoded = await ctx.decodeAudioData(rawBuffer.slice(0));

    const targetRate = 16000;
    const frameCount = Math.max(1, Math.ceil(decoded.duration * targetRate));
    const offline = new OfflineCtx(1, frameCount, targetRate);

    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0);

    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    const wavBuffer = encodePcm16Wav(samples, targetRate);
    return new Blob([wavBuffer], { type: 'audio/wav' });
  } catch {
    return blob;
  } finally {
    if (ctx) {
      await ctx.close().catch(() => {});
    }
  }
}

function encodePcm16Wav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(
      offset,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true
    );
    offset += 2;
  }

  return buffer;
}

function writeAscii(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
