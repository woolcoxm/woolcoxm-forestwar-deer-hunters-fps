// combat-drone.js — FORESTWAR hunter attack drone: hovering auto-turret companion with sentry-hold toggle
const THREE = window.THREE;
const SCENE = window.SCENE;
const CombatDrone = (() => {
  const FOLLOW_DIST = 3.5;
  const FOLLOW_HEIGHT = 2.5;
  const LERP = 4.5;
  const BOB_FREQ = 2.8;
  const TARGET_RANGE = 40;
  const TARGET_FOV_DOT = 0.3;
  const FIRE_RATE = 0.28;
  const DAMAGE = 13;
  const TRACER_LIFE = 0.06;
  const MUZZLE_LIGHT_LIFE = 0.05;
  const SENTRY_RADIUS = 3.0;
  const SENTRY_HEIGHT = 4.5;
  const ROT_SPEED = 5.5;
  const ACQUIRE_INTERVAL = 0.3;
  const TEAM = 'hunter';
  const TRACER_MAX = 30;
  const SPARK_MAX = 20;
  const SPARK_LIFE = 0.35;

  const state = {
    active: false,
    pos: new THREE.Vector3(0, FOLLOW_HEIGHT, FOLLOW_DIST),
    bobPhase: 0,
    target: null,
    fireCd: 0,
    acquireTimer: 0,
    yaw: 0,
    tilt: 0,
    sentryMode: false,
    sentryAnchor: new THREE.Vector3(),
    kills: 0,
    spinPhase: 0,
    spinVel: 0,
    glowPulse: 0,
    activeTime: 0,
  };

  const BODY_GEO = new THREE.OctahedronGeometry(0.34, 0);
  const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x884422, roughness: 0.4, metalness: 0.7, emissive: 0x441100, emissiveIntensity: 0.4 });
  const BARREL_GEO = new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6);
  BARREL_GEO.rotateX(Math.PI / 2);
  const BARREL_MAT = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.9 });
  const RING_GEO = new THREE.TorusGeometry(0.52, 0.045, 6, 22);
  const RING_MAT = new THREE.MeshBasicMaterial({ color: 0xff6633, transparent: true, opacity: 0.65 });
  const CORE_GEO = new THREE.SphereGeometry(0.13, 10, 8);
  const CORE_MAT = new THREE.MeshBasicMaterial({ color: 0xff4422 });
  const LENS_GEO = new THREE.SphereGeometry(0.07, 8, 6);
  const LENS_MAT = new THREE.MeshBasicMaterial({ color: 0xffaa22 });
  const FIN_GEO = new THREE.BoxGeometry(0.08, 0.08, 0.42);
  const FIN_MAT = new THREE.MeshStandardMaterial({ color: 0x553318, roughness: 0.5, metalness: 0.6 });
  const TRACER_GEO = new THREE.CylinderGeometry(0.02, 0.02, 1, 4);
  TRACER_GEO.rotateX(Math.PI / 2);
  const TRACER_MAT = new THREE.MeshBasicMaterial({ color: 0xffcc55, transparent: true, opacity: 0.85 });
  const SPARK_GEO = new THREE.SphereGeometry(0.08, 4, 3);
  const SPARK_MAT = new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 1 });
  const TRAIL_GEO = new THREE.SphereGeometry(0.1, 4, 3);
  const TRAIL_MAT = new THREE.MeshBasicMaterial({ color: 0xff6622, transparent: true, opacity: 0.4 });
  const SENTRY_MARKER_GEO = new THREE.RingGeometry(SENTRY_RADIUS - 0.3, SENTRY_RADIUS, 32);
  const SENTRY_MARKER_MAT = new THREE.MeshBasicMaterial({ color: 0xff6633, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });

  const tracers = [];
  for (let i = 0; i < TRACER_MAX; i++) {
    const mesh = new THREE.Mesh(TRACER_GEO, TRACER_MAT.clone());
    mesh.visible = false;
    mesh.frustumCulled = false;
    SCENE.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerIdx = 0;

  const sparks = [];
  for (let i = 0; i < SPARK_MAX; i++) {
    const mesh = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    mesh.visible = false;
    mesh.frustumCulled = false;
    SCENE.add(mesh);
    sparks.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  let sparkIdx = 0;

  const trails = [];
  for (let i = 0; i < 12; i++) {
    const mesh = new THREE.Mesh(TRAIL_GEO, TRAIL_MAT.clone());
    mesh.visible = false;
    mesh.frustumCulled = false;
    SCENE.add(mesh);
    trails.push({ mesh, life: 0, maxLife: 0.4 });
  }
  let trailIdx = 0;

  let light = null;
  const sentryMarker = new THREE.Mesh(SENTRY_MARKER_GEO, SENTRY_MARKER_MAT);
  sentryMarker.rotation.x = -Math.PI / 2;
  sentryMarker.visible = false;
  SCENE.add(sentryMarker);

  let mesh = null;
  let barrelPivot = null;
  let lensMesh = null;
  let coreMesh = null;

  function build() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(BODY_GEO, BODY_MAT);
    body.castShadow = true;
    g.add(body);

    barrelPivot = new THREE.Group();
    barrelPivot.position.set(0, 0, 0.15);
    g.add(barrelPivot);
    const barrel = new THREE.Mesh(BARREL_GEO, BARREL_MAT);
    barrel.position.z = 0.45;
    barrelPivot.add(barrel);
    lensMesh = new THREE.Mesh(LENS_GEO, LENS_MAT);
    lensMesh.position.set(0, 0.04, 0.32);
    barrelPivot.add(lensMesh);

    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(RING_GEO, RING_MAT.clone());
      ring.rotation.x = (i / 3) * Math.PI;
      ring.rotation.z = (i / 3) * Math.PI * 0.7;
      ring.userData.spin = (i % 2 === 0 ? 1 : -1) * (1.5 + i * 0.4);
      g.add(ring);
    }

    coreMesh = new THREE.Mesh(CORE_GEO, CORE_MAT);
    g.add(coreMesh);

    for (const sx of [-1, 1]) {
      const fin = new THREE.Mesh(FIN_GEO, FIN_MAT);
      fin.position.set(sx * 0.38, 0, -0.08);
      fin.rotation.z = sx * 0.35;
      g.add(fin);
    }

    light = new THREE.PointLight(0xff6633, 0.9, 5, 2);
    light.position.y = 0;
    g.add(light);
    return g;
  }

  function activate() {
    if (state.active) return;
    mesh = build();
    SCENE.add(mesh);
    state.active = true;
    const cam = window.CAMERA;
    if (cam) {
      const fwd = new THREE.Vector3();
      cam.getWorldDirection(fwd);
      state.pos.set(cam.position.x - fwd.x * FOLLOW_DIST, FOLLOW_HEIGHT, cam.position.z - fwd.z * FOLLOW_DIST);
    }
    if (window.FX && window.FX.message) {
      window.FX.message('COMBAT DRONE ONLINE — AUTO-TARGET MODE', '#ff8844');
    }
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(180, 0.3, 'sawtooth', 0.25, 1200);
      window.Sound.tone(360, 0.15, 'square', 0.15, 2000);
    }
    refreshHUD();
  }

  function deactivate() {
    if (!state.active) return;
    SCENE.remove(mesh);
    mesh = null;
    barrelPivot = null;
    lensMesh = null;
    coreMesh = null;
    state.active = false;
    state.target = null;
    state.sentryMode = false;
    sentryMarker.visible = false;
    for (const t of tracers) { t.life = 0; t.mesh.visible = false; }
    for (const s of sparks) { s.life = 0; s.mesh.visible = false; }
    for (const t of trails) { t.life = 0; t.mesh.visible = false; }
    if (window.FX && window.FX.message) {
      window.FX.message('COMBAT DRONE OFFLINE', '#888888');
    }
    refreshHUD();
  }

  function toggleSentry() {
    if (!state.active) return;
    state.sentryMode = !state.sentryMode;
    if (state.sentryMode) {
      state.sentryAnchor.copy(state.pos);
      sentryMarker.visible = true;
      if (window.FX && window.FX.message) {
        window.FX.message('DRONE: SENTRY HOLD', '#ff8844');
      }
    } else {
      sentryMarker.visible = false;
      if (window.FX && window.FX.message) {
        window.FX.message('DRONE: FOLLOW MODE', '#ff8844');
      }
    }
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(440, 0.12, 'square', 0.18, 1800);
    }
    refreshHUD();
  }

  const camDir = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const flatTarget = new THREE.Vector3();
  const muzzlePos = new THREE.Vector3();
  const muzzleDir = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const upVec = new THREE.Vector3(0, 1, 0);

  function acquireTarget() {
    const cam = window.CAMERA;
    if (!cam) return null;
    if (state.sentryMode) {
      flatTarget.set(state.sentryAnchor.x, SENTRY_HEIGHT, state.sentryAnchor.z);
    } else {
      cam.getWorldDirection(camDir);
      flatTarget.set(cam.position.x + camDir.x * 2, FOLLOW_HEIGHT, cam.position.z + camDir.z * 2);
    }
    let best = null;
    let bestDist = TARGET_RANGE;
    const ents = window.Entities && Array.isArray(window.Entities.list) ? window.Entities.list : [];
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.team === TEAM) continue;
      const m = e.mesh;
      if (!m) continue;
      toTarget.subVectors(m.position, flatTarget);
      const d = toTarget.length();
      if (d > bestDist) continue;
      if (d > 3.0) {
        toTarget.divideScalar(d);
        if (toTarget.dot(camDir) < TARGET_FOV_DOT && !state.sentryMode) continue;
      }
      best = e;
      bestDist = d;
    }
    return best;
  }

  function spawnTracer(from, to) {
    const slot = tracers[tracerIdx];
    tracerIdx = (tracerIdx + 1) % TRACER_MAX;
    slot.life = TRACER_LIFE;
    const dist = from.distanceTo(to);
    slot.mesh.position.lerpVectors(from, to, 0.5);
    slot.mesh.scale.set(1, 1, dist);
    tmpQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3().subVectors(to, from).normalize());
    slot.mesh.quaternion.copy(tmpQuat);
    slot.mesh.material.opacity = 0.85;
    slot.mesh.visible = true;
  }

  function spawnSparks(pos, normal) {
    for (let i = 0; i < 4; i++) {
      const slot = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % SPARK_MAX;
      slot.life = SPARK_LIFE * (0.6 + Math.random() * 0.6);
      slot.mesh.position.copy(pos);
      slot.vx = normal.x + (Math.random() - 0.5) * 4;
      slot.vy = Math.abs(normal.y) + 1.5 + Math.random() * 2.5;
      slot.vz = normal.z + (Math.random() - 0.5) * 4;
      slot.mesh.material.opacity = 1;
      const sc = 0.6 + Math.random() * 0.6;
      slot.mesh.scale.setScalar(sc);
      slot.mesh.visible = true;
    }
  }

  function fire() {
    if (!state.target || !barrelPivot) return;
    barrelPivot.getWorldPosition(muzzlePos);
    const tgt = state.target.mesh ? state.target.mesh.position : state.target;
    muzzleDir.subVectors(tgt, muzzlePos).normalize();
    spawnTracer(muzzlePos, tgt);
    spawnSparks(tgt, muzzleDir);
    // applyDamage() expects a source POSITION (it calls srcPos.clone() to aim the blood burst),
    // so hand it the muzzle position rather than an options object.
    const wasDead = state.target.dead;
    if (window.Entities && window.Entities.applyDamage) {
      window.Entities.applyDamage(state.target, DAMAGE, muzzlePos);
    } else if (state.target.hp !== undefined) {
      state.target.hp -= DAMAGE;
    }
    if (!wasDead && state.target.dead) state.kills++;
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(900 + Math.random() * 100, 0.05, 'square', 0.1, 2500);
    }
  }

  function emitTrail() {
    if (!mesh) return;
    const slot = trails[trailIdx];
    trailIdx = (trailIdx + 1) % trails.length;
    slot.life = slot.maxLife;
    slot.mesh.position.copy(mesh.position);
    const sc = 0.7 + Math.random() * 0.4;
    slot.mesh.scale.setScalar(sc);
    slot.mesh.material.opacity = 0.4;
    slot.mesh.visible = true;
  }

  function updateEntitiesList() {
    return window.Entities && Array.isArray(window.Entities.list) ? window.Entities.list : [];
  }

  function update(dt) {
    if (!state.active || !mesh) return;
    state.activeTime += dt;
    state.bobPhase += dt * BOB_FREQ;
    state.glowPulse += dt * 4.5;

    const cam = window.CAMERA;
    if (!cam) return;

    if (state.sentryMode) {
      desired.set(state.sentryAnchor.x, SENTRY_HEIGHT + Math.sin(state.bobPhase) * 0.2, state.sentryAnchor.z);
      sentryMarker.position.set(state.sentryAnchor.x, window.groundHeight ? window.groundHeight(state.sentryAnchor.x, state.sentryAnchor.z) + 0.05 : 0.05, state.sentryAnchor.z);
      const pulse = 0.2 + Math.sin(state.activeTime * 3) * 0.08;
      sentryMarker.material.opacity = pulse;
    } else {
      cam.getWorldDirection(camDir);
      desired.set(
        cam.position.x - camDir.x * FOLLOW_DIST + Math.cos(state.bobPhase * 0.7) * 0.3,
        FOLLOW_HEIGHT + Math.sin(state.bobPhase) * 0.25,
        cam.position.z - camDir.z * FOLLOW_DIST + Math.sin(state.bobPhase * 0.5) * 0.3
      );
    }
    state.pos.lerp(desired, Math.min(1, LERP * dt));
    const gy = window.groundHeight ? window.groundHeight(state.pos.x, state.pos.z) : 0;
    if (state.pos.y < gy + 1.2) state.pos.y = gy + 1.2;
    mesh.position.copy(state.pos);

    if (state.activeTime % 0.06 < dt) emitTrail();

    state.acquireTimer -= dt;
    if (state.acquireTimer <= 0) {
      state.acquireTimer = ACQUIRE_INTERVAL;
      state.target = acquireTarget();
    }
    if (state.target && (state.target.dead || !state.target.mesh)) {
      state.target = acquireTarget();
    }

    if (state.target && barrelPivot) {
      const tgt = state.target.mesh ? state.target.mesh.position : state.target;
      toTarget.subVectors(tgt, mesh.position);
      const flatYaw = Math.atan2(toTarget.x, toTarget.z);
      let yawDiff = flatYaw - state.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      state.yaw += yawDiff * Math.min(1, ROT_SPEED * dt);
      mesh.rotation.y = state.yaw;

      const horizDist = Math.sqrt(toTarget.x * toTarget.x + toTarget.z * toTarget.z);
      const desiredTilt = Math.atan2(toTarget.y, horizDist);
      let tiltDiff = desiredTilt - state.tilt;
      state.tilt += tiltDiff * Math.min(1, ROT_SPEED * 0.8 * dt);
      barrelPivot.rotation.x = state.tilt;

      const facingDot = Math.cos(yawDiff) * Math.cos(tiltDiff);
      if (Math.abs(yawDiff) < 0.15 && Math.abs(tiltDiff) < 0.2 && facingDot > 0.92) {
        state.fireCd -= dt;
        if (state.fireCd <= 0) {
          state.fireCd = FIRE_RATE;
          fire();
        }
      } else {
        state.fireCd = Math.max(0, state.fireCd - dt);
      }
    } else {
      state.fireCd = Math.max(0, state.fireCd - dt);
      if (state.sentryMode) {
        state.yaw += dt * 0.8;
        mesh.rotation.y = state.yaw;
        state.tilt *= 0.92;
        if (barrelPivot) barrelPivot.rotation.x = state.tilt;
      } else {
        let yawDiff = 0;
        if (camDir.lengthSq() > 0) {
          const camYaw = Math.atan2(-camDir.x, -camDir.z);
          yawDiff = camYaw - state.yaw;
          while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
          while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        }
        state.yaw += yawDiff * Math.min(1, 2.5 * dt);
        mesh.rotation.y = state.yaw;
        state.tilt *= 0.9;
        if (barrelPivot) barrelPivot.rotation.x = state.tilt;
      }
    }

    const spinSet = state.target ? 5.0 : 2.0;
    state.spinVel += (spinSet - state.spinPhase) * dt * 6;
    state.spinVel *= 0.92;
    state.spinPhase += state.spinVel * dt;
    const rings = mesh.children;
    for (let i = 0; i < rings.length; i++) {
      const c = rings[i];
      if (c.userData.spin !== undefined) {
        c.rotation.x += c.userData.spin * state.spinPhase * dt * 0.3;
        c.rotation.z += c.userData.spin * state.spinPhase * dt * 0.2;
      }
    }
    const coreGlow = 0.7 + Math.sin(state.glowPulse) * 0.3;
    if (coreMesh) coreMesh.scale.setScalar(0.8 + coreGlow * 0.4);
    if (light) light.intensity = 0.7 + coreGlow * 0.5;

    for (let i = 0; i < tracers.length; i++) {
      const t = tracers[i];
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) { t.mesh.visible = false; }
        else { t.mesh.material.opacity = (t.life / TRACER_LIFE) * 0.85; }
      }
    }
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      if (s.life > 0) {
        s.life -= dt;
        if (s.life <= 0) { s.mesh.visible = false; }
        else {
          s.vy -= 9 * dt;
          s.mesh.position.x += s.vx * dt;
          s.mesh.position.y += s.vy * dt;
          s.mesh.position.z += s.vz * dt;
          s.mesh.material.opacity = s.life / SPARK_LIFE;
        }
      }
    }
    for (let i = 0; i < trails.length; i++) {
      const t = trails[i];
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) { t.mesh.visible = false; }
        else {
          const frac = t.life / t.maxLife;
          t.mesh.material.opacity = frac * 0.4;
          t.mesh.scale.setScalar(frac * 1.1);
        }
      }
    }
    if (lensMesh) {
      const pulse = 0.5 + Math.sin(state.glowPulse * 2) * 0.5;
      lensMesh.material.color.setRGB(1.0, 0.67 + pulse * 0.2, 0.13 + pulse * 0.1);
    }
    refreshHUD();
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'p' && e.key !== 'P') return;
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    const pt = (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
    if (pt !== 'hunter') {
      if (window.FX && window.FX.message) window.FX.message('COMBAT DRONE: HUNTERS ONLY', '#ff6644');
      return;
    }
    if (e.shiftKey) toggleSentry();
    else {
      if (state.active) deactivate();
      else activate();
    }
  });

  if (window.Squads && window.Squads.registerKillTracker) {
    try { window.Squads.registerKillTracker('drone', () => state.kills); } catch (e) {}
  }

  function buildHUD() {
    const hud = document.createElement('div');
    hud.style.cssText = 'position:absolute;left:16px;bottom:290px;font-size:11px;letter-spacing:2px;color:#ff8844;text-shadow:0 1px 3px #000;z-index:6;';
    const label = document.createElement('div');
    label.textContent = 'ATK DRONE [P]';
    hud.appendChild(label);
    const sub = document.createElement('div');
    sub.style.cssText = 'font-size:9px;letter-spacing:1px;color:#aa6644;margin-top:1px;';
    sub.textContent = 'SHIFT+P: SENTRY';
    hud.appendChild(sub);
    const status = document.createElement('div');
    status.style.cssText = 'margin-top:3px;font-size:10px;color:#ff6633;';
    status.textContent = 'OFFLINE';
    hud.appendChild(status);
    const kills = document.createElement('div');
    kills.style.cssText = 'margin-top:1px;font-size:10px;color:#ccaa66;';
    kills.textContent = 'KILLS: 0';
    hud.appendChild(kills);
    document.getElementById('hud').appendChild(hud);
    state._hud = { status, kills };
  }
  buildHUD();

  function refreshHUD() {
    if (!state._hud) return;
    if (state.active) {
      state._hud.status.textContent = state.sentryMode ? 'SENTRY HOLD' : 'ACTIVE';
      state._hud.status.style.color = state.sentryMode ? '#ffaa44' : '#88ff44';
    } else {
      state._hud.status.textContent = 'OFFLINE';
      state._hud.status.style.color = '#ff6633';
    }
    state._hud.kills.textContent = 'KILLS: ' + state.kills;
  }

  return { activate, deactivate, toggleSentry, update, refreshHUD, get kills() { return state.kills; }, get active() { return state.active; }, get sentryMode() { return state.sentryMode; } };
})();
window.CombatDrone = CombatDrone;