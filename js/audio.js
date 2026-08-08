/* ===== audio: AudioContext, synth helpers, sound definitions ===== */
let actx = null, masterGain = null;
function ensureAudio() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = actx.createGain();
  masterGain.gain.value = 0.55;
  masterGain.connect(actx.destination);
}
function sfx(f0, f1, dur, type, vol) {
  if (!actx) return;
  const t = actx.currentTime;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(masterGain);
  o.start(t); o.stop(t + dur);
}
const sRifle   = () => sfx(520, 140, 0.08, 'sawtooth', 0.11);
const sShotgun = () => sfx(260, 55, 0.22, 'sawtooth', 0.2);
const sHit   = () => sfx(220, 90, 0.1, 'square', 0.1);
const sKill  = () => sfx(280, 640, 0.16, 'triangle', 0.14);
const sHurt  = () => sfx(130, 55, 0.28, 'sawtooth', 0.2);
const sChop  = () => sfx(180, 70, 0.09, 'square', 0.13);
const sPlace = () => sfx(340, 520, 0.1, 'triangle', 0.12);
const sDeny  = () => sfx(220, 110, 0.14, 'square', 0.08);
const sDry   = () => sfx(700, 500, 0.05, 'square', 0.06);
const sReload = () => sfx(300, 900, 0.12, 'square', 0.05);
const sEquip = () => sfx(400, 800, 0.06, 'triangle', 0.06);
const sBreak = () => sfx(160, 40, 0.25, 'sawtooth', 0.16);
const sThud  = () => sfx(90, 40, 0.18, 'sine', 0.2);
const sSwing = () => sfx(150, 90, 0.12, 'triangle', 0.05);
const sWood  = () => sfx(240, 90, 0.08, 'square', 0.12);
const sStone = () => sfx(430, 160, 0.07, 'square', 0.1);
const sMetal = () => sfx(880, 300, 0.09, 'triangle', 0.1);
const sPickup = () => sfx(600, 1200, 0.09, 'triangle', 0.1);
const sBox   = () => sfx(200, 480, 0.2, 'triangle', 0.12);
const sSpawn = () => sfx(90, 200, 0.22, 'sine', 0.05);
const sHead  = () => sfx(700, 1400, 0.12, 'triangle', 0.12);
const sSelect = () => sfx(500, 700, 0.05, 'square', 0.05);
const sSniper = () => sfx(300, 60, 0.3, 'sawtooth', 0.24);
const sSmg   = () => sfx(600, 200, 0.05, 'sawtooth', 0.08);
const sBolt  = () => sfx(400, 150, 0.12, 'square', 0.07);
const sWave  = () => sfx(220, 660, 0.3, 'triangle', 0.1);
const sBossSpawn = () => { sfx(60, 220, 0.5, 'sawtooth', 0.18); sfx(120, 40, 0.6, 'sine', 0.15); };
const sBossDie = () => { sfx(500, 80, 0.5, 'triangle', 0.2); sfx(90, 30, 0.4, 'sine', 0.2); };
const sCharge = () => sfx(80, 300, 0.6, 'sawtooth', 0.12);
const sShock  = () => sfx(70, 28, 0.35, 'sine', 0.3);
const sSummon = () => sfx(800, 1600, 0.25, 'triangle', 0.1);
const sShieldUp = () => sfx(300, 900, 0.3, 'sine', 0.1);
const sShieldBreak = () => sfx(1200, 200, 0.3, 'square', 0.15);
const sAim = () => sfx(900, 1100, 0.08, 'square', 0.05);
const sDoorOpen = () => sfx(180, 320, 0.22, 'triangle', 0.1);
const sDoorClose = () => sfx(320, 140, 0.16, 'triangle', 0.12);
const sAk = () => sfx(460, 110, 0.09, 'sawtooth', 0.13);
const sRocket = () => { sfx(120, 400, 0.35, 'sawtooth', 0.16); sfx(60, 200, 0.3, 'sine', 0.12); };
const sExplosion = () => { sfx(90, 25, 0.5, 'sawtooth', 0.3); sfx(50, 20, 0.6, 'sine', 0.25); };
