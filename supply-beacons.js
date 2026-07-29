// supply-beacons.js — FORESTWAR persistent neutral supply beacons: capturable spires that grant team-wide ammo and stamina regen to nearby allies
const THREE = window.THREE;
const SCENE = window.SCENE;
const SupplyBeacons = (() => {
  const CAP_RADIUS = 6;
  const CAP_RATE = 16;
  const CONTEST_RATE = 10;
  const NEUTRAL_DECAY = 6;
  const AMMO_INTERVAL = 1.2;
  const HEAL_INTERVAL = 0.8;
  const HEAL_AMOUNT = 5;
  const STAMINA_INTERVAL = 0.5;
  const STAMINA_AMOUNT = 5;
  const PLAYER_AMMO_GRANT = 999;
  const PLAYER_HEAL_AMOUNT = 7;

  const BEACON_POSITIONS = [
    { x: 10, z: -10 },
    { x: -55, z: -60 },
    { x: 60, z: 55 },
    { x: -35, z: 80 },
    { x: 85, z: -20 },
  ];

  const state = { beacons: [], time: 0 };

  const SPIRE_GEO = new THREE.CylinderGeometry(0.55, 0.85, 3.4, 8);
  const SPIRE_MAT = new THREE.MeshStandardMaterial({ color: 0x4a4638, roughness: 0.6, metalness: 0.5 });
  const TOP_GEO = new THREE.IcosahedronGeometry(0.65, 0);
  const TOP_MAT_BASE = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.8, emissive: 0x222222, emissiveIntensity: 0.3, transparent: true, opacity: 0.9 });
  const RING_GEO = new THREE.RingGeometry(CAP_RADIUS - 0.35, CAP_RADIUS, 48);
  const RING_NEUTRAL_MAT = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const RING_DEER_MAT = new THREE.MeshBasicMaterial({ color: 0xf0c98a, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false });
  const RING_HUNTER_MAT = new THREE.MeshBasicMaterial({ color: 0xc9d8ff, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false });
  const STRUT_GEO = new THREE.CylinderGeometry(0.045, 0.045, 0.9, 5);
  const STRUT_MAT = new THREE.MeshStandardMaterial({ color: 0x44443a, roughness: 0.6, metalness: 0.7 });
  const GLOW_GEO = new THREE.SphereGeometry(0.25, 10, 8);
  const GLOW_DEER = new THREE.MeshBasicMaterial({ color: 0xffcc55, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
  const GLOW_HUNTER = new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
  const GLOW_NEUTRAL = new THREE.MeshBasicMaterial({ color: 0x999999, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });

  const PULSE_GEO = new THREE.RingGeometry(0.5, 0.8, 32);
  const PULSE_DEER = new THREE.MeshBasicMaterial({ color: 0xf0c98a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const PULSE_HUNTER = new THREE.MeshBasicMaterial({ color: 0xc9d8ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });

  const PULSE_COUNT = 12;
  const pulses = [];
  for (let i = 0; i < PULSE_COUNT; i++) {
    const m = new THREE.Mesh(PULSE_GEO, PULSE_DEER.clone());
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    pulses.push({ mesh: m, x: 0, z: 0, team: 'deer', t: 0, active: false });
  }
  let pulseIdx = 0;

  const SPARK_GEO = new THREE.SphereGeometry(0.1, 5, 4);
  const SPARK_DEER = new THREE.MeshBasicMaterial({ color: 0xffcc55, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const SPARK_HUNTER = new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const SPARK_COUNT = 40;
  const sparks = [];
  for (let i = 0; i < SPARK_COUNT; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_DEER.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, maxLife: 0.8, vx: 0, vy: 0, vz: 0, active: false });
  }
  let sparkIdx = 0;

  const LIGHT_POOL = 5;
  const lights = [];
  for (let i = 0; i < LIGHT_POOL; i++) {
    const l = new THREE.PointLight(0x999999, 0, 14, 2);
    l.visible = false;
    SCENE.add(l);
    lights.push({ light: l, target: null });
  }

  const hud = document.getElementById('hud');
  const beaconRow = document.createElement('div');
  beaconRow.style.cssText = 'position:absolute;bottom:50px;left:50%;transform:translateX(-50%);display:flex;gap:10px;pointer-events:none;z-index:6;opacity:0;transition:opacity 0.4s;';
  if (hud) hud.appendChild(beaconRow);

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function getRingMat(team) {
    if (team === 'deer') return RING_DEER_MAT;
    if (team === 'hunter') return RING_HUNTER_MAT;
    return RING_NEUTRAL_MAT;
  }

  function getGlowMat(team) {
    if (team === 'deer') return GLOW_DEER;
    if (team === 'hunter') return GLOW_HUNTER;
    return GLOW_NEUTRAL;
  }

  function getPlayerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function init() {
    if (state.beacons.length > 0) return;
    for (const p of BEACON_POSITIONS) {
      const gy = groundY(p.x, p.z);
      const g = new THREE.Group();
      g.position.set(p.x, gy, p.z);

      const spire = new THREE.Mesh(SPIRE_GEO, SPIRE_MAT);
      spire.castShadow = true;
      spire.position.y = 1.7;
      g.add(spire);

      const top = new THREE.Mesh(TOP_GEO, TOP_MAT_BASE.clone());
      top.position.y = 3.8;
      top.castShadow = true;
      g.add(top);

      const glow = new THREE.Mesh(GLOW_GEO, GLOW_NEUTRAL.clone());
      glow.position.y = 3.8;
      g.add(glow);

      for (let s = 0; s < 3; s++) {
        const ang = (s / 3) * Math.PI * 2;
        const strut = new THREE.Mesh(STRUT_GEO, STRUT_MAT);
        strut.position.set(Math.cos(ang) * 0.55, 2.2, Math.sin(ang) * 0.55);
        strut.rotation.z = 0.5;
        strut.rotation.y = ang;
        g.add(strut);
      }

      const ring = new THREE.Mesh(RING_GEO, RING_NEUTRAL_MAT.clone());
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      g.add(ring);

      SCENE.add(g);

      const lightIdx = state.beacons.length % LIGHT_POOL;
      const lt = lights[lightIdx];
      lt.target = g;
      lt.light.position.set(p.x, gy + 4, p.z);

      state.beacons.push({
        x: p.x, z: p.z,
        capture: 0,
        owner: null,
        group: g,
        spire, top, glow, ring, light: lt,
        ammoTimer: 0,
        healTimer: 0,
        staminaTimer: 0,
        deerPresent: 0,
        hunterPresent: 0,
        capturePulse: 0,
      });

      const card = document.createElement('div');
      card.style.cssText = 'width:36px;height:36px;border-radius:50%;border:2px solid #888;background:rgba(10,18,12,0.8);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;letter-spacing:1px;color:#aaa;text-shadow:0 1px 3px #000;transition:all 0.3s;';
      card.textContent = '?';
      beaconRow.appendChild(card);
      state.beacons[state.beacons.length - 1].card = card;
    }
    beaconRow.style.opacity = '1';
  }

  function reset() {
    for (const b of state.beacons) {
      b.capture = 0;
      b.owner = null;
      b.deerPresent = 0;
      b.hunterPresent = 0;
      b.capturePulse = 0;
      b.ring.material.color.setHex(0xaaaaaa);
      b.ring.material.opacity = 0.2;
      b.top.material.emissive.setHex(0x222222);
      b.top.material.emissiveIntensity = 0.3;
      b.glow.material.color.setHex(0x999999);
      b.glow.material.opacity = 0.3;
      b.light.light.color.setHex(0x999999);
      b.light.light.intensity = 0;
      b.light.light.visible = false;
      if (b.card) {
        b.card.style.borderColor = '#888';
        b.card.style.color = '#aaa';
        b.card.style.background = 'rgba(10,18,12,0.8)';
        b.card.textContent = '?';
      }
    }
  }

  function spawnSpark(x, y, z, team) {
    const slot = sparks[sparkIdx];
    sparkIdx = (sparkIdx + 1) % SPARK_COUNT;
    const ang = Math.random() * Math.PI * 2;
    const spd = 2 + Math.random() * 3;
    slot.vx = Math.cos(ang) * spd;
    slot.vy = 3 + Math.random() * 4;
    slot.vz = Math.sin(ang) * spd;
    slot.mesh.position.set(x, y, z);
    slot.mesh.material.color.setHex(team === 'deer' ? 0xffcc55 : 0x66aaff);
    slot.mesh.material.opacity = 1;
    const sc = 0.5 + Math.random() * 0.5;
    slot.mesh.scale.setScalar(sc);
    slot.life = slot.maxLife = 0.6 + Math.random() * 0.4;
    slot.mesh.visible = true;
    slot.active = true;
  }

  function spawnPulse(x, z, team) {
    const slot = pulses[pulseIdx];
    pulseIdx = (pulseIdx + 1) % PULSE_COUNT;
    slot.mesh.position.set(x, 0.05, z);
    slot.mesh.material.color.setHex(team === 'deer' ? 0xf0c98a : 0xc9d8ff);
    slot.mesh.material.opacity = 0.8;
    slot.mesh.scale.setScalar(0.5);
    slot.x = x;
    slot.z = z;
    slot.team = team;
    slot.t = 0;
    slot.mesh.visible = true;
    slot.active = true;
  }

  function countTeam(team) {
    let n = 0;
    for (const b of state.beacons) {
      if (b.owner === team) n++;
    }
    return n;
  }

  function update(dt) {
    if (state.beacons.length === 0) return;
    state.time += dt;
    const playerTeam = getPlayerTeam();

    for (const b of state.beacons) {
      b.deerPresent = 0;
      b.hunterPresent = 0;

      if (window.Grid && typeof window.Grid.queryRadius === 'function') {
        const out = [];
        window.Grid.queryRadius(b.x, b.z, CAP_RADIUS, out, (e) => !e.dead);
        for (let i = 0; i < out.length; i++) {
          if (out[i].team === 'deer') b.deerPresent++;
          else if (out[i].team === 'hunter') b.hunterPresent++;
        }
      } else if (window.Entities && Array.isArray(window.Entities.list)) {
        const r2 = CAP_RADIUS * CAP_RADIUS;
        for (let i = 0; i < window.Entities.list.length; i++) {
          const e = window.Entities.list[i];
          if (e.dead || !e.mesh) continue;
          const dx = e.mesh.position.x - b.x;
          const dz = e.mesh.position.z - b.z;
          if (dx * dx + dz * dz <= r2) {
            if (e.team === 'deer') b.deerPresent++;
            else if (e.team === 'hunter') b.hunterPresent++;
          }
        }
      }

      const playerPos = window.CAMERA ? window.CAMERA.position : null;
      let playerInZone = false;
      if (playerPos) {
        const pdx = playerPos.x - b.x;
        const pdz = playerPos.z - b.z;
        if (pdx * pdx + pdz * pdz <= CAP_RADIUS * CAP_RADIUS) {
          playerInZone = true;
          if (playerTeam === 'deer') b.deerPresent++;
          else if (playerTeam === 'hunter') b.hunterPresent++;
        }
      }

      if (b.deerPresent > 0 && b.hunterPresent === 0) {
        if (b.owner === 'hunter') {
          b.capture -= CONTEST_RATE * dt;
          if (b.capture <= 0) { b.capture = 0; b.owner = null; }
        } else {
          b.capture += CAP_RATE * dt;
          b.capturePulse += dt;
          if (b.capture >= 100) {
            b.capture = 100;
            if (b.owner !== 'deer') {
              b.owner = 'deer';
              spawnPulse(b.x, b.z, 'deer');
              for (let i = 0; i < 8; i++) spawnSpark(b.x, groundY(b.x, b.z) + 3, b.z, 'deer');
            }
          }
        }
      } else if (b.hunterPresent > 0 && b.deerPresent === 0) {
        if (b.owner === 'deer') {
          b.capture -= CONTEST_RATE * dt;
          if (b.capture <= 0) { b.capture = 0; b.owner = null; }
        } else {
          b.capture += CAP_RATE * dt;
          b.capturePulse += dt;
          if (b.capture >= 100) {
            b.capture = 100;
            if (b.owner !== 'hunter') {
              b.owner = 'hunter';
              spawnPulse(b.x, b.z, 'hunter');
              for (let i = 0; i < 8; i++) spawnSpark(b.x, groundY(b.x, b.z) + 3, b.z, 'hunter');
            }
          }
        }
      } else if (b.deerPresent > 0 && b.hunterPresent > 0) {
        // contested — freeze
      } else {
        if (b.owner === null) {
          b.capture = Math.max(0, b.capture - NEUTRAL_DECAY * dt);
        }
      }

      if (b.capturePulse > 1.5 && b.owner) {
        b.capturePulse = 0;
        spawnPulse(b.x, b.z, b.owner);
      }

      const team = b.owner;
      b.ring.material.color.setHex(team === 'deer' ? 0xf0c98a : team === 'hunter' ? 0xc9d8ff : 0xaaaaaa);
      b.ring.material.opacity = team ? 0.38 : 0.2;

      const emissiveHex = team === 'deer' ? 0x884400 : team === 'hunter' ? 0x224488 : 0x222222;
      const emissiveI = team ? 0.7 : 0.3;
      b.top.material.emissive.setHex(emissiveHex);
      b.top.material.emissiveIntensity = emissiveI;
      b.glow.material.color.setHex(team === 'deer' ? 0xffcc55 : team === 'hunter' ? 0x66aaff : 0x999999);
      b.glow.material.opacity = team ? 0.75 : 0.3;

      b.light.light.color.setHex(team === 'deer' ? 0xf0c98a : team === 'hunter' ? 0xc9d8ff : 0x999999);
      b.light.light.intensity = team ? 1.6 : 0;
      b.light.light.visible = !!team;

      const bobY = Math.sin(state.time * 2.0 + b.x * 0.1) * 0.18;
      b.top.position.y = 3.8 + bobY;
      b.top.rotation.y += dt * 0.8;
      b.glow.position.y = 3.8 + bobY;

      if (b.card) {
        const hex = team === 'deer' ? '#f0c98a' : team === 'hunter' ? '#c9d8ff' : '#888';
        const bgHex = team === 'deer' ? 'rgba(60,40,15,0.85)' : team === 'hunter' ? 'rgba(25,35,60,0.85)' : 'rgba(10,18,12,0.8)';
        b.card.style.borderColor = hex;
        b.card.style.color = hex;
        b.card.style.background = bgHex;
        b.card.textContent = team === 'deer' ? 'D' : team === 'hunter' ? 'H' : '?';
      }

      if (team && (b.deerPresent > 0 || b.hunterPresent > 0 || playerInZone)) {
        b.ammoTimer += dt;
        b.healTimer += dt;
        b.staminaTimer += dt;
        if (b.ammoTimer >= AMMO_INTERVAL) {
          b.ammoTimer = 0;
          resupplyAmmo(b);
        }
        if (b.healTimer >= HEAL_INTERVAL) {
          b.healTimer = 0;
          healNearby(b);
        }
        if (b.staminaTimer >= STAMINA_INTERVAL) {
          b.staminaTimer = 0;
          staminaNearby(b);
        }
        if (playerInZone) {
          const ms = window.Manager && window.Manager.state ? window.Manager.state : null;
          if (ms && !ms.playerAlive) {
            // dead players don't benefit
          } else if (ms) {
            ms.playerHp = Math.min(ms.playerMaxHp || 100, ms.playerHp + PLAYER_HEAL_AMOUNT * dt);
          }
        }
      }
    }

    for (let i = 0; i < pulses.length; i++) {
      const p = pulses[i];
      if (!p.active) continue;
      p.t += dt;
      const frac = p.t / 1.0;
      if (frac >= 1) { p.active = false; p.mesh.visible = false; continue; }
      const r = CAP_RADIUS * frac;
      p.mesh.scale.setScalar(r);
      p.mesh.material.opacity = 0.8 * (1 - frac);
    }

    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) { s.active = false; s.mesh.visible = false; continue; }
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.vy -= 10 * dt;
      s.mesh.material.opacity = s.life / s.maxLife;
    }
  }

  function resupplyAmmo(beacon) {
    if (!window.Entities || !Array.isArray(window.Entities.list)) return;
    const r2 = CAP_RADIUS * CAP_RADIUS;
    for (let i = 0; i < window.Entities.list.length; i++) {
      const e = window.Entities.list[i];
      if (e.dead || e.team !== beacon.owner || !e.mesh) continue;
      const dx = e.mesh.position.x - beacon.x;
      const dz = e.mesh.position.z - beacon.z;
      if (dx * dx + dz * dz > r2) continue;
      if (typeof e.ammo === 'number' && typeof e.maxAmmo === 'number') {
        e.ammo = Math.min(e.maxAmmo, e.ammo + 5);
      }
    }
  }

  function healNearby(beacon) {
    if (!window.Entities || !Array.isArray(window.Entities.list)) return;
    const r2 = CAP_RADIUS * CAP_RADIUS;
    for (let i = 0; i < window.Entities.list.length; i++) {
      const e = window.Entities.list[i];
      if (e.dead || e.team !== beacon.owner || !e.mesh) continue;
      const dx = e.mesh.position.x - beacon.x;
      const dz = e.mesh.position.z - beacon.z;
      if (dx * dx + dz * dz > r2) continue;
      if (typeof e.hp === 'number' && typeof e.maxHp === 'number') {
        e.hp = Math.min(e.maxHp, e.hp + HEAL_AMOUNT);
      }
    }
  }

  function staminaNearby(beacon) {
    if (!window.Entities || !Array.isArray(window.Entities.list)) return;
    const r2 = CAP_RADIUS * CAP_RADIUS;
    for (let i = 0; i < window.Entities.list.length; i++) {
      const e = window.Entities.list[i];
      if (e.dead || e.team !== beacon.owner || !e.mesh) continue;
      const dx = e.mesh.position.x - beacon.x;
      const dz = e.mesh.position.z - beacon.z;
      if (dx * dx + dz * dz > r2) continue;
      if (typeof e.stamina === 'number' && typeof e.maxStamina === 'number') {
        e.stamina = Math.min(e.maxStamina, e.stamina + STAMINA_AMOUNT);
      }
    }
  }

  return { init, reset, update, state, countTeam };
})();

window.SupplyBeacons = SupplyBeacons;