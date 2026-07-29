// battle-phases.js — FORESTWAR dynamic battle pacing: rotating match phases that shift spawn rates, AI aggression, scoring, enemy HP, and environmental hazards
const THREE = window.THREE;
const SCENE = window.SCENE;
const BattlePhases = (() => {
  const PHASE_DURATION = 120;
  const ANNOUNCE_TIME = 4.5;
  const TRANSITION_WARN = 8;
  const HAZARD_CHECK_INTERVAL = 6.0;
  const HAZARD_SIEGE_CHANCE = 0.45;
  const HAZARD_ASSAULT_CHANCE = 0.15;
  const HAZARD_IGNITE_RADIUS = 6;
  const HAZARD_MAX_TREES = 4;

  const PHASES = {
    skirmish: {
      name: 'SKIRMISH',
      color: '#9fe8a0',
      desc: 'Light contact. Steady reinforcements.',
      spawnMult: 1.0,
      aggressionMult: 1.0,
      scoreMult: 1.0,
      waveIntervalMult: 1.0,
      hpMult: 1.0,
    },
    assault: {
      name: 'ASSAULT',
      color: '#ff8844',
      desc: 'Aggressive push. Enemies close faster.',
      spawnMult: 1.4,
      aggressionMult: 1.5,
      scoreMult: 1.25,
      waveIntervalMult: 0.75,
      hpMult: 1.2,
    },
    siege: {
      name: 'SIEGE',
      color: '#ff3322',
      desc: 'All-out onslaught. Maximum pressure!',
      spawnMult: 1.8,
      aggressionMult: 1.9,
      scoreMult: 1.5,
      waveIntervalMult: 0.55,
      hpMult: 1.45,
    },
    regroup: {
      name: 'REGROUP',
      color: '#66ddff',
      desc: 'Lull in fighting. Catch your breath.',
      spawnMult: 0.5,
      aggressionMult: 0.6,
      scoreMult: 0.85,
      waveIntervalMult: 1.3,
      hpMult: 0.9,
    },
  };

  const SEQUENCE = ['skirmish', 'assault', 'siege', 'regroup'];

  const state = {
    phaseIndex: 0,
    current: 'skirmish',
    timer: 0,
    announceT: 0,
    warnFired: false,
    time: 0,
    hazardCd: HAZARD_CHECK_INTERVAL,
  };

  function getCurrent() { return PHASES[state.current]; }
  function getPhaseId() { return state.current; }

  function getSpawnMult() { return getCurrent().spawnMult; }
  function getAggressionMult() { return getCurrent().aggressionMult; }
  function getScoreMult() { return getCurrent().scoreMult; }
  function getWaveIntervalMult() { return getCurrent().waveIntervalMult; }
  function getHpMult() { return getCurrent().hpMult; }

  function applyScoreMult() {
    let mult = getCurrent().scoreMult;
    if (window.ChaosSurge && window.ChaosSurge.getScoreMult) {
      mult *= window.ChaosSurge.getScoreMult();
    }
    return mult;
  }

  const _camPos = new THREE.Vector3();

  function triggerHazard() {
    const cam = window.CAMERA;
    if (!cam) return;
    _camPos.copy(cam.position);
    const trees = window.TREES;
    if (!trees || trees.length === 0) return;
    const candidates = [];
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      const dx = t.x - _camPos.x;
      const dz = t.z - _camPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 400 && d2 < 6400) candidates.push(t);
    }
    if (candidates.length === 0) return;
    const count = 1 + ((Math.random() * HAZARD_MAX_TREES) | 0);
    for (let i = 0; i < count; i++) {
      const t = candidates[(Math.random() * candidates.length) | 0];
      if (!t) continue;
      if (window.Fire && window.Fire.ignite) {
        window.Fire.ignite(t.x, t.z, HAZARD_IGNITE_RADIUS);
      }
    }
    if (window.FX && window.FX.message) {
      window.FX.message('WARNING: WILDFIRE SPREADING', '#ff6622');
    }
  }

  function transition() {
    state.phaseIndex = (state.phaseIndex + 1) % SEQUENCE.length;
    state.current = SEQUENCE[state.phaseIndex];
    state.announceT = ANNOUNCE_TIME;
    state.warnFired = false;
    state.timer = 0;
    const next = getCurrent();
    if (window.FX && window.FX.message) {
      window.FX.message('PHASE: ' + next.name, next.color);
    }
    if (window.Sound) {
      const baseFreq = state.current === 'siege' ? 110 : state.current === 'assault' ? 165 : state.current === 'regroup' ? 330 : 220;
      if (window.Sound.tone) {
        window.Sound.tone(baseFreq, 0.5, 'sawtooth', 0.3, baseFreq * 4);
        window.Sound.tone(baseFreq * 1.5, 0.35, 'square', 0.15, baseFreq * 5);
      }
      if (state.current === 'siege' && window.Sound.horn) window.Sound.horn();
    }
    if (window.Entities && window.Entities.setPhaseBuff) {
      window.Entities.setPhaseBuff(getCurrent().hpMult, getCurrent().aggressionMult);
    }
  }

  function update(dt) {
    state.time += dt;
    state.timer += dt;
    if (state.announceT > 0) state.announceT -= dt;

    state.hazardCd -= dt;
    if (state.hazardCd <= 0) {
      state.hazardCd = HAZARD_CHECK_INTERVAL;
      const chance = state.current === 'siege' ? HAZARD_SIEGE_CHANCE : state.current === 'assault' ? HAZARD_ASSAULT_CHANCE : 0;
      if (chance > 0 && Math.random() < chance) triggerHazard();
    }

    if (!state.warnFired && state.timer >= PHASE_DURATION - TRANSITION_WARN) {
      state.warnFired = true;
      const nextIdx = (state.phaseIndex + 1) % SEQUENCE.length;
      const nextPhase = PHASES[SEQUENCE[nextIdx]];
      if (window.FX && window.FX.message) {
        window.FX.message('INCOMING: ' + nextPhase.name, nextPhase.color);
      }
    }

    if (state.timer >= PHASE_DURATION) transition();
  }

  function init() {
    state.phaseIndex = 0;
    state.current = 'skirmish';
    state.timer = 0;
    state.announceT = ANNOUNCE_TIME;
    state.warnFired = false;
    state.time = 0;
    state.hazardCd = HAZARD_CHECK_INTERVAL;
    if (window.Entities && window.Entities.setPhaseBuff) {
      window.Entities.setPhaseBuff(getCurrent().hpMult, getCurrent().aggressionMult);
    }
  }

  function reset() {
    init();
  }

  return { update, init, reset, getCurrent, getPhaseId, getSpawnMult, getAggressionMult, getScoreMult, getWaveIntervalMult, getHpMult, applyScoreMult, state };
})();

window.BattlePhases = BattlePhases;