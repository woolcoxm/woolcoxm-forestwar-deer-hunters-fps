// compass.js — FORESTWAR screen-edge compass strip: cardinal direction markers, objective pips, and nearby unit indicators
(() => {
  const THREE = window.THREE;
  const CAMERA = window.CAMERA;
  if (!CAMERA || !THREE) return;

  const WRAP_W = 420;
  const WRAP_H = 28;
  const VIS_RANGE = 220;
  const UNIT_RANGE = 60;
  const SCAN_INTERVAL = 0.12;

  const hud = document.getElementById('hud');
  if (!hud) return;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;top:14px;left:50%;transform:translateX(-50%);'
    + 'width:' + WRAP_W + 'px;height:' + WRAP_H + 'px;'
    + 'background:linear-gradient(90deg,transparent,rgba(8,16,10,0.72) 18%,rgba(8,16,10,0.72) 82%,transparent);'
    + 'border-top:1px solid rgba(120,180,120,0.2);border-bottom:1px solid rgba(120,180,120,0.2);'
    + 'overflow:hidden;pointer-events:none;z-index:6;'
    + 'opacity:0;transition:opacity 0.4s;';
  hud.appendChild(wrap);

  const centerLine = document.createElement('div');
  centerLine.style.cssText = 'position:absolute;top:0;left:50%;width:2px;height:100%;'
    + 'background:rgba(220,255,220,0.6);transform:translateX(-50%);';
  wrap.appendChild(centerLine);

  const centerTick = document.createElement('div');
  centerTick.style.cssText = 'position:absolute;top:0;left:50%;width:0;height:0;'
    + 'border-left:5px solid transparent;border-right:5px solid transparent;'
    + 'border-top:6px solid rgba(220,255,220,0.7);transform:translateX(-50%);';
  wrap.appendChild(centerTick);

  const canvas = document.createElement('canvas');
  canvas.width = WRAP_W;
  canvas.height = WRAP_H;
  canvas.style.cssText = 'position:absolute;inset:0;';
  wrap.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const DIRS = [
    { label: 'N', angle: 0 },
    { label: 'NE', angle: 45 },
    { label: 'E', angle: 90 },
    { label: 'SE', angle: 135 },
    { label: 'S', angle: 180 },
    { label: 'SW', angle: 225 },
    { label: 'W', angle: 270 },
    { label: 'NW', angle: 315 },
  ];

  for (let d = 0; d < 360; d += 15) {
    if (d % 45 === 0) continue;
    DIRS.push({ label: '', angle: d, minor: true });
  }

  const _fwd = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _toTarget = new THREE.Vector3();
  const _camPos = new THREE.Vector3();

  let scanT = 0;
  let visible = false;

  function lerp(a, b, t) { return a + (b - a) * t; }

  function getBearing(dx, dz) {
    return (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
  }

  function bearingToRelX(playerYaw, bearing) {
    let diff = ((bearing - playerYaw + 540) % 360) - 180;
    return (diff / 90) * (WRAP_W * 0.5);
  }

  function show() {
    if (!visible) {
      visible = true;
      wrap.style.opacity = '1';
    }
  }

  function getEntities() {
    if (window.Entities && Array.isArray(window.Entities.list)) return window.Entities.list;
    return [];
  }

  function getPlayerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function getObjectives() {
    if (window.Objectives && Array.isArray(window.Objectives.state.points)) return window.Objectives.state.points;
    if (window.Objectives && Array.isArray(window.Objectives.FLAGS)) return window.Objectives.FLAGS;
    return [];
  }

  function getActiveSpecials() {
    const out = [];
    if (window.Boss && window.Boss.boss && window.Boss.boss.active && window.Boss.boss.mesh) {
      out.push({ pos: window.Boss.boss.mesh.position, color: '#ff2200', icon: '★' });
    }
    if (window.SupplyDrop && window.SupplyDrop.state && window.SupplyDrop.state.crate) {
      const c = window.SupplyDrop.state.crate;
      if (c.mesh) out.push({ pos: c.mesh.position, color: '#ffdd44', icon: '◆' });
    }
    return out;
  }

  function update(dt) {
    const ms = window.Manager && window.Manager.state ? window.Manager.state : null;
    if (!ms || ms.phase !== 'playing') {
      if (visible) {
        visible = false;
        wrap.style.opacity = '0';
      }
      return;
    }
    show();

    CAMERA.getWorldDirection(_fwd);
    const playerYaw = (Math.atan2(_fwd.x, _fwd.z) * 180 / Math.PI + 360) % 360;
    _camPos.copy(CAMERA.position);

    ctx.clearRect(0, 0, WRAP_W, WRAP_H);

    for (let i = 0; i < DIRS.length; i++) {
      const d = DIRS[i];
      const rx = bearingToRelX(playerYaw, d.angle);
      if (rx < -20 || rx > WRAP_W + 20) continue;
      const cx = rx + WRAP_W * 0.5;
      if (d.minor) {
        ctx.strokeStyle = 'rgba(140,180,130,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, WRAP_H * 0.55);
        ctx.lineTo(cx, WRAP_H * 0.72);
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(160,200,150,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, WRAP_H * 0.4);
        ctx.lineTo(cx, WRAP_H * 0.8);
        ctx.stroke();
        ctx.fillStyle = d.label.length === 1 ? 'rgba(220,255,220,0.85)' : 'rgba(170,200,160,0.55)';
        ctx.font = (d.label.length === 1 ? 'bold 13px' : 'bold 9px') + ' "Trebuchet MS",sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.label, cx, WRAP_H * 0.28);
      }
    }

    const objs = getObjectives();
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      const ox = o.x !== undefined ? o.x : (o.mesh ? o.mesh.position.x : 0);
      const oz = o.z !== undefined ? o.z : (o.mesh ? o.mesh.position.z : 0);
      _toTarget.set(ox - _camPos.x, 0, oz - _camPos.z);
      const dist = _toTarget.length();
      if (dist > VIS_RANGE + 40) continue;
      const bearing = getBearing(_toTarget.x, _toTarget.z);
      const rx = bearingToRelX(playerYaw, bearing) + WRAP_W * 0.5;
      if (rx < 8 || rx > WRAP_W - 8) continue;
      let color = 'rgba(170,170,170,0.6)';
      if (o.owner === 'deer') color = '#f0c98a';
      else if (o.owner === 'hunter') color = '#c9d8ff';
      ctx.fillStyle = color;
      ctx.font = 'bold 9px "Trebuchet MS",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▲', rx, WRAP_H * 0.5);
    }

    const specials = getActiveSpecials();
    for (let i = 0; i < specials.length; i++) {
      const s = specials[i];
      _toTarget.set(s.pos.x - _camPos.x, 0, s.pos.z - _camPos.z);
      const bearing = getBearing(_toTarget.x, _toTarget.z);
      const rx = bearingToRelX(playerYaw, bearing) + WRAP_W * 0.5;
      let clampedX = Math.max(12, Math.min(WRAP_W - 12, rx));
      const edgeFade = (rx < 8 || rx > WRAP_W - 8) ? 0.5 : 1.0;
      ctx.fillStyle = s.color;
      ctx.globalAlpha = edgeFade;
      ctx.font = 'bold 12px "Trebuchet MS",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.icon, clampedX, WRAP_H * 0.5);
      ctx.globalAlpha = 1;
    }

    scanT -= dt;
    if (scanT <= 0) {
      scanT = SCAN_INTERVAL;
      drawUnits(playerYaw);
    }
  }

  let unitCache = [];

  function scanUnits() {
    const team = getPlayerTeam();
    const ents = getEntities();
    const out = [];
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || !e.mesh) continue;
      const ep = e.mesh.position;
      _toTarget.set(ep.x - _camPos.x, 0, ep.z - _camPos.z);
      const dist = _toTarget.length();
      if (dist > UNIT_RANGE) continue;
      const bearing = getBearing(_toTarget.x, _toTarget.z);
      const hostile = e.team !== team;
      out.push({ bearing, hostile, dist });
    }
    unitCache = out;
  }

  function drawUnits() {
    scanUnits();
    for (let i = 0; i < unitCache.length; i++) {
      const u = unitCache[i];
      const rx = bearingToRelX(playerYaw, u.bearing) + WRAP_W * 0.5;
      if (rx < 6 || rx > WRAP_W - 6) continue;
      const intensity = 1 - u.dist / UNIT_RANGE;
      if (u.hostile) {
        ctx.fillStyle = 'rgba(255,80,60,' + (0.4 + intensity * 0.5).toFixed(2) + ')';
        ctx.fillRect(rx - 2, WRAP_H * 0.62, 4, 5);
      } else {
        ctx.fillStyle = 'rgba(150,230,150,' + (0.3 + intensity * 0.4).toFixed(2) + ')';
        ctx.fillRect(rx - 1.5, WRAP_H * 0.64, 3, 3);
      }
    }
  }

  function reset() {
    visible = false;
    wrap.style.opacity = '0';
    ctx.clearRect(0, 0, WRAP_W, WRAP_H);
    unitCache = [];
  }

  window.Compass = { update, reset };
})();