// adrenaline.js — FORESTWAR passive overcharge: triggers at low HP for a burst of speed, fire-rate, and damage resistance
const THREE = window.THREE;
const SCENE = window.SCENE;
const Adrenaline = (() => {
  const HP_TRIGGER_FRAC = 0.30;
  const DURATION = 5.0;
  const COOLDOWN = 24.0;
  const SPEED_MULT = 1.35;
  const FIRERATE_MULT = 1.30;
  const DAMAGE_RESIST = 0.30;
  const REGEN_BONUS = 4.0;
  const VIGNETTE_PULSE = 5.0;
  const EDGE_FLASH = 0.55;

  const state = {
    active: false,
    timer: 0,
    cd: 0,
    pulsePhase: 0,
    edgeOpacity: 0,
    usedThisLife: false,
  };

  const hud = document.getElementById('hud');
  const edge = document.createElement('div');
  edge.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;z-index:4;'
    + 'box-shadow:inset 0 0 140px 30px rgba(200,30,20,0.65);'
    + 'transition:opacity 0.18s;';
  if (hud) hud.appendChild(edge);

  const banner = document.createElement('div');
  banner.style.cssText = 'position:absolute;top:30%;left:50%;transform:translate(-50%,-50%);'
    + 'font-size:30px;font-weight:bold;letter-spacing:8px;color:#ff4422;'
    + 'text-shadow:0 0 20px rgba(200,20,10,0.8),0 3px 8px #000;'
    + 'opacity:0;transition:opacity 0.25s,transform 0.25s;pointer-events:none;z-index:5;white-space:nowrap;';
  banner.textContent = 'ADRENALINE';
  if (hud) hud.appendChild(banner);

  const cdWrap = document.createElement('div');
  cdWrap.style.cssText = 'position:absolute;left:50%;bottom:96px;transform:translateX(-50%);'
    + 'width:160px;text-align:center;pointer-events:none;z-index:5;opacity:0;transition:opacity 0.2s;';
  const cdLabel = document.createElement('div');
  cdLabel.style.cssText = 'font-size:10px;letter-spacing:3px;color:#ff6644;margin-bottom:3px;text-shadow:0 1px 3px #000;';
  cdLabel.textContent = 'ADRENALINE';
  cdWrap.appendChild(cdLabel);
  const cdBar = document.createElement('div');
  cdBar.style.cssText = 'width:100%;height:6px;background:rgba(0,0,0,0.55);'
    + 'border:1px solid rgba(200,60,40,0.35);border-radius:3px;overflow:hidden;';
  const cdFill = document.createElement('div');
  cdFill.style.cssText = 'width:0%;height:100%;background:linear-gradient(90deg,#cc2211,#ff6644);border-radius:2px;';
  cdBar.appendChild(cdFill);
  cdWrap.appendChild(cdBar);
  if (hud) hud.appendChild(cdWrap);

  function isActive() { return state.active; }

  function getSpeedMult() { return state.active ? SPEED_MULT : 1.0; }
  function getFireRateMult() { return state.active ? FIRERATE_MULT : 1.0; }
  function getDamageResist() { return state.active ? DAMAGE_RESIST : 0.0; }
  function getRegenBonus() { return state.active ? REGEN_BONUS : 0.0; }

  function checkTrigger(hpFrac) {
    if (state.active || state.cd > 0) return;
    if (hpFrac > HP_TRIGGER_FRAC) return;
    if (state.usedThisLife) return;
    trigger();
  }

  function trigger() {
    state.active = true;
    state.timer = DURATION;
    state.usedThisLife = true;
    state.pulsePhase = 0;
    state.edgeOpacity = EDGE_FLASH;
    banner.style.opacity = '1';
    banner.style.transform = 'translate(-50%,-50%) scale(1.1)';
    setTimeout(() => {
      banner.style.opacity = '0';
      banner.style.transform = 'translate(-50%,-50%) scale(0.95)';
    }, 650);
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(180, 0.15, 'sawtooth', 0.3, 600);
      window.Sound.tone(120, 0.35, 'sawtooth', 0.25, 400);
    }
  }

  function onRespawn() {
    state.active = false;
    state.timer = 0;
    state.cd = 0;
    state.edgeOpacity = 0;
    state.usedThisLife = false;
    edge.style.opacity = '0';
    cdWrap.style.opacity = '0';
    cdFill.style.width = '0%';
  }

  function update(dt) {
    if (state.active) {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.active = false;
        state.timer = 0;
        state.cd = COOLDOWN;
        state.edgeOpacity = 0;
        edge.style.opacity = '0';
        cdWrap.style.opacity = '1';
      } else {
        state.pulsePhase += dt * VIGNETTE_PULSE;
        const pulse = (Math.sin(state.pulsePhase) * 0.5 + 0.5);
        const t = state.timer / DURATION;
        const ramp = t < 0.2 ? t / 0.2 : (t > 0.8 ? 1.0 : 1.0);
        const intensity = 0.25 + pulse * 0.35 * ramp;
        state.edgeOpacity = Math.min(state.edgeOpacity + dt * 2.0, intensity);
        edge.style.opacity = state.edgeOpacity.toFixed(3);
      }
    } else {
      state.edgeOpacity = Math.max(0, state.edgeOpacity - dt * 3.0);
      edge.style.opacity = state.edgeOpacity.toFixed(3);
      if (state.cd > 0) {
        state.cd -= dt;
        if (state.cd <= 0) {
          state.cd = 0;
          state.usedThisLife = false;
          cdWrap.style.opacity = '0';
          cdFill.style.width = '100%';
        } else {
          cdWrap.style.opacity = '1';
          const frac = 1 - state.cd / COOLDOWN;
          cdFill.style.width = (frac * 100).toFixed(1) + '%';
        }
      }
    }
  }

  function reset() {
    state.active = false;
    state.timer = 0;
    state.cd = 0;
    state.pulsePhase = 0;
    state.edgeOpacity = 0;
    state.usedThisLife = false;
    edge.style.opacity = '0';
    banner.style.opacity = '0';
    cdWrap.style.opacity = '0';
    cdFill.style.width = '0%';
  }

  return {
    state,
    isActive,
    getSpeedMult,
    getFireRateMult,
    getDamageResist,
    getRegenBonus,
    checkTrigger,
    onRespawn,
    update,
    reset,
  };
})();
window.Adrenaline = Adrenaline;