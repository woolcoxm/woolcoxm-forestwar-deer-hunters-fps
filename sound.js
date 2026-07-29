// sound.js — FORESTWAR procedural audio: shots, impacts, calls, ambience, explosions, bounces
const Sound = (() => {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let ambienceOn = false;
  let muted = false;
  const playing = new Set();

  function init() {
    if (ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
      master.connect(comp);
      comp.connect(ctx.destination);
      noiseBuf = makeNoiseBuffer(2.0);
    } catch (e) {
      ctx = null;
    }
  }

  function makeNoiseBuffer(seconds) {
    const len = (seconds * ctx.sampleRate) | 0;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function resume() {
    if (!ctx) init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function noiseSource(duration) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    src.start();
    src.stop(ctx.currentTime + duration + 0.05);
    return src;
  }

  function tone(freq, dur, type, gainPeak, filterFreq) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(gainPeak, ctx.currentTime + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq || 4000;
    osc.connect(g);
    g.connect(f);
    f.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
    playing.add(osc);
    osc.onended = () => { playing.delete(osc); };
  }

  function shot() {
    if (!ctx || muted) return;
    resume();
    const t = ctx.currentTime;
    const src = noiseSource(0.22);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(7000, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.18);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 180;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    src.connect(lp); lp.connect(hp); hp.connect(g); g.connect(master);
    tone(180, 0.08, 'square', 0.25, 900);
  }

  function shotgun() {
    if (!ctx || muted) return;
    resume();
    const t = ctx.currentTime;
    const src = noiseSource(0.3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(5000, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.85, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    src.connect(lp); lp.connect(g); g.connect(master);
    tone(90, 0.15, 'square', 0.3, 600);
  }

  function reloadClick() {
    if (!ctx || muted) return;
    resume();
    tone(900, 0.03, 'square', 0.12, 2000);
    setTimeout(() => tone(600, 0.04, 'square', 0.14, 1500), 80);
    setTimeout(() => tone(1200, 0.025, 'square', 0.1, 2500), 180);
  }

  function switchWeapon() {
    if (!ctx || muted) return;
    resume();
    tone(700, 0.04, 'square', 0.12, 1800);
    setTimeout(() => tone(500, 0.05, 'sine', 0.1, 1200), 60);
  }

  function impact() {
    if (!ctx || muted) return;
    resume();
    const t = ctx.currentTime;
    const src = noiseSource(0.08);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(bp); bp.connect(g); g.connect(master);
  }

  function explosion() {
    if (!ctx || muted) return;
    resume();
    const t = ctx.currentTime;
    const src = noiseSource(0.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, t);
    lp.frequency.exponentialRampToValueAtTime(80, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    src.connect(lp); lp.connect(g); g.connect(master);
    tone(55, 0.4, 'sine', 0.5, 200);
    setTimeout(() => tone(40, 0.3, 'triangle', 0.35, 150), 30);
  }

  function rocketLaunch() {
    if (!ctx || muted) return;
    resume();
    const t = ctx.currentTime;
    const src = noiseSource(0.4);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(800, t);
    bp.frequency.exponentialRampToValueAtTime(200, t + 0.35);
    bp.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    src.connect(bp); bp.connect(g); g.connect(master);
    tone(120, 0.3, 'sawtooth', 0.2, 500);
  }

  function grenadeBounce() {
    if (!ctx || muted) return;
    resume();
    tone(350 + Math.random() * 100, 0.04, 'triangle', 0.18, 2500);
  }

  function horn() {
    if (!ctx || muted) return;
    resume();
    const t = ctx.currentTime;
    tone(180, 0.5, 'sawtooth', 0.3, 800);
    setTimeout(() => tone(240, 0.4, 'sawtooth', 0.25, 900), 150);
    setTimeout(() => tone(180, 0.6, 'sawtooth', 0.3, 800), 350);
  }

  function birdCall() {
    if (!ctx || muted) return;
    if (Math.random() > 0.4) return;
    const base = 1400 + Math.random() * 900;
    const seq = [0, 3, 7, 12];
    for (let i = 0; i < seq.length; i++) {
      setTimeout(() => {
        if (!ctx || muted) return;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = base + seq[i] * 40;
        const now = ctx.currentTime;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
        osc.connect(g);
        g.connect(master);
        osc.start(now);
        osc.stop(now + 0.12);
      }, i * 70);
    }
  }

  function rustle() {
    if (!ctx || muted) return;
    resume();
    const t = ctx.currentTime;
    const src = noiseSource(0.5);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    src.connect(hp); hp.connect(g); g.connect(master);
  }

  function startAmbience() {
    if (ambienceOn || !ctx) return;
    ambienceOn = true;
    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuf;
    wind.loop = true;
    wind.playbackRate.value = 0.4;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.value = 0.08;
    wind.connect(lp); lp.connect(g); g.connect(master);
    wind.start();
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = 0.15;
    lfoG.gain.value = 0.04;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    lfo.start();
  }

  function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.55; }
  function isMuted() { return muted; }

  function update(dt) {
    if (!ctx || muted) return;
    if (Math.random() < dt * 0.3) birdCall();
    if (Math.random() < dt * 0.15) rustle();
  }

  function ping(freq) {
    if (!ctx || muted) return;
    resume();
    tone(freq || 880, 0.18, 'sine', 0.22, 4000);
    setTimeout(() => tone((freq || 880) * 1.5, 0.12, 'sine', 0.14, 5000), 70);
  }

  function heartbeat() {
    if (!ctx || muted) return;
    resume();
    tone(60, 0.12, 'sine', 0.5, 120);
    setTimeout(() => tone(50, 0.1, 'sine', 0.35, 100), 140);
  }

  // Exhausted-player breathing: soft filtered-noise exhale with a tiny tonal body.
  // Many systems call window.Sound.breath() (no args) when stamina is depleted.
  function breath() {
    if (!ctx || muted) return;
    resume();
    const t = ctx.currentTime;
    const dur = 0.55;
    const src = noiseSource(dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    tone(160, dur, 'sine', 0.05, 500);
  }

  // Sustained low-frequency rumble for concussions / heavy impacts / tremors.
  function rumble(duration) {
    if (!ctx || muted) return;
    resume();
    const t = ctx.currentTime;
    const dur = Math.max(0.2, duration || 0.6);
    const src = noiseSource(dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(160, t);
    lp.frequency.exponentialRampToValueAtTime(50, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp); lp.connect(g); g.connect(master);
    tone(45, dur, 'sine', 0.45, 120);
  }

  // Broadband noise burst (smoke pops, hisses, puffs).
  function noiseBurst(duration, filterFreq) {
    if (!ctx || muted) return;
    resume();
    const t = ctx.currentTime;
    const dur = Math.max(0.1, duration || 0.4);
    const src = noiseSource(dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = filterFreq || 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp); lp.connect(g); g.connect(master);
  }

  // tone is exported so every module that calls window.Sound.tone(...) actually plays.
  return { init, resume, tone, breath, rumble, noiseBurst, shot, shotgun, reloadClick, switchWeapon, impact, explosion, rocketLaunch, grenadeBounce, horn, birdCall, rustle, startAmbience, setMuted, isMuted, ping, heartbeat, update };
})();
window.Sound = Sound;