// sniper-deer.js — FORESTWAR elite deer sniper: long-range marksman with laser-sight telegraph and high-damage charged shots
const THREE = window.THREE;
const SCENE = window.SCENE;
const SniperDeer = (() => {
  const MAX_SNIPERS = 3;
  const SPAWN_FIRST = 50;
  const SPAWN_INTERVAL = 60;
  const HEALTH = 110;
  const SPEED = 4.0;
  const FLEE_DIST = 30;
  const RETREAT_DIST = 40;
  const DETECT_RANGE = 80;
  const FOV_DOT = 0.2;
  const CHARGE_TIME = 1.8;
  const SHOT_DAMAGE = 48;
  const SHOT_RANGE = 120;
  const COOLDOWN = 3.5;
  const REPOSITION_INTERVAL = 6.0;
  const STRAFE_RADIUS = 4.0;
  const TURN_SPEED = 2.5;
  const LASER_BRIGHTNESS = 0.9;
  const MUZZLE_LIFE = 0.08;
  const TRACER_LIFE = 0.1;

  const state = {
    snipers: [],
    spawnTimer: SPAWN_FIRST,
    time: 0,
  };

  const BODY_GEO = new THREE.CapsuleGeometry(0.3, 1.0, 4, 8);
  const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x1a3318, roughness: 0.7, emissive: 0x051a05, emissiveIntensity: 0.4 });
  const HEAD_GEO = new THREE.SphereGeometry(0.24, 10, 8);
  const ANTLER_GEO = new THREE.ConeGeometry(0.05, 0.8, 4);
  const ANTLER_MAT = new THREE.MeshStandardMaterial({ color: 0x3a6a28, roughness: 0.4, emissive: 0x1a3a10, emissiveIntensity: 0.6 });
  const EYE_GEO = new THREE.SphereGeometry(0.08, 6, 5);
  const EYE_MAT = new THREE.MeshBasicMaterial({ color: 0xff3300 });
  const CLOAK_GEO = new THREE.ConeGeometry(0.45, 1.4, 6, 1, true);
  const CLOAK_MAT = new THREE.MeshStandardMaterial({ color: 0x123012, roughness: 0.95, side: THREE.DoubleSide, flatShading: true });
  const RIFLE_BODY_GEO = new THREE.BoxGeometry(0.08, 0.1, 1.0);
  const RIFLE_BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.7 });
  const RIFLE_SCOPE_GEO = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6);
  RIFLE_SCOPE_GEO.rotateX(Math.PI / 2);
  const RIFLE_BARREL_GEO = new THREE.CylinderGeometry(0.025, 0.025, 0.5, 5);
  RIFLE_BARREL_GEO.rotateX(Math.PI / 2);

  const LASER_MAT = new THREE.LineBasicMaterial({ color: 0xff2200, transparent: true, opacity: LASER_BRIGHTNESS, blending: THREE.AdditiveBlending, depthWrite: false });
  const CHARGE_GEO = new THREE.SphereGeometry(0.15, 8, 6);
  const CHARGE_MAT = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });

  const TRACER_GEO = new THREE.CylinderGeometry(0.012, 0.004, 1, 4);
  TRACER_GEO.rotateX(Math.PI / 2);
  const TRACER_MAT = new THREE.MeshBasicMaterial({ color: 0xff5522, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });

  const MUZZLE_GEO = new THREE.SphereGeometry(0.3, 8, 6);
  const MUZZLE_MAT = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });

  const SPARK_GEO = new THREE.SphereGeometry(0.1, 5, 4);
  const SPARK_MAT = new THREE.MeshBasicMaterial({ color: 0xff6633, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });

  const tracers = [];
  for (let i = 0; i < MAX_SNIPERS * 2; i++) {
    const m = new THREE.Mesh(TRACER_GEO, TRACER_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    tracers.push({ mesh: m, life: 0, active: false });
  }
  let tracerIdx = 0;

  const muzzles = [];
  for (let i = 0; i < MAX_SNIPERS; i++) {
    const m = new THREE.Mesh(MUZZLE_GEO, MUZZLE_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    muzzles.push({ mesh: m, life: 0, active: false });
  }

  const sparks = [];
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, active: false });
  }
  let sparkIdx = 0;

  function spawnTracer(start, end) {
    const slot = tracers[tracerIdx];
    tracerIdx = (tracerIdx + 1) % tracers.length;
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    if (len < 0.01) return;
    slot.mesh.position.copy(start).add(end).multiplyScalar(0.5);
    slot.mesh.scale.set(1, 1, len);
    slot.mesh.lookAt(end);
    slot.mesh.visible = true;
    slot.mesh.material.opacity = 0.9;
    slot.life = TRACER_LIFE;
    slot.active = true;
  }

  function spawnMuzzle(pos) {
    let slot = null;
    for (const m of muzzles) { if (!m.active) { slot = m; break; } }
    if (!slot) return;
    slot.mesh.position.copy(pos);
    slot.mesh.visible = true;
    slot.mesh.material.opacity = 1;
    slot.life = MUZZLE_LIFE;
    slot.active = true;
  }

  function spawnSparks(pos, normal, count) {
    for (let i = 0; i < count; i++) {
      const slot = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % sparks.length;
      const ang = Math.random() * Math.PI * 2;
      const up = 1 + Math.random() * 3;
      const out = 1 + Math.random() * 2;
      slot.vx = normal.x * out + Math.cos(ang) * 1.5;
      slot.vy = up;
      slot.vz = normal.z * out + Math.sin(ang) * 1.5;
      slot.mesh.position.copy(pos);
      slot.mesh.visible = true;
      slot.mesh.material.opacity = 1;
      slot.life = 0.3 + Math.random() * 0.2;
      slot.active = true;
    }
  }

  function buildMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(BODY_GEO, BODY_MAT);
    body.castShadow = true;
    body.position.y = 0.9;
    g.add(body);
    const head = new THREE.Mesh(HEAD_GEO, BODY_MAT);
    head.position.set(0, 1.55, 0.25);
    head.castShadow = true;
    g.add(head);
    for (const sx of [-1, 1]) {
      const ant = new THREE.Mesh(ANTLER_GEO, ANTLER_MAT);
      ant.position.set(sx * 0.14, 1.9, 0.22);
      ant.rotation.z = sx * 0.5;
      g.add(ant);
    }
    for (const sx of [-0.16, 0.16]) {
      const eye = new THREE.Mesh(EYE_GEO, EYE_MAT.clone());
      eye.position.set(sx, 1.58, 0.45);
      g.add(eye);
    }
    const cloak = new THREE.Mesh(CLOAK_GEO, CLOAK_MAT);
    cloak.position.y = 0.7;
    g.add(cloak);
    const rifle = new THREE.Group();
    const rb = new THREE.Mesh(RIFLE_BODY_GEO, RIFLE_BODY_MAT);
    rifle.add(rb);
    const scope = new THREE.Mesh(RIFLE_SCOPE_GEO, RIFLE_BODY_MAT);
    scope.position.set(0, 0.08, 0);
    rifle.add(scope);
    const barrel = new THREE.Mesh(RIFLE_BARREL_GEO, RIFLE_BODY_MAT);
    barrel.position.set(0, 0, 0.65);
    rifle.add(barrel);
    rifle.position.set(0.25, 1.1, 0.3);
    g.add(rifle);
    g.userData.rifle = rifle;
    g.userData.head = head;
    const chargeOrb = new THREE.Mesh(CHARGE_GEO, CHARGE_MAT.clone());
    chargeOrb.position.set(0, 1.1, 0.8);
    chargeOrb.visible = false;
    g.add(chargeOrb);
    g.userData.chargeOrb = chargeOrb;

    const laserGeo = new THREE.BufferGeometry();
    laserGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const laser = new THREE.Line(laserGeo, LASER_MAT.clone());
    laser.frustumCulled = false;
    laser.visible = false;
    SCENE.add(laser);
    g.userData.laser = laser;
    g.userData.laserPositions = laserGeo.attributes.position;

    return g;
  }

  function spawn(x, z) {
    if (state.snipers.length >= MAX_SNIPERS) return;
    const gy = (typeof window.groundHeight === 'function') ? window.groundHeight(x, z) : 0;
    const mesh = buildMesh();
    mesh.position.set(x, gy, z);
    SCENE.add(mesh);
    const sn = {
      mesh,
      hp: HEALTH,
      maxHp: HEALTH,
      dead: false,
      team: 'deer',
      isElite: true,
      kind: 'sniper_deer',
      chargeTimer: 0,
      cooldown: COOLDOWN,
      repositionTimer: 0,
      strafeTarget: new THREE.Vector3(x, gy, z),
      state: 'reposition',
      target: null,
      heading: 0,
      flashTimer: 0,
      removed: false,
    };
    if (window.Entities && window.Entities.register) {
      window.Entities.register(sn);
    } else if (window.Entities && Array.isArray(window.Entities.list)) {
      window.Entities.list.push(sn);
    }
    state.snipers.push(sn);
    if (window.FX && window.FX.message) {
      window.FX.message('SNIPER DEER SPOTTED', '#ff6644');
    }
  }

  function findTarget(sn) {
    const player = window.Player;
    const cam = window.CAMERA;
    if (!player || !cam) return null;
    const pp = cam.position;
    const mp = sn.mesh.position;
    const dx = pp.x - mp.x;
    const dz = pp.z - mp.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > DETECT_RANGE * DETECT_RANGE) return null;
    return { x: pp.x, y: pp.y, z: pp.z, distSq };
  }

  function getPlayer() {
    const cam = window.CAMERA;
    if (!cam) return null;
    const ms = window.Manager && window.Manager.state;
    if (ms && !ms.playerAlive) return null;
    return { x: cam.position.x, y: cam.position.y, z: cam.position.z };
  }

  function dealDamage(amount) {
    const ms = window.Manager && window.Manager.state;
    if (!ms || !ms.playerAlive) return;
    ms.playerHp -= amount;
    ms.lastKillerName = 'Sniper Deer';
    ms.lastKillerId = -900;
    ms.lastKillerPos = null;
    if (ms.playerHp <= 0) {
      ms.playerHp = 0;
      ms.playerAlive = false;
      ms.respawnTimer = 3.5;
    }
    if (window.FX && window.FX.damageFlash) window.FX.damageFlash();
    if (window.Sound && window.Sound.hit) window.Sound.hit();
  }

  function tryFire(sn) {
    const target = sn.target;
    if (!target) return;
    const muzzle = new THREE.Vector3();
    sn.mesh.userData.rifle.getWorldPosition(muzzle);
    muzzle.y += 0.1;
    const aimPoint = new THREE.Vector3(target.x, target.y - 0.1, target.z);
    spawnMuzzle(muzzle);
    spawnTracer(muzzle, aimPoint);
    dealDamage(SHOT_DAMAGE);
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(180, 0.12, 'square', 0.25, 2200);
      window.Sound.tone(90, 0.08, 'sawtooth', 0.18, 1200);
    }
    if (window.FX && window.FX.shake) window.FX.shake(0.12);
    const sparkDir = new THREE.Vector3().subVectors(aimPoint, muzzle).normalize().negate();
    spawnSparks(aimPoint, sparkDir, 6);
    sn.cooldown = COOLDOWN;
  }

  function removeSniper(sn) {
    if (sn.removed) return;
    sn.removed = true;
    sn.dead = true;
    if (sn.mesh.userData.laser) {
      sn.mesh.userData.laser.visible = false;
    }
    if (sn.mesh.userData.chargeOrb) {
      sn.mesh.userData.chargeOrb.visible = false;
    }
    SCENE.remove(sn.mesh);
    const idx = state.snipers.indexOf(sn);
    if (idx !== -1) state.snipers.splice(idx, 1);
  }

  function updateSniper(sn, dt) {
    if (sn.dead) { removeSniper(sn); return; }
    const ms = window.Manager && window.Manager.state;
    if (!ms || ms.phase !== 'playing') return;
    if (sn.flashTimer > 0) sn.flashTimer -= dt;
    const target = findTarget(sn);
    sn.target = target;
    const pos = sn.mesh.position;
    let gy = (typeof window.groundHeight === 'function') ? window.groundHeight(pos.x, pos.z) : 0;
    pos.y = gy;

    if (!target) {
      sn.state = 'idle';
      sn.cooldown -= dt;
      if (sn.cooldown < 0) sn.cooldown = 0;
      if (sn.mesh.userData.laser) sn.mesh.userData.laser.visible = false;
      if (sn.mesh.userData.chargeOrb) sn.mesh.userData.chargeOrb.visible = false;
      return;
    }

    const dist = Math.sqrt(target.distSq);
    const tgtX = target.x, tgtZ = target.z;
    const desiredHeading = Math.atan2(tgtX - pos.x, tgtZ - pos.z);
    let dh = desiredHeading - sn.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    sn.heading += dh * Math.min(1, TURN_SPEED * dt);
    sn.mesh.rotation.y = sn.heading;

    if (dist < FLEE_DIST) {
      sn.state = 'flee';
      const fx = pos.x - (tgtX - pos.x) * 0.02;
      const fz = pos.z - (tgtZ - pos.z) * 0.02;
      pos.x += (fx - pos.x) * SPEED * dt * 0.5;
      pos.z += (fz - pos.z) * SPEED * dt * 0.5;
      sn.cooldown = Math.max(sn.cooldown, 1.5);
      if (sn.mesh.userData.laser) sn.mesh.userData.laser.visible = false;
      if (sn.mesh.userData.chargeOrb) sn.mesh.userData.chargeOrb.visible = false;
      sn.chargeTimer = 0;
      return;
    }

    if (dist > RETREAT_DIST) {
      sn.state = 'approach';
      const dirX = (tgtX - pos.x) / dist;
      const dirZ = (tgtZ - pos.z) / dist;
      pos.x += dirX * SPEED * dt;
      pos.z += dirZ * SPEED * dt;
      if (sn.mesh.userData.laser) sn.mesh.userData.laser.visible = false;
      if (sn.mesh.userData.chargeOrb) sn.mesh.userData.chargeOrb.visible = false;
      return;
    }

    sn.repositionTimer -= dt;
    if (sn.repositionTimer <= 0) {
      const ang = Math.random() * Math.PI * 2;
      const r = STRAFE_RADIUS * (0.5 + Math.random());
      sn.strafeTarget.set(pos.x + Math.cos(ang) * r, gy, pos.z + Math.sin(ang) * r);
      sn.repositionTimer = REPOSITION_INTERVAL * (0.6 + Math.random() * 0.6);
    }
    const sx = sn.strafeTarget.x - pos.x;
    const sz = sn.strafeTarget.z - pos.z;
    const sm = Math.sqrt(sx * sx + sz * sz);
    if (sm > 0.3) {
      pos.x += (sx / sm) * SPEED * 0.5 * dt;
      pos.z += (sz / sm) * SPEED * 0.5 * dt;
    }

    sn.state = 'sniping';
    sn.cooldown -= dt;

    if (sn.cooldown > 0) {
      if (sn.mesh.userData.laser) sn.mesh.userData.laser.visible = false;
      if (sn.mesh.userData.chargeOrb) {
        sn.mesh.userData.chargeOrb.visible = false;
        sn.mesh.userData.chargeOrb.material.opacity = 0;
      }
      sn.chargeTimer = 0;
      return;
    }

    sn.chargeTimer += dt;
    const chargeFrac = Math.min(1, sn.chargeTimer / CHARGE_TIME);
    const laser = sn.mesh.userData.laser;
    const laserPos = laser.userData.laserPositions || laser.geometry.attributes.position;
    const muzzle = new THREE.Vector3();
    sn.mesh.userData.rifle.getWorldPosition(muzzle);
    muzzle.y += 0.1;
    const aimX = tgtX;
    const aimY = target.y - 0.05;
    const aimZ = tgtZ;
    laserPos.array[0] = muzzle.x;
    laserPos.array[1] = muzzle.y;
    laserPos.array[2] = muzzle.z;
    laserPos.array[3] = aimX;
    laserPos.array[4] = aimY;
    laserPos.array[5] = aimZ;
    laserPos.needsUpdate = true;
    laser.visible = true;
    laser.material.opacity = LASER_BRIGHTNESS * (0.4 + 0.6 * chargeFrac);

    const orb = sn.mesh.userData.chargeOrb;
    orb.visible = true;
    orb.material.opacity = chargeFrac * 0.9;
    orb.scale.setScalar(0.5 + chargeFrac * 1.5);
    orb.position.set(
      muzzle.x - pos.x + Math.sin(state.time * 15) * 0.02,
      muzzle.y - pos.y + 0.05,
      muzzle.z - pos.z
    );

    if (sn.chargeTimer >= CHARGE_TIME) {
      tryFire(sn);
      sn.chargeTimer = 0;
      laser.visible = false;
      orb.visible = false;
    }
  }

  function damageSniper(sn, amount, source) {
    if (sn.dead) return;
    sn.hp -= amount;
    sn.flashTimer = 0.1;
    if (sn.hp <= 0) {
      sn.dead = true;
      if (window.Entities && window.Entities.onKill) {
        window.Entities.onKill(sn, source);
      }
      if (window.KillRewards && window.KillRewards.notify) {
        window.KillRewards.notify('deer');
      }
    }
  }

  function update(dt) {
    state.time += dt;
    if (window.Manager && window.Manager.state && window.Manager.state.phase === 'playing') {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0 && state.snipers.length < MAX_SNIPERS) {
        const ms = window.Manager.state;
        if (ms.wavesCleared >= 2) {
          const cam = window.CAMERA;
          if (cam) {
            const ang = Math.random() * Math.PI * 2;
            const r = 45 + Math.random() * 25;
            spawn(cam.position.x + Math.cos(ang) * r, cam.position.z + Math.sin(ang) * r);
          }
        }
        state.spawnTimer = SPAWN_INTERVAL;
      }
    }
    for (let i = state.snipers.length - 1; i >= 0; i--) {
      updateSniper(state.snipers[i], dt);
    }
    for (let i = 0; i < tracers.length; i++) {
      const t = tracers[i];
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; t.active = false; }
      else { t.mesh.material.opacity = (t.life / TRACER_LIFE) * 0.9; }
    }
    for (let i = 0; i < muzzles.length; i++) {
      const m = muzzles[i];
      if (!m.active) continue;
      m.life -= dt;
      if (m.life <= 0) { m.mesh.visible = false; m.active = false; }
      else {
        m.mesh.material.opacity = m.life / MUZZLE_LIFE;
        m.mesh.scale.setScalar(0.6 + (1 - m.life / MUZZLE_LIFE) * 0.8);
      }
    }
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; s.active = false; continue; }
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.vy -= 12 * dt;
      s.mesh.material.opacity = s.life / 0.4;
    }
  }

  function reset() {
    for (const sn of state.snipers.slice()) removeSniper(sn);
    state.snipers.length = 0;
    state.spawnTimer = SPAWN_FIRST;
    for (const t of tracers) { t.active = false; t.mesh.visible = false; }
    for (const m of muzzles) { m.active = false; m.mesh.visible = false; }
    for (const s of sparks) { s.active = false; s.mesh.visible = false; }
  }

  function init() {
    if (window.CombatText && window.CombatText) {}
  }

  window.SniperDeer = {
    update, reset, init, spawn,
    damage: damageSniper,
    get list() { return state.snipers; },
    get state() { return state; },
  };

  return window.SniperDeer;
})();