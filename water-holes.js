// water-holes.js — FORESTWAR scattered ponds: animated water surface with ripples, slow-and-muffle mechanic for wading entities
const THREE = window.THREE;
const SCENE = window.SCENE;
const WaterHoles = (() => {
  const MIN_RADIUS = 3.5;
  const MAX_RADIUS = 7.5;
  const COUNT = 6;
  const SLOW_MULT = 0.45;
  const SLOW_LINGER = 0.8;
  const SHOT_VOLUME_MULT = 0.35;
  const RIPPLE_INTERVAL = 0.18;
  const WAVE_SPEED = 1.8;
  const WAVE_AMP = 0.05;
  const PLAYER_CHECK_INTERVAL = 0.1;
  const ENTITY_CHECK_INTERVAL = 0.25;
  const REED_COUNT_PER = 5;

  const holes = [];
  const ripples = [];
  let playerSlowT = 0;
  let playerMuffleT = 0;
  let pCheckT = 0;
  let eCheckT = 0;

  const _v = new THREE.Vector3();

  const WATER_GEO = new THREE.CircleGeometry(1, 28);
  const WATER_MAT = new THREE.MeshStandardMaterial({
    color: 0x2a4a5a,
    transparent: true,
    opacity: 0.78,
    roughness: 0.12,
    metalness: 0.5,
    emissive: 0x0a1820,
    emissiveIntensity: 0.3,
  });

  const RIM_GEO = new THREE.TorusGeometry(1, 0.18, 5, 24);
  const RIM_MAT = new THREE.MeshStandardMaterial({ color: 0x3a3220, roughness: 0.95, flatShading: true });

  const RIPPLE_GEO = new THREE.RingGeometry(0.3, 0.42, 20);
  const RIPPLE_MAT = new THREE.MeshBasicMaterial({
    color: 0x88ccdd,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const REED_GEO = new THREE.ConeGeometry(0.05, 1.3, 4);
  const REED_GEO_LOW = new THREE.ConeGeometry(0.04, 0.8, 4);
  const REED_MAT = new THREE.MeshStandardMaterial({ color: 0x4a5a2e, roughness: 0.9, flatShading: true });
  const REED_TIP_MAT = new THREE.MeshBasicMaterial({ color: 0x6a4a1e });

  const SHIMMER_GEO = new THREE.PlaneGeometry(1, 1);
  const SHIMMER_MAT = new THREE.MeshBasicMaterial({
    color: 0xb0e0f0,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(RIPPLE_GEO, RIPPLE_MAT.clone());
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    ripples.push({ mesh: m, life: 0, maxLife: 1.8, hole: null, active: false });
  }
  let rippleIdx = 0;

  function spawnRipple(hole) {
    const slot = ripples[rippleIdx];
    rippleIdx = (rippleIdx + 1) % ripples.length;
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.random() * hole.radius * 0.7;
    slot.mesh.position.set(hole.x + Math.cos(ang) * dist, hole.y + 0.04, hole.z + Math.sin(ang) * dist);
    slot.mesh.scale.setScalar(0.3);
    slot.mesh.material.opacity = 0.55;
    slot.mesh.visible = true;
    slot.life = 0;
    slot.maxLife = 1.6 + Math.random() * 0.6;
    slot.active = true;
    slot.hole = hole;
  }

  function isNearTree(x, z, minDist) {
    const trees = window.TREES || [];
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      const dx = x - t.x, dz = z - t.z;
      if (dx * dx + dz * dz < (t.r + minDist) * (t.r + minDist)) return true;
    }
    return false;
  }

  function isNearHole(x, z, minDist) {
    for (let i = 0; i < holes.length; i++) {
      const h = holes[i];
      const dx = x - h.x, dz = z - h.z;
      if (dx * dx + dz * dz < (h.radius + minDist) * (h.radius + minDist)) return true;
    }
    return false;
  }

  function tryPlace(x, z) {
    if (isNearTree(x, z, 2.5)) return false;
    const colliders = window.worldColliders || [];
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < (c.r + 3) * (c.r + 3)) return false;
    }
    return true;
  }

  function init() {
    let placed = 0;
    let attempts = 0;
    while (placed < COUNT && attempts < 500) {
      attempts++;
      const a = Math.random() * Math.PI * 2;
      const r = 25 + Math.random() * 110;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (!tryPlace(x, z)) continue;
      if (isNearHole(x, z, 18)) continue;
      const radius = MIN_RADIUS + Math.random() * (MAX_RADIUS - MIN_RADIUS);
      const gy = window.groundHeight(x, z);

      const group = new THREE.Group();

      const rim = new THREE.Mesh(RIM_GEO, RIM_MAT);
      rim.scale.setScalar(radius);
      rim.rotation.x = -Math.PI / 2;
      rim.position.y = 0.02;
      group.add(rim);

      const water = new THREE.Mesh(WATER_GEO, WATER_MAT.clone());
      water.scale.setScalar(radius);
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.06;
      group.add(water);

      const shimmer = new THREE.Mesh(SHIMMER_GEO, SHIMMER_MAT.clone());
      shimmer.scale.setScalar(radius * 1.6);
      shimmer.rotation.x = -Math.PI / 2;
      shimmer.position.y = 0.07;
      group.add(shimmer);

      const reeds = [];
      for (let i = 0; i < REED_COUNT_PER; i++) {
        const ang = (i / REED_COUNT_PER) * Math.PI * 2 + Math.random() * 0.6;
        const dist = radius * (0.88 + Math.random() * 0.15);
        const rx = Math.cos(ang) * dist;
        const rz = Math.sin(ang) * dist;
        const tall = Math.random() < 0.6;
        const reed = new THREE.Mesh(tall ? REED_GEO : REED_GEO_LOW, REED_MAT);
        reed.position.set(rx, 0.55, rz);
        reed.rotation.z = (Math.random() - 0.5) * 0.25;
        reed.rotation.x = (Math.random() - 0.5) * 0.15;
        reed.castShadow = true;
        group.add(reed);
        if (Math.random() < 0.4) {
          const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 4), REED_TIP_MAT);
          tip.position.set(rx, 1.0, rz);
          group.add(tip);
        }
        reeds.push({ mesh: reed, phase: Math.random() * Math.PI * 2, baseX: rx, baseZ: rz });
      }

      group.position.set(x, gy, z);
      SCENE.add(group);

      holes.push({
        x, z,
        y: gy,
        radius,
        group,
        water,
        shimmer,
        reeds,
        rippleT: Math.random() * RIPPLE_INTERVAL,
        wavePhase: Math.random() * Math.PI * 2,
        t: 0,
      });
      placed++;
    }
  }

  function isInWater(x, z) {
    for (let i = 0; i < holes.length; i++) {
      const h = holes[i];
      const dx = x - h.x, dz = z - h.z;
      if (dx * dx + dz * dz < h.radius * h.radius) return true;
    }
    return false;
  }

  function getPlayerSlowMult() {
    return playerSlowT > 0 ? SLOW_MULT : 1.0;
  }

  function getShotVolumeMult() {
    return playerMuffleT > 0 ? SHOT_VOLUME_MULT : 1.0;
  }

  function updateRipples(dt) {
    for (let i = 0; i < ripples.length; i++) {
      const r = ripples[i];
      if (!r.active) continue;
      r.life += dt;
      const t = r.life / r.maxLife;
      if (t >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const grow = 0.3 + t * 3.2;
      r.mesh.scale.setScalar(grow);
      r.mesh.material.opacity = 0.55 * (1 - t);
    }
  }

  function updateHoles(dt, time) {
    for (let i = 0; i < holes.length; i++) {
      const h = holes[i];
      h.t += dt;
      h.wavePhase += dt * WAVE_SPEED;
      const wave = 1 + Math.sin(h.wavePhase) * WAVE_AMP;
      h.water.scale.setScalar(h.radius * wave);
      h.shimmer.rotation.z = h.t * 0.12;
      h.shimmer.material.opacity = 0.08 + Math.sin(h.t * 1.5) * 0.04;

      h.rippleT += dt;
      if (h.rippleT >= RIPPLE_INTERVAL) {
        h.rippleT = 0;
        spawnRipple(h);
      }

      for (let j = 0; j < h.reeds.length; j++) {
        const reed = h.reeds[j];
        reed.phase += dt * 2.2;
        reed.mesh.rotation.x = Math.sin(reed.phase) * 0.08;
        reed.mesh.rotation.z = Math.cos(reed.phase * 0.8) * 0.06;
      }
    }
  }

  function updatePlayer(dt) {
    pCheckT -= dt;
    if (pCheckT > 0) return;
    pCheckT = PLAYER_CHECK_INTERVAL;
    const cam = window.CAMERA;
    if (!cam) return;
    const inWater = isInWater(cam.position.x, cam.position.z);
    if (inWater) {
      playerSlowT = SLOW_LINGER;
      playerMuffleT = SLOW_LINGER;
    } else {
      if (playerSlowT > 0) playerSlowT = Math.max(0, playerSlowT - dt * 3);
      if (playerMuffleT > 0) playerMuffleT = Math.max(0, playerMuffleT - dt * 2);
    }
  }

  function updateEntities(dt) {
    eCheckT -= dt;
    if (eCheckT > 0) return;
    eCheckT = ENTITY_CHECK_INTERVAL;
    const ents = window.Entities && window.Entities.list;
    if (!ents) return;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || !e.mesh) continue;
      const m = e.mesh;
      if (isInWater(m.position.x, m.position.z)) {
        e.waterSlowT = SLOW_LINGER;
      } else if (e.waterSlowT > 0) {
        e.waterSlowT = Math.max(0, e.waterSlowT - dt * 3);
      }
    }
  }

  function getEntitySlowMult(ent) {
    if (!ent || !ent.waterSlowT || ent.waterSlowT <= 0) return 1.0;
    return SLOW_MULT;
  }

  function update(dt) {
    if (holes.length === 0) return;
    updateHoles(dt);
    updateRipples(dt);
    updatePlayer(dt);
    updateEntities(dt);
  }

  function reset() {
    playerSlowT = 0;
    playerMuffleT = 0;
    pCheckT = 0;
    eCheckT = 0;
    for (let i = 0; i < ripples.length; i++) {
      ripples[i].active = false;
      ripples[i].mesh.visible = false;
    }
    const ents = window.Entities && window.Entities.list;
    if (ents) {
      for (let i = 0; i < ents.length; i++) ents[i].waterSlowT = 0;
    }
  }

  window.WaterHoles = {
    init,
    update,
    reset,
    isInWater,
    getPlayerSlowMult,
    getShotVolumeMult,
    getEntitySlowMult,
    holes,
  };

  return window.WaterHoles;
})();