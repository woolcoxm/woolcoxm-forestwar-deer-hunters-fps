// sniper.js — FORESTWAR heavy bolt-action sniper: slot 4, extreme single-shot damage, slow cycle
const THREE = window.THREE;
const SCENE = window.SCENE;
const CAMERA = window.CAMERA;

const Sniper = (() => {
  const DAMAGE = 145;
  const RANGE = 280;
  const FIRE_RATE = 1.5;
  const MAG_SIZE = 5;
  const RELOAD_TIME = 3.4;
  const TOTAL_AMMO_MAX = 20;
  const SPREAD = 0.002;
  const RECOIL_V = 0.075;
  const RECOIL_H = 0.012;
  const RECOIL_RECOVERY = 5.5;
  const ADS_FOV = 28;
  const ADS_LERP = 11;
  const TRACER_LIFE = 0.12;
  const SHELL_EJECT_SPEED = 4.0;
  const HEADSHOT_MULT = 2.5;
  const BOLT_CYCLE = 0.45;

  const state = {
    unlocked: true,
    slot: 4,
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
  };

  const TRACER_GEO = new THREE.CylinderGeometry(0.018, 0.004, 1, 4);
  TRACER_GEO.rotateX(Math.PI / 2);
  const TRACER_MAT = new THREE.MeshBasicMaterial({
    color: 0xfff0aa, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  const SHELL_GEO = new THREE.CylinderGeometry(0.035, 0.035, 0.15, 5);
  const SHELL_MAT = new THREE.MeshStandardMaterial({ color: 0xddaa44, roughness: 0.4, metalness: 0.6 });

  const MUZZLE_GEO = new THREE.SphereGeometry(0.28, 10, 8);
  const MUZZLE_MAT = new THREE.MeshBasicMaterial({
    color: 0xffe066, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const muzzleFlash = new THREE.Mesh(MUZZLE_GEO, MUZZLE_MAT.clone());
  muzzleFlash.visible = false;
  SCENE.add(muzzleFlash);

  const muzzleLight = new THREE.PointLight(0xffcc55, 0, 14, 2);
  SCENE.add(muzzleLight);

  const SMOKE_GEO = new THREE.SphereGeometry(0.3, 6, 5);
  const SMOKE_MAT = new THREE.MeshBasicMaterial({
    color: 0xcccccc, transparent: true, opacity: 0,
    depthWrite: false,
  });

  const tracers = [];
  for (let i = 0; i < 6; i++) {
    const t = new THREE.Mesh(TRACER_GEO, TRACER_MAT.clone());
    t.visible = false;
    t.frustumCulled = false;
    SCENE.add(t);
    tracers.push({ mesh: t, life: 0, start: new THREE.Vector3(), end: new THREE.Vector3() });
  }
  let tracerIdx = 0;

  const shells = [];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(SHELL_GEO, SHELL_MAT);
    s.visible = false;
    s.frustumCulled = false;
    SCENE.add(s);
    shells.push({ mesh: s, vel: new THREE.Vector3(), spin: 0, life: 0, active: false });
  }
  let shellIdx = 0;

  const smokes = [];
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(SMOKE_GEO, SMOKE_MAT.clone());
    s.visible = false;
    s.frustumCulled = false;
    SCENE.add(s);
    smokes.push({ mesh: s, vel: new THREE.Vector3(), life: 0, maxLife: 0.6, active: false });
  }
  let smokeIdx = 0;

  const _origin = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _ray = new THREE.Raycaster();
  const _end = new THREE.Vector3();
  const _muzzleWorld = new THREE.Vector3();
  const _tmp = new THREE.Vector3();

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;right:16px;bottom:40px;text-align:right;font-size:13px;letter-spacing:2px;text-shadow:0 2px 4px #000;z-index:6;opacity:0;transition:opacity 0.2s;';
  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'color:#ffaa44;font-weight:bold;margin-bottom:3px;';
  nameEl.textContent = 'SNIPER [5]';
  hud.appendChild(nameEl);
  const ammoEl = document.createElement('div');
  ammoEl.style.cssText = 'font-size:20px;font-weight:bold;color:#e8f3e8;';
  ammoEl.textContent = MAG_SIZE + ' / ' + TOTAL_AMMO_MAX;
  hud.appendChild(ammoEl);
  const reserveEl = document.createElement('div');
  reserveEl.style.cssText = 'font-size:11px;color:#9fe8a0;margin-top:2px;';
  reserveEl.textContent = 'RESERVE ' + TOTAL_AMMO_MAX;
  hud.appendChild(reserveEl);
  document.getElementById('hud').appendChild(hud);

  const reloadEl = document.createElement('div');
  reloadEl.style.cssText = 'position:absolute;bottom:66px;right:16px;font-size:12px;letter-spacing:3px;color:#ff8844;text-shadow:0 1px 4px #000;opacity:0;transition:opacity 0.15s;z-index:6;';
  reloadEl.textContent = 'RELOADING';
  document.getElementById('hud').appendChild(reloadEl);

  const boltEl = document.createElement('div');
  boltEl.style.cssText = 'position:absolute;bottom:84px;right:16px;font-size:11px;letter-spacing:2px;color:#ffcc44;text-shadow:0 1px 4px #000;opacity:0;transition:opacity 0.1s;z-index:6;';
  boltEl.textContent = 'CYCLING BOLT';
  document.getElementById('hud').appendChild(boltEl);

  function showHUD() {
    hud.style.opacity = '1';
    updateHUD();
  }
  function hideHUD() {
    hud.style.opacity = '0';
    reloadEl.style.opacity = '0';
    boltEl.style.opacity = '0';
  }

  function updateHUD() {
    if (!state.active) return;
    ammoEl.textContent = state.ammo + ' / ' + MAG_SIZE;
    reserveEl.textContent = 'RESERVE ' + state.reserve;
    reloadEl.style.opacity = state.reloading ? '1' : '0';
    boltEl.style.opacity = (state.boltTimer > 0 && !state.reloading) ? '1' : '0';
  }

  function activate() {
    state.active = true;
    state.aiming = false;
    showHUD();
  }
  function deactivate() {
    state.active = false;
    state.aiming = false;
    if (CAMERA.fov !== state.fovDefault) {
      CAMERA.fov = state.fovDefault;
      CAMERA.updateProjectionMatrix();
    }
    hideHUD();
  }

  function startReload() {
    if (state.reloading) return;
    if (state.ammo >= MAG_SIZE || state.reserve <= 0) return;
    state.reloading = true;
    state.reloadTimer = RELOAD_TIME;
    if (window.Sound) {
      window.Sound.tone(180, 0.08, 'square', 0.15, 1000);
      setTimeout(() => { if (window.Sound) window.Sound.tone(140, 0.06, 'square', 0.12, 800); }, 200);
    }
    updateHUD();
  }

  function finishReload() {
    const needed = MAG_SIZE - state.ammo;
    const taken = Math.min(needed, state.reserve);
    state.ammo += taken;
    state.reserve -= taken;
    state.reloading = false;
    state.chambered = true;
    state.boltTimer = 0;
    updateHUD();
  }

  function getMuzzleWorld() {
    const cam = CAMERA;
    cam.getWorldDirection(_dir);
    _origin.set(cam.position.x, cam.position.y, cam.position.z);
    _origin.addScaledVector(_dir, 0.5);
    const right = _tmp.set(_dir.z, 0, -_dir.x).normalize();
    _origin.addScaledVector(right, 0.18);
    _origin.y -= 0.1;
    return _origin;
  }

  function fire() {
    if (state.cd > 0 || state.reloading || !state.chambered) return;
    if (state.ammo <= 0) { startReload(); return; }
    state.ammo--;
    state.cd = FIRE_RATE;
    state.chambered = false;
    state.boltTimer = BOLT_CYCLE;

    const cam = CAMERA;
    cam.getWorldDirection(_dir);
    const spread = state.aiming ? SPREAD * 0.4 : SPREAD * 3;
    _dir.x += (Math.random() - 0.5) * spread;
    _dir.y += (Math.random() - 0.5) * spread;
    _dir.normalize();

    _ray.set(cam.position, _dir);
    _ray.far = RANGE;

    const ents = (window.Entities && window.Entities.list) ? window.Entities.list : [];
    let hitEnt = null;
    let hitDist = RANGE;
    let headshot = false;

    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || !e.mesh) continue;
      const ep = e.mesh.position;
      const dx = ep.x - cam.position.x;
      const dy = (ep.y + 1.0) - cam.position.y;
      const dz = ep.z - cam.position.z;
      const t = dx * _dir.x + dy * _dir.y + dz * _dir.z;
      if (t < 0 || t > RANGE) continue;
      const px = cam.position.x + _dir.x * t;
      const py = cam.position.y + _dir.y * t;
      const pz = cam.position.z + _dir.z * t;
      const bodyD2 = (px - ep.x) * (px - ep.x) + (py - (ep.y + 1.0)) * (py - (ep.y + 1.0)) + (pz - ep.z) * (pz - ep.z);
      if (bodyD2 < 0.7) {
        if (t < hitDist) { hitEnt = e; hitDist = t; headshot = false; }
      }
      const headY = ep.y + (e.team === 'deer' ? 1.55 : 1.72);
      const hdy = headY - cam.position.y;
      const ht = dx * _dir.x + hdy * _dir.y + dz * _dir.z;
      if (ht > 0 && ht < RANGE) {
        const hx = cam.position.x + _dir.x * ht;
        const hy = cam.position.y + _dir.y * ht;
        const hz = cam.position.z + _dir.z * ht;
        const headD2 = (hx - ep.x) * (hx - ep.x) + (hy - headY) * (hy - headY) + (hz - ep.z) * (hz - ep.z);
        if (headD2 < 0.16 && ht < hitDist) {
          hitEnt = e; hitDist = ht; headshot = true;
        }
      }
    }

    _end.copy(cam.position).addScaledVector(_dir, hitDist);
    spawnTracer(getMuzzleWorld(), _end);

    if (hitEnt) {
      const dmg = headshot ? DAMAGE * HEADSHOT_MULT : DAMAGE;
      if (hitEnt.takeDamage) {
        hitEnt.takeDamage(dmg, headshot ? 'headshot' : 'body');
      } else if (hitEnt.hp !== undefined) {
        hitEnt.hp -= dmg;
        if (hitEnt.hp <= 0 && hitEnt.die) hitEnt.die();
      }
      if (window.FX && window.FX.bloodBurst) {
        _tmp.copy(hitEnt.mesh.position);
        _tmp.y += headshot ? (e && e.team === 'deer' ? 1.55 : 1.72) : 1.0;
        window.FX.bloodBurst(_tmp, _dir.clone().negate());
      }
      if (window.CombatText && window.CombatText.spawn) {
        _tmp.copy(hitEnt.mesh.position);
        _tmp.y += headshot ? 1.6 : 1.0;
        window.CombatText.spawn(_tmp, Math.round(dmg), { crit: headshot, kill: hitEnt.hp <= 0 });
      }
      if (window.Killstreak && window.Killstreak.registerKill && hitEnt.hp <= 0) {
        window.Killstreak.registerKill();
      }
    }

    state.recoilPitch += RECOIL_V * (0.9 + Math.random() * 0.2);
    state.recoilYaw += (Math.random() - 0.5) * RECOIL_H * 2;

    if (window.Player && window.Player.state) {
      window.Player.state.pitch -= RECOIL_V;
    }

    if (window.FX && window.FX.shake) window.FX.shake(0.12);
    sfxSniperShot();
    spawnSmoke();
    updateHUD();
  }

  function spawnTracer(from, to) {
    const slot = tracers[tracerIdx];
    tracerIdx = (tracerIdx + 1) % tracers.length;
    slot.start.copy(from);
    slot.end.copy(to);
    slot.life = TRACER_LIFE;
    slot.mesh.visible = true;
    slot.mesh.position.copy(from).lerp(to, 0.5);
    const len = from.distanceTo(to);
    slot.mesh.scale.set(1, len, 1);
    slot.mesh.lookAt(to);
    const light = muzzleLight;
    light.position.copy(from);
    light.intensity = 8;
    light.color.setHex(0xffcc55);
    const flash = muzzleFlash;
    flash.position.copy(from);
    flash.material.opacity = 1;
    flash.scale.setScalar(1.2 + Math.random() * 0.3);
    flash.visible = true;
  }

  function spawnSmoke() {
    const pos = getMuzzleWorld();
    for (let i = 0; i < 3; i++) {
      const slot = smokes[smokeIdx];
      smokeIdx = (smokeIdx + 1) % smokes.length;
      slot.mesh.position.copy(pos);
      slot.mesh.position.x += (Math.random() - 0.5) * 0.3;
      slot.mesh.position.y += (Math.random() - 0.5) * 0.2;
      slot.mesh.position.z += (Math.random() - 0.5) * 0.3;
      slot.vel.set(
        (Math.random() - 0.5) * 0.8,
        0.5 + Math.random() * 0.6,
        (Math.random() - 0.5) * 0.8
      );
      slot.life = slot.maxLife;
      slot.mesh.scale.setScalar(0.5 + Math.random() * 0.4);
      slot.mesh.material.opacity = 0.6;
      slot.mesh.visible = true;
      slot.active = true;
    }
  }

  function ejectShell() {
    const slot = shells[shellIdx];
    shellIdx = (shellIdx + 1) % shells.length;
    const pos = getMuzzleWorld();
    slot.mesh.position.copy(CAMERA.position);
    const camDir = _tmp;
    CAMERA.getWorldDirection(camDir);
    const right = new THREE.Vector3(camDir.z, 0, -camDir.x).normalize();
    slot.mesh.position.addScaledVector(right, 0.3);
    slot.mesh.position.y -= 0.15;
    slot.vel.copy(right).multiplyScalar(SHELL_EJECT_SPEED * (0.8 + Math.random() * 0.4));
    slot.vel.y += 1.5 + Math.random();
    slot.spin = (Math.random() - 0.5) * 12;
    slot.life = 1.2;
    slot.mesh.visible = true;
    slot.active = true;
  }

  function sfxSniperShot() {
    if (!window.Sound) return;
    const S = window.Sound;
    if (S.tone) {
      S.tone(120, 0.12, 'sawtooth', 0.4, 2200);
      S.tone(80, 0.18, 'square', 0.3, 600);
    }
    if (S.shot) S.shot();
  }

  function updateMuzzleFlash(dt) {
    if (muzzleFlash.visible) {
      const mat = muzzleFlash.material;
      mat.opacity -= dt * 14;
      if (mat.opacity <= 0) { muzzleFlash.visible = false; mat.opacity = 0; }
      else muzzleFlash.scale.multiplyScalar(1 + dt * 8);
    }
    if (muzzleLight.intensity > 0) {
      muzzleLight.intensity -= dt * 160;
      if (muzzleLight.intensity < 0) muzzleLight.intensity = 0;
    }
  }

  function updateTracers(dt) {
    for (let i = 0; i < tracers.length; i++) {
      const t = tracers[i];
      if (t.life <= 0) continue;
      t.life -= dt;
      const k = Math.max(0, t.life / TRACER_LIFE);
      t.mesh.material.opacity = k * 0.85;
      if (t.life <= 0) t.mesh.visible = false;
    }
  }

  function updateShells(dt) {
    for (let i = 0; i < shells.length; i++) {
      const s = shells[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; s.active = false; continue; }
      s.vel.y -= 9.8 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.spin * dt;
      s.mesh.rotation.z += s.spin * 0.7 * dt;
      const gy = window.groundHeight ? window.groundHeight(s.mesh.position.x, s.mesh.position.z) : 0;
      if (s.mesh.position.y < gy + 0.05) {
        s.mesh.position.y = gy + 0.05;
        s.vel.set(s.vel.x * 0.3, Math.abs(s.vel.y) * 0.3, s.vel.z * 0.3);
      }
    }
  }

  function updateSmokes(dt) {
    for (let i = 0; i < smokes.length; i++) {
      const s = smokes[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; s.active = false; continue; }
      s.mesh.position.addScaledVector(s.vel, dt);
      s.vel.multiplyScalar(0.95);
      s.vel.y += 0.5 * dt;
      const k = s.life / s.maxLife;
      s.mesh.material.opacity = k * 0.5;
      s.mesh.scale.setScalar(0.5 + (1 - k) * 1.5);
    }
  }

  function updateSway(dt) {
    state.swayPhase += dt * 1.6;
    const moving = window.Player && window.Player.state && window.Player.state.vel && window.Player.state.vel.lengthSq() > 1;
    const amp = state.aiming ? 0.15 : (moving ? 0.6 : 0.3);
    state.swayX = Math.sin(state.swayPhase) * amp * 0.3;
    state.swayY = Math.cos(state.swayPhase * 0.7) * amp * 0.2;
  }

  function updateRecoil(dt) {
    const rec = 1 - Math.exp(-RECOIL_RECOVERY * dt);
    state.recoilPitch += (0 - state.recoilPitch) * rec;
    state.recoilYaw += (0 - state.recoilYaw) * rec;
  }

  function update(dt) {
    if (!state.active) return;
    const d = Math.min(dt, 0.05);
    if (state.cd > 0) state.cd -= d;
    if (state.reloading) {
      state.reloadTimer -= d;
      if (state.reloadTimer <= 0) finishReload();
    }
    if (state.boltTimer > 0 && !state.reloading) {
      state.boltTimer -= d;
      if (state.boltTimer <= 0) {
        state.chambered = true;
        ejectShell();
        if (window.Sound && window.Sound.tone) {
          window.Sound.tone(300, 0.06, 'square', 0.15, 1200);
          setTimeout(() => { if (window.Sound && window.Sound.tone) window.Sound.tone(220, 0.05, 'square', 0.12, 1000); }, 80);
        }
        updateHUD();
      }
    }
    const targetFov = state.aiming ? ADS_FOV : state.fovDefault;
    state.fovCurrent += (targetFov - state.fovCurrent) * Math.min(1, ADS_LERP * d);
    if (Math.abs(CAMERA.fov - state.fovCurrent) > 0.1) {
      CAMERA.fov = state.fovCurrent;
      CAMERA.updateProjectionMatrix();
    }
    updateSway(d);
    updateRecoil(d);
    updateMuzzleFlash(d);
    updateTracers(d);
    updateShells(d);
    updateSmokes(d);
    if (state.cd > 0 || state.reloading || state.boltTimer > 0) updateHUD();
  }

  function onMouseDown(e) {
    if (!state.active) return;
    if (e.button === 0) {
      fire();
    }
  }

  function onMouseUp(e) {
    if (!state.active) return;
    if (e.button === 2) {
      state.aiming = false;
    }
  }

  function onContextMenu(e) {
    if (!state.active) return;
    e.preventDefault();
    state.aiming = !state.aiming;
  }

  function onKeyDown(e) {
    if (!state.active) return;
    if (e.key === 'r' || e.key === 'R') startReload();
  }

  function getActiveWeaponData() {
    return {
      name: 'SNIPER',
      slot: state.slot,
      ammo: state.ammo,
      magSize: MAG_SIZE,
      reserve: state.reserve,
      reloading: state.reloading,
      aiming: state.aiming,
    };
  }

  function giveAmmo(amount) {
    state.reserve = Math.min(TOTAL_AMMO_MAX, state.reserve + amount);
    updateHUD();
  }

  function init() {
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
  }

  init();

  return { state, activate, deactivate, fire, update, startReload, getActiveWeaponData, giveAmmo, SLOT: state.slot };
})();

window.Sniper = Sniper;