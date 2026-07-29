// command-map.js — FORESTWAR tactical HUD: minimap, objective tracker, team score, buff timers
(() => {
  const MAP_RANGE = 160;
  const MAP_SIZE = 170;
  const MAP_HALF = MAP_SIZE / 2;

  const hud = document.getElementById('hud');
  if (!hud) return;

  const wrap = document.createElement('div');
  wrap.id = 'cmdmap';
  wrap.style.cssText = 'position:absolute;right:14px;bottom:14px;width:' + MAP_SIZE + 'px;pointer-events:none;text-shadow:0 2px 4px #000;';
  hud.appendChild(wrap);

  const title = document.createElement('div');
  title.style.cssText = 'font-size:11px;letter-spacing:2px;color:#9fe8a0;text-align:center;margin-bottom:4px;';
  title.textContent = 'TACTICAL MAP';
  wrap.appendChild(title);

  const border = document.createElement('div');
  border.style.cssText = 'position:relative;width:' + MAP_SIZE + 'px;height:' + MAP_SIZE + 'px;border:1px solid rgba(150,200,150,0.5);border-radius:3px;background:radial-gradient(circle,rgba(10,20,10,0.75),rgba(0,0,0,0.88));box-shadow:0 0 18px rgba(0,0,0,0.6);overflow:hidden;';
  wrap.appendChild(border);

  const canvas = document.createElement('canvas');
  canvas.width = MAP_SIZE;
  canvas.height = MAP_SIZE;
  canvas.style.cssText = 'position:absolute;inset:0;';
  border.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const sweep = document.createElement('div');
  sweep.style.cssText = 'position:absolute;inset:0;background:conic-gradient(from 0deg,rgba(140,230,140,0) 0deg,rgba(140,230,140,0.12) 40deg,rgba(140,230,140,0) 80deg);animation:cmdsweep 4s linear infinite;border-radius:3px;';
  border.appendChild(sweep);

  const sweepKey = document.createElement('style');
  sweepKey.textContent = '@keyframes cmdsweep{to{transform:rotate(360deg);}}';
  document.head.appendChild(sweepKey);

  const legend = document.createElement('div');
  legend.style.cssText = 'display:flex;justify-content:space-around;margin-top:5px;font-size:10px;letter-spacing:1px;';
  legend.innerHTML = '<span class="deer-c">● DEER</span><span class="hunter-c">● HUNTERS</span><span style="color:#9fe8a0">▲ YOU</span>';
  wrap.appendChild(legend);

  const objBar = document.createElement('div');
  objBar.style.cssText = 'margin-top:10px;';
  wrap.appendChild(objBar);

  const buffRow = document.createElement('div');
  buffRow.style.cssText = 'margin-top:8px;font-size:11px;letter-spacing:1px;line-height:1.5;';
  wrap.appendChild(buffRow);

  const scoreRow = document.createElement('div');
  scoreRow.style.cssText = 'margin-top:8px;font-size:12px;letter-spacing:2px;text-align:center;';
  wrap.appendChild(scoreRow);

  let time = 0;
  const _px = (wx) => Math.round(MAP_HALF + (wx / MAP_RANGE) * (MAP_HALF - 4));
  const _pz = (wz) => Math.round(MAP_HALF - (wz / MAP_RANGE) * (MAP_HALF - 4));

  function getPlayerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }
  function playerAlive() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerAlive : true;
  }

  function drawEntity(ctx2, e, pt, ox, oz) {
    if (e.dead || e.team === 'none') return;
    const mp = e.mesh.position;
    const dx = mp.x - ox;
    const dz = mp.z - oz;
    if (Math.abs(dx) > MAP_RANGE || Math.abs(dz) > MAP_RANGE) return;
    const px = _px(dx);
    const pz = _pz(dz);
    if (e.team === pt) {
      ctx2.fillStyle = '#44dd66';
      ctx2.fillRect(px - 1, pz - 1, 3, 3);
    } else {
      ctx2.fillStyle = e.team === 'deer' ? '#f0c98a' : '#c9d8ff';
      ctx2.beginPath();
      ctx2.arc(px, pz, 2.5, 0, Math.PI * 2);
      ctx2.fill();
    }
  }

  function drawObjective(ctx2, obj) {
    const px = _px(obj.x);
    const pz = _pz(obj.z);
    let color = '#888888';
    if (obj.owner === 'deer') color = '#f0c98a';
    else if (obj.owner === 'hunter') color = '#c9d8ff';
    ctx2.strokeStyle = color;
    ctx2.lineWidth = 1.5;
    ctx2.globalAlpha = 0.7;
    ctx2.beginPath();
    ctx2.arc(px, pz, 6, 0, Math.PI * 2);
    ctx2.stroke();
    ctx2.globalAlpha = 1;
    ctx2.fillStyle = color;
    ctx2.fillRect(px - 1.5, pz - 1.5, 3, 3);
    if (obj.capture > 0 && obj.capture < 100) {
      const seg = (obj.capture / 100) * Math.PI * 2;
      ctx2.strokeStyle = '#ffffff';
      ctx2.lineWidth = 2;
      ctx2.beginPath();
      ctx2.arc(px, pz, 8, -Math.PI / 2, -Math.PI / 2 + seg);
      ctx2.stroke();
    }
  }

  function drawSpecials(ctx2, ox, oz) {
    if (window.Boss && window.Boss.boss && window.Boss.boss.active) {
      const mp = window.Boss.boss.mesh.position;
      const dx = mp.x - ox, dz = mp.z - oz;
      if (Math.abs(dx) <= MAP_RANGE && Math.abs(dz) <= MAP_RANGE) {
        const px = _px(dx), pz = _pz(dz);
        ctx2.fillStyle = '#ff2200';
        ctx2.beginPath();
        ctx2.arc(px, pz, 5, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.strokeStyle = '#ff6644';
        ctx2.lineWidth = 1;
        ctx2.stroke();
      }
    }
    if (window.APC && window.APC.apc && window.APC.apc.alive) {
      const mp = window.APC.apc.mesh.position;
      const dx = mp.x - ox, dz = mp.z - oz;
      if (Math.abs(dx) <= MAP_RANGE && Math.abs(dz) <= MAP_RANGE) {
        const px = _px(dx), pz = _pz(dz);
        ctx2.fillStyle = '#cc8833';
        ctx2.fillRect(px - 2, pz - 3, 4, 6);
      }
    }
    if (window.Courier && window.Courier.state && window.Courier.state.active) {
      const mp = window.Courier.state.active.mesh.position;
      const dx = mp.x - ox, dz = mp.z - oz;
      if (Math.abs(dx) <= MAP_RANGE && Math.abs(dz) <= MAP_RANGE) {
        const px = _px(dx), pz = _pz(dz);
        ctx2.fillStyle = '#ffdd44';
        ctx2.beginPath();
        ctx2.moveTo(px, pz - 4);
        ctx2.lineTo(px - 3, pz + 3);
        ctx2.lineTo(px + 3, pz + 3);
        ctx2.closePath();
        ctx2.fill();
      }
    }
    if (window.Portals && window.Portals.getPortal) {
      const portal = window.Portals.getPortal();
      if (portal) {
        const dx = portal.x - ox, dz = portal.z - oz;
        if (Math.abs(dx) <= MAP_RANGE && Math.abs(dz) <= MAP_RANGE) {
          const px = _px(dx), pz = _pz(dz);
          const col = portal.team === 'deer' ? '#f0c98a' : '#c9d8ff';
          const pulse = 4 + Math.sin(time * 8) * 2;
          ctx2.strokeStyle = col;
          ctx2.lineWidth = 2;
          ctx2.globalAlpha = 0.85;
          ctx2.beginPath();
          ctx2.arc(px, pz, pulse, 0, Math.PI * 2);
          ctx2.stroke();
          ctx2.fillStyle = col;
          ctx2.beginPath();
          ctx2.moveTo(px, pz - 3); ctx2.lineTo(px + 3, pz); ctx2.lineTo(px, pz + 3); ctx2.lineTo(px - 3, pz);
          ctx2.closePath();
          ctx2.fill();
          ctx2.globalAlpha = 1;
        }
      }
    }
  }

  function drawPickups(ctx2, ox, oz) {
    if (!window.Pickups || !Array.isArray(window.Pickups.crates)) return;
    for (const c of window.Pickups.crates) {
      if (!c.active) continue;
      const mp = c.group.position;
      const dx = mp.x - ox, dz = mp.z - oz;
      if (Math.abs(dx) > MAP_RANGE || Math.abs(dz) > MAP_RANGE) continue;
      const px = _px(dx), pz = _pz(dz);
      ctx2.fillStyle = c.type === 'health' ? '#ff5555' : '#55ff66';
      ctx2.fillRect(px - 1, pz - 1, 2, 2);
    }
  }

  function renderObjectives() {
    objBar.innerHTML = '';
    if (!window.Objectives || !window.Objectives.state || !Array.isArray(window.Objectives.state.points)) return;
    const pt = getPlayerTeam();
    for (let i = 0; i < window.Objectives.state.points.length; i++) {
      const p = window.Objectives.state.points[i];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:10px;letter-spacing:1px;margin-bottom:3px;';
      let color = '#888888';
      let label = 'NEUTRAL';
      if (p.owner === 'deer') { color = '#f0c98a'; label = 'DEER'; }
      else if (p.owner === 'hunter') { color = '#c9d8ff'; label = 'HUNTERS'; }
      if (p.capture > 0 && p.capture < 100) {
        const contendingTeam = p.capture > 50 ? (p.owner || 'neutral') : 'enemy';
        row.style.opacity = '0.85 + ' + (Math.sin(time * 6) * 0.15);
      }
      const dot = document.createElement('div');
      dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:' + color + ';border:1px solid rgba(255,255,255,0.4);flex-shrink:0;';
      row.appendChild(dot);
      const name = document.createElement('div');
      name.style.cssText = 'flex:1;color:' + color + ';';
      name.textContent = 'CP-' + String.fromCharCode(65 + i);
      row.appendChild(name);
      const barWrap = document.createElement('div');
      barWrap.style.cssText = 'width:50px;height:5px;background:rgba(0,0,0,0.5);border-radius:2px;overflow:hidden;';
      const barFill = document.createElement('div');
      barFill.style.cssText = 'height:100%;width:' + p.capture + '%;background:' + color + ';transition:width 0.15s;';
      barWrap.appendChild(barFill);
      row.appendChild(barWrap);
      const tag = document.createElement('div');
      tag.style.cssText = 'width:42px;text-align:right;font-size:9px;color:' + color + ';';
      tag.textContent = label.slice(0, 6);
      row.appendChild(tag);
      objBar.appendChild(row);
    }
  }

  function renderBuffs() {
    buffRow.innerHTML = '';
    const items = [];
    const pt = getPlayerTeam();
    if (window.Objectives && window.Objectives.state && window.Objectives.state.buff) {
      const b = window.Objectives.state.buff;
      if (b.deer > 0) items.push({ label: 'DEER OBJ', t: b.deer, color: '#f0c98a' });
      if (b.hunter > 0) items.push({ label: 'HUNTER OBJ', t: b.hunter, color: '#c9d8ff' });
    }
    if (window.Courier && window.Courier.state && window.Courier.state.buff) {
      const b = window.Courier.state.buff;
      if (b.deer > 0) items.push({ label: 'DEER COURIER', t: b.deer, color: '#ffaa44' });
      if (b.hunter > 0) items.push({ label: 'HUNTER COURIER', t: b.hunter, color: '#66aaff' });
    }
    if (items.length === 0) {
      buffRow.style.opacity = '0';
    } else {
      buffRow.style.opacity = '1';
      for (const it of items) {
        const row = document.createElement('div');
        row.style.cssText = 'color:' + it.color + ';';
        row.textContent = it.label + ': ' + it.t.toFixed(1) + 's';
        buffRow.appendChild(row);
      }
    }
  }

  function renderScore() {
    const s = (window.Manager && window.Manager.state) ? window.Manager.state : null;
    if (!s) { scoreRow.textContent = ''; return; }
    const dk = s.kills ? s.kills.deer : 0;
    const hk = s.kills ? s.kills.hunter : 0;
    scoreRow.innerHTML = '<span class="deer-c">' + dk + '</span> KILLS <span class="hunter-c">' + hk + '</span> | WAVE ' + (s.wavesCleared || 0);
  }

  function update(dt) {
    time += dt;
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    ctx.fillStyle = 'rgba(40,60,40,0.25)';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    ctx.strokeStyle = 'rgba(120,180,120,0.06)';
    ctx.lineWidth = 1;
    for (let g = 0; g <= MAP_SIZE; g += MAP_SIZE / 8) {
      ctx.beginPath(); ctx.moveTo(g, 0); ctx.lineTo(g, MAP_SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, g); ctx.lineTo(MAP_SIZE, g); ctx.stroke();
    }
    const cam = window.CAMERA;
    if (!cam) return;
    const ox = cam.position.x;
    const oz = cam.position.z;

    if (window.Objectives && window.Objectives.state && window.Objectives.state.points) {
      for (const p of window.Objectives.state.points) drawObjective(ctx, p);
    }
    drawPickups(ctx, ox, oz);
    if (window.Entities && Array.isArray(window.Entities.list)) {
      for (let i = 0; i < window.Entities.list.length; i++) drawEntity(ctx, window.Entities.list[i], getPlayerTeam(), ox, oz);
    }
    drawSpecials(ctx, ox, oz);

    const cpx = MAP_HALF, cpy = MAP_HALF;
    const ang = Math.atan2(cam.matrix.elements[8], cam.matrix.elements[10]);
    ctx.fillStyle = playerAlive() ? '#9fe8a0' : '#ff4444';
    ctx.beginPath();
    ctx.moveTo(cpx + Math.sin(ang) * 7, cpy + Math.cos(ang) * 7);
    ctx.lineTo(cpx + Math.sin(ang + 2.4) * 4.5, cpy + Math.cos(ang + 2.4) * 4.5);
    ctx.lineTo(cpx + Math.sin(ang - 2.4) * 4.5, cpy + Math.cos(ang - 2.4) * 4.5);
    ctx.closePath();
    ctx.fill();

    if (window.Squads && window.Squads.getRally) {
      const rp = window.Squads.getRally();
      if (rp) {
        const dx = rp.x - ox, dz = rp.z - oz;
        if (Math.abs(dx) <= MAP_RANGE && Math.abs(dz) <= MAP_RANGE) {
          const px = _px(dx), pz = _pz(dz);
          ctx.strokeStyle = '#9fe8a0';
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.6 + Math.sin(time * 4) * 0.2;
          ctx.beginPath();
          ctx.arc(px, pz, 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }
    renderObjectives();
    renderBuffs();
    renderScore();
  }

  let prevTime = performance.now() / 1000;
  function loop() {
    const now = performance.now() / 1000;
    const dt = Math.min(now - prevTime, 0.1);
    prevTime = now;
    update(dt);
    requestAnimationFrame(loop);
  }
  loop();
})();