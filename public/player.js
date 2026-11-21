// Gapless player for PCM s16le mono 24 kHz chunks of any byte length.
const RATE = 24000;

export function createPlayer(ctx) {
  let nextTime = 0;
  let spare = null; // odd trailing byte carried to the next chunk
  let armed = true;
  let firstCb = null;
  const sources = new Set();

  function enqueue(arrayBuffer) {
    let bytes = new Uint8Array(arrayBuffer);
    if (spare !== null) {
      const joined = new Uint8Array(bytes.length + 1);
      joined[0] = spare;
      joined.set(bytes, 1);
      bytes = joined;
      spare = null;
    }
    if (bytes.length & 1) {
      spare = bytes[bytes.length - 1];
      bytes = bytes.subarray(0, bytes.length - 1);
    }
    const n = bytes.length >> 1;
    if (n === 0) return;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    const buf = ctx.createBuffer(1, n, RATE);
    const out = buf.getChannelData(0);
    for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true) / 32768;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    nextTime = Math.max(ctx.currentTime + 0.02, nextTime);
    src.start(nextTime);
    nextTime += buf.duration;
    sources.add(src);
    src.onended = () => sources.delete(src);

    if (armed) {
      armed = false;
      if (firstCb) firstCb();
    }
  }

  function stop() {
    for (const s of sources) {
      s.onended = null;
      try { s.stop(); } catch {}
    }
    sources.clear();
    nextTime = 0;
    spare = null;
    armed = true;
  }

  return {
    enqueue,
    stop,
    onFirstAudio(cb) { firstCb = cb; },
    endsAt() { return nextTime; },
  };
}
