// artillery.js — FORESTWAR off-map artillery: target lasing, walking barrage, delayed shells, shockwaves
const THREE = window.THREE;
const SCENE = window.SCENE;
const Artillery = (() => {
  const MAX_CHARGE = 100;
  const CHARGE_REGEN = 2.2;
  const SHELL_COUNT = 9;
  const SHELL_INTERVAL = 0.32;
  const SHELL_DAMAGE = 120;
  const SHELL_RADIUS = 6.5;
  const SHELL_FALL_TIME = 1.4;
  const WHISTLE_LEAD = 0.7;
  const MAX_RANGE = 100;

  const state = {
    charge: MAX_CHARGE,
    lasing: false,
    laserTime: 0,
    target: new THREE.Vector3(),
    barrageActive: false,
    barrageShellsLeft: 0,
    barrageTimer: 0,
    barrageCenter: new THREE.Vector3(),
    barrageOffset: 0,
    barrageDir: new THREE.Vector3(),
    cooldown: 0,
    laseFlash: 0,
  };

  const SHELL_GEO = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 6);
  SHELL_GEO.rotateX(Math.PI / 2);
  const SHELL_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2a1e, roughness: 0.5, metalness: 0.4 });
  const WHISTLE_TRAIL_GEO = new THREE.ConeGeometry(0.12, 1.2, 5);
  const WHISTLE_TRAIL_MAT = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.5 });
  const SHOCK_GEO = new THREE.RingGeometry(0.4, 0.9, 32);
  const DEBRIS_GEO = new THREE.BoxGeometry(0.18, 0.18, 0.18);
  const MARKER_GEO = new THREE.RingGeometry(1.5, 2.0, 24);
  const MARKER_MAT = new THREE.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  const FLASH_GEO = new THREE.SphereGeometry(1.5, 8, 6);
  const FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0xffee66, transparent: true });
  const LASER_GEO = new THREE.CylinderGeometry(0.04, 0.04, 1, 5);

  const marker = new THREE.Mesh(MARKER_GEO, MARKER_MAT.clone());
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  SCENE.add(marker);

  const laser = new THREE.Mesh(LASER_GEO, new THREE.MeshBasicMaterial({ color: 0xff4422, transparent: true, opacity: 0.7 }));
  laser.visible = false;
  SCENE.add(laser);

  const hudCharge = document.createElement('div');
  hudCharge.style.cssText = 'position:absolute;left:16px;bottom:100px;width:180px;font-size:11px;letter-spacing:2px;text-shadow:0 1px 3px #000;z-index:6;';
  const label = document.createElement('div');
  label.style.cssText = 'color:#ff6644;margin-bottom:3px;';
  label.textContent = 'ARTILLERY';
  hudCharge.appendChild(label);
  const chargeBar = document.createElement('div');
  chargeBar.style.cssText = 'width:100%;height:8px;background:rgba(0,0,0,0.55);border:1px solid rgba(180,100,60,0.5);border-radius:4px;overflow:hidden;';
  const chargeFill = document.createElement('div');
  chargeFill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#ff4422,#ffaa44);transition:width 0.2s;';
  chargeBar.appendChild(chargeFill);
  hudCharge.appendChild(chargeBar);
  const chargeText = document.createElement('div');
  chargeText.style.cssText = 'margin-top:3px;font-size:10px;color:#ccc;';
  chargeText.textContent = '100% — [G] to fire';
  hudCharge.appendChild(chargeText);
  document.getElementById('hud').appendChild(hudCharge);

  const shells = [];
  const shocks = [];
  const debris = [];
  const flashes = [];

  function getSpawnOrigin(target) {
    const angle = Math.atan2(target.z, target.x);
    const offAngle = angle + Math.PI;
    const dist = MAX_RANGE + 40;
    return new THREE.Vector3(
      target.x + Math.cos(offAngle) * dist,
      target.y + 80,
      target.z + Math.sin(offAngle) * dist
    );
  }

  function beginBarrage(target) {
    if (state.barrageActive || state.charge < MAX_CHARGE) {
      if (window.FX) window.FX.message('ARTILLERY NOT READY', '#ff6644');
      return;
    }
    state.charge = 0;
    state.barrageActive = true;
    state.barrageShellsLeft = SHELL_COUNT;
    state.barrageTimer = SHELL_INTERVAL;
    state.barrageCenter.copy(target);
    state.barrageOffset = -SHELL_COUNT * 4;
    const cam = window.CAMERA;
    if (cam) {
      const dx = target.x - cam.position.x;
      const dz = target.z - cam.position.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      state.barrageDir.set(dx / len, 0, dz / len);
    } else {
      state.barrageDir.set(1, 0, 0);
    }
    marker.position.set(target.x, (window.groundHeight ? window.groundHeight(target.x, target.z) : 0) + 0.2, target.z);
    marker.visible = true;
    marker.material.opacity = 0.6;
    if (window.FX) window.FX.message('BARRAGE INBOUND', '#ff6644');
    if (window.Sound) {
      window.Sound.tone(180, 0.6, 'sawtooth', 0.25, 600);
      window.Sound.tone(90, 1.0, 'sine', 0.2, 400);
    }
  }

  function fireShell(target) {
    const mesh = new THREE.Mesh(SHELL_GEO, SHELL_MAT);
    mesh.castShadow = true;
    const origin = getSpawnOrigin(target);
    mesh.position.copy(origin);
    mesh.lookAt(target);
    SCENE.add(mesh);

    const trail = new THREE.Mesh(WHISTLE_TRAIL_GEO, WHISTLE_TRAIL_MAT.clone());
    trail.position.copy(origin);
    SCENE.add(trail);

    shells.push({
      mesh,
      trail,
      origin: origin.clone(),
      target: target.clone(),
      fallTime: 0,
      duration: SHELL_FALL_TIME,
      detonated: false,
      whistlePlayed: false,
    });
  }

  function detonate(pos) {
    const flash = new THREE.Mesh(FLASH_GEO, FLASH_MAT.clone());
    flash.position.copy(pos);
    flash.position.y += 0.5;
    flash.scale.setScalar(0.3);
    SCENE.add(flash);
    flashes.push({ mesh: flash, life: 0.25, maxLife: 0.25 });

    const light = new THREE.PointLight(0xffaa44, 12, 22, 2);
    light.position.copy(flash.position);
    light.userData.life = 0.2;
    light.userData.maxLife = 0.2;
    SCENE.add(light);
    flashes.push({ mesh: light, life: 0.2, maxLife: 0.2, isLight: true });

    const shock = new THREE.Mesh(SHOCK_GEO, new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    shock.rotation.x = -Math.PI / 2;
    shock.position.copy(pos);
    shock.position.y += 0.3;
    shock.scale.setScalar(0.3);
    SCENE.add(shock);
    shocks.push({ mesh: shock, life: 0.5, maxLife: 0.5 });

    for (let i = 0; i < 14; i++) {
      const d = new THREE.Mesh(DEBRIS_GEO, new THREE.MeshBasicMaterial({ color: 0x3a2a1e + (Math.random() * 0x222222 | 0) }));
      d.position.copy(pos);
      d.position.y += 0.5;
      d.castShadow = true;
      const a = Math.random() * Math.PI * 2;
      const sp = 4 + Math.random() * 10;
      d.userData = {
        vel: new THREE.Vector3(Math.cos(a) * sp, 6 + Math.random() * 8, Math.sin(a) * sp),
        life: 0.8 + Math.random() * 0.4,
        maxLife: 1.2,
      };
      SCENE.add(d);
      debris.push(d);
    }

    if (window.Entities && window.Entities.list) {
      for (const e of window.Entities.list) {
        if (e.dead) continue;
        const dx = e.mesh.position.x - pos.x;
        const dz = e.mesh.position.z - pos.z;
        const dy = e.mesh.position.y - pos.y;
        const dist = Math.sqrt(dx * dx + dz * dz + dy * dy);
        if (dist < SHELL_RADIUS) {
          const dmg = SHELL_DAMAGE * (1 - dist / SHELL_RADIUS);
          if (e.takeDamage) e.takeDamage(dmg, 'explosion');
        }
      }
    }
    // Off-map artillery is terrifying: the barrage pins everything in the blast
    // radius regardless of team (suppresses both sides caught in the open).
    if (window.__Suppression) window.__Suppression.applyArtillery(pos.x, pos.z, SHELL_RADIUS);
    // A sustained barrage sets the treeline alight.
    if (window.Fire && window.Fire.onExplosion) window.Fire.onExplosion(pos.x, pos.z, SHELL_RADIUS);

    if (window.CAMERA) {
      const camDist = window.CAMERA.position.distanceTo(pos);
      const shakeAmt = Math.max(0, 1 - camDist / 30) * 0.6;
      if (window.FX && window.FX.shake) window.FX.shake(shakeAmt);
    }

    if (window.Sound) {
      window.Sound.tone(60, 0.5, 'sine', 0.4, 200);
      window.Sound.tone(40, 0.8, 'sawtooth', 0.3, 150);
      if (window.FX) window.FX.sfxExplosion ? window.FX.sfxExplosion() : null;
    }
  }

  function updateShells(dt) {
    for (let i = shells.length - 1; i >= 0; i--) {
      const s = shells[i];
      s.fallTime += dt;

      if (!s.whistlePlayed && s.fallTime > s.duration - WHISTLE_LEAD) {
        s.whistlePlayed = true;
        if (window.Sound) window.Sound.tone(800, WHISTLE_LEAD, 'sine', 0.12, 2000);
      }

      const t = Math.min(1, s.fallTime / s.duration);
      s.mesh.position.lerpVectors(s.origin, s.target, t);
      s.trail.position.copy(s.mesh.position);
      s.trail.position.y += 0.6;
      s.trail.rotation.x = Math.PI;

      if (s.fallTime >= s.duration && !s.detonated) {
        s.detonated = true;
        const gy = window.groundHeight ? window.groundHeight(s.target.x, s.target.z) : 0;
        detonate(new THREE.Vector3(s.target.x, gy + 0.5, s.target.z));
        SCENE.remove(s.mesh);
        SCENE.remove(s.trail);
        shells.splice(i, 1);
      }
    }
  }

  function updateBarrage(dt) {
    if (!state.barrageActive) return;
    if (state.barrageShellsLeft > 0) {
      state.barrageTimer -= dt;
      if (state.barrageTimer <= 0) {
        const offset = state.barrageOffset * 1.5;
        const tx = state.barrageCenter.x + state.barrageDir.x * offset + (Math.random() - 0.5) * 5;
        const tz = state.barrageCenter.z + state.barrageDir.z * offset + (Math.random() - 0.5) * 5;
        const ty = window.groundHeight ? window.groundHeight(tx, tz) : 0;
        fireShell(new THREE.Vector3(tx, ty, tz));
        state.barrageShellsLeft--;
        state.barrageOffset += 1;
        state.barrageTimer = SHELL_INTERVAL;
      }
    }
    if (state.barrageShellsLeft === 0 && shells.length === 0) {
      state.barrageActive = false;
      marker.visible = false;
    }
    if (marker.visible) {
      marker.material.opacity = 0.4 + Math.sin(performance.now() * 0.008) * 0.2;
    }
  }

  function updateEffects(dt) {
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.life -= dt;
      const k = Math.max(0, f.life / f.maxLife);
      if (f.isLight) {
        f.mesh.intensity = 12 * k;
      } else {
        f.mesh.material.opacity = k;
        f.mesh.scale.setScalar(0.3 + (1 - k) * 2.5);
      }
      if (f.life <= 0) {
        SCENE.remove(f.mesh);
        flashes.splice(i, 1);
      }
    }

    for (let i = shocks.length - 1; i >= 0; i--) {
      const s = shocks[i];
      s.life -= dt;
      const k = s.life / s.maxLife;
      s.mesh.material.opacity = k * 0.8;
      s.mesh.scale.setScalar(0.3 + (1 - k) * SHELL_RADIUS);
      if (s.life <= 0) {
        SCENE.remove(s.mesh);
        shocks.splice(i, 1);
      }
    }

    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.userData.life -= dt;
      d.userData.vel.y -= 22 * dt;
      d.position.addScaledVector(d.userData.vel, dt);
      const gy = window.groundHeight ? window.groundHeight(d.position.x, d.position.z) : 0;
      if (d.position.y < gy) {
        d.position.y = gy;
        d.userData.vel.y *= -0.3;
        d.userData.vel.x *= 0.5;
        d.userData.vel.z *= 0.5;
      }
      d.rotation.x += dt * 6;
      d.rotation.z += dt * 4;
      if (d.userData.life <= 0) {
        SCENE.remove(d);
        debris.splice(i, 1);
      }
    }
  }

  function update(dt) {
    state.charge = Math.min(MAX_CHARGE, state.charge + CHARGE_REGEN * dt);
    chargeFill.style.width = (state.charge / MAX_CHARGE * 100) + '%';
    if (state.charge >= MAX_CHARGE && !state.barrageActive) {
      chargeText.textContent = '100% — [G] to fire';
    } else if (state.barrageActive) {
      chargeText.textContent = 'BARRAGE ACTIVE — ' + shells.length + ' incoming';
    } else {
      chargeText.textContent = Math.floor(state.charge / MAX_CHARGE * 100) + '% — recharging';
    }
    updateBarrage(dt);
    updateShells(dt);
    updateEffects(dt);
  }

  function lasePoint(point) {
    if (state.charge < MAX_CHARGE || state.barrageActive) return;
    const cam = window.CAMERA;
    if (!cam) return;
    const dist = cam.position.distanceTo(point);
    if (dist > MAX_RANGE) {
      if (window.FX) window.FX.message('OUT OF RANGE', '#ff6644');
      return;
    }
    beginBarrage(point);
  }

  function init() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'g' || e.key === 'G') {
        const phase = window.Manager && window.Manager.state ? window.Manager.state.phase : 'idle';
        if (phase !== 'playing') return;
        const player = window.Player;
        if (!player || !player.state || !player.state.locked) return;
        const cam = window.CAMERA;
        if (!cam) return;
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(0, 0), cam);
        const hits = ray.intersectObjects([window.GROUND || null].filter(Boolean), false);
        let point;
        if (hits.length > 0) {
          point = hits[0].point.clone();
        } else {
          const fwd = new THREE.Vector3();
          cam.getWorldDirection(fwd);
          const t = 60 / Math.max(0.1, -fwd.y);
          point = cam.position.clone().addScaledVector(fwd, Math.min(t, 80));
          point.y = window.groundHeight ? window.groundHeight(point.x, point.z) : 0;
        }
        lasePoint(point);
      }
    });
  }

  function reset() {
    state.charge = MAX_CHARGE;
    state.barrageActive = false;
    state.barrageShellsLeft = 0;
    marker.visible = false;
    for (const s of shells) { SCENE.remove(s.mesh); SCENE.remove(s.trail); }
    shells.length = 0;
    for (const f of flashes) SCENE.remove(f.mesh);
    flashes.length = 0;
    for (const s of shocks) SCENE.remove(s.mesh);
    shocks.length = 0;
    for (const d of debris) SCENE.remove(d);
    debris.length = 0;
  }

  return { init, update, reset, lasePoint, state };
})();

if (window.Artillery === undefined) window.Artillery = Artillery;