// shock-slam.js — FORESTWAR ground-slam ability: AoE shockwave that damages, lifts, and knocks back nearby enemies
const THREE = window.THREE;
const SCENE = window.SCENE;
const ShockSlam = (() => {
  const COOLDOWN_MAX = 8.0;
  const STAMINA_COST = 40;
  const RADIUS = 8.0;
  const DAMAGE = 55;
  const KNOCKBACK_H = 18;
  const KNOCKBACK_UP = 7;
  const LUNGE_UP = 0.5;
  const CHARGE_TIME = 0.35;
  const IMPACT_DURATION = 0.55;
  const CHARGE_SCREEN_SHAKE = 0.04;
  const IMPACT_SCREEN_SHAKE = 0.22;
  const RING_EXPAND_TIME = 0.4;
  const SPARK_COUNT = 24;
  const SPARK_LIFE = 0.6;
  const SPARK_SPEED = 14;
  const DEBRIS_COUNT = 10;
  const DEBRIS_LIFE = 0.8;
  const LIGHT_DURATION = 0.4;

  const state = {
    cd: 0,
    ready: true,
    phase: 'idle',
    chargeTimer: 0,
    impactTimer: 0,
    ringT: 0,
    active: false,
    hoverY: 0,
  };

  const CHARGE_GEO = new THREE.RingGeometry(RADIUS * 0.35, RADIUS * 0.35 + 0.4, 40);
  const CHARGE_MAT = new THREE.MeshBasicMaterial({
    color: 0xff8822, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const chargeRing = new THREE.Mesh(CHARGE_GEO, CHARGE_MAT.clone());
  chargeRing.rotation.x = -Math.PI / 2;
  chargeRing.visible = false;
  chargeRing.frustumCulled = false;
  SCENE.add(chargeRing);

  const IMPACT_GEO = new THREE.RingGeometry(0.5, 1.4, 48);
  const IMPACT_MAT = new THREE.MeshBasicMaterial({
    color: 0xffaa44, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const impactRing = new THREE.Mesh(IMPACT_GEO, IMPACT_MAT.clone());
  impactRing.rotation.x = -Math.PI / 2;
  impactRing.visible = false;
  impactRing.frustumCulled = false;
  SCENE.add(impactRing);

  const impactLight = new THREE.PointLight(0xff7722, 0, RADIUS * 2, 2);
  impactLight.visible = false;
  SCENE.add(impactLight);

  const SPARK_GEO = new THREE.SphereGeometry(0.14, 5, 4);
  const SPARK_MAT = new THREE.MeshBasicMaterial({
    color: 0xffcc44, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sparks = [];
  for (let i = 0; i < SPARK_COUNT; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, active: false });
  }
  let sparkIdx = 0;

  const DEBRIS_GEO = new THREE.DodecahedronGeometry(0.12, 0);
  const DEBRIS_MAT = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.9 });
  const debris = [];
  for (let i = 0; i < DEBRIS_COUNT; i++) {
    const m = new THREE.Mesh(DEBRIS_GEO, DEBRIS_MAT);
    m.castShadow = true;
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    debris.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, spin: 0, sx: 0, sz: 0, active: false });
  }
  let debrisIdx = 0;

  const FLASH_GEO = new THREE.SphereGeometry(1.8, 10, 8);
  const FLASH_MAT = new THREE.MeshBasicMaterial({
    color: 0xffdd66, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flashMesh = new THREE.Mesh(FLASH_GEO, FLASH_MAT.clone());
  flashMesh.visible = false;
  flashMesh.frustumCulled = false;
  SCENE.add(flashMesh);

  const hud = document.getElementById('hud');
  const hudWrap = document.createElement('div');
  hudWrap.style.cssText = 'position:absolute;left:16px;bottom:340px;font-size:11px;letter-spacing:2px;color:#ffaa44;text-shadow:0 1px 3px #000;z-index:6;';
  const label = document.createElement('div');
  label.textContent = 'SHOCK SLAM [G]';
  hudWrap.appendChild(label);
  const bar = document.createElement('div');
  bar.style.cssText = 'margin-top:3px;width:90px;height:5px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,140,60,0.35);border-radius:3px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#cc5511,#ffaa44);transition:width 0.08s;';
  bar.appendChild(fill);
  hudWrap.appendChild(bar);
  if (hud) hud.appendChild(hudWrap);

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function isPlaying() {
    return window.Manager && window.Manager.state && window.Manager.state.phase === 'playing' && window.Player && Player.state.locked;
  }

  function getPlayerPos() {
    const cam = window.CAMERA;
    return cam ? cam.position : null;
  }

  function getEnemies(centerX, centerZ) {
    const ents = (window.Entities && Array.isArray(window.Entities.list)) ? window.Entities.list : [];
    const playerTeam = (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
    const result = [];
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.team === playerTeam || !e.mesh) continue;
      const m = e.mesh;
      const dx = m.position.x - centerX;
      const dz = m.position.z - centerZ;
      const d2 = dx * dx + dz * dz;
      if (d2 <= RADIUS * RADIUS) result.push({ ent: e, dist: Math.sqrt(d2) });
    }
    return result;
  }

  function applyDamageAndKnockback(centerX, centerZ) {
    const enemies = getEnemies(centerX, centerZ);
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i].ent;
      const dist = enemies[i].dist;
      const falloff = 1 - dist / RADIUS;
      const dmg = Math.round(DAMAGE * (0.5 + 0.5 * falloff));
      if (e.takeDamage) {
        e.takeDamage(dmg, 'ability');
      } else if (e.hp !== undefined) {
        e.hp -= dmg;
        if (e.hp <= 0 && !e.dead) {
          e.dead = true;
          if (window.KillRewards) window.KillRewards.notify(e.team);
        }
      }
      const m = e.mesh;
      const dx = m.position.x - centerX;
      const dz = m.position.z - centerZ;
      const len = Math.sqrt(dx * dx + dz * dz);
      const nx = len > 0.01 ? dx / len : (Math.random() - 0.5);
      const nz = len > 0.01 ? dz / len : (Math.random() - 0.5);
      const kbStr = KNOCKBACK_H * (0.5 + 0.5 * falloff);
      if (e.vel) {
        e.vel.x += nx * kbStr;
        e.vel.z += nz * kbStr;
        e.vel.y += KNOCKBACK_UP * falloff;
      }
      if (e.knockback) {
        e.knockback.x = (e.knockback.x || 0) + nx * kbStr;
        e.knockback.z = (e.knockback.z || 0) + nz * kbStr;
      }
      m.position.x += nx * 0.4;
      m.position.z += nz * 0.4;
    }
    return enemies.length;
  }

  function spawnSparks(x, y, z, count) {
    for (let i = 0; i < count; i++) {
      const s = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % SPARK_COUNT;
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const spd = SPARK_SPEED * (0.5 + Math.random() * 0.7);
      s.vx = Math.cos(ang) * spd;
      s.vz = Math.sin(ang) * spd;
      s.vy = 6 + Math.random() * 10;
      s.mesh.position.set(x + s.vx * 0.03, y, z + s.vz * 0.03);
      s.mesh.scale.setScalar(0.6 + Math.random() * 0.7);
      s.mesh.visible = true;
      s.mesh.material.opacity = 0.9 + Math.random() * 0.1;
      s.life = SPARK_LIFE * (0.6 + Math.random() * 0.5);
      s.active = true;
    }
  }

  function spawnDebris(x, y, z, count) {
    for (let i = 0; i < count; i++) {
      const d = debris[debrisIdx];
      debrisIdx = (debrisIdx + 1) % DEBRIS_COUNT;
      const ang = Math.random() * Math.PI * 2;
      const spd = 5 + Math.random() * 7;
      d.vx = Math.cos(ang) * spd;
      d.vz = Math.sin(ang) * spd;
      d.vy = 8 + Math.random() * 8;
      d.sx = (Math.random() - 0.5) * 12;
      d.sz = (Math.random() - 0.5) * 12;
      d.spin = (Math.random() - 0.5) * 14;
      d.mesh.position.set(x, y + 0.1, z);
      d.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      d.mesh.scale.setScalar(0.5 + Math.random() * 0.8);
      d.mesh.visible = true;
      d.life = DEBRIS_LIFE * (0.7 + Math.random() * 0.4);
      d.active = true;
    }
  }

  function startCharge() {
    state.phase = 'charging';
    state.chargeTimer = CHARGE_TIME;
    state.active = true;
    state.hoverY = 0;
    const pos = getPlayerPos();
    if (pos) {
      const gy = groundY(pos.x, pos.z);
      chargeRing.position.set(pos.x, gy + 0.05, pos.z);
    }
    chargeRing.material.opacity = 0.8;
    chargeRing.scale.setScalar(0.3);
    chargeRing.visible = true;
    if (window.FX && window.FX.shake) window.FX.shake(CHARGE_SCREEN_SHAKE);
  }

  function triggerImpact() {
    state.phase = 'impact';
    state.impactTimer = IMPACT_DURATION;
    state.ringT = 0;
    const pos = getPlayerPos();
    if (!pos) return;
    const gy = groundY(pos.x, pos.z);
    applyDamageAndKnockback(pos.x, pos.z);
    impactRing.position.set(pos.x, gy + 0.06, pos.z);
    impactRing.scale.setScalar(0.2);
    impactRing.material.opacity = 0.9;
    impactRing.visible = true;
    impactLight.position.set(pos.x, gy + 2, pos.z);
    impactLight.intensity = 8;
    impactLight.visible = true;
    flashMesh.position.set(pos.x, gy + 1, pos.z);
    flashMesh.scale.setScalar(0.5);
    flashMesh.material.opacity = 0.85;
    flashMesh.visible = true;
    spawnSparks(pos.x, gy + 0.3, pos.z, SPARK_COUNT);
    spawnDebris(pos.x, gy, pos.z, DEBRIS_COUNT);
    if (window.FX && window.FX.shake) window.FX.shake(IMPACT_SCREEN_SHAKE);
    if (window.Sound) {
      window.Sound.tone(60, 0.5, 'sawtooth', 0.45, 600);
      window.Sound.tone(110, 0.3, 'square', 0.25, 1200);
      window.Sound.boom && window.Sound.boom();
    }
  }

  function endImpact() {
    state.phase = 'idle';
    state.active = false;
    state.hoverY = 0;
    impactRing.visible = false;
    impactLight.visible = false;
    flashMesh.visible = false;
    chargeRing.visible = false;
    state.cd = COOLDOWN_MAX;
  }

  function activate() {
    if (!isPlaying()) return;
    if (state.cd > 0 || state.phase !== 'idle') return;
    const p = window.Player ? window.Player.state : null;
    if (!p) return;
    if (p.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('TOO EXHAUSTED', '#ff6644');
      return;
    }
    p.stamina -= STAMINA_COST;
    if (p.regenTimer !== undefined) p.regenTimer = 1.5;
    startCharge();
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'g' && e.key !== 'G') return;
    if (!isPlaying()) return;
    activate();
  });

  function update(dt) {
    if (state.cd > 0) {
      state.cd -= dt;
      if (state.cd < 0) state.cd = 0;
    }

    const fillPct = state.cd > 0 ? (1 - state.cd / COOLDOWN_MAX) * 100 : 100;
    fill.style.width = fillPct + '%';
    hudWrap.style.opacity = isPlaying() ? '1' : '0.5';

    const cam = window.CAMERA;

    if (state.phase === 'charging') {
      state.chargeTimer -= dt;
      state.hoverY += dt * 5;
      if (cam) cam.position.y += dt * 2.0;
      const t = 1 - state.chargeTimer / CHARGE_TIME;
      chargeRing.scale.setScalar(0.3 + t * 0.7);
      chargeRing.material.opacity = 0.4 + 0.5 * (1 - t);
      chargeRing.material.color.setHSL(0.08 + t * 0.04, 0.9, 0.5 + t * 0.1);
      const pulseScale = 1 + Math.sin(state.chargeTimer * 30) * 0.06;
      chargeRing.scale.multiplyScalar(pulseScale);
      if (state.chargeTimer <= 0) triggerImpact();
    }

    if (state.phase === 'impact') {
      state.impactTimer -= dt;
      state.ringT += dt;
      const t = Math.min(1, state.ringT / RING_EXPAND_TIME);
      const ringScale = 0.2 + t * (RADIUS / 1.0);
      impactRing.scale.setScalar(ringScale);
      impactRing.material.opacity = 0.9 * (1 - t * 0.7);
      impactLight.intensity = 8 * (state.impactTimer / IMPACT_DURATION);
      const flashT = 1 - state.impactTimer / IMPACT_DURATION;
      flashMesh.scale.setScalar(0.5 + flashT * 3.5);
      flashMesh.material.opacity = 0.85 * Math.max(0, 1 - flashT * 3);
      if (state.hoverY > 0) {
        state.hoverY -= dt * 8;
        if (cam) cam.position.y -= dt * 4.0;
        if (state.hoverY < 0) state.hoverY = 0;
      }
      if (state.impactTimer <= 0) endImpact();
    }

    for (let i = 0; i < SPARK_COUNT; i++) {
      const s = sparks[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.vy -= 22 * dt;
      s.vx *= 0.94;
      s.vz *= 0.94;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      if (s.mesh.position.y < groundY(s.mesh.position.x, s.mesh.position.z) + 0.05) {
        s.mesh.position.y = groundY(s.mesh.position.x, s.mesh.position.z) + 0.05;
        s.vy *= -0.3;
        s.vx *= 0.5;
        s.vz *= 0.5;
      }
      const lifeFrac = s.life / SPARK_LIFE;
      s.mesh.material.opacity = lifeFrac * 0.95;
      s.mesh.scale.setScalar(0.5 + lifeFrac * 0.6);
    }

    for (let i = 0; i < DEBRIS_COUNT; i++) {
      const d = debris[i];
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.active = false;
        d.mesh.visible = false;
        continue;
      }
      d.vy -= 18 * dt;
      d.vx *= 0.96;
      d.vz *= 0.96;
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += d.vz * dt;
      if (d.mesh.position.y < groundY(d.mesh.position.x, d.mesh.position.z) + 0.05) {
        d.mesh.position.y = groundY(d.mesh.position.x, d.mesh.position.z) + 0.05;
        d.vy *= -0.25;
        d.vx *= 0.4;
        d.vz *= 0.4;
      }
      d.mesh.rotation.x += d.spin * dt;
      d.mesh.rotation.z += d.sx * dt;
      d.mesh.rotation.y += d.sz * dt;
    }
  }

  function reset() {
    state.cd = 0;
    state.phase = 'idle';
    state.active = false;
    state.chargeTimer = 0;
    state.impactTimer = 0;
    state.hoverY = 0;
    chargeRing.visible = false;
    impactRing.visible = false;
    impactLight.visible = false;
    flashMesh.visible = false;
    for (let i = 0; i < SPARK_COUNT; i++) { sparks[i].active = false; sparks[i].mesh.visible = false; }
    for (let i = 0; i < DEBRIS_COUNT; i++) { debris[i].active = false; debris[i].mesh.visible = false; }
  }

  return { state, update, reset, activate };
})();
window.ShockSlam = ShockSlam;