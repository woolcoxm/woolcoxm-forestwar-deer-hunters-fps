// streak-store.js — FORESTWAR personal killstreak store: bank streak currency, spend on temporary stat overclocks
const StreakStore = (() => {
  const HUD = document.getElementById('hud');
  if (!HUD) return { init() {}, update() {}, onKill() {}, reset() {}, state: {} };

  const BANK_PER_KILL = 10;
  const BANK_DECAY_DELAY = 8;
  const BANK_DECAY_RATE = 6;
  const BANK_MAX = 200;

  const BUFFS = {
    damage: {
      id: 'damage', key: '1', name: 'OVERCLOCK', label: '+50% DMG',
      cost: 40, duration: 12, cooldown: 25, color: '#ff6644',
      apply(s) { s.dmgMult = 1.50; },
    },
    firerate: {
      id: 'firerate', key: '2', name: 'RAPIDFIRE', label: '+40% ROF',
      cost: 35, duration: 10, cooldown: 22, color: '#ffcc44',
      apply(s) { s.fireRateMult = 1.40; },
    },
    regen: {
      id: 'regen', key: '3', name: 'REGENBURST', label: 'FAST HEAL',
      cost: 30, duration: 8, cooldown: 20, color: '#66ff88',
      apply(s) { s.regenBonus = 18; },
    },
    speed: {
      id: 'speed', key: '4', name: 'ADRENALINE', label: '+35% SPD',
      cost: 25, duration: 9, cooldown: 18, color: '#66ddff',
      apply(s) { s.speedMult = 1.35; },
    },
  };
  const BUFF_LIST = [BUFFS.damage, BUFFS.firerate, BUFFS.regen, BUFFS.speed];

  const state = {
    bank: 0,
    killTimer: 0,
    buffs: {
      damage: { active: false, timer: 0, cd: 0 },
      firerate: { active: false, timer: 0, cd: 0 },
      regen: { active: false, timer: 0, cd: 0 },
      speed: { active: false, timer: 0, cd: 0 },
    },
    enabled: false,
  };

  const effects = {
    dmgMult: 1,
    fireRateMult: 1,
    regenBonus: 0,
    speedMult: 1,
  };

  function init() {
    state.enabled = true;
    panel.style.opacity = '1';
  }

  function reset() {
    state.bank = 0;
    state.killTimer = 0;
    for (const k in state.buffs) {
      state.buffs[k].active = false;
      state.buffs[k].timer = 0;
      state.buffs[k].cd = 0;
    }
  }

  function onKill() {
    state.bank = Math.min(BANK_MAX, state.bank + BANK_PER_KILL);
    state.killTimer = 0;
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(660 + state.bank, 0.06, 'square', 0.12, 2200);
    }
    if (bankEl) {
      bankEl.style.transform = 'scale(1.35)';
      bankEl.style.color = '#ffee44';
    }
  }

  function purchase(buffDef) {
    const st = state.buffs[buffDef.id];
    if (st.active || st.cd > 0) {
      flashMessage('UNAVAILABLE', '#ff4422');
      return;
    }
    if (state.bank < buffDef.cost) {
      flashMessage('NEED ' + (buffDef.cost - state.bank) + ' MORE', '#ff4422');
      return;
    }
    state.bank -= buffDef.cost;
    st.active = true;
    st.timer = buffDef.duration;
    st.cd = buffDef.cooldown;
    if (window.Sound) {
      window.Sound.tone(880, 0.1, 'square', 0.22, 2000);
      window.Sound.tone(1320, 0.12, 'sine', 0.16, 3000);
    }
    flashMessage(buffDef.name + ' ACTIVE', buffDef.color);
    const idx = BUFF_LIST.indexOf(buffDef);
    if (cardEls[idx]) {
      cardEls[idx].style.transform = 'translateX(-50%) scale(1.15)';
      cardEls[idx].style.boxShadow = '0 0 22px ' + buffDef.color + ',0 2px 8px rgba(0,0,0,0.7)';
    }
    if (window.FX && window.FX.shake) window.FX.shake(0.06);
  }

  function getDmgMult() { return effects.dmgMult; }
  function getFireRateMult() { return effects.fireRateMult; }
  function getSpeedMult() { return effects.speedMult; }
  function getRegenBonus() { return effects.regenBonus; }

  function update(dt) {
    const playing = window.Manager && window.Manager.state && window.Manager.state.phase === 'playing';
    if (!playing) { panel.style.opacity = '0.3'; return; }
    else if (state.enabled) panel.style.opacity = '1';

    state.killTimer += dt;
    if (state.killTimer > BANK_DECAY_DELAY && state.bank > 0) {
      state.bank = Math.max(0, state.bank - BANK_DECAY_RATE * dt);
    }

    effects.dmgMult = 1;
    effects.fireRateMult = 1;
    effects.regenBonus = 0;
    effects.speedMult = 1;

    for (const def of BUFF_LIST) {
      const st = state.buffs[def.id];
      if (st.active) {
        st.timer -= dt;
        if (st.timer <= 0) {
          st.active = false;
          st.timer = 0;
        } else {
          def.apply(effects);
        }
      }
      if (st.cd > 0) st.cd = Math.max(0, st.cd - dt);
    }

    applyRegen(dt);
    applySpeed();
    applyFireRate();
    render();
  }

  function applyRegen(dt) {
    if (effects.regenBonus <= 0) return;
    const ms = window.Manager && window.Manager.state;
    if (!ms || !ms.playerAlive) return;
    ms.playerHp = Math.min(ms.playerMaxHp, ms.playerHp + effects.regenBonus * dt);
  }

  function applySpeed() {
    if (!window.Player || !window.Player.state) return;
    Player.state.speedMult = effects.speedMult;
  }

  function applyFireRate() {
    if (window.Weapons && window.Weapons.state && window.Weapons.state.active) {
      window.Weapons.state.active.fireRateMult = effects.fireRateMult;
    }
  }

  // ---- DOM ----
  const panel = document.createElement('div');
  panel.style.cssText = 'position:absolute;left:50%;bottom:118px;transform:translateX(-50%);'
    + 'display:flex;flex-direction:column;align-items:center;gap:5px;'
    + 'pointer-events:none;z-index:7;opacity:0;transition:opacity 0.4s;';
  HUD.appendChild(panel);

  const bankRow = document.createElement('div');
  bankRow.style.cssText = 'display:flex;align-items:baseline;gap:8px;';
  panel.appendChild(bankRow);

  const bankIcon = document.createElement('div');
  bankIcon.style.cssText = 'font-size:15px;color:#ffcc44;text-shadow:0 0 8px rgba(255,180,50,0.6),0 1px 3px #000;';
  bankIcon.textContent = '⚡';
  bankRow.appendChild(bankIcon);

  const bankEl = document.createElement('div');
  bankEl.style.cssText = 'font-size:22px;font-weight:bold;letter-spacing:2px;color:#ffee44;'
    + 'text-shadow:0 0 10px rgba(255,180,50,0.6),0 2px 4px #000;'
    + 'transition:transform 0.12s,color 0.3s;line-height:1;';
  bankEl.textContent = '0';
  bankRow.appendChild(bankEl);

  const cardsRow = document.createElement('div');
  cardsRow.style.cssText = 'display:flex;gap:6px;';
  panel.appendChild(cardsRow);

  const cardEls = [];
  for (let i = 0; i < BUFF_LIST.length; i++) {
    const def = BUFF_LIST[i];
    const card = document.createElement('div');
    card.style.cssText = 'position:relative;width:66px;padding:5px 4px 4px;'
      + 'background:rgba(8,14,10,0.82);border:1px solid rgba(120,160,120,0.3);'
      + 'border-radius:4px;text-align:center;'
      + 'transition:transform 0.12s,border-color 0.15s,box-shadow 0.2s,opacity 0.15s;'
      + 'backdrop-filter:blur(2px);overflow:hidden;';
    cardsRow.appendChild(card);
    cardEls.push(card);

    const keyEl = document.createElement('div');
    keyEl.style.cssText = 'position:absolute;top:1px;right:3px;font-size:8px;color:#666;';
    keyEl.textContent = '[' + def.key + ']';
    card.appendChild(keyEl);

    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'font-size:9px;letter-spacing:1px;color:' + def.color + ';text-shadow:0 1px 2px #000;line-height:1.1;margin-bottom:2px;';
    nameEl.textContent = def.name;
    card.appendChild(nameEl);

    const costEl = document.createElement('div');
    costEl.style.cssText = 'font-size:10px;font-weight:bold;color:#ccbb88;line-height:1;';
    costEl.textContent = def.cost + '⚡';
    card.appendChild(costEl);

    const timerEl = document.createElement('div');
    timerEl.style.cssText = 'position:absolute;bottom:0;left:0;width:100%;height:2px;background:' + def.color + ';transform-origin:left;transform:scaleX(0);transition:transform 0.06s linear;';
    card.appendChild(timerEl);

    const cdEl = document.createElement('div');
    cdEl.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;color:#ff6644;text-shadow:0 1px 3px #000;opacity:0;';
    card.appendChild(cdEl);

    def._nameEl = nameEl;
    def._costEl = costEl;
    def._timerEl = timerEl;
    def._cdEl = cdEl;
    def._card = card;
  }

  const msgEl = document.createElement('div');
  msgEl.style.cssText = 'position:absolute;top:-24px;left:50%;transform:translateX(-50%);'
    + 'font-size:12px;font-weight:bold;letter-spacing:3px;white-space:nowrap;'
    + 'opacity:0;transition:opacity 0.2s;text-shadow:0 0 8px currentColor,0 2px 4px #000;';
  panel.appendChild(msgEl);
  let msgTimer = 0;

  function flashMessage(text, color) {
    msgEl.textContent = text;
    msgEl.style.color = color || '#ffffff';
    msgEl.style.opacity = '1';
    msgTimer = 1.5;
  }

  function render() {
    if (bankEl) {
      bankEl.textContent = Math.floor(state.bank);
      bankEl.style.transform = '';
      const nearMax = state.bank >= BANK_MAX * 0.85;
      bankEl.style.color = nearMax ? '#ff4422' : '#ffee44';
    }

    if (msgTimer > 0) {
      msgTimer -= 1 / 60;
      if (msgTimer <= 0) msgEl.style.opacity = '0';
    }

    for (let i = 0; i < BUFF_LIST.length; i++) {
      const def = BUFF_LIST[i];
      const st = state.buffs[def.id];
      const card = cardEls[i];
      if (!card) continue;

      if (st.active) {
        card.style.borderColor = def.color;
        card.style.opacity = '1';
        def._nameEl.style.opacity = '1';
        def._costEl.style.opacity = '0.3';
        const frac = def.duration > 0 ? st.timer / def.duration : 0;
        def._timerEl.style.transform = 'scaleX(' + Math.max(0, frac) + ')';
        def._cdEl.style.opacity = '0';
      } else if (st.cd > 0) {
        card.style.borderColor = 'rgba(100,60,60,0.4)';
        card.style.opacity = '0.55';
        def._timerEl.style.transform = 'scaleX(0)';
        def._cdEl.style.opacity = '1';
        def._cdEl.textContent = Math.ceil(st.cd);
      } else {
        const affordable = state.bank >= def.cost;
        card.style.borderColor = affordable ? def.color : 'rgba(100,100,100,0.25)';
        card.style.opacity = affordable ? '1' : '0.5';
        def._costEl.style.opacity = affordable ? '1' : '0.4';
        def._timerEl.style.transform = 'scaleX(0)';
        def._cdEl.style.opacity = '0';
      }
    }
  }

  window.addEventListener('keydown', (e) => {
    const playing = window.Manager && window.Manager.state && window.Manager.state.phase === 'playing';
    if (!playing) return;
    for (const def of BUFF_LIST) {
      if (e.key === def.key) { purchase(def); return; }
    }
  });

  if (window.KillRewards && window.KillRewards.register) {
    window.KillRewards.register(() => onKill());
  }

  let prevPhase = 'idle';
  setInterval(() => {
    const ms = window.Manager && window.Manager.state;
    if (!ms) return;
    if (ms.phase === 'playing' && prevPhase !== 'playing') {
      init();
      reset();
    }
    prevPhase = ms.phase || 'idle';
  }, 200);

  return { init, update, onKill, reset, getDmgMult, getFireRateMult, getSpeedMult, getRegenBonus, state, BUFFS };
})();
window.StreakStore = StreakStore;