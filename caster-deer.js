// caster-deer.js — FORESTWAR elite deer caster: ranged poison-orb attacker with a death nova
const THREE = window.THREE;
const SCENE = window.SCENE;
const CasterDeer = (() => {
  const MAX_CASTERS = 4;
  const SPAWN_FIRST = 55;
  const SPAWN_INTERVAL = 65;
  const HEALTH = 130;
  const SPEED = 4.5;
  const MAINTAIN_DIST = 24;
  const REPOSITION_RANGE = 5;
  const ORB_SPEED = 30;
  const ORB_DAMAGE = 28;
  const ORB_RADIUS = 2.5;
  const ORB_LIFE = 2.5;
  const FIRE_RATE = 1.8;
  const NOVA_RADIUS = 6;
  const NOVA_DAMAGE = 45;
  const NOVA_DOT_DPS = 8;
  const NOVA_DOT_DURATION = 4;
  const POOL_SIZE = 24;
  const NOVA_RING_LIFE = 0.6;

  const state = {
    casters: [],
    spawnTimer: SPAWN_FIRST,
  };

  const BODY_GEO = new THREE.CapsuleGeometry(0.3, 1.0, 4, 8);
  const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x2a6628, roughness: 0.7, emissive: 0x0a2208, emissiveIntensity: 0.5 });
  const HEAD_GEO = new THREE.SphereGeometry(0.24, 10, 8);
  const ANTLER_GEO = new THREE.ConeGeometry(0.06, 0.7, 4);
  const ANTLER_MAT = new THREE.MeshStandardMaterial({ color: 0x55cc44, roughness: 0.4, emissive: 0x226611, emissiveIntensity: 0.7 });
  const EYE_GEO = new THREE.SphereGeometry(0.08, 6, 5);
  const EYE_MAT = new THREE.MeshBasicMaterial({ color: 0x66ff44 });
  const CRYSTAL_GEO = new THREE.OctahedronGeometry(0.14, 0);
  const CRYSTAL_MAT = new THREE.MeshBasicMaterial({ color: 0x44ff22, transparent: true, opacity: 0.85 });
  const AURA_MAT = new THREE.MeshBasicMaterial({ color: 0x33aa22, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false });

  const ORB_GEO = new THREE.SphereGeometry(0.22, 8, 6);
  const ORB_MAT = new THREE.MeshBasicMaterial({ color: 0x66ff22, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const ORB_GLOW_GEO = new THREE.SphereGeometry(0.4, 8, 6);
  const ORB_GLOW_MAT = new THREE.MeshBasicMaterial({ color: 0x44cc11, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const TRAIL_GEO = new THREE.SphereGeometry(0.15, 5, 4);
  const TRAIL_MAT = new THREE.MeshBasicMaterial({ color: 0x55ee22, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });

  const NOVA_GEO = new THREE.RingGeometry(0.5, 1.0, 32);
  const NOVA_MAT = new THREE.MeshBasicMaterial({ color: 0x66ff33, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const SPARK_GEO = new THREE.SphereGeometry(0.16, 5, 4);
  const SPARK_MAT = new THREE.MeshBasicMaterial({ color: 0x88ff44, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });

  const orbs = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const mesh = new THREE.Mesh(ORB_GEO, ORB_MAT.clone());
    mesh.visible = false;
    mesh.frustumCulled = false;
    SCENE.add(mesh);
    const glow = new THREE.Mesh(ORB_GLOW_GEO, ORB_GLOW_MAT.clone());
    glow.visible = false;
    glow.frustumCulled = false;
    SCENE.add(glow);
    orbs.push({ mesh, glow, vel: new THREE.Vector3(), life: 0, active: false, trailTimer: 0 });
  }
  let orbIdx = 0;

  const trails = [];
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(TRAIL_GEO, TRAIL_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    trails.push({ mesh: m, life: 0, maxLife: 0.4, active: false });
  }
  let trailIdx = 0;

  const novas = [];
  for (let i = 0; i < 8; i++) {
    const ring = new THREE.Mesh(NOVA_GEO, NOVA_MAT.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    ring.frustumCulled = false;
    SCENE.add(ring);
    novas.push({ ring, life: 0, active: false });
  }
  let novaIdx = 0;

  const sparks = [];
  for (let i = 0; i < 30; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vy: 0, active: false });
  }
  let sparkIdx = 0;

  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function buildMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(BODY_GEO, BODY_MAT);
    body.castShadow = true;
    body.position.y = 1.0;
    g.add(body);
    const head = new THREE.Mesh(HEAD_GEO, BODY_MAT);
    head.position.set(0, 1.6, 0.3);
    head.castShadow = true;
    g.add(head);
    for (const sx of [-1, 1]) {
      const ant = new THREE.Mesh(ANTLER_GEO, ANTLER_MAT);
      ant.position.set(sx * 0.14, 1.95, 0.3);
      ant.rotation.z = sx * 0.55;
      g.add(ant);
    }
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(EYE_GEO, EYE_MAT.clone());
      eye.position.set(sx * 0.14, 1.64, 0.48);
      g.add(eye);
    }
    const crystal = new THREE.Mesh(CRYSTAL_GEO, CRYSTAL_MAT.clone());
    crystal.position.set(0, 1.9, 0.3);
    crystal.userData.bob = Math.random() * Math.PI * 2;
    g.add(crystal);
    g.userData.crystal = crystal;
    const aura = new THREE.Mesh(new THREE.SphereGeometry(1.0, 8, 6), AURA_MAT.clone());
    aura.position.y = 1.0;
    aura.visible = false;
    g.add(aura);
    g.userData.aura = aura;
    return g;
  }

  function spawnCaster() {
    if (state.casters.length >= MAX_CASTERS) return;
    const cam = window.CAMERA;
    if (!cam) return;
    const a = Math.random() * Math.PI * 2;
    const r = 40 + Math.random() * 50;
    const x = cam.position.x + Math.cos(a) * r;
    const z = cam.position.z + Math.sin(a) * r;
    const mesh = buildMesh();
    mesh.position.set(x, groundY(x, z), z);
    SCENE.add(mesh);
    const buff = (window.Entities && window.Entities.buffDeer) ? window.Entities.buffDeer : 1;
    const bmMult = (window.BloodMoon && window.BloodMoon.state && window.BloodMoon.state.buffing) ? 1.35 : 1;
    state.casters.push({
      mesh, hp: HEALTH * buff, maxHp: HEALTH * buff, fireCd: FIRE_RATE * 0.5,
      repositionCd: 0, dead: false, speed: SPEED, dmgMult: buff * bmMult,
    });
  }

  function getPlayer() {
    const cam = window.CAMERA;
    if (!cam) return null;
    const ms = window.Manager && window.Manager.state;
    if (!ms || !ms.playerAlive) return null;
    return { x: cam.position.x, y: cam.position.y, z: cam.position.z };
  }

  function getTarget(c) {
    const pt = window.Manager && window.Manager.state ? window.Manager.state.playerTeam : 'hunter';
    const ents = window.Entities && window.Entities.list ? window.Entities.list : [];
    const cam = window.CAMERA;
    let best = null, bestD = MAINTAIN_DIST * 3;
    if (cam && window.Manager.state.playerAlive && pt !== 'deer') {
      const d = Math.hypot(cam.position.x - c.mesh.position.x, cam.position.z - c.mesh.position.z);
      if (d < bestD) { bestD = d; best = { x: cam.position.x, y: cam.position.y, z: cam.position.z }; }
    }
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.team === 'deer' || e.team === 'none') continue;
      const ep = e.mesh.position;
      const d = Math.hypot(ep.x - c.mesh.position.x, ep.z - c.mesh.position.z);
      if (d < bestD) { bestD = d; best = { x: ep.x, y: ep.y + 1, z: ep.z }; }
    }
    return best;
  }

  function fireOrb(c, target) {
    const slot = orbs[orbIdx];
    orbIdx = (orbIdx + 1) % POOL_SIZE;
    const mp = c.mesh.position;
    slot.mesh.position.set(mp.x, mp.y + 1.5, mp.z);
    slot.glow.position.copy(slot.mesh.position);
    _v.set(target.x - mp.x, (target.y + 1.0) - (mp.y + 1.5), target.z - mp.z);
    const dist = _v.length();
    _v.normalize();
    slot.vel.copy(_v).multiplyScalar(ORB_SPEED);
    slot.life = ORB_LIFE;
    slot.active = true;
    slot.mesh.visible = true;
    slot.glow.visible = true;
    slot.trailTimer = 0;
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(180, 0.15, 'sine', 0.2, 1200);
      window.Sound.tone(360, 0.1, 'triangle', 0.12, 1600);
    }
  }

  function spawnTrail(x, y, z) {
    const t = trails[trailIdx];
    trailIdx = (trailIdx + 1) % trails.length;
    t.mesh.position.set(x, y, z);
    const s = 0.7 + Math.random() * 0.4;
    t.mesh.scale.setScalar(s);
    t.life = t.maxLife;
    t.active = true;
    t.mesh.visible = true;
  }

  function detonateOrb(orb, x, y, z) {
    orb.active = false;
    orb.mesh.visible = false;
    orb.glow.visible = false;
    const ents = window.Entities && window.Entities.list ? window.Entities.list : [];
    const cam = window.CAMERA;
    const ms = window.Manager && window.Manager.state;
    if (cam && ms && ms.playerAlive) {
      const d = Math.hypot(cam.position.x - x, cam.position.y - y + 1, cam.position.z - z);
      if (d < ORB_RADIUS && window.Player && Player.damage) {
        Player.damage(ORB_DAMAGE);
      }
    }
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.team === 'deer' || e.team === 'none') continue;
      const ep = e.mesh.position;
      const d = Math.hypot(ep.x - x, ep.y + 1 - y, ep.z - z);
      if (d < ORB_RADIUS && window.Entities.damage) {
        window.Entities.damage(e, ORB_DAMAGE, 'poison');
      }
    }
    for (let i = 0; i < 6; i++) {
      const s = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % sparks.length;
      s.mesh.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 3;
      s.mesh.position.x += (Math.random() - 0.5) * 0.4;
      s.mesh.position.y += (Math.random() - 0.5) * 0.4;
      s.mesh.position.z += (Math.random() - 0.5) * 0.4;
      s.life = 0.4 + Math.random() * 0.2;
      s.vy = 1.5 + Math.random() * 2.5;
      s.active = true;
      s.mesh.visible = true;
      s.mesh.userData.vx = Math.cos(a) * sp;
      s.mesh.userData.vz = Math.sin(a) * sp;
    }
    if (window.FX && window.FX.burst) {
      window.FX.burst(_v.set(x, y, z), _v2.set(0, 1, 0), 0x66ff22, 8);
    }
  }

  function triggerNova(x, y, z, dmgMult) {
    const n = novas[novaIdx];
    novaIdx = (novaIdx + 1) % novas.length;
    n.ring.position.set(x, groundY(x, z) + 0.1, z);
    n.ring.scale.setScalar(1);
    n.ring.material.opacity = 0.8;
    n.life = NOVA_RING_LIFE;
    n.active = true;
    n.ring.visible = true;
    const ents = window.Entities && window.Entities.list ? window.Entities.list : [];
    const cam = window.CAMERA;
    const ms = window.Manager && window.Manager.state;
    const dmg = NOVA_DAMAGE * dmgMult;
    if (cam && ms && ms.playerAlive) {
      const d = Math.hypot(cam.position.x - x, cam.position.z - z);
      if (d < NOVA_RADIUS && window.Player && Player.damage) {
        Player.damage(dmg * 0.6);
      }
    }
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.team === 'deer' || e.team === 'none') continue;
      const ep = e.mesh.position;
      const d = Math.hypot(ep.x - x, ep.z - z);
      if (d < NOVA_RADIUS && window.Entities.damage) {
        window.Entities.damage(e, dmg, 'poison');
      }
    }
    for (let i = 0; i < 14; i++) {
      const s = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % sparks.length;
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
      const sp = 5 + Math.random() * 4;
      s.mesh.position.set(x, y + 0.5, z);
      s.life = 0.5 + Math.random() * 0.3;
      s.vy = 2 + Math.random() * 3;
      s.active = true;
      s.mesh.visible = true;
      s.mesh.userData.vx = Math.cos(a) * sp;
      s.mesh.userData.vz = Math.sin(a) * sp;
    }
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(100, 0.4, 'sawtooth', 0.3, 600);
      window.Sound.tone(200, 0.3, 'square', 0.15, 1000);
    }
  }

  function damageCaster(c, amount) {
    c.hp -= amount;
    if (c.mesh.userData.aura) {
      c.mesh.userData.aura.material.opacity = 0.5;
    }
    if (c.hp <= 0 && !c.dead) {
      c.dead = true;
      const mp = c.mesh.position;
      triggerNova(mp.x, mp.y, mp.z, c.dmgMult);
      if (window.FX && window.FX.bloodBurst) {
        window.FX.bloodBurst(_v.copy(mp).add(_v2.set(0, 1, 0)), _v2.set(0, 1, 0));
      }
      if (window.BloodPools && window.BloodPools.spawn) {
        window.BloodPools.spawn(mp.x, mp.z, 1.5);
      }
      if (window.Manager && window.Manager.addScore) {
        window.Manager.addScore('hunter', 15);
        window.Manager.state.kills.deer++;
      }
      if (window.Killstreak && window.Killstreak.addKill) window.Killstreak.addKill();
      if (window.KillPanel && window.KillPanel.reportKill) {
        window.KillPanel.reportKill({ victim: 'Caster Deer', method: 'ability', team: 'deer' });
      }
    }
  }

  function updateCaster(c, dt) {
    if (c.dead) {
      c.mesh.position.y -= dt * 2;
      c.mesh.rotation.z += dt * 3;
      return;
    }
    const target = getTarget(c);
    const mp = c.mesh.position;
    if (target) {
      const dx = target.x - mp.x;
      const dz = target.z - mp.z;
      const dist = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, dz);
      c.mesh.rotation.y = ang;
      c.fireCd -= dt;
      if (dist > MAINTAIN_DIST + REPOSITION_RANGE) {
        const sp = c.speed * dt;
        const nx = mp.x + Math.sin(ang) * sp;
        const nz = mp.z + Math.cos(ang) * sp;
        mp.x = nx;
        mp.z = nz;
      } else if (dist < MAINTAIN_DIST - REPOSITION_RANGE) {
        const sp = c.speed * 0.7 * dt;
        mp.x -= Math.sin(ang) * sp;
        mp.z -= Math.cos(ang) * sp;
      } else {
        const strafeAng = ang + Math.PI / 2;
        mp.x += Math.sin(strafeAng) * c.speed * 0.4 * dt;
        mp.z += Math.cos(strafeAng) * c.speed * 0.4 * dt;
      }
      if (c.fireCd <= 0 && dist < MAINTAIN_DIST * 2) {
        c.fireCd = FIRE_RATE;
        fireOrb(c, target);
      }
    } else {
      c.fireCd = Math.max(0.5, c.fireCd - dt);
    }
    mp.y = groundY(mp.x, mp.z);
    if (c.mesh.userData.crystal) {
      c.mesh.userData.crystal.userData.bob += dt * 3;
      c.mesh.userData.crystal.position.y = 1.9 + Math.sin(c.mesh.userData.crystal.userData.bob) * 0.12;
      c.mesh.userData.crystal.rotation.y += dt * 2;
    }
    if (c.mesh.userData.aura && c.mesh.userData.aura.material.opacity > 0) {
      c.mesh.userData.aura.material.opacity -= dt * 1.5;
    }
    const bm = window.BloodMoon && window.BloodMoon.state && window.BloodMoon.state.buffing;
    if (c.mesh.userData.aura) {
      c.mesh.userData.aura.visible = !!bm;
      if (bm) c.mesh.userData.aura.material.opacity = 0.25 + Math.sin(performance.now() * 0.006) * 0.1;
    }
  }

  function update(dt) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.spawnTimer = SPAWN_INTERVAL;
      spawnCaster();
    }
    for (let i = state.casters.length - 1; i >= 0; i--) {
      const c = state.casters[i];
      updateCaster(c, dt);
      if (c.dead && c.mesh.position.y < -3) {
        SCENE.remove(c.mesh);
        state.casters.splice(i, 1);
      }
    }
    for (let i = 0; i < orbs.length; i++) {
      const orb = orbs[i];
      if (!orb.active) continue;
      orb.life -= dt;
      if (orb.life <= 0) {
        orb.active = false;
        orb.mesh.visible = false;
        orb.glow.visible = false;
        continue;
      }
      orb.vel.y -= 9 * dt;
      orb.mesh.position.addScaledVector(orb.vel, dt);
      orb.glow.position.copy(orb.mesh.position);
      const gp = groundY(orb.mesh.position.x, orb.mesh.position.z);
      if (orb.mesh.position.y <= gp + 0.1) {
        detonateOrb(orb, orb.mesh.position.x, orb.mesh.position.y, orb.mesh.position.z);
        continue;
      }
      orb.trailTimer -= dt;
      if (orb.trailTimer <= 0) {
        orb.trailTimer = 0.03;
        spawnTrail(orb.mesh.position.x, orb.mesh.position.y, orb.mesh.position.z);
      }
      const cam = window.CAMERA;
      const ms = window.Manager && window.Manager.state;
      if (cam && ms && ms.playerAlive) {
        const d = Math.hypot(cam.position.x - orb.mesh.position.x, cam.position.y - orb.mesh.position.y, cam.position.z - orb.mesh.position.z);
        if (d < 0.8) {
          detonateOrb(orb, orb.mesh.position.x, orb.mesh.position.y, orb.mesh.position.z);
          continue;
        }
      }
      const ents = window.Entities && window.Entities.list ? window.Entities.list : [];
      for (let j = 0; j < ents.length; j++) {
        const e = ents[j];
        if (e.dead || e.team === 'deer' || e.team === 'none') continue;
        const ep = e.mesh.position;
        const d = Math.hypot(ep.x - orb.mesh.position.x, (ep.y + 1) - orb.mesh.position.y, ep.z - orb.mesh.position.z);
        if (d < 0.9) {
          detonateOrb(orb, orb.mesh.position.x, orb.mesh.position.y, orb.mesh.position.z);
          break;
        }
      }
    }
    for (let i = 0; i < trails.length; i++) {
      const t = trails[i];
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.active = false;
        t.mesh.visible = false;
        continue;
      }
      t.mesh.material.opacity = (t.life / t.maxLife) * 0.5;
      t.mesh.scale.setScalar(t.life / t.maxLife);
    }
    for (let i = 0; i < novas.length; i++) {
      const n = novas[i];
      if (!n.active) continue;
      n.life -= dt;
      if (n.life <= 0) {
        n.active = false;
        n.ring.visible = false;
        continue;
      }
      const prog = 1 - n.life / NOVA_RING_LIFE;
      n.ring.scale.setScalar(1 + prog * NOVA_RADIUS);
      n.ring.material.opacity = (n.life / NOVA_RING_LIFE) * 0.8;
    }
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.mesh.position.x += (s.mesh.userData.vx || 0) * dt;
      s.mesh.position.z += (s.mesh.userData.vz || 0) * dt;
      s.mesh.position.y += s.vy * dt;
      s.vy -= 8 * dt;
      s.mesh.material.opacity = Math.min(1, s.life * 3);
      s.mesh.scale.setScalar(Math.max(0.3, s.life * 2));
    }
  }

  function reset() {
    for (const c of state.casters) {
      SCENE.remove(c.mesh);
    }
    state.casters.length = 0;
    state.spawnTimer = SPAWN_FIRST;
    for (const o of orbs) { o.active = false; o.mesh.visible = false; o.glow.visible = false; }
    for (const t of trails) { t.active = false; t.mesh.visible = false; }
    for (const n of novas) { n.active = false; n.ring.visible = false; }
    for (const s of sparks) { s.active = false; s.mesh.visible = false; }
  }

  function takeDamage(originX, originZ, amount) {
    for (const c of state.casters) {
      if (c.dead) continue;
      const d = Math.hypot(c.mesh.position.x - originX, c.mesh.position.z - originZ);
      if (d < 6) damageCaster(c, amount);
    }
  }

  return { state, update, reset, damageCaster, takeDamage, spawnCaster };
})();
window.CasterDeer = CasterDeer;