// fire-propagation.js — FORESTWAR wildfire system: trees ignite from explosions and spread to neighbors
const THREE = window.THREE;
const SCENE = window.SCENE;
const Fire = (() => {
  const IGNITE_RADIUS = 7;
  const SPREAD_RADIUS = 6.5;
  const SPREAD_INTERVAL = 1.2;
  const SPREAD_CHANCE = 0.18;
  const BURN_DURATION = 25;
  const BURNOUT_DURATION = 4;
  const EMBER_RISE = 4.5;
  const ENTITY_DAMAGE_RADIUS = 3.5;
  const ENTITY_DPS = 12;
  const PLAYER_DPS = 6;
  const GLOW_RADIUS = 14;
  const FLAME_POOL_SIZE = 160;
  const EMBER_POOL_SIZE = 120;
  const MAX_BURNING = 22;
  // Persistent point lights stay in the scene forever, so keep this small to avoid
  // blowing the GPU's shader uniform limit (each light adds to the fragment program).
  const GLOW_LIGHTS = 10;

  const trees = [];
  const burning = [];

  const FLAME_GEO = new THREE.ConeGeometry(0.55, 2.0, 6);
  const FLAME_MAT_INNER = new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const FLAME_MAT_OUTER = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  const EMBER_GEO = new THREE.SphereGeometry(0.08, 4, 3);
  const EMBER_MAT = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const SMOKE_GEO = new THREE.SphereGeometry(0.6, 5, 4);
  const SMOKE_MAT = new THREE.MeshBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0, depthWrite: false });

  const flamePool = [];
  for (let i = 0; i < FLAME_POOL_SIZE; i++) {
    const inner = new THREE.Mesh(FLAME_GEO, FLAME_MAT_INNER.clone());
    inner.visible = false;
    inner.frustumCulled = false;
    SCENE.add(inner);
    const outer = new THREE.Mesh(FLAME_GEO, FLAME_MAT_OUTER.clone());
    outer.visible = false;
    outer.frustumCulled = false;
    SCENE.add(outer);
    flamePool.push({ inner, outer, tree: null, active: false });
  }

  const emberPool = [];
  for (let i = 0; i < EMBER_POOL_SIZE; i++) {
    const mesh = new THREE.Mesh(EMBER_GEO, EMBER_MAT.clone());
    mesh.visible = false;
    mesh.frustumCulled = false;
    SCENE.add(mesh);
    emberPool.push({ mesh, life: 0, maxLife: 0, vx: 0, vy: 0, vz: 0, active: false });
  }

  const smokePool = [];
  for (let i = 0; i < 40; i++) {
    const mesh = new THREE.Mesh(SMOKE_GEO, SMOKE_MAT.clone());
    mesh.visible = false;
    mesh.frustumCulled = false;
    SCENE.add(mesh);
    smokePool.push({ mesh, life: 0, maxLife: 0, active: false });
  }

  const glowPool = [];
  for (let i = 0; i < GLOW_LIGHTS; i++) {
    const light = new THREE.PointLight(0xff6600, 0, GLOW_RADIUS, 2);
    SCENE.add(light);
    glowPool.push(light);
  }
  let glowIdx = 0;

  let flameIdx = 0;
  let emberIdx = 0;
  let smokeIdx = 0;
  let time = 0;

  function init() {
    const t = window.TREES;
    if (!t || !Array.isArray(t)) return;
    for (let i = 0; i < t.length; i++) {
      trees.push({ ref: t[i], index: i, state: 'intact', burnTime: 0, spreadTimer: 0, flicker: Math.random() * 10 });
    }
  }

  function getTreeData(idx) {
    for (let i = 0; i < trees.length; i++) {
      if (trees[i].index === idx) return trees[i];
    }
    return null;
  }

  function igniteAt(x, z, radius) {
    const r2 = radius * radius;
    for (let i = 0; i < trees.length; i++) {
      const td = trees[i];
      if (td.state !== 'intact') continue;
      const t = td.ref;
      const dx = t.x - x, dz = t.z - z;
      if (dx * dx + dz * dz <= r2) {
        igniteTree(td);
      }
    }
  }

  function igniteTree(td) {
    if (!td || td.state !== 'intact') return;
    if (burning.length >= MAX_BURNING) return;
    td.state = 'burning';
    td.burnTime = BURN_DURATION;
    td.spreadTimer = SPREAD_INTERVAL * (0.5 + Math.random());
    burning.push(td);
    const t = td.ref;
    if (window.FX && window.FX.burst) {
      window.FX.burst(new THREE.Vector3(t.x, t.r + 2, t.z), new THREE.Vector3(0, 1, 0), 0xff6600, 8);
    }
  }

  function spread(td) {
    const t = td.ref;
    for (let i = 0; i < trees.length; i++) {
      const other = trees[i];
      if (other.state !== 'intact') continue;
      if (other === td) continue;
      const ot = other.ref;
      const dx = ot.x - t.x, dz = ot.z - t.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > SPREAD_RADIUS * SPREAD_RADIUS) continue;
      if (Math.random() < SPREAD_CHANCE) {
        igniteTree(other);
        break;
      }
    }
  }

  function assignFlame(tree) {
    const slot = flamePool[flameIdx];
    flameIdx = (flameIdx + 1) % FLAME_POOL_SIZE;
    const t = tree.ref;
    const yOff = t.r * 0.3 + 1;
    slot.inner.visible = true;
    slot.inner.position.set(t.x, t.y + yOff, t.z);
    slot.inner.scale.set(0.9, 1.0 + Math.random() * 0.4, 0.9);
    slot.outer.visible = true;
    slot.outer.position.copy(slot.inner.position);
    slot.outer.scale.set(1.6, 1.8, 1.6);
    slot.tree = tree;
    slot.active = true;
    return slot;
  }

  function spawnEmber(x, y, z) {
    const slot = emberPool[emberIdx];
    emberIdx = (emberIdx + 1) % EMBER_POOL_SIZE;
    slot.mesh.visible = true;
    slot.mesh.position.set(x + (Math.random() - 0.5) * 1.5, y, z + (Math.random() - 0.5) * 1.5);
    slot.vx = (Math.random() - 0.5) * 2.5;
    slot.vy = EMBER_RISE * (0.5 + Math.random());
    slot.vz = (Math.random() - 0.5) * 2.5;
    slot.life = 0.8 + Math.random() * 0.6;
    slot.maxLife = slot.life;
    slot.active = true;
  }

  function spawnSmoke(x, y, z) {
    const slot = smokePool[smokeIdx];
    smokeIdx = (smokeIdx + 1) % smokePool.length;
    slot.mesh.visible = true;
    slot.mesh.position.set(x + (Math.random() - 0.5) * 0.8, y, z + (Math.random() - 0.5) * 0.8);
    slot.life = 1.5 + Math.random() * 0.8;
    slot.maxLife = slot.life;
    slot.active = true;
  }

  function getGlow() {
    const light = glowPool[glowIdx];
    glowIdx = (glowIdx + 1) % glowPool.length;
    return light;
  }

  function damageEntitiesNear(x, z, dt) {
    const ents = window.Entities && window.Entities.list;
    if (!ents) return;
    const r2 = ENTITY_DAMAGE_RADIUS * ENTITY_DAMAGE_RADIUS;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.team === 'none') continue;
      const m = e.mesh;
      if (!m) continue;
      const dx = m.position.x - x, dz = m.position.z - z;
      if (dx * dx + dz * dz <= r2) {
        // Entities expose takeDamage(dmg, srcPos) per-instance (no module-level damage()).
        // Omit srcPos so applyDamage skips its blood-burst vector math.
        if (e.takeDamage) e.takeDamage(ENTITY_DPS * dt);
      }
    }
    const cam = window.CAMERA;
    if (cam) {
      const dx = cam.position.x - x, dz = cam.position.z - z;
      if (dx * dx + dz * dz <= r2) {
        if (window.Manager && window.Manager.damagePlayer) {
          window.Manager.damagePlayer(PLAYER_DPS * dt);
        }
      }
    }
  }

  function update(dt) {
    time += dt;
    for (const f of flamePool) {
      if (!f.active) continue;
      f.tree = null;
      f.active = false;
      f.inner.visible = false;
      f.outer.visible = false;
    }

    const writeIdx = [];
    for (let i = 0; i < burning.length; i++) {
      const td = burning[i];
      if (td.state !== 'burning' && td.state !== 'burnout') continue;
      const t = td.ref;
      td.burnTime -= dt;
      td.flicker += dt;

      if (td.state === 'burning') {
        td.spreadTimer -= dt;
        if (td.spreadTimer <= 0) {
          td.spreadTimer = SPREAD_INTERVAL;
          spread(td);
        }
        if (td.burnTime <= 0) {
          td.state = 'burnout';
          td.burnTime = BURNOUT_DURATION;
          if (t.mesh && t.mesh.traverse) {
            t.mesh.traverse((child) => {
              if (child.material && child.material.color) {
                child.material.color.lerp(new THREE.Color(0x1a1a12), 0.7);
              }
            });
          }
        }
      } else if (td.state === 'burnout') {
        if (td.burnTime <= 0) {
          td.state = 'ash';
          continue;
        }
      }

      const flicker = 0.7 + Math.sin(td.flicker * 12) * 0.15 + Math.sin(td.flicker * 23) * 0.1;
      const slot = assignFlame(td);
      slot.inner.scale.multiplyScalar(flicker);
      slot.outer.scale.multiplyScalar(flicker);
      slot.inner.rotation.y = td.flicker * 2;
      slot.outer.rotation.y = -td.flicker * 1.5;
      if (td.state === 'burnout') {
        const fade = Math.max(0, td.burnTime / BURNOUT_DURATION);
        slot.inner.material.opacity = 0.85 * fade;
        slot.outer.material.opacity = 0.5 * fade;
      }

      if (td.state === 'burning' && Math.random() < 0.6) {
        spawnEmber(t.x, t.y + t.r * 0.5 + 1.5, t.z);
      }
      if (td.state === 'burning' && Math.random() < 0.25) {
        spawnSmoke(t.x, t.y + t.r * 0.6 + 2, t.z);
      }
      if (td.state === 'burning') {
        const glow = getGlow();
        glow.position.set(t.x, t.y + 4, t.z);
        glow.intensity = 2.5 * flicker;
        glow.distance = GLOW_RADIUS;
        damageEntitiesNear(t.x, t.z, dt);
      }

      writeIdx.push(i);
    }

    const stillBurning = [];
    for (let i = 0; i < burning.length; i++) {
      const td = burning[i];
      if (td.state === 'burning' || td.state === 'burnout') stillBurning.push(td);
    }
    burning.length = 0;
    for (let i = 0; i < stillBurning.length; i++) burning[i] = stillBurning[i];

    for (const glow of glowPool) {
      if (glow.intensity > 0) {
        glow.intensity *= 0.85;
        if (glow.intensity < 0.05) glow.intensity = 0;
      }
    }

    for (let i = 0; i < emberPool.length; i++) {
      const e = emberPool[i];
      if (!e.active) continue;
      e.life -= dt;
      if (e.life <= 0) {
        e.active = false;
        e.mesh.visible = false;
        continue;
      }
      e.vy -= 6 * dt;
      e.vx *= 0.96;
      e.vz *= 0.96;
      e.mesh.position.x += e.vx * dt;
      e.mesh.position.y += e.vy * dt;
      e.mesh.position.z += e.vz * dt;
      const lifeRatio = e.life / e.maxLife;
      e.mesh.material.opacity = lifeRatio;
      e.mesh.material.color.setHSL(0.08 * lifeRatio, 1, 0.4 + lifeRatio * 0.3);
      e.mesh.scale.setScalar(0.5 + lifeRatio * 0.8);
    }

    for (let i = 0; i < smokePool.length; i++) {
      const s = smokePool[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      const lifeRatio = s.life / s.maxLife;
      s.mesh.position.y += 2.5 * dt;
      s.mesh.position.x += (Math.random() - 0.5) * 0.5 * dt;
      s.mesh.position.z += (Math.random() - 0.5) * 0.5 * dt;
      s.mesh.material.opacity = lifeRatio * 0.35;
      const sc = 1 + (1 - lifeRatio) * 2.5;
      s.mesh.scale.setScalar(sc);
    }
  }

  function onExplosion(x, z, radius) {
    igniteAt(x, z, Math.min(radius, IGNITE_RADIUS));
  }

  function reset() {
    for (let i = 0; i < burning.length; i++) {
      const td = burning[i];
      td.state = 'intact';
      td.burnTime = 0;
      td.spreadTimer = 0;
    }
    burning.length = 0;
    for (const f of flamePool) {
      f.active = false;
      f.tree = null;
      f.inner.visible = false;
      f.outer.visible = false;
    }
    for (const e of emberPool) {
      e.active = false;
      e.mesh.visible = false;
    }
    for (const s of smokePool) {
      s.active = false;
      s.mesh.visible = false;
    }
    for (const g of glowPool) g.intensity = 0;
  }

  return { init, update, igniteAt, onExplosion, reset, get burningCount() { return burning.length; } };
})();
window.Fire = Fire;
export { Fire };