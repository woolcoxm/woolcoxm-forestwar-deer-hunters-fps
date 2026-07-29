// portals.js — FORESTWAR comeback portal: spawns near the losing team's objective, floods reinforcements through a destroyable rift
const THREE = window.THREE;
const SCENE = window.SCENE;
const Portals = (() => {
  const DEFICIT_THRESHOLD = 8;
  const CHECK_INTERVAL = 10;
  const LIFETIME = 18;
  const SPAWN_INTERVAL = 2.2;
  const SPAWNS_PER_TICK = 2;
  const MAX_SPAWNS = 12;
  const PORTAL_HP = 350;
  const PORTAL_RADIUS = 3.0;
  const PORTAL_HEIGHT = 5.5;
  const RING_SEGMENTS = 32;
  const PARTICLE_COUNT = 24;
  const SPAWN_PROXIMITY = 50;
  const PLAYER_WARN_DIST = 60;

  const state = {
    active: null,
    checkTimer: CHECK_INTERVAL,
    lastDeficit: 0,
  };

  const RIFT_GEO = new THREE.TorusGeometry(PORTAL_RADIUS, 0.3, 8, RING_SEGMENTS);
  const RIFT_MAT_DEER = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const RIFT_MAT_HUNTER = new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });

  const DISC_GEO = new THREE.CircleGeometry(PORTAL_RADIUS * 0.85, 24);
  const DISC_MAT_DEER = new THREE.MeshBasicMaterial({ color: 0xf0c98a, transparent: true, opacity: 0.25, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const DISC_MAT_HUNTER = new THREE.MeshBasicMaterial({ color: 0xc9d8ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });

  const CORE_GEO = new THREE.SphereGeometry(0.5, 12, 10);
  const CORE_MAT_DEER = new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const CORE_MAT_HUNTER = new THREE.MeshBasicMaterial({ color: 0x99ccff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });

  const SPARK_GEO = new THREE.SphereGeometry(0.15, 5, 4);
  const SPARK_MAT_DEER = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const SPARK_MAT_HUNTER = new THREE.MeshBasicMaterial({ color: 0x77bbff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });

  const RING_GEO = new THREE.RingGeometry(PORTAL_RADIUS + 0.2, PORTAL_RADIUS + 0.5, 32);
  const GROUND_RING_DEER = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const GROUND_RING_HUNTER = new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });

  const SHOCK_GEO = new THREE.RingGeometry(0.5, 1.0, 32);
  const SHOCK_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });

  const particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const matDeer = SPARK_MAT_DEER.clone();
    const matHunt = SPARK_MAT_HUNTER.clone();
    const m = new THREE.Mesh(SPARK_GEO, matDeer);
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    particles.push({ mesh: m, matDeer, matHunt, angle: (i / PARTICLE_COUNT) * Math.PI * 2, speed: 1.5 + Math.random() * 2.0, height: Math.random() * PORTAL_HEIGHT, active: false });
  }

  const shockRing = new THREE.Mesh(SHOCK_GEO, SHOCK_MAT.clone());
  shockRing.rotation.x = -Math.PI / 2;
  shockRing.visible = false;
  shockRing.frustumCulled = false;
  SCENE.add(shockRing);
  let shockT = 0;

  const LIGHT = new THREE.PointLight(0xffaa44, 0, 15, 2);
  LIGHT.visible = false;
  SCENE.add(LIGHT);

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;top:18%;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;z-index:6;opacity:0;transition:opacity 0.4s;';
  const hudTitle = document.createElement('div');
  hudTitle.style.cssText = 'font-size:22px;font-weight:bold;letter-spacing:6px;text-shadow:0 0 14px currentColor,0 2px 6px #000;';
  hud.appendChild(hudTitle);
  const hudSub = document.createElement('div');
  hudSub.style.cssText = 'font-size:12px;letter-spacing:3px;margin-top:4px;color:#ccc;text-shadow:0 1px 4px #000;';
  hudSub.textContent = 'COMEBACK PORTAL OPEN';
  hud.appendChild(hudSub);
  const hpWrap = document.createElement('div');
  hpWrap.style.cssText = 'margin:6px auto 0;width:180px;height:6px;background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.3);border-radius:3px;overflow:hidden;';
  const hpFill = document.createElement('div');
  hpFill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#ff6644,#ffaa44);transition:width 0.1s;';
  hpWrap.appendChild(hpFill);
  hud.appendChild(hpWrap);
  document.getElementById('hud').appendChild(hud);

  let hudTimer = 0;

  const _v = new THREE.Vector3();
  const _camPos = new THREE.Vector3();

  function getScoreGap() {
    if (!window.Manager || !window.Manager.state) return 0;
    const s = window.Manager.state.score || {};
    return (s.deer || 0) - (s.hunter || 0);
  }

  function findObjectivePos(team) {
    if (window.Objectives && window.Objectives.state && window.Objectives.state.points) {
      const points = window.Objectives.state.points;
      for (const p of points) {
        if (p.owner === team) return { x: p.x, z: p.z };
      }
      if (points.length > 0) {
        const p = points[0];
        return { x: p.x, z: p.z };
      }
    }
    if (window.CAMERA) return { x: window.CAMERA.position.x, z: window.CAMERA.position.z };
    return { x: 0, z: 0 };
  }

  function spawnPortal(team) {
    const obj = findObjectivePos(team);
    const a = Math.random() * Math.PI * 2;
    const r = 12 + Math.random() * 16;
    const px = obj.x + Math.cos(a) * r;
    const pz = obj.z + Math.sin(a) * r;
    const gy = window.groundHeight ? window.groundHeight(px, pz) : 0;

    const mat = team === 'deer' ? RIFT_MAT_DEER : RIFT_MAT_HUNTER;
    const discMat = team === 'deer' ? DISC_MAT_DEER : DISC_MAT_HUNTER;
    const coreMat = team === 'deer' ? CORE_MAT_DEER : CORE_MAT_HUNTER;
    const groundMat = team === 'deer' ? GROUND_RING_DEER : GROUND_RING_HUNTER;

    const group = new THREE.Group();
    group.position.set(px, gy, pz);

    const torus1 = new THREE.Mesh(RIFT_GEO, mat.clone());
    torus1.position.y = PORTAL_HEIGHT * 0.5;
    group.add(torus1);

    const torus2 = new THREE.Mesh(RIFT_GEO, mat.clone());
    torus2.position.y = PORTAL_HEIGHT * 0.5;
    torus2.rotation.x = Math.PI / 2;
    group.add(torus2);

    const torus3 = new THREE.Mesh(RIFT_GEO, mat.clone());
    torus3.position.y = PORTAL_HEIGHT * 0.5;
    torus3.rotation.z = Math.PI / 2;
    group.add(torus3);

    const disc = new THREE.Mesh(DISC_GEO, discMat.clone());
    disc.position.y = PORTAL_HEIGHT * 0.5;
    disc.rotation.x = -Math.PI / 2;
    group.add(disc);

    const core = new THREE.Mesh(CORE_GEO, coreMat.clone());
    core.position.y = PORTAL_HEIGHT * 0.5;
    group.add(core);

    const groundRing = new THREE.Mesh(RING_GEO, groundMat.clone());
    groundRing.rotation.x = -Math.PI / 2;
    groundRing.position.y = 0.05;
    group.add(groundRing);

    SCENE.add(group);

    LIGHT.color.setHex(team === 'deer' ? 0xffaa44 : 0x66aaff);
    LIGHT.position.set(px, gy + PORTAL_HEIGHT * 0.5, pz);
    LIGHT.intensity = 3;
    LIGHT.visible = true;

    shockRing.position.set(px, gy + 0.1, pz);
    shockRing.scale.setScalar(1);
    shockRing.material.opacity = 0.9;
    shockRing.visible = true;
    shockT = 0.6;

    for (const p of particles) {
      p.active = true;
      p.mesh.visible = true;
      p.mesh.material = team === 'deer' ? p.matDeer : p.matHunt;
    }

    state.active = {
      team,
      group,
      torus1,
      torus2,
      torus3,
      disc,
      core,
      groundRing,
      x: px,
      z: pz,
      gy,
      hp: PORTAL_HP,
      maxHp: PORTAL_HP,
      life: LIFETIME,
      spawnTimer: 1.5,
      spawnedCount: 0,
      flashTimer: 0,
    };

    hudTitle.style.color = team === 'deer' ? '#f0c98a' : '#c9d8ff';
    hudTitle.textContent = team === 'deer' ? 'DEER PORTAL' : 'HUNTER PORTAL';
    hud.style.opacity = '1';
    hudTimer = LIFETIME + 2;

    if (window.FX && window.FX.message) {
      window.FX.message(team.toUpperCase() + ' RIFT OPENED', team === 'deer' ? '#f0c98a' : '#c9d8ff');
    }
    if (window.Sound) {
      window.Sound.tone(80, 1.5, 'sawtooth', 0.35, 600);
      window.Sound.tone(160, 1.2, 'square', 0.2, 1200);
    }
  }

  function takeDamage(amount) {
    if (!state.active) return;
    state.active.hp -= amount;
    state.active.flashTimer = 0.15;
    if (state.active.hp <= 0) {
      destroyPortal(true);
    }
  }

  function destroyPortal(destroyed) {
    const p = state.active;
    if (!p) return;

    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 8;
      const vy = 3 + Math.random() * 6;
      const sx = p.x + (Math.random() - 0.5) * 3;
      const sz = p.z + (Math.random() - 0.5) * 3;
      spawnSpark(sx, p.gy + PORTAL_HEIGHT * 0.5, sz, Math.cos(angle) * speed, vy, Math.sin(angle) * speed, p.team);
    }

    SCENE.remove(p.group);
    disposeGroup(p.group);
    LIGHT.visible = false;
    for (const part of particles) {
      part.active = false;
      part.mesh.visible = false;
    }

    state.active = null;
    state.lastDeficit = 0;
    state.checkTimer = CHECK_INTERVAL;

    if (destroyed && window.FX && window.FX.message) {
      window.FX.message('PORTAL DESTROYED', '#ff6644');
    }
    if (window.Sound) {
      window.Sound.tone(200, 0.6, 'sawtooth', 0.3, 800);
      window.Sound.tone(50, 0.8, 'sine', 0.25, 200);
    }
  }

  function disposeGroup(group) {
    group.traverse((obj) => {
      if (obj.geometry && obj.geometry !== RIFT_GEO && obj.geometry !== DISC_GEO && obj.geometry !== CORE_GEO && obj.geometry !== RING_GEO) {
        obj.geometry.dispose();
      }
      if (obj.material) obj.material.dispose();
    });
  }

  function spawnSpark(x, y, z, vx, vy, vz, team) {
    const slot = particles.find(p => !p.active);
    if (!slot) return;
    slot.mesh.material = team === 'deer' ? slot.matDeer : slot.matHunt;
    slot.mesh.position.set(x, y, z);
    slot.mesh.scale.setScalar(1.5);
    slot.angle = Math.atan2(vz, vx);
    slot.speed = Math.sqrt(vx * vx + vz * vz);
    slot.height = y + vy * 0.1;
    slot.active = true;
    slot.mesh.visible = true;
    slot.life = 0.5;
    slot.vy = vy;
    slot.isSpark = true;
  }

  function spawnReinforcements(portal) {
    if (!window.Entities || !window.Entities.spawn) return;
    for (let i = 0; i < SPAWNS_PER_TICK; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.5 + Math.random() * 2;
      const sx = portal.x + Math.cos(a) * r;
      const sz = portal.z + Math.sin(a) * r;
      window.Entities.spawn(portal.team, sx, sz);
      portal.spawnedCount++;
    }
    portal.flashTimer = 0.2;
    if (window.Sound) {
      window.Sound.tone(300 + Math.random() * 200, 0.2, 'sine', 0.15, 1500);
    }
  }

  function getPortal() { return state.active; }

  function update(dt) {
    state.checkTimer -= dt;
    if (state.checkTimer <= 0 && !state.active) {
      state.checkTimer = CHECK_INTERVAL;
      const gap = getScoreGap();
      if (Math.abs(gap) > DEFICIT_THRESHOLD) {
        // Comeback: reinforce the team that has fallen behind. gap = deer - hunter,
        // so a big positive gap means the HUNTERS are losing (they get a rift),
        // and a big negative gap means the DEER are losing (they get a rift).
        if (gap > DEFICIT_THRESHOLD && state.lastDeficit <= DEFICIT_THRESHOLD) {
          spawnPortal('hunter');
        } else if (gap < -DEFICIT_THRESHOLD && state.lastDeficit >= -DEFICIT_THRESHOLD) {
          spawnPortal('deer');
        }
      }
      state.lastDeficit = gap;
    }

    const p = state.active;
    if (p) {
      p.life -= dt;
      p.torus1.rotation.z += dt * 1.5;
      p.torus2.rotation.y += dt * 1.8;
      p.torus3.rotation.x += dt * 1.2;
      p.core.scale.setScalar(0.8 + Math.sin(performance.now() * 0.005) * 0.2);
      p.groundRing.rotation.z += dt * 0.5;

      p.spawnTimer -= dt;
      if (p.spawnTimer <= 0 && p.spawnedCount < MAX_SPAWNS) {
        p.spawnTimer = SPAWN_INTERVAL;
        spawnReinforcements(p);
      }

      if (p.flashTimer > 0) {
        p.flashTimer -= dt;
        p.disc.material.opacity = 0.5 + Math.random() * 0.3;
        p.core.material.opacity = 1.0;
      } else {
        p.disc.material.opacity = 0.25;
        p.core.material.opacity = 0.9;
      }

      const hpFrac = Math.max(0, p.hp / p.maxHp);
      hpFill.style.width = (hpFrac * 100) + '%';

      if (p.life <= 0 || p.hp <= 0) {
        destroyPortal(p.hp <= 0);
      }
    } else {
      if (hudTimer > 0) {
        hudTimer -= dt;
        if (hudTimer <= 0) hud.style.opacity = '0';
      }
    }

    for (const part of particles) {
      if (!part.active) continue;
      if (part.isSpark) {
        part.life -= dt;
        part.vy -= 14 * dt;
        const px = part.mesh.position.x;
        const pz = part.mesh.position.z;
        part.mesh.position.x += Math.cos(part.angle) * part.speed * dt;
        part.mesh.position.z += Math.sin(part.angle) * part.speed * dt;
        part.mesh.position.y += part.vy * dt;
        part.speed *= 0.96;
        part.mesh.material.opacity = Math.max(0, part.life / 0.5);
        part.mesh.scale.setScalar(0.5 + part.life);
        if (part.life <= 0) {
          part.active = false;
          part.mesh.visible = false;
          part.isSpark = false;
        }
      } else if (p) {
        part.height += part.speed * dt;
        if (part.height > PORTAL_HEIGHT) {
          part.height = 0;
          part.angle = Math.random() * Math.PI * 2;
          part.speed = 1.5 + Math.random() * 2.0;
        }
        const radius = PORTAL_RADIUS * 0.7 * (1 - part.height / PORTAL_HEIGHT);
        part.mesh.position.set(
          p.x + Math.cos(part.angle) * radius,
          p.gy + part.height,
          p.z + Math.sin(part.angle) * radius
        );
        part.mesh.scale.setScalar(0.3 + Math.sin(part.height * 2) * 0.2);
      }
    }

    if (shockT > 0) {
      shockT -= dt;
      const t = 1 - shockT / 0.6;
      shockRing.scale.setScalar(1 + t * 4);
      shockRing.material.opacity = shockT / 0.6 * 0.9;
      if (shockT <= 0) shockRing.visible = false;
    }

    if (LIGHT.visible) {
      LIGHT.intensity = 2.5 + Math.sin(performance.now() * 0.006) * 0.8;
    }
  }

  function reset() {
    if (state.active) {
      SCENE.remove(state.active.group);
      disposeGroup(state.active.group);
    }
    state.active = null;
    state.checkTimer = CHECK_INTERVAL;
    state.lastDeficit = 0;
    LIGHT.visible = false;
    shockRing.visible = false;
    for (const p of particles) {
      p.active = false;
      p.mesh.visible = false;
      p.isSpark = false;
    }
    hud.style.opacity = '0';
    hudTimer = 0;
  }

  function init() {
    reset();
  }

  return { init, update, reset, takeDamage, getPortal, state };
})();

window.Portals = Portals;