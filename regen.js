// regen.js — FORESTWAR out-of-combat health regeneration + low-HP heartbeat tension.
// Watches the player's HP each frame: any decrease is treated as "combat", starting a
// grace window. Once that window elapses without further damage, health ramps back up.
// Fully decoupled — no edits to manager.js required; it just reads/writes Manager.state.
// Also finally puts the otherwise-unused Sound.heartbeat() to work as a low-HP cue.
const Regen = (() => {
  const COMBAT_DELAY = 6.0;   // seconds of safety before healing kicks in
  const MIN_RATE = 8;         // HP/sec at the start of recovery
  const MAX_RATE = 20;        // HP/sec once fully ramped
  const RAMP_TIME = 3.0;      // seconds to ramp min -> max
  const LOW_HP_FRAC = 0.40;   // below this fraction, heartbeat tension plays

  let combatTimer = 0;
  let regenRamp = 0;
  let lastHp = null;
  let synced = false;
  let heartTimer = 0;
  let prevPhase = 'idle';

  // ---- HUD: a ring around the crosshair that fills during the grace window
  //       (gold) and pulses green while actively healing. -------------------
  const hud = document.getElementById('hud');
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;top:50%;left:50%;width:82px;height:82px;'
    + 'transform:translate(-50%,-50%);pointer-events:none;opacity:0;'
    + 'transition:opacity 0.25s;z-index:4;';
  const CIRC = 2 * Math.PI * 33;
  wrap.innerHTML =
    '<svg width="82" height="82" viewBox="0 0 82 82">'
    + '<circle cx="41" cy="41" r="33" fill="none" stroke="rgba(140,210,140,0.12)" stroke-width="2.5"/>'
    + '<circle id="regenArc" cx="41" cy="41" r="33" fill="none" stroke="#ffcc55" stroke-width="3"'
    + ' stroke-linecap="round" stroke-dasharray="' + CIRC.toFixed(1) + '" stroke-dashoffset="' + CIRC.toFixed(1) + '"'
    + ' transform="rotate(-90 41 41)"/>'
    + '</svg>';
  if (hud) hud.appendChild(wrap);
  const arc = wrap.querySelector('#regenArc');

  const label = document.createElement('div');
  label.style.cssText = 'position:absolute;bottom:-17px;left:50%;transform:translateX(-50%);'
    + 'font-size:10px;letter-spacing:3px;font-weight:bold;color:#5fe07a;'
    + 'text-shadow:0 1px 3px #000;opacity:0;transition:opacity 0.2s;white-space:nowrap;';
  label.textContent = 'REGEN';
  wrap.appendChild(label);

  function reset() {
    combatTimer = 0;
    regenRamp = 0;
    lastHp = null;
    synced = false;
    heartTimer = 0;
    wrap.style.opacity = '0';
    label.style.opacity = '0';
  }

  function update(dt) {
    const mgr = window.Manager;
    if (!mgr || !mgr.state) return;
    const st = mgr.state;

    // Only active during a live match; reset cleanly on (re)deploy.
    if (st.phase !== 'playing') { prevPhase = st.phase; reset(); return; }
    if (prevPhase !== 'playing') reset();
    prevPhase = st.phase;

    const max = st.playerMaxHp || 100;
    const hp = st.playerHp;

    // Sync the HP baseline on the first frame of play so the initial full-health
    // set doesn't read as a "heal" and so we don't false-trigger combat.
    if (!synced) { lastHp = hp; synced = true; }

    // Any HP drop = took damage: restart the grace window and stall recovery.
    if (hp < lastHp - 0.01) {
      combatTimer = COMBAT_DELAY;
      regenRamp = 0;
    }
    lastHp = hp;

    // Low-HP heartbeat tension: faster as health drops toward zero.
    if (st.playerAlive && hp > 0 && hp < max * LOW_HP_FRAC) {
      heartTimer -= dt;
      if (heartTimer <= 0) {
        const sev = 1 - hp / (max * LOW_HP_FRAC); // 0 at threshold, 1 near death
        heartTimer = 1.25 - sev * 0.55;           // ~1.25s down to ~0.7s
        if (window.Sound && window.Sound.heartbeat) window.Sound.heartbeat();
      }
    } else {
      heartTimer = 0;
    }

    // While downed/respawning there is nothing to regenerate.
    if (!st.playerAlive) {
      combatTimer = 0;
      regenRamp = 0;
      wrap.style.opacity = '0';
      label.style.opacity = '0';
      return;
    }

    if (combatTimer > 0) {
      combatTimer = Math.max(0, combatTimer - dt);
      regenRamp = 0;
    }

    // Apply recovery once out of combat and still wounded.
    let active = false;
    if (combatTimer <= 0 && hp < max) {
      regenRamp = Math.min(1, regenRamp + dt / RAMP_TIME);
      const rate = MIN_RATE + (MAX_RATE - MIN_RATE) * regenRamp;
      const _adren = (window.Adrenaline && Adrenaline.isActive()) ? Adrenaline.getRegenBonus() : 0;
      st.playerHp = Math.min(max, hp + (rate + _adren) * dt);
      lastHp = st.playerHp;
      active = true;
    } else if (hp >= max) {
      regenRamp = Math.max(0, regenRamp - dt);
    }

    // Drive the ring HUD.
    if (combatTimer > 0 && hp < max) {
      // Grace countdown: gold arc fills as safety approaches.
      const p = 1 - combatTimer / COMBAT_DELAY;
      arc.setAttribute('stroke-dashoffset', (CIRC * (1 - p)).toFixed(1));
      arc.setAttribute('stroke', '#ffcc55');
      wrap.style.opacity = '0.85';
      label.style.opacity = '0';
    } else if (active) {
      // Actively healing: full green ring that breathes.
      arc.setAttribute('stroke-dashoffset', '0');
      arc.setAttribute('stroke', '#5fe07a');
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.012);
      wrap.style.opacity = (0.55 + pulse * 0.45).toFixed(2);
      label.style.opacity = '1';
    } else {
      wrap.style.opacity = '0';
      label.style.opacity = '0';
    }
  }

  return { update, reset };
})();
window.Regen = Regen;
