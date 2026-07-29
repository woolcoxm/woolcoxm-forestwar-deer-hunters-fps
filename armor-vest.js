// armor-vest.js — FORESTWAR armor vest pickups: grab a physical vest on the map for an absorb shield that soaks damage before HP
const THREE = window.THREE;
const SCENE = window.SCENE;
const ArmorVest = (() => {
  const MAX_ARMOR = 100;
  const PICKUP_RADIUS = 2.2;
  const RESPAWN_TIME = 28;
  const SHATTER_SPARKS = 18;
  const SPARK_LIFE = 0.5;
  const PICKUP_FLASH = 0.4;
  const MAX_VESTS = 5;

  const SPAWN_POINTS = [
    { x: -15, z: 10 },
    { x: 40, z: -20 },
    { x: -60, z: -35 },
    { x: 25, z: 65 },
    { x: -35, z: 70 },
    { x: 70, z: 40 },
    { x: 5, z: -55 },
    { x: -75, z: 15 },
  ];

  const VEST_GEO = new THREE.TorusGeometry(0.45, 0.14, 5, 16);
  const VEST_BASE_MAT = new THREE.MeshStandardMaterial({ color: 0x4466aa, roughness: 0.5, metalness: 0.5, emissive: 0x112244, emissiveIntensity: 0.4 });
  const PLATE_GEO = new THREE.BoxGeometry(0.55, 0.5, 0.08);
  const PLATE_MAT = new THREE.MeshStandardMaterial({ color: 0x2a3a55, roughness: 0.5, metalness: 0.6, emissive: 0x0a1525, emissiveIntensity: 0.3 });
  const STRAP_GEO = new THREE.BoxGeometry(0.06, 0.5, 0.06);
  const STRAP_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const RING_GEO = new THREE.RingGeometry(0.7, 0.9, 24);
  const RING_MAT = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const SPARK_GEO = new THREE.SphereGeometry(0.08, 4, 3);
  const SPARK_MAT = new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const GLOW_GEO = new THREE.SphereGeometry(0.8, 10, 8);
  const GLOW_MAT = new THREE.MeshBasicMaterial({ color: 0x3377dd, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide });

  const sparks = [];
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, active: false });
  }
  let sparkIdx = 0;

  function spawnSparkBurst(x, y, z) {
    for (let i = 0; i < SHATTER_SPARKS; i++) {
      const s = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % sparks.length;
      const ang = Math.random() * Math.PI * 2;
      const pitch = Math.random() * Math.PI * 0.5;
      const spd = 3 + Math.random() * 7;
      s.vx = Math.cos(ang) * spd * Math.cos(pitch);
      s.vy = Math.sin(pitch) * spd + 2;
      s.vz = Math.sin(ang) * spd * Math.cos(pitch);
      s.mesh.position.set(x, y, z);
      s.mesh.material.opacity = 0.9;
      s.mesh.scale.setScalar(0.6 + Math.random() * 0.6);
      s.life = SPARK_LIFE;
      s.mesh.visible = true;
      s.active = true;
    }
  }

  function buildVest() {
    const g = new THREE.Group();
    const vest = new THREE.Mesh(VEST_GEO, VEST_BASE_MAT.clone());
    vest.castShadow = true;
    g.add(vest);
    const plate = new THREE.Mesh(PLATE_GEO, PLATE_MAT.clone());
    plate.position.z = 0.02;
    g.add(plate);
    for (const sx of [-1, 1]) {
      const strap = new THREE.Mesh(STRAP_GEO, STRAP_MAT);
      strap.position.set(sx * 0.35, 0, 0);
      g.add(strap);
    }
    const ring = new THREE.Mesh(RING_GEO, RING_MAT.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.5;
    g.add(ring);
    g.userData.ring = ring;
    const glow = new THREE.Mesh(GLOW_GEO, GLOW_MAT.clone());
    g.add(glow);
    g.userData.glow = glow;
    return g;
  }

  const state = {
    armor: 0,
    maxArmor: MAX_ARMOR,
    vests: [],
    pulsePhase: 0,
    breakFlash: 0,
  };

  function init() {
    const count = Math.min(SPAWN_POINTS.length, MAX_VESTS);
    for (let i = 0; i < count; i++) {
      const sp = SPAWN_POINTS[i];
      spawnVest(sp.x, sp.z);
    }
  }

  function spawnVest(x, z) {
    const mesh = buildVest();
    const gy = window.groundHeight ? window.groundHeight(x, z) : 0;
    mesh.position.set(x, gy + 1.2, z);
    SCENE.add(mesh);
    state.vests.push({ mesh, x, z, respawn: 0, active: true, bobPhase: Math.random() * Math.PI * 2 });
  }

  function setArmor(amount) {
    state.armor = Math.max(0, Math.min(MAX_ARMOR, amount));
  }

  function getArmor() { return state.armor; }

  function absorbDamage(damage) {
    if (state.armor <= 0) return { damage, absorbed: 0, broke: false };
    const absorb = Math.min(state.armor, damage);
    state.armor -= absorb;
    const remaining = damage - absorb;
    const broke = state.armor <= 0;
    if (broke) {
      state.breakFlash = 1.0;
      const cam = window.CAMERA;
      if (cam) spawnSparkBurst(cam.position.x, cam.position.y, cam.position.z);
      if (window.Sound && window.Sound.tone) window.Sound.tone(120, 0.35, 'sawtooth', 0.4, 1200);
    }
    return { damage: remaining, absorbed: absorb, broke };
  }

  function tryPickup() {
    if (!window.Player || !Player.state || !Player.state.locked) return;
    const cam = window.CAMERA;
    if (!cam) return;
    for (let i = 0; i < state.vests.length; i++) {
      const v = state.vests[i];
      if (!v.active) continue;
      const dx = cam.position.x - v.x;
      const dz = cam.position.z - v.z;
      if (dx * dx + dz * dz > PICKUP_RADIUS * PICKUP_RADIUS) continue;
      const grant = 50;
      const before = state.armor;
      setArmor(state.armor + grant);
      const gained = state.armor - before;
      if (gained <= 0) {
        if (window.FX) window.FX.message('ARMOR FULL', '#66aaff');
        return;
      }
      v.active = false;
      v.mesh.visible = false;
      v.respawn = RESPAWN_TIME;
      if (window.FX) {
        window.FX.message('ARMOR +' + gained, '#66aaff');
        window.FX.burst(cam.position, new THREE.Vector3(0, 1, 0), 0x4488ff, 12);
      }
      if (window.Sound && window.Sound.tone) {
        window.Sound.tone(440, 0.1, 'sine', 0.25, 2000);
        window.Sound.tone(660, 0.15, 'sine', 0.2, 2400);
      }
      return;
    }
  }

  const hud = document.getElementById('hud');
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:50%;bottom:50px;transform:translateX(-50%);width:240px;'
    + 'opacity:0;transition:opacity 0.25s;z-index:6;text-align:center;';
  const label = document.createElement('div');
  label.style.cssText = 'font-size:9px;letter-spacing:3px;color:#66aaff;text-shadow:0 1px 3px #000;margin-bottom:3px;font-weight:bold;';
  label.textContent = 'ARMOR';
  wrap.appendChild(label);
  const barWrap = document.createElement('div');
  barWrap.style.cssText = 'width:100%;height:7px;background:rgba(0,0,0,0.55);'
    + 'border:1px solid rgba(80,130,220,0.45);border-radius:4px;overflow:hidden;';
  const barFill = document.createElement('div');
  barFill.style.cssText = 'width:0%;height:100%;background:linear-gradient(90deg,#2255aa,#66bbff);border-radius:3px;transition:width 0.1s linear;';
  barWrap.appendChild(barFill);
  wrap.appendChild(barWrap);
  const statusEl = document.createElement('div');
  statusEl.style.cssText = 'font-size:9px;letter-spacing:2px;color:#88bbff;text-shadow:0 1px 3px #000;margin-top:3px;opacity:0.7;';
  statusEl.textContent = '';
  wrap.appendChild(statusEl);
  if (hud) hud.appendChild(wrap);

  const breakOverlay = document.createElement('div');
  breakOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4;'
    + 'box-shadow:inset 0 0 100px 14px rgba(60,120,220,0);';
  if (hud) hud.appendChild(breakOverlay);

  let prevArmor = 0;
  let pickupCd = 0;

  function update(dt) {
    state.pulsePhase += dt * 3;
    state.breakFlash = Math.max(0, state.breakFlash - dt * 2.5);

    for (let i = 0; i < state.vests.length; i++) {
      const v = state.vests[i];
      if (v.active) {
        v.bobPhase += dt * 2;
        const gy = window.groundHeight ? window.groundHeight(v.x, v.z) : 0;
        v.mesh.position.y = gy + 1.2 + Math.sin(v.bobPhase) * 0.15;
        v.mesh.rotation.y += dt * 1.5;
        const pulse = 0.7 + Math.sin(state.pulsePhase + v.bobPhase) * 0.3;
        if (v.mesh.userData.ring) v.mesh.userData.ring.material.opacity = 0.4 * pulse;
        if (v.mesh.userData.glow) v.mesh.userData.glow.material.opacity = 0.12 + 0.08 * pulse;
      } else {
        v.respawn -= dt;
        if (v.respawn <= 0) {
          v.active = true;
          v.mesh.visible = true;
        }
      }
    }

    pickupCd -= dt;
    if (pickupCd <= 0) {
      pickupCd = 0.15;
      tryPickup();
    }

    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.vy -= 18 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      const t = s.life / SPARK_LIFE;
      s.mesh.material.opacity = t * 0.9;
      s.mesh.scale.setScalar(0.5 + t * 0.6);
    }

    const hasArmor = state.armor > 0;
    if (hasArmor) {
      wrap.style.opacity = '1';
      barFill.style.width = (state.armor / MAX_ARMOR * 100) + '%';
      if (state.armor < 25) {
        statusEl.textContent = 'DEPLETED';
        statusEl.style.color = '#ff6644';
        barFill.style.background = 'linear-gradient(90deg,#662222,#aa4444)';
      } else {
        statusEl.textContent = 'ACTIVE';
        statusEl.style.color = '#88bbff';
        barFill.style.background = 'linear-gradient(90deg,#2255aa,#66bbff)';
      }
    } else {
      wrap.style.opacity = '0';
    }

    if (state.breakFlash > 0) {
      breakOverlay.style.boxShadow = 'inset 0 0 100px 14px rgba(60,120,220,' + (state.breakFlash * 0.5) + ')';
    } else {
      breakOverlay.style.boxShadow = 'inset 0 0 100px 14px rgba(60,120,220,0)';
    }

    prevArmor = state.armor;
  }

  function reset() {
    state.armor = 0;
    state.breakFlash = 0;
    for (let i = 0; i < state.vests.length; i++) {
      const v = state.vests[i];
      v.active = true;
      v.mesh.visible = true;
      v.respawn = 0;
    }
  }

  return { init, update, reset, absorbDamage, getArmor, setArmor, state };
})();

window.ArmorVest = ArmorVest;