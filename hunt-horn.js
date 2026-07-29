// hunt-horn.js — FORESTWAR hunt horn: press J to blow a rallying call that inspires nearby allies with speed and damage buffs
const THREE = window.THREE;
const SCENE = window.SCENE;
const HuntHorn = (() => {
  const RADIUS = 22;
  const ALLY_SPEED_MULT = 1.30;
  const ALLY_DAMAGE_MULT = 1.25;
  const ALLY_DURATION = 8.0;
  const PLAYER_SPEED_MULT = 1.15;
  const PLAYER_DAMAGE_MULT = 1.15;
  const PLAYER_DURATION = 6.0;
  const COOLDOWN = 24.0;
  const STAMINA_COST = 40;
  const WAVE_COUNT = 3;
  const WAVE_INTERVAL = 0.35;
  const WAVE_EXPAND_TIME = 0.7;
  const AURA_LINGER = 1.0;
  const AURA_MAX_OPACITY = 0.30;
  const PULSE_SPEED = 4.0;
  const AURA_POOL = 50;

  const state = {
    ready: true,
    cd: 0,
    buffTimer: 0,
    pulsePhase: 0,
  };

  const waves = [];
  for (let i = 0; i < WAVE_COUNT; i++) {
    const geo = new THREE.RingGeometry(0.8, 1.4, 48);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffcc44, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    mesh.frustumCulled = false;
    SCENE.add(mesh);
    waves.push({ mesh, t: 0, delay: i * WAVE_INTERVAL, active: false });
  }

  const AURA_GEO = new THREE.SphereGeometry(0.8, 10, 8);
  const AURA_MAT = new THREE.MeshBasicMaterial({
    color: 0xffcc44, transparent: true, opacity: 0,
    side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const auras = [];
  for (let i = 0; i < AURA_POOL; i++) {
    const mesh = new THREE.Mesh(AURA_GEO, AURA_MAT.clone());
    mesh.visible = false;
    mesh.frustumCulled = false;
    SCENE.add(mesh);
    auras.push({ mesh, target: null, life: 0, active: false });
  }
  let auraIdx = 0;

  const FLASH_GEO = new THREE.SphereGeometry(1.5, 12, 10);
  const FLASH_MAT = new THREE.MeshBasicMaterial({
    color: 0xffdd66, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flash = new THREE.Mesh(FLASH_GEO, FLASH_MAT.clone());
  flash.visible = false;
  flash.frustumCulled = false;
  SCENE.add(flash);

  const flashLight = new THREE.PointLight(0xffcc44, 0, 20, 2);
  flashLight.visible = false;
  SCENE.add(flashLight);

  const _camPos = new THREE.Vector3();
  const _camDir = new THREE.Vector3();

  const hud = document.getElementById('hud');
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:16px;bottom:330px;width:170px;'
    + 'font-size:11px;letter-spacing:2px;text-shadow:0 1px 3px #000;z-index:6;';
  const label = document.createElement('div');
  label.style.cssText = 'color:#ffcc44;margin-bottom:3px;';
  label.textContent = 'HUNT HORN [J]';
  wrap.appendChild(label);
  const bar = document.createElement('div');
  bar.style.cssText = 'width:100%;height:7px;background:rgba(0,0,0,0.55);'
    + 'border:1px solid rgba(255,180,60,0.4);border-radius:4px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:100%;height:100%;'
    + 'background:linear-gradient(90deg,#cc8822,#ffcc44);'
    + 'transition:width 0.08s linear;';
  bar.appendChild(fill);
  wrap.appendChild(bar);
  const statusEl = document.createElement('div');
  statusEl.style.cssText = 'margin-top:3px;font-size:9px;letter-spacing:1px;color:#88aa44;opacity:0.6;';
  statusEl.textContent = 'READY';
  wrap.appendChild(statusEl);
  if (hud) hud.appendChild(wrap);

  const vignette = document.createElement('div');
  vignette.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4;'
    + 'box-shadow:inset 0 0 100px 15px rgba(255,180,50,0);'
    + 'transition:box-shadow 0.2s;';
  if (hud) hud.appendChild(vignette);

  function blow() {
    const ms = window.Manager && window.Manager.state;
    if (!ms || ms.phase !== 'playing') return;
    const p = window.Player && window.Player.state;
    if (!p || !p.locked) return;
    if (!state.ready) {
      if (window.FX) window.FX.message('HORN RECHARGING', '#ff6644');
      return;
    }
    if (p.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('INSUFFICIENT STAMINA', '#ff6644');
      return;
    }
    p.stamina -= STAMINA_COST;
    if (p.regenTimer !== undefined) p.regenTimer = 1.5;
    state.ready = false;
    state.cd = COOLDOWN;
    state.buffTimer = PLAYER_DURATION;
    state.pulsePhase = 0;

    const cam = window.CAMERA;
    if (cam) {
      _camPos.copy(cam.position);
      _camDir.set(0, 0, 0);
    }

    const gy = window.groundHeight ? window.groundHeight(_camPos.x, _camPos.z) : _camPos.y;

    for (let i = 0; i < waves.length; i++) {
      waves[i].mesh.position.set(_camPos.x, gy + 0.1, _camPos.z);
      waves[i].mesh.scale.setScalar(1);
      waves[i].mesh.material.opacity = 0.7;
      waves[i].t = -i * WAVE_INTERVAL;
      waves[i].active = true;
      waves[i].mesh.visible = true;
    }

    flash.position.set(_camPos.x, gy + 1.5, _camPos.z);
    flash.material.opacity = 0.8;
    flash.scale.setScalar(0.5);
    flash.visible = true;
    flashLight.position.set(_camPos.x, gy + 3, _camPos.z);
    flashLight.intensity = 5;
    flashLight.visible = true;

    const playerTeam = ms.playerTeam;
    let buffed = 0;
    if (window.Entities && Array.isArray(window.Entities.list)) {
      const r2 = RADIUS * RADIUS;
      for (let i = 0; i < window.Entities.list.length; i++) {
        const e = window.Entities.list[i];
        if (e.dead || e.team !== playerTeam || !e.mesh) continue;
        const dx = e.mesh.position.x - _camPos.x;
        const dz = e.mesh.position.z - _camPos.z;
        if (dx * dx + dz * dz <= r2) {
          e._hornSpeedMult = ALLY_SPEED_MULT;
          e._hornDamageMult = ALLY_DAMAGE_MULT;
          e._hornTimer = ALLY_DURATION;
          assignAura(e);
          buffed++;
        }
      }
    }

    if (window.Sound) {
      window.Sound.tone(180, 0.6, 'sawtooth', 0.25, 800);
      window.Sound.tone(240, 0.5, 'square', 0.18, 1200);
      window.Sound.tone(360, 0.4, 'triangle', 0.15, 2000);
    }

    if (window.FX) {
      window.FX.message(buffed > 0
        ? 'HUNT HORN! ' + buffed + ' ALLY INSPIRED'
        : 'HUNT HORN!',
        buffed > 0 ? '#ffcc44' : '#ff8844');
    }

    vignette.style.boxShadow = 'inset 0 0 100px 15px rgba(255,180,50,0.3)';
    setTimeout(() => { vignette.style.boxShadow = 'inset 0 0 100px 15px rgba(255,180,50,0)'; }, 500);

    updateHUD();
  }

  function assignAura(ent) {
    for (let i = 0; i < auras.length; i++) {
      if (auras[i].target === ent) {
        auras[i].life = AURA_LINGER;
        auras[i].active = true;
        auras[i].mesh.visible = true;
        return;
      }
    }
    const slot = auras[auraIdx];
    auraIdx = (auraIdx + 1) % AURA_POOL;
    slot.target = ent;
    slot.life = AURA_LINGER;
    slot.active = true;
    slot.mesh.visible = true;
  }

  function getPlayerSpeedMult() {
    return state.buffTimer > 0 ? PLAYER_SPEED_MULT : 1.0;
  }
  function getPlayerDamageMult() {
    return state.buffTimer > 0 ? PLAYER_DAMAGE_MULT : 1.0;
  }
  function getAllySpeedMult(ent) {
    if (!ent) return 1.0;
    if (ent._hornTimer && ent._hornTimer > 0) return ent._hornSpeedMult || 1.0;
    return 1.0;
  }
  function getAllyDamageMult(ent) {
    if (!ent) return 1.0;
    if (ent._hornTimer && ent._hornTimer > 0) return ent._hornDamageMult || 1.0;
    return 1.0;
  }

  function updateHUD() {
    if (!state.ready) {
      const frac = 1 - state.cd / COOLDOWN;
      fill.style.width = (frac * 100) + '%';
      fill.style.background = 'linear-gradient(90deg,#553311,#886622)';
      statusEl.textContent = 'RECHARGING';
      statusEl.style.color = '#aa6633';
    } else {
      fill.style.width = '100%';
      fill.style.background = 'linear-gradient(90deg,#cc8822,#ffcc44)';
      statusEl.textContent = state.buffTimer > 0 ? 'ACTIVE!' : 'READY';
      statusEl.style.color = state.buffTimer > 0 ? '#ffcc44' : '#88aa44';
    }
  }

  function update(dt) {
    if (state.cd > 0) {
      state.cd -= dt;
      if (state.cd <= 0) {
        state.cd = 0;
        state.ready = true;
        if (window.FX) window.FX.message('HUNT HORN READY', '#ffcc44');
      }
    }
    if (state.buffTimer > 0) {
      state.buffTimer -= dt;
      if (state.buffTimer <= 0) state.buffTimer = 0;
    }
    state.pulsePhase += dt * PULSE_SPEED;

    for (let i = 0; i < waves.length; i++) {
      const w = waves[i];
      if (!w.active) continue;
      w.t += dt;
      if (w.t < 0) continue;
      const f = w.t / WAVE_EXPAND_TIME;
      if (f >= 1) {
        w.active = false;
        w.mesh.visible = false;
        continue;
      }
      const scale = 1 + f * RADIUS;
      w.mesh.scale.setScalar(scale);
      w.mesh.material.opacity = 0.7 * (1 - f);
    }

    if (flash.visible) {
      flash.material.opacity *= Math.pow(0.02, dt);
      flash.scale.x += dt * 8;
      flash.scale.y = flash.scale.x;
      flash.scale.z = flash.scale.x;
      if (flash.material.opacity < 0.02) flash.visible = false;
    }
    if (flashLight.visible) {
      flashLight.intensity *= Math.pow(0.005, dt);
      if (flashLight.intensity < 0.05) flashLight.visible = false;
    }

    if (window.Entities && Array.isArray(window.Entities.list)) {
      for (let i = 0; i < window.Entities.list.length; i++) {
        const e = window.Entities.list[i];
        if (e.dead) continue;
        if (e._hornTimer && e._hornTimer > 0) {
          e._hornTimer -= dt;
          if (e._hornTimer <= 0) {
            e._hornTimer = 0;
            e._hornSpeedMult = 1;
            e._hornDamageMult = 1;
          }
        }
      }
    }

    for (let i = 0; i < auras.length; i++) {
      const a = auras[i];
      if (!a.active) continue;
      if (!a.target || a.target.dead || (a.target._hornTimer !== undefined && a.target._hornTimer <= 0)) {
        a.life -= dt;
        if (a.life <= 0) {
          a.active = false;
          a.target = null;
          a.mesh.visible = false;
          continue;
        }
      }
      const m = a.target ? a.target.mesh : null;
      if (m) {
        a.mesh.position.set(m.position.x, m.position.y + 1.0, m.position.z);
        const pulse = 0.85 + Math.sin(state.pulsePhase + i) * 0.15;
        a.mesh.scale.setScalar(pulse);
        a.mesh.material.opacity = AURA_MAX_OPACITY * Math.min(a.life / AURA_LINGER, 1);
      } else {
        a.life -= dt;
        if (a.life <= 0) {
          a.active = false;
          a.mesh.visible = false;
        }
      }
    }

    updateHUD();
  }

  function reset() {
    state.ready = true;
    state.cd = 0;
    state.buffTimer = 0;
    for (let i = 0; i < waves.length; i++) { waves[i].active = false; waves[i].mesh.visible = false; }
    for (let i = 0; i < auras.length; i++) { auras[i].active = false; auras[i].target = null; auras[i].mesh.visible = false; }
    flash.visible = false;
    flashLight.visible = false;
    if (window.Entities && Array.isArray(window.Entities.list)) {
      for (let i = 0; i < window.Entities.list.length; i++) {
        const e = window.Entities.list[i];
        e._hornTimer = 0;
        e._hornSpeedMult = 1;
        e._hornDamageMult = 1;
      }
    }
    updateHUD();
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'j' && e.key !== 'J') return;
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    if (!window.Player || !Player.state.locked) return;
    blow();
  });

  window.HuntHorn = {
    update, reset, blow,
    getPlayerSpeedMult, getPlayerDamageMult,
    getAllySpeedMult, getAllyDamageMult,
    state,
  };
  return window.HuntHorn;
})();