// Barkod okutma sesleri — Web Audio ile üretilir (harici dosya yok).
let ctx: AudioContext | null = null;

function actx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function bip(freq: number, durMs: number, vol = 0.18, type: OscillatorType = "square", gecikmeMs = 0) {
  const ac = actx();
  if (!ac) return;
  const t = ac.currentTime + gecikmeMs / 1000;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // Yumuşak açılış/kapanış — "tık" sesini önler
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.008);
  gain.gain.linearRampToValueAtTime(0, t + durMs / 1000);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + durMs / 1000 + 0.02);
}

// Başarılı: yükselen iki nota (ding-ding).
export function sesBasarili() {
  bip(800, 80, 0.16, "triangle");
  bip(1250, 110, 0.16, "triangle", 95);
}

// Başarısız: uzun, alçak tek bip.
export function sesHata() {
  bip(160, 360, 0.2, "square");
}
