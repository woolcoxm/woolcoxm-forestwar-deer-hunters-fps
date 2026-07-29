// blood-pools.js — FORESTWAR gore decals: persistent ground blood pools from deaths and heavy wounds
const THREE = window.THREE;
const SCENE = window.SCENE;
const BloodPools = (() => {
  const MAX_POOLS = 70;
  const GROW_TIME = 0.8;
  const FADE_IN_TIME = 0.5;
  const MIN_RADIUS = 0.7;
  const MAX_RADIUS = 2.0;

  const POOL_GEO = new THREE.CircleGeometry(1, 18);
  const POOL_MAT = new THREE.MeshBasicMaterial({
    color: 0x3a0808,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

  const SPLAT_MAT = new THREE.MeshBasicMaterial({
    color: 0x5a0c0c,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

  const pools = [];
  for (let i = 0; i < MAX_POOLS; i++) {
    const mesh = new THREE.Mesh(POOL_GEO, POOL_MAT.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    SCENE.add(mesh);
    pools.push({ mesh, life: 0, maxLife: 0, growT: 0, targetRadius: 1, active: false });
  }

  const splats = [];
  const SPLAT_COUNT = 24;
  for (let i = 0; i < SPLAT_COUNT; i++) {
    const mesh = new THREE.Mesh(POOL_GEO, SPLAT_MAT.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    SCENE.add(mesh);
    splats.push({ mesh, life: 0, active: false });
  }

  let nextIdx = 0;
  let nextSplat = 0;

  function getGroundY(x, z) {
    if (typeof window.groundHeight === 'function') return window.groundHeight(x, z);
    return 0;
  }

  function spawn(x, z, intensity) {
    const slot = pools[nextIdx];
    nextIdx = (nextIdx + 1) % MAX_POOLS;

    const gy = getGroundY(x, z) + 0.04;
    const radius = MIN_RADIUS + Math.random() * (MAX_RADIUS - MIN_RADIUS) * Math.min(intensity, 1.5);
    const angle = Math.random() * Math.PI * 2;

    slot.mesh.position.set(x, gy, z);
    slot.mesh.rotation.z = angle;
    slot.mesh.scale.setScalar(0.2);
    slot.mesh.material.opacity = 0;
    slot.mesh.visible = true;

    const darkness = 0.45 + Math.random() * 0.15;
    const hue = 0.0;
    slot.mesh.material.color.setHSL(hue, 0.75, darkness);

    slot.growT = 0;
    slot.targetRadius = radius;
    slot.life = 0;
    slot.maxLife = GROW_TIME + FADE_IN_TIME;
    slot.active = true;

    const splatN = 3 + (Math.random() * 4 | 0);
    for (let i = 0; i < splatN; i++) {
      spawnSplat(x, z, radius);
    }
  }

  function spawnSplat(x, z, poolRadius) {
    const slot = splats[nextSplat];
    nextSplat = (nextSplat + 1) % SPLAT_COUNT;

    const angle = Math.random() * Math.PI * 2;
    const dist = poolRadius * (0.5 + Math.random() * 0.9);
    const sx = x + Math.cos(angle) * dist;
    const sz = z + Math.sin(angle) * dist;
    const gy = getGroundY(sx, sz) + 0.035;

    const size = 0.15 + Math.random() * 0.3;

    slot.mesh.position.set(sx, gy, sz);
    slot.mesh.rotation.z = Math.random() * Math.PI * 2;
    slot.mesh.scale.setScalar(size);
    slot.mesh.material.opacity = 0.5 + Math.random() * 0.25;
    slot.mesh.material.color.setHSL(0.0, 0.7, 0.18 + Math.random() * 0.08);
    slot.mesh.visible = true;

    slot.life = 0.4 + Math.random() * 0.3;
    slot.active = true;
  }

  let checkTimer = 0;
  const TRACK_INTERVAL = 0.3;
  const prevHp = new Map();

  function trackWounds(dt) {
    checkTimer += dt;
    if (checkTimer < TRACK_INTERVAL) return;
    checkTimer = 0;
    if (!window.Entities || !Array.isArray(window.Entities.list)) return;
    const ents = window.Entities.list;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead) continue;
      const hp = e.hp !== undefined ? e.hp : 100;
      const maxHp = e.maxHp !== undefined ? e.maxHp : 100;
      const prev = prevHp.get(e);
      if (prev !== undefined) {
        const loss = prev - hp;
        const frac = loss / maxHp;
        if (frac >= 0.2) {
          const m = e.mesh;
          if (m) spawn(m.position.x, m.position.z, frac * 1.5);
        }
      }
      prevHp.set(e, hp);
    }
    const currentIds = new Set(ents);
    for (const key of prevHp.keys()) {
      if (!currentIds.has(key)) prevHp.delete(key);
    }
  }

  function update(dt) {
    trackWounds(dt);

    for (let i = 0; i < pools.length; i++) {
      const p = pools[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      if (p.life < FADE_IN_TIME) {
        p.mesh.material.opacity = (p.life / FADE_IN_TIME) * 0.7;
      } else if (p.life < FADE_IN_TIME + GROW_TIME) {
        p.mesh.material.opacity = 0.7;
        const growP = (p.life - FADE_IN_TIME) / GROW_TIME;
        const eased = 1 - (1 - growP) * (1 - growP);
        p.mesh.scale.setScalar(0.2 + (p.targetRadius - 0.2) * eased);
      } else {
        p.mesh.material.opacity = 0.7;
        p.mesh.scale.setScalar(p.targetRadius);
      }
    }

    for (let i = 0; i < splats.length; i++) {
      const s = splats[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
      } else {
        s.mesh.material.opacity = Math.min(s.mesh.material.opacity, s.life * 1.5);
      }
    }
  }

  function reset() {
    for (const p of pools) {
      p.active = false;
      p.mesh.visible = false;
    }
    for (const s of splats) {
      s.active = false;
      s.mesh.visible = false;
    }
    prevHp.clear();
  }

  window.BloodPools = { spawn, update, reset };
  return { spawn, update, reset };
})();