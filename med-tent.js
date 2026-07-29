// med-tent.js — FORESTWAR deployable medical tent: emits a healing aura to nearby allies and the player
const THREE = window.THREE;
const SCENE = window.SCENE;
const MedTent = (() => {
  const HEAL_RADIUS = 9;
  const HEAL_RATE_PLAYER = 9;
  const HEAL_RATE_ENTITY = 12;
  const STAMINA_COST = 50;
  const COOLDOWN = 32;
  const LIFETIME = 35;
  const RESPAAWN_BOOST = 0.25;
  const PULSE_INTERVAL = 0.5;
  const SCAN_INTERVAL = 0.2;
  const TENT_HP = 200;

  const state = {
    active: null,
    cd: 0,
    ready: true,
    scanTimer: 0,
    pulseTimer: 0,
    life: 0,
    hp: TENT_HP,
  };

  const CANVAS_GEO = new THREE.CylinderGeometry(1.8, 2.2, 1.6, 6, 1, true, 0, Math.PI);
  const CANVAS_MAT = new THREE.MeshStandardMaterial({
    color: 0xccdddd, roughness: 0.85, side: THREE.DoubleSide,
    emissive: 0x441a1a, emissiveIntensity: 0.2, flatShading: true,
  });
  const POLE_GEO = new THREE.CylinderGeometry(0.05, 0.05, 1.8, 5);
  const POLE_MAT = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.8 });
  const CROSS_GEO = new THREE.BoxGeometry(0.5, 0.14, 0.04);
  const CROSS_MAT = new THREE.MeshBasicMaterial({ color: 0xff3333 });
  const RING_GEO = new THREE.RingGeometry(HEAL_RADIUS - 0.5, HEAL_RADIUS, 48);
  const RING_MAT = new THREE.MeshBasicMaterial({
    color: 0x55ff77, transparent: true, opacity: 0.22,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const PULSE_GEO = new THREE.RingGeometry(0.5, 0.8, 32);
  const PULSE_MAT = new THREE.MeshBasicMaterial({
    color: 0x66ff88, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const SPARK_GEO = new THREE.SphereGeometry(0.1, 5, 4);
  const SPARK_MAT = new THREE.MeshBasicMaterial({
    color: 0x88ffaa, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });

  const pulses = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(PULSE_GEO, PULSE_MAT.clone());
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    pulses.push({ mesh: m, t: 0, active: false });
  }
  let pulseIdx = 0;

  const sparks = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vy: 0, active: false });
  }
  let sparkIdx = 0;

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function buildTent(x, z) {
    const gy = groundY(x, z);
    const g = new THREE.Group();
    g.position.set(x, gy, z);

    const canvas = new THREE.Mesh(CANVAS_GEO, CANVAS_MAT.clone());
    canvas.castShadow = true;
    canvas.position.y = 1.0;
    g.add(canvas);

    const entry = new THREE.Mesh(CANVAS_GEO, CANVAS_MAT.clone());
    entry.rotation.y = Math.PI;
    entry.position.y = 1.0;
    entry.visible = false;
    g.add(entry);

    for (const sx of [-1, 1]) {
      const pole = new THREE.Mesh(POLE_GEO, POLE_MAT);
      pole.position.set(sx * 1.8, 0.9, 0);
      pole.castShadow = true;
      g.add(pole);
    }
    const ridge = new THREE.Mesh(POLE_GEO, POLE_MAT);
    ridge.rotation.z = Math.PI / 2;
    ridge.scale.y = 2.0;
    ridge.position.y = 1.7;
    g.add(ridge);

    const crossV = new THREE.Mesh(CROSS_GEO, CROSS_MAT);
    crossV.position.set(0, 2.1, 0);
    g.add(crossV);
    const crossH = new THREE.Mesh(CROSS_GEO, CROSS_MAT);
    crossH.rotation.z = Math.PI / 2;
    crossH.position.set(0, 2.1, 0);
    g.add(crossH);

    const ring = new THREE.Mesh(RING_GEO, RING_MAT.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);

    SCENE.add(g);
    return { group: g, ring, crossV, crossH, hp: TENT_HP };
  }

  function deploy() {
    if (!state.ready) {
      if (window.FX) window.FX.message('MED TENT RECHARGING', '#ff6644');
      return false;
    }
    const player = window.Player;
    if (!player || !player.state) return false;
    if (player.state.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('INSUFFICIENT STAMINA', '#ff6644');
      return false;
    }
    if (state.active) removeTent();
    player.state.stamina -= STAMINA_COST;
    if (player.state.regenTimer !== undefined) player.state.regenTimer = 1.5;
    state.ready = false;
    state.cd = COOLDOWN;
    const cam = window.CAMERA;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const px = cam.position.x + fwd.x * 3.5;
    const pz = cam.position.z + fwd.z * 3.5;
    state.active = buildTent(px, pz);
    state.life = LIFETIME;
    state.hp = TENT_HP;
    state.scanTimer = 0;
    state.pulseTimer = 0;
    if (window.FX) window.FX.message('MED TENT DEPLOYED', '#55ff77');
    if (window.Sound) {
      window.Sound.tone(660, 0.12, 'sine', 0.25, 2000);
      window.Sound.tone(880, 0.16, 'sine', 0.22, 2400);
    }
    return true;
  }

  function removeTent() {
    if (!state.active) return;
    SCENE.remove(state.active.group);
    state.active = null;
  }

  function takeDamage(amount) {
    if (!state.active) return;
    state.hp -= amount;
    if (state.hp <= 0) {
      removeTent();
      if (window.FX) window.FX.message('MED TENT DESTROYED', '#ff4422');
      if (window.Sound) window.Sound.tone(150, 0.4, 'sawtooth', 0.3, 600);
    }
  }

  function spawnPulse(x, z) {
    const slot = pulses[pulseIdx];
    pulseIdx = (pulseIdx + 1) % pulses.length;
    const gy = groundY(x, z) + 0.1;
    slot.mesh.position.set(x, gy, z);
    slot.mesh.scale.setScalar(0.5);
    slot.mesh.material.opacity = 0.6;
    slot.mesh.visible = true;
    slot.t = 0;
    slot.active = true;
  }

  function spawnHealSpark(x, z) {
    const slot = sparks[sparkIdx];
    sparkIdx = (sparkIdx + 1) % sparks.length;
    const gy = groundY(x, z);
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * HEAL_RADIUS * 0.85;
    slot.mesh.position.set(x + Math.cos(ang) * rad, gy + 0.3, z + Math.sin(ang) * rad);
    slot.mesh.material.opacity = 0.8;
    slot.mesh.scale.setScalar(0.6 + Math.random() * 0.5);
    slot.vy = 2.5 + Math.random() * 1.5;
    slot.life = 0.8;
    slot.mesh.visible = true;
    slot.active = true;
  }

  function getFriendlies(x, z, team) {
    if (!window.Entities || !Array.isArray(window.Entities.list)) return [];
    const out = [];
    const list = window.Entities.list;
    const r2 = HEAL_RADIUS * HEAL_RADIUS;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead || e.team !== team) continue;
      const m = e.mesh;
      if (!m) continue;
      const dx = m.position.x - x;
      const dz = m.position.z - z;
      if (dx * dx + dz * dz <= r2) out.push(e);
    }
    return out;
  }

  function update(dt) {
    if (state.cd > 0) {
      state.cd -= dt;
      if (state.cd <= 0 && !state.ready) {
        state.ready = true;
        if (window.FX) window.FX.message('MED TENT READY', '#55ff77');
      }
    }

    for (let i = 0; i < pulses.length; i++) {
      const p = pulses[i];
      if (!p.active) continue;
      p.t += dt;
      const frac = p.t / 1.2;
      if (frac >= 1) { p.active = false; p.mesh.visible = false; continue; }
      p.mesh.scale.setScalar(0.5 + frac * HEAL_RADIUS * 1.1);
      p.mesh.material.opacity = 0.6 * (1 - frac);
    }

    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) { s.active = false; s.mesh.visible = false; continue; }
      s.mesh.position.y += s.vy * dt;
      s.vy -= 4.0 * dt;
      s.mesh.material.opacity = Math.min(1, s.life / 0.8) * 0.8;
    }

    if (!state.active) return;

    state.life -= dt;
    if (state.life <= 0) { removeTent(); return; }

    const ax = state.active.group.position.x;
    const az = state.active.group.position.z;

    state.pulseTimer -= dt;
    if (state.pulseTimer <= 0) {
      state.pulseTimer = PULSE_INTERVAL;
      spawnPulse(ax, az);
    }

    state.scanTimer -= dt;
    if (state.scanTimer > 0) return;
    state.scanTimer = SCAN_INTERVAL;

    const ms = window.Manager && window.Manager.state ? window.Manager.state : null;
    const playerTeam = ms ? ms.playerTeam : 'hunter';

    const friendlies = getFriendlies(ax, az, playerTeam);
    for (let i = 0; i < friendlies.length; i++) {
      const e = friendlies[i];
      if (e.hp >= e.maxHp) continue;
      e.hp = Math.min(e.maxHp, e.hp + HEAL_RATE_ENTITY * SCAN_INTERVAL);
      if (Math.random() < 0.3) spawnHealSpark(e.mesh.position.x, e.mesh.position.z);
    }

    if (ms && ms.playerAlive && window.CAMERA) {
      const dx = window.CAMERA.position.x - ax;
      const dz = window.CAMERA.position.z - az;
      if (dx * dx + dz * dz <= HEAL_RADIUS * HEAL_RADIUS) {
        ms.playerHp = Math.min(ms.playerMaxHp, ms.playerHp + HEAL_RATE_PLAYER * SCAN_INTERVAL);
        if (Math.random() < 0.25) spawnHealSpark(window.CAMERA.position.x, window.CAMERA.position.z);
      }
    }

    const lifeFrac = state.life / LIFETIME;
    const blink = lifeFrac < 0.2 ? (Math.sin(state.life * 10) > 0 ? 1 : 0.3) : 1;
    state.active.crossV.material.color.setRGB(1 * blink, 0.2 * blink, 0.2 * blink);
    state.active.crossH.material.color.setRGB(1 * blink, 0.2 * blink, 0.2 * blink);

    if (state.active.group) {
      state.active.group.children[0].material.emissiveIntensity = 0.2 + Math.sin(performance.now() * 0.003) * 0.1;
    }
  }

  function reset() {
    removeTent();
    state.ready = true;
    state.cd = 0;
    state.life = 0;
    state.hp = TENT_HP;
    state.scanTimer = 0;
    state.pulseTimer = 0;
    for (let i = 0; i < pulses.length; i++) { pulses[i].active = false; pulses[i].mesh.visible = false; }
    for (let i = 0; i < sparks.length; i++) { sparks[i].active = false; sparks[i].mesh.visible = false; }
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'g' && e.key !== 'G') return;
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    if (!window.Player || !Player.state.locked) return;
    deploy();
  });

  window.MedTent = { update, reset, deploy, takeDamage, state };
  return window.MedTent;
})();