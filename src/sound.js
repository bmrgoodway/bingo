// Web Audio API 로 만드는 효과음 (외부 음원 파일 없음).
// 브라우저가 소리를 막으므로, 첫 번째 손가락/키 입력 뒤에만 실제로 울립니다.

let ctx = null;
let master = null;
let enabled = true;

export function setSound(value) {
  enabled = !!value;
  if (master) master.gain.value = enabled ? 1 : 0;
}

export function soundOn() {
  return enabled;
}

export function primeSound() {
  if (!enabled) {
    // 소리가 꺼져 있어도 다음에 켤 때 바로 쓸 수 있게 문맥만 만들어 둡니다.
    ensure();
    return;
  }
  ensure();
}

function ensure() {
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? 1 : 0;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, { dur = 0.12, type = 'square', gain = 0.05, to = null, delay = 0 } = {}) {
  const c = ensure();
  if (!c || !enabled) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to != null) osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function noise({ dur = 0.25, gain = 0.035, delay = 0, highpass = 0 } = {}) {
  const c = ensure();
  if (!c || !enabled) return;
  const t0 = c.currentTime + delay;
  const frames = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    const fade = 1 - i / frames;
    data[i] = (Math.random() * 2 - 1) * fade;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = highpass ? 'highpass' : 'lowpass';
  filter.frequency.value = highpass || 2600;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  tap() { tone(520, { dur: 0.05, gain: 0.032 }); },
  check() {
    tone(680, { dur: 0.09, type: 'triangle', gain: 0.06, to: 980 });
    tone(1320, { dur: 0.05, type: 'sine', gain: 0.022, delay: 0.03 });
  },
  line() {
    [660, 880, 1180].forEach((f, i) => tone(f, { dur: 0.13, type: 'triangle', gain: 0.055, delay: i * 0.07 }));
  },
  win() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => {
      tone(f, { dur: 0.34, type: 'sine', gain: 0.065, delay: i * 0.1 });
      tone(f / 2, { dur: 0.3, type: 'square', gain: 0.02, delay: i * 0.1 });
    });
    noise({ dur: 0.7, gain: 0.016, delay: 0.5, highpass: 3200 });
  },
  lose() {
    [392, 330, 262].forEach((f, i) => tone(f, { dur: 0.24, type: 'triangle', gain: 0.05, delay: i * 0.13 }));
  },
  draw() {
    noise({ dur: 0.34, gain: 0.045, highpass: 900 });
    tone(180, { dur: 0.3, type: 'sawtooth', gain: 0.02, to: 320 });
  },
  ball() {
    tone(880, { dur: 0.11, type: 'square', gain: 0.05, to: 520 });
    tone(1245, { dur: 0.2, type: 'sine', gain: 0.05, delay: 0.06 });
  },
  error() {
    tone(200, { dur: 0.1, type: 'square', gain: 0.035, to: 140 });
  },
  curtain() {
    noise({ dur: 0.18, gain: 0.028 });
    tone(300, { dur: 0.14, type: 'triangle', gain: 0.03, to: 420 });
  },
};
