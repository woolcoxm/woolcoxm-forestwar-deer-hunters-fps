// ammo-drops.js — FORESTWAR ammo pouches: team-colored drops from kills that resupply the active weapon on pickup
const THREE = window.THREE;
const SCENE = window.SCENE;
const AmmoDrops = (() => {
  const MAX_DROPS = 24;
  const LIFETIME = 30;
  const BOB_FREQ = 2.5;
  const BOB_HEIGHT = 0.25;
  const SPIN_SPEED = 2.0;
  const PICKUP_RADIUS = 2.2;
  const MAGNET_RADIUS = 3.8;
  const MAGNET_SPEED = 10;
  const BEACON_HEIGHT = 7;
  const BEACON_FADE_START = 6;
  const PULSE_INTERVAL = 1.2;
  const GRANT_TABLE = [
    { slot: 0, grant: 30, label: 'RIFLE' },
    { slot: 1, grant: 2, label: 'ROCKET' },
    { slot: 2, grant: 3, label: 'GRENADE' },
    { slot: 4, grant: 3, label: 'SNIPER' },
    { slot: 3, grant: 5, label: 'DMR' },
  ];

  const POUCH_GEO = new THREE.BoxGeometry(0.4, 0.28, 0.32);
  const POUCH_MAT_DEER = new THREE.MeshStandardMaterial({ color: 0x8a6a34, roughness: 0.85, emissive: 0x332200, emissiveIntensity: 0.3 });
  const POUCH_MAT_HUNTER = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.85, emissive: 0x112233, emissiveIntensity: 0.3 });
  const FLAP_GEO = new THREE.BoxGeometry(0.42, 0.08, 0.18);
  const FLAP_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 });
  const BUCKLE_GEO = new THREE.BoxGeometry(0.1, 0.06, 0.04);
  const BUCKLE_MAT = new THREE.MeshStandardMaterial({ color: 0x999977, roughness: 0.4, metalness: 0.7 });
  const BULLET_GEO = new THREE.CylinderGeometry(0.03, 0.03, 0.12, 5);
  BULLET_GEO.rotateX(Math.PI / 2);
  const BULLET_MAT = new THREE.MeshStandardMaterial({ color: 0xddbb55, roughness: 0.4, metalness: 0.6 });
  const GLOW_GEO = new THREE.SphereGeometry(0.22, 8, 6);
  const GLOW_MAT_DEER = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  const GLOW_MAT_HUNTER = new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  const BEACON_GEO = new THREE.CylinderGeometry(0.08, 0.3, 1, 6, 1, true);
  const BEACON_MAT_DEER = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const BEACON_MAT_HUNTER = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const RING_GEO = new THREE.RingGeometry(0.3, 0.6, 16);
  const RING_MAT_DEER = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const RING_MAT_HUNTER = new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });

  const drops = [];
  for (let i = 0; i < MAX_DROPS; i++) {
    const mesh = new THREE.Group();
    const pouchMat = POUCH_MAT_DEER.clone();
    const pouch = new THREE.Mesh(POUCH_GEO, pouchMat);
    pouch.castShadow = true;
    mesh.add(pouch);
    const flap = new THREE.Mesh(FLAP_GEO, FLAP_MAT);
    flap.position.y = 0.16;
    mesh.add(flap);
    const buckle = new THREE.Mesh(BUCKLE_GEO, BUCKLE_MAT);
    buckle.position.set(0, 0.16, 0.18);
    mesh.add(buckle);
    for (let j = 0; j < 2; j++) {
      const bullet = new THREE.Mesh(BULLET_GEO, BULLET_MAT);
      bullet.position.set(-0.08 + j * 0.16, 0.05, 0.2);
      mesh.add(bullet);
    }
    const glow = new THREE.Mesh(GLOW_GEO, GLOW_MAT_DEER.clone());
    mesh.add(glow);
    const beacon = new THREE.Mesh(BEACON_GEO, BEACON_MAT_DEER.clone());
    beacon.position.y = BEACON_HEIGHT * 0.5;
    mesh.add(beacon);
    const ring = new THREE.Mesh(RING_GEO, RING_MAT_DEER.clone());
    ring.rotation.x = -Math.PI / 2;
    mesh.add(ring);
    mesh.visible = false;
    SCENE.add(mesh);
    drops.push({ mesh, pouch, glow, beacon, ring, x: 0, y: 0, z: 0, team: 'hunter', life: 0, bobPhase: 0, pulseT: 0, magnetizing: false, active: false });
  }
  let dropIdx = 0;

  const _camPos = new THREE.Vector3();
  const _diff = new THREE.Vector3();

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function spawn(x, z, team) {
    const slot = drops[dropIdx];
    dropIdx = (dropIdx + 1) % MAX_DROPS;
    slot.x = x;
    slot.z = z;
    slot.y = groundY(x, z) + 0.5;
    slot.team = team || 'hunter';
    slot.life = LIFETIME;
    slot.bobPhase = Math.random() * Math.PI * 2;
    slot.pulseT = 0;
    slot.magnetizing = false;
    slot.active = true;
    slot.mesh.position.set(slot.x, slot.y, slot.z);
    slot.mesh.rotation.y = Math.random() * Math.PI * 2;
    slot.mesh.visible = true;
    const isDeer = slot.team === 'deer';
    slot.pouch.material.copy(isDeer ? POUCH_MAT_DEER : POUCH_MAT_HUNTER);
    slot.glow.material.copy(isDeer ? GLOW_MAT_DEER : GLOW_MAT_HUNTER);
    slot.beacon.material.copy(isDeer ? BEACON_MAT_DEER : BEACON_MAT_HUNTER);
    slot.ring.material.copy(isDeer ? RING_MAT_DEER : RING_MAT_HUNTER);
  }

  function tryPickup(slot) {
    const w = window.Weapons;
    if (!w || !w.state || !w.state.active) return false;
    const activeSlot = w.state.slot;
    let grantEntry = null;
    for (let i = 0; i < GRANT_TABLE.length; i++) {
      if (GRANT_TABLE[i].slot === activeSlot) { grantEntry = GRANT_TABLE[i]; break; }
    }
    if (!grantEntry) return false;
    const slotState = w.state.slots[activeSlot];
    if (!slotState) return false;
    if (slotState.totalAmmo !== undefined && slotState.totalAmmo >= (slotState.magSize * 6)) return false;
    if (slotState.totalAmmo !== undefined) {
      slotState.totalAmmo = Math.min(slotState.totalAmmo + grantEntry.grant, slotState.magSize * 8);
    }
    if (window.FX && window.FX.message) {
      window.FX.message(grantEntry.label + ' +' + grantEntry.grant, slot.team === 'deer' ? '#ffcc44' : '#66aaff');
    }
    if (window.Sound) {
      window.Sound.tone(880, 0.08, 'square', 0.15, 2000);
      window.Sound.tone(1320, 0.1, 'sine', 0.1, 2400);
    }
    slot.active = false;
    slot.mesh.visible = false;
    return true;
  }

  function update(dt) {
    if (!window.CAMERA) return;
    _camPos.copy(window.CAMERA.position);
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (!d.active) continue;
      d.life -= dt;
      d.bobPhase += dt * BOB_FREQ;
      d.pulseT -= dt;
      if (d.pulseT <= 0) {
        d.pulseT = PULSE_INTERVAL;
        d.ring.material.opacity = 0.7;
        d.ring.scale.setScalar(1);
      }
      const bob = Math.sin(d.bobPhase) * BOB_HEIGHT;
      d.mesh.position.y = d.y + bob;
      d.mesh.rotation.y += dt * SPIN_SPEED;
      d.ring.material.opacity = Math.max(0, d.ring.material.opacity - dt * 1.2);
      d.ring.scale.x += dt * 3;
      d.ring.scale.y = d.ring.scale.x;
      d.ring.scale.z = d.ring.scale.x;
      _diff.set(_camPos.x - d.mesh.position.x, 0, _camPos.z - d.mesh.position.z);
      const flatDist = _diff.length();
      if (flatDist < PICKUP_RADIUS) {
        if (tryPickup(d)) continue;
      }
      if (flatDist < MAGNET_RADIUS) {
        d.magnetizing = true;
      } else {
        d.magnetizing = false;
      }
      if (d.magnetizing && flatDist > 0.1) {
        _diff.divideScalar(flatDist);
        const pull = MAGNET_SPEED * dt * (1 - flatDist / MAGNET_RADIUS);
        d.mesh.position.x += _diff.x * pull;
        d.mesh.position.z += _diff.z * pull;
      }
      const fadeIn = d.life > LIFETIME - 0.5 ? (LIFETIME - d.life) / 0.5 : 1;
      const fadeOut = d.life < BEACON_FADE_START ? d.life / BEACON_FADE_START : 1;
      const visibility = Math.min(fadeIn, fadeOut);
      d.beacon.material.opacity = 0.3 * visibility;
      d.beacon.scale.y = BEACON_HEIGHT;
      d.glow.material.opacity = 0.6 * visibility * (0.6 + Math.sin(d.bobPhase * 2) * 0.4);
      if (d.life <= 0) {
        d.active = false;
        d.mesh.visible = false;
      }
    }
  }

  function reset() {
    for (let i = 0; i < drops.length; i++) {
      drops[i].active = false;
      drops[i].mesh.visible = false;
    }
  }

  window.AmmoDrops = { spawn, update, reset };
  return { spawn, update, reset };
})();