// ranks.js — FORESTWAR progression: military ranks earned via score, promotion banners, tier-based stat buffs
const Ranks = (() => {
  const RANK_LIST = [
    { name: 'RECRUIT',     minScore: 0,    icon: '▸',     color: '#aaaaaa' },
    { name: 'PRIVATE',     minScore: 50,   icon: '⌂',     color: '#b0c8a0' },
    { name: 'CORPORAL',    minScore: 130,  icon: '◆',     color: '#c9d8ff' },
    { name: 'SERGEANT',    minScore: 260,  icon: '◈',     color: '#9fe8a0' },
    { name: 'LIEUTENANT',  minScore: 450,  icon: '✦',     color: '#ffcc66' },
    { name: 'CAPTAIN',     minScore: 720,  icon: '✪',     color: '#ffaa44' },
    { name: 'MAJOR',       minScore: 1050, icon: '✰',     color: '#ff8844' },
    { name: 'COLONEL',     minScore: 1450, icon: '★',     color: '#ff6644' },
    { name: 'GENERAL',     minScore: 1950, icon: '⚝',     color: '#ff4488' },
    { name: 'LEGEND',      minScore: 2600, icon: '☆',     color: '#ffee44' },
  ];

  const BUFF_PER_TIER = {
    damage: 0.04,
    fireRate: 0.03,
    speed: 0.015,
    maxHp: 6,
    stamina: 4,
  };

  const state = {
    score: 0,
    displayScore: 0,
    tier: 0,
    rankName: RANK_LIST[0].name,
    rankIcon: RANK_LIST[0].icon,
    rankColor: RANK_LIST[0].color,
    buffScore: 0,
    promotionT: 0,
    promotionRank: null,
    pulsePhase: 0,
    enabled: false,
  };

  const hud = document.getElementById('hud');
  if (!hud) return { init() {}, update() {}, addScore() {}, reset() {}, getBuffs() {}, state };

  const badge = document.createElement('div');
  badge.style.cssText = 'position:absolute;top:46px;left:16px;pointer-events:none;z-index:6;'
    + 'display:flex;align-items:center;gap:8px;opacity:0;transition:opacity 0.4s;';
  hud.appendChild(badge);

  const iconEl = document.createElement('div');
  iconEl.style.cssText = 'font-size:22px;text-shadow:0 0 8px currentColor,0 2px 4px #000;line-height:1;';
  badge.appendChild(iconEl);

  const infoWrap = document.createElement('div');
  infoWrap.style.cssText = 'display:flex;flex-direction:column;';
  badge.appendChild(infoWrap);

  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'font-size:12px;letter-spacing:2px;font-weight:bold;text-shadow:0 1px 3px #000;line-height:1.2;';
  infoWrap.appendChild(nameEl);

  const scoreEl = document.createElement('div');
  scoreEl.style.cssText = 'font-size:10px;letter-spacing:1px;color:#b0c8a0;text-shadow:0 1px 3px #000;line-height:1.3;';
  infoWrap.appendChild(scoreEl);

  const progressWrap = document.createElement('div');
  progressWrap.style.cssText = 'width:100px;height:3px;background:rgba(0,0,0,0.55);border-radius:2px;overflow:hidden;margin-top:2px;';
  infoWrap.appendChild(progressWrap);

  const progressFill = document.createElement('div');
  progressFill.style.cssText = 'width:0%;height:100%;background:#9fe8a0;border-radius:2px;transition:width 0.3s,background 0.4s;';
  progressWrap.appendChild(progressFill);

  const promoBanner = document.createElement('div');
  promoBanner.style.cssText = 'position:absolute;top:35%;left:50%;transform:translate(-50%,-50%) scale(0.7);'
    + 'pointer-events:none;z-index:9;text-align:center;'
    + 'opacity:0;transition:opacity 0.4s,transform 0.4s;';
  hud.appendChild(promoBanner);

  const promoLabel = document.createElement('div');
  promoLabel.style.cssText = 'font-size:14px;letter-spacing:6px;color:#ffcc44;text-shadow:0 0 14px rgba(255,170,0,0.8),0 2px 5px #000;margin-bottom:4px;';
  promoLabel.textContent = 'PROMOTED';
  promoBanner.appendChild(promoLabel);

  const promoName = document.createElement('div');
  promoName.style.cssText = 'font-size:38px;letter-spacing:5px;font-weight:bold;color:#ffeeaa;text-shadow:0 0 22px rgba(255,200,80,0.9),0 3px 8px #000;';
  promoBanner.appendChild(promoName);

  const promoIcon = document.createElement('div');
  promoIcon.style.cssText = 'font-size:48px;margin-top:6px;text-shadow:0 0 18px currentColor,0 2px 6px #000;';
  promoBanner.appendChild(promoIcon);

  function getTier(score) {
    let idx = 0;
    for (let i = 0; i < RANK_LIST.length; i++) {
      if (score >= RANK_LIST[i].minScore) idx = i;
      else break;
    }
    return idx;
  }

  function getProgress(score, tier) {
    if (tier >= RANK_LIST.length - 1) return 1.0;
    const cur = RANK_LIST[tier].minScore;
    const next = RANK_LIST[tier + 1].minScore;
    return Math.max(0, Math.min(1, (score - cur) / (next - cur)));
  }

  function getBuffs() {
    return {
      damage: 1 + state.tier * BUFF_PER_TIER.damage,
      fireRate: 1 + state.tier * BUFF_PER_TIER.fireRate,
      speed: 1 + state.tier * BUFF_PER_TIER.speed,
      maxHp: state.tier * BUFF_PER_TIER.maxHp,
      stamina: state.tier * BUFF_PER_TIER.stamina,
    };
  }

  function applyBuffToPlayer() {
    const mgr = window.Manager;
    if (!mgr || !mgr.state) return;
    const cls = window.Classes;
    const buffs = getBuffs();
    const baseMaxHp = cls && cls.getBaseMaxHp ? cls.getBaseMaxHp() : 100;
    const baseStam = 100;
    mgr.state.playerMaxHp = Math.round(baseMaxHp + buffs.maxHp);
    if (mgr.state.playerHp > mgr.state.playerMaxHp) mgr.state.playerHp = mgr.state.playerMaxHp;
    const p = window.Player;
    if (p && p.state) {
      const STAM_MAX = baseStam + buffs.stamina;
      p.state.staminaMax = STAM_MAX;
      if (p.state.stamina > STAM_MAX) p.state.stamina = STAM_MAX;
    }
  }

  function showPromotion(rank) {
    promoName.textContent = rank.name;
    promoName.style.color = rank.color;
    promoIcon.textContent = rank.icon;
    promoIcon.style.color = rank.color;
    promoLabel.style.color = rank.color;
    state.promotionT = 3.2;
    if (window.Sound) {
      window.Sound.tone(523, 0.15, 'square', 0.2, 1600);
      window.Sound.tone(659, 0.15, 'square', 0.2, 1600);
      window.Sound.tone(784, 0.3, 'square', 0.2, 1600);
    }
  }

  function triggerPromotion(tier) {
    const rank = RANK_LIST[tier];
    state.rankName = rank.name;
    state.rankIcon = rank.icon;
    state.rankColor = rank.color;
    state.tier = tier;
    showPromotion(rank);
    applyBuffToPlayer();
    if (window.FX && window.FX.message) {
      window.FX.message('RANK UP — ' + rank.name + ' (TEAM BUFF +' + (tier * 4) + '%)', rank.color);
    }
  }

  function checkPromotion() {
    const newTier = getTier(state.score);
    if (newTier > state.tier) {
      for (let t = state.tier + 1; t <= newTier; t++) {
        triggerPromotion(t);
      }
    }
  }

  function addScore(amount) {
    if (amount <= 0) return;
    state.score += amount;
    state.buffScore += amount;
    checkPromotion();
    updateBadge();
  }

  function updateBadge() {
    const rank = RANK_LIST[state.tier];
    iconEl.textContent = rank.icon;
    iconEl.style.color = rank.color;
    nameEl.textContent = rank.name;
    nameEl.style.color = rank.color;
    const prog = getProgress(state.score, state.tier);
    progressFill.style.width = (prog * 100) + '%';
    progressFill.style.background = rank.color;
    const nextScore = state.tier < RANK_LIST.length - 1 ? RANK_LIST[state.tier + 1].minScore : null;
    if (nextScore !== null) {
      scoreEl.textContent = Math.floor(state.displayScore) + ' / ' + nextScore;
    } else {
      scoreEl.textContent = Math.floor(state.displayScore) + ' — MAX RANK';
    }
  }

  function reset() {
    state.score = 0;
    state.displayScore = 0;
    state.tier = 0;
    state.rankName = RANK_LIST[0].name;
    state.rankIcon = RANK_LIST[0].icon;
    state.rankColor = RANK_LIST[0].color;
    state.promotionT = 0;
    state.buffScore = 0;
    promoBanner.style.opacity = '0';
    promoBanner.style.transform = 'translate(-50%,-50%) scale(0.7)';
    updateBadge();
    // Re-baseline the player's max HP so a prior match's rank buffs don't carry over.
    applyBuffToPlayer();
  }

  function init() {
    state.enabled = true;
    reset();
    applyBuffToPlayer();
    // Every player-sourced kill (rifle, rockets, grenades, bayonet, owl strike,
    // gunship, bleed DoT) is announced on the central kill bus — feed it into rank XP.
    if (window.KillRewards && window.KillRewards.register) {
      window.KillRewards.register(function () { addScore(10); });
    }
  }

  function update(dt) {
    if (!state.enabled) return;
    const diff = state.score - state.displayScore;
    if (Math.abs(diff) > 0.5) {
      state.displayScore += diff * Math.min(1, dt * 6);
    } else {
      state.displayScore = state.score;
    }
    if (state.promotionT > 0) {
      state.promotionT -= dt;
      if (state.promotionT > 2.6) {
        const t = (3.2 - state.promotionT) / 0.6;
        promoBanner.style.opacity = String(Math.min(1, t));
        promoBanner.style.transform = 'translate(-50%,-50%) scale(' + (0.7 + t * 0.3) + ')';
      } else if (state.promotionT > 0.5) {
        promoBanner.style.opacity = '1';
        promoBanner.style.transform = 'translate(-50%,-50%) scale(1)';
      } else {
        promoBanner.style.opacity = String(Math.max(0, state.promotionT / 0.5));
        promoBanner.style.transform = 'translate(-50%,-50%) scale(' + (1 + (0.5 - state.promotionT) * 0.2) + ')';
      }
      if (state.promotionT <= 0) {
        promoBanner.style.opacity = '0';
        promoBanner.style.transform = 'translate(-50%,-50%) scale(0.7)';
      }
    }
    state.pulsePhase += dt * 2.5;
    const mgr = window.Manager;
    const playing = mgr && mgr.state && mgr.state.phase === 'playing';
    if (playing && badge.style.opacity !== '1') {
      badge.style.opacity = '1';
    } else if (!playing && badge.style.opacity !== '0') {
      badge.style.opacity = '0';
    }
    if (playing) {
      const rank = RANK_LIST[state.tier];
      const pulse = 1 + Math.sin(state.pulsePhase) * 0.1;
      iconEl.style.transform = 'scale(' + pulse.toFixed(3) + ')';
      const prog = getProgress(state.score, state.tier);
      progressFill.style.width = (prog * 100) + '%';
      if (prog > 0.8) {
        progressFill.style.boxShadow = '0 0 6px ' + rank.color;
      } else {
        progressFill.style.boxShadow = 'none';
      }
      scoreEl.textContent = state.tier < RANK_LIST.length - 1
        ? Math.floor(state.displayScore) + ' / ' + RANK_LIST[state.tier + 1].minScore
        : Math.floor(state.displayScore) + ' — MAX RANK';
    }
  }

  return { state, init, update, addScore, reset, getBuffs, getTier, RANK_LIST };
})();
window.Ranks = Ranks;