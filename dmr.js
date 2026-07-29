// dmr.js — FORESTWAR scoped marksman rifle: semi-auto high-damage, right-click ADS zoom, scope reticle
const THREE = window.THREE;
const SCENE = window.SCENE;
const CAMERA = window.CAMERA;

const DMR = (() => {
  const DAMAGE = 58;
  const RANGE = 200;
  const FIRE_RATE = 0.35;
  const MAG_SIZE = 10;
  const RELOAD_TIME = 2.6;
  const TOTAL_AMMO_MAX = 40;
  const SPREAD_HIP = 0.04;
  const SPREAD_ADS = 0.003;
  const RECOIL_V = 0.025;
  const RECOIL_H = 0.005;
  const RECOIL_RECOVERY = 7.0;
  const ADS_FOV = 35;
  const ADS_LERP = 12;
  const SCOPE_RANGE = 250;
  const SCOPE_DOT = 0.97;
  const TRACER_LIFE = 0.08;
  const SHELL_EJECT_SPEED = 3.5;
  const HEADSHOT_MULT = 2.2;

  const state = {
    unlocked: true,
    slot: 3,
    ammo: MAG_SIZE,
    reserve: TOTAL_AMMO_MAX,
    cd: 0,
    reloading: false,
    reloadTimer: 0,
    aiming: false,
    active: false,
    fovDefault: 75,
    fovCurrent: 75,
    recoilPitch: 0,
    recoilYaw: 0,
    swayPhase: 0,
    swayX: 0,
    swayY: 0,
    boltTimer: 0,
    chambered: true,
    lastFire: 0,
  };

  const TRACER_GEO = new THREE.CylinderGeometry(0.015, 0.005, 1, 4);
  TRACER_GEO.rotateX(Math.PI / 2);
  const TRACER_MAT = new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });

  const SHELL_GEO = new THREE.CylinderGeometry(0.025, 0.025, 0.1, 5);
  const SHELL_MAT = new THREE.MeshStandardMaterial({ color: 0xddaa44, roughness: 0.4, metalness: 0.6 });

  const MUZZLE_GEO = new THREE.SphereGeometry(0.18, 8, 6);
  const MUZZLE_MAT = new THREE.MeshBasicMaterial({ color: 0xffee66, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const muzzleFlash = new THREE.Mesh(MUZZLE_GEO, MUZZLE_MAT.clone());
  muzzleFlash.visible = false;
  SCENE.add(muzzleFlash);

  const muzzleLight = new THREE.PointLight(0xffcc55, 0, 10, 2);
  SCENE.add(muzzleLight);

  const tracers = [];
  for (let i = 0; i < 8; i++) {
    const t = new THREE.Mesh(TRACER_GEO, TRACER_MAT.clone());
    t.visible = false;
    t.frustumCulled = false;
    SCENE.add(t);
    tracers.push({ mesh: t, life: 0, start: new THREE.Vector3(), end: new THREE.Vector3() });
  }
  let tracerIdx = 0;

  const shells = [];
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Mesh(SHELL_GEO, SHELL_MAT);
    s.visible = false;
    s.frustumCulled = false;
    SCENE.add(s);
    shells.push({ mesh: s, vel: new THREE.Vector3(), spin: 0, life: 0, active: false });
  }
  let shellIdx = 0;

  const viewmodel = buildViewmodel();
  viewmodel.visible = false;
  SCENE.add(viewmodel);

  const scopeOverlay = buildScopeOverlay();
  scopeOverlay.style.display = 'none';
  document.getElementById('hud').appendChild(scopeOverlay);

  const ammoEl = document.createElement('div');
  ammoEl.style.cssText = 'position:absolute;bottom:30px;right:16px;font-size:22px;font-weight:bold;color:#ffe088;letter-spacing:2px;text-shadow:0 2px 6px #000;z-index:6;display:none;';
  ammoEl.textContent = '10 / 40';
  document.getElementById('hud').appendChild(ammoEl);

  const label = document.createElement('div');
  label.style.cssText = 'position:absolute;bottom:60px;right:16px;font-size:10px;letter-spacing:3px;color:#ddcc77;text-shadow:0 1px 3px #000;z-index:6;display:none;';
  label.textContent = 'DMR [4]';
  document.getElementById('hud').appendChild(label);

  const _ray = new THREE.Raycaster();
  const _origin = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _hitPoint = new THREE.Vector3();
  const _normal = new THREE.Vector3();
  const _tmpV = new THREE.Vector3();
  const _camForward = new THREE.Vector3();

  function buildViewmodel() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2418, roughness: 0.6, metalness: 0.4 });
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a14, roughness: 0.4, metalness: 0.7 });
    const scopeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.8 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x224488, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.3, emissive: 0x113355, emissiveIntensity: 0.3 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.9), mat);
    body.position.set(0.22, -0.18, -0.55);
    g.add(body);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8), barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.22, -0.15, -1.05);
    g.add(barrel);

    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.08, 8), barrelMat);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0.22, -0.15, -1.37);
    g.add(muzzle);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.12), mat);
    mag.position.set(0.22, -0.32, -0.42);
    g.add(mag);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.35), mat);
    stock.position.set(0.22, -0.17, -0.1);
    g.add(stock);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), mat);
    grip.position.set(0.22, -0.3, -0.22);
    grip.rotation.x = 0.2;
    g.add(grip);

    const scopeBody = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 12), scopeMat);
    scopeBody.rotation.x = Math.PI / 2;
    scopeBody.position.set(0.22, -0.05, -0.6);
    g.add(scopeBody);

    const scopeFront = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12), scopeMat);
    scopeFront.rotation.x = Math.PI / 2;
    scopeFront.position.set(0.22, -0.05, -0.76);
    g.add(scopeFront);

    const scopeRear = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 12), scopeMat);
    scopeRear.rotation.x = Math.PI / 2;
    scopeRear.position.set(0.22, -0.05, -0.44);
    g.add(scopeRear);

    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), glassMat);
    lens.position.set(0.22, -0.05, -0.762);
    lens.rotation.y = Math.PI / 2;
    g.add(lens);

    const frontLens = new THREE.Mesh(new THREE.CircleGeometry(0.038, 12), glassMat);
    frontLens.position.set(0.22, -0.05, -0.438);
    frontLens.rotation.y = -Math.PI / 2;
    g.add(frontLens);

    const bipodL = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 4), barrelMat);
    bipodL.position.set(0.2, -0.28, -0.9);
    bipodL.rotation.z = 0.4;
    g.add(bipodL);
    const bipodR = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 4), barrelMat);
    bipodR.position.set(0.24, -0.28, -0.9);
    bipodR.rotation.z = -0.4;
    g.add(bipodR);

    g.position.set(0.3, -0.3, -0.2);
    return g;
  }

  function buildScopeOverlay() {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:8;';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.cssText = 'position:absolute;inset:0;';
    const cx = 50, cy = 50;
    const lines = [
      `<circle cx="${cx}%" cy="${cy}%" r="42%" fill="none" stroke="rgba(0,0,0,0.92)" stroke-width="16%"/>`,
      `<circle cx="${cx}%" cy="${cy}%" r="40%" fill="none" stroke="rgba(20,15,5,0.75)" stroke-width="2%"/>`,
      `<line x1="${cx}%" y1="0%" x2="${cx}%" y2="${cy - 3}%" stroke="rgba(255,50,30,0.6)" stroke-width="1"/>`,
      `<line x1="${cx}%" y1="${cy + 3}%" x2="${cx}%" y2="100%" stroke="rgba(255,50,30,0.6)" stroke-width="1"/>`,
      `<line x1="0%" y1="${cy}%" x2="${cx - 3}%" y2="${cy}%" stroke="rgba(255,50,30,0.6)" stroke-width="1"/>`,
      `<line x1="${cx + 3}%" y1="${cy}%" x2="100%" y2="${cy}%" stroke="rgba(255,50,30,0.6)" stroke-width="1"/>`,
      `<circle cx="${cx}%" cy="${cy}%" r="1.5" fill="rgba(255,40,20,0.85)"/>`,
      `<circle cx="${cx}%" cy="${cy}%" r="0.8" fill="rgba(255,200,100,1)"/>`,
      `<circle cx="${cx}%" cy="${cy - 7}%" r="0.6" fill="rgba(255,40,20,0.7)"/>`,
      `<circle cx="${cx}%" cy="${cy + 7}%" r="0.6" fill="rgba(255,40,20,0.7)"/>`,
      `<circle cx="${cx - 7}%" cy="${cy}%" r="0.6" fill="rgba(255,40,20,0.7)"/>`,
      `<circle cx="${cx + 7}%" cy="${cy}%" r="0.6" fill="rgba(255,40,20,0.7)"/>`,
      `<circle cx="${cx}%" cy="${cy - 14}%" r="0.5" fill="rgba(255,40,20,0.5)"/>`,
      `<circle cx="${cx}%" cy="${cy + 14}%" r="0.5" fill="rgba(255,40,20,0.5)"/>`,
      `<circle cx="${cx - 14}%" cy="${cy}%" r="0.5" fill="rgba(255,40,20,0.5)"/>`,
      `<circle cx="${cx + 14}%" cy="${cy}%" r="0.5" fill="rgba(255,40,20,0.5)"/>`,
    ];
    svg.innerHTML = lines.join('');
    el.appendChild(svg);
    return el;
  }

  function isActive() { return state.active; }

  function activate() {
    if (!state.unlocked) return;
    state.active = true;
    viewmodel.visible = true;
    ammoEl.style.display = 'block';
    label.style.display = 'block';
    updateHUD();
  }

  function deactivate() {
    state.active = false;
    state.aiming = false;
    viewmodel.visible = false;
    scopeOverlay.style.display = 'none';
    ammoEl.style.display = 'none';
    label.style.display = 'none';
    CAMERA.fov = state.fovDefault;
    CAMERA.updateProjectionMatrix();
  }

  function startAim() {
    if (!state.active || state.reloading) return;
    state.aiming = true;
    scopeOverlay.style.display = 'block';
  }

  function stopAim() {
    if (!state.aiming) return;
    state.aiming = false;
    scopeOverlay.style.display = 'none';
  }

  function fire() {
    if (!state.active || state.cd > 0 || state.reloading) return;
    if (!state.chambered) return;
    if (state.ammo <= 0) {
      if (window.Sound) window.Sound.tone(180, 0.08, 'square', 0.15, 600);
      state.cd = 0.3;
      return;
    }
    const p = window.Player ? window.Player.state : null;
    if (p && p.stamina < 6) {
      if (window.FX) window.FX.message('TOO EXHAUSTED', '#ff6644');
      return;
    }
    if (p) {
      p.stamina -= 5;
      if (p.regenTimer !== undefined) p.regenTimer = 1.2;
    }

    state.ammo--;
    state.cd = FIRE_RATE;
    state.chambered = false;
    state.boltTimer = FIRE_RATE * 0.5;
    state.lastFire = performance.now() / 1000;

    CAMERA.getWorldDirection(_camForward);
    _origin.copy(CAMERA.position);
    const spread = state.aiming ? SPREAD_ADS : SPREAD_HIP;
    _dir.copy(_camForward);
    _dir.x += (Math.random() - 0.5) * spread;
    _dir.y += (Math.random() - 0.5) * spread;
    _dir.z += (Math.random() - 0.5) * spread;
    _dir.normalize();

    const pitch = CAMERA.rotation.x;
    const yaw = CAMERA.rotation.y;
    state.recoilPitch += RECOIL_V;
    state.recoilYaw += (Math.random() - 0.5) * RECOIL_H * 2;
    CAMERA.rotation.x = Math.max(-Math.PI / 2 + 0.05, pitch + RECOIL_V);
    CAMERA.rotation.y = yaw + (Math.random() - 0.5) * RECOIL_H * 2;

    muzzleFlash.position.copy(_origin).addScaledVector(_dir, 0.8);
    muzzleFlash.material.opacity = 1;
    muzzleFlash.scale.setScalar(0.8 + Math.random() * 0.4);
    muzzleFlash.visible = true;
    muzzleLight.position.copy(muzzleFlash.position);
    muzzleLight.intensity = 5;

    _ray.set(_origin, _dir);
    _ray.far = RANGE;

    let hitEnt = null;
    let hitDist = RANGE;
    let hitHead = false;
    const ents = window.Entities && window.Entities.list ? window.Entities.list : [];
    const playerTeam = window.Manager && window.Manager.state ? window.Manager.state.playerTeam : 'hunter';
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.team === playerTeam) continue;
      const m = e.mesh;
      if (!m) continue;
      const ep = m.position;
      const dx = ep.x - _origin.x;
      const dy = (ep.y + 1.0) - _origin.y;
      const dz = ep.z - _origin.z;
      const proj = dx * _dir.x + dy * _dir.y + dz * _dir.z;
      if (proj < 0 || proj > RANGE) continue;
      const px = _origin.x + _dir.x * proj;
      const py = _origin.y + _dir.y * proj;
      const pz = _origin.z + _dir.z * proj;
      const perp = Math.sqrt((ep.x - px) ** 2 + (ep.z - pz) ** 2);
      if (perp < 0.7 && proj < hitDist) {
        hitEnt = e;
        hitDist = proj;
        hitHead = false;
      }
      const headY = ep.y + 1.65;
      const hdy = headY - _origin.y;
      const hProj = dx * _dir.x + hdy * _dir.y + dz * _dir.z;
      if (hProj > 0 && hProj < RANGE) {
        const hpx = _origin.x + _dir.x * hProj;
        const hpz = _origin.z + _dir.z * hProj;
        const hperp = Math.sqrt((ep.x - hpx) ** 2 + (ep.z - hpz) ** 2);
        if (hperp < 0.35 && hProj < hitDist) {
          hitEnt = e;
          hitDist = hProj;
          hitHead = true;
        }
      }
    }

    if (hitEnt) {
      const dmg = DAMAGE * (hitHead ? HEADSHOT_MULT : 1);
      if (window.Entities && window.Entities.damage) {
        window.Entities.damage(hitEnt, dmg, _dir, playerTeam);
      }
      if (window.CombatText && window.CombatText.spawn) {
        _hitPoint.copy(_origin).addScaledVector(_dir, hitDist);
        window.CombatText.spawn(_hitPoint, Math.round(dmg), { crit: hitHead });
      }
      if (window.FX && window.FX.bloodBurst) {
        _hitPoint.copy(_origin).addScaledVector(_dir, hitDist);
        _normal.copy(_dir).negate();
        window.FX.bloodBurst(_hitPoint, _normal);
      }
      if (window.Suppression && window.Suppression.applyNearMiss) {
        window.Suppression.applyNearMiss(_hitPoint.x, _hitPoint.z, playerTeam);
      }
    } else {
      const trees = window.TREES || [];
      for (let i = 0; i < trees.length; i++) {
        const t = trees[i];
        const tx = t.x - _origin.x;
        const tz = t.z - _origin.z;
        const proj = tx * _dir.x + tz * _dir.z;
        if (proj < 1 || proj > hitDist) continue;
        const px = _dir.x * proj + _origin.x;
        const pz = _dir.z * proj + _origin.z;
        const perp = Math.sqrt((t.x - px) ** 2 + (t.z - pz) ** 2);
        if (perp < t.r) {
          hitDist = proj;
          hitEnt = null;
        }
      }
      if (!hitEnt) {
        _hitPoint.copy(_origin).addScaledVector(_dir, hitDist);
        if (window.FX && window.FX.burst) {
          _normal.set(0, 1, 0);
          window.FX.burst(_hitPoint, _normal, 0x888866, 6);
        }
      }
    }

    _hitPoint.copy(_origin).addScaledVector(_dir, hitDist);
    const tracer = tracers[tracerIdx];
    tracerIdx = (tracerIdx + 1) % tracers.length;
    tracer.start.copy(_origin).addScaledVector(_dir, 0.6);
    tracer.end.copy(_hitPoint);
    tracer.life = TRACER_LIFE;
    tracer.mesh.visible = true;

    ejectShell();

    if (window.Sound && window.Sound.shot) {
      window.Sound.shot();
      window.Sound.tone(120, 0.15, 'sawtooth', 0.3, 1500);
    }
    if (window.FX && window.FX.shake) window.FX.shake(state.aiming ? 0.03 : 0.08);

    updateHUD();
  }

  function ejectShell() {
    const s = shells[shellIdx];
    shellIdx = (shellIdx + 1) % shells.length;
    _camForward.set(0, 0, 0);
    s.mesh.position.copy(CAMERA.position).addScaledVector(_camForward, 0.3);
    s.mesh.position.x += 0.2;
    s.mesh.position.y -= 0.1;
    s.vel.set((Math.random() - 0.2) * SHELL_EJECT_SPEED, 1.5 + Math.random(), -1 + Math.random() * 0.5);
    s.spin = (Math.random() - 0.5) * 10;
    s.life = 1.5;
    s.active = true;
    s.mesh.visible = true;
  }

  function reload() {
    if (!state.active || state.reloading) return;
    if (state.ammo >= MAG_SIZE || state.reserve <= 0) return;
    state.reloading = true;
    state.reloadTimer = RELOAD_TIME;
    state.aiming = false;
    scopeOverlay.style.display = 'none';
    if (window.Sound) window.Sound.tone(300, 0.1, 'square', 0.15, 800);
    if (window.FX) window.FX.message('RELOADING', '#ffaa44');
  }

  function finishReload() {
    const needed = MAG_SIZE - state.ammo;
    const taken = Math.min(needed, state.reserve);
    state.ammo += taken;
    state.reserve -= taken;
    state.reloading = false;
    state.chambered = true;
    updateHUD();
  }

  function updateHUD() {
    if (state.reloading) {
      ammoEl.textContent = '— —';
      ammoEl.style.color = '#ffaa44';
    } else {
      ammoEl.textContent = state.ammo + ' / ' + state.reserve;
      ammoEl.style.color = state.ammo === 0 ? '#ff4422' : (state.ammo <= 3 ? '#ffaa44' : '#ffe088');
    }
  }

  function update(dt) {
    dt = Math.min(dt, 0.05);
    if (!state.active) return;

    if (state.cd > 0) state.cd -= dt;
    if (state.boltTimer > 0) {
      state.boltTimer -= dt;
      if (state.boltTimer <= 0 && !state.chambered && !state.reloading) {
        state.chambered = true;
        if (window.Sound) window.Sound.tone(600, 0.06, 'square', 0.12, 2000);
      }
    }

    if (muzzleFlash.visible) {
      muzzleFlash.material.opacity *= Math.pow(0.001, dt);
      if (muzzleFlash.material.opacity < 0.02) muzzleFlash.visible = false;
      muzzleLight.intensity *= Math.pow(0.001, dt);
    }

    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; continue; }
      t.mesh.position.copy(t.start).lerp(t.end, 0.5);
      _tmpV.subVectors(t.end, t.start);
      const len = _tmpV.length();
      t.mesh.scale.set(1, 1, len);
      t.mesh.lookAt(t.end);
      t.mesh.material.opacity = (t.life / TRACER_LIFE) * 0.8;
    }

    for (const s of shells) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) { s.active = false; s.mesh.visible = false; continue; }
      s.vel.y -= 20 * dt;
      s.mesh.position.x += s.vel.x * dt;
      s.mesh.position.y += s.vel.y * dt;
      s.mesh.position.z += s.vel.z * dt;
      const gy = window.groundHeight ? window.groundHeight(s.mesh.position.x, s.mesh.position.z) : 0;
      if (s.mesh.position.y < gy + 0.05) {
        s.mesh.position.y = gy + 0.05;
        s.vel.y *= -0.3;
        s.vel.x *= 0.5;
        s.vel.z *= 0.5;
      }
      s.mesh.rotation.x += s.spin * dt;
      s.mesh.rotation.z += s.spin * 0.7 * dt;
    }

    if (state.reloading) {
      state.reloadTimer -= dt;
      const t = 1 - state.reloadTimer / RELOAD_TIME;
      viewmodel.position.y = -0.3 - Math.sin(t * Math.PI) * 0.18;
      viewmodel.rotation.x = -Math.sin(t * Math.PI) * 0.6;
      if (state.reloadTimer <= 0) {
        finishReload();
        viewmodel.position.y = -0.3;
        viewmodel.rotation.x = 0;
      }
    }

    state.recoilPitch *= Math.pow(Math.exp(-RECOIL_RECOVERY), dt);
    state.recoilYaw *= Math.pow(Math.exp(-RECOIL_RECOVERY), dt);

    const targetFov = state.aiming ? ADS_FOV : state.fovDefault;
    state.fovCurrent += (targetFov - state.fovCurrent) * Math.min(1, ADS_LERP * dt);
    if (Math.abs(CAMERA.fov - state.fovCurrent) > 0.1) {
      CAMERA.fov = state.fovCurrent;
      CAMERA.updateProjectionMatrix();
    }

    state.swayPhase += dt * 3;
    const swayMag = state.aiming ? 0.003 : 0.012;
    state.swayX = Math.cos(state.swayPhase) * swayMag;
    state.swayY = Math.sin(state.swayPhase * 1.3) * swayMag * 0.7;

    if (!state.reloading) {
      const aimX = state.aiming ? 0 : 0.3;
      const aimY = state.aiming ? -0.12 : -0.3;
      const aimZ = state.aiming ? -0.05 : -0.2;
      viewmodel.position.x += (aimX - viewmodel.position.x) * Math.min(1, 12 * dt);
      viewmodel.position.y += (aimY - viewmodel.position.y) * Math.min(1, 12 * dt);
      viewmodel.position.z += (aimZ - viewmodel.position.z) * Math.min(1, 12 * dt);
    }
    viewmodel.position.x += state.swayX;
    viewmodel.position.y += state.swayY;

    viewmodel.visible = state.active && window.Player && window.Player.state && window.Player.state.locked;
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== '4') return;
    const ms = window.Manager;
    if (!ms || !ms.state || ms.state.phase !== 'playing') return;
    if (window.Weapons && window.Weapons.state && window.Weapons.state.active) {
      window.Weapons.state.active = null;
    }
    if (window.DMR && window.DMR.isActive && window.DMR.isActive()) {
      window.DMR.deactivate();
    }
    activate();
  });

  document.addEventListener('mousedown', (e) => {
    const ms = window.Manager;
    if (!ms || !ms.state || ms.state.phase !== 'playing') return;
    if (!window.Player || !window.Player.state || !window.Player.state.locked) return;
    if (!state.active) return;
    if (e.button === 2) { e.preventDefault(); startAim(); }
    if (e.button === 0) { e.preventDefault(); fire(); }
  });

  document.addEventListener('mouseup', (e) => {
    if (e.button === 2) stopAim();
  });

  document.addEventListener('contextmenu', (e) => {
    if (state.active) e.preventDefault();
  });

  window.addEventListener('keydown', (e) => {
    if (!state.active) return;
    const ms = window.Manager;
    if (!ms || !ms.state || ms.state.phase !== 'playing') return;
    if (e.key === 'r' || e.key === 'R') reload();
  });

  if (window.Weapons) {
    const origActivate = window.Weapons.activate || null;
  }

  function giveAmmo(amount) {
    state.reserve = Math.min(TOTAL_AMMO_MAX, state.reserve + amount);
    updateHUD();
  }

  return { state, update, activate, deactivate, isActive, fire, reload, startAim, stopAim, giveAmmo, SLOT_INDEX: 3 };
})();

window.DMR = DMR;