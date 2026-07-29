// moss.js — FORESTWAR environmental moss: patches that grow on trees and rocks, cycling color over time
const THREE = window.THREE;
const SCENE = window.SCENE;
const Moss = (() => {
  const MAX_PATCHES = 60;
  const GROWTH_TIME = 6.0;
  const SPAWN_INTERVAL = 2.5;
  const MAX_LIFE = 60.0;
  const MIN_RADIUS = 0.35;
  const MAX_RADIUS = 0.95;
  const HUE_BASE = 0.28;
  const HUE_RANGE = 0.06;
  const LIGHTNESS_MIN = 0.16;
  const LIGHTNESS_MAX = 0.28;

  const PATCH_GEO = new THREE.SphereGeometry(1, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const PATCH_MAT = new THREE.MeshStandardMaterial({
    color: 0x4a6a30,
    roughness: 0.95,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  const patches = [];
  for (let i = 0; i < MAX_PATCHES; i++) {
    const mat = PATCH_MAT.clone();
    const mesh = new THREE.Mesh(PATCH_GEO, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    SCENE.add(mesh);
    patches.push({
      mesh,
      life: 0,
      maxLife: MAX_LIFE,
      growth: 0,
      radius: 0.5,
      active: false,
      hueShift: 0,
      baseColor: new THREE.Color(),
      targetColor: new THREE.Color(),
    });
  }

  let spawnTimer = 0;
  let nextIdx = 0;
  let time = 0;

  const _pos = new THREE.Vector3();
  const _normal = new THREE.Vector3();

  function getSurfaces() {
    const surfaces = [];
    if (window.TREES && Array.isArray(window.TREES)) {
      for (let i = 0; i < window.TREES.length; i++) {
        const t = window.TREES[i];
        if (!t || !t.mesh) continue;
        surfaces.push({ type: 'tree', x: t.x, z: t.z, r: t.r, data: t });
      }
    }
    if (window.worldColliders && Array.isArray(window.worldColliders)) {
      for (let i = 0; i < window.worldColliders.length; i++) {
        const c = window.worldColliders[i];
        if (!c) continue;
        surfaces.push({ type: 'rock', x: c.x, z: c.z, r: c.r, data: c });
      }
    }
    return surfaces;
  }

  function spawnPatch() {
    const surfaces = getSurfaces();
    if (surfaces.length === 0) return;
    const surface = surfaces[(Math.random() * surfaces.length) | 0];
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * Math.max(0.1, surface.r * 0.8);
    _pos.set(surface.x + Math.cos(angle) * dist, 0, surface.z + Math.sin(angle) * dist);
    if (typeof window.groundHeight === 'function') {
      _pos.y = window.groundHeight(_pos.x, _pos.z);
    } else {
      _pos.y = 0;
    }
    if (surface.type === 'tree') {
      const heightFraction = 0.3 + Math.random() * 0.5;
      _pos.y += heightFraction * 6.0;
      _normal.set(Math.cos(angle), 0.3, Math.sin(angle)).normalize();
    } else {
      _pos.y += surface.r * 0.5;
      _normal.set(Math.cos(angle), 0.8, Math.sin(angle)).normalize();
    }

    const slot = patches[nextIdx];
    nextIdx = (nextIdx + 1) % MAX_PATCHES;

    const radius = MIN_RADIUS + Math.random() * (MAX_RADIUS - MIN_RADIUS);
    slot.radius = radius;
    slot.growth = 0;
    slot.life = 0;
    slot.maxLife = MAX_LIFE * (0.7 + Math.random() * 0.6);
    slot.hueShift = (Math.random() - 0.5) * HUE_RANGE;

    const hue = (HUE_BASE + slot.hueShift + 1) % 1;
    const lightness = LIGHTNESS_MIN + Math.random() * (LIGHTNESS_MAX - LIGHTNESS_MIN);
    slot.baseColor.setHSL(hue, 0.55, lightness);
    const endHue = (hue + 0.04) % 1;
    slot.targetColor.setHSL(endHue, 0.5, lightness * 0.6);

    slot.mesh.position.copy(_pos);
    slot.mesh.lookAt(_pos.x + _normal.x, _pos.y + _normal.y, _pos.z + _normal.z);
    slot.mesh.scale.setScalar(0.1);
    slot.mesh.material.opacity = 0;
    slot.mesh.material.color.copy(slot.baseColor);
    slot.mesh.visible = true;
    slot.active = true;
  }

  function update(dt) {
    time += dt;
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = SPAWN_INTERVAL;
      spawnPatch();
      if (Math.random() < 0.3) spawnPatch();
    }

    for (let i = 0; i < patches.length; i++) {
      const p = patches[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.growth < GROWTH_TIME) {
        p.growth = Math.min(GROWTH_TIME, p.growth + dt);
        const t = p.growth / GROWTH_TIME;
        const eased = 1 - Math.pow(1 - t, 3);
        p.mesh.scale.setScalar(0.1 + eased * p.radius);
        p.mesh.material.opacity = eased * 0.85;
      }

      const colorPhase = Math.sin(time * 0.3 + i * 0.7) * 0.5 + 0.5;
      p.mesh.material.color.lerpColors(p.baseColor, p.targetColor, colorPhase);

      const breathe = 1 + Math.sin(time * 1.5 + i) * 0.04;
      const fullyGrownScale = 0.1 + p.radius;
      p.mesh.scale.setScalar(fullyGrownScale * breathe);

      if (p.life >= p.maxLife) {
        const fadeT = Math.max(0, 1 - (p.life - p.maxLife) / 4);
        p.mesh.material.opacity = fadeT * 0.85;
        if (fadeT <= 0.01) {
          p.mesh.visible = false;
          p.active = false;
        }
      }
    }
  }

  function dispose() {
    for (let i = 0; i < patches.length; i++) {
      const p = patches[i];
      if (p.mesh) {
        if (p.mesh.material) p.mesh.material.dispose();
        if (SCENE && p.mesh.parent === SCENE) SCENE.remove(p.mesh);
      }
    }
    patches.length = 0;
  }

  return { update, dispose, spawnPatch };
})();
window.Moss = Moss;