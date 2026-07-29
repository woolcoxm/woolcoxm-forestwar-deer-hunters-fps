// mobile.js — FORESTWAR mobile touch controls: virtual joystick movement, drag-look, fire/jump/reload buttons
(() => {
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (!isTouch) return;

  const Player = window.Player;
  const Weapons = window.Weapons;
  const CAMERA = window.CAMERA;
  if (!Player || !Player.state || !CAMERA) return;

  const state = Player.state;
  const stKeys = { w: false, a: false, s: false, d: false };

  const stick = { id: null, cx: 0, cy: 0, dx: 0, dy: 0 };
  const look = { id: null, lx: 0, ly: 0 };

  const MOVE_RADIUS = 55;
  const LOOK_SENS = 0.004;
  const FIRE_MS = 250;

  let firing = false;
  let fireTimer = null;

  const hud = document.getElementById('hud');
  if (!hud) return;

  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;inset:0;z-index:16;pointer-events:none;';
  hud.appendChild(container);

  const stickBase = document.createElement('div');
  stickBase.style.cssText = 'position:absolute;bottom:90px;left:50px;width:130px;height:130px;border-radius:50%;border:2px solid rgba(150,200,150,0.3);background:rgba(20,30,20,0.3);pointer-events:auto;display:flex;align-items:center;justify-content:center;';
  container.appendChild(stickBase);

  const stickKnob = document.createElement('div');
  stickKnob.style.cssText = 'width:55px;height:55px;border-radius:50%;background:rgba(150,200,150,0.45);border:2px solid rgba(180,230,180,0.6);';
  stickBase.appendChild(stickKnob);

  stickBase.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (stick.id !== null) return;
    const t = e.changedTouches[0];
    stick.id = t.identifier;
    const rect = stickBase.getBoundingClientRect();
    stick.cx = rect.left + rect.width / 2;
    stick.cy = rect.top + rect.height / 2;
  }, { passive: false });

  stickBase.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier !== stick.id) continue;
      let dx = t.clientX - stick.cx;
      let dy = t.clientY - stick.cy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > MOVE_RADIUS) { dx = (dx / len) * MOVE_RADIUS; dy = (dy / len) * MOVE_RADIUS; }
      stick.dx = dx;
      stick.dy = dy;
      stickKnob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      updateMove();
    }
  }, { passive: false });

  function endStick(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === stick.id) {
        stick.id = null;
        stick.dx = 0;
        stick.dy = 0;
        stickKnob.style.transform = '';
        updateMove();
      }
    }
  }
  stickBase.addEventListener('touchend', endStick, { passive: false });
  stickBase.addEventListener('touchcancel', endStick, { passive: false });

  function updateMove() {
    const dead = 12;
    const right = stick.dx > dead;
    const left = stick.dx < -dead;
    const down = stick.dy > dead;
    const up = stick.dy < -dead;
    stKeys.d = right;
    stKeys.a = left;
    stKeys.s = down;
    stKeys.w = up;
    if (!window.KEYS) return;
    window.KEYS['d'] = right;
    window.KEYS['a'] = left;
    window.KEYS['s'] = down;
    window.KEYS['w'] = up;
    window.KEYS['arrowright'] = right;
    window.KEYS['arrowleft'] = left;
    window.KEYS['arrowdown'] = down;
    window.KEYS['arrowup'] = up;
  }

  const lookPad = document.createElement('div');
  lookPad.style.cssText = 'position:absolute;top:0;right:0;bottom:0;left:50%;pointer-events:auto;';
  container.appendChild(lookPad);

  lookPad.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (look.id !== null) return;
    const t = e.changedTouches[0];
    look.id = t.identifier;
    look.lx = t.clientX;
    look.ly = t.clientY;
  }, { passive: false });

  lookPad.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier !== look.id) continue;
      const dx = t.clientX - look.lx;
      const dy = t.clientY - look.ly;
      look.lx = t.clientX;
      look.ly = t.clientY;
      state.yaw -= dx * LOOK_SENS;
      state.pitch -= dy * LOOK_SENS;
      state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch));
      CAMERA.rotation.y = state.yaw;
      CAMERA.rotation.x = state.pitch;
    }
  }, { passive: false });

  function endLook(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === look.id) look.id = null;
    }
  }
  lookPad.addEventListener('touchend', endLook, { passive: false });
  lookPad.addEventListener('touchcancel', endLook, { passive: false });

  function makeBtn(label, rightPx, color, onPress) {
    const b = document.createElement('div');
    b.textContent = label;
    b.style.cssText = 'position:absolute;bottom:110px;right:' + rightPx + 'px;width:64px;height:64px;border-radius:50%;'
      + 'border:2px solid ' + color + ';background:rgba(20,30,20,0.55);color:' + color + ';'
      + 'font-size:10px;font-weight:bold;letter-spacing:1px;'
      + 'display:flex;align-items:center;justify-content:center;text-align:center;'
      + 'pointer-events:auto;user-select:none;';
    container.appendChild(b);
    b.addEventListener('touchstart', (e) => { e.preventDefault(); onPress(); }, { passive: false });
    b.addEventListener('touchend', (e) => { e.preventDefault(); }, { passive: false });
    return b;
  }

  makeBtn('FIRE', 24, '#ff6644', () => {
    firing = true;
    if (fireTimer) clearInterval(fireTimer);
    if (Weapons && Weapons.fire) Weapons.fire();
    fireTimer = setInterval(() => {
      if (!firing) return;
      if (Weapons && Weapons.fire) Weapons.fire();
    }, FIRE_MS);
  });

  const fireStop = document.createElement('div');
  fireStop.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  container.appendChild(fireStop);
  document.addEventListener('touchend', () => {
    setTimeout(() => {
      if (document.querySelectorAll('div').length >= 0) {
        let anyTouch = false;
        for (let i = 0; i < document.querySelectorAll('[style*="pointer-events:auto"]').length; i++) {
          /* noop */
        }
      }
    }, 0);
  });

  makeBtn('JUMP', 100, '#9fe8a0', () => {
    if (state.onGround) {
      state.vel.y = 6.4;
      state.onGround = false;
    }
  });

  makeBtn('R', 178, '#c9d8ff', () => {
    if (Weapons && Weapons.startReload) Weapons.startReload();
  });

  makeBtn('SWAP', 256, '#ffcc44', () => {
    if (Weapons && Weapons.cycle) Weapons.cycle();
  });

  window.addEventListener('blur', () => {
    firing = false;
    if (fireTimer) clearInterval(fireTimer);
  });

  setTimeout(() => {
    const ms = window.Manager && window.Manager.state;
    if (ms && ms.phase !== 'idle') {
      if (!state.locked) state.locked = true;
    }
  }, 2000);
})();