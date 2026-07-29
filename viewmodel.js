// viewmodel.js — FORESTWAR first-person view model: animated hands + weapon that sway, bob, kick, and dip on reload
const THREE = window.THREE;
const CAMERA = window.CAMERA;
const Viewmodel = (() => {
  if (!THREE || !CAMERA) return { update() {}, onFire() {}, onReload() {}, setSlot() {}, setActive() {}, setSprint() {}, setADS() {} };

  const state = {
    active: false,
    slot: 0,
    kickV: 0,
    kickH: 0,
    bobPhase: 0,
    bobAmt: 0,
    swayX: 0,
    swayY: 0,
    swayTargetX: 0,
    swayTargetY: 0,
    reloadT: 0,
    reloadActive: false,
    sprintT: 0,
    sprintAmt: 0,
    adsAmt: 0,
    adsTarget: 0,
    lowered: false,
    landBounce: 0,
    recoilOffset: 0,
    prevOnGround: true,
    prevVelY: 0,
  };

  // ---- Shared materials ----------------------------------------------------
  const HAND_MAT = new THREE.MeshStandardMaterial({ color: 0xc9a878, roughness: 0.75 });
  const SLEEVE_MAT = new THREE.MeshStandardMaterial({ color: 0x3a4a32, roughness: 0.85 });
  const GUN_BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2a24, roughness: 0.5, metalness: 0.6 });
  const GUN_DARK_MAT = new THREE.MeshStandardMaterial({ color: 0x161614, roughness: 0.4, metalness: 0.8 });
  const GUN_WOOD_MAT = new THREE.MeshStandardMaterial({ color: 0x5a3e22, roughness: 0.7 });
  const ROCKET_BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x445533, roughness: 0.5, metalness: 0.5 });
  const GRENADE_BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.6, metalness: 0.3 });
  const SHELL_MAT = new THREE.MeshStandardMaterial({ color: 0xddaa44, roughness: 0.35, metalness: 0.7 });
  const MUZZLE_GEO = new THREE.SphereGeometry(0.08, 6, 5);
  const MUZZLE_MAT = new THREE.MeshBasicMaterial({ color: 0xffee66, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });

  const HAND_GEO = new THREE.SphereGeometry(0.075, 8, 6);
  const FOREARM_GEO = new THREE.CylinderGeometry(0.055, 0.05, 0.35, 6);
  const KNUCKLE_GEO = new THREE.BoxGeometry(0.08, 0.06, 0.12);

  // ---- Container -----------------------------------------------------------
  const group = new THREE.Group();
  CAMERA.add(group);

  // ---- Build per-slot viewmodels -------------------------------------------
  const slots = [];

  function buildRifle() {
    const g = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.42), GUN_BODY_MAT);
    receiver.position.set(0, -0.02, -0.15);
    g.add(receiver);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.35, 6), GUN_DARK_MAT);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -0.5);
    g.add(barrel);
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.2), GUN_WOOD_MAT);
    handguard.position.set(0, -0.01, -0.34);
    g.add(handguard);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.18), GUN_WOOD_MAT);
    stock.position.set(0, -0.03, 0.06);
    g.add(stock);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.13, 0.07), GUN_DARK_MAT);
    mag.position.set(0, -0.1, -0.12);
    g.add(mag);
    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.06), GUN_DARK_MAT);
    scope.position.set(0, 0.06, -0.18);
    g.add(scope);
    const flash = new THREE.Mesh(MUZZLE_GEO, MUZZLE_MAT.clone());
    flash.position.set(0, 0.01, -0.68);
    g.add(flash);
    return { group: g, muzzleFlash: flash, muzzleOffset: new THREE.Vector3(0, 0.01, -0.68), type: 'rifle' };
  }

  function buildRocket() {
    const g = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.7, 8), ROCKET_BODY_MAT);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, -0.03, -0.25);
    g.add(tube);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.06), GUN_DARK_MAT);
    grip.position.set(0, -0.11, -0.1);
    g.add(grip);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.04), GUN_DARK_MAT);
    sight.position.set(0, 0.05, -0.2);
    g.add(sight);
    const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 5, 10), GUN_DARK_MAT);
    muzzle.rotation.y = Math.PI / 2;
    muzzle.position.set(0, -0.03, -0.6);
    g.add(muzzle);
    const flash = new THREE.Mesh(MUZZLE_GEO, MUZZLE_MAT.clone());
    flash.scale.setScalar(2);
    flash.position.set(0, -0.03, -0.62);
    g.add(flash);
    return { group: g, muzzleFlash: flash, muzzleOffset: new THREE.Vector3(0, -0.03, -0.62), type: 'rocket' };
  }

  function buildGrenade() {
    const g = new THREE.Group();
    const launcher = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.4, 8), GRENADE_BODY_MAT);
    launcher.rotation.x = Math.PI / 2;
    launcher.position.set(0, -0.02, -0.15);
    g.add(launcher);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.12), GUN_DARK_MAT);
    pump.position.set(0, -0.06, -0.28);
    g.add(pump);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.15), GUN_WOOD_MAT);
    stock.position.set(0, -0.03, 0.08);
    g.add(stock);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.09, 0.05), GUN_DARK_MAT);
    grip.position.set(0, -0.1, 0.0);
    g.add(grip);
    const loaded = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), GRENADE_BODY_MAT);
    loaded.position.set(0, 0.02, -0.32);
    g.add(loaded);
    const flash = new THREE.Mesh(MUZZLE_GEO, MUZZLE_MAT.clone());
    flash.scale.setScalar(1.5);
    flash.position.set(0, -0.02, -0.4);
    g.add(flash);
    return { group: g, muzzleFlash: flash, muzzleOffset: new THREE.Vector3(0, -0.02, -0.4), type: 'grenade' };
  }

  slots.push(buildRifle());
  slots.push(buildRocket());
  slots.push(buildGrenade());
  for (const s of slots) { s.group.visible = false; group.add(s.group); }

  // ---- Arms (shared across slots, two hands) --------------------------------
  const arms = new THREE.Group();
  group.add(arms);
  const forearmR = new THREE.Mesh(FOREARM_GEO, SLEEVE_MAT);
  forearmR.position.set(-0.08, -0.08, -0.18);
  forearmR.rotation.x = -1.4;
  arms.add(forearmR);
  const handR = new THREE.Mesh(HAND_GEO, HAND_MAT);
  handR.position.set(-0.05, -0.05, -0.32);
  arms.add(handR);
  const knuckleR = new THREE.Mesh(KNUCKLE_GEO, HAND_MAT);
  knuckleR.position.set(-0.05, -0.04, -0.38);
  arms.add(knuckleR);
  const forearmL = new THREE.Mesh(FOREARM_GEO, SLEEVE_MAT);
  forearmL.position.set(0.12, -0.06, -0.16);
  forearmL.rotation.x = -1.3;
  forearmL.rotation.z = -0.3;
  arms.add(forearmL);
  const handL = new THREE.Mesh(HAND_GEO, HAND_MAT);
  handL.position.set(0.06, -0.03, -0.3);
  arms.add(handL);

  // ---- Public API ----------------------------------------------------------
  function setSlot(slot) {
    state.slot = slot;
    for (let i = 0; i < slots.length; i++) slots[i].group.visible = (i === slot && state.active);
  }

  function setActive(on) {
    state.active = on;
    group.visible = on;
    for (let i = 0; i < slots.length; i++) slots[i].group.visible = (i === state.slot && on);
  }

  function onFire() {
    state.kickV += 0.04;
    state.kickH += (Math.random() - 0.5) * 0.02;
    const s = slots[state.slot];
    if (s && s.muzzleFlash) {
      s.muzzleFlash.material.opacity = 1;
      s.muzzleFlash.scale.setScalar(1 + Math.random() * 0.5);
    }
  }

  function onReload() {
    state.reloadActive = true;
    state.reloadT = 0;
  }

  function setSprint(on) {
    state.sprintAmt = on ? 1 : 0;
  }

  function setADS(on) {
    state.adsTarget = on ? 1 : 0;
  }

  // ---- Per-frame update ----------------------------------------------------
  const _camDir = new THREE.Vector3();
  const _prevPos = new THREE.Vector3();
  let _initialized = false;

  function update(dt, realDt) {
    if (!state.active) return;
    const p = window.Player ? window.Player.state : null;
    const w = window.Weapons ? window.Weapons.state : null;
    const cam = CAMERA;

    if (!_initialized && cam) {
      _prevPos.copy(cam.position);
      _initialized = true;
    }

    const horzVel = Math.sqrt(
      (cam.position.x - _prevPos.x) * (cam.position.x - _prevPos.x) +
      (cam.position.z - _prevPos.z) * (cam.position.z - _prevPos.z)
    ) / Math.max(realDt, 0.001);

    // Landing bounce
    if (p) {
      if (!p.onGround && state.prevOnGround) { state.prevOnGround = false; }
      else if (p.onGround && !state.prevOnGround) {
        state.landBounce = Math.min(0.04, Math.abs(state.prevVelY) * 0.004);
        state.prevOnGround = true;
      }
      state.prevVelY = p.vel ? p.vel.y : 0;
    }

    _prevPos.copy(cam.position);

    // ---- View bob (from horizontal speed) ----
    const bobSpeed = p && p.sprinting ? 12 : 8;
    const bobScale = Math.min(horzVel * 0.06, 1) * (1 - state.adsAmt * 0.8);
    state.bobPhase += realDt * bobSpeed * bobScale;
    state.bobAmt = bobScale;

    // ---- Look sway (lag behind yaw / pitch change) ----
    cam.getWorldDirection(_camDir);
    state.swayX += (state.swayTargetX - state.swayX) * Math.min(1, realDt * 8);
    state.swayY += (state.swayTargetY - state.swayY) * Math.min(1, realDt * 8);
    state.swayTargetX *= Math.pow(0.001, realDt);
    state.swayTargetY *= Math.pow(0.001, realDt);

    // ---- Recoil kick recovery ----
    state.kickV *= Math.pow(0.001, realDt);
    state.kickH *= Math.pow(0.001, realDt);

    // ---- Reload animation ----
    let reloadDip = 0;
    let reloadRot = 0;
    if (state.reloadActive) {
      state.reloadT += realDt;
      const reloadDur = w && w.active ? w.active.reload : 1.8;
      const t = state.reloadT / reloadDur;
      if (t >= 1) {
        state.reloadActive = false;
      } else {
        reloadDip = Math.sin(t * Math.PI) * 0.18;
        reloadRot = Math.sin(t * Math.PI * 2) * 0.3;
      }
    }

    // ---- Sprint lower ----
    const sprintLower = state.sprintAmt * 0.2;
    const sprintTilt = state.sprintAmt * 0.4;

    // ---- ADS raise ----
    state.adsAmt += (state.adsTarget - state.adsAmt) * Math.min(1, realDt * 10);
    const adsX = state.adsAmt * -0.1;
    const adsZ = state.adsAmt * 0.08;

    // ---- Land bounce decay ----
    state.landBounce *= Math.pow(0.002, realDt);

    // ---- Compose transforms ----
    const bobX = Math.cos(state.bobPhase) * 0.012 * state.bobAmt;
    const bobY = Math.abs(Math.sin(state.bobPhase)) * 0.014 * state.bobAmt;
    const swayOffsetX = state.swayX * 0.01;
    const swayOffsetY = state.swayY * 0.01;

    group.position.set(
      0.14 + bobX + swayOffsetX + adsX,
      -0.12 + bobY + swayOffsetY - reloadDip - state.landBounce - sprintLower,
      -0.3 + adsZ + state.kickV * 0.3
    );

    group.rotation.set(
      -state.kickV * 0.6 + state.swayY * 0.05 + reloadRot * 0.3 + sprintTilt * 0.3,
      state.kickH * 0.4 - state.swayX * 0.05 + reloadRot + sprintTilt,
      state.sprintAmt * 0.35
    );

    // Arms follow
    arms.position.set(bobX * 0.5, bobY * 0.5, -reloadDip * 0.5);
    arms.rotation.set(-reloadDip * 1.5, reloadRot * 0.5, 0);

    // Muzzle flash fade
    for (let i = 0; i < slots.length; i++) {
      const mf = slots[i].muzzleFlash;
      if (mf && mf.material.opacity > 0) {
        mf.material.opacity -= realDt * 12;
        if (mf.material.opacity <= 0) mf.material.opacity = 0;
      }
    }
  }

  // ---- Hook mouse movement for look sway ----
  window.addEventListener('mousemove', (e) => {
    if (!state.active) return;
    if (!(document.pointerLockElement === window.RENDERER.domElement)) return;
    state.swayTargetX += e.movementX * 0.0004;
    state.swayTargetY -= e.movementY * 0.0004;
  });

  window.Viewmodel = { update, onFire, onReload, setSlot, setActive, setSprint, setADS, state };
  return window.Viewmodel;
})();