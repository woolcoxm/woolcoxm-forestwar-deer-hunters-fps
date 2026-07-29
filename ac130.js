// ac130.js — FORESTWAR AC-130 gunship killstreak: high-altitude orbiting cannons with auto-targeting
const THREE = window.THREE;
const SCENE = window.SCENE;
const AC130 = (() => {
  const KILLS_NEEDED = 15;
  const COOLDOWN_MAX = 120;
  const DURATION = 20;
  const ARRIVAL_TIME = 2.5;
  const DEPART_TIME = 2.0;
  const ORBIT_RADIUS = 55;
  const ORBIT_ALT = 48;
  const ORBIT_SPEED = 0.32;
  const BOFORS_RATE = 0.5;
  const BOFORS_DAMAGE = 85;
  const BOFORS_RADIUS = 4.5;
  const HOWITZER_RATE = 2.8;
  const HOWITZER_DAMAGE = 180;
  const HOWITZER_RADIUS = 8;
  const ACQUIRE_INTERVAL = 0.4;
  const TARGET_RANGE = 60;
  const MAX_TARGETS = 6;
  const TRACER_POOL = 50;
  const TRACER_LIFE = 0.1;
  const SPARK_POOL = 30;
  const SPARK_LIFE = 0.35;
  const FLASH_DURATION = 0.3;
  const SCORCH_MAX = 12;

  const state = {
    kills: 0,
    ready: false,
    cooldown: 0,
    active: false,
    phase: 'idle',
    timer: 0,
    angle: 0,
    center: new THREE.Vector3(),
    bofireCd: 0,
    howitzerCd: 0,
    acquireTimer: 0,
    targets: [],
    searchT: 0,
  };

  const _heliPos = new THREE.Vector3();
  const _muzzle = new THREE.Vector3();
  const _camPos = new THREE.Vector3();

  // ---- Tracer pool (line segments) -----------------------------------------
  const tracerGeo = new THREE.BufferGeometry();
  const TRACER_VERTS = TRACER_POOL * 6;
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRACER_VERTS), 3));
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffdd66, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracerLines = new THREE.LineSegments(tracerGeo, tracerMat);
  tracerLines.frustumCulled = false;
  tracerLines.visible = false;
  SCENE.add(tracerLines);
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i++) tracers.push({ life: 0, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, active: false });

  // ---- Spark pool -----------------------------------------------------------
  const SPARK_GEO = new THREE.SphereGeometry(0.12, 5, 4);
  const SPARK_MAT_BASE = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks = [];
  for (let i = 0; i < SPARK_POOL; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT_BASE.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, active: false });
  }

  // ---- Flash + scorch pools -------------------------------------------------
  const FLASH_GEO = new THREE.SphereGeometry(1, 8, 6);
  const FLASH_MAT_BASE = new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const CRATER_GEO = new THREE.CircleGeometry(1, 14);
  const CRATER_MAT_BASE = new THREE.MeshBasicMaterial({ color: 0x1a1008, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const flashes = [];
  const scorchPool = [];
  for (let i = 0; i < MAX_TARGETS; i++) {
    const fm = new THREE.Mesh(FLASH_GEO, FLASH_MAT_BASE.clone());
    fm.visible = false;
    fm.frustumCulled = false;
    SCENE.add(fm);
    flashes.push({ mesh: fm, life: 0 });
  }
  for (let i = 0; i < SCORCH_MAX; i++) {
    const cm = new THREE.Mesh(CRATER_GEO, CRATER_MAT_BASE.clone());
    cm.rotation.x = -Math.PI / 2;
    cm.visible = false;
    SCENE.add(cm);
    scorchPool.push({ mesh: cm, active: false });
  }
  let scorchIdx = 0;

  // ---- Gunship mesh ---------------------------------------------------------
  const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x3a3a34, roughness: 0.5, metalness: 0.6 });
  const TRIM_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2a24, roughness: 0.7, metalness: 0.4 });
  const PROP_MAT = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.5 });
  const LIGHT_MAT = new THREE.MeshBasicMaterial({ color: 0xff4422 });
  let mesh = null;
  let propSpinner1 = null;
  let propSpinner2 = null;
  let propSpinner3 = null;
  let propSpinner4 = null;
  let rotorAngle = 0;

  function buildMesh() {
    const g = new THREE.Group();
    const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(1.0, 5.0, 6, 12), BODY_MAT);
    fuselage.rotation.z = Math.PI / 2;
    fuselage.castShadow = true;
    g.add(fuselage);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.2, metalness: 0.8, transparent: true, opacity: 0.5 }));
    canopy.scale.set(0.85, 0.7, 1.0);
    canopy.position.set(2.8, 0.3, 0);
    g.add(canopy);
    const tailBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.15, 5.0, 6), TRIM_MAT);
    tailBoom.rotation.z = Math.PI / 2;
    tailBoom.position.set(-4.2, 0.2, 0);
    g.add(tailBoom);
    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 1.0), BODY_MAT);
    tailFin.position.set(-6.4, 0.8, 0);
    g.add(tailFin);
    const tailPlane = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 2.6), BODY_MAT);
    tailPlane.position.set(-6.2, 0.3, 0);
    g.add(tailPlane);
    const mainWing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 10.5), BODY_MAT);
    mainWing.castShadow = true;
    mainWing.position.set(-0.5, 0.5, 0);
    g.add(mainWing);
    for (const sz of [-1, 1]) {
      const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 8), TRIM_MAT);
      engine.rotation.x = Math.PI / 2;
      engine.position.set(-0.5, 0.4, sz * 4.0);
      g.add(engine);
      const propGeo = new THREE.BoxGeometry(0.06, 2.8, 0.12);
      const prop = new THREE.Mesh(propGeo, PROP_MAT);
      prop.position.set(-0.5, 0.4, sz * 4.8);
      g.add(prop);
      if (sz > 0) propSpinner1 = prop;
      else propSpinner2 = prop;
    }
    for (const sz of [-1, 1]) {
      const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.4, 8), TRIM_MAT);
      engine.rotation.x = Math.PI / 2;
      engine.position.set(-0.5, 0.4, sz * 2.0);
      g.add(engine);
      const propGeo = new THREE.BoxGeometry(0.06, 2.4, 0.12);
      const prop = new THREE.Mesh(propGeo, PROP_MAT);
      prop.position.set(-0.5, 0.4, sz * 2.7);
      g.add(prop);
      if (sz > 0) propSpinner3 = prop;
      else propSpinner4 = prop;
    }
    const boforsBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.8, 6), TRIM_MAT);
    boforsBarrel.rotation.x = Math.PI / 2;
    boforsBarrel.position.set(1.0, -0.8, 0);
    g.add(boforsBarrel);
    const howitzerBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.5, 8), TRIM_MAT);
    howitzerBarrel.rotation.x = Math.PI / 2;
    howitzerBarrel.position.set(-1.2, -0.9, 0);
    g.add(howitzerBarrel);
    for (const sz of [-0.4, 0.4]) {
      const nav = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), LIGHT_MAT);
      nav.position.set(-3.0, 0.6, sz);
      g.add(nav);
    }
    g.visible = false;
    SCENE.add(g);
    return g;
  }

  mesh = buildMesh();

  // ---- HUD ------------------------------------------------------------------
  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:50%;bottom:150px;transform:translateX(-50%);font-size:12px;letter-spacing:3px;color:#ff8844;text-shadow:0 0 8px rgba(255,80,30,0.5),0 2px 4px #000;z-index:8;opacity:0;transition:opacity 0.3s;text-align:center;';
  const labelEl = document.createElement('div');
  labelEl.textContent = 'AC-130 GUNSHIP';
  hud.appendChild(labelEl);
  const barWrap = document.createElement('div');
  barWrap.style.cssText = 'margin-top:4px;width:180px;height:6px;background:rgba(0,0,0,0.55);border:1px solid rgba(255,100,50,0.4);border-radius:3px;overflow:hidden;';
  const barFill = document.createElement('div');
  barFill.style.cssText = 'width:0%;height:100%;background:linear-gradient(90deg,#cc3311,#ff8844);border-radius:2px;transition:width 0.1s;';
  barWrap.appendChild(barFill);
  hud.appendChild(barWrap);
  document.getElementById('hud').appendChild(hud);

  const statusEl = document.createElement('div');
  statusEl.style.cssText = 'position:absolute;left:50%;top:80px;transform:translateX(-50%);font-size:14px;letter-spacing:4px;color:#ff6633;text-shadow:0 0 12px rgba(255,80,20,0.6),0 2px 5px #000;z-index:8;opacity:0;transition:opacity 0.3s;font-weight:bold;';
  statusEl.textContent = '';
  document.getElementById('hud').appendChild(statusEl);

  // ---- Kill rewards registration -------------------------------------------
  if (window.KillRewards) {
    window.KillRewards.register(() => {
      state.kills++;
      if (state.kills >= KILLS_NEEDED && !state.active && state.cooldown <= 0 && !state.ready) {
        state.ready = true;
        if (window.FX) window.FX.message('AC-130 READY [U]', '#ff8844');
        if (window.Sound) window.Sound.tone(520, 0.25, 'sine', 0.25, 1800);
      }
    });
  }

  // ---- Key binding: U activates the gunship (J is taken by the heli-strike) --
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'u' && e.key !== 'U') return;
    if (!state.ready || state.active) return;
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    if (!window.Player || !window.Player.state.locked) return;
    activate();
  });

  function activate() {
    state.ready = false;
    state.active = true;
    state.phase = 'arrival';
    state.timer = 0;
    state.cooldown = COOLDOWN_MAX;
    state.bofireCd = 0;
    state.howitzerCd = HOWITZER_RATE;
    state.acquireTimer = 0;
    state.targets.length = 0;
    const cam = window.CAMERA;
    state.center.set(cam.position.x, 0, cam.position.z);
    state.angle = Math.random() * Math.PI * 2;
    if (window.FX) window.FX.message('AC-130 GUNSHIP EN ROUTE — [U]', '#ff8844');
    if (window.Sound) {
      window.Sound.tone(180, 0.6, 'sawtooth', 0.3, 600);
      window.Sound.tone(120, 0.8, 'sawtooth', 0.2, 400);
    }
    mesh.visible = true;
  }

  function getEnemies() {
    if (!window.Entities || !Array.isArray(window.Entities.list)) return [];
    const playerTeam = window.Manager && window.Manager.state ? window.Manager.state.playerTeam : 'hunter';
    const result = [];
    for (const e of window.Entities.list) {
      if (!e.dead && e.team !== playerTeam && e.team !== 'none') result.push(e);
    }
    return result;
  }

  function acquireTarget() {
    const enemies = getEnemies();
    if (enemies.length === 0) return null;
    let best = null;
    let bestDist = Infinity;
    _camPos.copy(state.center);
    for (const e of enemies) {
      if (!e.mesh) continue;
      const dx = e.mesh.position.x - _camPos.x;
      const dz = e.mesh.position.z - _camPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > TARGET_RANGE * TARGET_RANGE) continue;
      if (d2 < bestDist) { bestDist = d2; best = e; }
    }
    return best;
  }

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function spawnScorch(x, z, radius) {
    const slot = scorchPool[scorchIdx];
    scorchIdx = (scorchIdx + 1) % SCORCH_MAX;
    const gy = groundY(x, z) + 0.05;
    slot.mesh.position.set(x, gy, z);
    slot.mesh.rotation.z = Math.random() * Math.PI * 2;
    slot.mesh.scale.setScalar(radius);
    slot.mesh.material.opacity = 0.75 + Math.random() * 0.12;
    slot.mesh.visible = true;
    slot.active = true;
  }

  function fireBofors(target) {
    if (!target || !target.mesh || target.dead) return;
    const tx = target.mesh.position.x;
    const tz = target.mesh.position.z;
    const ty = groundY(tx, tz);
    spawnTracer(_muzzle.x, _muzzle.y, _muzzle.z, tx, ty + 1.0, tz);
    spawnExplosion(tx, ty, tz, BOFORS_RADIUS, BOFORS_DAMAGE);
    spawnScorch(tx, tz, BOFORS_RADIUS * 0.7);
    if (window.Craters) window.Craters.create(tx, tz, BOFORS_RADIUS * 0.6);
    playShotSound(0.3);
  }

  function fireHowitzer(target) {
    if (!target || !target.mesh || target.dead) return;
    const enemies = getEnemies();
    if (enemies.length === 0) return;
    const cluster = [];
    for (const e of enemies) {
      if (!e.mesh) continue;
      const dx = e.mesh.position.x - target.mesh.position.x;
      const dz = e.mesh.position.z - target.mesh.position.z;
      if (dx * dx + dz * dz < 144) cluster.push(e);
    }
    const aim = cluster.length > 0 ? cluster[Math.floor(Math.random() * cluster.length)] : target;
    const tx = aim.mesh.position.x;
    const tz = aim.mesh.position.z;
    const ty = groundY(tx, tz);
    spawnTracer(_muzzle.x, _muzzle.y, _muzzle.z, tx, ty + 1.0, tz);
    spawnExplosion(tx, ty, tz, HOWITZER_RADIUS, HOWITZER_DAMAGE);
    spawnScorch(tx, tz, HOWITZER_RADIUS * 0.8);
    if (window.Craters) window.Craters.create(tx, tz, HOWITZER_RADIUS * 0.7);
    if (window.FX && window.FX.shake) window.FX.shake(0.06);
    playShotSound(0.5);
  }

  function spawnExplosion(x, y, z, radius, damage) {
    const flash = flashes[0];
    flash.mesh.position.set(x, y + 0.5, z);
    flash.mesh.scale.setScalar(radius * 0.5);
    flash.mesh.material.opacity = 0.9;
    flash.mesh.visible = true;
    flash.life = FLASH_DURATION;
    for (let i = 0; i < 8; i++) spawnSpark(x, y + 0.3, z, radius);
    applyDamage(x, z, radius, damage);
  }

  function applyDamage(x, z, radius, damage) {
    const enemies = getEnemies();
    const r2 = radius * radius;
    for (const e of enemies) {
      if (!e.mesh || e.dead) continue;
      const dx = e.mesh.position.x - x;
      const dz = e.mesh.position.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      const falloff = 1.0 - Math.sqrt(d2) / radius;
      const dmg = damage * (0.4 + 0.6 * falloff);
      e.hp -= dmg;
      e.lastDamageTime = (window.Manager ? window.Manager.state.time : 0);
      if (e.hp <= 0 && !e.dead) {
        // Credit the player's team so AC-130 kills feed their killstreak + rewards
        // (same convention as the heli-strike gunship), not a neutral 'explosion'.
        const pt = (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
        if (window.Entities && window.Entities.kill) window.Entities.kill(e, pt);
      }
    }
    const cam = window.CAMERA;
    if (cam) {
      const dx = cam.position.x - x;
      const dz = cam.position.z - z;
      if (dx * dx + dz * dz < r2) {
        const falloff = 1.0 - Math.sqrt(dx * dx + dz * dz) / radius;
        if (window.Manager && window.Manager.state) {
          window.Manager.state.playerHp -= damage * falloff * 0.3;
        }
      }
    }
  }

  function spawnTracer(ax, ay, az, bx, by, bz) {
    let slot = null;
    for (const t of tracers) { if (!t.active) { slot = t; break; } }
    if (!slot) {
      let oldest = tracers[0];
      for (const t of tracers) if (t.life < oldest.life) oldest = t;
      slot = oldest;
    }
    slot.active = true;
    slot.life = TRACER_LIFE;
    slot.ax = ax; slot.ay = ay; slot.az = az;
    slot.bx = bx; slot.by = by; slot.bz = bz;
  }

  function spawnSpark(x, y, z, radius) {
    let slot = null;
    for (const s of sparks) { if (!s.active) { slot = s; break; } }
    if (!slot) return;
    slot.active = true;
    slot.life = SPARK_LIFE;
    const ang = Math.random() * Math.PI * 2;
    const spd = 4 + Math.random() * 8;
    slot.vx = Math.cos(ang) * spd;
    slot.vy = 3 + Math.random() * 8;
    slot.vz = Math.sin(ang) * spd;
    slot.mesh.position.set(x, y, z);
    slot.mesh.visible = true;
    const sc = 0.5 + Math.random() * 0.5;
    slot.mesh.scale.setScalar(sc);
  }

  function playShotSound(volume) {
    if (!window.Sound) return;
    window.Sound.tone(80 + Math.random() * 20, 0.12, 'sawtooth', volume, 300);
    window.Sound.tone(160, 0.06, 'square', volume * 0.5, 800);
  }

  function updateTracers(dt) {
    let anyActive = false;
    const arr = tracerGeo.attributes.position.array;
    for (let i = 0; i < tracers.length; i++) {
      const t = tracers[i];
      if (t.active) {
        t.life -= dt;
        if (t.life <= 0) { t.active = false; }
        else {
          anyActive = true;
          const idx = i * 6;
          arr[idx] = t.ax; arr[idx + 1] = t.ay; arr[idx + 2] = t.az;
          arr[idx + 3] = t.bx; arr[idx + 4] = t.by; arr[idx + 5] = t.bz;
        }
      }
    }
    if (anyActive) {
      tracerGeo.attributes.position.needsUpdate = true;
      tracerLines.visible = true;
    } else {
      tracerLines.visible = false;
    }
  }

  function updateSparks(dt) {
    for (const s of sparks) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) { s.active = false; s.mesh.visible = false; continue; }
      s.vy -= 20 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      const gy = groundY(s.mesh.position.x, s.mesh.position.z);
      if (s.mesh.position.y < gy) { s.active = false; s.mesh.visible = false; continue; }
      const frac = s.life / SPARK_LIFE;
      s.mesh.material.opacity = frac;
    }
  }

  function updateFlashes(dt) {
    for (const f of flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) { f.mesh.visible = false; continue; }
      const frac = f.life / FLASH_DURATION;
      f.mesh.material.opacity = frac * 0.9;
      f.mesh.scale.setScalar(f.mesh.scale.x + dt * 8);
    }
  }

  function updateHUD() {
    if (state.active) {
      hud.style.opacity = '1';
      barFill.style.width = Math.max(0, (1 - state.timer / DURATION) * 100) + '%';
      if (state.phase === 'arrival') statusEl.textContent = 'AC-130 INBOUND';
      else if (state.phase === 'active') statusEl.textContent = 'AC-130 ON STATION';
      else if (state.phase === 'depart') statusEl.textContent = 'AC-130 DEPARTING';
      statusEl.style.opacity = '1';
    } else {
      hud.style.opacity = state.cooldown > 0 ? '0.4' : '0';
      if (state.cooldown > 0) {
        barFill.style.width = ((1 - state.cooldown / COOLDOWN_MAX) * 100) + '%';
        labelEl.textContent = 'AC-130 GUNSHIP';
      } else if (state.ready) {
        barFill.style.width = '100%';
        labelEl.textContent = 'AC-130 READY [U]';
        hud.style.opacity = '1';
      } else {
        labelEl.textContent = 'AC-130 GUNSHIP';
        barFill.style.width = Math.min(100, (state.kills / KILLS_NEEDED) * 100) + '%';
      }
      statusEl.style.opacity = '0';
    }
  }

  function reset() {
    state.active = false;
    state.phase = 'idle';
    state.timer = 0;
    state.kills = 0;
    state.cooldown = 0;
    state.ready = false;
    state.targets.length = 0;
    for (const t of tracers) t.active = false;
    for (const s of sparks) { s.active = false; s.mesh.visible = false; }
    for (const f of flashes) { f.life = 0; f.mesh.visible = false; }
    mesh.visible = false;
    tracerLines.visible = false;
    updateHUD();
  }

  function update(dt) {
    if (state.cooldown > 0) {
      state.cooldown -= dt;
      if (state.cooldown <= 0) state.cooldown = 0;
    }
    if (!state.active) { updateHUD(); return; }

    state.timer += dt;
    state.angle += ORBIT_SPEED * dt;
    rotorAngle += dt * 25;
    if (propSpinner1) propSpinner1.rotation.z = rotorAngle;
    if (propSpinner2) propSpinner2.rotation.z = -rotorAngle;
    if (propSpinner3) propSpinner3.rotation.z = rotorAngle * 1.1;
    if (propSpinner4) propSpinner4.rotation.z = -rotorAngle * 1.1;

    if (state.phase === 'arrival') {
      const t = state.timer / ARRIVAL_TIME;
      if (t >= 1.0) { state.phase = 'active'; state.timer = 0; }
      mesh.visible = true;
      _heliPos.set(
        state.center.x + Math.cos(state.angle) * ORBIT_RADIUS,
        ORBIT_ALT * Math.min(1, t),
        state.center.z + Math.sin(state.angle) * ORBIT_RADIUS
      );
      mesh.position.copy(_heliPos);
      mesh.rotation.y = -state.angle + Math.PI / 2;
      mesh.rotation.z = -0.05;
    } else if (state.phase === 'active') {
      _heliPos.set(
        state.center.x + Math.cos(state.angle) * ORBIT_RADIUS,
        ORBIT_ALT,
        state.center.z + Math.sin(state.angle) * ORBIT_RADIUS
      );
      mesh.position.copy(_heliPos);
      mesh.rotation.y = -state.angle + Math.PI / 2;
      mesh.rotation.z = Math.sin(state.angle * 3) * 0.03;

      _muzzle.copy(mesh.position);

      state.acquireTimer -= dt;
      if (state.acquireTimer <= 0) {
        state.acquireTimer = ACQUIRE_INTERVAL;
        state.targets.length = 0;
        const enemies = getEnemies();
        for (let i = 0; i < enemies.length && state.targets.length < MAX_TARGETS; i++) {
          const e = enemies[i];
          if (!e.mesh) continue;
          const dx = e.mesh.position.x - state.center.x;
          const dz = e.mesh.position.z - state.center.z;
          if (dx * dx + dz * dz < TARGET_RANGE * TARGET_RANGE) state.targets.push(e);
        }
      }

      state.bofireCd -= dt;
      if (state.bofireCd <= 0 && state.targets.length > 0) {
        state.bofireCd = BOFORS_RATE;
        const target = state.targets[Math.floor(Math.random() * state.targets.length)];
        fireBofors(target);
      }

      state.howitzerCd -= dt;
      if (state.howitzerCd <= 0 && state.targets.length > 0) {
        state.howitzerCd = HOWITZER_RATE;
        const target = state.targets[Math.floor(Math.random() * state.targets.length)];
        fireHowitzer(target);
      }

      if (window.CAMERA) {
        const dx = window.CAMERA.position.x - state.center.x;
        const dz = window.CAMERA.position.z - state.center.z;
        if (dx * dx + dz * dz > TARGET_RANGE * TARGET_RANGE) {
          state.center.x += dx * dt * 0.5;
          state.center.z += dz * dt * 0.5;
        }
      }

      if (state.timer >= DURATION) {
        state.phase = 'depart';
        state.timer = 0;
      }
    } else if (state.phase === 'depart') {
      const t = state.timer / DEPART_TIME;
      _heliPos.set(
        state.center.x + Math.cos(state.angle) * (ORBIT_RADIUS + t * 30),
        ORBIT_ALT + t * 20,
        state.center.z + Math.sin(state.angle) * (ORBIT_RADIUS + t * 30)
      );
      mesh.position.copy(_heliPos);
      mesh.rotation.y = -state.angle + Math.PI / 2;
      if (t >= 1.0) {
        state.active = false;
        state.phase = 'idle';
        mesh.visible = false;
        state.targets.length = 0;
      }
    }

    updateTracers(dt);
    updateSparks(dt);
    updateFlashes(dt);
    updateHUD();
  }

  return { update, reset, get isActive() { return state.active; } };
})();

window.AC130 = AC130;