// jammer-deer.js — FORESTWAR elite jammer-deer: hovering support unit that projects a disruption dome, slowing fire rate and worsening accuracy for enemies inside
const THREE = window.THREE;
const SCENE = window.SCENE;
const JammerDeer = (() => {
  const MAX_JAMMERS = 3;
  const SPAWN_FIRST = 70;
  const SPAWN_INTERVAL = 55;
  const HEALTH = 140;
  const SPEED = 5.0;
  const HOVER_HEIGHT = 6.5;
  const HOVER_BOB = 0.6;
  const HOVER_BOB_FREQ = 1.6;
  const MAINTAIN_DIST = 22;
  const REPOSITION_INTERVAL = 4.5;
  const REPOSITION_RANGE = 6;
  const DETECT_RANGE = 70;
  const JAM_RADIUS = 14;
  const JAM_FIRE_RATE_MULT = 0.4;
  const JAM_SPREAD_MULT = 3.0;
  const JAM_AIM_JITTER = 0.08;
  const JAM_SPEED_MULT = 0.65;
  const ORB_SPEED = 26;
  const ORB_DAMAGE = 22;
  const ORB_LIFE = 2.0;
  const FIRE_RATE = 2.2;
  const ORB_RADIUS = 2.2;
  const TURN_SPEED = 3.0;
  const STRAFE_SPEED = 4.0;
  const STRAFE_INTERVAL = 3.0;
  const MUZZLE_LIFE = 0.05;
  const SCAN_INTERVAL = 0.25;
  const DEATH_EXPLOSION_RADIUS = JAM_RADIUS;
  const DEATH_EXPLOSION_DAMAGE = 30;
  const PARTICLE_COUNT = 18;
  const ARC_POOL = 12;
  const ARC_SEGMENTS = 6;
  const ARC_INTERVAL = 0.18;
  const ARC_LIFE = 0.12;
  const PULSE_INTERVAL = 0.5;
  const SPARK_POOL = 20;
  const SPARK_LIFE = 0.4;
  const TRACER_LIFE = 0.08;

  const state = {
    jammers: [],
    spawnTimer: SPAWN_FIRST,
    time: 0,
  };

  const BODY_GEO = new THREE.CapsuleGeometry(0.32, 1.0, 4, 8);
  const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2248, roughness: 0.5, metalness: 0.5, emissive: 0x150a30, emissiveIntensity: 0.5 });
  const HEAD_GEO = new THREE.SphereGeometry(0.26, 10, 8);
  const ANTLER_GEO = new THREE.ConeGeometry(0.06, 0.7, 4);
  const ANTLER_MAT = new THREE.MeshStandardMaterial({ color: 0x9944cc, roughness: 0.3, metalness: 0.5, emissive: 0x441188, emissiveIntensity: 0.7 });
  const EYE_GEO = new THREE.SphereGeometry(0.09, 6, 5);
  const EYE_MAT = new THREE.MeshBasicMaterial({ color: 0xcc44ff });

  const CRYSTAL_GEO = new THREE.OctahedronGeometry(0.16, 0);
  const CRYSTAL_MAT = new THREE.MeshBasicMaterial({ color: 0xaa44ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });

  const FLOAT_GEO = new THREE.TorusGeometry(0.5, 0.045, 6, 20);
  const FLOAT_MAT = new THREE.MeshBasicMaterial({ color: 0x9933dd, transparent: true, opacity: 0.65 });

  const WING_GEO = new THREE.BoxGeometry(1.4, 0.06, 0.35);
  const WING_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1430, roughness: 0.5, metalness: 0.6, emissive: 0x0a0518, emissiveIntensity: 0.4 });

  const DOME_GEO = new THREE.SphereGeometry(JAM_RADIUS, 16, 10);
  const DOME_MAT = new THREE.MeshBasicMaterial({ color: 0x9944ff, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending });

  const FLOOR_RING_GEO = new THREE.RingGeometry(JAM_RADIUS - 0.4, JAM_RADIUS, 48);
  const FLOOR_RING_MAT = new THREE.MeshBasicMaterial({ color: 0xaa55ee, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });

  const PULSE_GEO = new THREE.RingGeometry(0.5, 0.8, 32);
  const PULSE_MAT = new THREE.MeshBasicMaterial({ color: 0xbb66ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });

  const ARC_LINE_GEO = new THREE.BufferGeometry();
  const ARC_LINE_MAX = ARC_POOL * (ARC_SEGMENTS + 1) * 3;
  ARC_LINE_GEO.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_LINE_MAX), 3));
  const ARC_LINE_MAT = new THREE.LineBasicMaterial({ color: 0xcc66ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  const arcLines = new THREE.LineSegments(ARC_LINE_GEO, ARC_LINE_MAT);
  arcLines.frustumCulled = false;
  arcLines.visible = false;
  SCENE.add(arcLines);
  const arcPool = [];
  for (let i = 0; i < ARC_POOL; i++) arcPool.push({ life: 0, active: false, pts: new Float32Array((ARC_SEGMENTS + 1) * 3) });
  let arcIdx = 0;
  let arcTimer = 0;

  const SPARK_GEO = new THREE.SphereGeometry(0.1, 5, 4);
  const SPARK_MAT = new THREE.MeshBasicMaterial({ color: 0xcc66ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks = [];
  for (let i = 0; i < SPARK_POOL; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, active: false });
  }
  let sparkIdx = 0;

  const ORB_GEO = new THREE.SphereGeometry(0.2, 8, 6);
  const ORB_MAT = new THREE.MeshBasicMaterial({ color: 0xcc44ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const ORB_GLOW_GEO = new THREE.SphereGeometry(0.38, 8, 6);
  const ORB_GLOW_MAT = new THREE.MeshBasicMaterial({ color: 0x8822cc, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });

  const MUZZLE_GEO = new THREE.SphereGeometry(0.18, 6, 5);
  const MUZZLE_MAT = new THREE.MeshBasicMaterial({ color: 0xcc66ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });

  const DEATH_FLASH_GEO = new THREE.SphereGeometry(1, 10, 8);
  const DEATH_FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0xdd66ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });

  const TRACER_GEO = new THREE.CylinderGeometry(0.015, 0.004, 1, 4);
  TRACER_GEO.rotateX(Math.PI / 2);
  const TRACER_MAT = new THREE.MeshBasicMaterial({ color: 0xcc66ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracers = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(TRACER_GEO, TRACER_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    tracers.push({ mesh: m, life: 0, active: false });
  }
  let tracerIdx = 0;

  const orbs = [];

  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _target = new THREE.Vector3();
  const _camPos = new THREE.Vector3();
  const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const _ray = new THREE.Raycaster();

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function getPlayer() {
    return (window.CAMERA && window.Player && window.Player.state && window.Player.state.locked) ? window.CAMERA.position : null;
  }

  function getPlayerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function getEnemies(self) {
    if (!window.Entities || !Array.isArray(window.Entities.list)) return [];
    const pt = getPlayerTeam();
    return window.Entities.list.filter(e => !e.dead && e.team !== self.team && e !== self);
  }

  function findTarget(self) {
    const playerPos = getPlayer();
    if (playerPos) {
      _v1.copy(playerPos);
      _v1.y -= HOVER_HEIGHT;
      const distSq = _v1.distanceToSquared(self.pos);
      if (distSq <= DETECT_RANGE * DETECT_RANGE) return { type: 'player', pos: playerPos };
    }
    let closest = null;
    let closestDist = DETECT_RANGE * DETECT_RANGE;
    const enemies = getEnemies(self);
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.mesh) continue;
      const d = e.mesh.position.distanceToSquared(self.pos);
      if (d < closestDist) { closestDist = d; closest = e; }
    }
    return closest ? { type: 'entity', ent: closest } : null;
  }

  function buildMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(BODY_GEO, BODY_MAT);
    body.castShadow = true;
    body.position.y = 0;
    g.add(body);
    const head = new THREE.Mesh(HEAD_GEO, BODY_MAT);
    head.castShadow = true;
    head.position.set(0, 0.75, 0.25);
    g.add(head);
    for (const sx of [-1, 1]) {
      const ant = new THREE.Mesh(ANTLER_GEO, ANTLER_MAT);
      ant.position.set(sx * 0.14, 1.05, 0.25);
      ant.rotation.z = sx * 0.5;
      g.add(ant);
    }
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(EYE_GEO, EYE_MAT.clone());
      eye.position.set(sx * 0.2, 0.8, 0.45);
      g.add(eye);
    }
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(WING_GEO, WING_MAT);
      wing.position.set(sx * 0.7, 0, 0);
      wing.rotation.z = sx * 0.15;
      g.add(wing);
    }
    const core = new THREE.Mesh(CRYSTAL_GEO, CRYSTAL_MAT.clone());
    core.position.set(0, 0.1, 0.3);
    g.add(core);
    g.userData.core = core;
    const dome = new THREE.Mesh(DOME_GEO, DOME_MAT.clone());
    dome.position.y = 0;
    dome.visible = false;
    g.add(dome);
    g.userData.dome = dome;
    const floorRing = new THREE.Mesh(FLOOR_RING_GEO, FLOOR_RING_MAT.clone());
    floorRing.rotation.x = -Math.PI / 2;
    floorRing.visible = false;
    g.add(floorRing);
    g.userData.floorRing = floorRing;
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(FLOAT_GEO, FLOAT_MAT.clone());
      ring.rotation.x = Math.PI / 2 + (i - 1) * 0.4;
      ring.rotation.y = (i / 3) * Math.PI;
      ring.position.y = -0.1;
      g.add(ring);
      if (!g.userData.floatRings) g.userData.floatRings = [];
      g.userData.floatRings.push(ring);
    }
    g.userData.crystals = [];
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(CRYSTAL_GEO, CRYSTAL_MAT.clone());
      c.position.set(sx * 0.5, -0.2, 0);
      g.add(c);
      g.userData.crystals.push(c);
    }
    return g;
  }

  function spawn(x, z) {
    if (state.jammers.length >= MAX_JAMMERS) return;
    const mesh = buildMesh();
    mesh.position.set(x, groundY(x, z) + HOVER_HEIGHT, z);
    SCENE.add(mesh);
    const j = {
      id: 'jammer_' + (state.time.toFixed(2)) + '_' + state.jammers.length,
      team: 'deer',
      mesh,
      pos: mesh.position,
      hp: HEALTH,
      maxHp: HEALTH,
      dead: false,
      target: null,
      fireCd: Math.random() * FIRE_RATE,
      heading: 0,
      reposeT: REPOSITION_INTERVAL * Math.random(),
      strafeT: STRAFE_INTERVAL * Math.random(),
      strafeDir: 1,
      scanT: Math.random() * SCAN_INTERVAL,
      bobPhase: Math.random() * Math.PI * 2,
      ringSpin: 0,
      pulseT: 0,
      hitFlash: 0,
    };
    mesh.userData.entity = j;
    if (window.Entities && typeof window.Entities.register === 'function') {
      window.Entities.register(j);
    } else if (window.Entities && Array.isArray(window.Entities.list)) {
      window.Entities.list.push(j);
    }
    state.jammers.push(j);
    mesh.userData.dome.visible = true;
    mesh.userData.floorRing.visible = true;
    return j;
  }

  function damageJammer(j, amount) {
    if (j.dead) return;
    j.hp -= amount;
    j.hitFlash = 1;
    if (window.CombatText && window.CombatText.spawn) {
      window.CombatText.spawn(j.mesh.position, Math.round(amount), {});
    }
    if (j.hp <= 0) killJammer(j);
  }

  function killJammer(j) {
    if (j.dead) return;
    j.dead = true;
    j.hp = 0;
    const pos = j.mesh.position;
    if (window.FX && window.FX.burst) {
      window.FX.burst(pos, new THREE.Vector3(0, 1, 0), 0xcc44ff, 12);
    }
    if (window.Craters && window.Craters.create) {
      window.Craters.create(pos.x, pos.z, DEATH_EXPLOSION_RADIUS);
    }
    const flash = new THREE.Mesh(DEATH_FLASH_GEO, DEATH_FLASH_MAT.clone());
    flash.position.copy(pos);
    flash.scale.setScalar(1);
    SCENE.add(flash);
    let flashLife = 0.3;
    const flashAnim = { mesh: flash, life: flashLife, maxLife: flashLife, active: true };
    deathFlashes.push(flashAnim);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      spawnSpark(pos.x, pos.y, pos.z, 0xcc44ff);
    }
    const enemies = getEnemies(j);
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.mesh) continue;
      const d = e.mesh.position.distanceTo(pos);
      if (d <= DEATH_EXPLOSION_RADIUS) {
        const dmg = DEATH_EXPLOSION_DAMAGE * (1 - d / DEATH_EXPLOSION_RADIUS);
        if (e === window.Player || e.type === 'player') {
          if (window.Manager && window.Manager.damagePlayer) {
            window.Manager.damagePlayer(dmg);
          }
        } else if (e.hp !== undefined && typeof e.takeDamage === 'function') {
          e.takeDamage(dmg, 'jammer');
        } else if (window.Entities && typeof window.Entities.applyDamage === 'function') {
          window.Entities.applyDamage(e, dmg, 'jammer', j);
        }
      }
    }
    j.mesh.visible = false;
    if (window.Bleed && window.Bleed.unregister) window.Bleed.unregister(j);
    if (window.BloodTrails && window.BloodTrails.unregister) window.BloodTrails.unregister(j);
    setTimeout(() => {
      if (j.mesh && j.mesh.parent) j.mesh.parent.remove(j.mesh);
    }, 100);
    const idx = state.jammers.indexOf(j);
    if (idx !== -1) {
      state.jammers[idx] = state.jammers[state.jammers.length - 1];
      state.jammers.pop();
    }
  }

  const deathFlashes = [];

  function spawnSpark(x, y, z, color) {
    const s = sparks[sparkIdx];
    sparkIdx = (sparkIdx + 1) % SPARK_POOL;
    const ang = Math.random() * Math.PI * 2;
    const elv = Math.random() * Math.PI * 0.5;
    const spd = 4 + Math.random() * 8;
    s.vx = Math.cos(ang) * Math.cos(elv) * spd;
    s.vy = Math.sin(elv) * spd + 2;
    s.vz = Math.sin(ang) * Math.cos(elv) * spd;
    s.mesh.material.color.setHex(color || 0xcc66ff);
    s.mesh.material.opacity = 1;
    s.mesh.position.set(x, y, z);
    s.mesh.scale.setScalar(0.6 + Math.random() * 0.6);
    s.mesh.visible = true;
    s.life = SPARK_LIFE;
    s.active = true;
  }

  function fireOrb(self, targetPos) {
    const orb = {
      mesh: new THREE.Mesh(ORB_GEO, ORB_MAT.clone()),
      glow: new THREE.Mesh(ORB_GLOW_GEO, ORB_GLOW_MAT.clone()),
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      life: ORB_LIFE,
      active: true,
      team: self.team,
      damage: ORB_DAMAGE,
    };
    orb.pos.copy(self.mesh.position);
    orb.pos.y -= 0.3;
    orb.mesh.position.copy(orb.pos);
    orb.glow.position.copy(orb.pos);
    _dir.copy(targetPos).sub(orb.pos).normalize();
    orb.vel.copy(_dir).multiplyScalar(ORB_SPEED);
    orb.mesh.lookAt(targetPos);
    SCENE.add(orb.mesh);
    SCENE.add(orb.glow);
    orbs.push(orb);
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(180, 0.15, 'sawtooth', 0.12, 800);
    }
  }

  function updateOrbs(dt) {
    for (let i = orbs.length - 1; i >= 0; i--) {
      const orb = orbs[i];
      orb.life -= dt;
      if (orb.life <= 0) {
        SCENE.remove(orb.mesh);
        SCENE.remove(orb.glow);
        orbs.splice(i, 1);
        continue;
      }
      orb.pos.addScaledVector(orb.vel, dt);
      orb.mesh.position.copy(orb.pos);
      orb.glow.position.copy(orb.pos);
      orb.mesh.material.opacity = Math.min(1, orb.life * 2);
      orb.glow.material.opacity = Math.min(0.35, orb.life * 0.7);
      const gy = groundY(orb.pos.x, orb.pos.z) + 0.2;
      if (orb.pos.y <= gy) {
        detonateOrb(orb);
        SCENE.remove(orb.mesh);
        SCENE.remove(orb.glow);
        orbs.splice(i, 1);
        continue;
      }
      const playerPos = getPlayer();
      if (playerPos) {
        if (orb.pos.distanceTo(playerPos) < 1.2) {
          if (window.Manager && window.Manager.damagePlayer) {
            window.Manager.damagePlayer(orb.damage);
          }
          detonateOrb(orb);
          SCENE.remove(orb.mesh);
          SCENE.remove(orb.glow);
          orbs.splice(i, 1);
          continue;
        }
      }
      const enemies = (window.Entities && Array.isArray(window.Entities.list)) ? window.Entities.list : [];
      const ot = orb.team === 'deer' ? 'hunter' : 'deer';
      let hit = false;
      for (let j = 0; j < enemies.length; j++) {
        const e = enemies[j];
        if (e.dead || e.team !== ot || !e.mesh || e.id === orb.ownerId) continue;
        if (e.mesh.position.distanceToSquared(orb.pos) < 1.5) {
          if (typeof e.takeDamage === 'function') e.takeDamage(orb.damage, 'orb');
          else if (window.Entities && typeof window.Entities.applyDamage === 'function') window.Entities.applyDamage(e, orb.damage, 'orb');
          hit = true;
          break;
        }
      }
      if (hit) {
        detonateOrb(orb);
        SCENE.remove(orb.mesh);
        SCENE.remove(orb.glow);
        orbs.splice(i, 1);
      }
    }
  }

  function detonateOrb(orb) {
    if (window.FX && window.FX.burst) {
      window.FX.burst(orb.pos, new THREE.Vector3(0, 1, 0), 0xcc44ff, 8);
    }
    const enemies = (window.Entities && Array.isArray(window.Entities.list)) ? window.Entities.list : [];
    const ot = orb.team === 'deer' ? 'hunter' : 'deer';
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead || e.team !== ot || !e.mesh) continue;
      const d = e.mesh.position.distanceTo(orb.pos);
      if (d <= ORB_RADIUS) {
        const dmg = orb.damage * (1 - d / ORB_RADIUS);
        if (typeof e.takeDamage === 'function') e.takeDamage(dmg, 'orb');
        else if (window.Entities && typeof window.Entities.applyDamage === 'function') window.Entities.applyDamage(e, dmg, 'orb');
      }
    }
  }

  function isInJamRadius(x, z) {
    for (let i = 0; i < state.jammers.length; i++) {
      const j = state.jammers[i];
      if (j.dead || !j.mesh) continue;
      const dx = j.mesh.position.x - x;
      const dz = j.mesh.position.z - z;
      if (dx * dx + dz * dz <= JAM_RADIUS * JAM_RADIUS) return true;
    }
    return false;
  }

  function getJamFireRateMult() {
    return isInJamRadiusActive() ? JAM_FIRE_RATE_MULT : 1.0;
  }

  function isInJamRadiusActive() {
    if (state.jammers.length === 0) return false;
    const cam = window.CAMERA;
    if (!cam) return false;
    return isInJamRadius(cam.position.x, cam.position.z);
  }

  function getJamSpreadMult() {
    return isInJamRadiusActive() ? JAM_SPREAD_MULT : 1.0;
  }

  function getJamAimJitter() {
    return isInJamRadiusActive() ? JAM_AIM_JITTER : 0;
  }

  function getJamSpeedMult() {
    return isInJamRadiusActive() ? JAM_SPEED_MULT : 1.0;
  }

  function spawnArc(fromX, fromY, fromZ, toX, toY, toZ) {
    const slot = arcPool[arcIdx];
    arcIdx = (arcIdx + 1) % ARC_POOL;
    const pts = slot.pts;
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = i / ARC_SEGMENTS;
      pts[i * 3] = fromX + (toX - fromX) * t + (Math.random() - 0.5) * 0.8;
      pts[i * 3 + 1] = fromY + (toY - fromY) * t + (Math.random() - 0.5) * 0.8;
      pts[i * 3 + 2] = fromZ + (toZ - fromZ) * t + (Math.random() - 0.5) * 0.8;
    }
    slot.life = ARC_LIFE;
    slot.active = true;
    arcLines.visible = true;
  }

  function updateArcs(dt) {
    let anyActive = false;
    let offset = 0;
    const positions = ARC_LINE_GEO.attributes.position.array;
    for (let i = 0; i < arcPool.length; i++) {
      const a = arcPool[i];
      if (!a.active) continue;
      a.life -= dt;
      if (a.life <= 0) { a.active = false; continue; }
      anyActive = true;
      const len = (ARC_SEGMENTS + 1) * 3;
      positions.set(a.pts, offset);
      offset += len;
    }
    if (!anyActive) arcLines.visible = false;
    ARC_LINE_GEO.setDrawRange(0, offset / 3);
    if (anyActive) ARC_LINE_GEO.attributes.position.needsUpdate = true;
  }

  function updateSparks(dt) {
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) { s.active = false; s.mesh.visible = false; continue; }
      s.vy -= 16 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.material.opacity = Math.max(0, s.life / SPARK_LIFE);
    }
  }

  function updateDeathFlashes(dt) {
    for (let i = deathFlashes.length - 1; i >= 0; i--) {
      const f = deathFlashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        SCENE.remove(f.mesh);
        deathFlashes.splice(i, 1);
        continue;
      }
      const t = f.life / f.maxLife;
      const scale = 1 + (1 - t) * DEATH_EXPLOSION_RADIUS;
      f.mesh.scale.setScalar(scale);
      f.mesh.material.opacity = t * 0.7;
    }
  }

  function update(dt) {
    state.time += dt;
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.spawnTimer = SPAWN_INTERVAL;
      if (state.jammers.length < MAX_JAMMERS) {
        const cam = window.CAMERA;
        if (cam) {
          const a = Math.random() * Math.PI * 2;
          const r = 35 + Math.random() * 35;
          spawn(cam.position.x + Math.cos(a) * r, cam.position.z + Math.sin(a) * r);
        }
      }
    }
    arcTimer -= dt;
    for (let i = state.jammers.length - 1; i >= 0; i--) {
      const j = state.jammers[i];
      if (j.dead) { state.jammers.splice(i, 1); continue; }
      j.scanT -= dt;
      if (j.scanT <= 0) {
        j.scanT = SCAN_INTERVAL;
        j.target = findTarget(j);
      }
      j.fireCd -= dt;
      j.reposeT -= dt;
      j.strafeT -= dt;
      j.pulseT -= dt;
      j.bobPhase += dt * HOVER_BOB_FREQ;
      j.ringSpin += dt * 2.0;
      if (j.hitFlash > 0) j.hitFlash -= dt * 4;
      const targetPos = j.target ? (j.target.pos || (j.target.ent && j.target.ent.mesh ? j.target.ent.mesh.position : null)) : null;
      if (targetPos) {
        _dir.set(targetPos.x - j.pos.x, 0, targetPos.z - j.pos.z);
        const dist = _dir.length();
        if (dist > 0.01) {
          _dir.divideScalar(dist);
          const desiredYaw = Math.atan2(_dir.x, _dir.z);
          let dy = desiredYaw - j.heading;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          j.heading += dy * Math.min(1, TURN_SPEED * dt);
          j.mesh.rotation.y = j.heading;
        }
        const idealDist = MAINTAIN_DIST;
        if (dist > idealDist + 3 || dist < idealDist - 3) {
          const sign = dist > idealDist + 3 ? 1 : -0.5;
          j.pos.x += _dir.x * SPEED * sign * dt;
          j.pos.z += _dir.z * SPEED * sign * dt;
        }
        if (j.strafeT <= 0) {
          j.strafeT = STRAFE_INTERVAL;
          j.strafeDir *= -1;
        }
        const perpX = -_dir.z * j.strafeDir;
        const perpZ = _dir.x * j.strafeDir;
        j.pos.x += perpX * STRAFE_SPEED * dt;
        j.pos.z += perpZ * STRAFE_SPEED * dt;
        if (j.reposeT <= 0) {
          j.reposeT = REPOSITION_INTERVAL;
        }
        if (j.fireCd <= 0) {
          j.fireCd = FIRE_RATE;
          fireOrb(j, targetPos);
        }
      } else {
        j.pos.x += Math.sin(j.bobPhase * 0.3) * 0.5 * dt;
        j.pos.z += Math.cos(j.bobPhase * 0.25) * 0.5 * dt;
      }
      const bob = Math.sin(j.bobPhase) * HOVER_BOB;
      j.pos.y = groundY(j.pos.x, j.pos.z) + HOVER_HEIGHT + bob;
      j.mesh.position.copy(j.pos);
      const coreScale = 1 + Math.sin(state.time * 4 + j.bobPhase) * 0.15;
      if (j.mesh.userData.core) j.mesh.userData.core.scale.setScalar(coreScale);
      if (j.mesh.userData.crystals) {
        for (let k = 0; k < j.mesh.userData.crystals.length; k++) {
          j.mesh.userData.crystals[k].rotation.y += dt * 3;
          j.mesh.userData.crystals[k].scale.setScalar(coreScale);
        }
      }
      if (j.mesh.userData.floatRings) {
        for (let k = 0; k < j.mesh.userData.floatRings.length; k++) {
          j.mesh.userData.floatRings[k].rotation.z += dt * (k % 2 === 0 ? 1.5 : -1.2);
        }
      }
      if (j.mesh.userData.floorRing) {
        j.mesh.userData.floorRing.position.y = groundY(j.pos.x, j.pos.z) + 0.1 - j.pos.y;
        j.mesh.userData.floorRing.material.opacity = 0.2 + Math.sin(state.time * 2 + j.bobPhase) * 0.08;
      }
      if (j.pulseT <= 0) {
        j.pulseT = PULSE_INTERVAL;
        if (j.mesh.userData.dome) {
          j.mesh.userData.dome.material.opacity = 0.1;
        }
      }
      if (j.mesh.userData.dome) {
        j.mesh.userData.dome.material.opacity *= Math.pow(0.92, dt * 60);
        if (j.mesh.userData.dome.material.opacity < 0.02) j.mesh.userData.dome.material.opacity = 0.02;
        j.mesh.userData.dome.material.opacity = 0.04 + Math.sin(state.time * 1.5 + j.bobPhase) * 0.02;
      }
      if (j.hitFlash > 0) {
        BODY_MAT.emissiveIntensity = 0.5 + j.hitFlash;
      }
      if (arcTimer <= 0) {
        arcTimer = ARC_INTERVAL;
        const enemies = getEnemies(j);
        for (let k = 0; k < enemies.length; k++) {
          const e = enemies[k];
          if (!e.mesh) continue;
          const dx = e.mesh.position.x - j.pos.x;
          const dz = e.mesh.position.z - j.pos.z;
          if (dx * dx + dz * dz <= JAM_RADIUS * JAM_RADIUS) {
            spawnArc(j.pos.x, j.pos.y, j.pos.z, e.mesh.position.x, e.mesh.position.y, e.mesh.position.z);
            break;
          }
        }
      }
    }
    updateArcs(dt);
    updateOrbs(dt);
    updateSparks(dt);
    updateDeathFlashes(dt);
  }

  function reset() {
    for (const j of state.jammers) {
      if (j.mesh && j.mesh.parent) j.mesh.parent.remove(j.mesh);
    }
    state.jammers.length = 0;
    state.spawnTimer = SPAWN_FIRST;
    state.time = 0;
    for (const o of orbs) {
      SCENE.remove(o.mesh);
      SCENE.remove(o.glow);
    }
    orbs.length = 0;
    for (const a of arcPool) a.active = false;
    arcLines.visible = false;
    for (const s of sparks) { s.active = false; s.mesh.visible = false; }
    for (const f of deathFlashes) SCENE.remove(f.mesh);
    deathFlashes.length = 0;
  }

  return {
    state,
    spawn,
    update,
    reset,
    damageJammer,
    isInJamRadius,
    getJamFireRateMult,
    getJamSpreadMult,
    getJamAimJitter,
    getJamSpeedMult,
    get list() { return state.jammers; },
  };
})();

window.JammerDeer = JammerDeer;