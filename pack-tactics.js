// pack-tactics.js — FORESTWAR deer swarm coordination: clustering near a shared target grants stacking pack bonuses
const THREE = window.THREE;
const SCENE = window.SCENE;
const PackTactics = (() => {
  const SCAN_INTERVAL = 0.3;
  const PACK_RADIUS = 9;
  const PACK_MIN = 2;
  const PACK_MAX_BONUS = 4;
  const DMG_PER = 0.06;
  const FIRERATE_PER = 0.08;
  const SPEED_PER = 0.04;
  const AURA_MAX_OPACITY = 0.35;
  const AURA_BASE_RADIUS = 0.6;

  const state = {
    scanT: 0,
    time: 0,
    buffedCount: 0,
  };

  const AURA_GEO = new THREE.SphereGeometry(1, 8, 6);
  const AURA_MAT = new THREE.MeshBasicMaterial({
    color: 0xff7722,
    transparent: true,
    opacity: 0,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const POOL = 60;
  const auras = [];
  for (let i = 0; i < POOL; i++) {
    const m = new THREE.Mesh(AURA_GEO, AURA_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    auras.push({ mesh: m, ent: null, active: false });
  }
  let auraIdx = 0;

  function assignAura(ent) {
    for (let i = 0; i < auras.length; i++) {
      if (auras[i].ent === ent) return auras[i];
    }
    const slot = auras[auraIdx];
    auraIdx = (auraIdx + 1) % POOL;
    slot.ent = ent;
    slot.active = true;
    slot.mesh.visible = true;
    return slot;
  }

  function releaseAura(ent) {
    for (let i = 0; i < auras.length; i++) {
      if (auras[i].ent === ent) {
        auras[i].ent = null;
        auras[i].active = false;
        auras[i].mesh.visible = false;
      }
    }
  }

  function getAura(ent) {
    for (let i = 0; i < auras.length; i++) {
      if (auras[i].ent === ent) return auras[i];
    }
    return null;
  }

  function getDeer() {
    if (!window.Entities || !Array.isArray(window.Entities.list)) return [];
    const out = [];
    for (let i = 0; i < window.Entities.list.length; i++) {
      const e = window.Entities.list[i];
      if (!e.dead && e.team === 'deer') out.push(e);
    }
    return out;
  }

  function countNearby(x, z, list) {
    const r2 = PACK_RADIUS * PACK_RADIUS;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const m = list[i].mesh;
      if (!m) continue;
      const dx = m.position.x - x;
      const dz = m.position.z - z;
      if (dx * dx + dz * dz <= r2) n++;
    }
    return n;
  }

  function getBuff(ent) {
    if (!ent) return 1;
    return ent._packBuff || 1;
  }

  function getDamageMult(ent) {
    const lvl = getBuff(ent);
    if (lvl <= 1) return 1;
    return 1 + (lvl - 1) * DMG_PER;
  }

  function getFireRateMult(ent) {
    const lvl = getBuff(ent);
    if (lvl <= 1) return 1;
    const bonus = (lvl - 1) * FIRERATE_PER;
    return 1 / (1 + bonus);
  }

  function getSpeedMult(ent) {
    const lvl = getBuff(ent);
    if (lvl <= 1) return 1;
    return 1 + (lvl - 1) * SPEED_PER;
  }

  function scan() {
    const deer = getDeer();
    state.buffedCount = 0;
    const active = new Set();

    for (let i = 0; i < deer.length; i++) {
      const e = deer[i];
      const m = e.mesh;
      if (!m) {
        e._packBuff = 1;
        continue;
      }
      const nearby = Math.min(countNearby(m.position.x, m.position.z, deer), PACK_MAX_BONUS + 1);
      const lvl = nearby >= PACK_MIN ? Math.min(nearby - 1, PACK_MAX_BONUS) : 1;
      e._packBuff = lvl;
      if (lvl > 1) {
        active.add(e);
        state.buffedCount++;
      }
    }

    for (let i = 0; i < auras.length; i++) {
      const a = auras[i];
      if (a.ent && (!active.has(a.ent) || a.ent.dead)) {
        a.ent = null;
        a.active = false;
        a.mesh.visible = false;
      }
    }

    active.forEach((ent) => {
      const a = assignAura(ent);
      const lvl = ent._packBuff;
      a.mesh.material.opacity = AURA_MAX_OPACITY * Math.min(lvl / PACK_MAX_BONUS, 1);
      const r = AURA_BASE_RADIUS + lvl * 0.12;
      a.mesh.scale.setScalar(r);
      a.mesh.position.copy(ent.mesh.position);
      a.mesh.position.y += 0.9;
    });
  }

  function update(dt) {
    state.time += dt;
    state.scanT -= dt;
    if (state.scanT <= 0) {
      state.scanT = SCAN_INTERVAL;
      scan();
    }

    for (let i = 0; i < auras.length; i++) {
      const a = auras[i];
      if (!a.active || !a.ent || a.ent.dead) continue;
      const m = a.ent.mesh;
      if (!m) continue;
      a.mesh.position.x = m.position.x;
      a.mesh.position.z = m.position.z;
      a.mesh.position.y = m.position.y + 0.9;
      const pulse = 0.75 + 0.25 * Math.sin(state.time * 6 + i * 0.7);
      a.mesh.material.opacity *= 1;
      const targetOpacity = AURA_MAX_OPACITY * Math.min(a.ent._packBuff / PACK_MAX_BONUS, 1) * pulse;
      a.mesh.material.opacity = a.mesh.material.opacity * 0.7 + targetOpacity * 0.3;
    }
  }

  function reset() {
    for (let i = 0; i < auras.length; i++) {
      auras[i].ent = null;
      auras[i].active = false;
      auras[i].mesh.visible = false;
    }
    state.buffedCount = 0;
    state.scanT = 0;
  }

  function onEntityDead(ent) {
    if (!ent) return;
    releaseAura(ent);
    ent._packBuff = 1;
  }

  return { update, reset, scan, getDamageMult, getFireRateMult, getSpeedMult, getBuff, onEntityDead, state };
})();
window.PackTactics = PackTactics;