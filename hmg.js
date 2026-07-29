// hmg.js — FORESTWAR heavy machine gun emplacement: mountable ground turret with rapid hitscan fire
const THREE = window.THREE;
const SCENE = window.SCENE;
const HMG = (() => {
  const MOUNT_RANGE = 3.0;
  const FIRE_RATE = 0.07;
  const DAMAGE = 16;
  const RANGE = 140;
  const SPREAD_BASE = 0.008;
  const SPREAD_MAX = 0.05;
  const HEAT_PER_SHOT = 0.8;
  const HEAT_DECAY = 22;
  const HEAT_COOLDOWN_THRESHOLD = 95;
  const TRACER_LIFE = 0.06;
  const TRACER_POOL = 16;
  const SHELL_EJECT_SPEED = 4.0;
  const SHELL_LIFE = 0.8;
  const SHELL_GRAVITY = 16;
  const SHELL_POOL = 24;
  const MUZZLE_LIGHT_LIFE = 0.04;
  const TRACER_LEN = 3.0;
  const OVERHEAT_PENALTY = 2.0;

  const BIPOD_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2a20, roughness: 0.6, metalness: 0.7 });
  const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x3a3a2e, roughness: 0.5, metalness: 0.6 });
  const BARREL_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1a14, roughness: 0.3, metalness: 0.9 });
  const AMMO_BOX_MAT = new THREE.MeshStandardMaterial({ color: 0x4a3a22, roughness: 0.8 });
  const HANDLE_MAT = new THREE.MeshStandardMaterial({ color: 0x222218, roughness: 0.7 });
  const SHELL_MAT = new THREE.MeshStandardMaterial({ color: 0xddaa44, roughness: 0.4, metalness: 0.6 });

  const emplacements = [];

  const BASE_GEO = new THREE.CylinderGeometry(0.55, 0.7, 0.25, 10);
  const BIPOD_LEG_GEO = new THREE.CylinderGeometry(0.04, 0.05, 1.0, 5);
  BIPOD_LEG_GEO.rotateX(0.35);
  const GUN_BODY_GEO = new THREE.BoxGeometry(0.85, 0.28, 0.4);
  const BARREL_GEO = new THREE.CylinderGeometry(0.055, 0.055, 1.4, 8);
  BARREL_GEO.rotateX(Math.PI / 2);
  const BARREL_JACKET_GEO = new THREE.CylinderGeometry(0.09, 0.09, 0.9, 8);
  BARREL_JACKET_GEO.rotateX(Math.PI / 2);
  const AMMO_BOX_GEO = new THREE.BoxGeometry(0.3, 0.22, 0.4);
  const HANDLE_GEO = new THREE.BoxGeometry(0.04, 0.18, 0.24);
  const SHELL_GEO = new THREE.CylinderGeometry(0.018, 0.018, 0.07, 5);

  function buildEmplacement(x, z) {
    const group = new THREE.Group();
    const gy = (window.groundHeight ? window.groundHeight(x, z) : 0);
    group.position.set(x, gy, z);

    const base = new THREE.Mesh(BASE_GEO, BIPOD_MAT);
    base.castShadow = true;
    base.position.y = 0.12;
    group.add(base);

    const pivot = new THREE.Group();
    pivot.position.y = 0.25;
    group.add(pivot);

    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(BIPOD_LEG_GEO, BODY_MAT);
      leg.castShadow = true;
      leg.position.set(sx * 0.25, -0.1, 0.25);
      leg.rotation.y = sx * -0.15;
      pivot.add(leg);
    }

    const gunBody = new THREE.Mesh(GUN_BODY_GEO, BODY_MAT);
    gunBody.castShadow = true;
    gunBody.position.y = 0.12;
    pivot.add(gunBody);

    const barrel = new THREE.Mesh(BARREL_GEO, BARREL_MAT);
    barrel.castShadow = true;
    barrel.position.set(0, 0.14, 0.9);
    pivot.add(barrel);

    const jacket = new THREE.Mesh(BARREL_JACKET_GEO, BARREL_MAT);
    jacket.position.set(0, 0.14, 0.55);
    pivot.add(jacket);

    const ammoBox = new THREE.Mesh(AMMO_BOX_GEO, AMMO_BOX_MAT);
    ammoBox.position.set(0.28, 0.18, -0.1);
    pivot.add(ammoBox);

    for (const sx of [-1, 1]) {
      const handle = new THREE.Mesh(HANDLE_GEO, HANDLE_MAT);
      handle.position.set(sx * 0.18, 0.1, -0.05);
      pivot.add(handle);
    }

    SCENE.add(group);

    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffee66, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), flashMat);
    flash.position.set(0, 0.14, 1.65);
    pivot.add(flash);

    const light = new THREE.PointLight(0xffcc55, 0, 8, 2);
    light.position.set(0, 0.14, 1.65);
    pivot.add(light);

    const ep = {
      group,
      pivot,
      flash,
      light,
      x, z,
      cd: 0,
      heat: 0,
      overheated: false,
      fireTimer: 0,
      shells: [],
      shellIdx: 0,
    };

    for (let i = 0; i < SHELL_POOL; i++) {
      const mesh = new THREE.Mesh(SHELL_GEO, SHELL_MAT);
      mesh.visible = false;
      mesh.frustumCulled = false;
      SCENE.add(mesh);
      ep.shells.push({ mesh, vx: 0, vy: 0, vz: 0, spin: 0, life: 0, active: false });
    }

    emplacements.push(ep);
  }

  const TRACER_GEO = new THREE.CylinderGeometry(0.015, 0.004, 1, 4);
  TRACER_GEO.rotateX(Math.PI / 2);
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(TRACER_GEO, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    SCENE.add(mesh);
    tracers.push({ mesh, life: 0, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, active: false });
  }
  let tracerIdx = 0;

  function spawnTracer(ax, ay, az, bx, by, bz) {
    const t = tracers[tracerIdx];
    tracerIdx = (tracerIdx + 1) % TRACER_POOL;
    t.ax = ax; t.ay = ay; t.az = az;
    t.bx = bx; t.by = by; t.bz = bz;
    t.life = TRACER_LIFE;
    t.active = true;
    t.mesh.visible = true;
    t.mesh.material.opacity = 0.8;
    t.mesh.position.set((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5);
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const showLen = Math.min(TRACER_LEN, dist);
    t.mesh.scale.set(1, 1, showLen);
    t.mesh.lookAt(bx, by, bz);
  }

  function ejectShell(ep) {
    const s = ep.shells[ep.shellIdx];
    ep.shellIdx = (ep.shellIdx + 1) % SHELL_POOL;
    const wx = ep.pivot.localToWorld(new THREE.Vector3(0.25, 0.18, -0.1));
    s.mesh.position.copy(wx);
    s.vx = 2.5 + Math.random() * 1.5;
    s.vy = SHELL_EJECT_SPEED + Math.random() * 1.5;
    s.vz = (Math.random() - 0.5) * 1.5;
    const fwd = new THREE.Vector3();
    ep.pivot.getWorldDirection(fwd);
    s.vx += -fwd.x * 2;
    s.vz += -fwd.z * 2;
    s.spin = (Math.random() - 0.5) * 12;
    s.life = SHELL_LIFE;
    s.active = true;
    s.mesh.visible = true;
  }

  function damageEnemies(ep, origin, dir) {
    const pt = (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
    const ents = window.Entities && window.Entities.list ? window.Entities.list : [];
    let best = null;
    let bestT = RANGE;
    const _tmp = new THREE.Vector3();
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.team === pt) continue;
      if (!e.mesh) continue;
      _tmp.subVectors(e.mesh.position, origin);
      _tmp.y += 0.8;
      const dist = _tmp.length();
      if (dist > RANGE) continue;
      _tmp.divideScalar(dist);
      const dot = _tmp.dot(dir);
      if (dot < 0.985) continue;
      if (dist < bestT) { bestT = dist; best = e; }
    }
    if (best && window.Entities && window.Entities.damage) {
      window.Entities.damage(best, DAMAGE, pt);
    }
    return bestT;
  }

  function tryFire(ep) {
    if (ep.cd > 0 || ep.overheated) return;
    ep.cd = FIRE_RATE;
    ep.heat = Math.min(100, ep.heat + HEAT_PER_SHOT);
    if (ep.heat >= HEAT_COOLDOWN_THRESHOLD) {
      ep.overheated = true;
      ep.fireTimer = OVERHEAT_PENALTY;
    }
    const muzzleWorld = new THREE.Vector3(0, 0.14, 1.65);
    ep.pivot.localToWorld(muzzleWorld);
    const dir = new THREE.Vector3();
    ep.pivot.getWorldDirection(dir);
    const spread = SPREAD_BASE + (ep.heat / 100) * (SPREAD_MAX - SPREAD_BASE);
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
    const hitDist = damageEnemies(ep, muzzleWorld, dir);
    const endX = muzzleWorld.x + dir.x * Math.min(hitDist, RANGE);
    const endY = muzzleWorld.y + dir.y * Math.min(hitDist, RANGE);
    const endZ = muzzleWorld.z + dir.z * Math.min(hitDist, RANGE);
    spawnTracer(muzzleWorld.x, muzzleWorld.y, muzzleWorld.z, endX, endY, endZ);
    ep.flash.material.opacity = 1;
    ep.flash.scale.setScalar(0.8 + Math.random() * 0.4);
    ep.light.intensity = 4;
    ejectShell(ep);
    if (window.Sound && window.Sound.shot) window.Sound.shot();
    if (window.FX && window.FX.shake) window.FX.shake(0.018);
  }

  const state = {
    mounted: null,
    camFov: 75,
    locked: false,
  };

  function findNearest(x, z) {
    let best = null;
    let bestD = MOUNT_RANGE * MOUNT_RANGE;
    for (let i = 0; i < emplacements.length; i++) {
      const ep = emplacements[i];
      const dx = ep.x - x, dz = ep.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = ep; }
    }
    return best;
  }

  function dismount() {
    if (!state.mounted) return;
    const cam = window.CAMERA;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const ep = state.mounted;
    const gy = (window.groundHeight ? window.groundHeight(ep.x, ep.z) : 0);
    cam.position.set(ep.x + fwd.x * 2.5, gy + 1.7, ep.z + fwd.z * 2.5);
    cam.fov = state.camFov;
    cam.updateProjectionMatrix();
    if (window.Player && window.Player.state) {
      window.Player.state.locked = false;
    }
    state.mounted = null;
    if (window.FX && window.FX.message) window.FX.message('DISMOUNTED', '#c9d8ff');
  }

  function mount(ep) {
    const cam = window.CAMERA;
    state.camFov = cam.fov;
    state.mounted = ep;
    if (window.Player && window.Player.state) {
      window.Player.state.locked = false;
    }
    state.locked = true;
    if (window.FX && window.FX.message) window.FX.message('MOUNTED HMG [E to dismount]', '#ffaa44');
  }

  function onKey(e) {
    if (e.key !== 'e' && e.key !== 'E') return;
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    if (state.mounted) { dismount(); return; }
    const cam = window.CAMERA;
    if (!cam) return;
    const ep = findNearest(cam.position.x, cam.position.z);
    if (ep) mount(ep);
  }

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;bottom:44px;left:50%;transform:translateX(-50%);'
    + 'width:220px;text-align:center;pointer-events:none;z-index:6;opacity:0;'
    + 'transition:opacity 0.2s;';
  const label = document.createElement('div');
  label.style.cssText = 'font-size:10px;letter-spacing:3px;color:#ffaa44;margin-bottom:3px;text-shadow:0 1px 3px #000;';
  label.textContent = 'MOUNTED HMG';
  hud.appendChild(label);
  const heatWrap = document.createElement('div');
  heatWrap.style.cssText = 'width:100%;height:7px;background:rgba(0,0,0,0.55);'
    + 'border:1px solid rgba(255,170,60,0.35);border-radius:4px;overflow:hidden;';
  const heatFill = document.createElement('div');
  heatFill.style.cssText = 'width:0%;height:100%;background:linear-gradient(90deg,#ff8822,#ffdd55);border-radius:2px;transition:width 0.04s;';
  heatWrap.appendChild(heatFill);
  hud.appendChild(heatWrap);
  document.getElementById('hud').appendChild(hud);

  const hint = document.createElement('div');
  hint.style.cssText = 'position:absolute;bottom:52%;left:50%;transform:translateX(-50%);'
    + 'font-size:13px;letter-spacing:3px;color:#ffaa44;text-shadow:0 0 8px rgba(255,140,0,0.6),0 2px 5px #000;'
    + 'pointer-events:none;z-index:6;opacity:0;transition:opacity 0.2s;font-weight:bold;white-space:nowrap;';
  hint.textContent = '[E] MOUNT HMG';
  document.getElementById('hud').appendChild(hint);

  let lastHintState = false;

  function update(dt) {
    for (let i = 0; i < emplacements.length; i++) {
      const ep = emplacements[i];
      ep.cd = Math.max(0, ep.cd - dt);
      if (ep.overheated) {
        ep.fireTimer -= dt;
        ep.heat = Math.max(0, ep.heat - HEAT_DECAY * 1.5 * dt);
        if (ep.fireTimer <= 0 && ep.heat < 30) ep.overheated = false;
      } else {
        ep.heat = Math.max(0, ep.heat - HEAT_DECAY * dt);
      }
      ep.flash.material.opacity = Math.max(0, ep.flash.material.opacity - dt * 20);
      ep.light.intensity = Math.max(0, ep.light.intensity - dt * 80);

      for (let j = 0; j < ep.shells.length; j++) {
        const s = ep.shells[j];
        if (!s.active) continue;
        s.vy -= SHELL_GRAVITY * dt;
        s.mesh.position.x += s.vx * dt;
        s.mesh.position.y += s.vy * dt;
        s.mesh.position.z += s.vz * dt;
        s.mesh.rotation.x += s.spin * dt;
        s.life -= dt;
        if (s.life <= 0) { s.active = false; s.mesh.visible = false; }
      }
    }

    for (let i = 0; i < tracers.length; i++) {
      const t = tracers[i];
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) { t.active = false; t.mesh.visible = false; }
      else t.mesh.material.opacity = (t.life / TRACER_LIFE) * 0.8;
    }

    const cam = window.CAMERA;
    const ms = window.Manager && window.Manager.state ? window.Manager.state : null;
    const playing = ms && ms.phase === 'playing';

    let showHint = false;
    if (playing && cam && !state.mounted) {
      const near = findNearest(cam.position.x, cam.position.z);
      if (near) showHint = true;
    }
    if (showHint !== lastHintState) {
      hint.style.opacity = showHint ? '0.85' : '0';
      lastHintState = showHint;
    }

    if (state.mounted) {
      hud.style.opacity = '1';
      heatFill.style.width = state.mounted.heat + '%';
      if (state.mounted.overheated) {
        heatFill.style.background = 'linear-gradient(90deg,#ff2200,#ff6633)';
        label.textContent = 'OVERHEATED';
        label.style.color = '#ff3322';
      } else {
        heatFill.style.background = 'linear-gradient(90deg,#ff8822,#ffdd55)';
        label.textContent = 'MOUNTED HMG';
        label.style.color = '#ffaa44';
      }
      if (!playing) { dismount(); return; }

      const ep = state.mounted;
      const mx = window.MOUSE_X || 0;
      const my = window.MOUSE_Y || 0;
      ep.pivot.rotation.y -= mx * 0.0025;
      const desiredPitch = THREE.MathUtils.clamp(ep.pivot.rotation.x - my * 0.0025, -0.35, 0.35);
      ep.pivot.rotation.x = desiredPitch;

      const camPos = new THREE.Vector3();
      ep.pivot.localToWorld(camPos.set(0, 1.3, -0.5));
      const camLook = new THREE.Vector3();
      ep.pivot.localToWorld(camLook.set(0, 1.1, 5));
      cam.position.lerp(camPos, 0.25);
      cam.lookAt(camLook);
      cam.fov = THREE.MathUtils.lerp(cam.fov, 68, 0.12);
      cam.updateProjectionMatrix();

      if (window.MOUSE_DOWN && ep.heat < HEAT_COOLDOWN_THRESHOLD && !ep.overheated) {
        tryFire(ep);
      }
    } else {
      hud.style.opacity = '0';
    }
  }

  function init() {
    const spots = [
      { x: 8, z: 12 },
      { x: -20, z: 30 },
      { x: 45, z: -15 },
      { x: -35, z: -25 },
      { x: 0, z: 55 },
    ];
    for (const s of spots) buildEmplacement(s.x, s.z);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0 && state.mounted) window.MOUSE_DOWN = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) window.MOUSE_DOWN = false;
    });
    window.addEventListener('mousemove', (e) => {
      window.MOUSE_X = e.movementX || 0;
      window.MOUSE_Y = e.movementY || 0;
    });
  }

  function reset() {
    if (state.mounted) dismount();
    for (const ep of emplacements) {
      ep.heat = 0;
      ep.overheated = false;
      ep.cd = 0;
    }
  }

  return { init, update, reset, state };
})();
window.HMG = HMG;