// chaos-surge.js — FORESTWAR chaos surge: every 90s a random arena-wide event triggers, changing match dynamics temporarily
const THREE = window.THREE;
const SCENE = window.SCENE;
const ChaosSurge = (() => {
  const FIRST_DELAY = 45;
  const CHECK_INTERVAL = 90;
  const SURGE_DURATION = 22;
  const ANNOUNCE_TIME = 3.5;

  const SURGES = [
    { id: 'fog', name: 'FOG OF WAR', color: '#88aacc', desc: 'Visibility reduced' },
    { id: 'double', name: 'DOUBLE DOWN', color: '#ffdd44', desc: '2x score from kills' },
    { id: 'speed', name: 'SPEEDY BOIS', color: '#66ff88', desc: 'Everyone moves 50% faster' },
    { id: 'marked', name: 'MARKED FOR DEATH', color: '#ff4422', desc: 'All enemies revealed on minimap' },
  ];

  const state = {
    timer: 0,
    checkCd: FIRST_DELAY,
    active: null,
    surgeT: 0,
    announceT: 0,
    fogBase: 0,
    fogTarget: 0,
    time: 0,
  };

  function pickSurge() {
    return SURGES[(Math.random() * SURGES.length) | 0];
  }

  function trigger() {
    const surge = pickSurge();
    state.active = surge;
    state.surgeT = SURGE_DURATION;
    state.announceT = ANNOUNCE_TIME;
    if (window.FX && window.FX.message) {
      window.FX.message('CHAOS SURGE: ' + surge.name, surge.color);
    }
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(120, 0.6, 'sawtooth', 0.35, 600);
      window.Sound.tone(240, 0.4, 'square', 0.25, 1200);
    }
    if (window.Killstreak && window.Killstreak.pulse) {
      // brief HUD attention grab
    }
    applyFog();
  }

  function applyFog() {
    if (!window.FOG) return;
    state.fogBase = window.FOG.density || 0.018;
    if (state.active && state.active.id === 'fog') {
      state.fogTarget = 0.06;
    } else {
      state.fogTarget = state.fogBase;
    }
  }

  function endSurge() {
    if (!state.active) return;
    state.active = null;
    state.surgeT = 0;
    applyFog();
    if (window.FX && window.FX.message) {
      window.FX.message('SURGE FADED', '#999999');
    }
  }

  function getActive() { return state.active; }
  function isActive(id) { return state.active && state.active.id === id; }

  function getScoreMult() {
    return isActive('double') ? 2.0 : 1.0;
  }

  function getSpeedMult() {
    return isActive('speed') ? 1.5 : 1.0;
  }

  function isMarked() {
    return isActive('marked');
  }

  function reset() {
    state.active = null;
    state.surgeT = 0;
    state.announceT = 0;
    state.checkCd = FIRST_DELAY;
    state.timer = 0;
    applyFog();
  }

  // ---- HUD ----
  const hud = document.getElementById('hud');
  if (!hud) return { update() {}, reset() {}, getActive() {}, isActive() {return false;}, getScoreMult() {return 1;}, getSpeedMult() {return 1;}, isMarked() {return false;}, state };

  const banner = document.createElement('div');
  banner.style.cssText = 'position:absolute;top:28%;left:50%;transform:translate(-50%,-50%);'
    + 'font-size:28px;font-weight:bold;letter-spacing:6px;'
    + 'text-shadow:0 0 20px rgba(255,150,0,0.6),0 3px 8px #000;'
    + 'opacity:0;transition:opacity 0.3s,transform 0.3s;'
    + 'pointer-events:none;z-index:8;white-space:nowrap;text-align:center;';
  hud.appendChild(banner);

  const subBanner = document.createElement('div');
  subBanner.style.cssText = 'position:absolute;top:calc(28% + 36px);left:50%;transform:translate(-50%,-50%);'
    + 'font-size:14px;letter-spacing:3px;color:#cccccc;'
    + 'text-shadow:0 2px 5px #000;opacity:0;transition:opacity 0.3s;'
    + 'pointer-events:none;z-index:8;white-space:nowrap;';
  hud.appendChild(subBanner);

  const barWrap = document.createElement('div');
  barWrap.style.cssText = 'position:absolute;top:72px;left:50%;transform:translateX(-50%);'
    + 'width:200px;opacity:0;transition:opacity 0.3s;z-index:6;pointer-events:none;';
  hud.appendChild(barWrap);

  const barLabel = document.createElement('div');
  barLabel.style.cssText = 'font-size:10px;letter-spacing:3px;text-align:center;margin-bottom:3px;text-shadow:0 1px 3px #000;';
  barWrap.appendChild(barLabel);

  const barOuter = document.createElement('div');
  barOuter.style.cssText = 'width:100%;height:5px;background:rgba(0,0,0,0.55);border:1px solid rgba(150,200,150,0.35);border-radius:3px;overflow:hidden;';
  barWrap.appendChild(barOuter);

  const barInner = document.createElement('div');
  barInner.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#ff8822,#ffdd55);border-radius:2px;transition:width 0.1s linear;';
  barOuter.appendChild(barInner);

  // next-surge countdown (always visible during play)
  const countdownWrap = document.createElement('div');
  countdownWrap.style.cssText = 'position:absolute;top:110px;left:50%;transform:translateX(-50%);'
    + 'font-size:9px;letter-spacing:2px;color:#888888;text-shadow:0 1px 2px #000;'
    + 'opacity:0;transition:opacity 0.3s;z-index:6;pointer-events:none;white-space:nowrap;';
  hud.appendChild(countdownWrap);

  function update(dt) {
    state.time += dt;

    if (state.active) {
      state.surgeT -= dt;
      if (state.surgeT <= 0) endSurge();
    } else {
      state.checkCd -= dt;
      if (state.checkCd <= 0) {
        state.checkCd = CHECK_INTERVAL;
        trigger();
      }
    }

    if (state.announceT > 0) {
      state.announceT -= dt;
      const a = state.active;
      banner.textContent = a.name;
      banner.style.color = a.color;
      banner.style.opacity = '1';
      banner.style.transform = 'translate(-50%,-50%) scale(1)';
      subBanner.textContent = a.desc;
      subBanner.style.opacity = '1';
    } else {
      banner.style.opacity = '0';
      banner.style.transform = 'translate(-50%,-50%) scale(0.92)';
      subBanner.style.opacity = '0';
    }

    // fog lerp
    if (window.FOG && Math.abs(window.FOG.density - state.fogTarget) > 0.0005) {
      window.FOG.density += (state.fogTarget - window.FOG.density) * Math.min(1, dt * 2);
    }

    // surge timer bar
    if (state.active) {
      barWrap.style.opacity = '1';
      barLabel.textContent = state.active.name;
      barLabel.style.color = state.active.color;
      barInner.style.width = Math.max(0, (state.surgeT / SURGE_DURATION) * 100) + '%';
    } else {
      barWrap.style.opacity = '0';
    }

    // next countdown
    const ms = window.Manager && window.Manager.state;
    if (ms && ms.phase === 'playing' && !state.active) {
      countdownWrap.style.opacity = '0.7';
      const secs = Math.ceil(state.checkCd);
      countdownWrap.textContent = 'NEXT SURGE IN ' + secs + 'S';
    } else {
      countdownWrap.style.opacity = '0';
    }
  }

  return { update, reset, getActive, isActive, getScoreMult, getSpeedMult, isMarked, state };
})();

window.ChaosSurge = ChaosSurge;