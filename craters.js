// craters.js — FORESTWAR terrain scorch: permanent craters from explosions, batched into pooled decals
const THREE = window.THREE;
const SCENE = window.SCENE;

const Craters = (() => {
  const MAX_CRATERS = 90;
  const SCORCH_RADIUS_MULT = 1.0;
  const FLASH_DURATION = 0.45;

  const CRATER_GEO = new THREE.CircleGeometry(1, 14);
  const SCORCH_MAT = new THREE.MeshBasicMaterial({
    color: 0x1a1008,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });

  const FLASH_MAT = new THREE.MeshBasicMaterial({
    color: 0xff7700,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5,
  });

  const pool = [];
  for (let i = 0; i < MAX_CRATERS; i++) {
    const scorch = new THREE.Mesh(CRATER_GEO, SCORCH_MAT.clone());
    scorch.rotation.x = -Math.PI / 2;
    scorch.visible = false;
    SCENE.add(scorch);
    const flash = new THREE.Mesh(CRATER_GEO, FLASH_MAT.clone());
    flash.rotation.x = -Math.PI / 2;
    flash.visible = false;
    SCENE.add(flash);
    pool.push({ scorch, flash, flashTime: 0, active: false });
  }

  let nextIdx = 0;

  function getGroundY(x, z) {
    if (typeof window.groundHeight === 'function') return window.groundHeight(x, z);
    return 0;
  }

  function create(x, z, radius) {
    const r = Math.max(0.8, radius * SCORCH_RADIUS_MULT);
    const slot = pool[nextIdx];
    nextIdx = (nextIdx + 1) % MAX_CRATERS;

    const gy = getGroundY(x, z) + 0.06;
    slot.scorch.position.set(x, gy, z);
    slot.scorch.scale.set(r, r, r);
    slot.scorch.material.opacity = 0.78 + Math.random() * 0.12;
    slot.scorch.rotation.z = Math.random() * Math.PI * 2;
    slot.scorch.visible = true;

    slot.flash.position.set(x, gy + 0.02, z);
    slot.flash.scale.set(r * 0.6, r * 0.6, r * 0.6);
    slot.flash.material.opacity = 0.9;
    slot.flash.visible = true;

    slot.flashTime = FLASH_DURATION;
    slot.active = true;
  }

  function update(dt) {
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      if (!c.active) continue;
      c.flashTime -= dt;
      if (c.flashTime <= 0) {
        c.flash.visible = false;
        c.active = false;
      } else {
        const t = c.flashTime / FLASH_DURATION;
        c.flash.material.opacity = t * 0.9;
        const grow = 1 + (1 - t) * 0.8;
        c.flash.scale.setScalar(c.scorch.scale.x * 0.6 * grow);
      }
    }
  }

  function reset() {
    for (let i = 0; i < pool.length; i++) {
      pool[i].scorch.visible = false;
      pool[i].flash.visible = false;
      pool[i].active = false;
      pool[i].flashTime = 0;
    }
    nextIdx = 0;
  }

  return { create, update, reset };
})();

window.Craters = Craters;