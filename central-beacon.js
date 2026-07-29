// central-beacon.js — FORESTWAR central orbital supply beacon: a massive mid-map energy spire both teams contest for ammo, health, and stamina
const THREE = window.THREE;
const SCENE = window.SCENE;
const CentralBeacon = (() => {
  const BEACON_POS = { x: 0, z: 0 };
  const CAP_RADIUS = 10;
  const CAP_RATE = 12;
  const CONTEST_RATE = 8;
  const NEUTRAL_DECAY = 4;
  const TICK_INTERVAL = 0.6;
  const PLAYER_HEAL = 4;
  const PLAYER_STAMINA = 8;
  const PLAYER_AMMO = 3;
  const ENTITY_HEAL = 6;
  const ENERGY_MAX = 100;
  const PULSE_INTERVAL = 1.8;
  const SPARK_INTERVAL = 0.12;
  const BEAM_SWEEP_SPEED = 0.5;
  const RISE_SPEED = 3.0;
  const GRAVITY = 14;

  const state = {
    capture: 0,
    owner: null,
    pulseT: 0,
    sparkT: 0,
    beamAngle: 0,
    deerPresent: 0,
    hunterPresent: 0,
    flash: 0,
    time: 0,
  };

  const CORE_GEO = new THREE.IcosahedronGeometry(1.4, 1);
  const TOP_GEO = new THREE.IcosahedronGeometry(2.0, 0);
  const TOP_MAT_NEUTRAL = new THREE.MeshStandardMaterial({ color: 0x8888aa, roughness: 0.2, metalness: 0.8, emissive: 0x333344, emissiveIntensity: 0.5, transparent: true, opacity: 0.88 });
  const TOP_MAT_DEER = new THREE.MeshStandardMaterial({ color: 0xf0c98a, roughness: 0.2, metalness: 0.8, emissive: 0x884422, emissiveIntensity: 0.7, transparent: true, opacity: 0.92 });
  const TOP_MAT_HUNTER = new THREE.MeshStandardMaterial({ color: 0xc9d8ff, roughness: 0.2, metalness: 0.8, emissive: 0x334488, emissiveIntensity: 0.7, transparent: true, opacity: 0.92 });

  const PILLAR_GEO = new THREE.CylinderGeometry(0.6, 0.9, 9, 8);
  const PILLAR_MAT = new THREE.MeshStandardMaterial({ color: 0x3a3a34, roughness: 0.5, metalness: 0.7 });
  const STRUT_GEO = new THREE.CylinderGeometry(0.08, 0.08, 3.0, 5);
  const STRUT_MAT = new THREE.MeshStandardMaterial({ color: 0x555048, roughness: 0.5, metalness: 0.7 });

  const RING_GEO = new THREE.RingGeometry(CAP_RADIUS - 0.5, CAP_RADIUS, 64);
  const RING_NEUTRAL = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });
  const RING_DEER = new THREE.MeshBasicMaterial({ color: 0xf0c98a, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
  const RING_HUNTER = new THREE.MeshBasicMaterial({ color: 0xc9d8ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });

  const PULSE_GEO = new THREE.RingGeometry(0.6, 1.0, 48);
  const PULSE_NEUTRAL = new THREE.MeshBasicMaterial({ color: 0xaaaacc, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const PULSE_DEER = new THREE.MeshBasicMaterial({ color: 0xf0c98a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const PULSE_HUNTER = new THREE.MeshBasicMaterial({ color: 0xc9d8ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });

  const BEAM_GEO = new THREE.CylinderGeometry(0.4, 0.4, 80, 12, 1, true);
  const BEAM_NEUTRAL = new THREE.MeshBasicMaterial({ color: 0xaaaacc, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const BEAM_DEER = new THREE.MeshBasicMaterial({ color: 0xf0c98a, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const BEAM_HUNTER = new THREE.MeshBasicMaterial({ color: 0xc9d8ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });

  const SPARK_GEO = new THREE.SphereGeometry(0.18, 5, 4);
  const SPARK_DEER = new THREE.MeshBasicMaterial({ color: 0xffcc55, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const SPARK_HUNTER = new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });

  const group = new THREE.Group();
  const gy = (typeof window.groundHeight === 'function') ? window.groundHeight(BEACON_POS.x, BEACON_POS.z) : 0;
  group.position.set(BEACON_POS.x, gy, BEACON_POS.z);
  SCENE.add(group);

  const pillar = new THREE.Mesh(PILLAR_GEO, PILLAR_MAT);
  pillar.castShadow = true;
  pillar.position.y = 4.5;
  group.add(pillar);

  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const strut = new THREE.Mesh(STRUT_GEO, STRUT_MAT);
    strut.castShadow = true;
    strut.position.set(Math.cos(angle) * 1.5, 7.0, Math.sin(angle) * 1.5);
    strut.lookAt(0, 7.0, 0);
    strut.rotateX(Math.PI / 2);
    group.add(strut);
  }

  const core = new THREE.Mesh(CORE_GEO, TOP_MAT_NEUTRAL.clone());
  core.position.y = 9.5;
  group.add(core);

  const top = new THREE.Mesh(TOP_GEO, TOP_MAT_NEUTRAL.clone());
  top.position.y = 11.0;
  group.add(top);

  const ring = new THREE.Mesh(RING_GEO, RING_NEUTRAL.clone());
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);

  const beam = new THREE.Mesh(BEAM_GEO, BEAM_NEUTRAL.clone());
  beam.position.y = 50;
  group.add(beam);

  const pulses = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(PULSE_GEO, PULSE_NEUTRAL.clone());
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.1;
    m.visible = false;
    m.frustumCulled = false;
    group.add(m);
    pulses.push({ mesh: m, t: 0, active: false });
  }
  let pulseIdx = 0;

  const sparks = [];
  for (let i = 0; i < 36; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_DEER.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, active: false });
  }
  let sparkIdx = 0;

  const beamLight = new THREE.PointLight(0xaaaacc, 0.5, 30, 2);
  beamLight.position.set(BEACON_POS.x, 12, BEACON_POS.z);
  SCENE.add(beamLight);

  const hud = document.getElementById('hud');
  const hudWrap = document.createElement('div');
  hudWrap.style.cssText = 'position:absolute;left:50%;bottom:122px;transform:translateX(-50%);text-align:center;pointer-events:none;z-index:6;opacity:0;transition:opacity 0.3s;';
  hud.appendChild(hudWrap);
  const hudLabel = document.createElement('div');
  hudLabel.style.cssText = 'font-size:10px;letter-spacing:4px;color:#cccddd;text-shadow:0 1px 3px #000;margin-bottom:4px;';
  hudLabel.textContent = 'CENTRAL BEACON';
  hudWrap.appendChild(hudLabel);
  const hudBar = document.createElement('div');
  hudBar.style.cssText = 'width:220px;height:10px;background:rgba(0,0,0,0.6);border:1px solid rgba(180,180,210,0.4);border-radius:5px;overflow:hidden;margin:0 auto;';
  hudWrap.appendChild(hudBar);
  const hudFill = document.createElement('div');
  hudFill.style.cssText = 'width:0%;height:100%;border-radius:4px;transition:width 0.08s linear,background 0.2s;';
  hudBar.appendChild(hudFill);
  const hudStatus = document.createElement('div');
  hudStatus.style.cssText = 'font-size:9px;letter-spacing:2px;color:#999aaa;text-shadow:0 1px 3px #000;margin-top:3px;';
  hudStatus.textContent = 'NEUTRAL';
  hudWrap.appendChild(hudStatus);

  function getEntities() {
    if (window.Entities && Array.isArray(window.Entities.list)) return window.Entities.list;
    return [];
  }

  function getPlayerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function applyColors(team) {
    const topMat = team === 'deer' ? TOP_MAT_DEER : (team === 'hunter' ? TOP_MAT_HUNTER : TOP_MAT_NEUTRAL);
    core.material.color.copy(topMat.color);
    core.material.emissive.copy(topMat.emissive);
    core.material.emissiveIntensity = topMat.emissiveIntensity;
    core.material.opacity = topMat.opacity;
    top.material.color.copy(topMat.color);
    top.material.emissive.copy(topMat.emissive);
    top.material.emissiveIntensity = topMat.emissiveIntensity;
    top.material.opacity = topMat.opacity;
    const ringMat = team === 'deer' ? RING_DEER : (team === 'hunter' ? RING_HUNTER : RING_NEUTRAL);
    ring.material.color.copy(ringMat.color);
    ring.material.opacity = ringMat.opacity;
    const beamMat = team === 'deer' ? BEAM_DEER : (team === 'hunter' ? BEAM_HUNTER : BEAM_NEUTRAL);
    beam.material.color.copy(beamMat.color);
    beam.material.opacity = beamMat.opacity;
    if (team === 'deer') {
      beamLight.color.setHex(0xf0c98a);
      beamLight.intensity = 1.5;
    } else if (team === 'hunter') {
      beamLight.color.setHex(0xc9d8ff);
      beamLight.intensity = 1.5;
    } else {
      beamLight.color.setHex(0xaaaacc);
      beamLight.intensity = 0.5;
    }
  }

  function spawnPulse(team) {
    const slot = pulses[pulseIdx];
    pulseIdx = (pulseIdx + 1) % pulses.length;
    const mat = team === 'deer' ? PULSE_DEER : (team === 'hunter' ? PULSE_HUNTER : PULSE_NEUTRAL);
    slot.mesh.material.color.copy(mat.color);
    slot.mesh.material.opacity = 0.7;
    slot.mesh.scale.setScalar(1);
    slot.mesh.visible = true;
    slot.t = 0;
    slot.active = true;
  }

  function spawnSpark(team) {
    const slot = sparks[sparkIdx];
    sparkIdx = (sparkIdx + 1) % sparks.length;
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 5;
    const mat = team === 'deer' ? SPARK_DEER : SPARK_HUNTER;
    slot.mesh.material.color.copy(mat.color);
    slot.mesh.material.opacity = 1;
    const px = BEACON_POS.x + Math.cos(angle) * 1.5;
    const pz = BEACON_POS.z + Math.sin(angle) * 1.5;
    const py = gy + 10 + Math.random() * 2;
    slot.mesh.position.set(px, py, pz);
    const sc = 0.4 + Math.random() * 0.4;
    slot.mesh.scale.setScalar(sc);
    slot.vx = Math.cos(angle) * speed * 0.5;
    slot.vy = RISE_SPEED + Math.random() * 2;
    slot.vz = Math.sin(angle) * speed * 0.5;
    slot.life = 1.4 + Math.random() * 0.4;
    slot.mesh.visible = true;
    slot.active = true;
  }

  function grantBuff(ent, team) {
    if (!ent || ent.dead || ent.team !== team) return;
    ent.hp = Math.min(ent.maxHp, ent.hp + ENTITY_HEAL);
  }

  function grantPlayer(team) {
    const ms = window.Manager;
    if (!ms || !ms.state || ms.state.playerTeam !== team || !ms.state.playerAlive) return;
    ms.state.playerHp = Math.min(ms.state.playerMaxHp, ms.state.playerHp + PLAYER_HEAL);
    if (window.Player && window.Player.state) {
      Player.state.stamina = Math.min(100, Player.state.stamina + PLAYER_STAMINA);
    }
    if (window.Weapons && window.Weapons.state && window.Weapons.state.slots) {
      for (const s of window.Weapons.state.slots) {
        if (s && typeof s.totalAmmo === 'number' && typeof s.magSize === 'number') {
          s.totalAmmo = Math.min(s.magSize * 10, s.totalAmmo + PLAYER_AMMO * 4);
        }
      }
    }
  }

  let tickT = 0;

  function update(dt) {
    const ms = window.Manager;
    const playing = ms && ms.state && ms.state.phase === 'playing';
    state.time += dt;
    if (!playing) {
      hudWrap.style.opacity = '0';
      core.rotation.y += dt * 0.5;
      top.rotation.y -= dt * 0.7;
      beam.rotation.y += dt * BEAM_SWEEP_SPEED;
      return;
    }
    hudWrap.style.opacity = '1';
    const ents = getEntities();
    let deerN = 0, hunterN = 0;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead) continue;
      const m = e.mesh;
      if (!m) continue;
      const dx = m.position.x - BEACON_POS.x;
      const dz = m.position.z - BEACON_POS.z;
      if (dx * dx + dz * dz <= CAP_RADIUS * CAP_RADIUS) {
        if (e.team === 'deer') deerN++;
        else if (e.team === 'hunter') hunterN++;
      }
    }
    state.deerPresent = deerN;
    state.hunterPresent = hunterN;
    const cam = window.CAMERA;
    if (cam) {
      const pdx = cam.position.x - BEACON_POS.x;
      const pdz = cam.position.z - BEACON_POS.z;
      if (pdx * pdx + pdz * pdz <= CAP_RADIUS * CAP_RADIUS) {
        if (ms.state.playerTeam === 'deer') deerN++;
        else hunterN++;
      }
    }
    if (deerN > 0 && hunterN === 0) {
      state.capture = Math.min(ENERGY_MAX, state.capture + CAP_RATE * dt);
      if (state.capture >= ENERGY_MAX && state.owner !== 'deer') {
        state.owner = 'deer';
        state.flash = 1;
        applyColors('deer');
        spawnPulse('deer');
        spawnPulse('deer');
        if (window.FX && window.FX.message) window.FX.message('BEACON CAPTURED — HERD', '#f0c98a');
        if (window.Sound && window.Sound.tone) {
          window.Sound.tone(330, 0.3, 'sine', 0.3, 1500);
          window.Sound.tone(440, 0.5, 'sine', 0.2, 1000);
        }
      }
    } else if (hunterN > 0 && deerN === 0) {
      state.capture = Math.max(-ENERGY_MAX, state.capture - CAP_RATE * dt);
      if (state.capture <= -ENERGY_MAX && state.owner !== 'hunter') {
        state.owner = 'hunter';
        state.flash = 1;
        applyColors('hunter');
        spawnPulse('hunter');
        spawnPulse('hunter');
        if (window.FX && window.FX.message) window.FX.message('BEACON CAPTURED — HUNTERS', '#c9d8ff');
        if (window.Sound && window.Sound.tone) {
          window.Sound.tone(330, 0.3, 'sine', 0.3, 1500);
          window.Sound.tone(440, 0.5, 'sine', 0.2, 1000);
        }
      }
    } else if (deerN > 0 && hunterN > 0) {
      // contested — no change
    } else {
      if (state.capture > 0) state.capture = Math.max(0, state.capture - NEUTRAL_DECAY * dt);
      else if (state.capture < 0) state.capture = Math.min(0, state.capture + NEUTRAL_DECAY * dt);
      if (state.capture === 0 && state.owner !== null) {
        state.owner = null;
        applyColors(null);
      }
    }
    tickT += dt;
    if (state.owner && tickT >= TICK_INTERVAL) {
      tickT = 0;
      for (let i = 0; i < ents.length; i++) grantBuff(ents[i], state.owner);
      grantPlayer(state.owner);
    }
    state.pulseT += dt;
    const pulseInt = state.owner ? PULSE_INTERVAL * 0.65 : PULSE_INTERVAL * 1.5;
    if (state.pulseT >= pulseInt) {
      state.pulseT = 0;
      spawnPulse(state.owner);
    }
    state.sparkT += dt;
    if (state.owner && state.sparkT >= SPARK_INTERVAL) {
      state.sparkT = 0;
      spawnSpark(state.owner);
    }
    for (let i = 0; i < pulses.length; i++) {
      const p = pulses[i];
      if (!p.active) continue;
      p.t += dt;
      const lifeFrac = p.t / 2.0;
      if (lifeFrac >= 1) {
        p.active = false;
        p.mesh.visible = false;
      } else {
        const radius = 1 + lifeFrac * CAP_RADIUS;
        p.mesh.scale.set(radius, radius, radius);
        p.mesh.material.opacity = (1 - lifeFrac) * 0.7;
      }
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
      s.vy -= GRAVITY * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.material.opacity = Math.min(1, s.life * 1.5);
    }
    core.rotation.y += dt * 1.2;
    top.rotation.y -= dt * 1.5;
    top.position.y = 11.0 + Math.sin(state.time * 2.0) * 0.2;
    beam.rotation.y += dt * BEAM_SWEEP_SPEED;
    if (state.flash > 0) {
      state.flash -= dt * 2.5;
      const f = Math.max(0, state.flash);
      top.scale.setScalar(1 + f * 0.3);
      core.scale.setScalar(1 + f * 0.2);
      beamLight.intensity = (state.owner ? 1.5 : 0.5) + f * 4.0;
    } else {
      top.scale.setScalar(1);
      core.scale.setScalar(1);
    }
    hudFill.style.width = Math.abs(state.capture) + '%';
    if (state.capture > 0) {
      hudFill.style.background = 'linear-gradient(90deg,#cc8833,#f0c98a)';
      hudStatus.textContent = deerN > 0 && hunterN > 0 ? 'CONTESTED' : 'HERD CHARGING';
      hudStatus.style.color = '#f0c98a';
    } else if (state.capture < 0) {
      hudFill.style.width = Math.abs(state.capture) + '%';
      hudFill.style.background = 'linear-gradient(90deg,#336699,#c9d8ff)';
      hudStatus.textContent = deerN > 0 && hunterN > 0 ? 'CONTESTED' : 'HUNTERS CHARGING';
      hudStatus.style.color = '#c9d8ff';
    } else {
      hudFill.style.background = '#888aaa';
      hudStatus.textContent = 'NEUTRAL';
      hudStatus.style.color = '#999aaa';
    }
  }

  function reset() {
    state.capture = 0;
    state.owner = null;
    state.pulseT = 0;
    state.sparkT = 0;
    state.flash = 0;
    applyColors(null);
    for (const p of pulses) { p.active = false; p.mesh.visible = false; }
    for (const s of sparks) { s.active = false; s.mesh.visible = false; }
  }

  applyColors(null);

  return { update, reset, state };
})();
window.CentralBeacon = CentralBeacon;