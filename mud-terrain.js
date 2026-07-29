// mud-terrain.js — FORESTWAR dynamic mud system: rain creates muddy zones that slow entities, dry into cracked ground after storms
const THREE = window.THREE;
const SCENE = window.SCENE;
const Mud = (() => {
  const MAX_PATCHES = 45;
  const PATCH_RADIUS_MIN = 2.5;
  const PATCH_RADIUS_MAX = 5.5;
  const GROW_TIME = 1.8;
  const SLOW_MULT = 0.5;
  const SLOW_LINGER = 1.2;
  const DRY_TIME = 35;
  const DRY_THRESHOLD = 0.25;
  const SPAWN_CHECK_INTERVAL = 0.8;
  const SPAWN_PER_CHECK_RAIN = 0.45;
  const SPAWN_PER_CHECK_STORM = 0.75;
  const FADE_IN_TIME = 0.8;
  const CRACK_OPACITY = 0.45;
  const RIPPLE_INTERVAL = 0.35;

  const PATCH_GEO = new THREE.CircleGeometry(1, 20);
  const MUD_MAT = new THREE.MeshBasicMaterial({
    color: 0x3a2a14,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const CRACK_MAT = new THREE.MeshBasicMaterial({
    color: 0x221808,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const RIPPLE_GEO = new THREE.RingGeometry(0.3, 0.5, 16);
  const RIPPLE_MAT = new THREE.MeshBasicMaterial({
    color: 0x6a5028,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const patches = [];
  for (let i = 0; i < MAX_PATCHES; i++) {
    const mud = new THREE.Mesh(PATCH_GEO, MUD_MAT.clone());
    mud.rotation.x = -Math.PI / 2;
    mud.visible = false;
    SCENE.add(mud);
    const crack = new THREE.Mesh(PATCH_GEO, CRACK_MAT.clone());
    crack.rotation.x = -Math.PI / 2;
    crack.visible = false;
    SCENE.add(crack);
    patches.push({
      mud, crack,
      x: 0, z: 0,
      radius: 4,
      growT: 0,
      dryT: 0,
      state: 'idle',
      rippleTimer: 0,
      active: false,
    });
  }

  const ripples = [];
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(RIPPLE_GEO, RIPPLE_MAT.clone());
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    ripples.push({ mesh: m, life: 0, maxLife: 0.6, active: false });
  }
  let rippleIdx = 0;

  let spawnTimer = 0;
  let weatherIntensity = 0;
  let weatherPhase = 'clear';

  const _playerLinger = { timer: 0 };

  function getGroundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function findIdlePatch() {
    for (let i = 0; i < patches.length; i++) {
      if (!patches[i].active) return patches[i];
    }
    return null;
  }

  function spawnRipple(x, z) {
    const slot = ripples[rippleIdx];
    rippleIdx = (rippleIdx + 1) % ripples.length;
    const gy = getGroundY(x, z);
    slot.mesh.position.set(x, gy + 0.03, z);
    slot.mesh.scale.setScalar(0.5);
    slot.mesh.material.opacity = 0.5;
    slot.mesh.visible = true;
    slot.life = slot.maxLife;
    slot.active = true;
  }

  function spawnPatch() {
    const cam = window.CAMERA;
    let cx = 0, cz = 0;
    if (cam) {
      const a = Math.random() * Math.PI * 2;
      const r = 10 + Math.random() * 55;
      cx = cam.position.x + Math.cos(a) * r;
      cz = cam.position.z + Math.sin(a) * r;
    } else {
      cx = (Math.random() - 0.5) * 200;
      cz = (Math.random() - 0.5) * 200;
    }
    const slot = findIdlePatch();
    if (!slot) return;
    slot.x = cx;
    slot.z = cz;
    slot.radius = PATCH_RADIUS_MIN + Math.random() * (PATCH_RADIUS_MAX - PATCH_RADIUS_MIN);
    slot.growT = 0;
    slot.dryT = 0;
    slot.state = 'growing';
    slot.rippleTimer = Math.random() * RIPPLE_INTERVAL;
    slot.active = true;
    const gy = getGroundY(cx, cz);
    slot.mud.position.set(cx, gy + 0.02, cz);
    slot.mud.scale.setScalar(0.1);
    slot.mud.rotation.z = Math.random() * Math.PI * 2;
    const shade = 0.20 + Math.random() * 0.08;
    slot.mud.material.color.setRGB(shade + 0.05, shade * 0.8, shade * 0.45);
    slot.mud.material.opacity = 0;
    slot.mud.visible = true;
    slot.crack.position.set(cx, gy + 0.015, cz);
    slot.crack.scale.setScalar(slot.radius);
    slot.crack.rotation.z = slot.mud.rotation.z;
    slot.crack.visible = false;
  }

  function setWeather(intensity, phase) {
    weatherIntensity = intensity;
    weatherPhase = phase;
  }

  function isMuddy(x, z) {
    for (let i = 0; i < patches.length; i++) {
      const p = patches[i];
      if (!p.active || p.state === 'dried') continue;
      const dx = x - p.x;
      const dz = z - p.z;
      const r = p.radius * p.growT;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  function applyToEntities(dt) {
    const ents = window.Entities && window.Entities.list;
    if (!ents) return;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead) continue;
      const m = e.mesh;
      if (!m) continue;
      if (e.mudLinger === undefined) e.mudLinger = 0;
      if (isMuddy(m.position.x, m.position.z)) {
        e.mudLinger = SLOW_LINGER;
      } else if (e.mudLinger > 0) {
        e.mudLinger -= dt;
      }
    }
  }

  function applyToPlayer(dt) {
    if (!window.CAMERA) return;
    if (isMuddy(window.CAMERA.position.x, window.CAMERA.position.z)) {
      _playerLinger.timer = SLOW_LINGER;
    } else if (_playerLinger.timer > 0) {
      _playerLinger.timer -= dt;
    }
  }

  function getPlayerSpeedMult() {
    return _playerLinger.timer > 0 ? SLOW_MULT : 1.0;
  }

  function getEntitySpeedMult(e) {
    return (e && e.mudLinger !== undefined && e.mudLinger > 0) ? SLOW_MULT : 1.0;
  }

  function update(dt) {
    if (window.Weather) {
      weatherIntensity = window.Weather.state ? window.Weather.state.intensity : 0;
      weatherPhase = window.Weather.state ? window.Weather.state.phase : 'clear';
    }
    if (weatherPhase === 'storm' || weatherPhase === 'building') {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnTimer = SPAWN_CHECK_INTERVAL;
        const chance = weatherPhase === 'storm' ? SPAWN_PER_CHECK_STORM : SPAWN_PER_CHECK_RAIN;
        const eff = chance * Math.max(0.2, weatherIntensity);
        if (Math.random() < eff) spawnPatch();
      }
    }
    for (let i = 0; i < patches.length; i++) {
      const p = patches[i];
      if (!p.active) continue;
      if (p.state === 'growing') {
        p.growT += dt / GROW_TIME;
        if (p.growT >= 1) {
          p.growT = 1;
          p.state = 'wet';
        }
        const sc = p.radius * p.growT;
        p.mud.scale.setScalar(sc);
        p.mud.material.opacity = Math.min(1, p.growT) * 0.7;
        p.rippleTimer -= dt;
        if (p.rippleTimer <= 0 && weatherPhase !== 'clear' && weatherPhase !== 'clearing') {
          p.rippleTimer = RIPPLE_INTERVAL * (0.5 + Math.random() * 0.8);
          const ra = Math.random() * Math.PI * 2;
          const rr = Math.random() * p.radius * 0.7 * p.growT;
          spawnRipple(p.x + Math.cos(ra) * rr, p.z + Math.sin(ra) * rr);
        }
      } else if (p.state === 'wet') {
        if (weatherPhase === 'clear' || weatherPhase === 'clearing') {
          p.dryT += dt;
        }
        p.rippleTimer -= dt;
        if (p.rippleTimer <= 0 && weatherPhase !== 'clear' && weatherPhase !== 'clearing') {
          p.rippleTimer = RIPPLE_INTERVAL * (0.6 + Math.random() * 1.0);
          const ra = Math.random() * Math.PI * 2;
          const rr = Math.random() * p.radius * 0.6;
          spawnRipple(p.x + Math.cos(ra) * rr, p.z + Math.sin(ra) * rr);
        }
        if (p.dryT >= DRY_TIME) {
          p.state = 'drying';
          p.dryT = 0;
          p.crack.visible = true;
          p.crack.material.opacity = 0;
        }
      } else if (p.state === 'drying') {
        p.dryT += dt / 4.0;
        const t = Math.min(1, p.dryT);
        p.mud.material.opacity = 0.7 * (1 - t);
        p.crack.material.opacity = t * CRACK_OPACITY;
        if (t >= 1) {
          p.state = 'dried';
        }
      } else if (p.state === 'dried') {
        if (weatherPhase === 'storm' || weatherPhase === 'building') {
          p.state = 'growing';
          p.growT = 0.3;
          p.dryT = 0;
          p.crack.visible = false;
        }
      }
    }
    for (let i = 0; i < ripples.length; i++) {
      const r = ripples[i];
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.mesh.visible = false;
        r.active = false;
      } else {
        const t = 1 - r.life / r.maxLife;
        r.mesh.scale.setScalar(0.5 + t * 2.0);
        r.mesh.material.opacity = 0.5 * (1 - t);
      }
    }
    applyToEntities(dt);
    applyToPlayer(dt);
  }

  function reset() {
    for (let i = 0; i < patches.length; i++) {
      patches[i].active = false;
      patches[i].state = 'idle';
      patches[i].mud.visible = false;
      patches[i].crack.visible = false;
    }
    for (let i = 0; i < ripples.length; i++) {
      ripples[i].active = false;
      ripples[i].mesh.visible = false;
    }
    _playerLinger.timer = 0;
    spawnTimer = 0;
  }

  window.Mud = {
    update,
    reset,
    setWeather,
    isMuddy,
    getPlayerSpeedMult,
    getEntitySpeedMult,
    state: { patches },
  };
  return window.Mud;
})();