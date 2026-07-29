// airstrike.js — FORESTWAR tactical airstrike: lase a ground target, jet strafes the zone dropping a line of bombs
const THREE = window.THREE;
const SCENE = window.SCENE;
const Airstrike = (() => {
  const STAMINA_COST = 45;
  const COOLDOWN_MAX = 28;
  const JET_ALT = 55;
  const JET_SPEED = 85;
  const BOMB_COUNT = 6;
  const BOMB_SPACING = 5;
  const BOMB_DAMAGE = 95;
  const BOMB_RADIUS = 6;
  const BOMB_FALL_TIME = 1.4;
  const BEACON_LIFE = 1.2;
  const JET_APPROACH = 2.5;
  const JET_DEPART = 2.0;
  const SPARK_POOL = 40;
  const SPARK_LIFE = 0.5;
  const SMOKE_POOL = 24;
  const SMOKE_LIFE = 1.6;
  const CRATER_COUNT = BOMB_COUNT + 2;
  const KILLS_COST = 7;

  const state = {
    cd: 0,
    ready: true,
    phase: 'idle',
    timer: 0,
    center: new THREE.Vector3(),
    runDir: new THREE.Vector3(),
    jetPos: new THREE.Vector3(),
    jetMesh: null,
    bombTimer: 0,
    bombsDropped: 0,
    bombs: [],
    beaconMesh: null,
    beaconT: 0,
  };

  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const _ray = new THREE.Raycaster();

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  // ---- Jet mesh ----------------------------------------------------------
  const FUSE_GEO = new THREE.CapsuleGeometry(0.45, 3.0, 4, 8);
  FUSE_GEO.rotateZ(Math.PI / 2);
  const FUSE_MAT = new THREE.MeshStandardMaterial({ color: 0x3a3a35, roughness: 0.5, metalness: 0.7 });
  const WING_GEO = new THREE.BoxGeometry(6.5, 0.12, 1.3);
  const WING_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2a25, roughness: 0.6, metalness: 0.6 });
  const TAIL_FIN_GEO = new THREE.BoxGeometry(0.12, 1.4, 0.9);
  const TAIL_PLANE_GEO = new THREE.BoxGeometry(2.8, 0.1, 0.8);
  const CANOPY_GEO = new THREE.SphereGeometry(0.35, 8, 6);
  const CANOPY_MAT = new THREE.MeshStandardMaterial({ color: 0x113355, roughness: 0.2, metalness: 0.9, transparent: true, opacity: 0.7 });
  const ENGINE_GEO = new THREE.CylinderGeometry(0.2, 0.15, 0.5, 6);
  ENGINE_GEO.rotateZ(Math.PI / 2);
  const ENGINE_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1a18, roughness: 0.4, metalness: 0.85 });
  const EXHAUST_GEO = new THREE.ConeGeometry(0.18, 1.2, 6);
  EXHAUST_GEO.rotateZ(Math.PI / 2);
  const EXHAUST_MAT = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });

  function buildJet() {
    const g = new THREE.Group();
    const fuse = new THREE.Mesh(FUSE_GEO, FUSE_MAT);
    fuse.castShadow = true;
    g.add(fuse);
    const wing = new THREE.Mesh(WING_GEO, WING_MAT);
    wing.castShadow = true;
    g.add(wing);
    const tailFin = new THREE.Mesh(TAIL_FIN_GEO, WING_MAT);
    tailFin.position.set(-2.0, 0.6, 0);
    g.add(tailFin);
    const tailPlane = new THREE.Mesh(TAIL_PLANE_GEO, WING_MAT);
    tailPlane.position.set(-2.0, 0, 0);
    g.add(tailPlane);
    const canopy = new THREE.Mesh(CANOPY_GEO, CANOPY_MAT);
    canopy.position.set(0.6, 0.3, 0);
    g.add(canopy);
    for (const sx of [-1, 1]) {
      const eng = new THREE.Mesh(ENGINE_GEO, ENGINE_MAT);
      eng.position.set(-1.8, 0, sx * 0.7);
      g.add(eng);
      const ex = new THREE.Mesh(EXHAUST_GEO, EXHAUST_MAT);
      ex.position.set(-2.5, 0, sx * 0.7);
      g.add(ex);
    }
    g.visible = false;
    SCENE.add(g);
    return g;
  }

  // ---- Beacon -------------------------------------------------------------
  const BEACON_GEO = new THREE.RingGeometry(0.6, 1.0, 24);
  const BEACON_MAT = new THREE.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const BEACON_CROSS_GEO = new THREE.BoxGeometry(2.2, 0.06, 0.06);

  function buildBeacon() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(BEACON_GEO, BEACON_MAT.clone());
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    const c1 = new THREE.Mesh(BEACON_CROSS_GEO, BEACON_MAT.clone());
    g.add(c1);
    const c2 = new THREE.Mesh(BEACON_CROSS_GEO, BEACON_MAT.clone());
    c2.rotation.y = Math.PI / 2;
    g.add(c2);
    g.visible = false;
    SCENE.add(g);
    return g;
  }

  // ---- Bombs --------------------------------------------------------------
  const BOMB_GEO = new THREE.CylinderGeometry(0.18, 0.1, 0.6, 6);
  BOMB_GEO.rotateX(Math.PI / 2);
  const BOMB_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2a22, roughness: 0.5, metalness: 0.6 });
  const BOMB_TAIL_GEO = new THREE.BoxGeometry(0.4, 0.3, 0.03);

  // ---- Explosion effects --------------------------------------------------
  const FLASH_GEO = new THREE.SphereGeometry(1, 10, 8);
  const FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const SHOCK_GEO = new THREE.RingGeometry(0.5, 1.0, 32);
  const SHOCK_MAT = new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });

  const sparks = [];
  for (let i = 0; i < SPARK_POOL; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.15, 4, 3), new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, active: false });
  }
  let sparkIdx = 0;

  const smokes = [];
  for (let i = 0; i < SMOKE_POOL; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 5, 4), new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    smokes.push({ mesh: m, life: 0, maxLife: SMOKE_LIFE, vx: 0, vy: 0, vz: 0, active: false });
  }
  let smokeIdx = 0;

  const craters = [];
  const CRATER_GEO = new THREE.CircleGeometry(1, 12);
  for (let i = 0; i < CRATER_COUNT; i++) {
    const m = new THREE.Mesh(CRATER_GEO, new THREE.MeshBasicMaterial({ color: 0x1a1008, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    SCENE.add(m);
    craters.push(m);
  }
  let craterIdx = 0;

  function spawnSparks(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      const s = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % SPARK_POOL;
      const a = Math.random() * Math.PI * 2;
      const up = 0.5 + Math.random();
      const spd = 6 + Math.random() * 10;
      s.vx = Math.cos(a) * spd;
      s.vy = up * spd;
      s.vz = Math.sin(a) * spd;
      s.life = SPARK_LIFE * (0.6 + Math.random() * 0.5);
      s.mesh.position.set(x, y, z);
      s.mesh.scale.setScalar(0.5 + Math.random());
      s.mesh.material.opacity = 1;
      s.mesh.visible = true;
      s.active = true;
    }
  }

  function spawnSmoke(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      const s = smokes[smokeIdx];
      smokeIdx = (smokeIdx + 1) % SMOKE_POOL;
      s.vx = (Math.random() - 0.5) * 2;
      s.vy = 1.5 + Math.random() * 2;
      s.vz = (Math.random() - 0.5) * 2;
      s.life = SMOKE_LIFE * (0.7 + Math.random() * 0.5);
      s.maxLife = s.life;
      s.mesh.position.set(x, y + 0.3, z);
      s.mesh.scale.setScalar(0.5 + Math.random());
      s.mesh.material.opacity = 0.5;
      s.mesh.visible = true;
      s.active = true;
    }
  }

  function spawnCrater(x, z, radius) {
    const m = craters[craterIdx];
    craterIdx = (craterIdx + 1) % CRATER_COUNT;
    const gy = groundY(x, z) + 0.06;
    m.position.set(x, gy, z);
    m.scale.setScalar(radius * 0.8);
    m.rotation.z = Math.random() * Math.PI * 2;
    m.material.opacity = 0.75;
    m.visible = true;
  }

  function detonateBomb(x, y, z) {
    spawnSparks(x, y, z, 10);
    spawnSmoke(x, y, z, 3);
    spawnCrater(x, z, BOMB_RADIUS);
    if (window.Craters) window.Craters.create(x, z, BOMB_RADIUS * 0.7);
    if (window.BloodPools) window.BloodPools.spawn(x, z, 1.0);
    if (window.FireProp && window.FireProp.igniteArea) {
      window.FireProp.igniteArea(x, z, BOMB_RADIUS * 0.6);
    }
    const ents = window.Entities && window.Entities.list ? window.Entities.list : [];
    const cam = window.CAMERA;
    let camShake = 0;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead) continue;
      const dx = e.mesh.position.x - x;
      const dz = e.mesh.position.z - z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= BOMB_RADIUS) {
        const falloff = 1 - dist / BOMB_RADIUS;
        const dmg = BOMB_DAMAGE * (0.4 + falloff * 0.6);
        if (e.takeDamage) {
          const killed = e.takeDamage(dmg, 'explosion');
          if (killed && e.team !== getPlayerTeam()) registerPlayerKill(e.team);
        }
      }
    }
    if (cam) {
      const cdx = cam.position.x - x;
      const cdz = cam.position.z - z;
      const cdist = Math.sqrt(cdx * cdx + cdz * cdz);
      if (cdist < 20) camShake = (1 - cdist / 20) * 0.25;
    }
    if (camShake > 0 && window.FX && window.FX.shake) window.FX.shake(camShake);
    if (window.Sound) {
      window.Sound.tone(60, 0.5, 'sawtooth', 0.4, 200);
      window.Sound.tone(40, 0.4, 'square', 0.3, 120);
    }
  }

  function getPlayerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function registerPlayerKill(victimTeam) {
    if (window.KillRewards && window.KillRewards.notify) window.KillRewards.notify(victimTeam);
  }

  function call() {
    if (!state.ready) {
      if (window.FX) window.FX.message('AIRSTRIKE RECHARGING', '#ff6644');
      return;
    }
    if (!hasKills()) {
      if (window.FX) window.FX.message('NOT ENOUGH KILLS — NEED ' + KILLS_COST, '#ff6644');
      return;
    }
    const player = window.Player;
    if (player && player.state && player.state.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('INSUFFICIENT STAMINA', '#ff6644');
      return;
    }
    if (player && player.state) {
      player.state.stamina -= STAMINA_COST;
      player.state.regenTimer = 1.5;
    }
    const cam = window.CAMERA;
    _v1.set(0, 0, -1);
    cam.getWorldDirection(_v1);
    _v1.y = 0;
    _v1.normalize();
    _ray.setFromCamera({ x: 0, y: 0 }, cam);
    if (!_ray.ray.intersectPlane(_ground, state.center)) return;
    state.center.y = groundY(state.center.x, state.center.z);
    const maxR = 100;
    const dist = Math.min(state.center.distanceTo(cam.position), maxR);
    state.center.copy(cam.position).addScaledVector(_v1, dist);
    state.center.y = groundY(state.center.x, state.center.z);
    state.runDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    state.ready = false;
    state.cd = COOLDOWN_MAX;
    state.phase = 'beacon';
    state.timer = BEACON_LIFE;
    state.beaconT = 0;
    consumeKills();
    if (state.beaconMesh) state.beaconMesh.visible = true;
    if (state.beaconMesh) {
      state.beaconMesh.position.copy(state.center);
      state.beaconMesh.position.y += 0.1;
    }
    if (window.FX) window.FX.message('AIRSTRIKE INBOUND', '#ff8833');
    if (window.Sound) {
      window.Sound.tone(300, 0.2, 'square', 0.2, 1000);
      window.Sound.tone(500, 0.15, 'square', 0.15, 1500);
    }
  }

  function launchJet() {
    state.phase = 'approach';
    state.timer = JET_APPROACH;
    state.bombTimer = 0.3;
    state.bombsDropped = 0;
    if (!state.jetMesh) state.jetMesh = buildJet();
    state.jetPos.copy(state.center).addScaledVector(state.runDir, -90);
    state.jetPos.y = JET_ALT;
    state.jetMesh.position.copy(state.jetPos);
    state.jetMesh.lookAt(state.center.x, JET_ALT, state.center.z);
    state.jetMesh.visible = true;
    if (window.Sound) {
      window.Sound.tone(80, 1.5, 'sawtooth', 0.3, 400);
    }
  }

  function spawnBomb(x, y, z) {
    const m = new THREE.Mesh(BOMB_GEO, BOMB_MAT);
    m.position.set(x, y, z);
    m.lookAt(x, 0, z + 1);
    SCENE.add(m);
    const tail = new THREE.Mesh(BOMB_TAIL_GEO, new THREE.MeshBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.5 }));
    tail.position.z = 0.35;
    m.add(tail);
    const flash = new THREE.Mesh(FLASH_GEO, FLASH_MAT.clone());
    flash.scale.setScalar(0.5);
    flash.visible = false;
    SCENE.add(flash);
    const shock = new THREE.Mesh(SHOCK_GEO, SHOCK_MAT.clone());
    shock.rotation.x = -Math.PI / 2;
    shock.visible = false;
    SCENE.add(shock);
    state.bombs.push({ mesh: m, flash, shock, fall: 0, startY: y, targetX: x, targetZ: z, detonated: false, flashT: 0 });
  }

  function startBombRun() {
    state.phase = 'bombing';
    state.bombTimer = 0;
    for (let i = 0; i < BOMB_COUNT; i++) {
      const offset = (i - (BOMB_COUNT - 1) / 2) * BOMB_SPACING;
      const bx = state.center.x + state.runDir.x * offset + (Math.random() - 0.5) * 1.5;
      const bz = state.center.z + state.runDir.z * offset + (Math.random() - 0.5) * 1.5;
      spawnBomb(bx, JET_ALT - 2, bz);
    }
  }

  function updateBeacon(dt) {
    state.timer -= dt;
    state.beaconT += dt;
    if (state.beaconMesh) {
      const pulse = 1 + Math.sin(state.beaconT * 8) * 0.15;
      state.beaconMesh.scale.setScalar(pulse);
      const fade = Math.max(0, state.timer / BEACON_LIFE);
      state.beaconMesh.children.forEach(c => { if (c.material) c.material.opacity = 0.7 * fade; });
      state.beaconMesh.rotation.y += dt * 2;
    }
    if (state.timer <= 0) {
      if (state.beaconMesh) state.beaconMesh.visible = false;
      launchJet();
    }
  }

  function updateJet(dt) {
    state.timer -= dt;
    if (state.phase === 'approach') {
      const t = 1 - state.timer / JET_APPROACH;
      state.jetPos.lerpVectors(
        _v1.copy(state.center).addScaledVector(state.runDir, -90).setY(JET_ALT),
        _v2.copy(state.center).addScaledVector(state.runDir, -10).setY(JET_ALT),
        t
      );
      state.jetMesh.position.copy(state.jetPos);
      state.jetMesh.lookAt(state.center.x, JET_ALT, state.center.z);
      if (state.timer <= 0) startBombRun();
    } else if (state.phase === 'bombing') {
      state.jetPos.addScaledVector(state.runDir, JET_SPEED * dt);
      state.jetMesh.position.copy(state.jetPos);
      state.bombTimer -= dt;
      if (state.bombsDropped < BOMB_COUNT && state.bombTimer <= 0) {
        state.bombTimer = BOMB_SPACING / JET_SPEED;
        state.bombsDropped++;
      }
      if (state.bombsDropped >= BOMB_COUNT && state.timer <= -0.5) {
        state.phase = 'depart';
        state.timer = JET_DEPART;
      }
    } else if (state.phase === 'depart') {
      state.jetPos.addScaledVector(state.runDir, JET_SPEED * dt);
      state.jetMesh.position.copy(state.jetPos);
      if (state.timer <= 0) {
        state.jetMesh.visible = false;
        state.phase = 'cleanup';
        state.timer = 2.0;
      }
    } else if (state.phase === 'cleanup') {
      if (state.timer <= 0) state.phase = 'idle';
    }
  }

  function updateBombs(dt) {
    for (let i = state.bombs.length - 1; i >= 0; i--) {
      const b = state.bombs[i];
      if (b.detonated) {
        b.flashT -= dt;
        if (b.flashT <= 0) {
          SCENE.remove(b.mesh);
          SCENE.remove(b.flash);
          SCENE.remove(b.shock);
          state.bombs.splice(i, 1);
        } else {
          const t = b.flashT / 0.3;
          b.flash.material.opacity = t * 0.9;
          b.flash.scale.setScalar(1 + (1 - t) * 3);
          b.shock.material.opacity = t * 0.6;
          b.shock.scale.setScalar(1 + (1 - t) * BOMB_RADIUS);
        }
        continue;
      }
      b.fall += dt;
      const frac = Math.min(1, b.fall / BOMB_FALL_TIME);
      b.mesh.position.y = b.startY * (1 - frac);
      b.mesh.rotation.x += dt * 3;
      if (frac >= 1) {
        b.detonated = true;
        b.flashT = 0.3;
        b.flash.position.set(b.targetX, groundY(b.targetX, b.targetZ) + 1, b.targetZ);
        b.flash.visible = true;
        b.shock.position.set(b.targetX, groundY(b.targetX, b.targetZ) + 0.1, b.targetZ);
        b.shock.visible = true;
        b.mesh.visible = false;
        detonateBomb(b.targetX, groundY(b.targetX, b.targetZ), b.targetZ);
      }
    }
  }

  function updateParticles(dt) {
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) { s.active = false; s.mesh.visible = false; continue; }
      s.vy -= 20 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.material.opacity = s.life / SPARK_LIFE;
      const sc = s.life / SPARK_LIFE;
      s.mesh.scale.setScalar(0.5 + sc);
    }
    for (let i = 0; i < smokes.length; i++) {
      const s = smokes[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) { s.active = false; s.mesh.visible = false; continue; }
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.material.opacity = (s.life / s.maxLife) * 0.5;
      const grow = 1 + (1 - s.life / s.maxLife) * 2;
      s.mesh.scale.setScalar(grow);
    }
  }

  function updateHUD() {
    const hud = document.getElementById('airstrike-hud');
    if (!hud) return;
    const curKills = getCurrentKills();
    const flash = hud.querySelector('.as-flash');
    if (state.ready && hasKills()) {
      flash.textContent = 'READY [J]';
      flash.style.color = '#ffdd44';
    } else if (!state.ready) {
      const pct = Math.round((1 - state.cd / COOLDOWN_MAX) * 100);
      flash.textContent = 'RECHARGING ' + pct + '%';
      flash.style.color = '#ff6644';
    } else {
      flash.textContent = curKills + '/' + KILLS_COST + ' KILLS';
      flash.style.color = '#999999';
    }
  }

  function init() {
    state.beaconMesh = buildBeacon();
    const hud = document.createElement('div');
    hud.id = 'airstrike-hud';
    hud.style.cssText = 'position:absolute;left:16px;bottom:282px;font-size:11px;letter-spacing:2px;text-shadow:0 1px 3px #000;z-index:6;';
    const label = document.createElement('div');
    label.style.cssText = 'color:#ff8833;margin-bottom:3px;';
    label.textContent = 'AIRSTRIKE';
    hud.appendChild(label);
    const bar = document.createElement('div');
    bar.style.cssText = 'width:90px;height:5px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,130,50,0.3);border-radius:3px;overflow:hidden;';
    const fill = document.createElement('div');
    fill.className = 'as-fill';
    fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#ff6622,#ffaa44);border-radius:2px;transition:width 0.05s;';
    bar.appendChild(fill);
    hud.appendChild(bar);
    const flash = document.createElement('div');
    flash.className = 'as-flash';
    flash.style.cssText = 'margin-top:3px;font-size:9px;letter-spacing:1px;color:#999;';
    flash.textContent = 'READY [J]';
    hud.appendChild(flash);
    document.getElementById('hud').appendChild(hud);
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'j' && e.key !== 'J') return;
      if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
      if (!window.Player || !Player.state.locked) return;
      call();
    });
  }

  function getCurrentKills() {
    if (window.AirSupport) return window.AirSupport.getPoints();
    return 0;
  }

  function hasKills() {
    return getCurrentKills() >= KILLS_COST;
  }

  function consumeKills() {
    if (window.AirSupport) window.AirSupport.spend(KILLS_COST);
  }

  function update(dt) {
    if (state.cd > 0) {
      state.cd -= dt;
      if (state.cd <= 0) {
        state.cd = 0;
        state.ready = true;
      }
    }
    if (state.phase !== 'idle') {
      if (state.phase === 'beacon') updateBeacon(dt);
      else updateJet(dt);
      updateBombs(dt);
    }
    updateParticles(dt);
    updateHUD();
    const hud = document.getElementById('airstrike-hud');
    if (hud) {
      const fill = hud.querySelector('.as-fill');
      if (fill) {
        const pct = state.ready ? 100 : (1 - state.cd / COOLDOWN_MAX) * 100;
        fill.style.width = pct + '%';
      }
    }
  }

  function reset() {
    state.ready = true;
    state.cd = 0;
    state.phase = 'idle';
    state.timer = 0;
    state.bombsDropped = 0;
    if (state.jetMesh) state.jetMesh.visible = false;
    if (state.beaconMesh) state.beaconMesh.visible = false;
    for (let i = state.bombs.length - 1; i >= 0; i--) {
      const b = state.bombs[i];
      SCENE.remove(b.mesh);
      SCENE.remove(b.flash);
      SCENE.remove(b.shock);
    }
    state.bombs.length = 0;
    for (let i = 0; i < sparks.length; i++) { sparks[i].active = false; sparks[i].mesh.visible = false; }
    for (let i = 0; i < smokes.length; i++) { smokes[i].active = false; smokes[i].mesh.visible = false; }
  }

  return { init, update, reset, state, call, KILLS_COST };
})();

window.Airstrike = Airstrike;