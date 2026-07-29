// apc.js — FORESTWAR autonomous APC: armored transport that patrols, rams, spawns reinforcements, and explodes
const THREE = window.THREE;
const SCENE = window.SCENE;
const APC = (() => {
  const APC_HP = 600;
  const PATROL_SPEED = 7;
  const CHARGE_SPEED = 16;
  const RAM_DAMAGE = 55;
  const RAM_RADIUS = 3.8;
  const PICK_WAYPOINT_DIST = 14;
  const PICK_NEW_DELAY = 1.2;
  const SPAWN_INTERVAL = 18;
  const SPAWN_PER_TICK = 2;
  const FLARE_DURATION = 6;
  const DEATH_EXPLOSION_RADIUS = 9;
  const DEATH_EXPLOSION_DAMAGE = 90;

  const apc = {
    mesh: null,
    hp: APC_HP,
    maxHp: APC_HP,
    alive: false,
    target: null,
    vel: new THREE.Vector3(),
    heading: 0,
    angularVel: 0,
    pickCooldown: 0,
    spawnTimer: 0,
    wheelSpin: 0,
    treadPhase: 0,
    waypointTimer: 0,
    boost: false,
    deathTimer: 0,
  };

  const WHEEL_GEO = new THREE.CylinderGeometry(0.7, 0.7, 0.5, 14);
  const WHEEL_MAT = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  const HULL_MAT = new THREE.MeshStandardMaterial({ color: 0x6a5a38, roughness: 0.6, metalness: 0.5 });
  const TURRET_MAT = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.6, metalness: 0.5 });
  const TRIM_MAT = new THREE.MeshStandardMaterial({ color: 0x3a3a28, roughness: 0.8 });
  const GLASS_MAT = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.2, metalness: 0.7, transparent: true, opacity: 0.5 });
  const LIGHT_MAT = new THREE.MeshBasicMaterial({ color: 0xffcc44 });
  const FLARE_GEO = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 6);
  const FLARE_MAT = new THREE.MeshBasicMaterial({ color: 0xff3322 });
  const SPARK_GEO = new THREE.SphereGeometry(0.18, 5, 4);

  const wheels = [];
  const sparks = [];
  const flares = [];

  function buildAPC() {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 5.8), HULL_MAT);
    hull.castShadow = true;
    hull.position.y = 1.5;
    g.add(hull);
    const slopeFront = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.0, 1.2), HULL_MAT);
    slopeFront.castShadow = true;
    slopeFront.position.set(0, 1.25, 3.0);
    slopeFront.rotation.x = -0.5;
    g.add(slopeFront);
    const turretBase = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.4, 12), TURRET_MAT);
    turretBase.castShadow = true;
    turretBase.position.set(0, 2.35, 0.5);
    g.add(turretBase);
    const turret = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 2.0), TURRET_MAT);
    turret.castShadow = true;
    turret.position.set(0, 2.8, 0.5);
    g.add(turret);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 8), TRIM_MAT);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 2.9, 2.0);
    g.add(barrel);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 2.2), HULL_MAT);
    roof.position.set(0, 2.15, 0.5);
    g.add(roof);
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.8), GLASS_MAT);
    windshield.position.set(0, 1.7, 2.7);
    windshield.rotation.x = -0.5;
    g.add(windshield);
    for (const sx of [-1, 1]) {
      const viewport = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), GLASS_MAT);
      viewport.position.set(sx * 0.8, 1.8, 2.5);
      viewport.rotation.x = -0.4;
      g.add(viewport);
    }
    for (const sx of [-1, 1]) {
      const headlight = new THREE.Mesh(new THREE.CircleGeometry(0.22, 10), LIGHT_MAT);
      headlight.position.set(sx * 0.85, 1.3, 3.55);
      g.add(headlight);
    }
    const wheelX = [-1, 1];
    const wheelZ = [-1.9, -0.6, 0.8, 2.1];
    for (const wx of wheelX) {
      for (const wz of wheelZ) {
        const w = new THREE.Mesh(WHEEL_GEO, WHEEL_MAT);
        w.rotation.z = Math.PI / 2;
        w.position.set(wx * 1.35, 0.7, wz);
        w.castShadow = true;
        g.add(w);
        wheels.push(w);
      }
    }
    const trackL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 4.6), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1 }));
    trackL.position.set(-1.35, 0.45, 0.1);
    g.add(trackL);
    const trackR = trackL.clone();
    trackR.position.x = 1.35;
    g.add(trackR);
    for (const sx of [-1, 1]) {
      for (const sz of [-2.5, 2.5]) {
        const stow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.8), TRIM_MAT);
        stow.position.set(sx * 1.2, 2.2, sz);
        g.add(stow);
      }
    }
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8, 4), TRIM_MAT);
    antenna.position.set(0.9, 3.2, -1.5);
    g.add(antenna);
    const teamLight = new THREE.PointLight(0xf0c98a, 0.8, 8, 2);
    teamLight.position.set(0, 3.0, 0.5);
    g.add(teamLight);
    g.userData.teamLight = teamLight;
    return g;
  }

  function spawn(x, z) {
    if (apc.alive) return false;
    if (!apc.mesh) apc.mesh = buildAPC();
    SCENE.add(apc.mesh);
    apc.mesh.visible = true;
    apc.alive = true;
    apc.hp = APC_HP;
    apc.spawnTimer = SPAWN_INTERVAL * 0.5;
    apc.waypointTimer = 0;
    apc.boost = false;
    apc.deathTimer = 0;
    apc.heading = Math.random() * Math.PI * 2;
    const gy = window.groundHeight ? window.groundHeight(x, z) : 0;
    apc.mesh.position.set(x, gy, z);
    apc.mesh.rotation.set(0, apc.heading, 0);
    pickWaypoint();
    if (window.FX) window.FX.message('ENEMY APC DEPLOYED', '#ff6644');
    if (window.Sound) {
      window.Sound.tone(80, 0.6, 'sawtooth', 0.35, 400);
      window.Sound.tone(160, 0.3, 'square', 0.2, 600);
    }
    return true;
  }

  function pickWaypoint() {
    const pts = window.Objectives && window.Objectives.state ? window.Objectives.state.points : null;
    if (pts && pts.length > 0) {
      let best = null, bestD = Infinity;
      for (const p of pts) {
        const d = (p.x - apc.mesh.position.x) ** 2 + (p.z - apc.mesh.position.z) ** 2;
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best) {
        apc.target = { x: best.x, z: best.z };
        return;
      }
    }
    const a = Math.random() * Math.PI * 2;
    const r = 30 + Math.random() * 70;
    apc.target = { x: apc.mesh.position.x + Math.cos(a) * r, z: apc.mesh.position.z + Math.sin(a) * r };
  }

  function trySteer(dt) {
    if (!apc.target) { pickWaypoint(); return; }
    const dx = apc.target.x - apc.mesh.position.x;
    const dz = apc.target.z - apc.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < PICK_WAYPOINT_DIST) {
      apc.waypointTimer -= dt;
      if (apc.waypointTimer <= 0) {
        pickWaypoint();
        apc.waypointTimer = PICK_NEW_DELAY;
      }
      apc.boost = false;
      return;
    }
    apc.waypointTimer = PICK_NEW_DELAY;
    const desired = Math.atan2(dx, dz);
    let diff = desired - apc.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.sign(diff) * Math.min(Math.abs(diff), 1.2) * dt;
    apc.heading += steer;
    const cam = window.CAMERA;
    if (cam) {
      const ddx = cam.position.x - apc.mesh.position.x;
      const ddz = cam.position.z - apc.mesh.position.z;
      if (ddx * ddx + ddz * ddz < 900) apc.boost = true;
    }
  }

  function ramCheck() {
    const enemies = window.Entities ? window.Entities.list : [];
    for (const e of enemies) {
      if (e.dead || e.team === 'deer') continue;
      const dx = e.mesh.position.x - apc.mesh.position.x;
      const dz = e.mesh.position.z - apc.mesh.position.z;
      if (dx * dx + dz * dz < RAM_RADIUS * RAM_RADIUS) {
        if (e.takeDamage) e.takeDamage(RAM_DAMAGE, { x: 0, y: 0, z: 0 });
        else if (e.hp !== undefined) {
          e.hp -= RAM_DAMAGE;
          if (e.hp <= 0 && e.die) e.die();
        }
      }
    }
  }

  function spawnReinforcements() {
    if (!window.Entities || !window.Entities.spawn) return;
    for (let i = 0; i < SPAWN_PER_TICK; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 4;
      window.Entities.spawn('deer', apc.mesh.position.x + Math.cos(a) * r, apc.mesh.position.z + Math.sin(a) * r);
    }
    spawnSpark(apc.mesh.position.x, apc.mesh.position.y + 1, apc.mesh.position.z, 0x88ff44);
    if (window.Sound) {
      window.Sound.tone(300, 0.12, 'square', 0.15, 1000);
      window.Sound.tone(500, 0.08, 'square', 0.1, 1400);
    }
  }

  function spawnSpark(x, y, z, color) {
    const s = new THREE.Mesh(SPARK_GEO, new THREE.MeshBasicMaterial({ color: color || 0xffaa22, transparent: true }));
    s.position.set(x, y, z);
    s.userData.life = 0.4;
    s.userData.maxLife = 0.4;
    s.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4);
    SCENE.add(s);
    sparks.push(s);
  }

  function takeDamage(amount, hitX, hitZ) {
    if (!apc.alive) return;
    apc.hp -= amount;
    const hx = hitX !== undefined ? hitX : apc.mesh.position.x;
    const hz = hitZ !== undefined ? hitZ : apc.mesh.position.z;
    spawnSpark(hx, apc.mesh.position.y + 1.2, hz, 0xff4400);
    if (window.Sound) window.Sound.tone(120, 0.08, 'sawtooth', 0.2, 500);
    if (apc.hp <= 0) die();
  }

  function die() {
    if (!apc.alive) return;
    apc.alive = false;
    apc.deathTimer = 0.1;
    const px = apc.mesh.position.x;
    const pz = apc.mesh.position.z;
    if (window.FX && window.FX.explosion) {
      window.FX.explosion(new THREE.Vector3(px, apc.mesh.position.y + 1.5, pz), DEATH_EXPLOSION_RADIUS);
    }
    const enemies = window.Entities ? window.Entities.list : [];
    for (const e of enemies) {
      if (e.dead || e.team === 'deer') continue;
      const dx = e.mesh.position.x - px;
      const dz = e.mesh.position.z - pz;
      if (dx * dx + dz * dz < DEATH_EXPLOSION_RADIUS * DEATH_EXPLOSION_RADIUS) {
        if (e.takeDamage) e.takeDamage(DEATH_EXPLOSION_DAMAGE, { x: 0, y: 1, z: 0 });
      }
    }
    if (window.CAMERA) {
      const dx = window.CAMERA.position.x - px;
      const dz = window.CAMERA.position.z - pz;
      if (dx * dx + dz * dz < DEATH_EXPLOSION_RADIUS * DEATH_EXPLOSION_RADIUS) {
        if (window.Manager && window.Manager.damagePlayer) window.Manager.damagePlayer(DEATH_EXPLOSION_DAMAGE * 0.6);
      }
    }
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(FLARE_GEO, FLARE_MAT.clone());
      const a = (i / 5) * Math.PI * 2;
      f.position.set(px + Math.cos(a) * 2, apc.mesh.position.y + 2, pz + Math.sin(a) * 2);
      f.userData.life = FLARE_DURATION;
      f.userData.maxLife = FLARE_DURATION;
      f.userData.vel = new THREE.Vector3(Math.cos(a) * 6, 14, Math.sin(a) * 6);
      SCENE.add(f);
      flares.push(f);
    }
    if (window.FX) window.FX.message('APC DESTROYED', '#9fe8a0');
    if (window.Sound) {
      window.Sound.tone(60, 0.8, 'sawtooth', 0.5, 300);
      window.Sound.tone(40, 1.2, 'sawtooth', 0.4, 200);
      if (window.Sound.explosion) window.Sound.explosion();
    }
  }

  function update(dt) {
    if (apc.alive && apc.mesh) {
      trySteer(dt);
      const speed = apc.boost ? CHARGE_SPEED : PATROL_SPEED;
      apc.mesh.position.x += Math.sin(apc.heading) * speed * dt;
      apc.mesh.position.z += Math.cos(apc.heading) * speed * dt;
      apc.mesh.rotation.y = apc.heading;
      const gy = window.groundHeight ? window.groundHeight(apc.mesh.position.x, apc.mesh.position.z) : 0;
      apc.mesh.position.y = gy;
      apc.wheelSpin += speed * dt * 2;
      for (const w of wheels) w.rotation.x = apc.wheelSpin;
      ramCheck();
      apc.spawnTimer -= dt;
      if (apc.spawnTimer <= 0) {
        spawnReinforcements();
        apc.spawnTimer = SPAWN_INTERVAL;
      }
      if (Math.random() < 0.02) {
        spawnSpark(
          apc.mesh.position.x + (Math.random() - 0.5) * 2,
          apc.mesh.position.y + 0.8 + Math.random() * 1.5,
          apc.mesh.position.z + (Math.random() - 0.5) * 2,
          0x888888
        );
      }
    }
    if (!apc.alive && apc.mesh && apc.deathTimer > 0) {
      apc.deathTimer -= dt;
      if (apc.deathTimer <= 0) {
        apc.mesh.visible = false;
        SCENE.remove(apc.mesh);
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.userData.life -= dt;
      if (s.userData.life <= 0) {
        SCENE.remove(s);
        sparks.splice(i, 1);
        continue;
      }
      s.userData.vel.y -= 10 * dt;
      s.position.addScaledVector(s.userData.vel, dt);
      s.material.opacity = s.userData.life / s.userData.maxLife;
    }
    for (let i = flares.length - 1; i >= 0; i--) {
      const f = flares[i];
      f.userData.life -= dt;
      if (f.userData.life <= 0) {
        SCENE.remove(f);
        flares.splice(i, 1);
        continue;
      }
      f.userData.vel.y -= 8 * dt;
      f.position.addScaledVector(f.userData.vel, dt);
      const gy = window.groundHeight ? window.groundHeight(f.position.x, f.position.z) : 0;
      if (f.position.y < gy + 0.3) {
        f.position.y = gy + 0.3;
        f.userData.vel.set(0, 0, 0);
      }
      f.material.opacity = Math.min(1, f.userData.life / 1.5);
      f.rotation.y += dt * 4;
    }
  }

  function getState() {
    return { alive: apc.alive, hp: apc.hp, maxHp: apc.maxHp, x: apc.mesh ? apc.mesh.position.x : 0, z: apc.mesh ? apc.mesh.position.z : 0 };
  }

  function reset() {
    if (apc.mesh) {
      SCENE.remove(apc.mesh);
      apc.mesh.visible = false;
    }
    apc.alive = false;
    apc.hp = 0;
    apc.target = null;
    for (const s of sparks) SCENE.remove(s);
    sparks.length = 0;
    for (const f of flares) SCENE.remove(f);
    flares.length = 0;
  }

  return { spawn, update, takeDamage, getState, reset, state: apc };
})();
window.APC = APC;