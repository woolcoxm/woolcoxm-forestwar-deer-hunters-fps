// tactical-sprint.js — FORESTWAR tactical sprint: hold Shift for a burst-speed slide that drains stamina fast and kicks FOV
const TacticalSprint = (() => {
  const THREE = window.THREE;
  const CAMERA = window.CAMERA;

  const BOOST_MULT = 1.55;
  const DRAIN_RATE = 40;
  const MIN_STAMINA = 12;
  const RECOVERY_DELAY = 1.8;
  const COOLDOWN = 2.5;
  const FOV_BOOST = 14;
  const FOV_LERP = 7;
  const TILT_ANGLE = 0.035;
  const TILT_LERP = 8;
  const BOOST_FX_RATE = 0.045;

  const state = {
    active: false,
    cd: 0,
    drainMult: 1.0,
    fovDefault: 75,
    fovCurrent: 75,
    tiltCurrent: 0,
    fxTimer: 0,
    wasActive: false,
  };

  const hud = document.getElementById('hud');

  const bar = document.createElement('div');
  bar.style.cssText = 'position:absolute;bottom:92px;left:50%;transform:translateX(-50%);'
    + 'width:190px;height:7px;background:rgba(0,0,0,0.55);'
    + 'border:1px solid rgba(100,200,255,0.4);border-radius:4px;'
    + 'overflow:hidden;opacity:0;transition:opacity 0.2s;z-index:6;';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:100%;height:100%;'
    + 'background:linear-gradient(90deg,#3399cc,#77ddff);'
    + 'border-radius:3px;transition:width 0.05s,background 0.2s;';
  bar.appendChild(fill);
  if (hud) hud.appendChild(bar);

  const label = document.createElement('div');
  label.style.cssText = 'position:absolute;bottom:101px;left:50%;transform:translateX(-50%);'
    + 'font-size:9px;letter-spacing:3px;color:#77ddff;'
    + 'text-shadow:0 1px 3px #000;opacity:0;transition:opacity 0.2s;z-index:6;'
    + 'white-space:nowrap;font-weight:bold;';
  label.textContent = 'TACTICAL SPRINT [HOLD SHIFT]';
  if (hud) hud.appendChild(label);

  const vignette = document.createElement('div');
  vignette.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4;'
    + 'box-shadow:inset 0 0 120px 20px rgba(50,120,200,0);'
    + 'transition:box-shadow 0.15s;';
  if (hud) hud.appendChild(vignette);

  const speedLines = [];
  const LINE_COUNT = 8;
  const LINE_GEO = new THREE.PlaneGeometry(0.04, 0.5);
  const LINE_MAT = new THREE.MeshBasicMaterial({
    color: 0x99ddff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  if (THREE && window.SCENE) {
    for (let i = 0; i < LINE_COUNT; i++) {
      const m = new THREE.Mesh(LINE_GEO, LINE_MAT.clone());
      m.visible = false;
      m.frustumCulled = false;
      window.SCENE.add(m);
      speedLines.push({ mesh: m, phase: Math.random(), offset: Math.random() });
    }
  }

  let shiftHeld = false;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') shiftHeld = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') shiftHeld = false;
  });

  function isPlaying() {
    const ms = window.Manager;
    return ms && ms.state && ms.state.phase === 'playing';
  }

  function isActive() { return state.active; }
  function getSpeedMult() { return state.active ? BOOST_MULT : 1.0; }

  function canActivate() {
    if (state.cd > 0) return false;
    if (!window.Player || !Player.state.locked) return false;
    if (Player.state.stamina < MIN_STAMINA) return false;
    if (Player.state.crouching) return false;
    return true;
  }

  function activate() {
    state.active = true;
    const p = window.Player;
    if (p && p.state) {
      p.state.sprinting = false;
      p.state.regenTimer = Math.max(p.state.regenTimer || 0, RECOVERY_DELAY);
    }
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(180, 0.15, 'sawtooth', 0.2, 900);
      window.Sound.tone(360, 0.1, 'sine', 0.12, 1500);
    }
    if (window.FX && window.FX.message) {
      window.FX.message('TACTICAL SPRINT', '#77ddff');
    }
  }

  function deactivate() {
    if (!state.active) return;
    state.active = false;
    state.cd = COOLDOWN;
    if (window.Player && Player.state) {
      Player.state.regenTimer = Math.max(Player.state.regenTimer || 0, RECOVERY_DELAY);
    }
  }

  function updateFOV(dt) {
    const target = state.active ? state.fovDefault + FOV_BOOST : state.fovDefault;
    state.fovCurrent += (target - state.fovCurrent) * Math.min(1, FOV_LERP * dt);
    if (CAMERA && Math.abs(CAMERA.fov - state.fovCurrent) > 0.1) {
      CAMERA.fov = state.fovCurrent;
      CAMERA.updateProjectionMatrix();
    }
    const targetTilt = state.active ? TILT_ANGLE : 0;
    state.tiltCurrent += (targetTilt - state.tiltCurrent) * Math.min(1, TILT_LERP * dt);
    if (CAMERA) CAMERA.rotation.z = state.tiltCurrent;
  }

  function updateSpeedLines(dt) {
    const visible = state.active;
    const intensity = state.active ? 1.0 : 0.0;
    for (let i = 0; i < speedLines.length; i++) {
      const sl = speedLines[i];
      if (!visible) { sl.mesh.visible = false; continue; }
      sl.phase += dt * 4 * (0.8 + sl.offset * 0.4);
      if (sl.phase > 1) sl.phase -= 1;
      const ang = (i / speedLines.length) * Math.PI * 2 + sl.offset * 0.5;
      const radius = 0.8 + sl.phase * 0.5;
      if (CAMERA) {
        const fwd = new THREE.Vector3();
        CAMERA.getWorldDirection(fwd);
        const right = new THREE.Vector3(fwd.z, 0, -fwd.x).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const pos = CAMERA.position.clone();
        pos.addScaledVector(fwd, -0.8 - sl.phase * 0.4);
        pos.addScaledVector(right, Math.cos(ang) * radius);
        pos.addScaledVector(up, Math.sin(ang) * radius * 0.7);
        sl.mesh.position.copy(pos);
        sl.mesh.lookAt(CAMERA.position);
        sl.mesh.visible = true;
        const fade = (1 - sl.phase) * intensity;
        sl.mesh.material.opacity = fade * 0.5;
        sl.mesh.scale.y = 0.5 + sl.phase * 1.5;
      }
    }
  }

  function updateVignette() {
    if (!state.active && state.wasActive) {
      vignette.style.boxShadow = 'inset 0 0 120px 20px rgba(50,120,200,0)';
    } else if (state.active) {
      const pulse = 0.15 + Math.sin(performance.now() * 0.008) * 0.05;
      vignette.style.boxShadow = 'inset 0 0 120px 20px rgba(50,120,200,' + pulse.toFixed(3) + ')';
    }
    state.wasActive = state.active;
  }

  function updateHUD() {
    if (!window.Player || !Player.state) return;
    const stam = Player.state.stamina;
    const stamMax = 100;
    const frac = Math.max(0, stam / stamMax);
    fill.style.width = (frac * 100).toFixed(1) + '%';
    const show = state.active || state.cd > 0 || shiftHeld;
    const opacity = show ? '0.9' : '0';
    bar.style.opacity = opacity;
    label.style.opacity = opacity;
    if (state.cd > 0) {
      label.textContent = 'RECOVERING...';
      label.style.color = '#ff6644';
      fill.style.background = 'linear-gradient(90deg,#aa3322,#ff8866)';
    } else if (state.active) {
      label.textContent = 'SPRINTING';
      label.style.color = '#77ddff';
      fill.style.background = 'linear-gradient(90deg,#3399cc,#77ddff)';
    } else {
      label.textContent = 'TACTICAL SPRINT [HOLD SHIFT]';
      label.style.color = '#77ddff';
      fill.style.background = 'linear-gradient(90deg,#3399cc,#77ddff)';
    }
  }

  function update(dt) {
    if (!isPlaying()) {
      if (state.active) deactivate();
      state.cd = Math.max(0, state.cd - dt);
      shiftHeld = false;
      updateHUD();
      return;
    }
    if (state.fovDefault < 40 && CAMERA) state.fovDefault = CAMERA.fov || 75;

    state.cd = Math.max(0, state.cd - dt);

    if (shiftHeld && !state.active && canActivate()) activate();

    if (state.active) {
      const p = window.Player;
      if (p && p.state) {
        p.state.stamina -= DRAIN_RATE * state.drainMult * dt;
        p.state.regenTimer = RECOVERY_DELAY;
        if (p.state.stamina <= 0) {
          p.state.stamina = 0;
          p.state.exhausted = true;
          deactivate();
        }
      }
      if (!shiftHeld || !window.Player || !Player.state.locked) deactivate();
      state.fxTimer += dt;
      if (state.fxTimer >= BOOST_FX_RATE) {
        state.fxTimer = 0;
        if (window.Footsteps && window.Footsteps.spawnDust && CAMERA) {
          window.Footsteps.spawnDust(CAMERA.position.x, groundY(CAMERA.position.x, CAMERA.position.z), CAMERA.position.z, 2, 0.6);
        }
      }
    }

    updateFOV(dt);
    updateSpeedLines(dt);
    updateVignette();
    updateHUD();
  }

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function reset() {
    if (state.active) deactivate();
    state.cd = 0;
    state.fovCurrent = state.fovDefault;
    state.tiltCurrent = 0;
    shiftHeld = false;
    for (const sl of speedLines) sl.mesh.visible = false;
    vignette.style.boxShadow = 'inset 0 0 120px 20px rgba(50,120,200,0)';
    bar.style.opacity = '0';
    label.style.opacity = '0';
  }

  function init() {
    if (window.CAMERA) {
      state.fovDefault = CAMERA.fov || 75;
      state.fovCurrent = state.fovDefault;
    }
    if (window.MainLoop && window.MainLoop.add) {
      window.MainLoop.add(update);
    } else {
      const prev = window._tacsprint_frame || null;
      window._tacsprint_frame = () => {
        const now = performance.now() / 1000;
        const dt = prev ? Math.min(0.05, now - prev) : 0.016;
        update(dt);
        window._tacsprint_frame.prev = now;
      };
    }
  }

  return { update, init, reset, isActive, getSpeedMult, state };
})();

window.TacticalSprint = TacticalSprint;