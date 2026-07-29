// player.js — FORESTWAR player controller: pointer-lock FPS movement, sprint stamina, crouch, gravity
const Player = (() => {
  const THREE = window.THREE;
  const SCENE = window.SCENE;
  const CAMERA = window.CAMERA;
  const KEYS = {};
  const STAMINA_MAX = 100;
  const STAMINA_DRAIN = 26;
  const STAMINA_REGEN = 14;
  const STAMINA_REGEN_DELAY = 1.3;
  const STAMINA_MIN_BURST = 22;
  const SPEED_WALK = 5.4;
  const SPEED_SPRINT = 9.2;
  const SPEED_CROUCH = 2.6;
  const JUMP_V = 6.4;
  const GRAVITY = 18;
  const RADIUS = 0.45;

  const state = {
    vel: new THREE.Vector3(),
    onGround: true,
    crouching: false,
    stamina: STAMINA_MAX,
    sprinting: false,
    exhausted: false,
    regenTimer: 0,
    locked: false,
    frozen: false,
    firing: false,
    yaw: 0,
    pitch: 0,
    breathCd: 0,
    bobPhase: 0,
    tiltVel: 0,
    tilt: 0,
  };

  const stamBar = document.createElement('div');
  stamBar.style.cssText = 'position:absolute;bottom:66px;left:50%;transform:translateX(-50%);width:230px;height:9px;background:rgba(0,0,0,0.55);border:1px solid rgba(150,200,150,0.4);border-radius:5px;overflow:hidden;display:none;z-index:6;';
  const stamFill = document.createElement('div');
  stamFill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#5fd07a,#c9e87a);transition:width 0.08s,background 0.2s;border-radius:4px;';
  stamBar.appendChild(stamFill);
  document.getElementById('hud').appendChild(stamBar);

  const stamLabel = document.createElement('div');
  stamLabel.style.cssText = 'position:absolute;bottom:77px;left:50%;transform:translateX(-50%);font-size:10px;letter-spacing:2px;color:#9fe8a0;display:none;text-shadow:0 1px 3px #000;z-index:6;';
  stamLabel.textContent = 'STAMINA';
  document.getElementById('hud').appendChild(stamLabel);

  function collision(x, z) {
    const trees = window.TREES || [];
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      const dx = x - t.x, dz = z - t.z;
      if (dx * dx + dz * dz < (t.r + RADIUS) * (t.r + RADIUS)) return true;
    }
    const wc = window.worldColliders || [];
    for (let i = 0; i < wc.length; i++) {
      const c = wc[i];
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < (c.r + RADIUS) * (c.r + RADIUS)) return true;
    }
    return false;
  }

  function tryMove(dx, dz) {
    const p = CAMERA.position;
    if (!collision(p.x + dx, p.z)) p.x += dx;
    if (!collision(p.x, p.z + dz)) p.z += dz;
  }

  function getForward() {
    return new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  }
  function getRight() {
    return new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
  }

  function update(dt) {
    if (window.Killcam && window.Killcam.isActive && window.Killcam.isActive()) return;
    if (state.frozen) {
      // Manning a stationary emplacement (e.g. chaingun): look only, no movement.
      CAMERA.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
      return;
    }
    if (!state.locked) {
      CAMERA.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
      return;
    }
    const fwd = getForward();
    const right = getRight();
    const wish = new THREE.Vector3();
    if (KEYS['KeyW']) wish.add(fwd);
    if (KEYS['KeyS']) wish.sub(fwd);
    if (KEYS['KeyD']) wish.add(right);
    if (KEYS['KeyA']) wish.sub(right);

    const aimAmt = (window.Weapons && Weapons.getAimAmount) ? Weapons.getAimAmount() : 0;
    let speed = SPEED_WALK;
    const wantsSprint = KEYS['ShiftLeft'] && wish.lengthSq() > 0 && !state.crouching;
    const canSprint = wantsSprint && !state.exhausted && state.stamina > 0.5 && aimAmt < 0.3;
    state.sprinting = canSprint;

    if (state.crouching) {
      speed = SPEED_CROUCH;
    } else if (canSprint) {
      speed = SPEED_SPRINT;
      state.stamina = Math.max(0, state.stamina - STAMINA_DRAIN * dt);
      state.regenTimer = STAMINA_REGEN_DELAY;
      state.bobPhase += dt * 16;
      const tgt = ((Math.floor((CAMERA.position.x + CAMERA.position.z) * 0.5) & 1) ? 0.05 : -0.05);
      state.tiltVel += (tgt - state.tilt) * 14 * dt;
      state.tiltVel *= 1 - Math.min(1, 9 * dt);
      state.tilt += state.tiltVel * dt;
    } else {
      state.tilt += (0 - state.tilt) * Math.min(1, 8 * dt);
      state.tiltVel *= 1 - Math.min(1, 6 * dt);
    }

    // Shouldering the weapon for a sight picture slows your stride.
    if (aimAmt > 0.001) speed *= (1 - 0.45 * aimAmt);

    // Adrenaline overcharge grants a burst of speed at low HP.
    if (window.Adrenaline && Adrenaline.isActive()) speed *= Adrenaline.getSpeedMult();
    // Warcry inspires the bellowing player with a short burst of speed.
    if (window.Warcry && Warcry.getPlayerSpeedMult) speed *= Warcry.getPlayerSpeedMult();

    if (state.stamina <= 0.4) state.exhausted = true;
    if (state.exhausted && state.stamina >= STAMINA_MIN_BURST) state.exhausted = false;

    if (!canSprint && state.stamina < STAMINA_MAX) {
      if (state.regenTimer > 0) state.regenTimer -= dt;
      else state.stamina = Math.min(STAMINA_MAX, state.stamina + STAMINA_REGEN * dt);
    }

    if (state.exhausted) {
      state.breathCd -= dt;
      if (state.breathCd <= 0 && window.Sound && window.Sound.breath) {
        window.Sound.breath();
        state.breathCd = 1.3 + Math.random() * 0.5;
      }
    }

    if (KEYS['Space'] && state.onGround) {
      state.vel.y = JUMP_V;
      state.onGround = false;
    }

    if (wish.lengthSq() > 0.001) {
      wish.normalize().multiplyScalar(speed);
      tryMove(wish.x * dt, wish.z * dt);
    }

    state.vel.y -= GRAVITY * dt;
    CAMERA.position.y += state.vel.y * dt;

    const gh = window.groundHeight ? window.groundHeight(CAMERA.position.x, CAMERA.position.z) : 0;
    const eyeBase = state.crouching ? 1.15 : 1.7;
    const floor = gh + eyeBase;
    if (CAMERA.position.y <= floor) {
      CAMERA.position.y = floor;
      state.vel.y = 0;
      state.onGround = true;
    }

    const bobAmt = state.onGround ? Math.min(1, wish.lengthSq()) * (canSprint ? 0.09 : 0.04) : 0;
    const bob = Math.sin(state.bobPhase) * bobAmt;
    state.bobPhase += dt * (canSprint ? 15 : 9);

    CAMERA.rotation.set(state.pitch + bob * 0.35, state.yaw, state.tilt, 'YXZ');

    stamFill.style.width = (state.stamina / STAMINA_MAX * 100) + '%';
    const low = state.stamina < 30;
    stamFill.style.background = state.exhausted
      ? 'linear-gradient(90deg,#c0392b,#e8736a)'
      : (low ? 'linear-gradient(90deg,#e0a040,#e8d27a)' : 'linear-gradient(90deg,#5fd07a,#c9e87a)');
    stamLabel.style.display = '';
    stamBar.style.display = '';
  }

  function onMouseMove(e) {
    if (!state.locked) return;
    state.yaw -= e.movementX * 0.0022;
    state.pitch -= e.movementY * 0.0022;
    const lim = Math.PI / 2 - 0.04;
    state.pitch = Math.max(-lim, Math.min(lim, state.pitch));
  }

  function onKey(e, down) {
    if (e.code === 'ControlLeft' || e.code === 'KeyC') {
      if (down) {
        state.crouching = !state.crouching;
        if (state.crouching && !state.onGround) { state.vel.y = -2; state.onGround = false; }
      }
      e.preventDefault();
      return;
    }
    if (e.code === 'KeyC') e.preventDefault();
    if (down && e.code === 'ShiftLeft' && state.exhausted && window.FX && window.FX.message) {
      window.FX.message('EXHAUSTED', '#e8736a');
    }
    KEYS[e.code] = down;
    if (down && (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Space')) e.preventDefault();
  }

  function reset() {
    state.vel.set(0, 0, 0);
    state.stamina = STAMINA_MAX;
    state.exhausted = false;
    state.regenTimer = 0;
    state.sprinting = false;
    state.crouching = false;
    state.onGround = true;
    state.tilt = 0;
    state.tiltVel = 0;
    state.frozen = false;
    state.firing = false;
  }

  function setLock(v) { state.locked = v; }

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', (e) => { if (e.button === 0) state.firing = true; onKey(e, true); });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) state.firing = false; onKey(e, false); });
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));

  let prevLocked = false;
  setInterval(() => {
    if (state.locked !== prevLocked) {
      prevLocked = state.locked;
      if (!state.locked) for (const k in KEYS) KEYS[k] = false;
    }
  }, 100);

  return { update, reset, setLock, state };
})();
window.Player = Player;