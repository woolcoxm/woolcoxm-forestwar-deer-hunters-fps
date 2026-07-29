// combat-text.js — FORESTWAR floating damage numbers + headshot crit feedback.
// Projects world-space hit points to screen each frame so numbers float up from
// wherever the player lands a shot. Crits (headshots) render bigger & gold; the
// killing blow renders red. Self-contained: builds its own HUD pool, no init needed.
const CombatText = (() => {
  const THREE = window.THREE;
  const POOL_SIZE = 30;
  const LIFE = 0.95;
  const FLOAT_SPEED = 1.7;
  const DAMP = 0.92;

  const hud = document.getElementById('hud');
  const pool = [];

  function makeEl() {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-50%,-50%);'
      + 'font-family:"Trebuchet MS",sans-serif;font-weight:bold;letter-spacing:1px;'
      + 'pointer-events:none;opacity:0;will-change:transform,opacity;z-index:7;'
      + 'text-shadow:0 2px 4px #000,0 0 3px #000;';
    el.style.display = 'none';
    if (hud) hud.appendChild(el);
    return el;
  }

  for (let i = 0; i < POOL_SIZE; i++) {
    pool.push({
      el: makeEl(),
      pos: new THREE.Vector3(),
      vy: 0,
      life: 0,
      maxLife: LIFE,
      size: 18,
      color: '#ffffff',
    });
  }

  function easeOutBack(x) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }

  // opts: { crit, kill, color, size }
  function spawn(pos, value, opts) {
    const cam = window.CAMERA;
    if (!cam || !pos) return;
    // Bail if this hit is way behind the camera or off-world (avoids stray numbers).
    let slot = null;
    for (const p of pool) { if (p.life <= 0) { slot = p; break; } }
    if (!slot) {
      // Overwrite the one closest to expiring.
      let oldest = pool[0];
      for (const p of pool) if (p.life < oldest.life) oldest = p;
      slot = oldest;
    }
    const o = opts || {};
    slot.pos.copy(pos);
    slot.pos.x += (Math.random() - 0.5) * 0.5;
    slot.pos.y += 0.6 + Math.random() * 0.3;
    slot.pos.z += (Math.random() - 0.5) * 0.5;
    slot.vy = FLOAT_SPEED + Math.random() * 0.6;
    slot.life = LIFE;
    slot.maxLife = LIFE;

    let color = o.color || '#ffffff';
    let size = o.size || 18;
    let text = (value === undefined || value === null) ? '' : String(value);
    if (o.kill) { color = '#ff4b3b'; size = 24; text = text + ' ✕'; }
    else if (o.crit) { color = '#ffd24a'; size = 26; text = text + '!'; }
    slot.color = color;
    slot.size = size;

    const el = slot.el;
    el.textContent = text;
    el.style.color = color;
    el.style.fontSize = size + 'px';
    if (o.crit || o.kill) {
      el.style.textShadow = '0 0 8px ' + color + ',0 2px 4px #000';
    } else {
      el.style.textShadow = '0 2px 4px #000,0 0 3px #000';
    }
    el.style.display = 'block';
  }

  const _v = new THREE.Vector3();

  function update(dt) {
    const cam = window.CAMERA;
    if (!cam) return;
    const w = window.innerWidth, h = window.innerHeight;
    for (const p of pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.el.style.display = 'none'; continue; }
      // Float upward, settle.
      p.pos.y += p.vy * dt;
      p.vy *= DAMP;
      _v.copy(p.pos).project(cam);
      // Behind camera or beyond clip → hide (but keep its life so it can respawn).
      if (_v.z > 1 || _v.z < -1) { p.el.style.display = 'none'; continue; }
      const px = (_v.x * 0.5 + 0.5) * w;
      const py = (-_v.y * 0.5 + 0.5) * h;
      const age = p.maxLife - p.life;
      // Pop-in over the first ~110ms, then settle to 1.
      let scale = 1;
      if (age < 0.11) {
        const t = Math.max(0, age / 0.11);
        scale = 0.55 + 0.5 * easeOutBack(t);
      }
      // Fade out over the last 45% of life.
      const fadeStart = p.maxLife * 0.55;
      let opacity = 1;
      if (p.life < fadeStart) opacity = Math.max(0, p.life / fadeStart);
      p.el.style.display = 'block';
      p.el.style.left = px + 'px';
      p.el.style.top = py + 'px';
      p.el.style.opacity = opacity.toFixed(3);
      p.el.style.transform = 'translate(-50%,-50%) scale(' + scale.toFixed(3) + ')';
    }
  }

  function reset() {
    for (const p of pool) { p.life = 0; p.el.style.display = 'none'; }
  }

  return { spawn, update, reset };
})();
window.CombatText = CombatText;
