// sprint-fx.js — FORESTWAR sprint trail FX: kicks up dust particles while sprinting, stronger on direction change
const THREE = window.THREE;
const SCENE = window.SCENE;
const SprintFX = (() => {
  const MIN_SPEED = 6.5;
  const MAX_SPEED = 14;
  const BASE_INTERVAL = 0.09;
  const TURN_BOOST = 2.5;
  const POOL_SIZE = 80;
  const DUST_LIFE = 0.55;
  const DUST_RISE = 2.0;
  const DUST_SPREAD = 1.6;
  const LANDING_BURST = 10;

  const DUST_GEO = new THREE.SphereGeometry(0.18, 5, 4);
  const DUST_MAT = new THREE.MeshBasicMaterial({
    color: 0x9a8a6a, transparent: true, opacity: 0,
    depthWrite: false,
  });

  const pool = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const mat = DUST_MAT.clone();
    const mesh = new THREE.Mesh(DUST_GEO, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    SCENE.add(mesh);
    pool.push({
      mesh, mat, life: 0, maxLife: DUST_LIFE,
      vx: 0, vy: 0, vz: 0, baseScale: 1, active: false,
    });
  }
  let idx = 0;

  const RING_GEO = new THREE.RingGeometry(0.12, 0.35, 12);
  const RING_MAT = new THREE.MeshBasicMaterial({
    color: 0xb0a080, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const rings = [];
  for (let i = 0; i < 12; i++) {
    const ring = new THREE.Mesh(RING_GEO, RING_MAT.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    ring.frustumCulled = false;
    SCENE.add(ring);
    rings.push({ mesh: ring, life: 0, maxLife: 0.3, active: false });
  }
  let ringIdx = 0;

  const state = {
    timer: 0,
    prevPos: new THREE.Vector3(),
    prevYaw: 0,
    prevOnGround: true,
    prevVelY: 0,
    prevSpeed: 0,
    init: false,
  };

  const _curPos = new THREE.Vector3();
  const _fwd = new THREE.Vector3();

  function spawnDust(x, y, z, intensity) {
    const slot = pool[idx];
    idx = (idx + 1) % POOL_SIZE;
    const ang = Math.random() * Math.PI * 2;
    const spd = (0.4 + Math.random() * 0.8) * DUST_SPREAD * intensity;
    slot.vx = Math.cos(ang) * spd;
    slot.vy = DUST_RISE * intensity * (0.5 + Math.random() * 0.6);
    slot.vz = Math.sin(ang) * spd;
    slot.mesh.position.set(x + slot.vx * 0.06, y, z + slot.vz * 0.06);
    const sc = 0.4 + Math.random() * 0.7;
    slot.baseScale = sc;
    slot.mesh.scale.setScalar(sc);
    const shade = 0.5 + Math.random() * 0.25;
    slot.mat.color.setRGB(shade + 0.15, shade + 0.08, shade * 0.85);
    slot.mat.opacity = 0.65 * intensity;
    slot.life = DUST_LIFE;
    slot.maxLife = DUST_LIFE;
    slot.mesh.visible = true;
    slot.active = true;
  }

  function spawnRing(x, y, z, intensity) {
    const slot = rings[ringIdx];
    ringIdx = (ringIdx + 1) % rings.length;
    slot.mesh.position.set(x, y + 0.04, z);
    slot.mesh.scale.setScalar(0.3 + intensity * 0.3);
    slot.mesh.material.opacity = 0.4 * intensity;
    slot.life = 0;
    slot.maxLife = 0.3;
    slot.mesh.visible = true;
    slot.active = true;
  }

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function update(dt) {
    const cam = window.CAMERA;
    const player = window.Player;
    if (!cam || !player || !player.state) return;

    const ps = player.state;
    const ms = window.Manager && window.Manager.state ? window.Manager.state : null;
    if (ms && ms.phase !== 'playing') {
      state.init = false;
      return;
    }

    if (!state.init) {
      state.prevPos.copy(cam.position);
      state.prevYaw = ps.yaw;
      state.prevOnGround = ps.onGround;
      state.prevVelY = ps.vel ? ps.vel.y : 0;
      state.prevSpeed = 0;
      state.init = true;
    }

    const dx = cam.position.x - state.prevPos.x;
    const dz = cam.position.z - state.prevPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const speed = dist / Math.max(dt, 0.001);

    const speedFrac = Math.max(0, Math.min(1, (speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)));

    const yawDelta = Math.abs(ps.yaw - state.prevYaw);
    const turnBoost = yawDelta > 0.005 ? 1 + Math.min(yawDelta * TURN_BOOST, 1.0) : 1.0;

    state.timer -= dt;
    if (speedFrac > 0 && ps.onGround && state.timer <= 0) {
      state.timer = BASE_INTERVAL / (0.3 + speedFrac * 0.7);
      const gy = groundY(cam.position.x, cam.position.z);
      const intensity = speedFrac * turnBoost;
      spawnDust(cam.position.x - dx * 0.5, gy, cam.position.z - dz * 0.5, Math.min(intensity, 1.5));
      if (intensity > 0.5) {
        spawnRing(cam.position.x - dx * 0.4, gy, cam.position.z - dz * 0.4, intensity);
      }
    }

    if (state.prevOnGround && !ps.onGround && state.prevVelY < -JUMP_DETECT) {
      const gy = groundY(cam.position.x, cam.position.z);
      for (let i = 0; i < LANDING_BURST; i++) {
        spawnDust(cam.position.x, gy, cam.position.z, 1.2);
      }
      spawnRing(cam.position.x, gy, cam.position.z, 1.5);
    }

    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        p.active = false;
        continue;
      }
      p.vy -= 9.0 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      const gy = groundY(p.mesh.position.x, p.mesh.position.z);
      if (p.mesh.position.y < gy) {
        p.mesh.position.y = gy;
        p.vy *= -0.2;
        p.vx *= 0.3;
        p.vz *= 0.3;
      }
      const lifeFrac = p.life / p.maxLife;
      p.mat.opacity = lifeFrac * 0.65;
      const grow = 1 + (1 - lifeFrac) * 2.5;
      p.mesh.scale.setScalar(p.baseScale * grow);
    }

    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      if (!r.active) continue;
      r.life += dt;
      if (r.life >= r.maxLife) {
        r.mesh.visible = false;
        r.active = false;
        continue;
      }
      const t = r.life / r.maxLife;
      const ease = 1 - (1 - t) * (1 - t);
      r.mesh.scale.setScalar((0.3 + ease * 2.0) * r.mesh.userData.baseScale || 1);
      r.mesh.material.opacity = (1 - t) * 0.4;
    }

    state.prevPos.copy(cam.position);
    state.prevYaw = ps.yaw;
    state.prevOnGround = ps.onGround;
    state.prevVelY = ps.vel ? ps.vel.y : 0;
    state.prevSpeed = speed;
  }

  function reset() {
    state.init = false;
    for (const p of pool) { p.active = false; p.mesh.visible = false; }
    for (const r of rings) { r.active = false; r.mesh.visible = false; }
  }

  window.SprintFX = { update, reset };
  return { update, reset };
})();