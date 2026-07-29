// scoreboard.js — FORESTWAR tactical overview: hold TAB for a live match + personal stats panel.
// Self-contained: builds its own HUD, listens for TAB, tracks per-match personal
// stats by hooking the existing KillRewards kill bus and watching Manager state
// transitions (player death, match restart). Renders team scores + your line.
const Scoreboard = (() => {
  const hud = document.getElementById('hud');
  if (!hud) return { init() {}, update() {}, reset() {}, state: {} };

  // ---- per-match personal session (reset on every new game) ----------------
  const session = {
    kills: 0,
    killsDeer: 0,
    killsHunter: 0,
    deaths: 0,
  };
  let prevPhase = 'idle';
  let prevAlive = true;
  let visible = false;
  let lastFlash = 0;          // time since the panel content last "pulsed"

  // ---- root overlay --------------------------------------------------------
  const root = document.createElement('div');
  root.style.cssText =
    'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
    'background:radial-gradient(circle at center, rgba(6,12,8,0.45), rgba(0,0,0,0.84));' +
    'opacity:0;visibility:hidden;transition:opacity 0.18s, visibility 0.18s;' +
    'pointer-events:none;z-index:15;';
  hud.appendChild(root);

  const panel = document.createElement('div');
  panel.style.cssText =
    'width:740px;max-width:93vw;background:rgba(10,18,12,0.86);' +
    'border:1px solid rgba(120,180,120,0.32);border-radius:12px;' +
    'box-shadow:0 14px 56px rgba(0,0,0,0.7),0 0 50px rgba(80,140,80,0.12);' +
    'padding:20px 26px 22px;backdrop-filter:blur(4px);' +
    'font-family:inherit;color:#e8f3e8;letter-spacing:1px;' +
    'transform:translateY(14px) scale(0.985);transition:transform 0.2s ease-out;';
  root.appendChild(panel);

  // ---- header --------------------------------------------------------------
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:flex-end;justify-content:space-between;' +
    'border-bottom:1px solid rgba(120,180,120,0.2);padding-bottom:10px;margin-bottom:14px;';
  panel.appendChild(header);

  const headLeft = document.createElement('div');
  headLeft.style.cssText = 'line-height:1.1;';
  header.appendChild(headLeft);
  const headTitle = document.createElement('div');
  headTitle.style.cssText = 'font-size:24px;font-weight:bold;letter-spacing:7px;' +
    'background:linear-gradient(90deg,#f0c98a,#c9d8ff);-webkit-background-clip:text;' +
    'background-clip:text;color:transparent;';
  headTitle.textContent = 'FORESTWAR';
  headLeft.appendChild(headTitle);
  const headSub = document.createElement('div');
  headSub.style.cssText = 'font-size:11px;letter-spacing:5px;color:#8fbf8f;margin-top:3px;';
  headSub.textContent = 'TACTICAL OVERVIEW';
  headLeft.appendChild(headSub);

  const headRight = document.createElement('div');
  headRight.style.cssText = 'text-align:right;line-height:1.5;';
  header.appendChild(headRight);
  const waveBadge = document.createElement('div');
  waveBadge.style.cssText = 'font-size:14px;font-weight:bold;letter-spacing:3px;color:#9fe8a0;text-shadow:0 1px 3px #000;';
  headRight.appendChild(waveBadge);
  const clock = document.createElement('div');
  clock.style.cssText = 'font-size:12px;letter-spacing:2px;color:#cfe0cf;text-shadow:0 1px 3px #000;';
  headRight.appendChild(clock);

  // ---- team clash row ------------------------------------------------------
  const clash = document.createElement('div');
  clash.style.cssText = 'display:flex;align-items:stretch;gap:12px;margin-bottom:16px;';
  panel.appendChild(clash);

  function teamCard(theme) {
    const card = document.createElement('div');
    card.style.cssText = 'flex:1;background:rgba(0,0,0,0.35);border-radius:9px;padding:12px 14px;' +
      'border:1px solid ' + theme.border + ';position:relative;overflow:hidden;';
    const label = document.createElement('div');
    label.style.cssText = 'font-size:12px;letter-spacing:4px;color:' + theme.color + ';font-weight:bold;text-shadow:0 1px 3px #000;';
    card.appendChild(label);
    const score = document.createElement('div');
    score.style.cssText = 'font-size:40px;font-weight:bold;line-height:1.05;color:' + theme.color + ';' +
      'text-shadow:0 2px 10px ' + theme.glow + ',0 2px 4px #000;';
    card.appendChild(score);
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:11px;letter-spacing:2px;color:#bcd0bc;margin-top:2px;';
    card.appendChild(meta);
    const barWrap = document.createElement('div');
    barWrap.style.cssText = 'margin-top:8px;height:5px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;';
    const bar = document.createElement('div');
    bar.style.cssText = 'width:0%;height:100%;background:' + theme.bar + ';border-radius:3px;transition:width 0.25s;';
    barWrap.appendChild(bar);
    card.appendChild(barWrap);
    return { card, label, score, meta, bar };
  }

  const deerCard = teamCard({ color: '#f0c98a', border: 'rgba(201,160,96,0.4)', glow: 'rgba(200,150,70,0.45)', bar: 'linear-gradient(90deg,#c98a44,#f0c98a)' });
  deerCard.label.textContent = 'THE HERD';
  clash.appendChild(deerCard.card);

  const vsWrap = document.createElement('div');
  vsWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:64px;';
  const vsEl = document.createElement('div');
  vsEl.style.cssText = 'font-size:18px;font-weight:bold;letter-spacing:3px;color:#6f8f6f;text-shadow:0 1px 3px #000;';
  vsEl.textContent = 'VS';
  vsWrap.appendChild(vsEl);
  const leadEl = document.createElement('div');
  leadEl.style.cssText = 'font-size:10px;letter-spacing:2px;color:#9fe8a0;margin-top:6px;text-align:center;line-height:1.5;text-shadow:0 1px 3px #000;';
  vsWrap.appendChild(leadEl);
  clash.appendChild(vsWrap);

  const hunterCard = teamCard({ color: '#c9d8ff', border: 'rgba(111,134,201,0.4)', glow: 'rgba(100,130,200,0.45)', bar: 'linear-gradient(90deg,#6f86c9,#c9d8ff)' });
  hunterCard.label.textContent = 'THE HUNTERS';
  clash.appendChild(hunterCard.card);

  // ---- player stat grid ----------------------------------------------------
  const plTitle = document.createElement('div');
  plTitle.style.cssText = 'font-size:11px;letter-spacing:4px;color:#8fbf8f;margin-bottom:8px;';
  plTitle.textContent = 'YOUR MATCH';
  panel.appendChild(plTitle);

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(6,1fr);gap:8px;';
  panel.appendChild(grid);

  function statTile() {
    const tile = document.createElement('div');
    tile.style.cssText = 'background:rgba(0,0,0,0.32);border:1px solid rgba(120,180,120,0.18);' +
      'border-radius:8px;padding:9px 8px;text-align:center;';
    const val = document.createElement('div');
    val.style.cssText = 'font-size:22px;font-weight:bold;line-height:1;color:#e8f3e8;text-shadow:0 1px 4px #000;';
    tile.appendChild(val);
    const lab = document.createElement('div');
    lab.style.cssText = 'font-size:9px;letter-spacing:2px;color:#8fb08f;margin-top:5px;';
    tile.appendChild(lab);
    const sub = document.createElement('div');
    sub.style.cssText = 'font-size:9px;color:#6f8f6f;margin-top:2px;min-height:11px;';
    tile.appendChild(sub);
    grid.appendChild(tile);
    return { tile, val, lab, sub };
  }

  const tKills = statTile();   tKills.lab.textContent = 'KILLS';
  const tDeaths = statTile();  tDeaths.lab.textContent = 'DEATHS';
  const tKD = statTile();      tKD.lab.textContent = 'K/D';
  const tStreak = statTile();  tStreak.lab.textContent = 'STREAK';
  const tBest = statTile();    tBest.lab.textContent = 'BEST';
  const tBonus = statTile();   tBonus.lab.textContent = 'BONUS';

  // ---- footer --------------------------------------------------------------
  const foot = document.createElement('div');
  foot.style.cssText = 'display:flex;justify-content:space-between;align-items:center;' +
    'margin-top:14px;padding-top:10px;border-top:1px solid rgba(120,180,120,0.18);' +
    'font-size:10px;letter-spacing:2px;color:#6f8f6f;';
  panel.appendChild(foot);
  const footLeft = document.createElement('div');
  foot.appendChild(footLeft);
  const footRight = document.createElement('div');
  footRight.textContent = 'RELEASE [TAB] TO RESUME';
  foot.appendChild(footRight);

  // ---- helpers -------------------------------------------------------------
  function fmtClock(s) {
    s = Math.max(0, Math.floor(s || 0));
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return 'T+' + m + ':' + (ss < 10 ? '0' : '') + ss;
  }

  function setTile(tile, value, color, sub) {
    tile.val.textContent = value;
    tile.val.style.color = color || '#e8f3e8';
    if (sub !== undefined) tile.sub.textContent = sub;
  }

  function refresh() {
    const mgr = window.Manager;
    const st = (mgr && mgr.state) ? mgr.state : null;
    if (!st) return;
    const playerTeam = st.playerTeam || 'hunter';

    // header
    const isBoss = st.bossActive;
    waveBadge.textContent = isBoss ? '⚠ BOSS FIGHT' : ('WAVE ' + Math.max(1, st.wavesCleared));
    waveBadge.style.color = isBoss ? '#ff4422' : '#9fe8a0';
    clock.textContent = fmtClock(st.time);

    // team clash
    const dScore = st.score.deer || 0;
    const hScore = st.score.hunter || 0;
    const dAlive = (mgr.aliveCount ? mgr.aliveCount('deer') : 0);
    const hAlive = (mgr.aliveCount ? mgr.aliveCount('hunter') : 0);
    const total = Math.max(1, dScore + hScore);
    deerCard.score.textContent = dScore;
    deerCard.meta.textContent = dAlive + ' ALIVE' + (playerTeam === 'deer' ? ' · YOU' : '');
    deerCard.bar.style.width = (dScore / total * 100).toFixed(1) + '%';
    deerCard.card.style.borderColor = playerTeam === 'deer' ? 'rgba(240,201,138,0.85)' : 'rgba(201,160,96,0.4)';
    hunterCard.score.textContent = hScore;
    hunterCard.meta.textContent = hAlive + ' ALIVE' + (playerTeam === 'hunter' ? ' · YOU' : '');
    hunterCard.bar.style.width = (hScore / total * 100).toFixed(1) + '%';
    hunterCard.card.style.borderColor = playerTeam === 'hunter' ? 'rgba(201,216,255,0.85)' : 'rgba(111,134,201,0.4)';

    // lead indicator
    const diff = dScore - hScore;
    if (Math.abs(diff) < 5) {
      leadEl.textContent = 'EVEN';
      leadEl.style.color = '#9fe8a0';
    } else if (diff > 0) {
      leadEl.innerHTML = 'HERD<br>+' + diff;
      leadEl.style.color = '#f0c98a';
    } else {
      leadEl.innerHTML = 'HUNTERS<br>+' + (-diff);
      leadEl.style.color = '#c9d8ff';
    }

    // player line
    const ks = (window.Killstreak && window.Killstreak.state) ? window.Killstreak.state : null;
    const bestStreak = ks ? ks.bestStreak : 0;
    const curStreak = ks ? ks.kills : 0;
    const mult = ks ? ks.mult : 1;
    const bonus = ks ? Math.round(ks.totalScore || 0) : 0;
    if (bestStreak > session.bestStreakRef) session.bestStreakRef = bestStreak;

    setTile(tKills, session.kills, '#9fe8a0', 'D:' + session.killsDeer + '  H:' + session.killsHunter);
    setTile(tDeaths, session.deaths, session.deaths === 0 ? '#9fe8a0' : '#e8a0a0', session.deaths === 0 ? 'FLAWLESS' : '');
    const kd = session.deaths > 0 ? (session.kills / session.deaths) : session.kills;
    setTile(tKD, session.deaths > 0 ? kd.toFixed(2) : (session.kills > 0 ? '∞' : '0.0'),
      kd >= 2 ? '#9fe8a0' : (kd >= 1 ? '#ffcc44' : '#e8a0a0'),
      session.deaths === 0 && session.kills > 0 ? 'PERFECT' : '');
    setTile(tStreak, curStreak, mult >= 2 ? '#ffcc44' : '#e8f3e8', mult > 1 ? ('x' + mult + ' MULT') : 'NO STREAK');
    setTile(tBest, Math.max(bestStreak, session.bestStreakRef || 0), '#ff8844', bestStreak >= 8 ? 'RAMPAGE' : '');
    setTile(tBonus, '+' + bonus, '#ffcc44', 'STREAK PTS');

    // footer
    const ranks = window.Ranks && window.Ranks.state ? window.Ranks.state : null;
    footLeft.innerHTML = ranks
      ? '<span style="color:' + ranks.rankColor + '">' + ranks.rankIcon + ' ' + ranks.rankName + '</span>' +
        ' &nbsp; ' + Math.floor(ranks.displayScore || 0) + ' XP'
      : 'PERSONAL STATS';
  }

  // ---- visibility ----------------------------------------------------------
  function show(v) {
    if (v === visible) return;
    visible = v;
    if (v) {
      lastFlash = 0;
      refresh();
      root.style.visibility = 'visible';
      root.style.opacity = '1';
      panel.style.transform = 'translateY(0) scale(1)';
    } else {
      root.style.opacity = '0';
      panel.style.transform = 'translateY(14px) scale(0.985)';
      setTimeout(() => { if (!visible) root.style.visibility = 'hidden'; }, 200);
    }
  }

  // ---- input ---------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const mgr = window.Manager;
      if (mgr && mgr.state && mgr.state.phase === 'playing') show(true);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); show(false); }
  });
  // Lose pointer lock (pause) or leave play -> hide.
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement) show(false);
  });
  window.addEventListener('blur', () => show(false));

  // ---- session tracking ----------------------------------------------------
  function resetSession() {
    session.kills = 0;
    session.killsDeer = 0;
    session.killsHunter = 0;
    session.deaths = 0;
    session.bestStreakRef = 0;
  }
  session.bestStreakRef = 0;

  // Every player kill is announced on this bus (see entities.js / kill-rewards.js).
  if (window.KillRewards && window.KillRewards.register) {
    window.KillRewards.register((victimTeam) => {
      session.kills++;
      if (victimTeam === 'deer') session.killsDeer++;
      else if (victimTeam === 'hunter') session.killsHunter++;
    });
  }

  // ---- lifecycle -----------------------------------------------------------
  function init() {
    resetSession();
    prevPhase = 'idle';
    prevAlive = true;
  }

  function reset() { resetSession(); show(false); }

  function update(dt) {
    const mgr = window.Manager;
    const st = (mgr && mgr.state) ? mgr.state : null;
    if (!st) return;

    // detect a fresh match start (idle/gameover -> playing)
    if (prevPhase !== 'playing' && st.phase === 'playing') resetSession();
    prevPhase = st.phase;

    // detect a player death (alive -> down)
    if (prevAlive && !st.playerAlive) session.deaths++;
    prevAlive = st.playerAlive;

    // auto-hide when not actively playing
    if (st.phase !== 'playing') show(false);

    // while held, keep the numbers live (cheap; only re-runs DOM text)
    if (visible) {
      lastFlash += dt;
      refresh();
    }
  }

  return { init, update, reset, state: session };
})();
window.Scoreboard = Scoreboard;
