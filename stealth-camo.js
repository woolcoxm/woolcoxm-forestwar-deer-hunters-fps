// stealth-camo.js — FORESTWAR active camouflage: temporary invisibility that reduces enemy detection and aim
const THREE = window.THREE;
const SCENE = window.SCENE;
const CAMERA = window.CAMERA;
const StealthCamo = (() => {
  const DURATION = 6.0;
  const COOLDOWN = 22.0;
  const STAMINA_COST = 30;
  const FADE_TIME = 0.3;
  const FOV_DOT = 0.2;
  const MAX_STRENGTH = 0.82;
  const SHIMMER_SPEED = 6.0;
  const BREAK_FIRE_DELAY = 0.4;
  const DETECT_MULT = 0.12;
  const AIM_ERROR_MULT = 3.5;
  const AIM_JITTER = 0.06;

  const state = {
    active: false,
    timer: 0,
    cd: 0,
    fadeT: 0,
    strength: 0,
    shimmerPhase: 0,
    breakTimer: 0,
    suppressed: false,
  };

  const hud = document.getElementById('hud');
  if (!hud) return { isActive() {return false;}, getDetectionMult() {return 1;}, update() {}, onFired() {}, reset() {}, state };

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:16px;bottom:200px;width:170px;font-size:11px;letter-spacing:2px;text-shadow:0 1px 3px #000;z-index:6;';
  hud.appendChild(wrap);
  const label = document.createElement('div');
  label.style.cssText = 'color:#aabbdd;margin-bottom:3px;';
  label.textContent = 'CAMO [C]';
  wrap.appendChild(label);
  const bar = document.createElement('div');
  bar.style.cssText = 'width:100%;height:7px;background:rgba(0,0,0,0.55);border:1px solid rgba(150,180,210,0.4);border-radius:4px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#5577aa,#bbddff);border-radius:3px;transition:width 0.08s linear;';
  bar.appendChild(fill);
  wrap.appendChild(bar);

  const statusEl = document.createElement('div');
  statusEl.style.cssText = 'margin-top:3px;font-size:9px;letter-spacing:1px;color:#88aacc;opacity:0.6;';
  statusEl.textContent = 'READY';
  wrap.appendChild(statusEl);

  const vignette = document.createElement('div');
  vignette.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4;'
    + 'box-shadow:inset 0 0 110px 18px rgba(120,160,210,0);transition:box-shadow 0.2s;';
  hud.appendChild(vignette);

  const HUD_GEO = new THREE.SphereGeometry(0.55, 10, 8);
  const HUD_MAT = new THREE.MeshBasicMaterial({
    color: 0xaaccff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
  });
  const overlays = [];
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(HUD_GEO, HUD_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    overlays.push(m);
  }

  const SHIMMER_GEO = new THREE.SphereGeometry(1.8, 16, 12);
  const SHIMMER_MAT = new THREE.MeshBasicMaterial({
    color: 0x88bbff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
  });
  const shimmers = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(SHIMMER_GEO, SHIMMER_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    shimmers.push(m);
  }

  const SPARK_GEO = new THREE.SphereGeometry(0.1, 5, 4);
  const SPARK_MAT = new THREE.MeshBasicMaterial({
    color: 0xbbddff, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sparks = [];
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vy: 0, vx: 0, vz: 0, active: false });
  }
  let sparkIdx = 0;

  const _camDir = new THREE.Vector3();
  const _toEnt = new THREE.Vector3();
  const _camPos = new THREE.Vector3();

  function spawnActivateSparks() {
    if (!CAMERA) return;
    const base = CAMERA.position;
    for (let i = 0; i < 12; i++) {
      const s = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % sparks.length;
      const ang = Math.random() * Math.PI * 2;
      const el = Math.random() * Math.PI * 0.5;
      const spd = 2 + Math.random() * 3;
      s.vx = Math.cos(ang) * Math.cos(el) * spd;
      s.vy = Math.sin(el) * spd + 1;
      s.vz = Math.sin(ang) * Math.cos(el) * spd;
      s.mesh.position.copy(base);
      s.mesh.position.y -= 0.2;
      s.mesh.material.opacity = 0.8;
      s.mesh.scale.setScalar(0.5 + Math.random() * 0.5);
      s.mesh.visible = true;
      s.life = 0.5;
      s.active = true;
    }
  }

  function tryActivate() {
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    if (state.active || state.cd > 0) return;
    const p = window.Player ? window.Player.state : null;
    if (!p || !p.locked) return;
    if (p.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('INSUFFICIENT STAMINA', '#ff6644');
      return;
    }
    p.stamina -= STAMINA_COST;
    if (p.regenTimer !== undefined) p.regenTimer = 1.5;
    state.active = true;
    state.timer = DURATION;
    state.fadeT = 0;
    state.strength = 0;
    state.shimmerPhase = 0;
    state.breakTimer = 0;
    state.suppressed = false;
    spawnActivateSparks();
    if (window.Sound) {
      window.Sound.tone(320, 0.12, 'sine', 0.25, 2000);
      window.Sound.tone(480, 0.18, 'sine', 0.18, 2800);
    }
    if (window.FX) window.FX.message('CAMO ACTIVE', '#aaccff');
  }

  function onFired() {
    if (!state.active) return;
    state.breakTimer = BREAK_FIRE_DELAY;
    state.suppressed = true;
  }

  function isActive() { return state.active; }
  function isSuppressed() { return state.active && state.suppressed; }

  function getDetectionMult() {
    if (!state.active) return 1.0;
    return DETECT_MULT;
  }

  function getAimErrorMult() {
    if (!state.active) return 1.0;
    return state.suppressed ? 1.5 : AIM_ERROR_MULT;
  }

  function getAimJitter() {
    if (!state.active) return 0;
    return state.suppressed ? AIM_JITTER * 0.3 : AIM_JITTER;
  }

  function isVisibleToEntity(entPos) {
    if (!state.active || state.strength < 0.3) return true;
    if (!CAMERA) return true;
    _camPos.copy(CAMERA.position);
    _toEnt.subVectors(entPos, _camPos);
    const dist = _toEnt.length();
    if (dist < 6) return true;
    _toEnt.divideScalar(dist);
    CAMERA.getWorldDirection(_camDir);
    const dot = _toEnt.dot(_camDir);
    if (dot < FOV_DOT) return true;
    const distFactor = Math.max(0, 1 - dist / 40);
    const conceal = state.strength * distFactor;
    return conceal < 0.4;
  }

  function updateSparks(dt) {
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.vy -= 6 * dt;
      s.mesh.material.opacity = (s.life / 0.5) * 0.8;
      s.mesh.scale.multiplyScalar(0.96);
    }
  }

  function update(dt) {
    if (state.cd > 0) state.cd = Math.max(0, state.cd - dt);
    state.shimmerPhase += dt * SHIMMER_SPEED;

    if (state.active) {
      state.timer -= dt;
      state.fadeT = Math.min(1, state.fadeT + dt / FADE_TIME);
      const fadeOut = state.timer < FADE_TIME ? Math.max(0, state.timer / FADE_TIME) : 1;
      state.strength = MAX_STRENGTH * state.fadeT * fadeOut;

      if (state.breakTimer > 0) {
        state.breakTimer -= dt;
        if (state.breakTimer <= 0) state.suppressed = false;
      }

      if (state.timer <= 0) {
        state.active = false;
        state.cd = COOLDOWN;
        state.strength = 0;
        for (const m of overlays) m.visible = false;
        for (const s of shimmers) s.visible = false;
        if (window.FX) window.FX.message('CAMO OFFLINE', '#88aacc');
      } else {
        const pulse = 0.5 + 0.5 * Math.sin(state.shimmerPhase);
        for (const m of overlays) {
          m.visible = true;
          if (CAMERA) {
            m.position.copy(CAMERA.position);
            m.position.y -= 0.2;
          }
          m.material.opacity = state.strength * 0.3 * (0.5 + pulse * 0.5);
          m.scale.setScalar(1 + pulse * 0.08);
        }
        for (let i = 0; i < shimmers.length; i++) {
          const sm = shimmers[i];
          sm.visible = true;
          if (CAMERA) {
            sm.position.copy(CAMERA.position);
            sm.position.y -= 0.2;
          }
          const phase = state.shimmerPhase + i * 2.094;
          sm.material.opacity = state.strength * 0.08 * (0.5 + 0.5 * Math.sin(phase));
          sm.scale.setScalar(0.9 + 0.1 * Math.sin(phase * 1.3));
        }
      }
    } else {
      state.strength = Math.max(0, state.strength - dt * 4);
      if (state.strength <= 0) {
        for (const m of overlays) m.visible = false;
        for (const s of shimmers) s.visible = false;
      }
    }

    updateSparks(dt);

    const vignetteStrength = state.strength / MAX_STRENGTH;
    vignette.style.boxShadow = 'inset 0 0 110px 18px rgba(120,160,210,' + (vignetteStrength * 0.22).toFixed(3) + ')';

    const ratio = state.active ? state.timer / DURATION : (state.cd > 0 ? 1 - state.cd / COOLDOWN : 1);
    fill.style.width = (ratio * 100).toFixed(1) + '%';
    if (state.active) {
      statusEl.textContent = 'ACTIVE';
      statusEl.style.color = '#bbddff';
      statusEl.style.opacity = '1';
      fill.style.background = 'linear-gradient(90deg,#5577aa,#bbddff)';
    } else if (state.cd > 0) {
      statusEl.textContent = 'RECHARGING';
      statusEl.style.color = '#ff8844';
      statusEl.style.opacity = '0.8';
      fill.style.background = 'linear-gradient(90deg,#442211,#884422)';
    } else {
      statusEl.textContent = 'READY';
      statusEl.style.color = '#88aacc';
      statusEl.style.opacity = '0.6';
      fill.style.background = 'linear-gradient(90deg,#5577aa,#bbddff)';
    }
  }

  function reset() {
    state.active = false;
    state.timer = 0;
    state.cd = 0;
    state.strength = 0;
    state.fadeT = 0;
    state.breakTimer = 0;
    state.suppressed = false;
    for (const m of overlays) m.visible = false;
    for (const s of shimmers) s.visible = false;
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'c' && e.key !== 'C') return;
    tryActivate();
  });

  window.StealthCamo = {
    isActive, isSuppressed, getDetectionMult, getAimErrorMult, getAimJitter,
    isVisibleToEntity, onFired, update, reset, state,
  };
  return window.StealthCamo;
})();