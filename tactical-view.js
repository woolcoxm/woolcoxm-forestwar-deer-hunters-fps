// tactical-view.js — FORESTWAR strategic overwatch: toggles a top-down satellite view for battlefield command
const TacticalView = (() => {
  const CAMERA = window.CAMERA;
  const RENDERER = window.RENDERER;
  const THREE = window.THREE;
  if (!CAMERA || !RENDERER || !THREE) return { init() {}, update() {}, toggle() {}, isActive() {return false;}, state: {} };

  const OVERHEAD_HEIGHT = 95;
  const OVERHEAD_TILT = -1.35;
  const FOV_OVERWATCH = 48;
  const FOV_DEFAULT = 75;
  const TRANSITION_SPEED = 3.5;
  const MINimap_SCALE = 0.5;

  const state = {
    active: false,
    transitioning: false,
    transitionT: 0,
    savedFov: FOV_DEFAULT,
    savedYaw: 0,
    savedPitch: 0,
    savedPos: new THREE.Vector3(),
    camPos: new THREE.Vector3(),
    camTarget: new THREE.Vector3(),
    lookPos: new THREE.Vector3(),
    edgePan: new THREE.Vector2(),
    edgePanSpeed: 35,
    time: 0,
    cursorWorld: new THREE.Vector3(),
  };

  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _ray = new THREE.Raycaster();
  const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const _hitPoint = new THREE.Vector3();

  const hud = document.getElementById('hud');
  if (!hud) return { init() {}, update() {}, toggle() {}, isActive() {return false;}, state: {} };

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:3;'
    + 'background:radial-gradient(ellipse at center, transparent 35%, rgba(8,18,12,0.55) 95%);'
    + 'opacity:0;transition:opacity 0.4s;';
  hud.appendChild(overlay);

  const scanlines = document.createElement('div');
  scanlines.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:3;'
    + 'background:repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(100,200,140,0.04) 4px);'
    + 'opacity:0;transition:opacity 0.4s;';
  hud.appendChild(scanlines);

  const tint = document.createElement('div');
  tint.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2;'
    + 'background:rgba(40,80,50,0.08);opacity:0;transition:opacity 0.4s;';
  hud.appendChild(tint);

  const banner = document.createElement('div');
  banner.style.cssText = 'position:absolute;top:50px;left:50%;transform:translateX(-50%);'
    + 'font-size:14px;letter-spacing:8px;font-weight:bold;color:#88ddaa;'
    + 'text-shadow:0 0 12px rgba(80,200,120,0.6),0 2px 4px #000;'
    + 'opacity:0;transition:opacity 0.3s;z-index:5;';
  banner.textContent = 'COMMAND VIEW';
  hud.appendChild(banner);

  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'position:absolute;top:76px;left:50%;transform:translateX(-50%);'
    + 'font-size:10px;letter-spacing:3px;color:#66aa88;'
    + 'text-shadow:0 1px 3px #000;opacity:0;transition:opacity 0.3s;z-index:5;';
  subtitle.textContent = 'WASD PAN · SCROLL ZOOM · MAP TO EXIT';
  hud.appendChild(subtitle);

  const cursorMarker = document.createElement('div');
  cursorMarker.style.cssText = 'position:absolute;width:24px;height:24px;pointer-events:none;z-index:5;'
    + 'transform:translate(-50%,-50%);opacity:0;';
  cursorMarker.innerHTML =
    '<svg width="24" height="24" viewBox="0 0 24 24">'
    + '<circle cx="12" cy="12" r="3" fill="none" stroke="#88ddaa" stroke-width="1.5"/>'
    + '<line x1="12" y1="0" x2="12" y2="7" stroke="#88ddaa" stroke-width="1.5"/>'
    + '<line x1="12" y1="17" x2="12" y2="24" stroke="#88ddaa" stroke-width="1.5"/>'
    + '<line x1="0" y1="12" x2="7" y2="12" stroke="#88ddaa" stroke-width="1.5"/>'
    + '<line x1="17" y1="12" x2="24" y2="12" stroke="#88ddaa" stroke-width="1.5"/>'
    + '</svg>';
  hud.appendChild(cursorMarker);

  const cursorLabel = document.createElement('div');
  cursorLabel.style.cssText = 'position:absolute;pointer-events:none;z-index:5;font-size:9px;'
    + 'letter-spacing:1px;color:#88ddaa;text-shadow:0 1px 2px #000;opacity:0;white-space:nowrap;';
  hud.appendChild(cursorLabel);

  const enemyDots = [];
  const ALLY_DOTS = [];
  const MAX_DOTS = 80;
  for (let i = 0; i < MAX_DOTS; i++) {
    const dot = document.createElement('div');
    dot.style.cssText = 'position:absolute;width:10px;height:10px;border-radius:50%;'
      + 'transform:translate(-50%,-50%);opacity:0;pointer-events:none;z-index:4;'
      + 'box-shadow:0 0 4px currentColor;';
    hud.appendChild(dot);
    enemyDots.push({ el: dot, target: null, active: false });
  }
  for (let i = 0; i < MAX_DOTS; i++) {
    const dot = document.createElement('div');
    dot.style.cssText = 'position:absolute;width:8px;height:8px;border-radius:50%;'
      + 'transform:translate(-50%,-50%);opacity:0;pointer-events:none;z-index:4;';
    hud.appendChild(dot);
    ALLY_DOTS.push({ el: dot, target: null, active: false });
  }

  const sweep = document.createElement('div');
  sweep.style.cssText = 'position:absolute;top:50%;left:50%;width:600px;height:600px;'
    + 'transform:translate(-50%,-50%);border-radius:50%;pointer-events:none;z-index:3;'
    + 'background:conic-gradient(from 0deg, transparent 0deg, rgba(100,220,140,0.06) 40deg, transparent 80deg);'
    + 'opacity:0;animation:none;';
  hud.appendChild(sweep);

  let sweepAngle = 0;
  const sweepKey = document.createElement('style');
  sweepKey.textContent = '@keyframes tvSweep{to{transform:translate(-50%,-50%) rotate(360deg);}}';
  document.head.appendChild(sweepKey);

  function getPlayerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function getEntities() {
    if (window.Entities && Array.isArray(window.Entities.list)) return window.Entities.list;
    return [];
  }

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function toggle() {
    const ms = window.Manager;
    if (!ms || !ms.state || ms.state.phase !== 'playing') return;
    if (!state.active) activate();
    else deactivate();
  }

  function activate() {
    state.active = true;
    state.transitioning = true;
    state.transitionT = 0;
    state.savedFov = CAMERA.fov;
    state.savedPos.copy(CAMERA.position);
    state.savedYaw = CAMERA.rotation.y;
    state.savedPitch = CAMERA.rotation.x;
    overlay.style.opacity = '1';
    scanlines.style.opacity = '1';
    tint.style.opacity = '1';
    banner.style.opacity = '1';
    subtitle.style.opacity = '0.7';
    cursorMarker.style.opacity = '0.9';
    sweep.style.opacity = '1';
    sweep.style.animation = 'tvSweep 4s linear infinite';
    if (window.Player) Player.state.locked = false;
    if (document.exitPointerLock) document.exitPointerLock();
    if (window.FX) window.FX.message('COMMAND OVERWATCH', '#88ddaa');
    if (window.Sound) {
      window.Sound.tone(330, 0.15, 'sine', 0.15, 2000);
      window.Sound.tone(440, 0.12, 'sine', 0.12, 2000);
    }
    updateDots();
  }

  function deactivate() {
    state.transitioning = true;
    state.transitionT = 0;
    banner.style.opacity = '0';
    subtitle.style.opacity = '0';
    cursorMarker.style.opacity = '0';
    cursorLabel.style.opacity = '0';
    sweep.style.opacity = '0';
    sweep.style.animation = 'none';
    if (window.Player) Player.state.frozen = false;
    setTimeout(() => {
      if (!state.active) {
        overlay.style.opacity = '0';
        scanlines.style.opacity = '0';
        tint.style.opacity = '0';
        for (const d of enemyDots) { d.el.style.opacity = '0'; d.active = false; d.target = null; }
        for (const d of ALLY_DOTS) { d.el.style.opacity = '0'; d.active = false; d.target = null; }
      }
    }, 500);
    state.active = false;
    if (window.Sound) window.Sound.tone(440, 0.1, 'sine', 0.1, 1500);
  }

  function updateTransition(dt) {
    if (!state.transitioning) return;
    state.transitionT += dt * TRANSITION_SPEED;
    const t = Math.min(state.transitionT, 1.0);
    const eased = state.active ? easeOutCubic(t) : easeInCubic(t);
    if (state.active) {
      const player = window.CAMERA ? window.CAMERA.position : null;
      const px = state.savedPos.x;
      const pz = state.savedPos.z;
      state.lookPos.set(px, groundY(px, pz), pz);
      _v1.set(px + state.edgePan.x, OVERHEAD_HEIGHT, pz + state.edgePan.y);
      CAMERA.position.lerpVectors(state.savedPos, _v1, eased);
      CAMERA.rotation.x = lerpAngle(state.savedPitch, OVERHEAD_TILT, eased);
      CAMERA.rotation.y = state.savedYaw;
      CAMERA.rotation.z = 0;
      CAMERA.fov = lerpVal(state.savedFov, FOV_OVERWATCH, eased);
      CAMERA.updateProjectionMatrix();
      CAMERA.lookAt(state.lookPos);
    } else {
      CAMERA.position.lerpVectors(CAMERA.position, state.savedPos, eased * 0.15);
      CAMERA.rotation.x = lerpAngle(CAMERA.rotation.x, state.savedPitch, eased * 0.15);
      CAMERA.rotation.y = lerpAngle(CAMERA.rotation.y, state.savedYaw, eased * 0.15);
      CAMERA.fov = lerpVal(CAMERA.fov, state.savedFov, eased * 0.15);
      CAMERA.updateProjectionMatrix();
    }
    if (t >= 1.0) {
      state.transitioning = false;
      if (!state.active) {
        CAMERA.position.copy(state.savedPos);
        CAMERA.rotation.x = state.savedPitch;
        CAMERA.rotation.y = state.savedYaw;
        CAMERA.rotation.z = 0;
        CAMERA.fov = state.savedFov;
        CAMERA.updateProjectionMatrix();
      }
    }
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInCubic(t) { return t * t * t; }
  function lerpVal(a, b, t) { return a + (b - a) * t; }
  function lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  function handleEdgePan(dt) {
    if (!state.active || state.transitioning) return;
    const mx = state.edgePan.x;
    const mz = state.edgePan.y;
    const maxPan = 60;
    state.edgePan.x = Math.max(-maxPan, Math.min(maxPan, mx));
    state.edgePan.y = Math.max(-maxPan, Math.min(maxPan, mz));
  }

  function updateCamera(dt) {
    if (!state.active || state.transitioning) return;
    const px = state.savedPos.x;
    const pz = state.savedPos.z;
    const tx = px + state.edgePan.x;
    const tz = pz + state.edgePan.y;
    state.lookPos.set(tx, groundY(tx, tz), tz);
    _v1.set(tx, OVERHEAD_HEIGHT, tz);
    CAMERA.position.lerp(_v1, 1 - Math.pow(0.001, dt));
    CAMERA.rotation.x = OVERHEAD_TILT;
    CAMERA.rotation.z = 0;
    CAMERA.lookAt(state.lookPos);
    if (Math.abs(CAMERA.fov - FOV_OVERWATCH) > 0.1) {
      CAMERA.fov += (FOV_OVERWATCH - CAMERA.fov) * (1 - Math.pow(0.001, dt));
      CAMERA.updateProjectionMatrix();
    }
  }

  function updateCursorMarker() {
    if (!state.active) return;
    const sx = innerWidth / 2;
    const sy = innerHeight / 2;
    cursorMarker.style.left = sx + 'px';
    cursorMarker.style.top = sy + 'px';
    const wx = state.lookPos.x;
    const wz = state.lookPos.z;
    state.cursorWorld.set(wx, groundY(wx, wz), wz);
    const ents = getEntities();
    const pt = getPlayerTeam();
    let nearest = null;
    let nearestD2 = 2500;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || !e.mesh) continue;
      const dx = e.mesh.position.x - wx;
      const dz = e.mesh.position.z - wz;
      const d2 = dx * dx + dz * dz;
      if (d2 < nearestD2 && e.team !== pt) { nearestD2 = d2; nearest = e; }
    }
    if (nearest && nearestD2 < 100) {
      const dist = Math.sqrt(nearestD2);
      cursorLabel.textContent = 'HOSTILE ' + dist.toFixed(0) + 'M';
      cursorLabel.style.color = '#ff6644';
      cursorLabel.style.left = (sx + 16) + 'px';
      cursorLabel.style.top = (sy - 8) + 'px';
      cursorLabel.style.opacity = '0.9';
    } else {
      cursorLabel.style.opacity = '0';
    }
  }

  function projectWorldToScreen(worldPos) {
    _v1.copy(worldPos);
    _v1.project(CAMERA);
    const sx = (_v1.x * 0.5 + 0.5) * innerWidth;
    const sy = (-_v1.y * 0.5 + 0.5) * innerHeight;
    _v2.copy(worldPos);
    _v2.subVectors(_v2, CAMERA.position);
    const dist = _v2.length();
    return { x: sx, y: sy, visible: _v1.z > -1 && _v1.z < 1 && dist < 160, dist };
  }

  function updateDots() {
    if (!state.active || state.transitioning) return;
    const ents = getEntities();
    const pt = getPlayerTeam();
    let enemyIdx = 0;
    let allyIdx = 0;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || !e.mesh) continue;
      if (e.team === pt) {
        if (allyIdx >= MAX_DOTS) continue;
        const dot = ALLY_DOTS[allyIdx++];
        dot.target = e;
        dot.active = true;
        const proj = projectWorldToScreen(e.mesh.position);
        if (proj.visible) {
          dot.el.style.left = proj.x + 'px';
          dot.el.style.top = proj.y + 'px';
          dot.el.style.background = pt === 'deer' ? '#f0c98a' : '#c9d8ff';
          dot.el.style.opacity = '0.7';
        } else { dot.el.style.opacity = '0'; }
      } else {
        if (enemyIdx >= MAX_DOTS) continue;
        const dot = enemyDots[enemyIdx++];
        dot.target = e;
        dot.active = true;
        const proj = projectWorldToScreen(e.mesh.position);
        if (proj.visible) {
          dot.el.style.left = proj.x + 'px';
          dot.el.style.top = proj.y + 'px';
          dot.el.style.background = pt === 'deer' ? '#c9d8ff' : '#f0c98a';
          dot.el.style.color = pt === 'deer' ? '#c9d8ff' : '#f0c98a';
          dot.el.style.opacity = '0.85';
        } else { dot.el.style.opacity = '0'; }
      }
    }
    for (let i = enemyIdx; i < MAX_DOTS; i++) {
      enemyDots[i].el.style.opacity = '0';
      enemyDots[i].active = false;
      enemyDots[i].target = null;
    }
    for (let i = allyIdx; i < MAX_DOTS; i++) {
      ALLY_DOTS[i].el.style.opacity = '0';
      ALLY_DOTS[i].active = false;
      ALLY_DOTS[i].target = null;
    }
  }

  let dotTimer = 0;
  function update(dt) {
    state.time += dt;
    if (state.transitioning) updateTransition(dt);
    else if (state.active) {
      updateCamera(dt);
      handleEdgePan(dt);
    }
    if (state.active && !state.transitioning) {
      dotTimer += dt;
      if (dotTimer >= 0.1) {
        dotTimer = 0;
        updateDots();
        updateCursorMarker();
      }
    }
  }

  function init() {
    window.addEventListener('keydown', (e) => {
      const ms = window.Manager;
      if (!ms || !ms.state || ms.state.phase !== 'playing') return;
      if (e.key === 'Tab') {
        e.preventDefault();
        toggle();
      }
      if (state.active && !state.transitioning) {
        const k = e.key.toLowerCase();
        if (k === 'w') state.edgePan.y -= 12;
        else if (k === 's') state.edgePan.y += 12;
        else if (k === 'a') state.edgePan.x -= 12;
        else if (k === 'd') state.edgePan.x += 12;
      }
    });
    window.addEventListener('wheel', (e) => {
      if (!state.active || state.transitioning) return;
      e.preventDefault();
      state.edgePan.x += e.deltaX * 0.03;
      state.edgePan.y += e.deltaY * 0.03;
    }, { passive: false });
  }

  function isActive() { return state.active; }

  return { init, update, toggle, isActive, state };
})();

window.TacticalView = TacticalView;