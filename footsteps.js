// footsteps.js — FORESTWAR player footstep system: surface dust particles, step-synced sounds, landing impact
const THREE = window.THREE;
const SCENE = window.SCENE;
const Footsteps = (() => {
  const STEP_INTERVAL_WALK = 0.42;
  const STEP_INTERVAL_SPRINT = 0.28;
  const STEP_INTERVAL_CROUCH = 0.62;
  const LANDING_THRESHOLD = 5.5;
  const LANDING_PARTICLES = 12;
  const STEP_PARTICLES = 4;
  const DUST_LIFE = 0.45;
  const DUST_RISE = 1.4;
  const DUST_SPREAD = 0.9;
  const POOL_SIZE = 60;

  const DUST_GEO = new THREE.SphereGeometry(0.14, 5, 4);
  const DUST_MAT = new THREE.MeshBasicMaterial({ color: 0x8a7a5a, transparent: true, opacity: 0, depthWrite: false });

  const pool = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const mesh = new THREE.Mesh(DUST_GEO, DUST_MAT.clone());
    mesh.visible = false;
    mesh.frustumCulled = false;
    SCENE.add(mesh);
    pool.push({ mesh, life: 0, maxLife: DUST_LIFE, vx: 0, vy: 0, vz: 0, active: false });
  }
  let poolIdx = 0;

  const RING_GEO = new THREE.RingGeometry(0.15, 0.4, 12);
  const RING_MAT = new THREE.MeshBasicMaterial({ color: 0xb0a080, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const rings = [];
  for (let i = 0; i < 8; i++) {
    const ring = new THREE.Mesh(RING_GEO, RING_MAT.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    ring.frustumCulled = false;
    SCENE.add(ring);
    rings.push({ mesh: ring, life: 0, active: false });
  }
  let ringIdx = 0;

  const state = {
    stepTimer: 0,
    wasGround: true,
    prevVelY: 0,
  };

  const _stepPos = new THREE.Vector3();
  const _camForward = new THREE.Vector3();

  function getGroundY(x, z) {
    if (typeof window.groundHeight === 'function') return window.groundHeight(x, z);
    return 0;
  }

  function spawnDust(x, y, z, count, power) {
    for (let i = 0; i < count; i++) {
      const slot = pool[poolIdx];
      poolIdx = (poolIdx + 1) % POOL_SIZE;
      const ang = Math.random() * Math.PI * 2;
      const spd = (0.3 + Math.random() * 0.7) * DUST_SPREAD * power;
      slot.vx = Math.cos(ang) * spd;
      slot.vy = DUST_RISE * power * (0.5 + Math.random() * 0.6);
      slot.vz = Math.sin(ang) * spd;
      slot.mesh.position.set(x + slot.vx * 0.05, y, z + slot.vz * 0.05);
      const sc = 0.5 + Math.random() * 0.6;
      slot.mesh.scale.setScalar(sc);
      const shade = 0.45 + Math.random() * 0.25;
      slot.mesh.material.color.setRGB(shade + 0.2, shade + 0.1, shade);
      slot.mesh.material.opacity = 0.6;
      slot.mesh.visible = true;
      slot.life = DUST_LIFE * (0.7 + Math.random() * 0.6);
      slot.maxLife = slot.life;
      slot.active = true;
    }
  }

  function spawnRing(x, y, z, power) {
    const slot = rings[ringIdx];
    ringIdx = (ringIdx + 1) % rings.length;
    slot.mesh.position.set(x, y + 0.03, z);
    slot.mesh.scale.setScalar(0.3 * power);
    slot.mesh.material.opacity = 0.5;
    slot.mesh.visible = true;
    slot.life = 0.35;
    slot.active = true;
  }

  function playStepSound(sprinting, crouching) {
    if (!window.Sound || !window.Sound.tone) return;
    const freq = sprinting ? 90 + Math.random() * 20 : crouching ? 55 + Math.random() * 10 : 70 + Math.random() * 15;
    const dur = sprinting ? 0.08 : 0.06;
    const vol = crouching ? 0.05 : sprinting ? 0.12 : 0.08;
    window.Sound.tone(freq, dur, 'triangle', vol, 900);
    if (window.Sound.resume) window.Sound.resume();
  }

  function playLandSound(impact) {
    if (!window.Sound || !window.Sound.tone) return;
    const vol = Math.min(0.22, 0.08 + impact * 0.02);
    window.Sound.tone(50, 0.14, 'sine', vol, 500);
    window.Sound.tone(80, 0.1, 'triangle', vol * 0.6, 700);
    if (window.Sound.resume) window.Sound.resume();
  }

  function tryStep(dt) {
    const p = window.Player ? window.Player.state : null;
    if (!p || !p.locked) { state.stepTimer = 0; return; }
    if (!p.onGround) { state.stepTimer = 0; state.prevVelY = p.vel.y; return; }
    const cam = window.CAMERA;
    if (!cam) return;
    const vel = p.vel;
    const horizSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    if (horizSpeed < 0.6) { state.stepTimer = 0; return; }
    const interval = p.crouching ? STEP_INTERVAL_CROUCH : (p.sprinting ? STEP_INTERVAL_SPRINT : STEP_INTERVAL_WALK);
    state.stepTimer += dt;
    if (state.stepTimer < interval) return;
    state.stepTimer = 0;
    cam.getWorldDirection(_camForward);
    _camForward.y = 0;
    _camForward.normalize();
    _stepPos.set(cam.position.x - _camForward.x * 0.3, 0, cam.position.z - _camForward.z * 0.3);
    _stepPos.y = getGroundY(_stepPos.x, _stepPos.z);
    const power = p.crouching ? 0.5 : (p.sprinting ? 1.3 : 0.85);
    spawnDust(_stepPos.x, _stepPos.y, _stepPos.z, STEP_PARTICLES, power);
    spawnRing(_stepPos.x, _stepPos.y, _stepPos.z, power);
    playStepSound(p.sprinting, p.crouching);
  }

  function checkLanding() {
    const p = window.Player ? window.Player.state : null;
    if (!p) return;
    const isGround = p.onGround;
    if (!state.wasGround && isGround) {
      const impact = Math.abs(state.prevVelY);
      if (impact > LANDING_THRESHOLD) {
        const cam = window.CAMERA;
        if (cam) {
          const gy = getGroundY(cam.position.x, cam.position.z);
          const power = Math.min(2.0, impact / LANDING_THRESHOLD);
          spawnDust(cam.position.x, gy, cam.position.z, LANDING_PARTICLES, power);
          spawnRing(cam.position.x, gy, cam.position.z, power);
          playLandSound(impact);
        }
      }
    }
    state.wasGround = isGround;
    state.prevVelY = p.vel.y;
  }

  function updateParticles(dt) {
    for (let i = 0; i < pool.length; i++) {
      const d = pool[i];
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.mesh.visible = false;
        d.active = false;
        continue;
      }
      const t = d.life / d.maxLife;
      d.vy -= 6 * dt;
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += d.vz * dt;
      const gy = getGroundY(d.mesh.position.x, d.mesh.position.z);
      if (d.mesh.position.y < gy) { d.mesh.position.y = gy; d.vy = 0; d.vx *= 0.5; d.vz *= 0.5; }
      d.mesh.material.opacity = t * 0.6;
      const grow = 1 + (1 - t) * 0.8;
      d.mesh.scale.setScalar(grow);
    }
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.mesh.visible = false;
        r.active = false;
        continue;
      }
      const t = r.life / 0.35;
      r.mesh.material.opacity = t * 0.5;
      const expand = 1 + (1 - t) * 2.5;
      r.mesh.scale.setScalar(expand * 0.3);
    }
  }

  function update(dt) {
    const clamped = Math.min(dt, 0.05);
    tryStep(clamped);
    checkLanding();
    updateParticles(clamped);
  }

  return { update, init: () => {} };
})();
window.Footsteps = Footsteps;