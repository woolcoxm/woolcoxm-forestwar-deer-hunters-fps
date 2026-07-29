// pack-hunter.js — FORESTWAR elite pack-hunter stags: buff nearby deer, fight in coordinated hunting packs
const THREE = window.THREE;
const SCENE = window.SCENE;
const PackHunter = (() => {
  const MAX_PACK = 3;
  const PACK_SIZE_MAX = 4;
  const SPAWN_FIRST = 65;
  const SPAWN_INTERVAL = 70;
  const HEALTH = 95;
  const SPEED = 6.0;
  const HOVER_DIST = 16;
  const STRAFE_RADIUS = 5;
  const REPOSITION_INTERVAL = 4.5;
  const DETECT_RANGE = 55;
  const FOV_DOT = 0.15;
  const FIRE_RATE = 1.3;
  const BURST_COUNT = 3;
  const BURST_INTERVAL = 0.14;
  const SHOT_DAMAGE = 14;
  const SHOT_RANGE = 80;
  const TRACER_LIFE = 0.08;
  const BUFF_RANGE = 14;
  const BUFF_SPEED = 1.18;
  const BUFF_FIRE_RATE = 1.15;
  const PACK_BUFF_MULT = 1.08;
  const TURN_SPEED = 3.5;
  const STRAFE_SPEED = 5.5;
  const MUZZLE_LIFE = 0.05;
  const PACK_SCAN_INTERVAL = 0.5;
  const PACK_SCAN_RADIUS = 18;

  const state = {
    pack: [],
    spawnTimer: SPAWN_FIRST,
  };

  // Shared assets
  const BODY_GEO = new THREE.CapsuleGeometry(0.3, 0.9, 4, 8);
  const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x4a2812, roughness: 0.8 });
  const HEAD_GEO = new THREE.SphereGeometry(0.24, 10, 8);
  const LEG_GEO = new THREE.CylinderGeometry(0.09, 0.12, 1.3, 6);
  const LEG_MAT = new THREE.MeshStandardMaterial({ color: 0x3a1e0c, roughness: 0.9 });
  const ANTLER_GEO = new THREE.ConeGeometry(0.05, 0.75, 4);
  const ANTLER_MAT = new THREE.MeshStandardMaterial({ color: 0xb89860, roughness: 0.4, emissive: 0x552200, emissiveIntensity: 0.5 });
  const EYE_GEO = new THREE.SphereGeometry(0.08, 6, 5);
  const EYE_MAT = new THREE.MeshBasicMaterial({ color: 0xffaa22 });
  const MARK_GEO = new THREE.SphereGeometry(0.08, 5, 4);
  const MARK_MAT = new THREE.MeshBasicMaterial({ color: 0x8a4a1a });
  const SCAR_GEO = new THREE.BoxGeometry(0.15, 0.02, 0.03);
  const SCAR_MAT = new THREE.MeshBasicMaterial({ color: 0x2a1505 });
  const PAINT_GEO = new THREE.PlaneGeometry(0.3, 0.18);
  const PAINT_MAT = new THREE.MeshBasicMaterial({ color: 0xaa3311, transparent: true, opacity: 0.7 });

  const TRACER_GEO = new THREE.CylinderGeometry(0.018, 0.004, 1, 4);
  TRACER_GEO.rotateX(Math.PI / 2);
  const TRACER_MAT = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });

  const MUZZLE_GEO = new THREE.SphereGeometry(0.18, 6, 5);
  const MUZZLE_MAT = new THREE.MeshBasicMaterial({ color: 0xffcc55, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });

  const BUFF_GEO = new THREE.RingGeometry(BUFF_RANGE - 0.4, BUFF_RANGE, 40);
  const BUFF_MAT = new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });

  const PULSE_GEO = new THREE.RingGeometry(0.5, 0.8, 32);
  const PULSE_MAT = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });

  // Tracer pool
  const TRACER_POOL = 18;
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i++) {
    const m = new THREE.Mesh(TRACER_GEO, TRACER_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    tracers.push({ mesh: m, life: 0, start: new THREE.Vector3(), end: new THREE.Vector3() });
  }
  let tracerIdx = 0;

  // Muzzle flash pool
  const MUZZLE_POOL = 6;
  const muzzles = [];
  for (let i = 0; i < MUZZLE_POOL; i++) {
    const m = new THREE.Mesh(MUZZLE_GEO, MUZZLE_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    muzzles.push({ mesh: m, life: 0 });
  }
  let muzzleIdx = 0;

  // Pulse ring pool
  const PULSE_POOL = 6;
  const pulses = [];
  for (let i = 0; i < PULSE_POOL; i++) {
    const m = new THREE.Mesh(PULSE_GEO, PULSE_MAT.clone());
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    pulses.push({ mesh: m, t: 0, active: false });
  }
  let pulseIdx = 0;

  // Buff aura pool (per pack hunter)
  const AURA_POOL = 3;
  const auras = [];
  for (let i = 0; i < AURA_POOL; i++) {
    const m = new THREE.Mesh(BUFF_GEO, BUFF_MAT.clone());
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    auras.push({ mesh: m, target: null });
  }
  let auraIdx = 0;

  // Scratch vectors
  const _toTarget = new THREE.Vector3();
  const _toPlayer = new THREE.Vector3();
  const _strafeTarget = new THREE.Vector3();
  const _muzzle = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const _muzzleDir = new THREE.Vector3();
  const _camPos = new THREE.Vector3();

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function getPlayer() {
    const ms = window.Manager && window.Manager.state;
    if (!ms || ms.phase !== 'playing' || !ms.playerAlive) return null;
    return window.CAMERA ? window.CAMERA.position : null;
  }

  function getPlayerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function isEnemy(e) {
    if (!e || e.dead) return false;
    return e.team !== getPlayerTeam();
  }

  function buildMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(BODY_GEO, BODY_MAT);
    body.castShadow = true;
    body.position.y = 1.05;
    g.add(body);
    const head = new THREE.Mesh(HEAD_GEO, BODY_MAT);
    head.position.set(0, 1.6, 0.28);
    head.castShadow = true;
    g.add(head);
    for (const sx of [-0.12, 0.12]) {
      const ant = new THREE.Mesh(ANTLER_GEO, ANTLER_MAT);
      ant.position.set(sx, 1.95, 0.28);
      ant.rotation.z = sx > 0 ? 0.5 : -0.5;
      g.add(ant);
    }
    for (const sx of [-0.2, 0.2]) {
      const eye = new THREE.Mesh(EYE_GEO, EYE_MAT);
      eye.position.set(sx, 1.62, 0.48);
      g.add(eye);
    }
    for (const sx of [-0.18, 0.18]) {
      const mark = new THREE.Mesh(MARK_GEO, MARK_MAT);
      mark.position.set(sx, 1.3, 0.2);
      g.add(mark);
    }
    for (const sx of [-0.18, 0.18]) {
      for (const sz of [-0.22, 0.22]) {
        const leg = new THREE.Mesh(LEG_GEO, LEG_MAT);
        leg.position.set(sx, 0.55, sz);
        leg.castShadow = true;
        g.add(leg);
      }
    }
    for (let i = 0; i < 2; i++) {
      const scar = new THREE.Mesh(SCAR_GEO, SCAR_MAT);
      scar.position.set(0.15, 1.25 + i * 0.12, 0.32);
      scar.rotation.z = 0.3 + i * 0.2;
      g.add(scar);
    }
    const paint = new THREE.Mesh(PAINT_GEO, PAINT_MAT);
    paint.position.set(0, 1.1, 0.32);
    paint.rotation.x = -0.2;
    g.add(paint);
    return g;
  }

  function getAura() {
    const a = auras[auraIdx];
    auraIdx = (auraIdx + 1) % AURA_POOL;
    return a;
  }

  function spawn(x, z, packCount) {
    if (state.pack.length >= MAX_PACK) return;
    const h = {
      mesh: buildMesh(),
      hp: HEALTH,
      maxHp: HEALTH,
      dead: false,
      team: 'deer',
      isElite: true,
      eliteType: 'packhunter',
      facing: 0,
      targetYaw: 0,
      strafeAngle: Math.random() * Math.PI * 2,
      strafePhase: 0,
      fireCd: FIRE_RATE * 0.5 + Math.random() * 1.0,
      burstShots: 0,
      burstCd: 0,
      reposeTimer: REPOSITION_INTERVAL * Math.random(),
      scanTimer: Math.random() * PACK_SCAN_INTERVAL,
      packBuffed: false,
      packNearby: 0,
      alive: true,
      vx: 0,
      vz: 0,
      stunTimer: 0,
      buffAppliedTo: new Set(),
    };
    h.mesh.position.set(x, groundY(x, z), z);
    SCENE.add(h.mesh);
    h.userData = { entity: h, headshot: true };
    h.mesh.userData = h.userData;
    const aura = getAura();
    aura.target = h;
    aura.mesh.visible = true;
    h.aura = aura;
    h.pulseTimer = 2 + Math.random() * 2;
    state.pack.push(h);
    if (window.Entities && typeof window.Entities.registerExternal === 'function') {
      window.Entities.registerExternal(h);
    }
  }

  function spawnPack(x, z) {
    const count = 2 + Math.floor(Math.random() * (PACK_SIZE_MAX - 1));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const r = 4 + Math.random() * 6;
      spawn(x + Math.cos(a) * r, z + Math.sin(a) * r, count);
    }
    if (window.FX) window.FX.message('PACK HUNTERS SPOTTED', '#ff8833');
    if (window.Sound) {
      window.Sound.tone(140, 0.5, 'sawtooth', 0.3, 500);
      window.Sound.tone(90, 0.7, 'square', 0.2, 300);
    }
  }

  function trySpawn(dt) {
    state.spawnTimer -= dt;
    if (state.spawnTimer > 0) return;
    if (state.pack.length >= MAX_PACK) {
      state.spawnTimer = 15;
      return;
    }
    state.spawnTimer = SPAWN_INTERVAL;
    const cam = window.CAMERA;
    if (!cam) return;
    const a = Math.random() * Math.PI * 2;
    const r = 40 + Math.random() * 30;
    spawnPack(cam.position.x + Math.cos(a) * r, cam.position.z + Math.sin(a) * r);
  }

  function spawnPulse(x, z) {
    const p = pulses[pulseIdx];
    pulseIdx = (pulseIdx + 1) % PULSE_POOL;
    const gy = groundY(x, z);
    p.mesh.position.set(x, gy + 0.05, z);
    p.mesh.scale.setScalar(0.5);
    p.mesh.material.opacity = 0.6;
    p.mesh.visible = true;
    p.t = 0;
    p.active = true;
  }

  function fireShot(h, targetPos) {
    _muzzle.set(h.mesh.position.x, h.mesh.position.y + 1.55, h.mesh.position.z + 0.5);
    _muzzleDir.subVectors(targetPos, _muzzle);
    const dist = _muzzleDir.length();
    _muzzleDir.normalize();
    const dmg = SHOT_DAMAGE * (h.packNearby > 0 ? 1 + h.packNearby * 0.1 : 1);
    if (window.Entities && typeof window.Entities.hitscanFromExternal === 'function') {
      window.Entities.hitscanFromExternal(h, _muzzle, _muzzleDir, SHOT_RANGE, dmg, 'deer');
    } else {
      rayFallback(h, _muzzle, _muzzleDir, SHOT_RANGE, dmg);
    }
    const tracer = tracers[tracerIdx];
    tracerIdx = (tracerIdx + 1) % TRACER_POOL;
    tracer.start.copy(_muzzle);
    tracer.end.copy(_muzzle).addScaledVector(_muzzleDir, Math.min(dist, SHOT_RANGE));
    tracer.mesh.visible = true;
    tracer.life = TRACER_LIFE;
    const mf = muzzles[muzzleIdx];
    muzzleIdx = (muzzleIdx + 1) % MUZZLE_POOL;
    mf.mesh.position.copy(_muzzle);
    mf.mesh.material.opacity = 0.9;
    mf.mesh.visible = true;
    mf.life = MUZZLE_LIFE;
    if (window.Sound && window.Sound.tone) window.Sound.tone(880 + Math.random() * 80, 0.06, 'square', 0.12, 2000);
  }

  function rayFallback(h, origin, dir, range, damage) {
    if (!window.Entities || !window.Entities.list) return;
    const pteam = getPlayerTeam();
    for (const e of window.Entities.list) {
      if (e.dead || e.team === pteam) continue;
      _toTarget.subVectors(e.mesh.position, origin);
      const proj = _toTarget.dot(dir);
      if (proj < 0 || proj > range) continue;
      const closest = origin.clone().addScaledVector(dir, proj);
      const dist = closest.distanceTo(e.mesh.position);
      if (dist < 1.2) {
        if (typeof e.takeDamage === 'function') e.takeDamage(damage);
        break;
      }
    }
  }

  function updateHunter(h, dt) {
    if (h.dead) return;
    if (h.stunTimer > 0) h.stunTimer -= dt;
    const pos = h.mesh.position;
    const playerPos = getPlayer();
    let target = null;
    let targetDist = Infinity;
    if (playerPos) {
      _toPlayer.subVectors(playerPos, pos);
      targetDist = _toPlayer.length();
      if (targetDist < DETECT_RANGE) target = playerPos;
    }
    h.scanTimer -= dt;
    if (h.scanTimer <= 0) {
      h.scanTimer = PACK_SCAN_INTERVAL;
      h.packNearby = 0;
      h.buffAppliedTo.clear();
      for (let i = 0; i < state.pack.length; i++) {
        const other = state.pack[i];
        if (other === h || other.dead) continue;
        const d = pos.distanceTo(other.mesh.position);
        if (d < PACK_SCAN_RADIUS) h.packNearby++;
      }
      const ents = window.Entities && window.Entities.list;
      if (ents) {
        for (let i = 0; i < ents.length; i++) {
          const e = ents[i];
          if (e.dead || e.team !== 'deer' || e === h) continue;
          const d = pos.distanceTo(e.mesh.position);
          if (d < BUFF_RANGE) {
            e.packSpeedBuff = BUFF_SPEED;
            e.packFireRateBuff = BUFF_FIRE_RATE;
            e.packBuffTimer = 0.6;
            h.buffAppliedTo.add(e);
          }
        }
      }
    }
    if (h.aura && h.aura.mesh) {
      h.aura.mesh.position.set(pos.x, groundY(pos.x, pos.z) + 0.03, pos.z);
      const pulse = 0.15 + Math.sin(h.strafePhase * 2) * 0.05;
      h.aura.mesh.material.opacity = pulse + h.packNearby * 0.04;
    }
    h.pulseTimer -= dt;
    if (h.pulseTimer <= 0) {
      h.pulseTimer = 3 + Math.random() * 2;
      spawnPulse(pos.x, pos.z);
    }
    if (!target) {
      const wanderA = Math.random() * Math.PI * 2;
      _strafeTarget.set(pos.x + Math.cos(wanderA) * 8, 0, pos.z + Math.sin(wanderA) * 8);
      _toTarget.subVectors(_strafeTarget, pos);
      _toTarget.y = 0;
      const d = _toTarget.length();
      if (d > 0.5) {
        const sp = SPEED * 0.4 * dt;
        pos.x += (_toTarget.x / d) * sp;
        pos.z += (_toTarget.z / d) * sp;
      }
    } else {
      _toPlayer.y = 0;
      const dist = _toPlayer.length();
      h.reposeTimer -= dt;
      if (h.reposeTimer <= 0) {
        h.reposeTimer = REPOSITION_INTERVAL;
        h.strafeAngle += Math.PI * (0.4 + Math.random() * 0.5);
      }
      h.strafePhase += dt * 2;
      let moveSpd = 0;
      let desiredDist = HOVER_DIST;
      if (dist < HOVER_DIST - 3) {
        _toPlayer.normalize();
        pos.x -= _toPlayer.x * SPEED * dt;
        pos.z -= _toPlayer.z * SPEED * dt;
      } else if (dist > HOVER_DIST + 4) {
        _toPlayer.normalize();
        pos.x += _toPlayer.x * SPEED * dt;
        pos.z += _toPlayer.z * SPEED * dt;
      } else {
        h.strafeAngle += dt * 0.8 * (h.packNearby % 2 === 0 ? 1 : -1);
        _strafeTarget.set(
          pos.x + Math.cos(h.strafeAngle) * STRAFE_RADIUS,
          0,
          pos.z + Math.sin(h.strafeAngle) * STRAFE_RADIUS
        );
        _toTarget.subVectors(_strafeTarget, pos);
        _toTarget.y = 0;
        const sd = _toTarget.length();
        if (sd > 0.2) {
          pos.x += (_toTarget.x / sd) * STRAFE_SPEED * dt;
          pos.z += (_toTarget.z / sd) * STRAFE_SPEED * dt;
        }
      }
      h.targetYaw = Math.atan2(_toPlayer.x, _toPlayer.z);
      if (h.burstShots > 0) {
        h.burstCd -= dt;
        if (h.burstCd <= 0) {
          fireShot(h, target);
          h.burstShots--;
          h.burstCd = BURST_INTERVAL;
        }
      } else {
        let effectiveCd = h.fireCd;
        if (h.stunTimer > 0) effectiveCd = Infinity;
        if (effectiveCd <= 0 && dist < SHOT_RANGE * 0.9 && h.stunTimer <= 0) {
          h.burstShots = BURST_COUNT;
          h.burstCd = 0;
          h.fireCd = FIRE_RATE / (h.packNearby > 0 ? 1 + h.packNearby * 0.12 : 1);
        }
      }
    }
    h.fireCd -= dt;
    let yawDiff = h.targetYaw - h.facing;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    h.facing += yawDiff * Math.min(1, TURN_SPEED * dt);
    h.mesh.rotation.y = h.facing;
    pos.y = groundY(pos.x, pos.z);
  }

  function update(dt) {
    trySpawn(dt);
    for (let i = 0; i < state.pack.length; i++) {
      updateHunter(state.pack[i], dt);
    }
    const dead = [];
    for (let i = 0; i < state.pack.length; i++) {
      if (state.pack[i].dead) dead.push(i);
    }
    for (let i = dead.length - 1; i >= 0; i--) {
      const idx = dead[i];
      const h = state.pack[idx];
      if (h.aura) {
        h.aura.mesh.visible = false;
        h.aura.target = null;
      }
      if (h.mesh && h.mesh.parent) SCENE.remove(h.mesh);
      state.pack.splice(idx, 1);
    }
    for (let i = 0; i < tracers.length; i++) {
      const t = tracers[i];
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.mesh.visible = false;
      } else {
        t.mesh.position.lerpVectors(t.start, t.end, 0.5);
        const len = t.start.distanceTo(t.end);
        t.mesh.scale.set(1, 1, len);
        t.mesh.lookAt(t.end);
        t.mesh.material.opacity = (t.life / TRACER_LIFE) * 0.85;
      }
    }
    for (let i = 0; i < muzzles.length; i++) {
      const m = muzzles[i];
      if (m.life <= 0) continue;
      m.life -= dt;
      if (m.life <= 0) {
        m.mesh.visible = false;
      } else {
        m.mesh.material.opacity = (m.life / MUZZLE_LIFE) * 0.9;
        m.mesh.scale.setScalar(0.7 + (1 - m.life / MUZZLE_LIFE) * 0.4);
      }
    }
    for (let i = 0; i < pulses.length; i++) {
      const p = pulses[i];
      if (!p.active) continue;
      p.t += dt;
      const lifeMax = 1.0;
      if (p.t >= lifeMax) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      const frac = p.t / lifeMax;
      const sc = 0.5 + frac * (BUFF_RANGE / 0.8);
      p.mesh.scale.set(sc, sc, sc);
      p.mesh.material.opacity = (1 - frac) * 0.5;
    }
  }

  function reset() {
    for (const h of state.pack) {
      if (h.aura) { h.aura.mesh.visible = false; h.aura.target = null; }
      if (h.mesh && h.mesh.parent) SCENE.remove(h.mesh);
    }
    state.pack.length = 0;
    state.spawnTimer = SPAWN_FIRST;
    for (const t of tracers) { t.life = 0; t.mesh.visible = false; }
    for (const m of muzzles) { m.life = 0; m.mesh.visible = false; }
    for (const p of pulses) { p.active = false; p.mesh.visible = false; }
    for (const a of auras) { a.mesh.visible = false; a.target = null; }
  }

  function getBuffs() {
    return { speed: BUFF_SPEED, fireRate: BUFF_FIRE_RATE, damage: 1 + PACK_SIZE_MAX * PACK_BUFF_MULT };
  }

  return { state, update, reset, spawn, getBuffs };
})();

window.PackHunter = PackHunter;