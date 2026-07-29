// guard-deer.js — FORESTWAR elite guard-deer: heavily armored stag that shields-bashes for knockback damage
const THREE = window.THREE;
const SCENE = window.SCENE;
const GuardDeer = (() => {
  const MAX_GUARDS = 4;
  const SPAWN_FIRST = 40;
  const SPAWN_INTERVAL = 50;
  const HEALTH = 260;
  const SPEED = 6.2;
  const CHARGE_SPEED = 18;
  const CHARGE_RANGE = 20;
  const BASH_RANGE = 3.5;
  const BASH_WARMUP = 0.75;
  const BASH_COOLDOWN = 3.5;
  const BASH_DAMAGE = 52;
  const KNOCKBACK_FORCE = 16;
  const KNOCKBACK_UP = 5;
  const ARMOR_REDUCTION = 0.45;
  const BOSS_WAVE_SPAWN = 2;
  const DETECT_RANGE = 45;
  const STRAFE_ANGLE = 1.3;
  const TURN_SPEED = 3.0;

  const state = {
    guards: [],
    spawnTimer: SPAWN_FIRST,
  };

  const BODY_GEO = new THREE.CapsuleGeometry(0.38, 1.2, 5, 8);
  const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x5a3e22, roughness: 0.85 });
  const HEAD_GEO = new THREE.SphereGeometry(0.3, 10, 8);
  const LEG_GEO = new THREE.CylinderGeometry(0.1, 0.13, 1.4, 6);
  const LEG_MAT = new THREE.MeshStandardMaterial({ color: 0x4a3218, roughness: 0.9 });
  const ANTLER_GEO = new THREE.ConeGeometry(0.06, 0.9, 4);
  const ANTLER_MAT = new THREE.MeshStandardMaterial({ color: 0xe8d8a0, roughness: 0.4, emissive: 0x442200, emissiveIntensity: 0.5 });
  const EYE_GEO = new THREE.SphereGeometry(0.09, 6, 5);
  const EYE_MAT = new THREE.MeshBasicMaterial({ color: 0xff4400 });

  const SHIELD_GEO = new THREE.BoxGeometry(0.7, 1.2, 0.12);
  const SHIELD_MAT = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.7, metalness: 0.5, emissive: 0x220800, emissiveIntensity: 0.3 });
  const SHIELD_RIM_GEO = new THREE.TorusGeometry(0.36, 0.04, 5, 12);
  SHIELD_RIM_GEO.rotateY(Math.PI / 2);
  const SHIELD_RIM_MAT = new THREE.MeshBasicMaterial({ color: 0xff6622, transparent: true, opacity: 0.5 });
  const SHIELD_SPIKE_GEO = new THREE.ConeGeometry(0.08, 0.25, 5);
  SHIELD_SPIKE_GEO.rotateZ(Math.PI / 2);
  const SHIELD_SPIKE_MAT = new THREE.MeshStandardMaterial({ color: 0xddaa55, roughness: 0.3, metalness: 0.8 });

  const TELEGRAPH_GEO = new THREE.RingGeometry(1.0, 3.5, 24, 1, 0, Math.PI * 0.5);
  const TELEGRAPH_MAT = new THREE.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const IMPACT_GEO = new THREE.RingGeometry(0.5, 1.0, 32);
  const IMPACT_MAT = new THREE.MeshBasicMaterial({ color: 0xff6633, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const DUST_GEO = new THREE.SphereGeometry(0.2, 5, 4);
  const DUST_MAT = new THREE.MeshBasicMaterial({ color: 0x8a7a5a, transparent: true, opacity: 0, depthWrite: false });
  const CHARGE_AURA_GEO = new THREE.SphereGeometry(1.1, 8, 6);
  const CHARGE_AURA_MAT = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending });

  const telegraphs = [];
  for (let i = 0; i < MAX_GUARDS; i++) {
    const m = new THREE.Mesh(TELEGRAPH_GEO, TELEGRAPH_MAT.clone());
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    telegraphs.push(m);
  }

  const impacts = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(IMPACT_GEO, IMPACT_MAT.clone());
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    impacts.push({ mesh: m, life: 0, active: false });
  }
  let impactIdx = 0;

  const dustPool = [];
  for (let i = 0; i < 30; i++) {
    const m = new THREE.Mesh(DUST_GEO, DUST_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    dustPool.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, active: false });
  }
  let dustIdx = 0;

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function buildGuardMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(BODY_GEO, BODY_MAT);
    body.castShadow = true;
    body.position.y = 1.2;
    g.add(body);
    const head = new THREE.Mesh(HEAD_GEO, BODY_MAT);
    head.castShadow = true;
    head.position.set(0, 2.0, 0.35);
    g.add(head);
    for (const sx of [-1, 1]) {
      const ant = new THREE.Mesh(ANTLER_GEO, ANTLER_MAT);
      ant.position.set(sx * 0.15, 2.45, 0.3);
      ant.rotation.z = sx * 0.5;
      g.add(ant);
      const ant2 = new THREE.Mesh(ANTLER_GEO, ANTLER_MAT);
      ant2.position.set(sx * 0.12, 2.6, 0.25);
      ant2.rotation.z = sx * 0.7;
      ant2.rotation.x = -0.3;
      g.add(ant2);
    }
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(EYE_GEO, EYE_MAT.clone());
      eye.position.set(sx * 0.14, 2.05, 0.55);
      g.add(eye);
    }
    for (const lx of [-0.28, 0.28]) {
      for (const lz of [-0.5, 0.5]) {
        const leg = new THREE.Mesh(LEG_GEO, LEG_MAT);
        leg.castShadow = true;
        leg.position.set(lx, 0.7, lz);
        g.add(leg);
      }
    }
    const aura = new THREE.Mesh(CHARGE_AURA_GEO, CHARGE_AURA_MAT.clone());
    aura.position.y = 1.2;
    aura.visible = false;
    g.add(aura);
    const shield = new THREE.Mesh(SHIELD_GEO, SHIELD_MAT);
    shield.castShadow = true;
    shield.position.set(0, 1.2, 0.45);
    g.add(shield);
    const rim = new THREE.Mesh(SHIELD_RIM_GEO, SHIELD_RIM_MAT.clone());
    rim.position.set(0, 1.2, 0.52);
    g.add(rim);
    for (const sy of [0.85, 1.55]) {
      const spike = new THREE.Mesh(SHIELD_SPIKE_GEO, SHIELD_SPIKE_MAT);
      spike.position.set(0.35, sy, 0.52);
      g.add(spike);
    }
    g.userData.shield = shield;
    g.userData.rim = rim;
    g.userData.aura = aura;
    g.userData.legs = g.children.filter(c => c.geometry === LEG_GEO);
    return g;
  }

  function spawn(x, z) {
    if (state.guards.length >= MAX_GUARDS) return;
    const mesh = buildGuardMesh();
    const gy = groundY(x, z);
    mesh.position.set(x, gy, z);
    SCENE.add(mesh);
    const telegraph = telegraphs[state.guards.length % telegraphs.length];
    state.guards.push({
      mesh,
      hp: HEALTH,
      maxHp: HEALTH,
      phase: 'pursue',
      timer: 0,
      bashCd: 1.0 + Math.random() * 1.5,
      warmupT: 0,
      chargeDir: new THREE.Vector3(),
      strafeDir: 1,
      strafeTimer: 0,
      legPhase: Math.random() * Math.PI * 2,
      telegraph,
      dead: false,
    });
    if (window.FX && window.FX.burst) {
      window.FX.burst(new THREE.Vector3(x, gy + 1, z), new THREE.Vector3(0, 1, 0), 0x8a5a22, 10);
    }
  }

  function spawnFromBoss(count) {
    const n = count || BOSS_WAVE_SPAWN;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 50;
      spawn(Math.cos(a) * r, Math.sin(a) * r);
    }
  }

  function getPlayer() {
    if (window.CAMERA) return { pos: window.CAMERA.position, team: (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter' };
    return null;
  }

  function findTarget(guard) {
    const player = getPlayer();
    if (!player) return null;
    const myPos = guard.mesh.position;
    let bestEnt = null;
    let bestDist = DETECT_RANGE;
    if (window.Entities && window.Entities.list) {
      for (let i = 0; i < window.Entities.list.length; i++) {
        const e = window.Entities.list[i];
        if (e.dead || e.team === 'deer') continue;
        const dx = e.mesh.position.x - myPos.x;
        const dz = e.mesh.position.z - myPos.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < bestDist) { bestDist = d; bestEnt = e; }
      }
    }
    if (player.team !== 'deer') {
      const dx = player.pos.x - myPos.x;
      const dz = player.pos.z - myPos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestDist) {
        return { x: player.pos.x, y: player.pos.y, z: player.pos.z, isPlayer: true };
      }
    }
    if (bestEnt) {
      return { x: bestEnt.mesh.position.x, y: bestEnt.mesh.position.y, z: bestEnt.mesh.position.z, isPlayer: false, entity: bestEnt };
    }
    return null;
  }

  function faceDirection(guard, dirX, dirZ, dt) {
    const targetAngle = Math.atan2(dirX, dirZ);
    let diff = targetAngle - guard.mesh.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const step = TURN_SPEED * dt;
    if (Math.abs(diff) < step) {
      guard.mesh.rotation.y = targetAngle;
    } else {
      guard.mesh.rotation.y += Math.sign(diff) * step;
    }
  }

  function applyDamage(guard, amount) {
    if (guard.dead) return 0;
    const reduced = amount * (1 - ARMOR_REDUCTION);
    guard.hp -= reduced;
    if (guard.hp <= 0) {
      killGuard(guard);
    }
    return reduced;
  }

  function killGuard(guard) {
    guard.dead = true;
    guard.mesh.visible = false;
    if (guard.telegraph) guard.telegraph.visible = false;
    if (window.Entities && window.Entities.onEnemyKilled) {
      window.Entities.onEnemyKilled(guard.mesh.position.x, guard.mesh.position.z, 'deer', 'guard');
    }
    if (window.BloodPools && window.BloodPools.spawn) {
      window.BloodPools.spawn(guard.mesh.position.x, guard.mesh.position.z, 1.5);
    }
    if (window.FX && window.FX.burst) {
      window.FX.burst(new THREE.Vector3().copy(guard.mesh.position).add(new THREE.Vector3(0, 1.2, 0)), new THREE.Vector3(0, 1, 0), 0x9a2222, 16);
    }
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(180, 0.35, 'sawtooth', 0.35, 600);
    }
  }

  function doBash(guard, target) {
    const pos = guard.mesh.position;
    const flash = impacts[impactIdx];
    impactIdx = (impactIdx + 1) % impacts.length;
    flash.mesh.position.set(target.x, groundY(target.x, target.z) + 0.1, target.z);
    flash.mesh.scale.setScalar(0.5);
    flash.mesh.material.opacity = 0.9;
    flash.mesh.visible = true;
    flash.life = 0.4;
    flash.active = true;

    for (let i = 0; i < 8; i++) {
      const d = dustPool[dustIdx];
      dustIdx = (dustIdx + 1) % dustPool.length;
      const ang = (i / 8) * Math.PI * 2;
      d.vx = Math.cos(ang) * 3;
      d.vy = 2 + Math.random() * 3;
      d.vz = Math.sin(ang) * 3;
      d.mesh.position.set(target.x, groundY(target.x, target.z) + 0.3, target.z);
      d.mesh.scale.setScalar(0.6 + Math.random() * 0.5);
      d.mesh.material.opacity = 0.6;
      d.mesh.visible = true;
      d.life = 0.4 + Math.random() * 0.2;
      d.active = true;
    }

    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(90, 0.3, 'sawtooth', 0.4, 400);
      window.Sound.tone(60, 0.4, 'square', 0.3, 200);
    }
    if (window.FX && window.FX.shake) window.FX.shake(0.15);

    if (target.isPlayer) {
      const cam = window.CAMERA;
      const knockDir = new THREE.Vector3(cam.position.x - pos.x, 0, cam.position.z - pos.z).normalize();
      if (window.Player && window.Player.applyKnockback) {
        window.Player.applyKnockback(knockDir.x * KNOCKBACK_FORCE, knockDir.z * KNOCKBACK_FORCE, KNOCKBACK_UP);
      }
      if (window.Manager && window.Manager.damagePlayer) {
        window.Manager.damagePlayer(BASH_DAMAGE, 'Guard Deer', null);
      }
    } else if (target.entity && target.entity.takeDamage) {
      const knockDir = new THREE.Vector3(target.entity.mesh.position.x - pos.x, 0, target.entity.mesh.position.z - pos.z).normalize();
      target.entity.vel.x += knockDir.x * KNOCKBACK_FORCE;
      target.entity.vel.z += knockDir.z * KNOCKBACK_FORCE;
      target.entity.vel.y = KNOCKBACK_UP;
      target.entity.takeDamage(BASH_DAMAGE, 'deer', 'guard');
    }
  }

  function updateGuard(guard, dt) {
    if (guard.dead) return;
    const target = findTarget(guard);
    const pos = guard.mesh.position;
    const gy = groundY(pos.x, pos.z);
    pos.y = gy;
    guard.bashCd -= dt;
    guard.strafeTimer -= dt;

    const aura = guard.mesh.userData.aura;
    const rim = guard.mesh.userData.rim;

    if (!target) {
      guard.phase = 'idle';
      aura.visible = false;
      if (guard.telegraph) guard.telegraph.visible = false;
      return;
    }

    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const dirX = dx / (dist || 1);
    const dirZ = dz / (dist || 1);

    if (guard.phase === 'pursue') {
      aura.visible = false;
      faceDirection(guard, dirX, dirZ, dt);

      if (dist < CHARGE_RANGE && dist > BASH_RANGE + 2 && guard.bashCd <= 0) {
        guard.phase = 'charging';
        guard.timer = 0;
        guard.chargeDir.set(dirX, 0, dirZ);
      } else if (dist <= BASH_RANGE + 2 && guard.bashCd <= 0) {
        guard.phase = 'bash-warmup';
        guard.warmupT = 0;
      } else {
        let moveX, moveZ;
        if (dist > CHARGE_RANGE) {
          moveX = dirX;
          moveZ = dirZ;
        } else {
          if (guard.strafeTimer <= 0) {
            guard.strafeDir *= -1;
            guard.strafeTimer = 1.5 + Math.random();
          }
          moveX = -dirZ * guard.strafeDir * 0.6 + dirX * 0.3;
          moveZ = dirX * guard.strafeDir * 0.6 + dirZ * 0.3;
        }
        const spd = SPEED * dt;
        const nx = pos.x + moveX * spd;
        const nz = pos.z + moveZ * spd;
        if (!window.collisionCheck || !window.collisionCheck(nx, nz)) {
          pos.x = nx;
          pos.z = nz;
        }
        guard.legPhase += dt * SPEED * 1.5;
      }
    }

    if (guard.phase === 'charging') {
      guard.timer += dt;
      aura.visible = true;
      aura.material.opacity = 0.3 + Math.sin(guard.timer * 20) * 0.15;
      const spd = CHARGE_SPEED * dt;
      const nx = pos.x + guard.chargeDir.x * spd;
      const nz = pos.z + guard.chargeDir.z * spd;
      if (!window.collisionCheck || !window.collisionCheck(nx, nz)) {
        pos.x = nx;
        pos.z = nz;
      } else {
        guard.phase = 'pursue';
        guard.bashCd = BASH_COOLDOWN * 0.5;
        aura.visible = false;
      }
      guard.legPhase += dt * CHARGE_SPEED * 1.2;

      const cdx = target.x - pos.x;
      const cdz = target.z - pos.z;
      const cdist = Math.sqrt(cdx * cdx + cdz * cdz);
      if (cdist <= BASH_RANGE) {
        guard.phase = 'bash-warmup';
        guard.warmupT = 0;
        aura.visible = false;
      }
      if (guard.timer > 2.0) {
        guard.phase = 'pursue';
        guard.bashCd = BASH_COOLDOWN;
        aura.visible = false;
      }
    }

    if (guard.phase === 'bash-warmup') {
      guard.warmupT += dt;
      faceDirection(guard, dirX, dirZ, dt);
      rim.material.color.setHSL(0.05, 1, 0.5 + guard.warmupT * 0.3);
      rim.material.opacity = 0.5 + guard.warmupT * 0.5;

      if (guard.telegraph) {
        guard.telegraph.visible = true;
        guard.telegraph.position.set(pos.x, gy + 0.08, pos.z);
        guard.telegraph.rotation.z = Math.atan2(dirX, dirZ);
        guard.telegraph.material.opacity = Math.min(0.8, guard.warmupT / BASH_WARMUP * 0.8);
      }

      if (guard.warmupT >= BASH_WARMUP) {
        const ndx = target.x - pos.x;
        const ndz = target.z - pos.z;
        const ndist = Math.sqrt(ndx * ndx + ndz * ndz);
        if (ndist <= BASH_RANGE + 1.5) {
          doBash(guard, target);
        }
        guard.phase = 'pursue';
        guard.bashCd = BASH_COOLDOWN;
        rim.material.opacity = 0.5;
        rim.material.color.setHex(0xff6622);
        if (guard.telegraph) guard.telegraph.visible = false;
      }
    }

    const legs = guard.mesh.userData.legs;
    if (legs) {
      const swing = Math.sin(guard.legPhase) * 0.3;
      if (legs[0]) legs[0].rotation.x = swing;
      if (legs[1]) legs[1].rotation.x = -swing;
      if (legs[2]) legs[2].rotation.x = -swing;
      if (legs[3]) legs[3].rotation.x = swing;
    }

    guard.mesh.position.y = gy + (guard.phase === 'charging' ? Math.abs(Math.sin(guard.legPhase * 2)) * 0.15 : 0);
  }

  function update(dt) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.spawnTimer = SPAWN_INTERVAL;
      if (state.guards.length < MAX_GUARDS) {
        const a = Math.random() * Math.PI * 2;
        const r = 35 + Math.random() * 60;
        spawn(Math.cos(a) * r, Math.sin(a) * r);
      }
    }

    for (let i = state.guards.length - 1; i >= 0; i--) {
      updateGuard(state.guards[i], dt);
      if (state.guards[i].dead) state.guards.splice(i, 1);
    }

    for (let i = 0; i < impacts.length; i++) {
      const imp = impacts[i];
      if (!imp.active) continue;
      imp.life -= dt;
      if (imp.life <= 0) {
        imp.mesh.visible = false;
        imp.active = false;
      } else {
        const t = imp.life / 0.4;
        imp.mesh.material.opacity = t * 0.9;
        imp.mesh.scale.setScalar(0.5 + (1 - t) * 2.5);
      }
    }

    for (let i = 0; i < dustPool.length; i++) {
      const d = dustPool[i];
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.mesh.visible = false;
        d.active = false;
        continue;
      }
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += d.vz * dt;
      d.vy -= 10 * dt;
      d.vx *= 0.94;
      d.vz *= 0.94;
      d.mesh.material.opacity = (d.life / 0.6) * 0.6;
      d.mesh.scale.setScalar(1 + (0.6 - d.life) * 1.5);
    }
  }

  function getGuards() { return state.guards; }

  function reset() {
    for (const g of state.guards) {
      if (g.mesh) g.mesh.visible = false;
      if (g.telegraph) g.telegraph.visible = false;
    }
    state.guards.length = 0;
    state.spawnTimer = SPAWN_FIRST;
    for (const imp of impacts) { imp.mesh.visible = false; imp.active = false; }
    for (const d of dustPool) { d.mesh.visible = false; d.active = false; }
  }

  function takeDamageAt(x, z, amount) {
    let hit = false;
    for (const g of state.guards) {
      if (g.dead) continue;
      const dx = g.mesh.position.x - x;
      const dz = g.mesh.position.z - z;
      if (dx * dx + dz * dz < 4) {
        applyDamage(g, amount);
        hit = true;
      }
    }
    return hit;
  }

  return { update, spawn, spawnFromBoss, getGuards, reset, takeDamageAt, state };
})();

if (typeof window !== 'undefined') window.GuardDeer = GuardDeer;