// main.js — FORESTWAR bootstrap: wires all modules, runs the fixed-step update loop, handles lifecycle + pointer lock.
// Per-system input (movement, weapons, squad orders, deployables) is owned by each module; this file
// only orchestrates boot order, the team-select overlay, and the master frame loop.
(() => {
  const SCENE = window.SCENE;
  const CAMERA = window.CAMERA;
  const RENDERER = window.RENDERER;
  if (!SCENE || !CAMERA || !RENDERER) {
    console.error('FORESTWAR: core globals missing — engine shell did not initialise');
    return;
  }
  CAMERA.rotation.order = 'YXZ';

  let running = false;
  let prevTime = performance.now() / 1000;
  let acc = 0;
  const STEP = 1 / 60;

  const overlay = document.getElementById('overlay');

  function pickTeam(team) {
    if (window.Manager && window.Manager.startGame) window.Manager.startGame(team);
  }

  // Team-select buttons (data-team="hunter" / "deer")
  if (overlay) {
    overlay.querySelectorAll('[data-team]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        pickTeam(btn.getAttribute('data-team'));
      });
    });
    // Clicking the backdrop defaults to the hunter deployment.
    overlay.addEventListener('click', () => {
      const ms = window.Manager;
      if (!ms || !ms.state) return;
      if (ms.state.phase === 'idle') pickTeam('hunter');
      else if (ms.state.phase === 'gameover') pickTeam(ms.state.playerTeam || 'hunter');
    });
  }

  // ---- Pointer lock lifecycle ----
  document.addEventListener('pointerlockchange', () => {
    if (!window.Player) return;
    const ms = window.Manager;
    const playing = ms && ms.state && ms.state.phase === 'playing';
    Player.state.locked = playing && document.pointerLockElement === RENDERER.domElement;
  });

  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const ms = window.Manager;
    if (ms && ms.state && ms.state.phase === 'playing' && window.Player && !Player.state.locked) {
      if (RENDERER.domElement.requestPointerLock) RENDERER.domElement.requestPointerLock();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (window.Player) Player.state.locked = false;
      if (document.exitPointerLock) document.exitPointerLock();
      return;
    }
    // 'F' = call reinforcements (backup for the 5 key handled in reinforcements.js)
    if (e.key === 'f' || e.key === 'F') {
      if (window.Reinforcements && window.Reinforcements.call) window.Reinforcements.call();
    }
  });

  window.addEventListener('resize', () => {
    CAMERA.aspect = innerWidth / innerHeight;
    CAMERA.updateProjectionMatrix();
    RENDERER.setSize(innerWidth, innerHeight);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && window.Player) Player.state.locked = false;
  });

  function initModules() {
    // Modules that expose init() (register keys / build HUD / seed the world).
    const mods = ['Objectives', 'Squads', 'Weapons', 'Pickups', 'Vehicle',
                  'Reinforcements', 'Turret', 'Beacon', 'Artillery', 'Smoke', 'OwlStrike', 'Killstreak', 'Scoreboard', 'Fire', 'Ranks', 'Emotes', 'Herd', 'Portals', 'ArmorVest'];
    for (const name of mods) {
      const m = window[name];
      if (m && typeof m.init === 'function') {
        try { m.init(); } catch (err) { console.warn('init ' + name + ' failed:', err); }
      }
    }
    if (window.Radar && typeof Radar.init === 'function') Radar.init();
    if (window.Sky && typeof Sky.init === 'function') Sky.init();
  }

  function update(dt) {
    const ms = window.Manager;
    if (!ms || !ms.state) return;
    if (ms.state.phase === 'playing') {
      const steps = [
        'Player', 'Chaingun', 'Killcam', 'Footsteps', 'Weapons', 'Entities', 'Herd', 'BloodPools', 'Craters', 'Suppression', 'Pickups', 'AmmoDrops', 'Objectives', 'Squads',
        'Vehicle', 'Boss', 'Reinforcements', 'Radar', 'Weather', 'Turret',
        'Artillery', 'Traps', 'Beacon', 'Drone', 'CombatDrone', 'Melee', 'ThreatVision', 'SupplyRadar', 'APC', 'Smoke', 'OwlStrike', 'HeliStrike', 'AC130', 'Killstreak', 'Scoreboard', 'CombatText', 'Regen', 'Adrenaline', 'MedTent', 'ArmorVest', 'SupplyDrop', 'Portals', 'Fire', 'Emotes', 'Warcry'
      ];
      for (const name of steps) {
        const m = window[name];
        if (m && typeof m.update === 'function') m.update(dt);
      }
      if (typeof ms.update === 'function') ms.update(dt);
      if (typeof ms.updateHUD === 'function') ms.updateHUD();
    }
    if (window.Sky && typeof Sky.update === 'function') Sky.update(dt);
    if (window.BloodMoon && typeof BloodMoon.update === 'function') BloodMoon.update(dt);
    if (window.FX && typeof FX.update === 'function') FX.update(dt);
    if (window.Music && typeof Music.update === 'function') Music.update(dt);
    // Ranks runs every frame so its badge/promo-banner fade correctly between matches.
    if (window.Ranks && typeof Ranks.update === 'function') Ranks.update(dt);
  }

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const now = performance.now() / 1000;
    let frameDt = now - prevTime;
    prevTime = now;
    if (frameDt > 0.1) frameDt = 0.1;
    const timeScale = (window.Manager && window.Manager.timeScale) || 1;
    acc += frameDt * timeScale;
    let iter = 0;
    while (acc >= STEP && iter < 5) {
      update(STEP);
      acc -= STEP;
      iter++;
    }
    // Keep the sun's shadow frustum centred on the player.
    if (window.SUN_TARGET) {
      SUN_TARGET.position.set(CAMERA.position.x, 0, CAMERA.position.z);
    }
    RENDERER.render(SCENE, CAMERA);
  }

  function start() {
    if (running) return;
    initModules();
    running = true;
    prevTime = performance.now() / 1000;
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(start, 80));
  } else {
    setTimeout(start, 80);
  }
})();
