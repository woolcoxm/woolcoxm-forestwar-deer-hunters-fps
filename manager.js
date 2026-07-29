// manager.js — FORESTWAR game state: waves, scoring, HUD, player life cycle, win/lose, boss trigger
const Manager = (() => {
  const THREE = window.THREE;
  const SCENE = window.SCENE;
  const CAMERA = window.CAMERA;

  const BOSS_WAVE_INTERVAL = 5;

  const state = {
    phase: 'idle',
    time: 0,
    playerTeam: 'hunter',
    playerHp: 100,
    playerMaxHp: 100,
    playerAlive: true,
    respawnTimer: 0,
    kills: { deer: 0, hunter: 0 },
    score: { deer: 0, hunter: 0 },
    wavesCleared: 0,
    nextWaveAt: 0,
    targetDeer: 8,
    targetHunters: 6,
    prevAliveDeer: 0,
    prevAliveHunters: 0,
    buffDeer: 0,
    buffHunter: 0,
    bossPending: false,
    bossActive: false,
    lastKillerName: '',
    lastKillerId: null,
    lastKillerPos: null,
  };

  const overlay = document.getElementById('overlay');
  const statsEl = document.getElementById('stats');
  const teambar = document.getElementById('teambar');

  function aliveCount(team) {
    if (!window.Entities || !Array.isArray(window.Entities.list)) return 0;
    let n = 0;
    for (const e of window.Entities.list) {
      if (!e.dead && e.team === team) n++;
    }
    return n;
  }

  function spawnWave() {
    if (!window.Entities) return;
    const deerToSpawn = Math.max(0, state.targetDeer - aliveCount('deer'));
    const huntersToSpawn = Math.max(0, state.targetHunters - aliveCount('hunter'));
    for (let i = 0; i < deerToSpawn; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 40 + Math.random() * 80;
      window.Entities.spawn('deer', Math.cos(a) * r, Math.sin(a) * r);
    }
    for (let i = 0; i < huntersToSpawn; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 35 + Math.random() * 70;
      window.Entities.spawn('hunter', Math.cos(a) * r, Math.sin(a) * r);
    }
    state.wavesCleared++;
    state.targetDeer += 2;
    state.targetHunters += 1;
    state.nextWaveAt = state.time + 45;
    if (state.wavesCleared > 1) {
      if (window.Entities) {
        window.Entities.buffDeer = 1 + (state.wavesCleared - 1) * 0.12;
        window.Entities.buffHunter = 1 + (state.wavesCleared - 1) * 0.12;
      }
    }
    if (window.Sound) window.Sound.horn();
    if (state.wavesCleared % BOSS_WAVE_INTERVAL === 0 && !state.bossActive) {
      state.bossPending = true;
      if (window.FX && window.FX.message) {
        window.FX.message('WARNING: MEGA-STAG APPROACHING', '#ff4422');
      }
    }
  }

  function startGame(team) {
    state.playerTeam = team || 'hunter';
    state.phase = 'playing';
    state.time = 0;
    state.playerHp = state.playerMaxHp;
    state.playerAlive = true;
    state.kills = { deer: 0, hunter: 0 };
    state.score = { deer: 0, hunter: 0 };
    state.wavesCleared = 0;
    state.targetDeer = 8;
    state.targetHunters = 6;
    state.nextWaveAt = 0;
    state.buffDeer = 0;
    state.buffHunter = 0;
    state.bossPending = false;
    state.bossActive = false;
    state.lastKillerName = '';
    state.lastKillerId = null;
    state.lastKillerPos = null;
    if (window.Boss && window.Boss.reset) window.Boss.reset();
    if (window.Entities && window.Entities.reset) window.Entities.reset();
    // Clear ambient wildlife from the previous match, then seed a couple of
    // roaming herds so the forest feels alive the moment you deploy.
    if (window.Herd && window.Herd.reset) window.Herd.reset();
    if (window.Herd && window.Herd.init) window.Herd.init();
    if (window.BloodPools && window.BloodPools.reset) window.BloodPools.reset();
    if (window.Craters && window.Craters.reset) window.Craters.reset();
    if (window.Fire && window.Fire.reset) window.Fire.reset();
    if (window.Objectives && window.Objectives.reset) window.Objectives.reset();
    if (window.FX && window.FX.reset) window.FX.reset();
    if (window.Melee && window.Melee.reset) window.Melee.reset();
    if (window.OwlStrike && window.OwlStrike.reset) window.OwlStrike.reset();
    if (window.HeliStrike && window.HeliStrike.reset) window.HeliStrike.reset();
    if (window.AC130 && window.AC130.reset) window.AC130.reset();
    if (window.Killstreak && window.Killstreak.reset) window.Killstreak.reset();
    if (window.Scoreboard && window.Scoreboard.reset) window.Scoreboard.reset();
    if (window.MedTent && window.MedTent.reset) window.MedTent.reset();
    if (window.SupplyDrop && window.SupplyDrop.reset) window.SupplyDrop.reset();
    if (window.AmmoDrops && window.AmmoDrops.reset) window.AmmoDrops.reset();
    if (window.Portals && window.Portals.reset) window.Portals.reset();
    if (window.Warcry && window.Warcry.reset) window.Warcry.reset();
    if (window.Chaingun && window.Chaingun.reset) window.Chaingun.reset();
    if (window.BloodMoon && window.BloodMoon.reset) window.BloodMoon.reset();
    if (window.Ranks && window.Ranks.reset) window.Ranks.reset();
    if (window.Adrenaline && Adrenaline.reset) Adrenaline.reset();
    spawnWave();
    state.prevAliveDeer = aliveCount('deer');
    state.prevAliveHunters = aliveCount('hunter');
    if (overlay) overlay.classList.add('hidden');
    const a0 = Math.random() * Math.PI * 2;
    const sx = Math.cos(a0) * 8, sz = Math.sin(a0) * 8;
    if (window.CAMERA) {
      const gy = window.groundHeight ? window.groundHeight(sx, sz) + 1.7 : 1.7;
      window.CAMERA.position.set(sx, gy, sz);
      window.CAMERA.rotation.set(0, 0, 0, 'YXZ');
    }
    if (window.Player) {
      if (window.Player.reset) window.Player.reset();
      window.Player.state.yaw = 0;
      window.Player.state.pitch = 0;
      if (window.Player.state.vel) window.Player.state.vel.set(0, 0, 0);
      window.Player.state.locked = false;
    }
    if (window.Drone && window.Drone.show) window.Drone.show();
    if (window.Sound) {
      window.Sound.init();
      window.Sound.resume();
      if (window.Sound.startAmbience) window.Sound.startAmbience();
    }
    // Adaptive combat score: init + unlock + reset on deploy (this runs inside the
    // team-select click, a user gesture, so the AudioContext is allowed to start).
    if (window.Music) {
      if (window.Music.init) window.Music.init();
      if (window.Music.reset) window.Music.reset();
      if (window.Music.start) window.Music.start();
    }
    if (window.Sky && window.Sky.setTime) window.Sky.setTime(0.32);
    if (window.FX && window.FX.message) {
      window.FX.message('WAVE 1 — ' + state.playerTeam.toUpperCase() + ' TEAM', '#9fe8a0');
    }
  }

  function gameOver() {
    state.phase = 'gameover';
    if (overlay) {
      overlay.classList.remove('hidden');
      const h1 = overlay.querySelector('h1');
      const h2 = overlay.querySelector('h2');
      const p = overlay.querySelector('p');
      if (h1) h1.textContent = 'FOREST FALLEN';
      if (h2) h2.textContent = 'CLICK TO RESTART';
      if (p) p.innerHTML = 'You survived <b>' + state.wavesCleared + '</b> wave' + (state.wavesCleared !== 1 ? 's' : '') + '.<br>Deer kills: <b>' + state.kills.deer + '</b> · Hunter kills: <b>' + state.kills.hunter + '</b><br>Click anywhere to redeploy.';
    }
    if (document.exitPointerLock) document.exitPointerLock();
    if (window.Player) Player.state.locked = false;
    if (window.Sound) window.Sound.tone(110, 1.5, 'sawtooth', 0.3, 500);
  }

  function applyDamage(amount, srcTeam) {
    if (!state.playerAlive || state.phase !== 'playing') return;
    // Adrenaline overcharge shrugs off a fraction of incoming hits while active.
    if (window.Adrenaline && Adrenaline.isActive()) amount *= (1 - Adrenaline.getDamageResist());
    state.playerHp -= amount;
    if (srcTeam && window.Radar) window.Radar.pulse();
    // Low-HP overcharge can kick in the instant you cross into the danger zone (but not on a fatal blow).
    if (state.playerHp > 0 && window.Adrenaline && Adrenaline.checkTrigger) Adrenaline.checkTrigger(state.playerHp / state.playerMaxHp);
    if (window.FX) window.FX.damageFlash(amount / state.playerMaxHp);
    if (state.playerHp <= 0) {
      state.playerHp = 0;
      state.playerAlive = false;
      recordKiller(srcTeam);
      // Align the respawn window with the killcam orbit (measured in slowed sim time).
      state.respawnTimer = (window.Killcam && Killcam.DURATION) ? (Killcam.DURATION * Killcam.SLOWMO) : 3;
      if (window.Player) Player.state.locked = false;
      if (document.exitPointerLock) document.exitPointerLock();
      if (window.Killstreak && window.Killstreak.breakStreak) window.Killstreak.breakStreak();
      if (window.Killcam && Killcam.trigger) Killcam.trigger();
      if (window.FX && window.FX.message) window.FX.message('YOU FELL — RESPAWNING', '#ff4422');
    }
  }

  // Record who (or what) downed the player so the killcam has a subject to orbit.
  function recordKiller(srcTeam) {
    state.lastKillerName = 'UNKNOWN';
    state.lastKillerId = null;
    state.lastKillerPos = null;
    if (window.Boss && window.Boss.state && window.Boss.state.active && window.Boss.state.mesh) {
      state.lastKillerName = 'THE MEGA-STAG';
      state.lastKillerPos = window.Boss.state.mesh.position.clone();
      return;
    }
    const pt = state.playerTeam;
    let killer = null, kd = Infinity;
    if (window.Entities && window.Entities.list) {
      for (const en of window.Entities.list) {
        if (en.dead || en.team === pt) continue;
        const dx = en.mesh.position.x - CAMERA.position.x;
        const dz = en.mesh.position.z - CAMERA.position.z;
        const d = dx * dx + dz * dz;
        if (d < kd) { kd = d; killer = en; }
      }
    }
    if (killer) {
      state.lastKillerName = (srcTeam === 'deer') ? 'A RAGING STAG'
                           : (srcTeam === 'hunter') ? 'A HUNTER'
                           : 'THE FOREST';
      state.lastKillerId = (killer.id != null) ? killer.id : null;
      state.lastKillerPos = killer.mesh.position.clone();
    } else {
      state.lastKillerName = (srcTeam === 'deer') ? 'THE HERD'
                           : (srcTeam === 'hunter') ? 'A HUNTER'
                           : 'THE FOREST';
    }
  }

  function damagePlayer(amount, srcTeam) {
    applyDamage(amount, srcTeam || 'enemy');
  }

  function addScore(team, amount) {
    if (!state.score[team]) return;
    state.score[team] += amount;
  }

  function registerKill(victimTeam) {
    if (!state.kills[victimTeam]) return;
    state.kills[victimTeam]++;
    const killerTeam = victimTeam === 'deer' ? 'hunter' : 'deer';
    addScore(killerTeam, 10);
    if (window.Squads && window.Squads.pushKill) {
      const label = killerTeam === state.playerTeam ? 'YOU' : killerTeam.toUpperCase();
      window.Squads.pushKill(victimTeam, label);
    }
  }

  function update(dt) {
    if (state.phase !== 'playing') return;
    state.time += dt;

    if (state.bossPending && state.time > state.nextWaveAt - 5) {
      if (window.Boss && window.Boss.spawn && !state.bossActive) {
        window.Boss.spawn();
        state.bossActive = true;
        state.bossPending = false;
        if (window.Sound) window.Sound.horn();
      }
    }

    if (state.time >= state.nextWaveAt && !state.bossActive) {
      spawnWave();
    }

    if (!state.playerAlive) {
      state.respawnTimer -= dt;
      if (state.respawnTimer <= 0) {
        state.playerAlive = true;
        state.playerHp = state.playerMaxHp;
        if (window.Adrenaline && Adrenaline.onRespawn) Adrenaline.onRespawn();
        if (window.Killcam && Killcam.isActive && Killcam.isActive()) Killcam.cancel();
        if (window.CAMERA) {
          const a = Math.random() * Math.PI * 2;
          const sx = Math.cos(a) * 20, sz = Math.sin(a) * 20;
          const gy = window.groundHeight ? window.groundHeight(sx, sz) + 1.7 : 1.7;
          CAMERA.position.set(sx, gy, sz);
        }
        if (window.FX && window.FX.message) window.FX.message('REDEPLOYED', '#9fe8a0');
      }
      return;
    }

    if (window.Entities && window.Entities.bullets) {
      const pt = state.playerTeam;
      for (const b of window.Entities.bullets) {
        if (!b || !b.userData || b.userData.team === pt) continue;
        const dx = b.position.x - CAMERA.position.x;
        const dy = b.position.y - (CAMERA.position.y - 0.2);
        const dz = b.position.z - CAMERA.position.z;
        if (dx * dx + dy * dy + dz * dz < 0.35) {
          applyDamage(b.userData.damage || 12, b.userData.team);
          b.userData.life = 0;
          if (window.FX) window.FX.bloodBurst(b.position, new THREE.Vector3(0, 1, 0));
        }
      }
    }

    if (window.Entities && window.Entities.charges) {
      const pt = state.playerTeam;
      for (const c of window.Entities.charges) {
        if (!c || !c.userData || c.userData.team === pt || !c.userData.live) continue;
        const dx = c.position.x - CAMERA.position.x;
        const dz = c.position.z - CAMERA.position.z;
        if (dx * dx + dz * dz < 1.0) {
          applyDamage(c.userData.damage || 30, c.userData.team);
          c.userData.live = false;
          if (window.FX) window.FX.bloodBurst(c.position, new THREE.Vector3(0, 1, 0));
        }
      }
    }

    if (window.Boss && window.Boss.state && window.Boss.state.active) {
      const b = window.Boss.state;
      if (b.phase === 'trample') {
        const dx = b.mesh.position.x - CAMERA.position.x;
        const dz = b.mesh.position.z - CAMERA.position.z;
        if (dx * dx + dz * dz < 9) {
          applyDamage(40, 'deer');
        }
      }
      if (b.phase === 'slam') {
        const dx = b.mesh.position.x - CAMERA.position.x;
        const dz = b.mesh.position.z - CAMERA.position.z;
        if (dx * dx + dz * dz < 121) {
          applyDamage(35, 'deer');
        }
      }
    }
  }

  function updateHUD() {
    if (!statsEl || state.phase === 'idle') return;
    const hp = Math.max(0, Math.round(state.playerHp));
    const hpColor = hp > 60 ? '#9fe8a0' : hp > 30 ? '#ffcc44' : '#ff4422';
    const deerAlive = aliveCount('deer');
    const hunterAlive = aliveCount('hunter');
    const waveLabel = state.bossActive ? 'BOSS FIGHT' : 'WAVE ' + state.wavesCleared;
    statsEl.innerHTML =
      '<b style="color:' + hpColor + '">' + (state.playerAlive ? hp : 'DOWN') + '</b> HP<br>' +
      waveLabel + ' · T+' + Math.floor(state.time) + 's<br>' +
      'Deer: ' + deerAlive + ' · Hunters: ' + hunterAlive;
    if (teambar) {
      const deerColor = deerAlive > hunterAlive + 2 ? '#f0c98a' : '#888';
      const hunterColor = hunterAlive > deerAlive + 2 ? '#c9d8ff' : '#888';
      teambar.innerHTML =
        '<span class="deer-c" style="color:' + deerColor + '">DEER ' + state.score.deer + '</span><br>' +
        '<span class="hunter-c" style="color:' + hunterColor + '">HUNTERS ' + state.score.hunter + '</span>';
    }
  }

  function getState() { return state; }
  function getScore(team) { return state.score[team] || 0; }

  return { state, startGame, update, applyDamage, damagePlayer, addScore, registerKill, gameOver, aliveCount, getState, getScore, updateHUD, timeScale: 1 };
})();

window.Manager = Manager;