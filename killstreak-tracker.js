// killstreak-tracker.js — FORESTWAR central killstreak tracker: one kill counter feeding all streak rewards
const KillstreakTracker = (() => {
  const STREAKS = [
    { id: 'owl', name: 'OWL STRIKE', kills: 7, key: 'Q', color: '#ff8833' },
    { id: 'gunship', name: 'GUNSHIP', kills: 10, key: 'J', color: '#ffaa44' },
    { id: 'ac130', name: 'AC-130', kills: 15, key: 'U', color: '#ff6622' },
    { id: 'orbital', name: 'ORBITAL LASER', kills: 20, key: 'X', color: '#ff2222' },
  ];
  const RESET_TIME = 12.0;

  const state = {
    kills: 0,
    timer: 0,
    ready: { owl: false, gunship: false, ac130: false, orbital: false },
    used: { owl: false, gunship: false, ac130: false, orbital: false },
    pulse: 0,
    killFlash: 0,
  };

  const hud = document.getElementById('hud');
  if (!hud) return { onKill() {}, onUse() {}, isReady() {return false;}, update() {}, reset() {}, state };

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;top:80px;left:50%;transform:translateX(-50%);'
    + 'pointer-events:none;z-index:6;opacity:0;transition:opacity 0.4s;';
  hud.appendChild(wrap);

  const killCountEl = document.createElement('div');
  killCountEl.style.cssText = 'font-size:22px;font-weight:bold;letter-spacing:3px;'
    + 'color:#ffdd55;text-shadow:0 0 10px rgba(255,170,40,0.7),0 2px 5px #000;'
    + 'text-align:center;line-height:1;transition:transform 0.1s;';
  killCountEl.textContent = '0 KILLS';
  wrap.appendChild(killCountEl);

  const streakRow = document.createElement('div');
  streakRow.style.cssText = 'display:flex;gap:10px;justify-content:center;margin-top:8px;';
  wrap.appendChild(streakRow);

  const slotEls = [];
  for (const s of STREAKS) {
    const slot = document.createElement('div');
    slot.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;opacity:0.4;transition:all 0.25s;';
    streakRow.appendChild(slot);

    const icon = document.createElement('div');
    icon.style.cssText = 'font-size:11px;letter-spacing:2px;font-weight:bold;color:' + s.color + ';text-shadow:0 1px 3px #000;';
    icon.textContent = s.kills + 'K';
    slot.appendChild(icon);

    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'font-size:8px;letter-spacing:1px;color:#999;text-shadow:0 1px 2px #000;white-space:nowrap;';
    nameEl.textContent = s.name;
    slot.appendChild(nameEl);

    const keyEl = document.createElement('div');
    keyEl.style.cssText = 'font-size:8px;letter-spacing:1px;color:#666;opacity:0.7;';
    keyEl.textContent = '[' + s.key + ']';
    slot.appendChild(keyEl);

    slotEls.push({ slot, icon, nameEl, keyEl, def: s });
  }

  const barWrap = document.createElement('div');
  barWrap.style.cssText = 'margin:8px auto 0;width:260px;height:4px;background:rgba(0,0,0,0.55);'
    + 'border:1px solid rgba(255,170,50,0.25);border-radius:3px;overflow:hidden;';
  wrap.appendChild(barWrap);
  const barFill = document.createElement('div');
  barFill.style.cssText = 'width:0%;height:100%;background:linear-gradient(90deg,#ff8822,#ffdd55);border-radius:2px;transition:width 0.08s linear;';
  barWrap.appendChild(barFill);

  const timerEl = document.createElement('div');
  timerEl.style.cssText = 'margin-top:3px;text-align:center;font-size:8px;letter-spacing:2px;color:#aa8833;opacity:0;transition:opacity 0.2s;';
  wrap.appendChild(timerEl);

  let registered = false;

  function registerBus() {
    if (registered) return;
    if (window.KillRewards && typeof window.KillRewards.register === 'function') {
      window.KillRewards.register(onKill);
      registered = true;
    }
  }

  function onKill() {
    state.kills++;
    state.timer = 0;
    state.killFlash = 1.0;
    for (const s of STREAKS) {
      if (state.kills >= s.kills && !state.used[s.id]) {
        state.ready[s.id] = true;
      }
    }
    updateSlots();
    killCountEl.style.transform = 'scale(1.35)';
    killCountEl.style.color = '#ffee66';
  }

  function onUse(id) {
    if (!state.ready[id]) return false;
    state.ready[id] = false;
    state.used[id] = true;
    updateSlots();
    return true;
  }

  function isReady(id) {
    return !!state.ready[id];
  }

  function getKills() {
    return state.kills;
  }

  function updateSlots() {
    const maxKills = STREAKS[STREAKS.length - 1].kills;
    for (let i = 0; i < slotEls.length; i++) {
      const se = slotEls[i];
      const s = se.def;
      const unlocked = state.kills >= s.kills;
      const rdy = state.ready[s.id];
      if (rdy) {
        se.slot.style.opacity = '1';
        se.icon.style.textShadow = '0 0 14px ' + s.color + ',0 0 4px ' + s.color + ',0 1px 3px #000';
        se.nameEl.style.color = s.color;
        se.icon.textContent = '[' + s.key + '] READY';
        se.slot.style.transform = 'scale(1.05)';
      } else if (unlocked) {
        se.slot.style.opacity = '0.6';
        se.nameEl.style.color = '#777';
        se.icon.textContent = s.kills + 'K';
        se.slot.style.transform = 'scale(1)';
      } else {
        const progress = state.kills / s.kills;
        se.slot.style.opacity = String(0.25 + progress * 0.25);
        se.nameEl.style.color = '#555';
        se.icon.textContent = state.kills + '/' + s.kills;
        se.slot.style.transform = 'scale(1)';
      }
    }
    const pct = Math.min(state.kills / maxKills, 1) * 100;
    barFill.style.width = pct.toFixed(0) + '%';
    killCountEl.textContent = state.kills + ' KILL' + (state.kills === 1 ? '' : 'S');
  }

  function reset() {
    state.kills = 0;
    state.timer = 0;
    state.killFlash = 0;
    for (const id in state.ready) {
      state.ready[id] = false;
      state.used[id] = false;
    }
    updateSlots();
    wrap.style.opacity = '0';
  }

  function update(dt) {
    if (!registered) registerBus();

    const ms = window.Manager && window.Manager.state ? window.Manager.state : null;
    if (!ms || ms.phase !== 'playing') {
      wrap.style.opacity = '0';
      return;
    }

    if (state.kills > 0) {
      wrap.style.opacity = '1';
      state.timer += dt;
      state.killFlash = Math.max(0, state.killFlash - dt * 4);

      if (state.timer < RESET_TIME) {
        const rem = RESET_TIME - state.timer;
        const urgent = rem < 4;
        timerEl.style.opacity = urgent ? '1' : '0.5';
        timerEl.textContent = 'STREAK RESET IN ' + rem.toFixed(1) + 'S';
        timerEl.style.color = urgent ? '#ff4422' : '#aa8833';
        const pct = Math.max(0, 1 - state.timer / RESET_TIME) * 100;
        barFill.style.width = pct.toFixed(0) + '%';
      } else {
        state.kills = 0;
        for (const id in state.used) state.used[id] = false;
        for (const id in state.ready) state.ready[id] = false;
        updateSlots();
      }
    } else {
      timerEl.style.opacity = '0';
    }

    if (state.killFlash > 0) {
      killCountEl.style.transform = 'scale(' + (1 + state.killFlash * 0.35) + ')';
      killCountEl.style.color = state.killFlash > 0.5 ? '#ffee66' : '#ffdd55';
    } else {
      killCountEl.style.transform = 'scale(1)';
      killCountEl.style.color = '#ffdd55';
    }
  }

  updateSlots();

  return { onKill, onUse, isReady, getKills, update, reset, state, STREAKS };
})();
window.KillstreakTracker = KillstreakTracker;