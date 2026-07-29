// blood-trails.js — FORESTWAR blood trails: fading red decals left behind by wounded entities as they move
const THREE = window.THREE;
const SCENE = window.SCENE;
const BloodTrails = (() => {
  const MAX_DECALS = 120;
  const SPAWN_INTERVAL = 0.22;
  const MIN_SPEED = 2.0;
  const MAX_DECALS_PER_DROP = 1;
  const BASE_RADIUS = 0.30;
  const RADIUS_VARIANCE = 0.18;
  const OPACITY_MAX = 0.55;
  const FADE_TIME = 5.5;
  const FADE_DELAY = 1.8;
  const HP_FRACTION_FULL_TRAIL = 0.55;
  const SPLAT_GEO = new THREE.CircleGeometry(1, 8);
  const SPLAT_MAT = new THREE.MeshBasicMaterial({
    color: 0x3a0606,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const decals = [];
  for (let i = 0; i < MAX_DECALS; i++) {
    const mesh = new THREE.Mesh(SPLAT_GEO, SPLAT_MAT.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    mesh.frustumCulled = false;
    SCENE.add(mesh);
    decals.push({ mesh, life: 0, maxLife: 0, opacity: 0, active: false });
  }
  let nextIdx = 0;
  const tracked = [];
  function getGroundY(x, z) {
    if (typeof window.groundHeight === 'function') return window.groundHeight(x, z);
    return 0;
  }
  function register(entity) {
    if (!entity || !entity.mesh || entity._btTracking) return;
    entity._btTracking = true;
    entity._btTimer = Math.random() * SPAWN_INTERVAL;
    entity._btPrevX = entity.mesh.position.x;
    entity._btPrevZ = entity.mesh.position.z;
    tracked.push(entity);
  }
  function unregister(entity) {
    if (!entity || !entity._btTracking) return;
    entity._btTracking = false;
    const i = tracked.indexOf(entity);
    if (i !== -1) tracked[i] = tracked[tracked.length - 1];
    tracked.pop();
  }
  function spawnDecal(x, z, intensity) {
    const slot = decals[nextIdx];
    nextIdx = (nextIdx + 1) % MAX_DECALS;
    const gy = getGroundY(x, z) + 0.035;
    const radius = BASE_RADIUS + Math.random() * RADIUS_VARIANCE;
    const opacity = OPACITY_MAX * Math.min(intensity, 1.0) * (0.7 + Math.random() * 0.3);
    slot.mesh.position.set(x, gy, z);
    slot.mesh.rotation.z = Math.random() * Math.PI * 2;
    slot.mesh.scale.set(radius, radius, 1);
    const hue = 0.0;
    const lightness = 0.04 + Math.random() * 0.05;
    slot.mesh.material.color.setHSL(hue, 0.75, lightness);
    slot.mesh.material.opacity = opacity;
    slot.mesh.visible = true;
    slot.opacity = opacity;
    slot.life = FADE_DELAY + FADE_TIME;
    slot.maxLife = slot.life;
    slot.active = true;
  }
  function update(dt) {
    const ents = window.Entities && window.Entities.list ? window.Entities.list : null;
    if (ents) {
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (e.dead || !e.mesh || e.hp === undefined || e.maxHp === undefined) continue;
        const hpFrac = e.hp / e.maxHp;
        if (hpFrac < HP_FRACTION_FULL_TRAIL && hpFrac > 0) {
          if (!e._btTracking) register(e);
        } else {
          if (e._btTracking) unregister(e);
        }
      }
    }
    for (let i = tracked.length - 1; i >= 0; i--) {
      const e = tracked[i];
      if (e.dead || !e.mesh) {
        unregister(e);
        continue;
      }
      e._btTimer -= dt;
      if (e._btTimer > 0) continue;
      e._btTimer = SPAWN_INTERVAL;
      const px = e.mesh.position.x;
      const pz = e.mesh.position.z;
      const dx = px - e._btPrevX;
      const dz = pz - e._btPrevZ;
      const speed = Math.sqrt(dx * dx + dz * dz) / Math.max(dt, 0.001);
      if (speed < MIN_SPEED) {
        e._btPrevX = px;
        e._btPrevZ = pz;
        continue;
      }
      const hpFrac = e.maxHp > 0 ? e.hp / e.maxHp : 1;
      const intensity = 1.0 - hpFrac;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const drops = Math.min(MAX_DECALS_PER_DROP, 1 + Math.floor(intensity * 2));
      for (let j = 0; j < drops; j++) {
        const frac = (j + 1) / (drops + 1);
        spawnDecal(e._btPrevX + dx * frac, e._btPrevZ + dz * frac, intensity);
      }
      e._btPrevX = px;
      e._btPrevZ = pz;
    }
    for (let i = 0; i < decals.length; i++) {
      const d = decals[i];
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.mesh.visible = false;
        d.active = false;
        continue;
      }
      if (d.life < FADE_TIME) {
        d.mesh.material.opacity = d.opacity * (d.life / FADE_TIME);
      }
    }
  }
  function reset() {
    for (let i = 0; i < decals.length; i++) {
      decals[i].active = false;
      decals[i].life = 0;
      decals[i].mesh.visible = false;
    }
    for (let i = tracked.length - 1; i >= 0; i--) {
      unregister(tracked[i]);
    }
    tracked.length = 0;
    nextIdx = 0;
  }
  window.BloodTrails = { update, reset, register, unregister };
  return { update, reset, register, unregister };
})();