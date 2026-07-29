// suppression.js — FORESTWAR suppression: firing near enemies pins them, slows movement, reduces their fire rate
const THREE = window.THREE;
const SCENE = window.SCENE;
const Suppression = (() => {
  const MAX_SUPPRESSION = 100;
  const DECAY_RATE = 14;
  const THRESHOLD_PINNED = 65;
  const THRESHOLD_STRESSED = 30;
  const SPEED_MULT_PINNED = 0.35;
  const SPEED_MULT_STRESSED = 0.7;
  const FIRERATE_MULT_PINNED = 0.4;
  const FIRERATE_MULT_STRESSED = 0.75;
  const BULLET_PRESSURE = 18;
  const EXPLOSION_PRESSURE = 45;
  const ARTILLERY_PRESSURE = 55;
  const RAM_PRESSURE = 35;
  const NEAR_MISS_RADIUS = 4.5;
  const NEAR_MISS_FALL = 2.5;

  const AURA_GEO = new THREE.SphereGeometry(0.6, 8, 6);
  const AURA_MAT_STRESSED = new THREE.MeshBasicMaterial({ color: 0xff8822, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false });
  const AURA_MAT_PINNED = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false });
  const RING_GEO = new THREE.RingGeometry(0.5, 0.7, 16);
  const RING_MAT = new THREE.MeshBasicMaterial({ color: 0xff4422, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });

  const overlays = [];
  const OVERLAY_POOL = 40;
  for (let i = 0; i < OVERLAY_POOL; i++) {
    const aura = new THREE.Mesh(AURA_GEO, AURA_MAT_STRESSED.clone());
    aura.visible = false;
    aura.frustumCulled = false;
    SCENE.add(aura);
    const ring = new THREE.Mesh(RING_GEO, RING_MAT.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    ring.frustumCulled = false;
    SCENE.add(ring);
    overlays.push({ aura, ring, target: null });
  }

  const _tmp = new THREE.Vector3();

  function getEntities() {
    if (window.Entities && Array.isArray(window.Entities.list)) return window.Entities.list;
    return [];
  }

  function getPlayerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function applyNearMiss(bulletX, bulletZ, shooterTeam) {
    const ents = getEntities();
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.team === shooterTeam) continue;
      const m = e.mesh;
      if (!m) continue;
      const dx = m.position.x - bulletX;
      const dz = m.position.z - bulletZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > NEAR_MISS_RADIUS) continue;
      const falloff = 1 - dist / NEAR_MISS_RADIUS;
      const amount = BULLET_PRESSURE * falloff;
      addSuppression(e, amount);
    }
  }

  function applyExplosion(x, z, radius, basePressure) {
    const ents = getEntities();
    const r2 = radius * radius;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead) continue;
      const m = e.mesh;
      if (!m) continue;
      const dx = m.position.x - x;
      const dz = m.position.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      const falloff = 1 - Math.sqrt(d2) / radius;
      addSuppression(e, basePressure * falloff);
    }
  }

  function addSuppression(entity, amount) {
    if (!entity) return;
    if (entity.team === getPlayerTeam()) {
      const kr = (window.Killstreak && window.Killstreak.getSuppressionResist) ? window.Killstreak.getSuppressionResist() : 0;
      amount *= (1 - kr);
    }
    entity.suppression = Math.min(MAX_SUPPRESSION, (entity.suppression || 0) + amount);
    entity.lastSuppressedAt = (entity.lastSuppressedAt || 0) + 1;
  }

  function getSpeedMult(entity) {
    if (!entity || entity.dead) return 1;
    const s = entity.suppression || 0;
    if (s >= THRESHOLD_PINNED) return SPEED_MULT_PINNED;
    if (s >= THRESHOLD_STRESSED) {
      const t = (s - THRESHOLD_STRESSED) / (THRESHOLD_PINNED - THRESHOLD_STRESSED);
      return SPEED_MULT_STRESSED + (SPEED_MULT_PINNED - SPEED_MULT_STRESSED) * t;
    }
    if (s > 0) {
      const t = s / THRESHOLD_STRESSED;
      return 1 - (1 - SPEED_MULT_STRESSED) * t;
    }
    return 1;
  }

  function getFireRateMult(entity) {
    if (!entity || entity.dead) return 1;
    const s = entity.suppression || 0;
    if (s >= THRESHOLD_PINNED) return FIRERATE_MULT_PINNED;
    if (s >= THRESHOLD_STRESSED) {
      const t = (s - THRESHOLD_STRESSED) / (THRESHOLD_PINNED - THRESHOLD_STRESSED);
      return FIRERATE_MULT_STRESSED + (FIRERATE_MULT_PINNED - FIRERATE_MULT_STRESSED) * t;
    }
    if (s > 0) {
      const t = s / THRESHOLD_STRESSED;
      return 1 - (1 - FIRERATE_MULT_STRESSED) * t;
    }
    return 1;
  }

  function isPinned(entity) {
    return entity && !entity.dead && (entity.suppression || 0) >= THRESHOLD_PINNED;
  }

  function isStressed(entity) {
    return entity && !entity.dead && (entity.suppression || 0) >= THRESHOLD_STRESSED;
  }

  function update(dt) {
    const ents = getEntities();
    let oi = 0;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead) continue;
      if (e.suppression && e.suppression > 0) {
        e.suppression = Math.max(0, e.suppression - DECAY_RATE * dt);
        if (e.suppression < 0.5) e.suppression = 0;
      }
      if (oi >= OVERLAY_POOL) continue;
      const s = e.suppression || 0;
      if (s < 1) continue;
      const o = overlays[oi++];
      o.target = e;
      const m = e.mesh;
      if (!m) continue;
      o.aura.position.copy(m.position);
      o.aura.position.y += 1.0;
      o.ring.position.set(m.position.x, m.position.y + 0.15, m.position.z);
      const t = s / MAX_SUPPRESSION;
      const pulse = 0.8 + 0.2 * Math.sin(performance.now() * 0.008);
      if (s >= THRESHOLD_PINNED) {
        o.aura.material.color.setHex(0xff2200);
        o.aura.material.opacity = 0.35 * t * pulse;
        o.ring.material.color.setHex(0xff2222);
        o.ring.material.opacity = 0.6 * t * pulse;
      } else if (s >= THRESHOLD_STRESSED) {
        o.aura.material.color.setHex(0xff8822);
        o.aura.material.opacity = 0.22 * t * pulse;
        o.ring.material.color.setHex(0xff8822);
        o.ring.material.opacity = 0.4 * t * pulse;
      } else {
        o.aura.material.opacity = 0.1 * t;
        o.ring.material.opacity = 0.15 * t;
      }
      const auraScale = 1.0 + t * 0.5;
      o.aura.scale.setScalar(auraScale);
      o.ring.scale.setScalar(0.8 + t * 0.6);
      o.aura.visible = true;
      o.ring.visible = true;
    }
    for (let i = oi; i < OVERLAY_POOL; i++) {
      if (!overlays[i].target) break;
      overlays[i].target = null;
      overlays[i].aura.visible = false;
      overlays[i].ring.visible = false;
    }
  }

  function init() {
    if (window.Manager && window.Manager.registerUpdate) {
      window.Manager.registerUpdate(update);
    }
  }

  return { init, update, applyNearMiss, applyExplosion, addSuppression, getSpeedMult, getFireRateMult, isPinned, isStressed, applyExplosion };
})();

window.Suppression = Suppression;