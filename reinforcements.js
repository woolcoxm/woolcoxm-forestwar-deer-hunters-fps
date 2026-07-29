// reinforcements.js — FORESTWAR tactical airdrop: spawn deer/hunters via parachute, team-colored glow
const THREE = window.THREE;
const SCENE = window.SCENE;
const Reinforcements = (() => {
  const DROP_ALT = 60;
  const DESCEND_SPEED = 7.5;
  const RELEASE_HEIGHT = 2.5;
  const MAX_CONCURRENT = 5;
  const COOLDOWN = 30;

  const state = {
    active: [],
    cooldownTimer: 0,
    ready: true,
    totalCalled: 0,
  };

  const PARA_CANOPY_GEO = new THREE.SphereGeometry(1.6, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const PARA_CANOPY_DEER = new THREE.MeshStandardMaterial({ color: 0xf0c98a, roughness: 0.7, flatShading: true, side: THREE.DoubleSide, emissive: 0x442200, emissiveIntensity: 0.3 });
  const PARA_CANOPY_HUNTER = new THREE.MeshStandardMaterial({ color: 0xc9d8ff, roughness: 0.7, flatShading: true, side: THREE.DoubleSide, emissive: 0x222244, emissiveIntensity: 0.3 });
  const PARA_STRING_GEO = new THREE.CylinderGeometry(0.02, 0.02, 3.5, 3);
  const PARA_STRING_MAT = new THREE.MeshBasicMaterial({ color: 0x555555 });
  const BEACON_GEO = new THREE.CylinderGeometry(0.12, 0.12, 0.3, 6);
  const BEACON_MAT = new THREE.MeshBasicMaterial({ color: 0x9fe8a0 });

  const SIGNAL_LIGHT_GEO = new THREE.SphereGeometry(0.4, 6, 5);

  function canCall() {
    return state.ready && state.active.length < MAX_CONCURRENT;
  }

  function call(teamOverride) {
    const pt = (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
    const team = teamOverride || pt;
    if (!canCall()) {
      if (window.FX) window.FX.message('REINFORCEMENTS UNAVAILABLE', '#ff6644');
      return false;
    }
    state.ready = false;
    state.cooldownTimer = COOLDOWN;
    state.totalCalled++;

    const count = 3;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 12 + Math.random() * 24;
      const px = (window.CAMERA ? window.CAMERA.position.x : 0) + Math.cos(a) * r;
      const pz = (window.CAMERA ? window.CAMERA.position.z : 0) + Math.sin(a) * r;
      spawnDrop(team, px + (i - 1) * 2.5, pz);
    }

    if (window.FX) window.FX.message('REINFORCEMENTS INBOUND — ' + team.toUpperCase(), team === 'deer' ? '#f0c98a' : '#c9d8ff');
    if (window.Sound) {
      window.Sound.tone(220, 0.4, 'sawtooth', 0.3, 800);
      window.Sound.tone(440, 0.25, 'square', 0.2, 1200);
      if (window.Sound.horn) window.Sound.horn();
    }
    updateHUD();
    return true;
  }

  function spawnDrop(team, x, z) {
    const group = new THREE.Group();
    const canopyMat = team === 'deer' ? PARA_CANOPY_DEER : PARA_CANOPY_HUNTER;
    const canopy = new THREE.Mesh(PARA_CANOPY_GEO, canopyMat);
    canopy.position.y = DROP_ALT + 3;
    group.add(canopy);

    for (const sx of [-0.7, 0.7]) {
      for (const sz of [-0.7, 0.7]) {
        const string = new THREE.Mesh(PARA_STRING_GEO, PARA_STRING_MAT);
        string.position.set(sx, DROP_ALT + 1, sz);
        group.add(string);
      }
    }

    const beaconColor = team === 'deer' ? 0xff8844 : 0x4488ff;
    const beacon = new THREE.Mesh(BEACON_GEO, new THREE.MeshBasicMaterial({ color: beaconColor }));
    beacon.position.y = DROP_ALT - 0.2;
    group.add(beacon);

    const signal = new THREE.Mesh(SIGNAL_LIGHT_GEO, new THREE.MeshBasicMaterial({ color: beaconColor, transparent: true, opacity: 0.8 }));
    signal.position.y = DROP_ALT - 0.2;
    group.add(signal);

    const light = new THREE.PointLight(beaconColor, 2, 12, 2);
    light.position.y = DROP_ALT;
    group.add(light);

    SCENE.add(group);

    state.active.push({
      group, canopy, beacon, signal, light, beaconColor,
      team,
      x, z,
      y: DROP_ALT,
      swayPhase: Math.random() * Math.PI * 2,
      released: false,
      age: 0,
    });
  }

  function update(dt) {
    if (!state.ready) {
      state.cooldownTimer -= dt;
      if (state.cooldownTimer <= 0) {
        state.ready = true;
        if (window.FX) window.FX.message('REINFORCEMENTS READY — PRESS 5', '#9fe8a0');
        if (window.Sound) window.Sound.tone(660, 0.2, 'sine', 0.25, 2000);
        updateHUD();
      }
    }

    for (let i = state.active.length - 1; i >= 0; i--) {
      const d = state.active[i];
      d.age += dt;
      d.y -= DESCEND_SPEED * dt;
      d.swayPhase += dt * 1.8;
      const swayX = Math.sin(d.swayPhase) * 1.2;
      const swayZ = Math.cos(d.swayPhase * 0.8) * 0.9;

      d.canopy.position.set(d.x + swayX, d.y + 3, d.z + swayZ);
      d.beacon.position.set(d.x + swayX * 0.5, d.y - 0.2, d.z + swayZ * 0.5);
      d.signal.position.copy(d.beacon.position);
      d.signal.scale.setScalar(1 + Math.sin(d.age * 8) * 0.3);
      d.light.position.set(d.x + swayX * 0.5, d.y, d.z + swayZ * 0.5);
      for (let j = 1; j < 5; j++) d.group.children[j].position.x = d.x + swayX * (j / 5);

      if (d.y <= RELEASE_HEIGHT && !d.released) {
        d.released = true;
        d.landedTime = d.age;
        if (window.Entities && window.Entities.spawn) {
          window.Entities.spawn(d.team, d.x, d.z);
        }
        SCENE.remove(d.canopy);
        SCENE.remove(d.beacon);
        SCENE.remove(d.signal);
        SCENE.remove(d.light);
        if (window.FX) window.FX.bloodBurst(new THREE.Vector3(d.x, window.groundHeight(d.x, d.z) + 1, d.z), new THREE.Vector3(0, 1, 0));
        if (window.Sound) window.Sound.tone(150, 0.3, 'sawtooth', 0.35, 600);
      }

      if (d.released) {
        d.age += dt;
        if (d.age > d.landedTime + 0.5) {
          SCENE.remove(d.group);
          state.active.splice(i, 1);
        }
      }
    }
  }

  function getReadyState() {
    return { ready: state.ready, cooldown: Math.max(0, state.cooldownTimer), active: state.active.length, totalCalled: state.totalCalled };
  }

  const keyHandler = (e) => {
    if (e.key === '5' && window.Manager && window.Manager.state && window.Manager.state.phase === 'playing') {
      e.preventDefault();
      call();
    }
  };

  function init() {
    window.addEventListener('keydown', keyHandler);
    buildHUD();
    const check = setInterval(() => {
      if (window.Manager && window.Manager.state && window.Manager.state.phase === 'playing') {
        clearInterval(check);
        updateHUD();
      }
    }, 200);
  }

  let hudBar, hudFill, hudLabel;

  function buildHUD() {
    hudBar = document.createElement('div');
    hudBar.style.cssText = 'position:absolute;bottom:96px;right:16px;width:160px;height:9px;background:rgba(0,0,0,0.55);border:1px solid rgba(150,200,150,0.4);border-radius:5px;overflow:hidden;z-index:6;';
    hudFill = document.createElement('div');
    hudFill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#9fe8a0,#5fd07a);transition:width 0.2s;border-radius:4px;';
    hudBar.appendChild(hudFill);
    document.getElementById('hud').appendChild(hudBar);

    hudLabel = document.createElement('div');
    hudLabel.style.cssText = 'position:absolute;bottom:107px;right:16px;font-size:10px;letter-spacing:2px;color:#9fe8a0;text-shadow:0 1px 3px #000;z-index:6;';
    hudLabel.textContent = 'REINFORCEMENTS [5] — READY';
    document.getElementById('hud').appendChild(hudLabel);
  }

  function updateHUD() {
    if (!hudLabel || !hudFill) return;
    if (state.ready) {
      hudLabel.textContent = 'REINFORCEMENTS [5] — READY';
      hudLabel.style.color = '#9fe8a0';
      hudFill.style.width = '100%';
      hudFill.style.background = 'linear-gradient(90deg,#9fe8a0,#5fd07a)';
    } else {
      const pct = 1 - (state.cooldownTimer / COOLDOWN);
      hudLabel.textContent = 'REINFORCEMENTS — ' + Math.ceil(state.cooldownTimer) + 's';
      hudLabel.style.color = '#c9a060';
      hudFill.style.width = (pct * 100) + '%';
      hudFill.style.background = 'linear-gradient(90deg,#6a5a3a,#c9a060)';
    }
  }

  return { init, update, call, canCall, getReadyState, state };
})();
window.Reinforcements = Reinforcements;