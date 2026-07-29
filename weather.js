// weather.js — FORESTWAR dynamic weather: rain storms, wind fog shifts, lightning hazard strikes
const THREE = window.THREE;
const SCENE = window.SCENE;
const FOG = window.FOG;
const SKY_LIGHT = window.SKY_LIGHT;
const Weather = (() => {
  const RAIN_MAX = 600;
  const LIGHTNING_DAMAGE = 55;
  const LIGHTNING_RADIUS = 5.5;
  const LIGHTNING_PLAYER_FRACTION = 0.35;
  const WIND_BASE = 0.4;

  const state = {
    phase: 'clear',
    timer: 18 + Math.random() * 12,
    intensity: 0,
    targetIntensity: 0,
    rainVisible: 0,
    windPhase: 0,
    windStrength: WIND_BASE,
    fogTarget: 0.018,
    lightTarget: 0.55,
    nextLightning: 0,
    flashTimer: 0,
    bolt: null,
    boltTimer: 0,
  };

  const RAIN_GEO = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN_MAX * 6);
  const rainVel = new Float32Array(RAIN_MAX * 2);
  for (let i = 0; i < RAIN_MAX; i++) {
    const x = (Math.random() - 0.5) * 80;
    const y = Math.random() * 45;
    const z = (Math.random() - 0.5) * 80;
    rainPos[i * 6] = x;     rainPos[i * 6 + 1] = y;     rainPos[i * 6 + 2] = z;
    rainPos[i * 6 + 3] = x + 0.15; rainPos[i * 6 + 4] = y - 1.8; rainPos[i * 6 + 5] = z + 0.05;
    rainVel[i * 2] = 0.7 + Math.random() * 0.6;
    rainVel[i * 2 + 1] = 0;
  }
  RAIN_GEO.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const RAIN_MAT = new THREE.LineBasicMaterial({ color: 0xaaccee, transparent: true, opacity: 0.4 });
  const rain = new THREE.LineSegments(RAIN_GEO, RAIN_MAT);
  rain.visible = false;
  rain.frustumCulled = false;
  SCENE.add(rain);

  const BOLT_GEO = new THREE.BufferGeometry();
  BOLT_GEO.setAttribute('position', new THREE.BufferAttribute(new Float32Array(42), 3));
  const BOLT_MAT = new THREE.LineBasicMaterial({ color: 0xeeffaa, transparent: true, opacity: 0.95 });
  const bolt = new THREE.Line(BOLT_GEO, BOLT_MAT);
  bolt.visible = false;
  bolt.frustumCulled = false;
  SCENE.add(bolt);

  const flashLight = new THREE.PointLight(0xffffff, 0, 60, 1.5);
  flashLight.position.set(0, 50, 0);
  SCENE.add(flashLight);

  function pickPhase() {
    const r = Math.random();
    if (state.phase === 'clear') {
      if (r < 0.25) return 'clear';
      return 'building';
    }
    if (state.phase === 'building') return 'storm';
    if (state.phase === 'storm') {
      if (r < 0.3) return 'clearing';
      return 'storm';
    }
    return 'clear';
  }

  function setPhase(p) {
    state.phase = p;
    if (p === 'clear') {
      state.targetIntensity = 0;
      state.fogTarget = 0.018;
      state.lightTarget = 0.55;
      state.timer = 20 + Math.random() * 18;
      state.nextLightning = 999;
    } else if (p === 'building') {
      state.targetIntensity = 0.35;
      state.fogTarget = 0.028;
      state.lightTarget = 0.42;
      state.timer = 12 + Math.random() * 8;
      state.nextLightning = 8 + Math.random() * 6;
    } else if (p === 'storm') {
      state.targetIntensity = 1.0;
      state.fogTarget = 0.045;
      state.lightTarget = 0.28;
      state.timer = 18 + Math.random() * 14;
      state.nextLightning = 3 + Math.random() * 4;
    } else if (p === 'clearing') {
      state.targetIntensity = 0.2;
      state.fogTarget = 0.024;
      state.lightTarget = 0.48;
      state.timer = 10 + Math.random() * 6;
      state.nextLightning = 999;
    }
    if (window.FX && window.FX.message) {
      const labels = { clear: 'SKIES CLEARING', building: 'STORM FRONT INCOMING', storm: 'THUNDERSTORM — STAY MOBILE', clearing: 'STORM PASSING' };
      const colors = { clear: '#9fe8a0', building: '#c8d8e8', storm: '#8899bb', clearing: '#aabbcc' };
      window.FX.message(labels[p] || p.toUpperCase(), colors[p] || '#aaa');
    }
  }

  function generateBolt(targetX, targetZ) {
    const arr = BOLT_GEO.attributes.position.array;
    let cx = targetX + (Math.random() - 0.5) * 8;
    let cy = 55;
    let cz = targetZ + (Math.random() - 0.5) * 8;
    const segments = 13;
    for (let i = 0; i < segments; i++) {
      const t = i / (segments - 1);
      arr[i * 3] = cx;
      arr[i * 3 + 1] = cy;
      arr[i * 3 + 2] = cz;
      if (i < segments - 1) {
        cx += (targetX - cx) * 0.18 + (Math.random() - 0.5) * 3;
        cy += (targetY(targetX, targetZ) - cy) * 0.18;
        cz += (targetZ - cz) * 0.18 + (Math.random() - 0.5) * 3;
      }
    }
    arr[(segments - 1) * 3] = targetX;
    arr[(segments - 1) * 3 + 1] = targetY(targetX, targetZ);
    arr[(segments - 1) * 3 + 2] = targetZ;
    BOLT_GEO.attributes.position.needsUpdate = true;
    bolt.position.set(0, 0, 0);
    bolt.visible = true;
    state.boltTimer = 0.18;
    flashLight.position.set(targetX, 30, targetZ);
    flashLight.intensity = 12;
    state.flashTimer = 0.14;
    if (window.Sound && window.Sound.thunder) {
      window.Sound.thunder();
    } else if (window.Sound) {
      window.Sound.tone(60, 0.6, 'sawtooth', 0.4, 400);
    }
    if (window.FX && window.FX.shake) window.FX.shake(0.3);
  }

  function targetY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function strikeLightning() {
    const ents = (window.Entities && Array.isArray(window.Entities.list)) ? window.Entities.list : [];
    const live = ents.filter(e => !e.dead);
    let tx, tz;
    if (live.length > 0 && Math.random() < 0.7) {
      const e = live[(Math.random() * live.length) | 0];
      tx = e.mesh ? e.mesh.position.x : 0;
      tz = e.mesh ? e.mesh.position.z : 0;
    } else {
      const cam = window.CAMERA;
      const a = Math.random() * Math.PI * 2;
      const r = 10 + Math.random() * 30;
      tx = cam.position.x + Math.cos(a) * r;
      tz = cam.position.z + Math.sin(a) * r;
    }
    generateBolt(tx, tz);
    if (window.Entities && window.Entities.applyExplosionDamage) {
      window.Entities.applyExplosionDamage(tx, targetY(tx, tz), tz, LIGHTNING_RADIUS, LIGHTNING_DAMAGE, 'weather', LIGHTNING_PLAYER_FRACTION);
    } else if (window.Entities && window.Entities.damageArea) {
      window.Entities.damageArea(tx, tz, LIGHTNING_RADIUS, LIGHTNING_DAMAGE, null);
    }
    if (window.FX && window.FX.sparkBurst) {
      window.FX.sparkBurst(new THREE.Vector3(tx, targetY(tx, tz) + 0.5, tz), 14, 0xffee88);
    } else if (window.FX && window.FX.bloodBurst) {
      window.FX.bloodBurst(new THREE.Vector3(tx, targetY(tx, tz) + 1, tz), new THREE.Vector3(0, 1, 0));
    }
  }

  function updateRain(dt, camX, camZ) {
    const arr = RAIN_GEO.attributes.position.array;
    const fall = (28 + state.intensity * 12) * dt;
    const drift = state.windStrength * 4 * dt;
    for (let i = 0; i < RAIN_MAX; i++) {
      const idx = i * 6;
      arr[idx + 1] -= fall * rainVel[i * 2];
      arr[idx + 4] = arr[idx + 1] - 1.8;
      arr[idx] += drift;
      arr[idx + 3] = arr[idx] + 0.15 + drift * 0.5;
      if (arr[idx + 1] < 0) {
        arr[idx + 1] = 35 + Math.random() * 12;
        arr[idx + 4] = arr[idx + 1] - 1.8;
        arr[idx] = camX + (Math.random() - 0.5) * 75;
        arr[idx + 2] = camZ + (Math.random() - 0.5) * 75;
        arr[idx + 3] = arr[idx] + 0.15;
        arr[idx + 5] = arr[idx + 2] + 0.05;
      }
    }
    RAIN_GEO.attributes.position.needsUpdate = true;
  }

  function update(dt) {
    const cam = window.CAMERA;
    if (!cam) return;
    state.timer -= dt;
    if (state.timer <= 0) setPhase(pickPhase());
    state.intensity += (state.targetIntensity - state.intensity) * dt * 0.5;
    state.windPhase += dt * (0.5 + state.intensity * 1.5);
    state.windStrength = WIND_BASE + state.intensity * 0.8 + Math.sin(state.windPhase) * 0.3 * state.intensity;
    const fogNow = FOG ? FOG.density : 0.018;
    const fogNext = fogNow + (state.fogTarget - fogNow) * dt * 0.4;
    if (FOG) FOG.density = fogNext;
    if (SKY_LIGHT) {
      const cur = SKY_LIGHT.intensity;
      SKY_LIGHT.intensity = cur + (state.lightTarget - cur) * dt * 0.5;
    }
    if (state.intensity > 0.05) {
      rain.visible = true;
      RAIN_MAT.opacity = 0.15 + state.intensity * 0.4;
      updateRain(dt, cam.position.x, cam.position.z);
    } else {
      rain.visible = false;
    }
    state.nextLightning -= dt;
    if (state.nextLightning <= 0 && state.intensity > 0.4) {
      strikeLightning();
      const base = state.phase === 'storm' ? 3 : 7;
      state.nextLightning = base + Math.random() * base;
    }
    if (state.flashTimer > 0) {
      state.flashTimer -= dt;
      flashLight.intensity = Math.max(0, state.flashTimer / 0.14) * 12;
      if (state.flashTimer <= 0) flashLight.intensity = 0;
    }
    if (state.boltTimer > 0) {
      state.boltTimer -= dt;
      BOLT_MAT.opacity = Math.max(0, state.boltTimer / 0.18);
      if (state.boltTimer <= 0) bolt.visible = false;
    }
  }

  function getIntensity() { return state.intensity; }
  function getPhase() { return state.phase; }
  function getWind() { return state.windStrength; }
  function forceStorm() { setPhase('storm'); }

  window.Weather = { update, getIntensity, getPhase, getWind, forceStorm, state };
  return window.Weather;
})();