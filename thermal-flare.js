// thermal-flare.js — FORESTWAR thermal flare grenade: throwable incendiary that creates a sustained burn zone with escalating damage
const THREE = window.THREE;
const SCENE = window.SCENE;
const ThermalFlare = (() => {
  const THROW_SPEED = 26;
  const GRAVITY = 20;
  const BOUNCE = 0.3;
  const FRICTION = 0.82;
  const ARM_TIME = 0.4;
  const ZONE_DURATION = 7.5;
  const ZONE_RADIUS = 5.5;
  const BASE_DPS = 12;
  const ESCALATION_RATE = 6;
  const MAX_DPS = 45;
  const TICK_INTERVAL = 0.3;
  const COOLDOWN_MAX = 14;
  const STAMINA_COST = 28;
  const MAX_PROJECTILES = 2;
  const MAX_ZONES = 3;
  const LIGHT_INTENSITY = 3.5;
  const LIGHT_RANGE = 16;
  const FLAME_POOL = 36;
  const SPARK_POOL = 24;
  const SPARK_LIFE = 0.6;
  const SMOKE_POOL = 18;
  const SMOKE_LIFE = 1.8;
  const RING_LIFE = 0.8;
  const GROUND_LIGHT_DECAY = 0.8;
  const PULSE_INTERVAL = 0.15;
  const FLEE_CHECK_INTERVAL = 0.2;

  const state = {
    cd: 0,
    ready: true,
    projectiles: [],
    zones: [],
    scanT: 0,
  };

  const _throwDir = new THREE.Vector3();
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  // ---- Shared visual assets --------------------------------------------------
  const FLARE_GEO = new THREE.CylinderGeometry(0.06, 0.06, 0.24, 6);
  const FLARE_MAT = new THREE.MeshStandardMaterial({
    color: 0xcc4411, roughness: 0.4, metalness: 0.6,
    emissive: 0xff3300, emissiveIntensity: 0.8,
  });
  const FLARE_TIP_GEO = new THREE.ConeGeometry(0.05, 0.08, 6);
  const FLARE_TIP_MAT = new THREE.MeshBasicMaterial({ color: 0xffdd44 });

  const FLARE_GLOW_GEO = new THREE.SphereGeometry(0.22, 8, 6);
  const FLARE_GLOW_MAT = new THREE.MeshBasicMaterial({
    color: 0xff6600, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  const ZONE_GROUND_GEO = new THREE.CircleGeometry(ZONE_RADIUS, 32);
  const ZONE_GROUND_MAT = new THREE.MeshBasicMaterial({
    color: 0xff4400, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const ZONE_RING_GEO = new THREE.RingGeometry(ZONE_RADIUS - 0.4, ZONE_RADIUS, 40);
  const ZONE_RING_MAT = new THREE.MeshBasicMaterial({
    color: 0xff7722, transparent: true, opacity: 0.6,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  const FLAME_GEO = new THREE.ConeGeometry(0.35, 1.8, 6);
  const FLAME_MAT_INNER = new THREE.MeshBasicMaterial({
    color: 0xffcc33, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const FLAME_MAT_OUTER = new THREE.MeshBasicMaterial({
    color: 0xff3300, transparent: true, opacity: 0.45,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  const SPARK_GEO = new THREE.SphereGeometry(0.08, 4, 3);
  const SPARK_MAT = new THREE.MeshBasicMaterial({
    color: 0xffaa33, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  const SMOKE_GEO = new THREE.SphereGeometry(0.5, 5, 4);
  const SMOKE_MAT = new THREE.MeshBasicMaterial({
    color: 0x3a3a30, transparent: true, opacity: 0,
    depthWrite: false,
  });

  const PULSE_GEO = new THREE.RingGeometry(0.4, 0.7, 24);
  const PULSE_MAT = new THREE.MeshBasicMaterial({
    color: 0xff6600, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  // ---- Pools -----------------------------------------------------------------
  const flames = [];
  for (let i = 0; i < FLAME_POOL; i++) {
    const inner = new THREE.Mesh(FLAME_GEO, FLAME_MAT_INNER.clone());
    inner.visible = false;
    inner.frustumCulled = false;
    SCENE.add(inner);
    const outer = new THREE.Mesh(FLAME_GEO, FLAME_MAT_OUTER.clone());
    outer.visible = false;
    outer.frustumCulled = false;
    SCENE.add(outer);
    flames.push({ inner, outer, zone: null, phase: 0, active: false });
  }
  let flameIdx = 0;

  const sparks = [];
  for (let i = 0; i < SPARK_POOL; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, active: false });
  }
  let sparkIdx = 0;

  const smokes = [];
  for (let i = 0; i < SMOKE_POOL; i++) {
    const m = new THREE.Mesh(SMOKE_GEO, SMOKE_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    smokes.push({ mesh: m, life: 0, maxLife: SMOKE_LIFE, vx: 0, vy: 0, vz: 0, active: false });
  }
  let smokeIdx = 0;

  const pulses = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(PULSE_GEO, PULSE_MAT.clone());
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    pulses.push({ mesh: m, life: 0, active: false });
  }
  let pulseIdx = 0;

  // ---- HUD -------------------------------------------------------------------
  const hud = document.getElementById('hud');
  if (hud) {
    const hudWrap = document.createElement('div');
    hudWrap.style.cssText = 'position:absolute;left:16px;bottom:250px;font-size:11px;letter-spacing:2px;color:#ff7733;text-shadow:0 1px 3px #000;z-index:6;';
    const label = document.createElement('div');
    label.textContent = 'THERMAL FLARE [J]';
    hudWrap.appendChild(label);
    const bar = document.createElement('div');
    bar.style.cssText = 'margin-top:3px;width:80px;height:5px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,100,40,0.35);border-radius:3px;overflow:hidden;';
    const fill = document.createElement('div');
    fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#cc3300,#ff7733);transition:width 0.08s;';
    bar.appendChild(fill);
    hudWrap.appendChild(bar);
    hud.appendChild(hudWrap);
    state._fill = fill;
  }

  function getPlayerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function getEnemies() {
    if (!window.Entities || !Array.isArray(window.Entities.list)) return [];
    const team = getPlayerTeam();
    return window.Entities.list.filter(e => !e.dead && e.team !== team);
  }

  function getCameraForward() {
    const cam = window.CAMERA;
    if (!cam) return new THREE.Vector3(0, 0, 1);
    cam.getWorldDirection(_throwDir);
    return _throwDir;
  }

  function throw_() {
    if (!state.ready) {
      if (window.FX) window.FX.message('THERMAL FLARE RECHARGING', '#ff6644');
      return;
    }
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    const p = window.Player ? window.Player.state : null;
    if (p && p.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('INSUFFICIENT STAMINA', '#ff6644');
      return;
    }
    if (p) {
      p.stamina -= STAMINA_COST;
      if (p.regenTimer !== undefined) p.regenTimer = 1.5;
    }

    state.ready = false;
    state.cd = COOLDOWN_MAX;

    const cam = window.CAMERA;
    const fwd = getCameraForward();
    const pos = cam.position.clone();
    pos.addScaledVector(fwd, 0.8);
    pos.y -= 0.3;

    const flareGroup = new THREE.Group();
    const body = new THREE.Mesh(FLARE_GEO, FLARE_MAT);
    body.castShadow = true;
    flareGroup.add(body);
    const tip = new THREE.Mesh(FLARE_TIP_GEO, FLARE_TIP_MAT);
    tip.position.y = 0.16;
    flareGroup.add(tip);
    const glow = new THREE.Mesh(FLARE_GLOW_GEO, FLARE_GLOW_MAT.clone());
    flareGroup.add(glow);
    flareGroup.userData.glow = glow;
    const trailLight = new THREE.PointLight(0xff5500, 1.2, 8, 2);
    flareGroup.add(trailLight);
    flareGroup.position.copy(pos);
    SCENE.add(flareGroup);

    const proj = {
      mesh: flareGroup,
      glow,
      light: trailLight,
      vel: fwd.clone().multiplyScalar(THROW_SPEED),
      armed: false,
      armTimer: ARM_TIME,
      active: true,
      spinPhase: Math.random() * Math.PI * 2,
    };
    state.projectiles.push(proj);

    if (window.Sound) {
      window.Sound.tone(180, 0.12, 'sawtooth', 0.2, 1200);
    }
  }

  function detonate(proj) {
    const x = proj.mesh.position.x;
    const z = proj.mesh.position.z;
    const gy = groundY(x, z);

    spawnZone(x, z, gy);

    for (let i = 0; i < 12; i++) {
      spawnSpark(x, gy + 0.2, z, 6 + Math.random() * 8);
    }
    spawnPulse(x, gy, z);

    if (window.Sound) {
      window.Sound.tone(120, 0.3, 'sawtooth', 0.35, 600);
      window.Sound.tone(80, 0.5, 'square', 0.2, 400);
    }

    SCENE.remove(proj.mesh);
    proj.active = false;
  }

  function spawnZone(x, z, gy) {
    if (state.zones.length >= MAX_ZONES) {
      const old = state.zones.shift();
      removeZoneVisuals(old);
    }

    const ground = new THREE.Mesh(ZONE_GROUND_GEO, ZONE_GROUND_MAT.clone());
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(x, gy + 0.05, z);
    ground.material.opacity = 0;
    SCENE.add(ground);

    const ring = new THREE.Mesh(ZONE_RING_GEO, ZONE_RING_MAT.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, gy + 0.06, z);
    SCENE.add(ring);

    const light = new THREE.PointLight(0xff4400, 0, LIGHT_RANGE, 2);
    light.position.set(x, gy + 3, z);
    SCENE.add(light);

    const zone = {
      x, z, gy,
      ground, ring, light,
      time: 0,
      tickAcc: 0,
      pulseAcc: 0,
      hitSet: null,
      active: true,
    };
    state.zones.push(zone);
    return zone;
  }

  function removeZoneVisuals(zone) {
    SCENE.remove(zone.ground);
    SCENE.remove(zone.ring);
    SCENE.remove(zone.light);
    zone.active = false;
    for (const f of flames) {
      if (f.zone === zone) {
        f.zone = null;
        f.active = false;
        f.inner.visible = false;
        f.outer.visible = false;
      }
    }
  }

  function spawnSpark(x, y, z, speed) {
    const s = sparks[sparkIdx];
    sparkIdx = (sparkIdx + 1) % SPARK_POOL;
    const ang = Math.random() * Math.PI * 2;
    const upBias = 0.5 + Math.random() * 0.8;
    const spd = speed * (0.6 + Math.random() * 0.6);
    s.vx = Math.cos(ang) * spd * 0.6;
    s.vy = upBias * spd;
    s.vz = Math.sin(ang) * spd * 0.6;
    s.mesh.position.set(x, y, z);
    s.mesh.material.opacity = 1;
    s.mesh.scale.setScalar(0.6 + Math.random() * 0.6);
    s.life = SPARK_LIFE * (0.7 + Math.random() * 0.5);
    s.mesh.visible = true;
    s.active = true;
  }

  function spawnSmoke(x, y, z) {
    const s = smokes[smokeIdx];
    smokeIdx = (smokeIdx + 1) % SMOKE_POOL;
    s.vx = (Math.random() - 0.5) * 0.8;
    s.vy = 0.8 + Math.random() * 0.6;
    s.vz = (Math.random() - 0.5) * 0.8;
    s.mesh.position.set(x, y, z);
    s.mesh.material.opacity = 0;
    s.mesh.scale.setScalar(0.5 + Math.random() * 0.5);
    s.life = SMOKE_LIFE;
    s.maxLife = SMOKE_LIFE;
    s.mesh.visible = true;
    s.active = true;
  }

  function spawnPulse(x, y, z) {
    const p = pulses[pulseIdx];
    pulseIdx = (pulseIdx + 1) % pulses.length;
    p.mesh.position.set(x, y + 0.08, z);
    p.mesh.scale.setScalar(0.5);
    p.mesh.material.opacity = 0.7;
    p.life = RING_LIFE;
    p.mesh.visible = true;
    p.active = true;
  }

  function spawnFlame(zone) {
    const f = flames[flameIdx];
    flameIdx = (flameIdx + 1) % FLAME_POOL;
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.random() * ZONE_RADIUS * 0.85;
    const fx = zone.x + Math.cos(ang) * dist;
    const fz = zone.z + Math.sin(ang) * dist;
    const h = 1.0 + Math.random() * 2.5;
    f.inner.position.set(fx, zone.gy + h * 0.5, fz);
    f.inner.scale.set(0.7 + Math.random() * 0.6, h / 1.8, 0.7 + Math.random() * 0.6);
    f.inner.visible = true;
    f.outer.position.copy(f.inner.position);
    f.outer.scale.copy(f.inner.scale).multiplyScalar(1.4);
    f.outer.visible = true;
    f.zone = zone;
    f.phase = Math.random() * Math.PI * 2;
    f.active = true;
  }

  function damageEntities(zone, dps) {
    const ents = getEnemies();
    const r2 = ZONE_RADIUS * ZONE_RADIUS;
    const team = getPlayerTeam();
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      const m = e.mesh;
      if (!m) continue;
      const dx = m.position.x - zone.x;
      const dz = m.position.z - zone.z;
      if (dx * dx + dz * dz > r2) continue;
      if (typeof e.takeDamage !== 'function') continue;
      const dmg = dps * TICK_INTERVAL;
      e.takeDamage(dmg, team, 'fire');
      if (window.Bleed && typeof window.Bleed.apply === 'function') {
        window.Bleed.apply(e, dmg * 0.5, 2.0);
      }
    }
  }

  function updateProjectiles(dt) {
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const p = state.projectiles[i];
      if (!p.active) {
        state.projectiles.splice(i, 1);
        continue;
      }
      p.vel.y -= GRAVITY * dt;
      p.mesh.position.x += p.vel.x * dt;
      p.mesh.position.y += p.vel.y * dt;
      p.mesh.position.z += p.vel.z * dt;

      const gy = groundY(p.mesh.position.x, p.mesh.position.z);
      if (p.mesh.position.y <= gy + 0.06) {
        p.mesh.position.y = gy + 0.06;
        if (Math.abs(p.vel.y) > 1.5) {
          p.vel.y = -p.vel.y * BOUNCE;
          p.vel.x *= FRICTION;
          p.vel.z *= FRICTION;
        } else {
          p.vel.set(0, 0, 0);
        }
      }

      p.armTimer -= dt;
      if (p.armTimer <= 0) {
        p.armed = true;
        detonate(p);
        state.projectiles.splice(i, 1);
        continue;
      }

      p.spinPhase += dt * 8;
      p.mesh.rotation.x = p.spinPhase;
      p.mesh.rotation.z = p.spinPhase * 0.7;

      const glowPulse = 0.7 + Math.sin(p.spinPhase * 3) * 0.3;
      p.glow.material.opacity = glowPulse * 0.7;
      p.glow.scale.setScalar(0.8 + glowPulse * 0.4);
      p.light.intensity = 1.0 + glowPulse;
    }
  }

  function updateZones(dt) {
    for (let zi = state.zones.length - 1; zi >= 0; zi--) {
      const zone = state.zones[zi];
      zone.time += dt;
      zone.tickAcc += dt;
      zone.pulseAcc += dt;

      const strength = Math.min(1, zone.time / 1.0);
      const fadeOut = zone.time > ZONE_DURATION - 1.5 ? Math.max(0, (ZONE_DURATION - zone.time) / 1.5) : 1;
      const dps = Math.min(MAX_DPS, BASE_DPS + zone.time * ESCALATION_RATE);

      zone.ground.material.opacity = 0.3 * strength * fadeOut;
      zone.ring.material.opacity = 0.6 * strength * fadeOut;
      zone.light.intensity = LIGHT_INTENSITY * strength * fadeOut;
      zone.light.color.setHSL(0.06, 1, 0.4 + Math.sin(zone.time * 5) * 0.08);

      if (zone.pulseAcc >= PULSE_INTERVAL) {
        zone.pulseAcc = 0;
        spawnPulse(zone.x, zone.gy, zone.z);
      }

      while (zone.tickAcc >= TICK_INTERVAL) {
        zone.tickAcc -= TICK_INTERVAL;
        if (fadeOut > 0.3) damageEntities(zone, dps);
        const flameCount = 2 + (zone.time < 2 ? 1 : 0);
        for (let f = 0; f < flameCount; f++) spawnFlame(zone);
        if (Math.random() < 0.35) spawnSmoke(
          zone.x + (Math.random() - 0.5) * ZONE_RADIUS * 0.8,
          zone.gy + 0.5,
          zone.z + (Math.random() - 0.5) * ZONE_RADIUS * 0.8
        );
      }

      if (zone.time >= ZONE_DURATION) {
        removeZoneVisuals(zone);
        state.zones.splice(zi, 1);
      }
    }
  }

  function updateFlames(dt, time) {
    for (let i = 0; i < flames.length; i++) {
      const f = flames[i];
      if (!f.active) continue;
      f.phase += dt * 8;
      const wob = Math.sin(f.phase) * 0.15;
      f.inner.rotation.z = wob;
      f.outer.rotation.z = -wob * 0.7;
      const flicker = 0.7 + Math.sin(f.phase * 2.3 + i) * 0.3;
      f.inner.material.opacity = 0.8 * flicker;
      f.outer.material.opacity = 0.4 * flicker;
      f.active = false;
    }
    for (let i = 0; i < flames.length; i++) {
      const f = flames[i];
      if (f.zone && f.zone.active) {
        f.inner.visible = true;
        f.outer.visible = true;
        f.active = true;
      } else {
        f.inner.visible = false;
        f.outer.visible = false;
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
      s.vy -= 14 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      const gy = groundY(s.mesh.position.x, s.mesh.position.z);
      if (s.mesh.position.y < gy) {
        s.mesh.position.y = gy;
        s.vy = -s.vy * 0.3;
        s.vx *= 0.5;
        s.vz *= 0.5;
      }
      s.mesh.material.opacity = Math.min(1, s.life / SPARK_LIFE);
      s.mesh.scale.setScalar(0.6 + s.life * 0.6);
    }
  }

  function updateSmokes(dt) {
    for (let i = 0; i < smokes.length; i++) {
      const s = smokes[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        s.active = false;
        continue;
      }
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.vy *= 0.96;
      const t = 1 - s.life / s.maxLife;
      s.mesh.material.opacity = Math.sin(t * Math.PI) * 0.35;
      const sc = 0.5 + t * 1.5;
      s.mesh.scale.setScalar(sc);
    }
  }

  function updatePulses(dt) {
    for (let i = 0; i < pulses.length; i++) {
      const p = pulses[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        p.active = false;
        continue;
      }
      const t = 1 - p.life / RING_LIFE;
      const scale = 0.5 + t * (ZONE_RADIUS / 0.7);
      p.mesh.scale.setScalar(scale);
      p.mesh.material.opacity = 0.7 * (1 - t);
    }
  }

  function updateHUD() {
    if (!state._fill) return;
    const frac = state.ready ? 1 : (1 - state.cd / COOLDOWN_MAX);
    state._fill.style.width = Math.round(frac * 100) + '%';
  }

  function update(dt) {
    if (state.cd > 0) {
      state.cd -= dt;
      if (state.cd <= 0) {
        state.cd = 0;
        state.ready = true;
      }
    }
    updateProjectiles(dt);
    updateZones(dt);
    updateSparks(dt);
    updateSmokes(dt);
    updatePulses(dt);
    updateHUD();
  }

  function updateFlameVisuals(dt, time) {
    updateFlames(dt, time);
  }

  function reset() {
    for (const p of state.projectiles) {
      if (p.mesh) SCENE.remove(p.mesh);
    }
    state.projectiles.length = 0;
    for (const z of state.zones) removeZoneVisuals(z);
    state.zones.length = 0;
    for (const f of flames) { f.active = false; f.zone = null; f.inner.visible = false; f.outer.visible = false; }
    for (const s of sparks) { s.active = false; s.mesh.visible = false; }
    for (const s of smokes) { s.active = false; s.mesh.visible = false; }
    for (const p of pulses) { p.active = false; p.mesh.visible = false; }
    state.cd = 0;
    state.ready = true;
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'j' && e.key !== 'J') return;
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    if (!window.Player || !Player.state.locked) return;
    throw_();
  });

  return { update, updateFlameVisuals, reset, throw_, state };
})();

window.ThermalFlare = ThermalFlare;