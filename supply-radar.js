// supply-radar.js — FORESTWAR supply detector: directional pickup pings with distance-scaled markers
(() => {
  const SCAN_RANGE = 70;
  const UPDATE_INTERVAL = 0.12;
  const PING_LIFE = 1.2;
  const MAX_PINGS = 16;

  const hud = document.getElementById('hud');
  if (!hud) return;

  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;top:50%;left:50%;width:1px;height:1px;pointer-events:none;z-index:4;';
  hud.appendChild(container);

  const sweep = document.createElement('div');
  sweep.style.cssText = 'position:absolute;top:50%;left:50%;width:240px;height:240px;transform:translate(-50%,-50%);border-radius:50%;border:1px solid rgba(150,200,150,0.12);opacity:0.5;';
  container.appendChild(sweep);

  const sweepLine = document.createElement('div');
  sweepLine.style.cssText = 'position:absolute;top:50%;left:50%;width:120px;height:120px;transform-origin:0 0;background:conic-gradient(from 0deg, rgba(150,230,150,0) 0deg, rgba(150,230,150,0.08) 50deg, rgba(150,230,150,0) 60deg);border-radius:50%;animation:supplysweep 3s linear infinite;';
  container.appendChild(sweepLine);

  const animStyle = document.createElement('style');
  animStyle.textContent = '@keyframes supplysweep{to{transform:rotate(360deg);}}';
  document.head.appendChild(animStyle);

  const pings = [];
  for (let i = 0; i < MAX_PINGS; i++) {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;top:0;left:0;width:10px;height:10px;transform:translate(-50%,-50%);border-radius:50%;opacity:0;pointer-events:none;';
    container.appendChild(el);
    pings.push({ el, life: 0, x: 0, z: 0, type: 'health' });
  }

  let updateTimer = 0;
  let pingIndex = 0;
  let visible = false;

  function getPickups() {
    if (window.Pickups && Array.isArray(window.Pickups.crates)) {
      return window.Pickups.crates;
    }
    return [];
  }

  function show() {
    if (!visible) {
      visible = true;
      sweep.style.opacity = '0.5';
    }
  }

  function hide() {
    if (visible) {
      visible = false;
      sweep.style.opacity = '0';
      for (const p of pings) p.el.style.opacity = '0';
    }
  }

  function spawnPing(x, z, type) {
    const slot = pings[pingIndex];
    pingIndex = (pingIndex + 1) % MAX_PINGS;
    slot.life = PING_LIFE;
    slot.x = x;
    slot.z = z;
    slot.type = type;
    slot.el.style.background = type === 'health' ? '#ff4444' : '#55ff66';
    slot.el.style.boxShadow = type === 'health' ? '0 0 8px #ff4444' : '0 0 8px #55ff66';
  }

  function update(dt) {
    const mgr = window.Manager;
    if (!mgr || !mgr.state || mgr.state.phase !== 'playing') {
      hide();
      return;
    }
    show();

    updateTimer -= dt;
    if (updateTimer <= 0) {
      updateTimer = UPDATE_INTERVAL;
      const cam = window.CAMERA;
      if (!cam) return;
      const pickups = getPickups();
      for (const c of pickups) {
        if (!c || c.collected || !c.group) continue;
        const dx = c.group.position.x - cam.position.x;
        const dz = c.group.position.z - cam.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < SCAN_RANGE) {
          spawnPing(c.group.position.x, c.group.position.z, c.type);
        }
      }
    }

    const cam = window.CAMERA;
    if (!cam) return;
    const camYaw = Math.atan2(-cam.matrix.elements[8], -cam.matrix.elements[10]);

    for (const p of pings) {
      if (p.life <= 0) {
        p.el.style.opacity = '0';
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.el.style.opacity = '0';
        continue;
      }

      const dx = p.x - cam.position.x;
      const dz = p.z - cam.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > SCAN_RANGE) continue;

      const worldAngle = Math.atan2(dx, dz);
      let relAngle = worldAngle - camYaw;
      while (relAngle > Math.PI) relAngle -= Math.PI * 2;
      while (relAngle < -Math.PI) relAngle += Math.PI * 2;

      const norm = dist / SCAN_RANGE;
      const radius = norm * 120;
      const px = Math.sin(relAngle) * radius;
      const py = -Math.cos(relAngle) * radius;

      const lifeFrac = p.life / PING_LIFE;
      const pulseScale = 0.7 + Math.sin(p.life * 14) * 0.3;
      const size = 10 * pulseScale * (1 - norm * 0.4);

      p.el.style.width = size + 'px';
      p.el.style.height = size + 'px';
      p.el.style.transform = 'translate(calc(' + px + 'px - 50%), calc(' + py + 'px - 50%))';
      p.el.style.opacity = (lifeFrac * 0.85).toFixed(2);
    }
  }

  window.SupplyRadar = { update };

  if (window.Manager && Manager.afterUpdate) {
    const orig = Manager.afterUpdate;
    Manager.afterUpdate = function(dt) {
      orig.call(this, dt);
      update(dt);
    };
  }

  if (window.mainLoopHooks) {
    window.mainLoopHooks.push(update);
  }
})();