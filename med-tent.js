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

  function buildMesh() {
    const g = new THREE.Group();
    const front = new THREE.Mesh(CANVAS_GEO, CANVAS_MAT.clone());
    front.castShadow = true;
    front.position.y = 1.0;
    g.add(front);
    const back = new THREE.Mesh(CANVAS_GEO, CANVAS_MAT.clone());
    back.castShadow = true;
    back.position.y = 1.0;
    back.rotation.y = Math.PI;
    g.add(back);
    for (const sx of [-1.5, 1.5]) {
      const pole = new THREE.Mesh(POLE_GEO, POLE_MAT);
      pole.castShadow = true;
      pole.position.set(sx, 0.9, 0);
      g.add(pole);
    }
    const ridgePole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.0, 5), POLE_MAT);
    ridgePole.rotation.x = Math.PI / 2;
    ridgePole.position.y = 1.7;
    g.add(ridgePole);
    const crossV = new THREE.Mesh(CROSS_GEO, CROSS_MAT);
    crossV.position.set(0, 2.1, 0.15);
    g.add(crossV);
    const crossH = new THREE.Mesh(CROSS_GEO, CROSS_MAT);
    crossH.position.set(0, 2.1, 0.15);
    crossH.rotation.z = Math.PI / 2;
    g.add(crossH);
    const ring = new THREE.Mesh(RING_GEO, RING_MAT.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);
    const light = new THREE.PointLight(0x66ff88, 1.0, HEAL_RADIUS * 1.2, 2);
    light.position.y = 2.0;
    g.add(light);
    g.userData.ring = ring;
    g.userData.light = light;
    return g;
  }

  function spawnSparkBurst(x, y, z, count) {
    for (let i = 0; i < count; i++) {
      const s = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % sparks.length;
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.0 + Math.random() * 1.5;
      s.mesh.position.set(x, y, z);
      s.mesh.scale.setScalar(0.6 + Math.random() * 0.5);
      s.mesh.material.opacity = 0.9;
      s.mesh.visible = true;
      s.vy = 1.5 + Math.random() * 1.2;
      s.life = 0.6 + Math.random() * 0.3;
      s.active = true;
      s.vx = Math.cos(ang) * spd;
      s.vz = Math.sin(ang) * spd;
    }
  }

  function deploy() {
    if (!state.ready) {
      if (window.FX) window.FX.message('MED-TENT RECHARGING', '#ff6644');
      return;
    }
    const p = window.Player ? window.Player.state : null;
    if (!p) return;
    if (!p.locked) return;
    if (p.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('INSUFFICIENT STAMINA', '#ff6644');
      return;
    }
    p.stamina -= STAMINA_COST;
    if (p.regenTimer !== undefined) p.regenTimer = 1.5;
    state.ready = false;
    state.cd = COOLDOWN;

    if (state.active) removeTent();

    const cam = window.CAMERA;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const px = cam.position.x + fwd.x * 4.0;
    const pz = cam.position.z + fwd.z * 4.0;
    const gy = groundY(px, pz);

    const mesh = buildMesh();
    mesh.position.set(px, gy, pz);
    mesh.rotation.y = Math.atan2(fwd.x, fwd.z) + Math.PI;
    SCENE.add(mesh);

    state.active = { mesh, x: px, z: pz, gy };
    state.life = LIFETIME;
    state.hp = TENT_HP;
    state.scanTimer = 0;
    state.pulseTimer = 0;

    spawnSparkBurst(px, gy + 1.0, pz, 10);
    if (window.Sound) {
      window.Sound.tone(440, 0.2, 'sine', 0.25, 2000);
      window.Sound.tone(660, 0.15, 'sine', 0.2, 2400);
    }
    if (window.FX) window.FX.message('MED-TENT DEPLOYED', '#66ff88');
    updateHUD();
  }

  function removeTent() {
    if (!state.active) return;
    const a = state.active;
    spawnSparkBurst(a.x, a.gy + 1.0, a.z, 6);
    SCENE.remove(a.mesh);
    disposeMesh(a.mesh);
    state.active = null;
  }

  function disposeMesh(root) {
    root.traverse((obj) => {
      if (obj.geometry && obj.geometry !== CANVAS_GEO && obj.geometry !== POLE_GEO &&
          obj.geometry !== CROSS_GEO && obj.geometry !== RING_GEO) {
        obj.geometry.dispose();
      }
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
  }

  function takeDamage(dmg) {
    if (!state.active) return;
    state.hp -= dmg;
    if (state.hp <= 0) {
      if (window.FX) window.FX.message('MED-TENT DESTROYED', '#ff4422');
      if (window.Sound) window.Sound.tone(120, 0.4, 'sawtooth', 0.3, 600);
      removeTent();
    }
  }

  function applyHealing(dt) {
    const a = state.active;
    if (!a) return;
    const ents = window.Entities && window.Entities.list;
    const pt = window.Manager && window.Manager.state ? window.Manager.state.playerTeam : 'hunter';
    const r2 = HEAL_RADIUS * HEAL_RADIUS;

    if (ents) {
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (e.dead || e.team !== pt) continue;
        const m = e.mesh;
        if (!m) continue;
        const dx = m.position.x - a.x;
        const dz = m.position.z - a.z;
        if (dx * dx + dz * dz > r2) continue;
        if (e.hp !== undefined && e.maxHp !== undefined && e.hp < e.maxHp) {
          e.hp = Math.min(e.maxHp, e.hp + HEAL_RATE_ENTITY * dt);
        }
      }
    }

    const cam = window.CAMERA;
    if (cam) {
      const dx = cam.position.x - a.x;
      const dz = cam.position.z - a.z;
      if (dx * dx + dz * dz < r2) {
        const ms = window.Manager && window.Manager.state;
        if (ms && ms.playerAlive && ms.playerHp < ms.playerMaxHp) {
          ms.playerHp = Math.min(ms.playerMaxHp, ms.playerHp + HEAL_RATE_PLAYER * dt);
        }
      }
    }
  }

  function emitPulse() {
    const a = state.active;
    if (!a) return;
    const slot = pulses[pulseIdx];
    pulseIdx = (pulseIdx + 1) % pulses.length;
    slot.mesh.position.set(a.x, a.gy + 0.08, a.z);
    slot.mesh.scale.setScalar(0.3);
    slot.mesh.material.opacity = 0.7;
    slot.mesh.visible = true;
    slot.t = 0;
    slot.active = true;
  }

  function update(dt) {
    if (state.cd > 0) {
      state.cd -= dt;
      if (state.cd <= 0) {
        state.cd = 0;
        state.ready = true;
        if (window.FX) window.FX.message('MED-TENT READY', '#66ff88');
      }
      updateHUD();
    }

    for (let i = 0; i < pulses.length; i++) {
      const p = pulses[i];
      if (!p.active) continue;
      p.t += dt;
      const t = p.t / 1.5;
      if (t >= 1) { p.active = false; p.mesh.visible = false; continue; }
      const scale = 0.3 + t * (HEAL_RADIUS / 0.3 - 0.3);
      p.mesh.scale.setScalar(scale);
      p.mesh.material.opacity = 0.7 * (1 - t);
    }

    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) { s.active = false; s.mesh.visible = false; continue; }
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.position.y += s.vy * dt;
      s.vy -= 4 * dt;
      s.mesh.material.opacity = Math.max(0, s.life / 0.8);
    }

    if (!state.active) return;

    state.life -= dt;
    if (state.life <= 0) {
      removeTent();
      return;
    }

    state.scanTimer -= dt;
    if (state.scanTimer <= 0) {
      state.scanTimer = SCAN_INTERVAL;
      applyHealing(SCAN_INTERVAL);
    }

    state.pulseTimer -= dt;
    if (state.pulseTimer <= 0) {
      state.pulseTimer = PULSE_INTERVAL;
      emitPulse();
    }

    const a = state.active;
    a.mesh.userData.ring.material.opacity = 0.18 + Math.sin(performance.now() * 0.003) * 0.06;
    a.mesh.userData.light.intensity = 0.8 + Math.sin(performance.now() * 0.004) * 0.3;

    const ratio = state.hp / TENT_HP;
    a.mesh.userData.ring.material.color.setRGB(0.33 * ratio + 0.1, 1.0 * ratio + 0.2, 0.47 * ratio + 0.1);
  }

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:16px;bottom:258px;font-size:11px;letter-spacing:2px;color:#66ff88;text-shadow:0 1px 3px #000;z-index:6;';
  const label = document.createElement('div');
  label.textContent = 'MED-TENT [N]';
  hud.appendChild(label);
  const bar = document.createElement('div');
  bar.style.cssText = 'margin-top:3px;width:80px;height:5px;background:rgba(0,0,0,0.5);border:1px solid rgba(100,255,130,0.3);border-radius:3px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#44cc66,#88ffaa);transition:width 0.1s;';
  bar.appendChild(fill);
  hud.appendChild(bar);
  const statusEl = document.createElement('div');
  statusEl.style.cssText = 'margin-top:2px;font-size:9px;color:#88ccaa;letter-spacing:1px;';
  statusEl.textContent = 'READY';
  hud.appendChild(statusEl);
  document.getElementById('hud').appendChild(hud);

  function updateHUD() {
    if (state.ready) {
      fill.style.width = '100%';
      statusEl.textContent = 'READY';
      statusEl.style.color = '#88ffaa';
    } else if (state.active) {
      fill.style.width = Math.max(0, (state.life / LIFETIME) * 100) + '%';
      statusEl.textContent = 'ACTIVE ' + Math.ceil(state.life) + 's';
      statusEl.style.color = '#aaffcc';
    } else {
      fill.style.width = Math.max(0, (1 - state.cd / COOLDOWN) * 100) + '%';
      statusEl.textContent = Math.ceil(state.cd) + 's';
      statusEl.style.color = '#cc8866';
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'n' && e.key !== 'N') return;
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    if (!window.Player || !Player.state.locked) return;
    deploy();
  });

  function reset() {
    if (state.active) removeTent();
    state.cd = 0;
    state.ready = true;
    state.life = 0;
    state.hp = TENT_HP;
    state.scanTimer = 0;
    state.pulseTimer = 0;
    for (let i = 0; i < pulses.length; i++) { pulses[i].active = false; pulses[i].t = 0; pulses[i].mesh.visible = false; }
    for (let i = 0; i < sparks.length; i++) { sparks[i].active = false; sparks[i].life = 0; sparks[i].mesh.visible = false; }
    updateHUD();
  }

  return { state, update, deploy, reset, takeDamage, updateHUD, get active() { return !!state.active; } };
})();
window.MedTent = MedTent;