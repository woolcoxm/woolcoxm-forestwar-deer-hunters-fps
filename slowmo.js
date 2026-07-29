// slowmo.js — FORESTWAR cinematic slow-motion: triggers on high killstreaks, dilates game time with visual pulse
const Slowmo = (() => {
  const TRIGGER_MULT = 3;
  const TRIGGER_WINDOW = 5.0;
  const SLOWMO_SCALE = 0.35;
  const RAMP_IN = 0.18;
  const HOLD = 0.55;
  const RAMP_OUT = 0.45;
  const TOTAL_DURATION = RAMP_IN + HOLD + RAMP_OUT;
  const COOLDOWN = 9.0;
  const CHROMA_INTENSITY = 0.5;
  const SCANLINE_OPACITY = 0.18;

  const state = {
    phase: 'idle',
    timer: 0,
    scale: 1.0,
    cd: 0,
    edgePulse: 0,
    recentKills: [],
  };

  let prevTimeScale = 1.0;

  const hud = document.getElementById('hud');
  if (!hud) return { onKill() {}, update() {}, reset() {}, state };

  const chroma = document.createElement('div');
  chroma.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:9;'
    + 'box-shadow:inset 0 0 100px 10px rgba(0,0,0,0);'
    + 'transition:box-shadow 0.1s;';
  hud.appendChild(chroma);

  const scanlines = document.createElement('div');
  scanlines.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:9;'
    + 'background:repeating-linear-gradient(0deg,transparent 0px,transparent 2px,'
    + 'rgba(0,0,0,0) 3px);opacity:0;transition:opacity 0.15s,background 0.1s;';
  hud.appendChild(scanlines);

  const banner = document.createElement('div');
  banner.style.cssText = 'position:absolute;top:18%;left:50%;transform:translate(-50%,-50%);'
    + 'font-size:36px;font-weight:bold;letter-spacing:10px;color:#66ddff;'
    + 'text-shadow:0 0 25px rgba(100,200,255,0.8),0 0 50px rgba(80,180,255,0.4),0 3px 8px #000;'
    + 'opacity:0;transition:opacity 0.2s,transform 0.3s;pointer-events:none;z-index:10;'
    + 'white-space:nowrap;font-family:"Trebuchet MS",sans-serif;';
  banner.textContent = 'SLOW-MOTION';
  hud.appendChild(banner);

  const flashOverlay = document.createElement('div');
  flashOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:8;'
    + 'background:radial-gradient(circle at center,rgba(100,200,255,0) 30%,rgba(40,80,140,0) 70%);'
    + 'opacity:0;transition:opacity 0.12s;';
  hud.appendChild(flashOverlay);

  function getTimeScale() {
    return state.scale;
  }

  function setGameTimeScale(scale) {
    if (window.Manager && window.Manager.setTimeScale) {
      window.Manager.setTimeScale(scale);
    } else if (window.gameTimeScale !== undefined) {
      window.gameTimeScale = scale;
    }
  }

  function trigger() {
    if (state.phase !== 'idle') {
      state.timer = 0;
      state.phase = 'rampIn';
      return;
    }
    state.phase = 'rampIn';
    state.timer = 0;
    state.edgePulse = 1.0;

    banner.style.opacity = '1';
    banner.style.transform = 'translate(-50%,-50%) scale(1.15)';
    setTimeout(() => { banner.style.transform = 'translate(-50%,-50%) scale(1)'; }, 80);
    setTimeout(() => {
      if (state.phase === 'idle') banner.style.opacity = '0';
    }, 1200);

    flashOverlay.style.opacity = '1';
    setTimeout(() => { flashOverlay.style.opacity = '0'; }, 120);

    if (window.Sound) {
      window.Sound.tone(180, 0.6, 'sine', 0.3, 600);
      window.Sound.tone(90, 0.8, 'triangle', 0.25, 300);
    }

    if (window.FX && window.FX.shake) window.FX.shake(0.08);
  }

  function onKill(victimTeam) {
    if (!victimTeam) return;
    const now = performance.now() / 1000;
    state.recentKills.push(now);
    const cutoff = now - TRIGGER_WINDOW;
    while (state.recentKills.length > 0 && state.recentKills[0] < cutoff) {
      state.recentKills.shift();
    }
    if (state.recentKills.length >= TRIGGER_MULT && state.cd <= 0 && state.phase === 'idle') {
      state.recentKills = [];
      state.cd = COOLDOWN;
      trigger();
    }
  }

  function update(dt) {
    if (state.cd > 0) state.cd -= dt;

    if (state.phase === 'idle') {
      const target = 1.0;
      if (state.scale !== target) {
        state.scale += (target - state.scale) * Math.min(1, dt * 10);
        if (Math.abs(state.scale - target) < 0.01) state.scale = target;
      }
      setGameTimeScale(state.scale);
      chroma.style.boxShadow = 'inset 0 0 100px 10px rgba(0,0,0,0)';
      scanlines.style.opacity = '0';
      return;
    }

    state.timer += dt;
    state.edgePulse = Math.max(0, state.edgePulse - dt * 2.5);

    if (state.phase === 'rampIn') {
      const t = Math.min(1, state.timer / RAMP_IN);
      state.scale = 1.0 + (SLOWMO_SCALE - 1.0) * easeOutCubic(t);
      if (t >= 1) {
        state.phase = 'hold';
        state.timer = 0;
      }
    } else if (state.phase === 'hold') {
      state.scale = SLOWMO_SCALE;
      if (state.timer >= HOLD) {
        state.phase = 'rampOut';
        state.timer = 0;
      }
    } else if (state.phase === 'rampOut') {
      const t = Math.min(1, state.timer / RAMP_OUT);
      state.scale = SLOWMO_SCALE + (1.0 - SLOWMO_SCALE) * easeInCubic(t);
      if (t >= 1) {
        state.scale = 1.0;
        state.phase = 'idle';
        banner.style.opacity = '0';
      }
    }

    setGameTimeScale(state.scale);

    const intensity = 1.0 - state.scale;
    const easedIntensity = intensity / (1.0 - SLOWMO_SCALE);

    const edgeAlpha = CHROMA_INTENSITY * easedIntensity + state.edgePulse * 0.3;
    chroma.style.boxShadow = 'inset 0 0 ' + (80 + easedIntensity * 60) + 'px '
      + (8 + easedIntensity * 8) + 'px rgba(40,80,140,' + edgeAlpha.toFixed(3) + ')';

    scanlines.style.opacity = (SCANLINE_OPACITY * easedIntensity).toFixed(3);
    if (easedIntensity > 0.02) {
      scanlines.style.background = 'repeating-linear-gradient(0deg,transparent 0px,transparent 2px,'
        + 'rgba(0,0,0,' + (0.12 * easedIntensity).toFixed(3) + ') 3px)';
    }

    if (state.phase !== 'idle' && Math.random() < dt * 8 * easedIntensity) {
      chroma.style.transform = 'translate(' + ((Math.random() - 0.5) * 3) + 'px,'
        + ((Math.random() - 0.5) * 2) + 'px)';
    } else {
      chroma.style.transform = '';
    }
  }

  function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
  function easeInCubic(x) { return x * x * x; }

  function reset() {
    state.phase = 'idle';
    state.timer = 0;
    state.scale = 1.0;
    state.cd = 0;
    state.edgePulse = 0;
    state.recentKills = [];
    setGameTimeScale(1.0);
    chroma.style.boxShadow = 'inset 0 0 100px 10px rgba(0,0,0,0)';
    chroma.style.transform = '';
    scanlines.style.opacity = '0';
    banner.style.opacity = '0';
    flashOverlay.style.opacity = '0';
  }

  if (window.KillRewards && window.KillRewards.register) {
    window.KillRewards.register(onKill);
  }

  return { update, reset, getTimeScale, onKill, state };
})();

window.Slowmo = Slowmo;