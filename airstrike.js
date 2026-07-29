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
    const wings = new THREE.Mesh(WING_GEO, WING_MAT);
    wings.position.set(0, 0, 0);
    wings.castShadow = true;
    g.add(wings);
    const tailFin = new THREE.Mesh(TAIL_FIN_GEO, WING_MAT);
    tailFin.position.set(-2.0, 0.6, 0);
    g.add(tailFin);
    const tailPlane = new THREE.Mesh(TAIL_PLANE_GEO, WING_MAT);
    tailPlane.position.set(-2.0, 0.15, 0);
    g.add(tailPlane);
    const canopy = new THREE.Mesh(CANOPY_GEO, CANOPY_MAT);
    canopy.position.set(0.7, 0.3, 0);
    g.add(canopy);
    for (const sx of [-1, 1]) {
      const eng = new THREE.Mesh(ENGINE_GEO, ENGINE_MAT);
      eng.position.set(-1.6, -0.15, sx * 1.8);
      g.add(eng);
      const exh = new THREE.Mesh(EXHAUST_GEO, EXHAUST_MAT.clone());
      exh.position.set(-2.2, -0.15, sx * 1.8);
      exh.rotation.y = Math.PI;
      g.add(exh);
    }
    g.visible = false;
    g.frustumCulled = false;
    SCENE.add(g);
    return g;
  }

  // ---- Beacon (ground marker) --------------------------------------------
  const BEACON_GEO = new THREE.RingGeometry(1.5, BOMB_RADIUS, 32);
  const BEACON_MAT = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const BEACON_CROSS_GEO = new THREE.RingGeometry(0.3, 0.5, 4, 1, 0, Math.PI * 0.5);
  const BEACON_CROSS_MAT = new THREE.MeshBasicMaterial({ color: 0xff4433, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });

  const beaconRing = new THREE.Mesh(BEACON_GEO, BEACON_MAT.clone());
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.visible = false;
  beaconRing.frustumCulled = false;
  SCENE.add(beaconRing);

  const beaconCross1 = new THREE.Mesh(BEACON_CROSS_GEO, BEACON_CROSS_MAT.clone());
  beaconCross1.rotation.x = -Math.PI / 2;
  beaconCross1.visible = false;
  beaconCross1.frustumCulled = false;
  SCENE.add(beaconCross1);

  const beaconCross2 = new THREE.Mesh(BEACON_CROSS_GEO, BEACON_CROSS_MAT.clone());
  beaconCross2.rotation.x = -Math.PI / 2;
  beaconCross2.visible = false;
  beaconCross2.frustumCulled = false;
  SCENE.add(beaconCross2);

  // ---- Bomb visuals ------------------------------------------------------
  const BOMB_GEO = new THREE.CylinderGeometry(0.15, 0.1, 0.7, 6);
  BOMB_GEO.rotateX(Math.PI / 2);
  const BOMB_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2a22, roughness: 0.6, metalness: 0.5 });
  const BOMB_FIN_GEO = new THREE.BoxGeometry(0.03, 0.25, 0.2);
  const BOMB_FIN_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1a15, roughness: 0.7 });
  const TRAIL_GEO = new THREE.ConeGeometry(0.1, 1.0, 5);
  TRAIL_GEO.rotateX(Math.PI);
  const TRAIL_MAT = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });

  // ---- Explosion visuals -------------------------------------------------
  const FLASH_GEO = new THREE.SphereGeometry(BOMB_RADIUS, 12, 10);
  const FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const SHOCK_GEO = new THREE.RingGeometry(0.5, 1.0, 32);
  const SHOCK_MAT = new THREE.MeshBasicMaterial({ color: 0xffaa55, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const SPARK_GEO = new THREE.SphereGeometry(0.15, 5, 4);
  const SPARK_MAT = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const SMOKE_GEO = new THREE.SphereGeometry(0.6, 6, 5);
  const SMOKE_MAT = new THREE.MeshBasicMaterial({ color: 0x3a3a30, transparent: true, opacity: 0, depthWrite: false });

  const flashes = [];
  for (let i = 0; i < BOMB_COUNT; i++) {
    const m = new THREE.Mesh(FLASH_GEO, FLASH_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    flashes.push(m);
  }

  const shocks = [];
  for (let i = 0; i < BOMB_COUNT; i++) {
    const m = new THREE.Mesh(SHOCK_GEO, SHOCK_MAT.clone());
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    shocks.push(m);
  }

  const sparks = [];
  for (let i = 0; i < SPARK_POOL; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, active: false });
  }
  let sparkIdx = 0;

  const smokes = [];
  for (let i = 0; i < SMOKE_POOL; i++) {
    const m = new THREE.Mesh(SMOKE_GEO, SMOKE_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    smokes.push({ mesh: m, life: 0, vy: 0, active: false });
  }
  let smokeIdx = 0;

  // ---- HUD ---------------------------------------------------------------
  const hud = document.getElementById('hud');
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:16px;bottom:278px;width:170px;font-size:11px;letter-spacing:2px;text-shadow:0 1px 3px #000;z-index:6;';
  if (hud) hud.appendChild(wrap);
  const label = document.createElement('div');
  label.style.cssText = 'color:#ff6644;margin-bottom:3px;';
  label.textContent = 'AIRSTRIKE [G]';
  wrap.appendChild(label);
  const bar = document.createElement('div');
  bar.style.cssText = 'width:100%;height:7px;background:rgba(0,0,0,0.55);border:1px solid rgba(255,80,50,0.35);border-radius:4px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#cc3322,#ff6644);border-radius:3px;transition:width 0.08s linear;';
  bar.appendChild(fill);
  wrap.appendChild(bar);
  const statusEl = document.createElement('div');
  statusEl.style.cssText = 'margin-top:3px;font-size:9px;letter-spacing:1px;color:#ff6644;opacity:0.6;';
  statusEl.textContent = 'READY';
  wrap.appendChild(statusEl);

  function updateHUD() {
    const frac = state.ready ? 1 : (1 - state.cd / COOLDOWN_MAX);
    fill.style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
    if (state.ready) {
      statusEl.textContent = 'READY';
      statusEl.style.opacity = '0.9';
    } else {
      statusEl.textContent = 'CHARGING';
      statusEl.style.opacity = '0.5';
    }
  }

  // ---- Input -------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'g' && e.key !== 'G') return;
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    if (!window.Player || !Player.state.locked) return;
    activate();
  });

  function activate() {
    if (!state.ready) {
      if (window.FX) window.FX.message('AIRSTRIKE RECHARGING', '#ff6644');
      return;
    }
    const p = window.Player ? window.Player.state : null;
    if (p && p.stamina !== undefined && p.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('INSUFFICIENT STAMINA', '#ff6644');
      return;
    }
    if (p && p.stamina !== undefined) {
      p.stamina -= STAMINA_COST;
      if (p.regenTimer !== undefined) p.regenTimer = 1.5;
    }

    // Lase ground target at crosshair.
    const cam = window.CAMERA;
    if (!cam) return;
    _ray.setFromCamera({ x: 0, y: 0 }, cam);
    const hit = _ray.ray.intersectPlane(_ground, _v1);
    if (!hit) return;

    state.center.copy(hit);
    state.center.y = groundY(hit.x, hit.z);
    state.ready = false;
    state.cd = COOLDOWN_MAX;
    state.phase = 'beacon';
    state.timer = 0;
    state.beaconT = 0;

    // Place beacon visuals.
    beaconRing.position.set(state.center.x, state.center.y + 0.05, state.center.z);
    beaconRing.material.opacity = 0.7;
    beaconRing.visible = true;
    beaconCross1.position.set(state.center.x, state.center.y + 0.06, state.center.z);
    beaconCross1.material.opacity = 0.8;
    beaconCross1.visible = true;
    beaconCross2.position.copy(beaconCross1.position);
    beaconCross2.rotation.z = Math.PI / 2;
    beaconCross2.material.opacity = 0.8;
    beaconCross2.visible = true;

    // Choose run direction perpendicular to camera facing for best visual.
    cam.getWorldDirection(_v2);
    state.runDir.set(-_v2.z, 0, _v2.x).normalize();

    // Build jet if needed.
    if (!state.jetMesh) state.jetMesh = buildJet();

    if (window.FX) window.FX.message('AIRSTRIKE INBOUND', '#ffaa44');
    if (window.Sound) {
      window.Sound.tone(180, 0.3, 'sawtooth', 0.25, 600);
      window.Sound.tone(360, 0.2, 'square', 0.15, 1000);
    }
    updateHUD();
  }

  function startJetRun() {
    const startOffset = _v1.copy(state.runDir).multiplyScalar(-110);
    state.jetPos.set(state.center.x + startOffset.x, JET_ALT, state.center.z + startOffset.z);
    state.jetMesh.position.copy(state.jetPos);
    const yaw = Math.atan2(state.runDir.x, state.runDir.z);
    state.jetMesh.rotation.set(0, yaw, 0);
    state.jetMesh.visible = true;
    state.phase = 'jet_approach';
    state.timer = 0;
    state.bombTimer = 0;
    state.bombsDropped = 0;
    state.bombs.length = 0;
    if (window.Sound) window.Sound.tone(80, 1.5, 'sawtooth', 0.3, 200);
  }

  function dropBomb() {
    const offset = _v1.copy(state.runDir).multiplyScalar(state.bombsDropped * BOMB_SPACING);
    const x = state.center.x + offset.x;
    const z = state.center.z + offset.z;
    const gy = groundY(x, z);

    const bombMesh = new THREE.Mesh(BOMB_GEO, BOMB_MAT);
    bombMesh.castShadow = false;
    const fin = new THREE.Mesh(BOMB_FIN_GEO, BOMB_FIN_MAT);
    fin.position.set(0, 0, -0.35);
    bombMesh.add(fin);
    const trail = new THREE.Mesh(TRAIL_GEO, TRAIL_MAT.clone());
    trail.position.z = 0.7;
    bombMesh.add(trail);
    bombMesh.position.set(x, JET_ALT, z);
    bombMesh.quaternion.copy(state.jetMesh.quaternion);
    SCENE.add(bombMesh);

    state.bombs.push({
      mesh: bombMesh,
      x: x, z: z, gy: gy,
      t: 0,
      exploded: false,
    });
    state.bombsDropped++;

    if (window.Sound) window.Sound.tone(440, 0.05, 'square', 0.1, 800);
  }

  function detonateBomb(bomb) {
    bomb.exploded = true;
    const fx = bomb.x, fz = bomb.z, fy = bomb.gy;

    // Flash.
    const flash = flashes[state.bombs.indexOf(bomb) % flashes.length];
    flash.position.set(fx, fy + 1, fz);
    flash.material.opacity = 0.9;
    flash.scale.setScalar(0.5);
    flash.visible = true;

    // Shock ring.
    const shock = shocks[state.bombs.indexOf(bomb) % shocks.length];
    shock.position.set(fx, fy + 0.1, fz);
    shock.material.opacity = 0.8;
    shock.scale.setScalar(0.3);
    shock.visible = true;

    // Sparks.
    for (let i = 0; i < 10; i++) {
      const s = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % SPARK_POOL;
      const ang = Math.random() * Math.PI * 2;
      const spd = 8 + Math.random() * 14;
      s.mesh.position.set(fx, fy + 0.5, fz);
      s.vx = Math.cos(ang) * spd;
      s.vy = 4 + Math.random() * 10;
      s.vz = Math.sin(ang) * spd;
      s.life = SPARK_LIFE * (0.6 + Math.random() * 0.5);
      s.mesh.material.opacity = 1;
      s.mesh.visible = true;
      s.active = true;
    }

    // Smoke.
    for (let i = 0; i < 4; i++) {
      const sm = smokes[smokeIdx];
      smokeIdx = (smokeIdx + 1) % SMOKE_POOL;
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * BOMB_RADIUS * 0.6;
      sm.mesh.position.set(fx + Math.cos(ang) * dist, fy + 0.5 + Math.random() * 2, fz + Math.sin(ang) * dist);
      sm.mesh.scale.setScalar(0.5 + Math.random() * 0.8);
      sm.vy = 1.5 + Math.random() * 2;
      sm.life = SMOKE_LIFE * (0.7 + Math.random() * 0.5);
      sm.mesh.material.opacity = 0.6;
      sm.mesh.visible = true;
      sm.active = true;
    }

    // Craters.
    if (window.Craters) window.Craters.create(fx, fz, BOMB_RADIUS * 0.8);
    if (window.BloodPools) window.BloodPools.spawn(fx, fz, 1.2);

    // Damage entities in radius.
    if (window.Entities && window.Grid) {
      const ents = window.Grid.queryRadius(fx, fz, BOMB_RADIUS, [], (e) => !e.dead);
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (!e.mesh) continue;
        const dx = e.mesh.position.x - fx;
        const dz = e.mesh.position.z - fz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > BOMB_RADIUS) continue;
        const falloff = 1 - (dist / BOMB_RADIUS) * 0.5;
        const dmg = BOMB_DAMAGE * falloff;
        if (typeof e.takeDamage === 'function') {
          e.takeDamage(dmg, 'explosion', null);
        } else if (e.hp !== undefined) {
          e.hp -= dmg;
          if (e.hp <= 0 && !e.dead) {
            e.dead = true;
            if (window.Entities && window.Entities.onKill) window.Entities.onKill(e);
          }
        }
        // Knockback.
        if (dist > 0.1 && e.vel) {
          const kb = (1 - dist / BOMB_RADIUS) * 18;
          e.vel.x += (dx / dist) * kb;
          e.vel.z += (dz / dist) * kb;
          e.vel.y += (1 - dist / BOMB_RADIUS) * 8;
        }
        if (window.FX && e.mesh) {
          window.FX.burst(e.mesh.position, new THREE.Vector3(0, 1, 0), 0xff4422, 8);
        }
      }
    }

    // Player damage.
    const cam = window.CAMERA;
    const ms = window.Manager;
    if (cam && ms && ms.state && ms.state.playerAlive) {
      const pdx = cam.position.x - fx;
      const pdz = cam.position.z - fz;
      const pdist = Math.sqrt(pdx * pdx + pdz * pdz);
      if (pdist < BOMB_RADIUS) {
        const pdmg = BOMB_DAMAGE * (1 - pdist / BOMB_RADIUS) * 0.45;
        ms.damagePlayer(pdmg);
        if (window.FX) window.FX.shake(0.25);
      }
    }

    // Clean up bomb mesh.
    SCENE.remove(bomb.mesh);
    if (bomb.mesh.children) {
      for (const c of bomb.mesh.children) {
        if (c.material && c.material.dispose && c.material !== BOMB_FIN_MAT) c.material.dispose();
      }
    }
    bomb.mesh = null;

    if (window.Sound) {
      window.Sound.tone(60, 0.3, 'sawtooth', 0.4, 200);
      window.Sound.tone(120, 0.15, 'square', 0.2, 400);
    }
    if (window.FX) window.FX.shake(0.12);
  }

  function update(dt) {
    // Cooldown.
    if (!state.ready) {
      state.cd -= dt;
      if (state.cd <= 0) {
        state.cd = 0;
        state.ready = true;
        updateHUD();
      } else if (state.phase === 'idle') {
        updateHUD();
      }
    }

    // Phase: beacon lasing.
    if (state.phase === 'beacon') {
      state.beaconT += dt;
      const t = state.beaconT / BEACON_LIFE;
      beaconRing.scale.setScalar(0.6 + Math.sin(state.beaconT * 8) * 0.08);
      beaconCross1.rotation.z += dt * 3;
      beaconCross2.rotation.z -= dt * 2;
      if (state.beaconT >= BEACON_LIFE) {
        beaconRing.visible = false;
        beaconCross1.visible = false;
        beaconCross2.visible = false;
        startJetRun();
      }
    }

    // Phase: jet approach.
    if (state.phase === 'jet_approach') {
      state.timer += dt;
      const speed = JET_SPEED;
      state.jetPos.addScaledVector(state.runDir, speed * dt);
      state.jetMesh.position.copy(state.jetPos);

      // Gentle bob.
      state.jetMesh.position.y = JET_ALT + Math.sin(state.timer * 2) * 0.3;

      // Bank slightly.
      state.jetMesh.rotation.z = Math.sin(state.timer * 1.5) * 0.05;

      // Start dropping bombs when jet reaches the center zone.
      const distToCenter = Math.abs(_v1.copy(state.jetPos).sub(state.center).dot(state.runDir));
      if (distToCenter < 15 && state.bombsDropped === 0) {
        state.phase = 'jet_bombing';
        state.bombTimer = 0;
      }

      // Depart after passing.
      if (distToCenter > 110) {
        state.phase = 'jet_depart';
        state.timer = 0;
      }
    }

    // Phase: jet bombing run.
    if (state.phase === 'jet_bombing') {
      state.timer += dt;
      state.jetPos.addScaledVector(state.runDir, JET_SPEED * dt);
      state.jetMesh.position.copy(state.jetPos);
      state.jetMesh.position.y = JET_ALT + Math.sin(state.timer * 2) * 0.3;

      state.bombTimer += dt;
      const bombInterval = BOMB_FALL_TIME / BOMB_COUNT * 0.8;
      if (state.bombTimer >= bombInterval && state.bombsDropped < BOMB_COUNT) {
        state.bombTimer = 0;
        dropBomb();
      }

      if (state.bombsDropped >= BOMB_COUNT) {
        state.phase = 'jet_depart';
        state.timer = 0;
      }
    }

    // Phase: jet departure.
    if (state.phase === 'jet_depart') {
      state.timer += dt;
      state.jetPos.addScaledVector(state.runDir, JET_SPEED * dt);
      state.jetMesh.position.copy(state.jetPos);
      if (state.timer > JET_DEPART) {
        state.jetMesh.visible = false;
        if (state.bombs.every((b) => b.exploded || !b.mesh)) {
          state.phase = 'idle';
        } else {
          state.phase = 'finishing';
        }
      }
    }

    // Phase: wait for remaining bombs.
    if (state.phase === 'finishing') {
      let allDone = true;
      for (const b of state.bombs) {
        if (!b.exploded) { allDone = false; break; }
      }
      if (allDone) state.phase = 'idle';
    }

    // Update falling bombs.
    for (const b of state.bombs) {
      if (b.exploded || !b.mesh) continue;
      b.t += dt;
      const frac = Math.min(1, b.t / BOMB_FALL_TIME);
      const startY = JET_ALT;
      b.mesh.position.y = startY + (b.gy - startY) * frac;
      // Spin slightly.
      b.mesh.rotateZ(dt * 2);
      if (frac >= 1) {
        detonateBomb(b);
      }
    }

    // Update flash fade.
    for (const f of flashes) {
      if (!f.visible) continue;
      f.material.opacity *= Math.max(0, 1 - dt * 6);
      f.scale.multiplyScalar(1 + dt * 4);
      if (f.material.opacity < 0.02) f.visible = false;
    }

    // Update shock rings.
    for (const s of shocks) {
      if (!s.visible) continue;
      s.material.opacity *= Math.max(0, 1 - dt * 4);
      s.scale.multiplyScalar(1 + dt * 8);
      if (s.material.opacity < 0.02) s.visible = false;
    }

    // Update sparks.
    for (const s of sparks) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        s.active = false;
        continue;
      }
      s.vy -= 20 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.material.opacity = Math.min(1, s.life / 0.2);
      const sc = 0.5 + s.life * 0.8;
      s.mesh.scale.setScalar(sc);
    }

    // Update smoke.
    for (const sm of smokes) {
      if (!sm.active) continue;
      sm.life -= dt;
      if (sm.life <= 0) {
        sm.mesh.visible = false;
        sm.active = false;
        continue;
      }
      sm.mesh.position.y += sm.vy * dt;
      sm.vy *= (1 - dt * 0.5);
      sm.mesh.material.opacity = Math.min(0.6, sm.life / SMOKE_LIFE * 0.6);
      sm.mesh.scale.multiplyScalar(1 + dt * 0.8);
    }
  }

  function reset() {
    state.cd = 0;
    state.ready = true;
    state.phase = 'idle';
    state.bombs.length = 0;
    if (state.jetMesh) state.jetMesh.visible = false;
    beaconRing.visible = false;
    beaconCross1.visible = false;
    beaconCross2.visible = false;
    for (const f of flashes) f.visible = false;
    for (const s of shocks) s.visible = false;
    for (const s of sparks) { s.active = false; s.mesh.visible = false; }
    for (const sm of smokes) { sm.active = false; sm.mesh.visible = false; }
    updateHUD();
  }

  function init() {
    updateHUD();
  }

  return { update, reset, init, state };
})();

window.Airstrike = Airstrike;