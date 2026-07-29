// kill-panel.js — FORESTWAR kill confirmation feed: slide-in cards for each kill, session arsenal breakdown
const KillPanel = (() => {
  const PANEL_RIGHT = 14;
  const PANEL_TOP = 120;
  const CARD_W = 280;
  const CARD_H = 56;
  const CARD_GAP = 6;
  const CARD_LIFE = 4.0;
  const SLIDE_IN = 0.28;
  const SLIDE_OUT = 0.35;
  const MAX_CARDS = 5;

  const ARSENAL_LABELS = {
    rifle: 'RIFLE',
    rocket: 'ROCKET',
    grenade: 'GRENADE',
    sniper: 'SNIPER',
    dmr: 'MARKSMAN',
    melee: 'BAYONET',
    explosion: 'EXPLOSION',
    fire: 'INCINERATED',
    ability: 'ABILITY',
    vehicle: 'RAM',
    turret: 'TURRET',
    drone: 'DRONE',
    other: 'ELIMINATED',
  };

  const ARSENAL_COLORS = {
    rifle: '#c9d8ff',
    rocket: '#ff8844',
    grenade: '#88cc66',
    sniper: '#ffdd44',
    dmr: '#ddaaff',
    melee: '#eeeeee',
    explosion: '#ff6622',
    fire: '#ff4400',
    ability: '#66ddff',
    vehicle: '#ffaa44',
    turret: '#9fe8a0',
    drone: '#ff9966',
    other: '#cccccc',
  };

  const state = {
    cards: [],
    cardIdx: 0,
    totals: {},
    sessionKills: 0,
    sessionScore: 0,
    bestStreak: 0,
    enabled: false,
  };

  const hud = document.getElementById('hud');
  if (!hud) return { init() {}, reportKill() {}, update() {}, reset() {}, state };

  const stack = document.createElement('div');
  stack.style.cssText = 'position:absolute;top:' + PANEL_TOP + 'px;right:' + PANEL_RIGHT + 'px;'
    + 'width:' + CARD_W + 'px;pointer-events:none;z-index:8;';
  hud.appendChild(stack);

  const cardPool = [];
  for (let i = 0; i < MAX_CARDS; i++) {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;top:0;right:0;width:' + CARD_W + 'px;height:' + CARD_H + 'px;'
      + 'background:rgba(10,18,12,0.88);border:1px solid rgba(150,200,150,0.3);border-left:3px solid #9fe8a0;'
      + 'border-radius:5px;display:flex;align-items:center;gap:8px;padding:0 10px;'
      + 'box-shadow:0 3px 14px rgba(0,0,0,0.5);'
      + 'opacity:0;transform:translateX(60px);'
      + 'transition:opacity ' + SLIDE_IN + 's ease-out,transform ' + SLIDE_IN + 's ease-out,'
      + 'top 0.22s ease-out;'
      + 'backdrop-filter:blur(3px);';
    stack.appendChild(el);

    const iconCol = document.createElement('div');
    iconCol.style.cssText = 'font-size:20px;width:28px;text-align:center;line-height:1;';
    el.appendChild(iconCol);

    const textCol = document.createElement('div');
    textCol.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:2px;min-width:0;';
    el.appendChild(textCol);

    const topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;gap:6px;';
    textCol.appendChild(topRow);

    const victimEl = document.createElement('div');
    victimEl.style.cssText = 'font-size:13px;font-weight:bold;color:#e8f3e8;text-shadow:0 1px 3px #000;'
      + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    topRow.appendChild(victimEl);

    const pointsEl = document.createElement('div');
    pointsEl.style.cssText = 'font-size:14px;font-weight:bold;color:#ffcc44;text-shadow:0 1px 3px #000;';
    topRow.appendChild(pointsEl);

    const bottomRow = document.createElement('div');
    bottomRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:6px;';
    textCol.appendChild(bottomRow);

    const methodEl = document.createElement('div');
    methodEl.style.cssText = 'font-size:10px;letter-spacing:2px;color:#9fe8a0;text-shadow:0 1px 2px #000;';
    bottomRow.appendChild(methodEl);

    const streakEl = document.createElement('div');
    streakEl.style.cssText = 'font-size:10px;letter-spacing:1px;color:#ff8844;text-shadow:0 1px 2px #000;font-weight:bold;';
    bottomRow.appendChild(streakEl);

    cardPool.push({ el, iconCol, victimEl, pointsEl, methodEl, streakEl, life: 0, active: false });
  }

  const statsEl = document.createElement('div');
  statsEl.style.cssText = 'margin-top:4px;width:' + CARD_W + 'px;font-size:10px;letter-spacing:1px;'
    + 'color:#8fbf8f;text-shadow:0 1px 3px #000;line-height:1.6;';
  stack.appendChild(statsEl);

  function init() {
    state.enabled = true;
    if (window.CombatText && window.CombatText.onKill) {
      return;
    }
    _hookManagerKill();
  }

  function _hookManagerKill() {
    const mgr = window.Manager;
    if (!mgr || !mgr.state) return;
  }

  function teamColor(team) {
    return team === 'deer' ? '#f0c98a' : team === 'hunter' ? '#c9d8ff' : '#cccccc';
  }
  function teamLabel(team) {
    return team === 'deer' ? 'DEER' : team === 'hunter' ? 'HUNTERS' : 'FOE';
  }
  const isEntity = (o) => o && typeof o === 'object' && o.mesh && typeof o.team === 'string';
  function entName(e) {
    if (!e) return 'UNKNOWN';
    if (e.callsign) return e.callsign;
    if (e.name) return String(e.name);
    return e.team === 'deer' ? 'STAG' : (e.team === 'hunter' ? 'HUNTER' : 'UNKNOWN');
  }

  // Tolerant of every calling convention used across the codebase so the feed
  // lights up no matter who reports the kill:
  //   reportKill(victimNameStr, opts)                              // primary (entities.js / manager.js)
  //   reportKill({killer, victim, weapon|method, team, crit|headshot}) // melee / caster object form
  //   reportKill(targetEntity, creditObj|methodStr, methodStr?)      // bleed DoT form
  //   reportKill(methodStr, victimEntity)                           // charge-ability form
  function reportKill(a, b, c) {
    let killerName = null, killerTeam = null, playerKiller = false;
    let victimName = 'UNKNOWN', victimTeam = null, playerVictim = false;
    let method = 'other', headshot = false;

    if (a && typeof a === 'object' && !isEntity(a)) {
      // Single-object convention (melee.js bayonet / caster-deer ability).
      const o = a;
      victimName = o.victim ? String(o.victim) : 'UNKNOWN';
      victimTeam = o.team || null;
      method = o.weapon || o.method || 'other';
      headshot = !!(o.crit || o.headshot);
      if (o.killer) { killerName = String(o.killer); if (o.killer === 'YOU') playerKiller = true; }
    } else if (isEntity(a)) {
      // bleed form: reportKill(targetEntity, creditObj|methodStr, methodStr?)
      victimName = entName(a);
      victimTeam = a.team;
      method = (typeof c === 'string') ? c : (typeof b === 'string') ? b : 'other';
      const credit = (b && typeof b === 'object') ? b : null;
      if (credit && credit.isPlayer) { playerKiller = true; killerName = 'YOU'; }
    } else if (typeof a === 'string' && isEntity(b)) {
      // charge-ability form: reportKill(methodStr, victimEntity)
      method = a;
      victimName = entName(b);
      victimTeam = b.team;
    } else if (typeof a === 'string') {
      // primary convention: reportKill(victimNameStr, opts)
      victimName = a;
      const o = b || {};
      method = o.method || 'other';
      headshot = !!o.headshot;
      victimTeam = o.victimTeam || victimTeam;
      killerTeam = o.killerTeam || null;
      playerVictim = !!o.playerVictim;
      if (victimName === 'YOU') playerVictim = true;
      if (o.byPlayer || o.playerKiller) { playerKiller = true; if (!killerName) killerName = 'YOU'; }
      else if (o.killerName) killerName = String(o.killerName);
    }

    // Fill in the killer side for NPC-vs-NPC and player takedowns.
    if (!killerName) {
      const kt = killerTeam || (victimTeam === 'deer' ? 'hunter' : (victimTeam === 'hunter' ? 'deer' : null));
      killerTeam = kt;
      killerName = playerVictim ? null : (kt ? teamLabel(kt) : 'UNKNOWN');
    }

    // Session tallies only reflect what the player personally earned.
    const points = playerKiller ? 10 : 0;
    let streak = 0;
    if (playerKiller && window.Killstreak && window.Killstreak.state) {
      streak = window.Killstreak.state.kills || 0;
    }
    if (playerKiller) state.sessionKills++;
    state.sessionScore += points;
    if (streak > state.bestStreak) state.bestStreak = streak;
    if (playerKiller) {
      const mkey = (method in ARSENAL_LABELS) ? method : 'other';
      state.totals[mkey] = (state.totals[mkey] || 0) + 1;
    }

    const methodLabel = ARSENAL_LABELS[method] || 'ELIMINATED';
    const color = ARSENAL_COLORS[method] || '#cccccc';
    const icon = _iconForMethod(method);

    const card = cardPool[state.cardIdx];
    state.cardIdx = (state.cardIdx + 1) % MAX_CARDS;

    // "KILLER ▸ VICTIM" line, team-coloured; the player's callsign is gilded,
    // and a downed player flashes red so you feel every death.
    const kColor = playerKiller ? '#ffd24a' : teamColor(killerTeam);
    const vColor = playerVictim ? '#ff5544' : teamColor(victimTeam);
    const kTag = playerKiller ? 'YOU' : (killerName || teamLabel(killerTeam) || 'UNKNOWN');
    card.victimEl.innerHTML =
      '<span style="color:' + kColor + ';">' + kTag + '</span>' +
      '<span style="color:#7a8a7a;margin:0 5px;">\u25b8</span>' +
      '<span style="color:' + vColor + ';">' + victimName + '</span>' +
      (headshot ? ' <span style="color:#ffdd44;">\u2737</span>' : '');

    card.iconCol.textContent = icon;
    card.iconCol.style.color = color;
    card.iconCol.style.textShadow = '0 0 8px ' + color + ',0 1px 3px #000';
    card.pointsEl.textContent = playerKiller ? '+' + points : '';
    card.pointsEl.style.color = playerVictim ? '#ff5544' : '#ffcc44';
    card.methodEl.textContent = methodLabel + (headshot ? ' \u00b7 HEADSHOT' : '');
    card.methodEl.style.color = color;
    card.el.style.borderLeftColor = playerVictim ? '#ff5544' : color;
    card.streakEl.textContent = (playerKiller && streak > 1) ? streak + 'x STREAK' : '';

    card.life = CARD_LIFE;
    card.active = true;
    card.el.style.opacity = '1';
    card.el.style.transform = 'translateX(0)';

    _repositionCards();
    _updateStats();
  }

  function _iconForMethod(method) {
    const map = {
      rifle: '⊙',
      rocket: '◈',
      grenade: '◉',
      sniper: '◎',
      dmr: '⊙',
      melee: '⚔',
      explosion: '✸',
      fire: '♨',
      ability: '⚡',
      vehicle: '▣',
      turret: '⌖',
      drone: '◊',
      other: '✕',
    };
    return map[method] || '✕';
  }

  function _repositionCards() {
    let visIdx = 0;
    for (let i = state.cardIdx - 1; i >= state.cardIdx - MAX_CARDS; i--) {
      const realIdx = ((i % MAX_CARDS) + MAX_CARDS) % MAX_CARDS;
      const c = cardPool[realIdx];
      if (c.active && c.life > 0.5) {
        c.el.style.top = (visIdx * (CARD_H + CARD_GAP)) + 'px';
        visIdx++;
        if (visIdx >= MAX_CARDS) break;
      }
    }
  }

  function _updateStats() {
    const parts = [];
    parts.push('<b style="color:#9fe8a0">' + state.sessionKills + '</b> KILLS');
    parts.push('<b style="color:#ffcc44">' + state.sessionScore + '</b> PTS');
    if (state.bestStreak > 1) parts.push('<b style="color:#ff8844">' + state.bestStreak + 'x</b> BEST');
    statsEl.innerHTML = parts.join(' &nbsp;|&nbsp; ');
  }

  function update(dt) {
    let anyChanged = false;
    for (let i = 0; i < MAX_CARDS; i++) {
      const c = cardPool[i];
      if (!c.active) continue;
      c.life -= dt;
      if (c.life <= 0) {
        c.active = false;
        c.el.style.opacity = '0';
        c.el.style.transform = 'translateX(80px)';
        anyChanged = true;
      } else if (c.life < SLIDE_OUT) {
        c.el.style.opacity = (c.life / SLIDE_OUT).toFixed(2);
      }
    }
    if (anyChanged) _repositionCards();
  }

  function reset() {
    for (const c of cardPool) {
      c.active = false;
      c.life = 0;
      c.el.style.opacity = '0';
      c.el.style.transform = 'translateX(60px)';
    }
    state.sessionKills = 0;
    state.sessionScore = 0;
    state.bestStreak = 0;
    state.totals = {};
    state.cardIdx = 0;
    statsEl.innerHTML = '';
  }

  function getTotals() { return state.totals; }

  return { init, reportKill, update, reset, getTotals, state };
})();
window.KillPanel = KillPanel;