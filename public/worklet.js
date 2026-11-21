// Mic input at the context rate -> 16 kHz s16le frames of exactly 512 samples (1,024 bytes).
const OUT_RATE = 16000;
const FRAME = 512;

class Mic16k extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / OUT_RATE;
    this.integer = Number.isInteger(this.ratio);
    this.sum = 0;
    this.count = 0;
    this.pos = 0; // fractional read position; index -1 is the last sample of the previous block
    this.last = 0;
    this.frame = new Int16Array(FRAME);
    this.fill = 0;
  }

  emit(x) {
    const s = x > 1 ? 1 : x < -1 ? -1 : x;
    this.frame[this.fill++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    if (this.fill === FRAME) {
      const buf = this.frame.buffer;
      this.port.postMessage(buf, [buf]);
      this.frame = new Int16Array(FRAME);
      this.fill = 0;
    }
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    const n = ch.length;
    if (this.integer) {
      for (let i = 0; i < n; i++) {
        this.sum += ch[i];
        if (++this.count === this.ratio) {
          this.emit(this.sum / this.ratio);
          this.sum = 0;
          this.count = 0;
        }
      }
    } else {
      while (Math.floor(this.pos) + 1 <= n - 1) {
        const i0 = Math.floor(this.pos);
        const f = this.pos - i0;
        const a = i0 < 0 ? this.last : ch[i0];
        this.emit(a + (ch[i0 + 1] - a) * f);
        this.pos += this.ratio;
      }
      this.pos -= n;
      this.last = ch[n - 1];
    }
    return true;
  }
}

registerProcessor("mic-16k", Mic16k);
