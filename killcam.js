// killcam.js — FORESTWAR death killcam: cinematic orbit around the player's killer with slow-motion vignette and name banner
const THREE = window.THREE;
const SCENE = window.SCENE;
const Killcam = (() => {
  const ORBIT_DURATION = 4.0;
  const ORBIT_RADIUS = 4.5;
  const ORBIT_HEIGHT = 2.2;
  const ORBIT_SPEED = 1.8;
  const LERP_POS = 4.0;
  const LERP_LOOK = 5.0;
  const SLOWMO_SCALE = 0.35;
  const FADE_IN_TIME = 0.4;
  const FADE_OUT_TIME = 0.5;
  const FOV_KILLCAM = 55;
  const TRACK_RANGE = 120;

  const state = {
    active: false,
    timer: 0,
    targetEnt: null,
    targetName: '',
    targetIsPlayer: false,
    fakeCam: null,
    camPos: new THREE.Vector3(),
    camLook: new THREE.Vector3(),
    desiredPos: new THREE.Vector3(),
    desiredLook: new THREE.Vector3(),
    angle: 0,
    savedFov: 75,
    savedTimeScale: 1.0,
    fadeT: 0,
    failedFindTime: 0,
    lastReal: 0,
  };

  const _tmpPos = new THREE.Vector3();
  const _tmpLook = new THREE.Vector3();
  const _offset = new THREE.Vector3();
  const _killerPos = new THREE.Vector3();

  // Full-screen red fade. Implemented as a DOM layer so it stays glued to the
  // viewport while the killcam orbits (a 3D quad would drift off-screen).
  const fadeOverlay = document.createElement('div');
  fadeOverlay.style.cssText = 'position:absolute;inset:0;background:#440000;opacity:0;pointer-events:none;z-index:7;';
  document.getElementById('hud').appendChild(fadeOverlay);

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;z-index:8;';
  document.getElementById('hud').appendChild(hud);

  const banner = document.createElement('div');
  banner.style.cssText = 'font-size:14px;letter-spacing:6px;color:#ff6644;text-shadow:0 0 16px rgba(180,0,0,0.7),0 2px 6px #000;font-weight:bold;opacity:0;transition:opacity 0.3s;';
  hud.appendChild(banner);

  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'font-size:42px;letter-spacing:4px;color:#ffdd55;text-shadow:0 0 20px rgba(255,100,0,0.6),0 3px 8px #000;font-weight:bold;margin-top:6px;opacity:0;transition:opacity 0.3s;';
  hud.appendChild(nameEl);

  const label = document.createElement('div');
  label.style.cssText = 'font-size:13px;letter-spacing:5px;color:#ff8833;text-shadow:0 0 12px rgba(200,40,0,0.6),0 2px 5px #000;margin-top:14px;opacity:0;transition:opacity 0.3s;';
  label.textContent = '— ELIMINATED BY —';
  hud.appendChild(label);

  const slowmoEl = document.createElement('div');
  slowmoEl.style.cssText = 'position:absolute;bottom:16%;left:50%;transform:translateX(-50%);font-size:11px;letter-spacing:5px;color:#aa88cc;text-shadow:0 0 8px rgba(100,40,160,0.5),0 1px 4px #000;opacity:0;transition:opacity 0.3s;';
  slowmoEl.textContent = '▶ SLOW-MOTION';
  hud.appendChild(slowmoEl);

  const timerEl = document.createElement('div');
  timerEl.style.cssText = 'position:absolute;top:20%;left:50%;transform:translateX(-50%);font-size:16px;letter-spacing:3px;color:#ffaa44;text-shadow:0 0 10px rgba(200,100,0,0.5),0 2px 5px #000;font-weight:bold;opacity:0;transition:opacity 0.3s;';
  hud.appendChild(timerEl);

  const _up = new THREE.Vector3(0, 1, 0);

  function getPlayerKiller() {
    const mgr = window.Manager;
    if (mgr && mgr.state && mgr.state.lastKillerName) {
      return { name: mgr.state.lastKillerName, isPlayer: false, ent: findKillerEntity() };
    }
    return null;
  }

  function findKillerEntity() {
    const mgr = window.Manager;
    if (!mgr || !mgr.state) return null;
    const killerId = mgr.state.lastKillerId;
    const killerPos = mgr.state.lastKillerPos;
    const ents = window.Entities && window.Entities.list;
    if (killerId !== undefined && killerId !== null && ents) {
      for (const e of ents) {
        if (!e.dead && e.id === killerId) return e;
      }
    }
    // No specific entity to follow (boss blast, environmental death): orbit the
    // recorded impact position as a stable static anchor.
    if (killerPos) {
      return { mesh: { position: killerPos }, dead: false };
    }
    return null;
  }

  function trigger() {
    if (state.active) return;
    const mgr = window.Manager;
    if (!mgr || !mgr.state || mgr.state.phase !== 'playing') return;

    const info = getPlayerKiller();
    state.targetName = info ? info.name : 'UNKNOWN';
    state.targetEnt = info ? info.ent : null;
    state.targetIsPlayer = false;

    const cam = window.CAMERA;
    if (!cam) return;

    state.savedFov = cam.fov;
    state.savedTimeScale = (window.Manager && window.Manager.timeScale) ? window.Manager.timeScale : 1.0;

    const target = state.targetEnt && state.targetEnt.mesh ? state.targetEnt.mesh.position : cam.position;
    _killerPos.copy(target);
    state.camPos.copy(cam.position);
    state.camLook.copy(_killerPos);
    state.angle = 0;
    state.timer = 0;
    state.fadeT = 0;
    state.failedFindTime = 0;
    state.lastReal = performance.now() / 1000;

    if (window.Manager) {
      window.Manager.timeScale = SLOWMO_SCALE;
      if (window.Manager.state) window.Manager.state.killcamActive = true;
    }

    state.active = true;
    fadeOverlay.style.opacity = '0';
    hud.style.display = 'flex';

    nameEl.textContent = state.targetName;
    banner.textContent = 'YOU WERE DOWNED';
    setTimeout(() => {
      if (!state.active) return;
      nameEl.style.opacity = '1';
      label.style.opacity = '1';
      banner.style.opacity = '1';
      slowmoEl.style.opacity = '0.8';
    }, 150);

    if (window.Sound) {
      window.Sound.tone(110, 1.5, 'sawtooth', 0.25, 600);
      window.Sound.tone(55, 2.0, 'sine', 0.15, 400);
    }
  }

  function cancel() {
    if (!state.active) return;
    state.active = false;
    fadeOverlay.style.opacity = '0';
    hud.style.display = 'none';
    nameEl.style.opacity = '0';
    label.style.opacity = '0';
    banner.style.opacity = '0';
    slowmoEl.style.opacity = '0';
    timerEl.style.opacity = '0';

    const cam = window.CAMERA;
    if (cam) {
      cam.fov = state.savedFov;
      cam.updateProjectionMatrix();
    }
    if (window.Manager) {
      window.Manager.timeScale = state.savedTimeScale;
      if (window.Manager.state) window.Manager.state.killcamActive = false;
    }
  }

  function update(dt) {
    if (!state.active) return;
    // Drive the orbit off wall-clock time so the slow-motion time scale (which
    // slows the simulation step cadence) doesn't stretch the cinematic itself.
    const now = performance.now() / 1000;
    const realDt = Math.min(0.05, now - state.lastReal);
    state.lastReal = now;
    state.timer += realDt;

    const cam = window.CAMERA;
    if (!cam) return;

    state.angle += ORBIT_SPEED * realDt;

    const target = state.targetEnt && state.targetEnt.mesh && !state.targetEnt.dead ? state.targetEnt.mesh.position : _killerPos;
    if (state.targetEnt && state.targetEnt.dead) {
      state.failedFindTime += realDt;
    } else if (state.targetEnt && state.targetEnt.mesh) {
      _killerPos.lerp(target, Math.min(1, LERP_LOOK * realDt));
      state.failedFindTime = 0;
    } else {
      state.failedFindTime += realDt;
    }

    const cx = _killerPos.x + Math.cos(state.angle) * ORBIT_RADIUS;
    const cz = _killerPos.z + Math.sin(state.angle) * ORBIT_RADIUS;
    const cy = _killerPos.y + ORBIT_HEIGHT;
    state.desiredPos.set(cx, cy, cz);
    state.desiredLook.copy(_killerPos);
    state.desiredLook.y += 1.0;

    state.camPos.lerp(state.desiredPos, Math.min(1, LERP_POS * realDt));
    state.camLook.lerp(state.desiredLook, Math.min(1, LERP_LOOK * realDt));

    cam.position.copy(state.camPos);
    cam.up.copy(_up);
    cam.lookAt(state.camLook);

    const targetFov = FOV_KILLCAM + Math.sin(state.timer * 1.5) * 2.0;
    cam.fov += (targetFov - cam.fov) * Math.min(1, 3.0 * realDt);
    cam.updateProjectionMatrix();

    if (state.timer < FADE_IN_TIME) {
      state.fadeT = state.timer / FADE_IN_TIME;
    } else if (state.timer > ORBIT_DURATION - FADE_OUT_TIME) {
      const t = (ORBIT_DURATION - state.timer) / FADE_OUT_TIME;
      state.fadeT = Math.max(0, t);
    } else {
      state.fadeT = 1.0;
    }
    fadeOverlay.style.opacity = (state.fadeT * 0.55).toFixed(3);

    const remaining = Math.max(0, ORBIT_DURATION - state.timer);
    if (state.timer > 0.6) {
      timerEl.textContent = 'RESPAWN IN ' + remaining.toFixed(1);
      timerEl.style.opacity = String(state.fadeT);
    }

    if (state.timer >= ORBIT_DURATION || state.failedFindTime > 2.0) {
      cancel();
    }
  }

  function isActive() { return state.active; }

  function dispose() {
    cancel();
    if (fadeOverlay.parentNode) fadeOverlay.parentNode.removeChild(fadeOverlay);
    if (hud.parentNode) hud.parentNode.removeChild(hud);
  }

  return { trigger, cancel, update, isActive, dispose, DURATION: ORBIT_DURATION, SLOWMO: SLOWMO_SCALE };
})();
window.Killcam = Killcam;