// supply-drop.js — FORESTWAR periodic care-package airdrop: cargo plane flyover, parachute crate, randomized tiered loot
const THREE = window.THREE;
const SCENE = window.SCENE;
const SupplyDrop = (() => {
  const INTERVAL = 75;
  const FIRST_DROP = 45;
  const PLANE_ALT = 55;
  const PLANE_SPEED = 38;
  const DESCEND_SPEED = 6;
  const RELEASE_HEIGHT = 22;
  const GLOW_RADIUS = 12;
  const LAND_LIFETIME = 20;
  const PICKUP_RADIUS = 2.2;

  const TIERS = {
    standard: {
      color: 0x8a7a44,
      emissive: 0x221100,
      beacon: 0xffaa44,
      weight: 0.55,
      label: 'STANDARD SUPPLY',
      glowMult: 1.0,
      loot: [
        { slot: 0, grant: 60 },
        { slot: 1, grant: 1 },
        { slot: 2, grant: 2 },
      ],
    },
    rare: {
      color: 0x4466aa,
      emissive: 0x001133,
      beacon: 0x44aaff,
      weight: 0.30,
      label: 'RARE SUPPLY',
      glowMult: 1.5,
      loot: [
        { slot: 0, grant: 90 },
        { slot: 1, grant: 2 },
        { slot: 2, grant: 3 },
        { slot: 4, grant: 3 },
        { slot: 3, grant: 2 },
      ],
    },
    legendary: {
      color: 0xaa44aa,
      emissive: 0x220022,
      beacon: 0xff44ff,
      weight: 0.15,
      label: 'LEGENDARY SUPPLY',
      glowMult: 2.0,
      loot: [
        { slot: 0, grant: 120 },
        { slot: 1, grant: 3 },
        { slot: 2, grant: 5 },
        { slot: 4, grant: 5 },
        { slot: 3, grant: 4 },
      ],
      heal: 60,
      shield: 25,
    },
  };

  const state = {
    timer: FIRST_DROP,
    plane: null,
    planeActive: false,
    planeT: 0,
    planeStart: new THREE.Vector3(),
    planeEnd: new THREE.Vector3(),
    crate: null,
    crateState: null,
    hud: null,
    hudTimer: 0,
    messageTime: 0,
  };

  const PLANE_BODY_GEO = new THREE.CapsuleGeometry(0.6, 3.5, 4, 8);
  PLANE_BODY_GEO.rotateZ(Math.PI / 2);
  const PLANE_MAT = new THREE.MeshStandardMaterial({ color: 0x556a44, roughness: 0.6, metalness: 0.3 });
  const WING_GEO = new THREE.BoxGeometry(7, 0.15, 1.2);
  const TAIL_GEO = new THREE.BoxGeometry(2.8, 0.12, 0.8);
  const TAIL_FIN_GEO = new THREE.BoxGeometry(0.12, 1.3, 0.8);
  const PROP_GEO = new THREE.BoxGeometry(0.08, 2.6, 0.12);
  const PROP_MAT = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.55 });

  const CRATE_GEO = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  const STRAP_GEO = new THREE.BoxGeometry(1.24, 0.12, 1.24);
  const STRAP_MAT = new THREE.MeshStandardMaterial({ color: 0x333322, roughness: 0.9 });
  const CHUTE_CANOPY_GEO = new THREE.SphereGeometry(2.2, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const CHUTE_STRING_GEO = new THREE.CylinderGeometry(0.025, 0.025, 3.5, 3);
  const CHUTE_STRING_MAT = new THREE.MeshBasicMaterial({ color: 0x666666 });
  const BEACON_GEO = new THREE.SphereGeometry(0.18, 8, 6);
  const BEAM_GEO = new THREE.CylinderGeometry(0.15, 0.6, GLOW_RADIUS, 8, 1, true);
  const BEAM_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const STAR_GEO = new THREE.OctahedronGeometry(0.28, 0);
  const STAR_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const SPARK_GEO = new THREE.SphereGeometry(0.15, 5, 4);
  const SPARK_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });

  const sparks = [];
  for (let i = 0; i < 20; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, active: false });
  }
  let sparkIdx = 0;

  function buildPlane() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(PLANE_BODY_GEO, PLANE_MAT);
    body.castShadow = true;
    g.add(body);
    const wing = new THREE.Mesh(WING_GEO, PLANE_MAT);
    wing.position.y = 0.2;
    wing.castShadow = true;
    g.add(wing);
    const tail = new THREE.Mesh(TAIL_GEO, PLANE_MAT);
    tail.position.set(-2.3, 0.2, 0);
    g.add(tail);
    const fin = new THREE.Mesh(TAIL_FIN_GEO, PLANE_MAT);
    fin.position.set(-2.3, 0.8, 0);
    g.add(fin);
    for (const sx of [-1, 1]) {
      const light = new THREE.Mesh(new THREE.CircleGeometry(0.16, 8), new THREE.MeshBasicMaterial({ color: sx > 0 ? 0xff3322 : 0x33ff22 }));
      light.position.set(sx * 0.35, 0.1, 1.9);
      light.rotation.y = Math.PI * 0.5;
      g.add(light);
    }
    const prop = new THREE.Mesh(PROP_GEO, PROP_MAT);
    prop.position.x = 2.2;
    prop.userData.prop = true;
    g.add(prop);
    g.userData.prop = prop;
    return g;
  }

  function buildCrate(tier) {
    const cfg = TIERS[tier];
    const g = new THREE.Group();
    const crateMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.7, metalness: 0.2, emissive: cfg.emissive, emissiveIntensity: 0.3 });
    const crate = new THREE.Mesh(CRATE_GEO, crateMat);
    crate.castShadow = true;
    g.add(crate);
    const strapH = new THREE.Mesh(STRAP_GEO, STRAP_MAT);
    g.add(strapH);
    const strapV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.24, 1.24), STRAP_MAT);
    g.add(strapV);

    const chuteMat = new THREE.MeshStandardMaterial({ color: cfg.beacon, roughness: 0.7, flatShading: true, side: THREE.DoubleSide });
    const chute = new THREE.Mesh(CHUTE_CANOPY_GEO, chuteMat);
    chute.position.y = 3.0;
    chute.visible = false;
    g.add(chute);
    for (const sx of [-0.8, 0.8]) {
      for (const sz of [-0.8, 0.8]) {
        const string = new THREE.Mesh(CHUTE_STRING_GEO, CHUTE_STRING_MAT);
        string.position.set(sx, 1.7, sz);
        string.rotation.x = sx * 0.12;
        string.rotation.z = sz * 0.12;
        string.visible = false;
        g.add(string);
      }
    }

    const beacon = new THREE.Mesh(BEACON_GEO, new THREE.MeshBasicMaterial({ color: cfg.beacon }));
    beacon.position.y = 0.85;
    g.add(beacon);
    g.userData.beacon = beacon;

    const beam = new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial({ color: cfg.beacon, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = GLOW_RADIUS * 0.5;
    beam.visible = false;
    g.add(beam);
    g.userData.beam = beam;

    const star = new THREE.Mesh(STAR_GEO, new THREE.MeshBasicMaterial({ color: cfg.beacon, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    star.position.y = 1.4;
    star.visible = false;
    g.add(star);
    g.userData.star = star;

    g.userData.chute = chute;
    g.userData.chuteStrings = [];
    g.children.forEach(c => { if (c.geometry === CHUTE_STRING_GEO) g.userData.chuteStrings.push(c); });
    g.userData.tier = tier;
    g.userData.cfg = cfg;
    return g;
  }

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function rollTier() {
    const r = Math.random();
    let acc = 0;
    for (const key of ['standard', 'rare', 'legendary']) {
      acc += TIERS[key].weight;
      if (r < acc) return key;
    }
    return 'standard';
  }

  function spawnBurst(x, y, z, color, count) {
    for (let i = 0; i < count; i++) {
      const s = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % sparks.length;
      const ang = Math.random() * Math.PI * 2;
      const up = Math.random() * 5 + 2;
      const horiz = Math.random() * 4 + 1;
      s.vx = Math.cos(ang) * horiz;
      s.vy = up;
      s.vz = Math.sin(ang) * horiz;
      s.life = 0.6 + Math.random() * 0.3;
      s.mesh.material.color.setHex(color);
      s.mesh.material.opacity = 1;
      s.mesh.position.set(x, y, z);
      const sc = 0.5 + Math.random() * 0.8;
      s.mesh.scale.setScalar(sc);
      s.mesh.visible = true;
      s.active = true;
    }
  }

  function triggerDrop() {
    const a = Math.random() * Math.PI * 2;
    const r = 30 + Math.random() * 70;
    const tx = Math.cos(a) * r;
    const tz = Math.sin(a) * r;
    const approachAng = a + Math.PI + (Math.random() - 0.5) * 0.5;
    const offset = 70;
    state.planeStart.set(tx + Math.cos(approachAng) * offset, PLANE_ALT, tz + Math.sin(approachAng) * offset);
    state.planeEnd.set(tx - Math.cos(approachAng) * offset, PLANE_ALT, tz - Math.sin(approachAng) * offset);
    state.planeActive = true;
    state.planeT = 0;
    state.crate = null;
    state.crateState = null;
    const tier = rollTier();
    const cfg = TIERS[tier];
    if (window.FX) window.FX.message('INBOUND: ' + cfg.label, '#' + cfg.beacon.toString(16).padStart(6, '0'));
    if (window.Sound) {
      window.Sound.tone(180, 0.5, 'sawtooth', 0.25, 600);
      window.Sound.tone(240, 0.3, 'square', 0.15, 1000);
    }
    state.messageTime = 3.5;
    state.pendingTier = tier;
    state.pendingX = tx;
    state.pendingZ = tz;
  }

  function grantLoot(crate) {
    const tier = crate.userData.tier;
    const cfg = TIERS[tier];
    const weapons = window.Weapons;
    const messages = [];
    for (const item of cfg.loot) {
      if (weapons && weapons.state && weapons.state.slots[item.slot]) {
        const s = weapons.state.slots[item.slot];
        s.totalAmmo = Math.min(s.totalAmmo + item.grant, s.totalAmmo + item.grant * 2);
        messages.push(s.name + ' +' + item.grant);
      }
    }
    const mgr = window.Manager;
    if (cfg.heal && mgr && mgr.state) {
      mgr.state.playerHp = Math.min(mgr.state.playerMaxHp, mgr.state.playerHp + cfg.heal);
      messages.push('HP +' + cfg.heal);
    }
    if (cfg.shield && mgr && mgr.state) {
      mgr.state.playerMaxHp = Math.min(150, mgr.state.playerMaxHp + cfg.shield);
      mgr.state.playerHp = Math.min(mgr.state.playerMaxHp, mgr.state.playerHp + cfg.shield);
      messages.push('SHIELD +' + cfg.shield);
    }
    if (window.FX && messages.length > 0) {
      window.FX.message(cfg.label + ' — ' + messages.join(', '), '#' + cfg.beacon.toString(16).padStart(6, '0'));
    }
    if (window.Sound) {
      window.Sound.tone(440, 0.15, 'sine', 0.2, 2000);
      window.Sound.tone(660, 0.2, 'sine', 0.15, 2400);
      window.Sound.tone(880, 0.25, 'sine', 0.1, 3000);
    }
  }

  function update(dt) {
    state.timer -= dt;
    if (state.timer <= 0 && !state.planeActive && !state.crate) {
      state.timer = INTERVAL + Math.random() * 30;
      triggerDrop();
    }

    if (state.planeActive) {
      state.planeT += dt * (PLANE_SPEED / 140);
      if (!state.plane) {
        state.plane = buildPlane();
        SCENE.add(state.plane);
      }
      state.plane.position.lerpVectors(state.planeStart, state.planeEnd, state.planeT);
      state.plane.lookAt(state.planeEnd);
      if (state.plane.userData.prop) state.plane.userData.prop.rotation.z += dt * 30;

      if (state.planeT >= 0.5 && !state.crate) {
        const tier = state.pendingTier;
        const cfg = TIERS[tier];
        state.crate = buildCrate(tier);
        const gy = groundY(state.pendingX, state.pendingZ);
        state.crateState = {
          x: state.pendingX,
          z: state.pendingZ,
          y: PLANE_ALT - 2,
          vy: 0,
          landed: false,
          lifetime: LAND_LIFETIME,
          pulseT: 0,
          gy: gy,
        };
        state.crate.position.set(state.pendingX, state.crateState.y, state.pendingZ);
        SCENE.add(state.crate);
      }

      if (state.planeT >= 1.0) {
        state.planeActive = false;
        SCENE.remove(state.plane);
        state.plane = null;
      }
    }

    if (state.crate && state.crateState) {
      const cs = state.crateState;
      const cr = state.crate;
      const cfg = cr.userData.cfg;
      if (!cs.landed) {
        cs.vy -= DESCEND_SPEED * dt * 0.4;
        cs.y = Math.max(cs.gy + 0.6, cs.y + cs.vy * dt);
        cr.position.y = cs.y;
        const chute = cr.userData.chute;
        const showChute = cs.y > cs.gy + 4;
        if (chute.visible !== showChute) {
          chute.visible = showChute;
          cr.userData.chuteStrings.forEach(s => s.visible = showChute);
        }
        if (showChute) {
          chute.rotation.x = Math.sin(state.timer * 2) * 0.08;
          cr.userData.beacon.scale.setScalar(1 + Math.sin(performance.now() * 0.008) * 0.3);
        }
        if (cs.y <= cs.gy + 0.6) {
          cs.landed = true;
          cr.userData.chute.visible = false;
          cr.userData.chuteStrings.forEach(s => s.visible = false);
          cr.userData.beam.visible = true;
          cr.userData.star.visible = true;
          spawnBurst(cs.x, cs.gy + 0.5, cs.z, cfg.beacon, 12);
          if (window.Sound) {
            window.Sound.tone(100, 0.2, 'square', 0.3, 500);
            window.Sound.tone(60, 0.3, 'sawtooth', 0.2, 300);
          }
        }
      } else {
        cs.lifetime -= dt;
        cs.pulseT += dt;
        cr.rotation.y += dt * 0.5;
        const pulse = 1 + Math.sin(cs.pulseT * 3) * 0.3;
        cr.userData.beacon.scale.setScalar(pulse);
        if (cr.userData.star) {
          cr.userData.star.rotation.y += dt * 2;
          cr.userData.star.rotation.x += dt * 1.5;
          cr.userData.star.material.opacity = 0.4 + Math.sin(cs.pulseT * 4) * 0.2;
        }
        if (cr.userData.beam) {
          cr.userData.beam.material.opacity = 0.12 + Math.sin(cs.pulseT * 2.5) * 0.06;
        }
        if (cs.lifetime <= 0) {
          SCENE.remove(cr);
          state.crate = null;
          state.crateState = null;
          return;
        }

        const cam = window.CAMERA;
        if (cam) {
          const dx = cam.position.x - cs.x;
          const dz = cam.position.z - cs.z;
          if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
            grantLoot(cr);
            spawnBurst(cs.x, cs.gy + 1, cs.z, cfg.beacon, 20);
            SCENE.remove(cr);
            state.crate = null;
            state.crateState = null;
          }
        }
      }
    }

    if (state.messageTime > 0) {
      state.messageTime -= dt;
    }

    if (state.crate && state.crateState && state.crateState.landed) {
      state.hudTimer += dt;
    } else {
      state.hudTimer = 0;
    }
    updateHUD();
  }

  function updateHUD() {
    if (!state.hud) return;
    const cs = state.crateState;
    const cr = state.crate;
    if (cs && cr && cs.landed) {
      const tier = cr.userData.tier;
      const cfg = TIERS[tier];
      const cam = window.CAMERA;
      let distStr = '';
      if (cam) {
        const dx = cam.position.x - cs.x;
        const dz = cam.position.z - cs.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        distStr = ' (' + dist.toFixed(0) + 'm)';
      }
      const pulse = 0.7 + Math.sin(state.hudTimer * 4) * 0.3;
      state.hud.style.opacity = String(pulse);
      const hex = '#' + cfg.beacon.toString(16).padStart(6, '0');
      state.hud.innerHTML = '<div style="color:' + hex + ';font-size:13px;">' + cfg.label + '</div>'
        + '<div style="color:#aaa;">' + cs.lifetime.toFixed(0) + 's remaining' + distStr + '</div>';
    } else if (state.planeActive) {
      state.hud.style.opacity = '0.7';
      state.hud.innerHTML = '<div style="color:#ffaa44;font-size:13px;">✈ AIRCRAFT INBOUND</div>';
    } else {
      const t = Math.max(0, state.timer);
      state.hud.style.opacity = '0.4';
      state.hud.innerHTML = '<div style="color:#888;">NEXT SUPPLY: ' + t.toFixed(0) + 's</div>';
    }
  }

  function init() {
    const hud = document.getElementById('hud');
    if (!hud) return;
    state.hud = document.createElement('div');
    state.hud.style.cssText = 'position:absolute;top:80px;left:50%;transform:translateX(-50%);'
      + 'text-align:center;font-size:12px;letter-spacing:2px;text-shadow:0 2px 6px #000;'
      + 'pointer-events:none;z-index:6;opacity:0;transition:opacity 0.3s;';
    hud.appendChild(state.hud);
  }

  function reset() {
    if (state.plane) { SCENE.remove(state.plane); state.plane = null; }
    if (state.crate) { SCENE.remove(state.crate); state.crate = null; }
    state.crateState = null;
    state.planeActive = false;
    state.timer = FIRST_DROP;
    state.messageTime = 0;
    for (const s of sparks) { s.active = false; s.mesh.visible = false; }
  }

  return { init, update, reset, state };
})();
window.SupplyDrop = SupplyDrop;