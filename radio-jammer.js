// radio-jammer.js — FORESTWAR tactical jammer drone: hovers overhead and suppresses enemy AI in a radius
const THREE = window.THREE;
const SCENE = window.SCENE;
const RadioJammer = (() => {
  const COOLDOWN_MAX = 38;
  const STAMINA_COST = 40;
  const DURATION = 12;
  const HOVER_HEIGHT = 7;
  const FOLLOW_LERP = 2.5;
  const BOB_FREQ = 1.8;
  const RADIUS = 16;
  const SLOW_MULT = 0.4;
  const FIRERATE_MULT = 0.5;
  const PULSE_INTERVAL = 0.6;
  const WAVE_EXPAND_TIME = 1.0;

  const state = {
    active: false,
    timer: 0,
    cd: 0,
    bobPhase: 0,
    pulseTimer: 0,
    affectedCount: 0,
  };

  const DRONE_GEO = new THREE.OctahedronGeometry(0.5, 0);
  const DRONE_MAT = new THREE.MeshStandardMaterial({
    color: 0x2a3a4a, roughness: 0.4, metalness: 0.7,
    emissive: 0x001133, emissiveIntensity: 0.5,
  });
  const RING_GEO = new THREE.TorusGeometry(0.7, 0.05, 6, 24);
  const RING_MAT = new THREE.MeshBasicMaterial({
    color: 0x66ddff, transparent: true, opacity: 0.7,
  });
  const CORE_GEO = new THREE.SphereGeometry(0.16, 10, 8);
  const CORE_MAT = new THREE.MeshBasicMaterial({ color: 0x99eeff });
  const FIN_GEO = new THREE.BoxGeometry(0.1, 0.1, 0.5);
  const FIN_MAT = new THREE.MeshStandardMaterial({
    color: 0x1a2a3a, roughness: 0.5, metalness: 0.6,
  });
  const AURA_GEO = new THREE.RingGeometry(RADIUS - 0.3, RADIUS, 64);
  const AURA_MAT = new THREE.MeshBasicMaterial({
    color: 0x44aaff, transparent: true, opacity: 0.15,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const WAVE_GEO = new THREE.RingGeometry(0.5, 0.8, 40);
  const WAVE_MAT = new THREE.MeshBasicMaterial({
    color: 0x66ccff, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const BEAM_GEO = new THREE.CylinderGeometry(0.03, 0.03, 1, 5);
  const BEAM_MAT = new THREE.MeshBasicMaterial({
    color: 0x88ddff, transparent: true, opacity: 0.3, depthWrite: false,
  });

  const drone = new THREE.Group();
  const body = new THREE.Mesh(DRONE_GEO, DRONE_MAT);
  body.castShadow = true;
  drone.add(body);
  const core = new THREE.Mesh(CORE_GEO, CORE_MAT);
  drone.add(core);
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(RING_GEO, RING_MAT.clone());
    ring.rotation.x = (i / 3) * Math.PI;
    ring.rotation.z = (i / 3) * Math.PI * 0.7;
    ring.userData.spin = (i % 2 === 0 ? 1 : -1) * (1.5 + i * 0.4);
    drone.add(ring);
    rings.push(ring);
  }
  for (const sx of [-1, 1]) {
    const fin = new THREE.Mesh(FIN_GEO, FIN_MAT);
    fin.position.set(sx * 0.5, 0, 0);
    fin.rotation.z = sx * 0.25;
    drone.add(fin);
  }
  const droneLight = new THREE.PointLight(0x44aaff, 1.5, 8, 2);
  drone.add(droneLight);
  drone.visible = false;
  SCENE.add(drone);

  const aura = new THREE.Mesh(AURA_GEO, AURA_MAT.clone());
  aura.rotation.x = -Math.PI / 2;
  aura.visible = false;
  SCENE.add(aura);

  const waves = [];
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(WAVE_GEO, WAVE_MAT.clone());
    w.rotation.x = -Math.PI / 2;
    w.visible = false;
    w.frustumCulled = false;
    SCENE.add(w);
    waves.push({ mesh: w, life: 0 });
  }
  let waveIdx = 0;

  const beam = new THREE.Mesh(BEAM_GEO, BEAM_MAT.clone());
  beam.visible = false;
  beam.frustumCulled = false;
  SCENE.add(beam);

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:16px;bottom:290px;font-size:11px;letter-spacing:2px;color:#66ddff;text-shadow:0 1px 3px #000;z-index:6;';
  const label = document.createElement('div');
  label.textContent = 'JAMMER [J]';
  hud.appendChild(label);
  const bar = document.createElement('div');
  bar.style.cssText = 'margin-top:3px;width:80px;height:5px;background:rgba(0,0,0,0.5);border:1px solid rgba(100,200,255,0.3);border-radius:3px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#3399cc,#66ddff);transition:width 0.08s;';
  bar.appendChild(fill);
  hud.appendChild(bar);
  const status = document.createElement('div');
  status.style.cssText = 'margin-top:2px;font-size:9px;letter-spacing:1px;opacity:0.7;';
  status.textContent = 'READY';
  hud.appendChild(status);
  document.getElementById('hud').appendChild(hud);

  const _dronePos = new THREE.Vector3();
  const _targetPos = new THREE.Vector3();
  const _beamPos = new THREE.Vector3();

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function activate() {
    if (state.cd > 0) {
      if (window.FX) window.FX.message('JAMMER RECHARGING', '#66ddff');
      return;
    }
    const p = window.Player ? window.Player.state : null;
    if (!p || !p.locked) return;
    if (p.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('INSUFFICIENT STAMINA', '#ff6644');
      return;
    }
    p.stamina -= STAMINA_COST;
    if (p.regenTimer !== undefined) p.regenTimer = 1.5;

    state.active = true;
    state.timer = DURATION;
    state.cd = COOLDOWN_MAX;
    state.pulseTimer = 0;

    const cam = window.CAMERA;
    _dronePos.set(cam.position.x, cam.position.y + HOVER_HEIGHT, cam.position.z);
    drone.position.copy(_dronePos);
    drone.visible = true;
    aura.position.set(cam.position.x, groundY(cam.position.x, cam.position.z) + 0.1, cam.position.z);
    aura.visible = true;
    beam.visible = true;

    if (window.FX) window.FX.message('JAMMER ONLINE', '#66ddff');
    if (window.Sound) {
      window.Sound.tone(180, 0.4, 'sawtooth', 0.25, 1200);
      window.Sound.tone(360, 0.2, 'square', 0.15, 2000);
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'j' && e.key !== 'J') return;
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    activate();
  });

  function spawnWave(x, z) {
    const slot = waves[waveIdx];
    waveIdx = (waveIdx + 1) % waves.length;
    slot.mesh.position.set(x, groundY(x, z) + 0.15, z);
    slot.mesh.scale.setScalar(1);
    slot.mesh.material.opacity = 0.7;
    slot.mesh.visible = true;
    slot.life = WAVE_EXPAND_TIME;
  }

  function applyToEntities(dt) {
    if (!window.Entities || !Array.isArray(window.Entities.list)) return;
    const playerTeam = (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
    const cx = drone.position.x;
    const cz = drone.position.z;
    const r2 = RADIUS * RADIUS;
    let count = 0;

    for (let i = 0; i < window.Entities.list.length; i++) {
      const e = window.Entities.list[i];
      if (e.dead || e.team === playerTeam) continue;
      const m = e.mesh;
      if (!m) continue;
      const dx = m.position.x - cx;
      const dz = m.position.z - cz;
      if (dx * dx + dz * dz > r2) {
        e.jammed = false;
        continue;
      }
      e.jammed = true;
      count++;
      if (e.aiCooldown === undefined) e.aiCooldown = 0;
      if (e.fireCd === undefined) e.fireCd = 0;
      if (e.aiCooldown > 0) e.aiCooldown += dt * (1 / FIRERATE_MULT - 1);
      if (e.fireCd > 0) e.fireCd += dt * (1 / FIRERATE_MULT - 1);
    }
    state.affectedCount = count;
  }

  function update(dt) {
    if (state.cd > 0) {
      state.cd -= dt;
      if (state.cd < 0) state.cd = 0;
    }

    if (state.active) {
      state.timer -= dt;
      state.bobPhase += dt * BOB_FREQ;
      state.pulseTimer -= dt;

      const cam = window.CAMERA;
      _targetPos.set(cam.position.x, cam.position.y + HOVER_HEIGHT, cam.position.z);
      drone.position.lerp(_targetPos, Math.min(1, FOLLOW_LERP * dt));
      drone.position.y += Math.sin(state.bobPhase) * 0.15;

      const gy = groundY(drone.position.x, drone.position.z);
      beam.position.set(drone.position.x, (drone.position.y + gy) * 0.5, drone.position.z);
      const beamLen = Math.max(0.1, drone.position.y - gy);
      beam.scale.set(1, beamLen, 1);
      beam.material.opacity = 0.2 + Math.sin(state.bobPhase * 3) * 0.1;

      aura.position.set(drone.position.x, gy + 0.1, drone.position.z);
      aura.material.opacity = 0.12 + Math.sin(state.bobPhase * 2) * 0.06;

      for (let i = 0; i < rings.length; i++) {
        rings[i].rotation.y += rings[i].userData.spin * dt;
        rings[i].rotation.x += rings[i].userData.spin * dt * 0.5;
      }
      core.scale.setScalar(1 + Math.sin(state.bobPhase * 4) * 0.15);

      if (state.pulseTimer <= 0) {
        state.pulseTimer = PULSE_INTERVAL;
        spawnWave(drone.position.x, drone.position.z);
        if (window.Sound) window.Sound.tone(280 + Math.random() * 80, 0.06, 'sawtooth', 0.06, 2400);
      }

      applyToEntities(dt);

      if (state.timer <= 0) {
        state.active = false;
        drone.visible = false;
        aura.visible = false;
        beam.visible = false;
        if (window.Entities && Array.isArray(window.Entities.list)) {
          for (let i = 0; i < window.Entities.list.length; i++) {
            window.Entities.list[i].jammed = false;
          }
        }
        if (window.FX) window.FX.message('JAMMER OFFLINE', '#888888');
      }
    } else {
      state.affectedCount = 0;
    }

    for (let i = 0; i < waves.length; i++) {
      const w = waves[i];
      if (w.life <= 0) continue;
      w.life -= dt;
      if (w.life <= 0) {
        w.mesh.visible = false;
      } else {
        const t = 1 - w.life / WAVE_EXPAND_TIME;
        const scale = 1 + t * (RADIUS / 0.8 - 1);
        w.mesh.scale.setScalar(scale);
        w.mesh.material.opacity = (1 - t) * 0.6;
      }
    }

    if (state.active) {
      fill.style.width = '100%';
      fill.style.background = 'linear-gradient(90deg,#3399cc,#66ddff)';
      status.textContent = 'ACTIVE (' + state.timer.toFixed(1) + 's) — ' + state.affectedCount + ' JAMMED';
    } else if (state.cd > 0) {
      const pct = (1 - state.cd / COOLDOWN_MAX) * 100;
      fill.style.width = pct.toFixed(0) + '%';
      fill.style.background = 'linear-gradient(90deg,#553a33,#aa8866)';
      status.textContent = 'CHARGING ' + state.cd.toFixed(1) + 's';
    } else {
      fill.style.width = '100%';
      fill.style.background = 'linear-gradient(90deg,#3399cc,#66ddff)';
      status.textContent = 'READY';
    }
  }

  function dispose() {
    DRONE_MAT.dispose();
    CORE_MAT.dispose();
    RING_MAT.dispose();
    FIN_MAT.dispose();
    AURA_MAT.dispose();
    WAVE_MAT.dispose();
    BEAM_MAT.dispose();
    DRONE_GEO.dispose();
    CORE_GEO.dispose();
    RING_GEO.dispose();
    FIN_GEO.dispose();
    AURA_GEO.dispose();
    WAVE_GEO.dispose();
    BEAM_GEO.dispose();
    SCENE.remove(drone);
    SCENE.remove(aura);
    SCENE.remove(beam);
    for (const w of waves) SCENE.remove(w.mesh);
    if (hud.parentNode) hud.parentNode.removeChild(hud);
  }

  window.RadioJammer = { update, dispose, state };
  return { update, dispose, state };
})();