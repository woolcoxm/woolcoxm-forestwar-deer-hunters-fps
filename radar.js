// radar.js — FORESTWAR threat awareness: directional damage indicators, proximity warning, heartbeat
const Radar = (() => {
  const THREE = window.THREE;
  const CAMERA = window.CAMERA;
  const THREAT_RADIUS = 28;
  const ARROW_DIST = 48;
  const CRITICAL_HP = 30;

  const ring = document.createElement('div');
  ring.style.cssText = 'position:absolute;top:50%;left:50%;width:340px;height:340px;transform:translate(-50%,-50%);pointer-events:none;z-index:5;';
  document.getElementById('hud').appendChild(ring);

  const arrows = [];
  for (let i = 0; i < 12; i++) {
    const a = document.createElement('div');
    a.style.cssText = 'position:absolute;top:50%;left:50%;width:0;height:0;opacity:0;transition:opacity 0.15s;';
    ring.appendChild(a);
    arrows.push(a);
  }

  const proxBar = document.createElement('div');
  proxBar.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:120px;height:120px;border-radius:50%;border:2px solid transparent;pointer-events:none;opacity:0;transition:opacity 0.2s,border-color 0.2s;z-index:5;';
  document.getElementById('hud').appendChild(proxBar);

  const warnText = document.createElement('div');
  warnText.style.cssText = 'position:absolute;top:62%;left:50%;transform:translate(-50%,-50%);font-size:13px;letter-spacing:4px;color:#ff6644;text-shadow:0 0 8px #aa0000;opacity:0;transition:opacity 0.3s;z-index:5;font-weight:bold;';
  warnText.textContent = 'THREAT NEAR';
  document.getElementById('hud').appendChild(warnText);

  const damageIndicators = [];
  const DMG_RING = document.createElement('div');
  DMG_RING.style.cssText = 'position:absolute;top:50%;left:50%;width:300px;height:300px;transform:translate(-50%,-50%);pointer-events:none;z-index:7;';
  document.getElementById('hud').appendChild(DMG_RING);

  let pulseTimer = 0;
  let pulsePhase = 0;
  let beatTimer = 0;
  let beatActive = false;
  let proxLevel = 0;

  function getEnemyList() {
    if (!window.Entities || !Array.isArray(window.Entities.list)) return [];
    const pt = window.Manager && window.Manager.state ? window.Manager.state.playerTeam : 'hunter';
    return window.Entities.list.filter(e => !e.dead && e.team !== pt);
  }

  function showDamageDirection(fromX, fromZ) {
    if (!CAMERA) return;
    const dx = fromX - CAMERA.position.x;
    const dz = fromZ - CAMERA.position.z;
    const camYaw = Math.atan2(-CAMERA.matrix.elements[8], -CAMERA.matrix.elements[10]);
    const enemyAngle = Math.atan2(dx, dz);
    let rel = enemyAngle - camYaw;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const deg = rel * 180 / Math.PI;
    const ind = document.createElement('div');
    ind.style.cssText = 'position:absolute;top:50%;left:50%;width:0;height:0;border-left:14px solid transparent;border-right:14px solid transparent;border-bottom:30px solid rgba(255,40,30,0.85);transform:translate(-50%,-50%) rotate(' + deg + 'deg) translateY(-130px);opacity:1;filter:drop-shadow(0 0 6px #ff0000);transition:opacity 0.6s;';
    DMG_RING.appendChild(ind);
    damageIndicators.push({ el: ind, life: 0.8 });
  }

  function update(dt) {
    if (!CAMERA || !window.Manager || !Manager.state) return;
    if (Manager.state.phase !== 'playing' || !Manager.state.playerAlive) {
      ring.style.opacity = '0';
      proxBar.style.opacity = '0';
      warnText.style.opacity = '0';
      beatActive = false;
      return;
    }

    const enemies = getEnemyList();
    const camYaw = Math.atan2(-CAMERA.matrix.elements[8], -CAMERA.matrix.elements[10]);
    const cos = Math.cos(camYaw), sin = Math.sin(camYaw);

    let nearest = Infinity;
    const threats = [];
    for (const e of enemies) {
      const dx = e.mesh.position.x - CAMERA.position.x;
      const dz = e.mesh.position.z - CAMERA.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < THREAT_RADIUS) threats.push({ e, dx, dz, dist });
      if (dist < nearest) nearest = dist;
    }

    for (let i = 0; i < arrows.length; i++) {
      const arrow = arrows[i];
      if (i < threats.length) {
        const t = threats[i];
        const rotRel = Math.atan2(t.dx, t.dz) - camYaw;
        const near = Math.max(0, 1 - t.dist / THREAT_RADIUS);
        const opacity = 0.3 + near * 0.65;
        const size = 8 + near * 8;
        const offset = ARROW_DIST + near * 20;
        const deg = rotRel * 180 / Math.PI;
        const tx = Math.sin(rotRel) * offset;
        const ty = -Math.cos(rotRel) * offset;
        arrow.style.opacity = String(opacity);
        arrow.style.borderLeft = size + 'px solid transparent';
        arrow.style.borderRight = size + 'px solid transparent';
        arrow.style.borderBottom = (size * 1.4) + 'px solid rgba(255,' + Math.floor(80 + near * 60) + ',40,' + opacity + ')';
        arrow.style.transform = 'translate(' + (tx - size) + 'px,' + (ty - size * 1.4) + 'px)';
        arrow.style.filter = 'drop-shadow(0 0 ' + (3 + near * 5) + 'px rgba(255,60,30,0.7))';
      } else {
        arrow.style.opacity = '0';
      }
    }

    proxLevel = Math.max(0, 1 - nearest / THREAT_RADIUS);
    if (proxLevel > 0.15) {
      pulsePhase += dt * (2 + proxLevel * 4);
      const pulse = 0.5 + 0.5 * Math.sin(pulsePhase * Math.PI * 2);
      proxBar.style.opacity = String(0.3 + proxLevel * 0.5 * pulse);
      proxBar.style.borderColor = 'rgba(255,' + Math.floor(80 - proxLevel * 60) + ',40,0.9)';
      proxBar.style.boxShadow = '0 0 ' + (10 + proxLevel * 20) + 'px rgba(255,40,20,' + (0.3 + proxLevel * 0.4) + ')';
      warnText.style.opacity = String(proxLevel > 0.5 ? pulse * 0.9 : 0);
    } else {
      proxBar.style.opacity = '0';
      warnText.style.opacity = '0';
    }

    const hpRatio = Manager.state.playerHp / Manager.state.playerMaxHp;
    if (hpRatio < CRITICAL_HP / Manager.state.playerMaxHp && Manager.state.playerAlive) {
      beatActive = true;
      beatTimer -= dt;
      const interval = 0.4 + hpRatio * 0.8;
      if (beatTimer <= 0) {
        beatTimer = interval;
        if (window.Sound && window.Sound.heartbeat) window.Sound.heartbeat();
        const flash = document.createElement('div');
        flash.style.cssText = 'position:fixed;inset:0;background:radial-gradient(circle,transparent 40%,rgba(180,0,0,' + (0.15 + proxLevel * 0.2) + ') 100%);pointer-events:none;z-index:4;opacity:0.6;transition:opacity 0.4s;';
        document.getElementById('hud').appendChild(flash);
        setTimeout(() => { flash.style.opacity = '0'; }, 100);
        setTimeout(() => { if (flash.parentNode) flash.remove(); }, 600);
      }
    } else {
      beatActive = false;
    }

    for (let i = damageIndicators.length - 1; i >= 0; i--) {
      damageIndicators[i].life -= dt;
      if (damageIndicators[i].life <= 0) {
        if (damageIndicators[i].el.parentNode) damageIndicators[i].el.remove();
        damageIndicators.splice(i, 1);
      } else {
        damageIndicators[i].el.style.opacity = String(damageIndicators[i].life / 0.8);
      }
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'p') {
      ring.style.opacity = '0';
    }
  });

  let pulseFlash = null;
  function pulse() {
    if (pulseFlash && pulseFlash.parentNode) pulseFlash.remove();
    pulseFlash = document.createElement('div');
    pulseFlash.style.cssText = 'position:fixed;inset:0;background:radial-gradient(circle,transparent 55%,rgba(220,30,20,0.32) 100%);pointer-events:none;z-index:7;opacity:0.9;transition:opacity 0.5s;';
    const hud = document.getElementById('hud');
    if (hud) hud.appendChild(pulseFlash);
    requestAnimationFrame(() => { if (pulseFlash) pulseFlash.style.opacity = '0'; });
    setTimeout(() => { if (pulseFlash && pulseFlash.parentNode) pulseFlash.remove(); pulseFlash = null; }, 600);
  }

  return { update, showDamageDirection, pulse };
})();

window.Radar = Radar;