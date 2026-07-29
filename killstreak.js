// killstreak.js — FORESTWAR combo multiplier: chained kills within a time window grant score bonuses and suppression resistance
const Killstreak = (() => {
  const WINDOW = 5.0;
  const MAX_MULT = 5;
  const SUPPRESSION_RESIST_BASE = 0.0;
  const SUPPRESSION_RESIST_MAX = 0.6;

  const state = {
    kills: 0,
    mult: 1,
    timer: 0,
    totalScore: 0,
    active: false,
    bestStreak: 0,
    pulse: 0,
    cooldownFlash: 0,
  };

  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;top:22%;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;z-index:6;opacity:0;transition:opacity 0.3s;';
  document.getElementById('hud').appendChild(container);

  const multEl = document.createElement('div');
  multEl.style.cssText = 'font-size:38px;font-weight:bold;letter-spacing:4px;color:#ffcc44;text-shadow:0 0 12px rgba(255,150,0,0.7),0 2px 6px #000;line-height:1;';
  container.appendChild(multEl);

  const labelEl = document.createElement('div');
  labelEl.style.cssText = 'font-size:12px;letter-spacing:6px;color:#ffaa33;text-shadow:0 1px 4px #000;margin-top:2px;';
  labelEl.textContent = 'KILLSTREAK';
  container.appendChild(labelEl);

  const barWrap = document.createElement('div');
  barWrap.style.cssText = 'margin:6px auto 0;width:160px;height:5px;background:rgba(0,0,0,0.55);border:1px solid rgba(255,170,50,0.35);border-radius:3px;overflow:hidden;';
  const barFill = document.createElement('div');
  barFill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#ff8822,#ffdd55);border-radius:2px;transition:width 0.06s linear;';
  barWrap.appendChild(barFill);
  container.appendChild(barWrap);

  const killEls = [];
  const killsRow = document.createElement('div');
  killsRow.style.cssText = 'display:flex;gap:5px;justify-content:center;margin-top:5px;';
  container.appendChild(killsRow);
  for (let i = 0; i < 8; i++) {
    const dot = document.createElement('div');
    dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:rgba(255,170,50,0.18);border:1px solid rgba(255,170,50,0.3);transition:all 0.15s;';
    killsRow.appendChild(dot);
    killEls.push(dot);
  }

  const breakEl = document.createElement('div');
  breakEl.style.cssText = 'position:absolute;top:28%;left:50%;transform:translateX(-50%);font-size:18px;font-weight:bold;letter-spacing:6px;color:#ff4422;text-shadow:0 0 10px rgba(200,0,0,0.6),0 2px 5px #000;opacity:0;transition:opacity 0.4s;pointer-events:none;z-index:6;';
  breakEl.textContent = 'STREAK BROKEN';
  document.getElementById('hud').appendChild(breakEl);

  const _tierLabel = '';
  const TIERS = ['', 'DOUBLE', 'TRIPLE', 'QUAD', 'PENTA', 'RAMPAGE'];

  function registerKill(baseScore) {
    if (state.timer <= 0 && state.kills > 0) {
      state.kills = 0;
      state.mult = 1;
    }
    state.kills++;
    state.timer = WINDOW;
    state.active = true;
    state.pulse = 1.0;
    state.cooldownFlash = 0.4;
    state.mult = Math.min(MAX_MULT, 1 + Math.floor((state.kills - 1) / 2));
    if (state.kills > state.bestStreak) state.bestStreak = state.kills;
    const earned = Math.round(baseScore * state.mult);
    // Manager.registerKill already awards the flat base score for every kill;
    // the killstreak only adds the rising *bonus* from the multiplier so the
    // team total climbs faster as your streak grows (no double-counting).
    const bonus = Math.max(0, earned - baseScore);
    state.totalScore += bonus;

    container.style.opacity = '1';
    multEl.textContent = 'x' + state.mult;
    labelEl.textContent = TIERS[state.mult] || 'RAMPAGE';

    const tierColor = state.mult >= 4 ? '#ff3322' : state.mult >= 3 ? '#ff6622' : state.mult >= 2 ? '#ffaa33' : '#ffcc44';
    multEl.style.color = tierColor;
    labelEl.style.color = tierColor;

    for (let i = 0; i < killEls.length; i++) {
      if (i < Math.min(state.kills, killEls.length)) {
        killEls[i].style.background = tierColor;
        killEls[i].style.boxShadow = '0 0 6px ' + tierColor;
        killEls[i].style.transform = 'scale(1.15)';
      } else {
        killEls[i].style.background = 'rgba(255,170,50,0.18)';
        killEls[i].style.boxShadow = 'none';
        killEls[i].style.transform = 'scale(1)';
      }
    }

    if (window.Manager && window.Manager.state) {
      const team = Manager.state.playerTeam;
      if (Manager.state.score && Manager.state.score[team] !== undefined) {
        Manager.state.score[team] += bonus;
      }
    }

    if (window.Sound && window.Sound.tone) {
      const baseFreq = 440;
      const freq = baseFreq * Math.pow(1.122, state.mult - 1);
      window.Sound.tone(freq, 0.12, 'square', 0.15, 2000);
      if (state.kills > 1 && state.kills % 2 === 1) {
        window.Sound.tone(freq * 1.5, 0.15, 'sine', 0.1, 3000);
      }
    }

    if (window.FX && state.mult >= 3) {
      window.FX.message(TIERS[state.mult] + ' KILL!', tierColor);
    }

    return earned;
  }

  function getSuppressionResistance() {
    if (!state.active || state.mult < 2) return SUPPRESSION_RESIST_BASE;
    const t = (state.mult - 1) / (MAX_MULT - 1);
    return SUPPRESSION_RESIST_BASE + t * (SUPPRESSION_RESIST_MAX - SUPPRESSION_RESIST_BASE);
  }

  function getMultiplier() {
    return state.active ? state.mult : 1;
  }

  function reset() {
    state.kills = 0;
    state.mult = 1;
    state.timer = 0;
    state.active = false;
    state.pulse = 0;
    state.cooldownFlash = 0;
    container.style.opacity = '0';
  }

  function breakStreak() {
    if (state.active && state.kills >= 4) {
      breakEl.style.opacity = '1';
      setTimeout(() => { breakEl.style.opacity = '0'; }, 1200);
      if (window.Sound && window.Sound.tone) {
        window.Sound.tone(180, 0.3, 'sawtooth', 0.15, 600);
      }
    }
    reset();
  }

  function update(dt) {
    if (!state.active) {
      container.style.opacity = '0';
      return;
    }
    state.timer -= dt;
    if (state.timer <= 0) {
      breakStreak();
      return;
    }
    const pct = Math.max(0, state.timer / WINDOW);
    barFill.style.width = (pct * 100) + '%';
    barFill.style.background = pct > 0.5
      ? 'linear-gradient(90deg,#ff8822,#ffdd55)'
      : pct > 0.25
        ? 'linear-gradient(90deg,#ff4422,#ff8844)'
        : 'linear-gradient(90deg,#cc2222,#ff4422)';

    if (state.pulse > 0) {
      state.pulse -= dt * 3.5;
      if (state.pulse < 0) state.pulse = 0;
      const s = 1 + state.pulse * 0.25;
      multEl.style.transform = 'scale(' + s + ')';
    }

    if (state.cooldownFlash > 0) {
      state.cooldownFlash -= dt;
      const flash = Math.max(0, state.cooldownFlash / 0.4);
      container.style.filter = 'brightness(' + (1 + flash * 0.6) + ')';
    } else {
      container.style.filter = '';
    }

    if (state.timer < 1.5) {
      const blink = 0.5 + 0.5 * Math.sin(state.timer * 16);
      container.style.opacity = (0.4 + blink * 0.5).toFixed(2);
    } else {
      container.style.opacity = '1';
    }
  }

  function init() {
    if (window.Player && window.Player.registerDeathHook) {
      Player.registerDeathHook(breakStreak);
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'k' || e.key === 'K') {
      if (window.Manager && window.Manager.state && Manager.state.phase === 'playing') {
        if (window.FX) window.FX.message('Best streak: ' + state.bestStreak + ' | Score: ' + state.totalScore, '#ffcc44');
      }
    }
  });

  return { registerKill, getSuppressionResistance, getMultiplier, update, reset, init, breakStreak, state };
})();
window.Killstreak = Killstreak;