// smoke-grenade.js — FORESTWAR smoke grenade: expanding volumetric cloud that blocks LOS, drifts on wind, and suppresses enemies
const THREE = window.THREE;
const SCENE = window.SCENE;
const Smoke = (() => {
  const MAX_SMOKES = 5;
  const THROW_SPEED = 22;
  const GRAVITY = 18;
  const ARM_TIME = 0.6;
  const GROW_TIME = 1.2;
  const LIFE_TIME = 14;
  const RADIUS = 8.5;
  const COOLDOWN = 8;
  const STAMINA_COST = 20;
  const BOUNCE = 0.35;
  const FRICTION = 0.8;
  const PARTICLES_PER = 22;
  const CHECK_INTERVAL = 0.15;
  const PUFF_LIFE = 2.4;
  const PUFF_RISE = 0.8;
  const PUFF_DRIFT = 1.2;
  const PUFF_DRIFT_VERT = 0.4;
  const PUFF_WOBBLE = 0.6;
  const STAGE_GROW = 0;
  const STAGE_LIVE = 1;
  const STAGE_FADING = 2;
  const STAGE_DEAD = 3;
  const FADE_BEGIN = 2.5;
  const MAX_PUFFS = MAX_SMOKES * PARTICLES_PER;
  const SUPPRESS_AMOUNT = 35;
  const SUPPRESS_RADIUS = RADIUS;
  const SUPPRESS_FIRE_MULT = 0.45;
  const SUPPRESS_AIM_MULT = 2.5;
  const SCAN_INTERVAL = 0.3;

  const state = { cd: 0, smokes: [], scanT: 0 };

  const SHELL_GEO = new THREE.CylinderGeometry(0.08, 0.08, 0.22, 8);
  const SHELL_MAT = new THREE.MeshStandardMaterial({ color: 0x445533, roughness: 0.6, metalness: 0.4 });
  const TIP_GEO = new THREE.ConeGeometry(0.08, 0.08, 8);
  TIP_GEO.rotateX(Math.PI);
  const TIP_MAT = new THREE.MeshBasicMaterial({ color: 0xff4422 });

  const PARTICLE_GEO = new THREE.SphereGeometry(1, 6, 5);
  const PARTICLE_MAT = new THREE.MeshBasicMaterial({
    color: 0xb0b8a8,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  const PUFF_GEO = new THREE.SphereGeometry(1, 8, 6);
  const PUFF_BASE_MAT = new THREE.MeshBasicMaterial({
    color: 0xc0c8b4,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  const RING_GEO = new THREE.RingGeometry(RADIUS - 0.5, RADIUS, 40);
  const RING_MAT = new THREE.MeshBasicMaterial({
    color: 0x9aaa88,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:16px;bottom:222px;font-size:11px;letter-spacing:2px;color:#aabb99;text-shadow:0 1px 3px #000;z-index:6;';
  const label = document.createElement('div');
  label.textContent = 'SMOKE [H]';
  hud.appendChild(label);
  const bar = document.createElement('div');
  bar.style.cssText = 'margin-top:3px;width:70px;height:5px;background:rgba(0,0,0,0.5);border:1px solid rgba(150,170,130,0.3);border-radius:3px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#889966,#bbccaa);transition:width 0.05s;';
  bar.appendChild(fill);
  hud.appendChild(bar);
  document.getElementById('hud').appendChild(hud);

  const _throwDir = new THREE.Vector3();
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function getWind() {
    if (window.Weather && typeof window.Weather.getWind === 'function') {
      return window.Weather.getWind();
    }
    return { x: 0.2, z: 0.1 };
  }

  function buildSmokeShell() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(SHELL_GEO, SHELL_MAT);
    body.castShadow = true;
    g.add(body);
    const tip = new THREE.Mesh(TIP_GEO, TIP_MAT);
    tip.position.y = -0.15;
    g.add(tip);
    const ring = new THREE.Mesh(RING_GEO, RING_MAT.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    ring.frustumCulled = false;
    g.add(ring);
    g.userData.ring = ring;
    g.userData.vel = new THREE.Vector3();
    g.userData.det = false;
    g.userData.timer = 0;
    g.userData.stage = STAGE_GROW;
    g.userData.life = LIFE_TIME;
    g.userData.puffs = [];
    g.userData.applyCd = 0;
    g.userData.suppressCd = 0;
    g.userData.windPhase = Math.random() * Math.PI * 2;
    SCENE.add(g);
    return g;
  }

  function detonate(smoke) {
    smoke.userData.stage = STAGE_GROW;
    smoke.userData.timer = 0;
    const ring = smoke.userData.ring;
    ring.visible = true;
    ring.material.opacity = 0;
    for (let i = 0; i < PARTICLES_PER; i++) spawnPuff(smoke);
  }

  function spawnPuff(smoke) {
    let p = null;
    for (let i = 0; i < smoke.userData.puffs.length; i++) {
      if (!smoke.userData.puffs[i].active) { p = smoke.userData.puffs[i]; break; }
    }
    if (!p) {
      if (smoke.userData.puffs.length >= MAX_PUFFS) return;
      p = { mesh: null, life: 0, active: false, ox: 0, oy: 0, oz: 0, wob: 0, scale: 1 };
      smoke.userData.puffs.push(p);
    }
    if (!p.mesh) {
      p.mesh = new THREE.Mesh(PUFF_GEO, PUFF_BASE_MAT.clone());
      p.mesh.visible = false;
      p.mesh.frustumCulled = false;
      SCENE.add(p.mesh);
    }
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * RADIUS * 0.7;
    p.ox = Math.cos(ang) * rad;
    p.oz = Math.sin(ang) * rad;
    p.oy = Math.random() * RADIUS * 0.9;
    p.life = PUFF_LIFE * (0.7 + Math.random() * 0.5);
    p.wob = Math.random() * Math.PI * 2;
    p.scale = 1.2 + Math.random() * 1.8;
    const shade = 0.62 + Math.random() * 0.2;
    p.mesh.material.color.setRGB(shade + 0.05, shade + 0.02, shade * 0.92);
    p.mesh.material.opacity = 0;
    p.mesh.visible = true;
    p.active = true;
  }

  function throwSmoke() {
    if (state.cd > 0) return;
    const p = window.Player ? window.Player.state : null;
    if (!p || !p.locked) return;
    if (p.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('TOO EXHAUSTED', '#ff6644');
      return;
    }
    p.stamina -= STAMINA_COST;
    if (p.regenTimer !== undefined) p.regenTimer = 1.5;
    state.cd = COOLDOWN;

    const cam = window.CAMERA;
    cam.getWorldDirection(_throwDir);
    _throwDir.y += 0.25;
    _throwDir.normalize();

    const smoke = buildSmokeShell();
    smoke.position.copy(cam.position).addScaledVector(_throwDir, 1.2);
    const gy = groundY(smoke.position.x, smoke.position.z);
    if (smoke.position.y < gy + 0.3) smoke.position.y = gy + 0.3;
    smoke.userData.vel.copy(_throwDir).multiplyScalar(THROW_SPEED);
    smoke.userData.det = false;
    smoke.userData.timer = 0;
    smoke.userData.stage = STAGE_GROW;
    smoke.userData.life = LIFE_TIME;

    state.smokes.push({ mesh: smoke });
    if (window.Sound) window.Sound.tone(180, 0.1, 'square', 0.15, 800);
    updateHUD();
  }

  function updateProjectiles(dt) {
    const smokes = state.smokes;
    let n = smokes.length;
    for (let i = n - 1; i >= 0; i--) {
      const s = smokes[i];
      const m = s.mesh;
      const ud = m.userData;
      if (!ud.det) {
        ud.vel.y -= GRAVITY * dt;
        m.position.addScaledVector(ud.vel, dt);
        const gy = groundY(m.position.x, m.position.z) + 0.12;
        if (m.position.y <= gy) {
          m.position.y = gy;
          if (Math.abs(ud.vel.y) > 1.5) {
            ud.vel.y *= -BOUNCE;
            ud.vel.x *= FRICTION;
            ud.vel.z *= FRICTION;
          } else {
            ud.vel.set(0, 0, 0);
            ud.timer += dt;
            if (ud.timer >= ARM_TIME) {
              ud.det = true;
              detonate(m);
            }
          }
        }
        continue;
      }
      ud.timer += dt;
      if (ud.stage === STAGE_GROW) {
        if (ud.timer >= GROW_TIME) ud.stage = STAGE_LIVE;
      } else if (ud.stage === STAGE_LIVE) {
        if (ud.timer >= LIFE_TIME - FADE_BEGIN) ud.stage = STAGE_FADING;
      }
      const ring = ud.ring;
      const growF = Math.min(1, ud.timer / GROW_TIME);
      const lifeF = Math.max(0, 1 - Math.max(0, ud.timer - (LIFE_TIME - FADE_BEGIN)) / FADE_BEGIN);
      ring.material.opacity = 0.4 * growF * lifeF;
      ring.scale.setScalar(growF);
      const puffs = ud.puffs;
      const wind = getWind();
      ud.windPhase += dt * 0.8;
      for (let j = 0; j < puffs.length; j++) {
        const puff = puffs[j];
        if (!puff.active) continue;
        puff.life -= dt;
        if (puff.life <= 0) {
          puff.active = false;
          puff.mesh.visible = false;
          if (ud.stage === STAGE_LIVE && Math.random() < 0.6) spawnPuff(m);
          continue;
        }
        puff.wob += dt * 1.5;
        const sx = puff.ox + Math.sin(puff.wob) * PUFF_WOBBLE + wind.x * PUFF_DRIFT;
        const sz = puff.oz + Math.cos(puff.wob * 0.8) * PUFF_WOBBLE + wind.z * PUFF_DRIFT;
        const driftY = puff.oy + Math.sin(ud.windPhase + puff.wob) * PUFF_DRIFT_VERT + PUFF_RISE * (1 - puff.life / PUFF_LIFE);
        puff.mesh.position.set(m.position.x + sx, m.position.y + driftY, m.position.z + sz);
        const ageF = puff.life / PUFF_LIFE;
        const sc = puff.scale * growF * (1.4 - ageF * 0.4);
        puff.mesh.scale.setScalar(sc * 1.5);
        puff.mesh.material.opacity = 0.38 * ageF * growF * lifeF;
      }
      if (ud.stage === STAGE_DEAD || (ud.stage === STAGE_FADING && ud.timer >= LIFE_TIME)) {
        SCENE.remove(m);
        for (let j = 0; j < puffs.length; j++) if (puffs[j].mesh) SCENE.remove(puffs[j].mesh);
        puffs.length = 0;
        smokes[i] = smokes[n - 1];
        smokes.pop();
        n--;
      }
    }
  }

  function applySuppression(dt) {
    state.scanT -= dt;
    if (state.scanT > 0) return;
    state.scanT = SCAN_INTERVAL;
    if (!window.Suppression || !window.Entities) return;
    const ents = window.Entities.list;
    if (!ents) return;
    for (let i = 0; i < state.smokes.length; i++) {
      const s = state.smokes[i];
      const ud = s.mesh.userData;
      if (!ud.det || ud.stage === STAGE_DEAD) continue;
      for (let j = 0; j < ents.length; j++) {
        const e = ents[j];
        if (e.dead) continue;
        if (!e.mesh) continue;
        _v1.copy(e.mesh.position);
        _v2.copy(s.mesh.position);
        _v1.y = 0;
        _v2.y = 0;
        if (_v1.distanceToSquared(_v2) <= SUPPRESS_RADIUS * SUPPRESS_RADIUS) {
          window.Suppression.addPressure(e, SUPPRESS_AMOUNT * SCAN_INTERVAL);
          e._smokeFireMult = SUPPRESS_FIRE_MULT;
          e._smokeAimMult = SUPPRESS_AIM_MULT;
        }
      }
    }
  }

  function update(dt) {
    if (state.cd > 0) {
      state.cd -= dt;
      if (state.cd <= 0) state.cd = 0;
      updateHUD();
    }
    updateProjectiles(dt);
    applySuppression(dt);
  }

  function updateHUD() {
    fill.style.width = (state.cd > 0 ? (1 - state.cd / COOLDOWN) * 100 : 100) + '%';
    hud.style.opacity = state.cd > 0 ? '0.85' : '0.6';
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'h' && e.key !== 'H') return;
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    if (!window.Player || !Player.state.locked) return;
    throwSmoke();
  });

  function reset() {
    for (const s of state.smokes) {
      SCENE.remove(s.mesh);
      for (const p of s.mesh.userData.puffs) if (p.mesh) SCENE.remove(p.mesh);
    }
    state.smokes.length = 0;
    state.cd = 0;
    updateHUD();
  }

  function isPointInSmoke(x, y, z) {
    for (let i = 0; i < state.smokes.length; i++) {
      const ud = state.smokes[i].mesh.userData;
      if (!ud.det || ud.stage === STAGE_DEAD) continue;
      _v1.set(x - ud.puffs ? 0 : 0, 0, 0);
      _v1.set(state.smokes[i].mesh.position.x - x, 0, state.smokes[i].mesh.position.z - z);
      if (_v1.lengthSq() <= RADIUS * RADIUS) {
        const dy = y - state.smokes[i].mesh.position.y;
        if (dy > -1 && dy < RADIUS * 1.2) return true;
      }
    }
    return false;
  }

  window.Smoke = { update, reset, isPointInSmoke, throwSmoke, state };
  return window.Smoke;
})();