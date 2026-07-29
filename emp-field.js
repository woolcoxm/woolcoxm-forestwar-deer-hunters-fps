// emp-field.js — FORESTWAR throwable EMP emitter: creates a static dome that disrupts enemy weapons and aim
const THREE = window.THREE;
const SCENE = window.SCENE;
const EMPField = (() => {
  const THROW_SPEED = 24;
  const GRAVITY = 18;
  const BOUNCE = 0.35;
  const FRICTION = 0.8;
  const ARM_TIME = 0.5;
  const DURATION = 9.0;
  const RADIUS = 8.5;
  const COOLDOWN_MAX = 20;
  const STAMINA_COST = 35;
  const MAX_FIELDS = 4;
  const PULSE_INTERVAL = 0.5;
  const ARC_INTERVAL = 0.12;
  const ARC_SEGMENTS = 8;
  const ARC_POOL = 18;
  const SPARK_POOL = 16;
  const SPARK_LIFE = 0.35;
  const DISRUPT_FIRERATE = 0.45;
  const DISRUPT_SPREAD = 2.8;
  const DISRUPT_AIM_JITTER = 0.18;
  const DISRUPT_SPEED = 0.6;
  const LERP_RATE = 8.0;

  const state = {
    cd: 0,
    ready: true,
    projectiles: [],
    fields: [],
    pulseTimer: 0,
    arcTimer: 0,
  };

  const _throwDir = new THREE.Vector3();
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  // ---- Visual assets --------------------------------------------------------
  const SHELL_GEO = new THREE.IcosahedronGeometry(0.22, 0);
  const SHELL_MAT = new THREE.MeshStandardMaterial({
    color: 0x1a2a4a, roughness: 0.3, metalness: 0.8,
    emissive: 0x004488, emissiveIntensity: 0.5,
  });
  const RING_GEO = new THREE.RingGeometry(0.06, 0.1, 6);
  const RING_MAT = new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.7 });

  const DOME_GEO = new THREE.SphereGeometry(RADIUS, 16, 10);
  const DOME_MAT = new THREE.MeshBasicMaterial({
    color: 0x3399dd, transparent: true, opacity: 0,
    side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  const FLOOR_RING_GEO = new THREE.RingGeometry(RADIUS - 0.4, RADIUS, 48);
  const FLOOR_RING_MAT = new THREE.MeshBasicMaterial({
    color: 0x66bbff, transparent: true, opacity: 0.3,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  const PULSE_GEO = new THREE.RingGeometry(0.5, 0.8, 32);
  const PULSE_MAT = new THREE.MeshBasicMaterial({
    color: 0x99ddff, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  const CORE_GEO = new THREE.IcosahedronGeometry(0.4, 0);
  const CORE_MAT = new THREE.MeshBasicMaterial({
    color: 0xaaeeff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
  });

  const ARC_LINE_GEO = new THREE.BufferGeometry();
  ARC_LINE_GEO.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ARC_SEGMENTS + 1) * 3), 3));
  const ARC_LINE_MAT = new THREE.LineBasicMaterial({
    color: 0xaaeeff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  const arcs = [];
  for (let i = 0; i < ARC_POOL; i++) {
    const line = new THREE.Line(ARC_LINE_GEO.clone(), ARC_LINE_MAT.clone());
    line.frustumCulled = false;
    line.visible = false;
    SCENE.add(line);
    arcs.push({ line, life: 0, active: false });
  }
  let arcIdx = 0;

  const SPARK_GEO = new THREE.SphereGeometry(0.1, 4, 3);
  const SPARK_MAT = new THREE.MeshBasicMaterial({
    color: 0x99ccff, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sparks = [];
  for (let i = 0; i < SPARK_POOL; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, active: false });
  }
  let sparkIdx = 0;

  const FLICKER_LIGHT = new THREE.PointLight(0x66bbff, 0, RADIUS * 1.5, 2);
  FLICKER_LIGHT.visible = false;
  SCENE.add(FLICKER_LIGHT);

  // ---- HUD ------------------------------------------------------------------
  const hud = document.getElementById('hud');
  const hudWrap = document.createElement('div');
  hudWrap.style.cssText = 'position:absolute;left:16px;bottom:200px;font-size:11px;letter-spacing:2px;color:#66ddff;text-shadow:0 0 6px rgba(80,180,255,0.4),0 1px 3px #000;z-index:6;';
  const hudLabel = document.createElement('div');
  hudLabel.textContent = 'EMP FIELD [J]';
  hudWrap.appendChild(hudLabel);
  const hudBar = document.createElement('div');
  hudBar.style.cssText = 'margin-top:3px;width:80px;height:5px;background:rgba(0,0,0,0.5);border:1px solid rgba(80,180,255,0.3);border-radius:3px;overflow:hidden;';
  const hudFill = document.createElement('div');
  hudFill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#2266aa,#66ddff);transition:width 0.05s;';
  hudBar.appendChild(hudFill);
  hudWrap.appendChild(hudBar);
  if (hud) hud.appendChild(hudWrap);

  // ---- Projectile -----------------------------------------------------------
  function buildProjectile() {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(SHELL_GEO, SHELL_MAT);
    shell.castShadow = true;
    g.add(shell);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(RING_GEO, RING_MAT.clone());
      ring.rotation.x = (i / 3) * Math.PI;
      ring.rotation.z = (i / 3) * Math.PI * 0.7;
      g.add(ring);
    }
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x66bbff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(glow);
    SCENE.add(g);
    return { mesh: g, vel: new THREE.Vector3(), armed: false, timer: 0, light: null };
  }

  function buildField(x, z) {
    const g = new THREE.Group();
    g.position.set(x, groundY(x, z), z);

    const emitter = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.4, 0.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.6, metalness: 0.7 })
    );
    base.position.y = 0.1;
    emitter.add(base);
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.5, 5),
      new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.8 })
    );
    post.position.y = 0.45;
    emitter.add(post);
    const core = new THREE.Mesh(CORE_GEO, CORE_MAT.clone());
    core.position.y = 0.8;
    emitter.add(core);
    g.add(emitter);

    const dome = new THREE.Mesh(DOME_GEO, DOME_MAT.clone());
    dome.position.y = RADIUS;
    dome.scale.y = 0.7;
    g.add(dome);

    const floorRing = new THREE.Mesh(FLOOR_RING_GEO, FLOOR_RING_MAT.clone());
    floorRing.rotation.x = -Math.PI / 2;
    floorRing.position.y = 0.05;
    g.add(floorRing);

    const pulse = new THREE.Mesh(PULSE_GEO, PULSE_MAT.clone());
    pulse.rotation.x = -Math.PI / 2;
    pulse.position.y = 0.06;
    pulse.visible = false;
    g.add(pulse);

    SCENE.add(g);
    return {
      group: g, emitter, core, dome, floorRing, pulse,
      x, z, timer: DURATION, pulseT: PULSE_INTERVAL, domePhase: 0, alive: true,
    };
  }

  // ---- Throw ----------------------------------------------------------------
  function throwEMP() {
    if (state.cd > 0 || !state.ready) return;
    const p = window.Player ? window.Player.state : null;
    if (!p || !p.locked) return;
    if (p.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('TOO EXHAUSTED', '#ff6644');
      return;
    }
    p.stamina -= STAMINA_COST;
    if (p.regenTimer !== undefined) p.regenTimer = 1.5;

    const cam = window.CAMERA;
    cam.getWorldDirection(_throwDir);
    _throwDir.normalize();

    const proj = buildProjectile();
    proj.mesh.position.copy(cam.position).addScaledVector(_throwDir, 1.0);
    proj.vel.copy(_throwDir).multiplyScalar(THROW_SPEED);
    proj.vel.y += 4.0;
    state.projectiles.push(proj);

    state.ready = false;
    state.cd = COOLDOWN_MAX;

    if (window.Sound) {
      window.Sound.tone(180, 0.15, 'square', 0.2, 1600);
      window.Sound.tone(380, 0.08, 'sine', 0.15, 2400);
    }
  }

  // ---- Projectile update ----------------------------------------------------
  function updateProjectile(proj, dt) {
    proj.vel.y -= GRAVITY * dt;
    proj.mesh.position.addScaledVector(proj.vel, dt);
    proj.mesh.rotation.x += dt * 6;
    proj.mesh.rotation.y += dt * 4;

    const pos = proj.mesh.position;
    const gy = groundY(pos.x, pos.z);

    if (pos.y <= gy + 0.15) {
      pos.y = gy + 0.15;
      if (proj.vel.y < 0) proj.vel.y = -proj.vel.y * BOUNCE;
      proj.vel.x *= FRICTION;
      proj.vel.z *= FRICTION;
      if (proj.vel.lengthSq() < 1.5) {
        proj.vel.set(0, 0, 0);
        proj.armed = true;
      }
    }

    proj.timer += dt;
    if (proj.armed && proj.timer >= ARM_TIME) {
      deployField(pos.x, pos.z);
      proj.mesh.visible = false;
      SCENE.remove(proj.mesh);
      return false;
    }

    const speed = proj.vel.length();
    if (speed < 1.5 && proj.armed) {
      const blink = Math.sin(proj.timer * 18) > 0;
      proj.mesh.scale.setScalar(blink ? 1.3 : 1.0);
    }

    return true;
  }

  function deployField(x, z) {
    if (state.fields.length >= MAX_FIELDS) {
      const old = state.fields.shift();
      if (old.group.parent) SCENE.remove(old.group);
    }
    state.fields.push(buildField(x, z));

    for (let i = 0; i < 12; i++) spawnSpark(x, groundY(x, z) + 0.8, z);

    if (window.Sound) {
      window.Sound.tone(120, 0.4, 'sawtooth', 0.35, 600);
      window.Sound.tone(600, 0.15, 'square', 0.2, 2000);
    }
    if (window.FX) window.FX.message('EMP FIELD ACTIVE', '#66ddff');
  }

  // ---- Field update ---------------------------------------------------------
  function updateField(field, dt) {
    field.timer -= dt;
    if (field.timer <= 0) {
      if (field.group.parent) SCENE.remove(field.group);
      field.alive = false;
      return false;
    }

    field.domePhase += dt * 2.0;
    const fade = Math.min(1, field.timer / 1.5);
    const flicker = 0.12 + Math.sin(field.domePhase * 3.5) * 0.04 + Math.sin(field.domePhase * 11.3) * 0.02;
    field.dome.material.opacity = Math.max(0, flicker * fade);
    field.emitter.rotation.y += dt * 2.0;
    field.core.rotation.y += dt * 4;
    field.core.rotation.x += dt * 2;

    FLICKER_LIGHT.position.set(field.x, groundY(field.x, field.z) + 4, field.z);
    FLICKER_LIGHT.intensity = (2.5 + Math.sin(field.domePhase * 5) * 1.5) * fade;
    FLICKER_LIGHT.visible = true;

    field.pulseT -= dt;
    if (field.pulseT <= 0) {
      field.pulseT = PULSE_INTERVAL;
      field.pulse.position.set(0, 0.06, 0);
      field.pulse.scale.setScalar(0.3);
      field.pulse.material.opacity = 0.6 * fade;
      field.pulse.visible = true;
    }
    if (field.pulse.visible) {
      const sc = field.pulse.scale.x + dt * 18;
      field.pulse.scale.setScalar(sc);
      field.pulse.material.opacity *= (1 - dt * 3);
      if (sc > RADIUS || field.pulse.material.opacity < 0.01) field.pulse.visible = false;
    }

    applyDisruption(field, dt, fade);

    return true;
  }

  function applyDisruption(field, dt, fade) {
    const ents = window.Entities && window.Entities.list;
    if (!ents) return;
    const r2 = RADIUS * RADIUS;
    const mult = fade;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.team === 'none') continue;
      const m = e.mesh;
      if (!m) continue;
      const dx = m.position.x - field.x;
      const dz = m.position.z - field.z;
      if (dx * dx + dz * dz <= r2) {
        if (e.empDisrupt === undefined) e.empDisrupt = 0;
        e.empDisrupt = mult;
      }
    }
  }

  // ---- Arc effects ----------------------------------------------------------
  function spawnArcs() {
    for (let i = 0; i < state.fields.length; i++) {
      const f = state.fields[i];
      if (!f.alive) continue;
      const slot = arcs[arcIdx];
      arcIdx = (arcIdx + 1) % ARC_POOL;
      const fy = groundY(f.x, f.z) + 0.8;
      _v1.set(f.x + (Math.random() - 0.5) * RADIUS * 0.8, fy, f.z + (Math.random() - 0.5) * RADIUS * 0.8);
      _v2.set(f.x + (Math.random() - 0.5) * RADIUS * 1.2, fy + Math.random() * RADIUS * 0.6, f.z + (Math.random() - 0.5) * RADIUS * 1.2);
      buildArc(slot, _v1, _v2);
      slot.active = true;
      slot.life = 0.15;
      slot.line.visible = true;
    }
  }

  function buildArc(slot, a, b) {
    const pos = slot.line.geometry.attributes.position;
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = i / ARC_SEGMENTS;
      const px = a.x + (b.x - a.x) * t + (Math.random() - 0.5) * 0.4 * (1 - Math.abs(t - 0.5) * 2);
      const py = a.y + (b.y - a.y) * t + (Math.random() - 0.5) * 0.4 * (1 - Math.abs(t - 0.5) * 2);
      const pz = a.z + (b.z - a.z) * t + (Math.random() - 0.5) * 0.4 * (1 - Math.abs(t - 0.5) * 2);
      pos.setXYZ(i, px, py, pz);
    }
    pos.needsUpdate = true;
    slot.line.material.opacity = 0.7 + Math.random() * 0.3;
  }

  function updateArcs(dt) {
    for (let i = 0; i < arcs.length; i++) {
      const a = arcs[i];
      if (!a.active) continue;
      a.life -= dt;
      if (a.life <= 0) {
        a.active = false;
        a.line.visible = false;
      } else {
        a.line.material.opacity = (a.life / 0.15) * 0.8;
      }
    }
  }

  function spawnSpark(x, y, z) {
    const s = sparks[sparkIdx];
    sparkIdx = (sparkIdx + 1) % SPARK_POOL;
    const ang = Math.random() * Math.PI * 2;
    const spd = 3 + Math.random() * 5;
    s.vx = Math.cos(ang) * spd;
    s.vy = 2 + Math.random() * 4;
    s.vz = Math.sin(ang) * spd;
    s.mesh.position.set(x, y, z);
    s.mesh.material.opacity = 1;
    s.mesh.scale.setScalar(0.5 + Math.random() * 0.8);
    s.mesh.visible = true;
    s.life = SPARK_LIFE;
    s.active = true;
  }

  function updateSparks(dt) {
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.vy -= 14 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.material.opacity = s.life / SPARK_LIFE;
    }
  }

  // ---- HUD update -----------------------------------------------------------
  function updateHUD() {
    const frac = state.ready ? 1 : (1 - state.cd / COOLDOWN_MAX);
    hudFill.style.width = (frac * 100) + '%';
    hudFill.style.background = state.ready
      ? 'linear-gradient(90deg,#2266aa,#66ddff)'
      : 'linear-gradient(90deg,#444466,#666688)';
  }

  // ---- Input ----------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'j' && e.key !== 'J') return;
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    if (!window.Player || !Player.state.locked) return;
    throwEMP();
  });

  // ---- Public API -----------------------------------------------------------
  function update(dt) {
    if (state.cd > 0) {
      state.cd -= dt;
      if (state.cd <= 0) {
        state.cd = 0;
        state.ready = true;
      }
    }
    updateHUD();

    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      if (!updateProjectile(state.projectiles[i], dt)) {
        state.projectiles.splice(i, 1);
      }
    }

    for (let i = state.fields.length - 1; i >= 0; i--) {
      if (!updateField(state.fields[i], dt)) {
        state.fields.splice(i, 1);
      }
    }

    state.arcTimer -= dt;
    if (state.arcTimer <= 0) {
      state.arcTimer = ARC_INTERVAL;
      spawnArcs();
    }
    updateArcs(dt);
    updateSparks(dt);

    if (state.fields.length === 0) {
      FLICKER_LIGHT.visible = false;
    }
  }

  function getDisruption(entity) {
    if (entity && entity.empDisrupt && entity.empDisrupt > 0) {
      const d = entity.empDisrupt;
      entity.empDisrupt = Math.max(0, d - 0.05);
      return d;
    }
    return 0;
  }

  function reset() {
    for (const p of state.projectiles) {
      if (p.mesh.parent) SCENE.remove(p.mesh);
    }
    state.projectiles.length = 0;
    for (const f of state.fields) {
      if (f.group.parent) SCENE.remove(f.group);
    }
    state.fields.length = 0;
    state.cd = 0;
    state.ready = true;
    FLICKER_LIGHT.visible = false;
  }

  return { update, reset, getDisruption, state };
})();

window.EMPField = EMPField;