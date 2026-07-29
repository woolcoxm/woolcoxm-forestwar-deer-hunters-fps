// mortars.js — FORESTWAR static mortars: periodic bombardment of the forest with telegraphed shells
const THREE = window.THREE;
const SCENE = window.SCENE;
const Mortars = (() => {
  const MORTAR_HP = 400;
  const FIRE_INTERVAL = 6.5;
  const BARRAGE_COUNT = 4;
  const BARRAGE_SPACING = 0.5;
  const SHELL_DAMAGE = 55;
  const SHELL_RADIUS = 4.5;
  const SHELL_TRAVEL_TIME = 1.6;
  const MARKER_TIME = 1.0;
  const TARGETS_PER_BARRAGE = 3;
  const TARGET_RADIUS = 35;
  const FLASH_DURATION = 0.3;
  const CENTER_DAMAGE_MULT = 2.0;
  const EDGE_DAMAGE_FRAC = 0.35;

  const positions = [
    { x: -95, z: 90 },
    { x: -105, z: 70 },
    { x: -80, z: 105 },
  ];

  const instances = [];
  const markers = [];
  const shells = [];

  const BASE_GEO = new THREE.CylinderGeometry(0.5, 0.7, 0.4, 10);
  const BASE_MAT = new THREE.MeshStandardMaterial({ color: 0x3a3a30, roughness: 0.8, metalness: 0.4 });
  const TUBE_GEO = new THREE.CylinderGeometry(0.18, 0.22, 1.4, 8);
  const TUBE_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2a22, roughness: 0.6, metalness: 0.7 });
  const LEG_GEO = new THREE.BoxGeometry(0.08, 0.7, 0.08);
  const LEG_MAT = new THREE.MeshStandardMaterial({ color: 0x4a4a3a, roughness: 0.8 });
  const SMOKE_GEO = new THREE.SphereGeometry(0.3, 6, 5);
  const SMOKE_MAT = new THREE.MeshBasicMaterial({ color: 0x999999, transparent: true, opacity: 0, depthWrite: false });

  const MARKER_GEO = new THREE.RingGeometry(0.5, SHELL_RADIUS, 24);
  const MARKER_MAT = new THREE.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });

  const SHELL_GEO = new THREE.CylinderGeometry(0.12, 0.12, 0.4, 6);
  SHELL_GEO.rotateX(Math.PI / 2);
  const SHELL_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2a1e, roughness: 0.5, metalness: 0.5 });
  const FLASH_GEO = new THREE.SphereGeometry(SHELL_RADIUS, 10, 8);
  const FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });

  const SPARK_GEO = new THREE.SphereGeometry(0.15, 4, 3);
  const SPARK_MAT = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

  for (let i = 0; i < 12; i++) {
    const ring = new THREE.Mesh(MARKER_GEO, MARKER_MAT.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    ring.frustumCulled = false;
    SCENE.add(ring);
    markers.push({ mesh: ring, life: 0, active: false });
  }

  for (let i = 0; i < 6; i++) {
    const mesh = new THREE.Mesh(SHELL_GEO, SHELL_MAT);
    mesh.castShadow = true;
    mesh.visible = false;
    SCENE.add(mesh);
    shells.push({ mesh, active: false, sx: 0, sy: 0, sz: 0, tx: 0, tz: 0, t: 0 });
  }

  const smokes = [];
  for (let i = 0; i < 12; i++) {
    const mesh = new THREE.Mesh(SMOKE_GEO, SMOKE_MAT.clone());
    mesh.visible = false;
    mesh.frustumCulled = false;
    SCENE.add(mesh);
    smokes.push({ mesh, life: 0, active: false });
  }

  const flashes = [];
  for (let i = 0; i < 6; i++) {
    const mesh = new THREE.Mesh(FLASH_GEO, FLASH_MAT.clone());
    mesh.visible = false;
    mesh.frustumCulled = false;
    SCENE.add(mesh);
    flashes.push({ mesh, life: 0, active: false });
  }

  const sparks = [];
  for (let i = 0; i < 36; i++) {
    const mesh = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    mesh.visible = false;
    mesh.frustumCulled = false;
    SCENE.add(mesh);
    sparks.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0, active: false });
  }

  function getGroundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function buildMortar(pos) {
    const group = new THREE.Group();
    const gy = getGroundY(pos.x, pos.z);
    group.position.set(pos.x, gy, pos.z);
    const base = new THREE.Mesh(BASE_GEO, BASE_MAT);
    base.castShadow = true;
    base.position.y = 0.2;
    group.add(base);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(LEG_GEO, LEG_MAT);
      leg.position.set(sx * 0.35, 0.35, 0);
      leg.rotation.z = sx * 0.15;
      group.add(leg);
    }
    const tube = new THREE.Mesh(TUBE_GEO, TUBE_MAT);
    tube.castShadow = true;
    tube.position.set(0, 0.95, -0.1);
    tube.rotation.x = -1.1;
    group.add(tube);
    const inst = {
      mesh: group,
      x: pos.x, z: pos.z,
      hp: MORTAR_HP, maxHp: MORTAR_HP,
      fireTimer: FIRE_INTERVAL * (0.4 + Math.random() * 0.6),
      barrageLeft: 0,
      barrageTimer: 0,
      targets: [],
      smokeIdx: 0,
      alive: true,
    };
    SCENE.add(group);
    instances.push(inst);
  }

  function spawnSmoke(x, y, z, inst) {
    const slot = smokes[inst.smokeIdx];
    inst.smokeIdx = (inst.smokeIdx + 1) % smokes.length;
    slot.mesh.position.set(x, y, z);
    slot.mesh.scale.setScalar(0.5);
    slot.mesh.material.opacity = 0.6;
    slot.mesh.visible = true;
    slot.life = 0.8;
    slot.active = true;
  }

  function getMarker() {
    for (const m of markers) {
      if (!m.active) return m;
    }
    return markers[0];
  }

  function getShell() {
    for (const s of shells) {
      if (!s.active) return s;
    }
    return null;
  }

  function getFlash() {
    for (const f of flashes) {
      if (!f.active) return f;
    }
    return flashes[0];
  }

  function getSpark() {
    for (const s of sparks) {
      if (!s.active) return s;
    }
    return sparks[0];
  }

  function sparkBurst(x, y, z, count) {
    for (let i = 0; i < count; i++) {
      const s = getSpark();
      if (!s) return;
      const ang = Math.random() * Math.PI * 2;
      const spd = 5 + Math.random() * 8;
      s.vx = Math.cos(ang) * spd;
      s.vy = 3 + Math.random() * 6;
      s.vz = Math.sin(ang) * spd;
      s.mesh.position.set(x, y, z);
      s.mesh.material.opacity = 0.9;
      s.life = 0.4 + Math.random() * 0.3;
      s.mesh.visible = true;
      s.active = true;
    }
  }

  function pickTargets(inst) {
    inst.targets.length = 0;
    const ents = window.Entities ? window.Entities.list : [];
    const candidates = [];
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead) continue;
      const dx = e.mesh.position.x - inst.x;
      const dz = e.mesh.position.z - inst.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < TARGET_RADIUS * TARGET_RADIUS) candidates.push(e.mesh.position);
    }
    if (window.CAMERA && window.Player && window.Player.state && window.Player.state.locked) {
      const cam = window.CAMERA.position;
      const dx = cam.x - inst.x;
      const dz = cam.z - inst.z;
      if (dx * dx + dz * dz < TARGET_RADIUS * TARGET_RADIUS) candidates.push(cam);
    }
    if (candidates.length === 0) {
      for (let i = 0; i < TARGETS_PER_BARRAGE; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 8 + Math.random() * (TARGET_RADIUS - 8);
        inst.targets.push({ x: inst.x + Math.cos(a) * r, z: inst.z + Math.sin(a) * r });
      }
      return;
    }
    for (let i = 0; i < TARGETS_PER_BARRAGE; i++) {
      const base = candidates[(Math.random() * candidates.length) | 0];
      const jitter = 4 + Math.random() * 6;
      const ja = Math.random() * Math.PI * 2;
      inst.targets.push({ x: base.x + Math.cos(ja) * jitter, z: base.z + Math.sin(ja) * jitter });
    }
  }

  function launchShell(inst, tx, tz) {
    const shell = getShell();
    if (!shell) return;
    const sx = inst.x + (Math.random() - 0.5) * 0.3;
    const sz = inst.z + (Math.random() - 0.5) * 0.3;
    shell.mesh.visible = true;
    shell.mesh.position.set(sx, getGroundY(sx, sz) + 1.2, sz);
    shell.active = true;
    shell.sx = sx;
    shell.sy = getGroundY(sx, sz) + 1.2;
    shell.sz = sz;
    shell.tx = tx;
    shell.tz = tz;
    shell.t = 0;
    spawnSmoke(sx, shell.sy, sz, inst);
    if (window.Sound) {
      window.Sound.tone(120, 0.18, 'square', 0.25, 600);
      window.Sound.tone(80, 0.3, 'sawtooth', 0.15, 400);
    }
  }

  function detonate(x, z) {
    const gy = getGroundY(x, z);
    const flash = getFlash();
    flash.mesh.position.set(x, gy + 0.5, z);
    flash.mesh.scale.setScalar(1);
    flash.mesh.material.opacity = 0.85;
    flash.mesh.visible = true;
    flash.life = FLASH_DURATION;
    flash.active = true;
    sparkBurst(x, gy + 0.5, z, 10);
    if (window.Craters) window.Craters.create(x, z, SHELL_RADIUS);
    if (window.Sound) {
      window.Sound.tone(60, 0.35, 'sawtooth', 0.4, 400);
      window.Sound.tone(40, 0.5, 'square', 0.25, 200);
      if (window.Sound.boom) window.Sound.boom(x, z, SHELL_RADIUS * 2);
    }
    const r2 = SHELL_RADIUS * SHELL_RADIUS;
    const ents = window.Entities ? window.Entities.list : [];
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead) continue;
      const dx = e.mesh.position.x - x;
      const dz = e.mesh.position.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      const distFrac = Math.sqrt(d2) / SHELL_RADIUS;
      const dmgFrac = EDGE_DAMAGE_FRAC + (1 - distFrac) * (CENTER_DAMAGE_MULT - EDGE_DAMAGE_FRAC);
      const dmg = SHELL_DAMAGE * dmgFrac;
      if (e.takeDamage) e.takeDamage(dmg, 'explosion');
      else { e.hp -= dmg; if (e.hp <= 0 && e.die) e.die(); }
      if (window.Bleed && e.takeDamage) window.Bleed.apply(e, 2);
    }
    if (window.Manager && window.Manager.state && window.CAMERA && window.Player && window.Player.state) {
      const cam = window.CAMERA.position;
      const dx = cam.x - x;
      const dz = cam.z - z;
      const pd2 = dx * dx + dz * dz;
      if (pd2 < r2) {
        const distFrac = Math.sqrt(pd2) / SHELL_RADIUS;
        const dmgFrac = EDGE_DAMAGE_FRAC + (1 - distFrac) * (CENTER_DAMAGE_MULT - EDGE_DAMAGE_FRAC);
        Manager.state.playerHp -= SHELL_DAMAGE * dmgFrac * 0.6;
        if (window.FX) window.FX.shake(0.3);
        if (window.Radar) window.Radar.damageFrom(x, z);
      } else if (pd2 < (SHELL_RADIUS + 4) * (SHELL_RADIUS + 4)) {
        if (window.FX) window.FX.shake(0.12);
      }
    }
    if (window.Suppression) {
      window.Suppression.applyExplosion(x, z, 'deer');
      window.Suppression.applyExplosion(x, z, 'hunter');
    }
  }

  function showMarker(x, z) {
    const m = getMarker();
    m.mesh.position.set(x, getGroundY(x, z) + 0.1, z);
    m.mesh.scale.setScalar(0.5);
    m.mesh.material.opacity = 0.7;
    m.mesh.visible = true;
    m.life = SHELL_TRAVEL_TIME;
    m.active = true;
  }

  function damageMortar(inst, amount) {
    inst.hp -= amount;
    if (inst.hp <= 0 && inst.alive) {
      inst.alive = false;
      if (window.Craters) window.Craters.create(inst.x, inst.z, 3.5);
      sparkBurst(inst.x, getGroundY(inst.x, inst.z) + 0.5, inst.z, 20);
      if (window.Sound) {
        window.Sound.tone(50, 0.6, 'sawtooth', 0.4, 300);
        if (window.Sound.boom) window.Sound.boom(inst.x, inst.z, 8);
      }
      if (window.FX) window.FX.shake(0.2);
    }
  }

  function update(dt) {
    for (let i = instances.length - 1; i >= 0; i--) {
      const inst = instances[i];
      if (!inst.alive) {
        SCENE.remove(inst.mesh);
        instances.splice(i, 1);
        continue;
      }
      inst.fireTimer -= dt;
      if (inst.fireTimer <= 0 && inst.barrageLeft === 0) {
        inst.fireTimer = FIRE_INTERVAL;
        inst.barrageLeft = BARRAGE_COUNT;
        inst.barrageTimer = 0;
        pickTargets(inst);
        for (const t of inst.targets) showMarker(t.x, t.z);
      }
      if (inst.barrageLeft > 0) {
        inst.barrageTimer -= dt;
        if (inst.barrageTimer <= 0) {
          inst.barrageTimer = BARRAGE_SPACING;
          const idx = (BARRAGE_COUNT - inst.barrageLeft) % inst.targets.length;
          const t = inst.targets[idx];
          if (t) launchShell(inst, t.x, t.z);
          inst.barrageLeft--;
        }
      }
    }

    for (const m of markers) {
      if (!m.active) continue;
      m.life -= dt;
      if (m.life <= 0) {
        m.active = false;
        m.mesh.visible = false;
        continue;
      }
      const grow = 1 - m.life / SHELL_TRAVEL_TIME;
      const pulse = 0.7 + 0.3 * Math.sin(m.life * 16);
      m.mesh.scale.setScalar(0.5 + grow * 0.5);
      m.mesh.material.opacity = pulse * (m.life / SHELL_TRAVEL_TIME + 0.3);
    }

    for (const s of shells) {
      if (!s.active) continue;
      s.t += dt;
      const f = s.t / SHELL_TRAVEL_TIME;
      if (f >= 1) {
        s.active = false;
        s.mesh.visible = false;
        detonate(s.tx, s.tz);
        continue;
      }
      const gy = getGroundY(s.tx, s.tz);
      s.mesh.position.x = s.sx + (s.tx - s.sx) * f;
      s.mesh.position.z = s.sz + (s.tz - s.sz) * f;
      const peakH = 14;
      s.mesh.position.y = s.sy + (gy - s.sy) * f + 4 * peakH * f * (1 - f);
      s.mesh.rotation.x += dt * 12;
      s.mesh.rotation.z += dt * 8;
    }

    for (const s of smokes) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.mesh.position.y += dt * 3;
      s.mesh.scale.addScalar(dt * 1.5);
      s.mesh.material.opacity = (s.life / 0.8) * 0.6;
    }

    for (const f of flashes) {
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.active = false;
        f.mesh.visible = false;
        continue;
      }
      const t = f.life / FLASH_DURATION;
      f.mesh.material.opacity = t * 0.85;
      f.mesh.scale.setScalar(1 + (1 - t) * 2);
    }

    for (const s of sparks) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.vy -= 20 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.material.opacity = Math.min(1, s.life * 2.5);
    }
  }

  function init() {
    for (const p of positions) buildMortar(p);
    if (window.RayWeapons) window.RayWeapons.addStaticTargets(instances, damageMortar);
  }

  function reset() {
    for (const inst of instances) {
      if (inst.mesh.parent) SCENE.remove(inst.mesh);
    }
    instances.length = 0;
    for (const m of markers) { m.active = false; m.mesh.visible = false; }
    for (const s of shells) { s.active = false; s.mesh.visible = false; }
    for (const s of smokes) { s.active = false; s.mesh.visible = false; }
    for (const f of flashes) { f.active = false; f.mesh.visible = false; }
    for (const s of sparks) { s.active = false; s.mesh.visible = false; }
    for (const p of positions) buildMortar(p);
  }

  return { init, update, reset, state: { instances } };
})();

window.Mortars = Mortars;