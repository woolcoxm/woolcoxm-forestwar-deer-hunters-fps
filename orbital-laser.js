// orbital-laser.js — FORESTWAR killstreak reward: satellite laser strike that lases the crosshair target and scorches everything in the radius
const THREE = window.THREE;
const SCENE = window.SCENE;
const OrbitalLaser = (() => {
  const KILLS_NEEDED = 20;
  const COOLDOWN_MAX = 100;
  const DESIGNATE_DURATION = 1.6;
  const BEAM_DURATION = 2.5;
  const BEAM_RADIUS = 6;
  const BEAM_DPS = 200;
  const TICK_INTERVAL = 0.12;
  const LIGHTNING_FRACTION = 0.35;
  const BEAM_HEIGHT = 200;
  const TARGET_RANGE = 140;
  const MARKER_EXPAND_TIME = 0.6;

  const state = {
    kills: 0,
    ready: false,
    cooldown: 0,
    active: false,
    phase: 'idle',
    timer: 0,
    target: new THREE.Vector3(),
    tickAcc: 0,
    markerT: 0,
    beamStrength: 0,
    lasingFrom: null,
  };

  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _ray = new THREE.Raycaster();
  const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  const MARKER_GEO = new THREE.RingGeometry(BEAM_RADIUS * 0.6, BEAM_RADIUS, 48);
  const MARKER_MAT = new THREE.MeshBasicMaterial({
    color: 0xff2222, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const marker = new THREE.Mesh(MARKER_GEO, MARKER_MAT.clone());
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  marker.frustumCulled = false;
  SCENE.add(marker);

  const CROSS_GEO = new THREE.RingGeometry(0.3, 0.45, 4, 1, 0, Math.PI * 0.5);
  const CROSS_MAT = new THREE.MeshBasicMaterial({
    color: 0xff4422, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const crossH = new THREE.Mesh(CROSS_GEO, CROSS_MAT.clone());
  crossH.rotation.x = -Math.PI / 2;
  crossH.visible = false;
  crossH.frustumCulled = false;
  SCENE.add(crossH);

  const BEAM_TOP = BEAM_HEIGHT * 0.5;
  const BEAM_GEO = new THREE.CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS, BEAM_HEIGHT, 20, 1, true);
  const BEAM_MAT = new THREE.MeshBasicMaterial({
    color: 0xff4422, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Mesh(BEAM_GEO, BEAM_MAT.clone());
  beam.visible = false;
  beam.frustumCulled = false;
  SCENE.add(beam);

  const CORE_GEO = new THREE.CylinderGeometry(BEAM_RADIUS * 0.25, BEAM_RADIUS * 0.25, BEAM_HEIGHT, 12, 1, true);
  const CORE_MAT = new THREE.MeshBasicMaterial({
    color: 0xffffcc, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const coreBeam = new THREE.Mesh(CORE_GEO, CORE_MAT.clone());
  coreBeam.visible = false;
  coreBeam.frustumCulled = false;
  SCENE.add(coreBeam);

  const SCORCH_GEO = new THREE.CircleGeometry(BEAM_RADIUS * 1.3, 24);
  const SCORCH_MAT = new THREE.MeshBasicMaterial({
    color: 0x1a0804, transparent: true, opacity: 0,
    depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const scorch = new THREE.Mesh(SCORCH_GEO, SCORCH_MAT.clone());
  scorch.rotation.x = -Math.PI / 2;
  scorch.visible = false;
  SCENE.add(scorch);

  const GLOW_GEO = new THREE.CircleGeometry(BEAM_RADIUS, 24);
  const GLOW_MAT = new THREE.MeshBasicMaterial({
    color: 0xff4400, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const groundGlow = new THREE.Mesh(GLOW_GEO, GLOW_MAT.clone());
  groundGlow.rotation.x = -Math.PI / 2;
  groundGlow.visible = false;
  groundGlow.frustumCulled = false;
  SCENE.add(groundGlow);

  const SPARK_GEO = new THREE.SphereGeometry(0.18, 5, 4);
  const SPARK_MAT = new THREE.MeshBasicMaterial({
    color: 0xff8833, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const SPARK_POOL = 40;
  const sparks = [];
  for (let i = 0; i < SPARK_POOL; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vy: 0, vx: 0, vz: 0, active: false });
  }
  let sparkIdx = 0;

  const beamLight = new THREE.PointLight(0xff5522, 0, BEAM_RADIUS * 3, 2);
  beamLight.visible = false;
  SCENE.add(beamLight);

  const hud = document.getElementById('hud');
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:16px;bottom:250px;width:180px;font-size:11px;letter-spacing:2px;text-shadow:0 1px 3px #000;z-index:6;';
  hud.appendChild(wrap);
  const label = document.createElement('div');
  label.style.cssText = 'color:#ff6644;margin-bottom:3px;';
  label.textContent = 'ORBITAL LASER';
  wrap.appendChild(label);
  const killRow = document.createElement('div');
  killRow.style.cssText = 'font-size:9px;letter-spacing:1px;color:#aa8866;margin-bottom:4px;';
  killRow.textContent = '0 / ' + KILLS_NEEDED + ' KILLS';
  wrap.appendChild(killRow);
  const barWrap = document.createElement('div');
  barWrap.style.cssText = 'width:100%;height:6px;background:rgba(0,0,0,0.55);border:1px solid rgba(200,60,40,0.3);border-radius:3px;overflow:hidden;';
  const barFill = document.createElement('div');
  barFill.style.cssText = 'width:0%;height:100%;background:linear-gradient(90deg,#992211,#ff6644);border-radius:2px;transition:width 0.1s;';
  barWrap.appendChild(barFill);
  wrap.appendChild(barWrap);
  const statusEl = document.createElement('div');
  statusEl.style.cssText = 'margin-top:4px;font-size:10px;color:#ff4422;opacity:0;transition:opacity 0.2s;font-weight:bold;';
  statusEl.textContent = 'PRESS [J] TO STRIKE';
  wrap.appendChild(statusEl);

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'j' && e.key !== 'J') return;
    const ms = window.Manager;
    if (!ms || !ms.state || ms.state.phase !== 'playing') return;
    if (!window.Player || !Player.state.locked) return;
    if (state.active) return;
    if (!state.ready) {
      if (window.FX) window.FX.message('ORBITAL RECHARGING', '#ff6644');
      return;
    }
    activate();
  });

  function findLasePoint() {
    const cam = window.CAMERA;
    if (!cam) return null;
    cam.getWorldDirection(_dir);
    _ray.set(cam.position, _dir);
    _ray.far = TARGET_RANGE;
    const ents = window.Entities && window.Entities.list;
    if (ents) {
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (e.dead) continue;
        if (e.team === ms_playerTeam()) continue;
        const m = e.mesh;
        if (!m) continue;
        const dist = _v1.subVectors(m.position, cam.position).dot(_dir);
        if (dist < 0 || dist > TARGET_RANGE) continue;
        _v2.copy(m.position);
        _v2.y += 1.0;
        const closest = _v3().subVectors(_v2, cam.position);
        const proj = closest.dot(_dir);
        _v3().copy(_dir).multiplyScalar(proj).add(cam.position);
        const dist2 = closest.distanceTo(_v3());
        if (dist2 < 1.5) {
          const pt = m.position.clone();
          pt.y = groundY(pt.x, pt.z);
          return pt;
        }
      }
    }
    const hit = _ray.ray.intersectPlane(_ground, _v1);
    if (hit) return _v1.clone();
    return null;
  }

  function _v3() { return _v2; }

  function ms_playerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function getEnemies(x, z, radius) {
    if (!window.Entities || !window.Entities.list) return [];
    const r2 = radius * radius;
    const out = [];
    const team = ms_playerTeam();
    for (let i = 0; i < window.Entities.list.length; i++) {
      const e = window.Entities.list[i];
      if (e.dead || e.team === team) continue;
      const m = e.mesh;
      if (!m) continue;
      const dx = m.position.x - x;
      const dz = m.position.z - z;
      if (dx * dx + dz * dz <= r2) out.push(e);
    }
    return out;
  }

  function activate() {
    const pt = findLasePoint();
    if (!pt) {
      if (window.FX) window.FX.message('NO TARGET', '#ff6644');
      return;
    }
    state.active = true;
    state.ready = false;
    state.cooldown = COOLDOWN_MAX;
    state.phase = 'designating';
    state.timer = 0;
    state.markerT = 0;
    state.target.copy(pt);

    marker.position.set(pt.x, groundY(pt.x, pt.z) + 0.08, pt.z);
    marker.scale.setScalar(0.3);
    marker.material.opacity = 0.8;
    marker.visible = true;

    crossH.position.set(pt.x, groundY(pt.x, pt.z) + 0.09, pt.z);
    crossH.material.opacity = 0.9;
    crossH.visible = true;

    statusEl.style.opacity = '0';

    if (window.FX) window.FX.message('ORBITAL STRIKE INBOUND', '#ff4422');
    if (window.Sound) {
      window.Sound.tone(180, 0.5, 'sawtooth', 0.3, 600);
      window.Sound.tone(90, 0.8, 'sine', 0.25, 400);
    }
  }

  function spawnSparks(x, y, z, count, power) {
    for (let i = 0; i < count; i++) {
      const s = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % SPARK_POOL;
      const ang = Math.random() * Math.PI * 2;
      const spd = (3 + Math.random() * 8) * power;
      s.vx = Math.cos(ang) * spd;
      s.vy = (4 + Math.random() * 10) * power;
      s.vz = Math.sin(ang) * spd;
      s.mesh.position.set(x + (Math.random() - 0.5) * 2, y, z + (Math.random() - 0.5) * 2);
      s.mesh.scale.setScalar(0.5 + Math.random() * 0.8);
      s.mesh.material.opacity = 0.9;
      s.life = 0.4 + Math.random() * 0.3;
      s.mesh.visible = true;
      s.active = true;
    }
  }

  function applyBeamDamage(x, z) {
    const enemies = getEnemies(x, z, BEAM_RADIUS);
    const dmg = BEAM_DPS * TICK_INTERVAL;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.takeDamage) e.takeDamage(dmg, 'fire');
      if (e.hp !== undefined && e.hp <= 0 && !e.dead) {
        e.dead = true;
      }
    }
    if (window.Bleed) window.Bleed.apply(getEnemies(x, z, BEAM_RADIUS), 0.5);
    const gy = groundY(x, z);
    if (Math.random() < LIGHTNING_FRACTION) {
      spawnSparks(x + (Math.random() - 0.5) * BEAM_RADIUS, gy + 0.5, z + (Math.random() - 0.5) * BEAM_RADIUS, 4, 1.0);
    }
  }

  function update(dt) {
    if (!state.active && state.cooldown > 0) {
      state.cooldown -= dt;
      barFill.style.width = Math.max(0, (1 - state.cooldown / COOLDOWN_MAX) * 100) + '%';
      if (state.cooldown <= 0) state.ready = true;
    }
    if (!state.active) return;

    state.timer += dt;

    if (state.phase === 'designating') {
      state.markerT += dt;
      const t = Math.min(state.markerT / DESIGNATE_DURATION, 1);
      const ease = 1 - Math.pow(1 - t, 2);
      marker.scale.setScalar(0.3 + ease * 0.7);
      marker.material.opacity = 0.4 + Math.sin(state.timer * 12) * 0.3;
      crossH.rotation.z += dt * 3;
      crossH.material.opacity = 0.5 + Math.sin(state.timer * 15) * 0.4;

      if (state.timer >= DESIGNATE_DURATION) {
        state.phase = 'firing';
        state.timer = 0;
        state.tickAcc = 0;
        state.beamStrength = 0;
        beam.visible = true;
        coreBeam.visible = true;
        groundGlow.visible = true;
        scorch.visible = true;
        beamLight.visible = true;

        const gy = groundY(state.target.x, state.target.z);
        beam.position.set(state.target.x, gy + BEAM_TOP, state.target.z);
        coreBeam.position.set(state.target.x, gy + BEAM_TOP, state.target.z);
        groundGlow.position.set(state.target.x, gy + 0.1, state.target.z);
        scorch.position.set(state.target.x, gy + 0.05, state.target.z);

        if (window.FX && window.FX.shake) window.FX.shake(0.15);
        if (window.Sound) {
          window.Sound.tone(60, 1.5, 'sawtooth', 0.4, 800);
          window.Sound.tone(120, 1.2, 'square', 0.2, 1200);
        }
      }
    } else if (state.phase === 'firing') {
      const t = state.timer / BEAM_DURATION;
      if (t < 0.15) {
        state.beamStrength = t / 0.15;
      } else if (t > 0.85) {
        state.beamStrength = (1 - t) / 0.15;
      } else {
        state.beamStrength = 1.0;
      }
      state.beamStrength = Math.max(0, Math.min(1, state.beamStrength));

      const flicker = 0.85 + Math.sin(state.timer * 60) * 0.05 + Math.random() * 0.1;
      const s = state.beamStrength * flicker;

      beam.material.opacity = 0.3 * s;
      beam.scale.x = s;
      beam.scale.z = s;
      coreBeam.material.opacity = 0.7 * s;
      coreBeam.scale.x = s;
      coreBeam.scale.z = s;
      groundGlow.material.opacity = 0.5 * s;
      groundGlow.scale.setScalar(0.8 + s * 0.4);
      scorch.material.opacity = Math.min(0.8, state.timer * 0.5) * state.beamStrength;
      beamLight.intensity = 8 * s;
      beamLight.position.set(state.target.x, groundY(state.target.x, state.target.z) + 2, state.target.z);

      marker.material.opacity = 0.3 * (1 - t);
      crossH.material.opacity = 0.4 * (1 - t);

      state.tickAcc += dt;
      while (state.tickAcc >= TICK_INTERVAL) {
        state.tickAcc -= TICK_INTERVAL;
        applyBeamDamage(state.target.x, state.target.z);
      }

      if (t >= 1.0) {
        state.phase = 'idle';
        state.active = false;
        beam.visible = false;
        coreBeam.visible = false;
        groundGlow.visible = false;
        beamLight.visible = false;
        marker.visible = false;
        crossH.visible = false;
        if (window.Craters) window.Craters.create(state.target.x, state.target.z, BEAM_RADIUS * 1.5);
        if (window.Fire && window.Fire.igniteArea) window.Fire.igniteArea(state.target.x, state.target.z, BEAM_RADIUS * 1.2);
      }
    }
  }

  function updateSparks(dt) {
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        s.active = false;
        continue;
      }
      s.vy -= 16 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      const gy = groundY(s.mesh.position.x, s.mesh.position.z);
      if (s.mesh.position.y < gy) {
        s.mesh.position.y = gy;
        s.vy *= -0.3;
        s.vx *= 0.5;
        s.vz *= 0.5;
      }
      s.mesh.material.opacity = Math.min(1, s.life * 3);
    }
  }

  function addKill() {
    if (state.ready || state.active) return;
    state.kills++;
    killRow.textContent = Math.min(state.kills, KILLS_NEEDED) + ' / ' + KILLS_NEEDED + ' KILLS';
    const frac = Math.min(state.kills / KILLS_NEEDED, 1);
    if (!state.active && state.cooldown <= 0) {
      barFill.style.width = (frac * 100) + '%';
    }
    if (state.kills >= KILLS_NEEDED && !state.ready) {
      state.ready = true;
      statusEl.style.opacity = '1';
      barFill.style.width = '100%';
      killRow.textContent = 'READY';
      if (window.FX) window.FX.message('ORBITAL LASER READY [J]', '#ff4422');
      if (window.Sound) {
        window.Sound.tone(880, 0.15, 'square', 0.2, 2000);
        window.Sound.tone(1320, 0.2, 'sine', 0.15, 2400);
      }
    }
  }

  function reset() {
    state.kills = 0;
    state.ready = false;
    state.cooldown = 0;
    state.active = false;
    state.phase = 'idle';
    state.timer = 0;
    state.tickAcc = 0;
    state.beamStrength = 0;
    beam.visible = false;
    coreBeam.visible = false;
    groundGlow.visible = false;
    marker.visible = false;
    crossH.visible = false;
    scorch.visible = false;
    beamLight.visible = false;
    statusEl.style.opacity = '0';
    barFill.style.width = '0%';
    killRow.textContent = '0 / ' + KILLS_NEEDED + ' KILLS';
    for (let i = 0; i < sparks.length; i++) {
      sparks[i].active = false;
      sparks[i].mesh.visible = false;
    }
  }

  let lastT = 0;
  function frame(dt, time) {
    update(dt);
    updateSparks(dt);
  }

  if (window.KillRewards) {
    window.KillRewards.register(function(victimTeam) {
      addKill();
    });
  }

  return { state, update: frame, addKill, reset, frame };
})();

window.OrbitalLaser = OrbitalLaser;