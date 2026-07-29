// music.js — FORESTWAR adaptive combat music: layered procedural score that rises with nearby action and threat
const Music = (() => {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let started = false;
  let muted = false;

  const state = {
    intensity: 0,
    targetIntensity: 0,
    lowHpFlash: 0,
    beatTimer: 0,
    droneTimer: 0,
    padTimer: 0,
    pulseTimer: 0,
    bassTimer: 0,
    combatProximity: 0,
    threatLevel: 0,
    hpFrac: 1.0,
    time: 0,
  };

  const SCALE = [55, 55, 58, 62, 65, 67, 67, 70];
  const BASS_NOTES = [27.5, 27.5, 36.7, 30.9];
  const PAD_CHORDS = [
    [55, 65.4, 82.4],
    [49, 58.3, 73.4],
    [58.3, 65.4, 87.3],
  ];

  function init() {
    if (ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 1.0;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 4;
      comp.attack.value = 0.005;
      comp.release.value = 0.25;
      musicGain.connect(comp);
      comp.connect(master);
    } catch (e) {
      ctx = null;
    }
  }

  function start() {
    if (started || !ctx) return;
    started = true;
    if (ctx.state === 'suspended') ctx.resume();
    musicGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    musicGain.gain.exponentialRampToValueAtTime(0.45, ctx.currentTime + 3.0);
  }

  function setVolume(v) {
    if (!musicGain || !ctx) return;
    musicGain.gain.setTargetAtTime(Math.max(0, v), ctx.currentTime, 0.5);
  }

  function mute() {
    muted = true;
    if (musicGain && ctx) musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
  }
  function unmute() {
    muted = false;
    if (musicGain && ctx) musicGain.gain.setTargetAtTime(0.45, ctx.currentTime, 0.3);
  }

  function midiToFreq(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  let bassStep = 0;
  function playBass(intensity) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const freq = BASS_NOTES[bassStep % BASS_NOTES.length];
    bassStep++;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq * 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18 + intensity * 0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5 + intensity * 0.4);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 180 + intensity * 220;
    osc.connect(g); sub.connect(g); g.connect(f); f.connect(musicGain);
    osc.start(t); sub.start(t);
    osc.stop(t + 1.0); sub.stop(t + 1.0);
  }

  let melodyStep = 0;
  function playMelody(intensity) {
    if (!ctx || muted || intensity < 0.25) return;
    const t = ctx.currentTime;
    const note = SCALE[(melodyStep + (Math.random() < 0.3 ? 1 : 0)) % SCALE.length];
    melodyStep++;
    const freq = midiToFreq(note + 12);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06 + intensity * 0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq * 2;
    f.Q.value = 6;
    osc.connect(g); g.connect(f); f.connect(musicGain);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  let padStep = 0;
  function playPad(intensity) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const chord = PAD_CHORDS[padStep % PAD_CHORDS.length];
    padStep++;
    for (let i = 0; i < chord.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = chord[i];
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.03 + intensity * 0.02, t + 1.5);
      g.gain.linearRampToValueAtTime(0.0001, t + 5.0);
      const detune = ctx.createOscillator();
      detune.type = 'sine';
      detune.frequency.value = chord[i] * 1.003;
      const dg = ctx.createGain();
      dg.gain.setValueAtTime(0.0001, t);
      dg.gain.linearRampToValueAtTime(0.025 + intensity * 0.015, t + 1.5);
      dg.gain.linearRampToValueAtTime(0.0001, t + 5.0);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 600 + intensity * 400;
      osc.connect(g); detune.connect(dg);
      g.connect(f); dg.connect(f); f.connect(musicGain);
      osc.start(t); detune.start(t);
      osc.stop(t + 5.2); detune.stop(t + 5.2);
    }
  }

  function playPerc(intensity) {
    if (!ctx || muted || intensity < 0.15) return;
    const t = ctx.currentTime;
    const len = (ctx.sampleRate * 0.15) | 0;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.08 + intensity * 0.18;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 120 + intensity * 200;
    src.connect(g); g.connect(f); f.connect(musicGain);
    src.start(t);
  }

  function playKick(intensity) {
    if (!ctx || muted || intensity < 0.4) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2 + intensity * 0.15, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(g); g.connect(musicGain);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  function playLowHpSpike() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2000;
    osc.connect(g); g.connect(f); f.connect(musicGain);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  function updateIntensity(dt) {
    const cam = window.CAMERA;
    const ents = window.Entities && window.Entities.list;
    if (!cam || !ents) {
      state.targetIntensity = 0.05;
    } else {
      const pt = (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
      let nearby = 0;
      let veryClose = 0;
      const cx = cam.position.x, cz = cam.position.z;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (e.dead || e.team === pt) continue;
        const m = e.mesh;
        if (!m) continue;
        const dx = m.position.x - cx;
        const dz = m.position.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1600) {
          nearby++;
          if (d2 < 400) veryClose++;
        }
      }
      const ms = window.Manager && window.Manager.state;
      if (ms) {
        state.hpFrac = ms.playerMaxHp > 0 ? ms.playerHp / ms.playerMaxHp : 1;
      }
      state.combatProximity = Math.min(1, veryClose * 0.15 + nearby * 0.04);
      state.threatLevel = state.hpFrac < 0.35 ? (0.35 - state.hpFrac) * 1.8 : 0;
      state.targetIntensity = Math.min(1, 0.08 + state.combatProximity * 0.85 + state.threatLevel * 0.3);
    }
    const lerp = state.targetIntensity > state.intensity ? 1.2 : 0.5;
    state.intensity += (state.targetIntensity - state.intensity) * Math.min(1, dt * lerp);
    if (state.intensity < 0) state.intensity = 0;
    if (state.intensity > 1) state.intensity = 1;
  }

  function update(dt) {
    if (!ctx || !started) return;
    state.time += dt;
    updateIntensity(dt);

    if (state.hpFrac < 0.30 && state.time % 2.0 < dt) {
      playLowHpSpike();
    }

    const beatInterval = 1.2 - state.intensity * 0.65;
    state.beatTimer -= dt;
    if (state.beatTimer <= 0) {
      state.beatTimer = beatInterval;
      playBass(state.intensity);
      if (state.intensity > 0.3 && Math.random() < 0.45 + state.intensity * 0.3) {
        playPerc(state.intensity);
      }
    }

    const melodyInterval = 0.6 - state.intensity * 0.3;
    state.pulseTimer -= dt;
    if (state.pulseTimer <= 0) {
      state.pulseTimer = melodyInterval;
      playMelody(state.intensity);
    }

    state.padTimer -= dt;
    if (state.padTimer <= 0) {
      state.padTimer = 5.0 - state.intensity * 1.5;
      playPad(state.intensity);
    }

    state.bassTimer -= dt;
    if (state.bassTimer <= 0 && state.intensity > 0.35) {
      state.bassTimer = 0.5;
      playKick(state.intensity);
    }
  }

  function reset() {
    state.intensity = 0;
    state.targetIntensity = 0;
    state.combatProximity = 0;
    state.threatLevel = 0;
    state.hpFrac = 1;
    state.beatTimer = 0;
    state.pulseTimer = 0;
    state.padTimer = 0;
    state.bassTimer = 0;
    melodyStep = 0;
    bassStep = 0;
    padStep = 0;
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') {
      if (muted) unmute(); else mute();
    }
  });

  return { init, start, update, reset, setVolume, mute, unmute, get state() { return state; } };
})();
window.Music = Music;