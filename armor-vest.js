// armor-vest.js — FORESTWAR armor vest pickups: grab a physical vest on the map for an absorb shield that soaks damage before HP, with regenerating overguard
const THREE = window.THREE;
const SCENE = window.SCENE;
const ArmorVest = (() => {
  const MAX_ARMOR = 100;
  const OVERGUARD_MAX = 50;
  const OVERGUARD_REGEN_RATE = 8;
  const OVERGUARD_REGEN_DELAY = 6.0;
  const OVERGUARD_REGEN_FRAC = 0.5;
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
      s.life = SPARK_LIFE;
      s.mesh.material.opacity = 1;
      s.mesh.scale.setScalar(1);
      s.mesh.visible = true;
      s.active = true;
    }
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
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.vy -= 14 * dt;
      const t = s.life / SPARK_LIFE;
      s.mesh.material.opacity = t;
      s.mesh.scale.setScalar(0.5 + t * 0.8);
    }
  }

  function buildVestMesh() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(VEST_GEO, VEST_BASE_MAT.clone());
    ring.castShadow = true;
    g.add(ring);
    const plate = new THREE.Mesh(PLATE_GEO, PLATE_MAT.clone());
    plate.position.z = 0.02;
    g.add(plate);
    for (const sx of [-1, 1]) {
      const strap = new THREE.Mesh(STRAP_GEO, STRAP_MAT);
      strap.position.set(sx * 0.28, 0, 0);
      g.add(strap);
    }
    const glow = new THREE.Mesh(GLOW_GEO, GLOW_MAT.clone());
    g.add(glow);
    return g;
  }

  const pickups = [];
  let armor = 0;
  let maxArmor = MAX_ARMOR;
  let overguard = 0;
  let overguardMax = OVERGUARD_MAX;
  let overguardRegenT = OVERGUARD_REGEN_DELAY;
  let hudTimer = 0;
  let barEl = null;
  let barFill = null;
  let ogFill = null;
  let label = null;
  let shardHitTimer = 0;

  function buildHUD() {
    const hud = document.getElementById('hud');
    if (!hud) return;
    barEl = document.createElement('div');
    barEl.style.cssText = 'position:absolute;bottom:54px;left:50%;transform:translateX(-50%);width:200px;height:8px;background:rgba(0,0,0,0.6);border:1px solid rgba(100,150,220,0.45);border-radius:4px;overflow:hidden;display:none;z-index:6;';
    barFill = document.createElement('div');
    barFill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#2255aa,#4488ff);transition:width 0.1s;border-radius:3px;';
    barEl.appendChild(barFill);
    ogFill = document.createElement('div');
    ogFill.style.cssText = 'position:absolute;top:0;left:0;width:0%;height:100%;background:linear-gradient(90deg,#2299cc,#66ddff);border-radius:3px;opacity:0.85;';
    barEl.appendChild(ogFill);
    hud.appendChild(barEl);
    label = document.createElement('div');
    label.style.cssText = 'position:absolute;bottom:64px;left:50%;transform:translateX(-50%);font-size:10px;letter-spacing:3px;color:#66aaff;text-shadow:0 1px 3px #000;display:none;z-index:6;font-weight:bold;';
    label.textContent = 'ARMOR';
    hud.appendChild(label);
  }

  function updateHUD() {
    if (!barEl || !label) return;
    if (armor > 0 || overguard > 0) {
      barEl.style.display = 'block';
      label.style.display = 'block';
      const frac = Math.max(0, armor) / maxArmor;
      const ogFrac = Math.max(0, overguard) / overguardMax;
      barFill.style.width = (frac * 100) + '%';
      ogFill.style.width = (ogFrac * 100) + '%';
    } else {
      barEl.style.display = 'none';
      label.style.display = 'none';
    }
  }

  function init() {
    buildHUD();
    for (let i = 0; i < SPAWN_POINTS.length && i < MAX_VESTS; i++) {
      const sp = SPAWN_POINTS[i];
      const mesh = buildVestMesh();
      const gy = window.groundHeight ? window.groundHeight(sp.x, sp.z) : 0;
      mesh.position.set(sp.x, gy + 1.0, sp.z);
      mesh.rotation.y = Math.random() * Math.PI * 2;
      SCENE.add(mesh);
      pickups.push({
        x: sp.x, z: sp.z,
        mesh,
        ring: null,
        active: true,
        respawnT: 0,
        bobPhase: Math.random() * Math.PI * 2,
      });
    }
  }

  function getArmor() { return armor; }
  function getMaxArmor() { return maxArmor; }
  function getOverguard() { return overguard; }

  function applyDamage(raw) {
    let remaining = raw;
    if (overguard > 0) {
      const absorbed = Math.min(overguard, remaining);
      overguard -= absorbed;
      remaining -= absorbed;
      overguardRegenT = OVERGUARD_REGEN_DELAY;
      if (overguard <= 0) {
        overguard = 0;
        spawnSparkBurst(window.CAMERA ? window.CAMERA.position.x : 0, (window.CAMERA ? window.CAMERA.position.y : 1.7) - 0.5, window.CAMERA ? window.CAMERA.position.z : 0);
        if (window.FX && window.FX.shake) window.FX.shake(0.06);
        if (window.Sound && window.Sound.tone) window.Sound.tone(180, 0.25, 'sawtooth', 0.15, 600);
      }
    }
    if (remaining > 0 && armor > 0) {
      const absorbed = Math.min(armor, remaining);
      armor -= absorbed;
      remaining -= absorbed;
      if (armor <= 0) {
        armor = 0;
        overguard = 0;
        shardHitTimer = 0.5;
        spawnSparkBurst(window.CAMERA ? window.CAMERA.position.x : 0, (window.CAMERA ? window.CAMERA.position.y : 1.7) - 0.5, window.CAMERA ? window.CAMERA.position.z : 0);
        if (window.FX && window.FX.shake) window.FX.shake(0.1);
        if (window.Sound && window.Sound.tone) window.Sound.tone(120, 0.35, 'sawtooth', 0.2, 400);
        if (window.FX && window.FX.message) window.FX.message('ARMOR SHATTERED', '#ff4444');
      } else if (window.FX && window.FX.shake) {
        window.FX.shake(0.03);
      }
    }
    return remaining;
  }

  function getShardHitTimer() { return shardHitTimer; }

  function reset() {
    armor = 0;
    overguard = 0;
    overguardRegenT = OVERGUARD_REGEN_DELAY;
    shardHitTimer = 0;
    for (let i = 0; i < pickups.length; i++) {
      pickups[i].active = true;
      pickups[i].respawnT = 0;
      pickups[i].mesh.visible = true;
    }
    updateHUD();
  }

  function update(dt) {
    updateSparks(dt);
    hudTimer -= dt;
    if (shardHitTimer > 0) {
      shardHitTimer -= dt;
      if (shardHitTimer < 0) shardHitTimer = 0;
    }
    if (armor > 0 && overguard < overguardMax) {
      overguardRegenT -= dt;
      if (overguardRegenT <= 0) {
        overguard = Math.min(overguardMax, overguard + OVERGUARD_REGEN_RATE * dt);
        if (hudTimer <= 0) {
          updateHUD();
          hudTimer = 0.1;
        }
      }
    } else {
      overguardRegenT = OVERGUARD_REGEN_DELAY;
    }
    const cam = window.CAMERA;
    const pTeam = (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
    if (cam && window.Manager && window.Manager.state && window.Manager.state.phase === 'playing') {
      for (let i = 0; i < pickups.length; i++) {
        const p = pickups[i];
        if (p.active) {
          p.bobPhase += dt * 2.0;
          p.mesh.position.y = (window.groundHeight ? window.groundHeight(p.x, p.z) : 0) + 1.0 + Math.sin(p.bobPhase) * 0.2;
          p.mesh.rotation.y += dt * 1.5;
          const dx = cam.position.x - p.x;
          const dz = cam.position.z - p.z;
          if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS && armor < maxArmor) {
            armor = maxArmor;
            overguard = Math.min(overguardMax, OVERGUARD_MAX * OVERGUARD_REGEN_FRAC);
            overguardRegenT = OVERGUARD_REGEN_DELAY;
            p.active = false;
            p.mesh.visible = false;
            p.respawnT = RESPAWN_TIME;
            spawnSparkBurst(p.x, (window.groundHeight ? window.groundHeight(p.x, p.z) : 0) + 1.0, p.z);
            if (window.FX && window.FX.message) window.FX.message('ARMOR ACQUIRED +' + MAX_ARMOR, '#4488ff');
            if (window.Sound) {
              if (window.Sound.tone) {
                window.Sound.tone(440, 0.12, 'sine', 0.2, 2000);
                window.Sound.tone(660, 0.16, 'sine', 0.15, 2400);
              }
            }
            updateHUD();
          }
        } else {
          p.respawnT -= dt;
          if (p.respawnT <= 0) {
            p.active = true;
            p.mesh.visible = true;
            p.bobPhase = 0;
          }
        }
      }
    }
    if (hudTimer <= 0) updateHUD();
  }

  return { init, update, reset, applyDamage, getArmor, getMaxArmor, getOverguard, getShardHitTimer, state: { get armor() { return armor; }, get overguard() { return overguard; } } };
})();

window.ArmorVest = ArmorVest;