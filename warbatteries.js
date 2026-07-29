// warbatteries.js — FORESTWAR capturable battery nodes: hold to charge team energy, spend on overcharge strikes
const THREE = window.THREE;
const SCENE = window.SCENE;
const Warbatteries = (() => {
  const NODE_COUNT = 5;
  const CAP_RADIUS = 4.5;
  const CAP_RATE = 14;
  const CONTEST_RATE = 9;
  const NEUTRAL_DECAY = 5;
  const ENERGY_MAX = 100;
  const OVERCHARGE_COST = 100;
  const OVERCHARGE_RADIUS = 11;
  const OVERCHARGE_DAMAGE = 140;
  const STRIKE_DELAY = 1.8;
  const STRIKE_TRAVEL = 1.2;

  const NODE_POSITIONS = [
    { x: -60, z: -20 },
    { x: 70, z: -50 },
    { x: -20, z: 75 },
    { x: 50, z: 60 },
    { x: 0, z: -70 },
  ];

  const state = {
    nodes: [],
    energy: { deer: 0, hunter: 0 },
    pendingStrike: null,
    strikeTimer: 0,
    strikePos: new THREE.Vector3(),
    strikeTeam: 'hunter',
    beamActive: false,
    cooldownFlash: 0,
  };

  const BASE_GEO = new THREE.CylinderGeometry(0.7, 0.9, 0.5, 10);
  const BASE_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2a24, roughness: 0.7, metalness: 0.6 });
  const CORE_GEO = new THREE.IcosahedronGeometry(0.55, 0);
  const CORE_MAT = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.8, emissive: 0x222222, emissiveIntensity: 0.3, transparent: true, opacity: 0.88 });
  const RING_GEO = new THREE.RingGeometry(CAP_RADIUS - 0.4, CAP_RADIUS, 48);
  const RING_NEUTRAL = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const RING_DEER = new THREE.MeshBasicMaterial({ color: 0xf0c98a, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const RING_HUNTER = new THREE.MeshBasicMaterial({ color: 0xc9d8ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const STRUT_GEO = new THREE.CylinderGeometry(0.05, 0.05, 1.0, 5);
  const STRUT_MAT = new THREE.MeshStandardMaterial({ color: 0x44443a, roughness: 0.6, metalness: 0.7 });
  const SPARK_GEO = new THREE.SphereGeometry(0.12, 5, 4);
  const SPARK_MAT = new THREE.MeshBasicMaterial({ color: 0xffee44, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const BEACON_GEO = new THREE.SphereGeometry(0.16, 8, 6);
  const BEACON_MAT_NEUTRAL = new THREE.MeshBasicMaterial({ color: 0x666666 });
  const BEACON_MAT_DEER = new THREE.MeshBasicMaterial({ color: 0xf0c98a });
  const BEACON_MAT_HUNTER = new THREE.MeshBasicMaterial({ color: 0xc9d8ff });

  const TARGET_MARKER_GEO = new THREE.RingGeometry(OVERCHARGE_RADIUS - 0.8, OVERCHARGE_RADIUS, 48);
  const TARGET_MARKER_MAT = new THREE.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const targetMarker = new THREE.Mesh(TARGET_MARKER_GEO, TARGET_MARKER_MAT);
  targetMarker.rotation.x = -Math.PI / 2;
  targetMarker.visible = false;
  SCENE.add(targetMarker);

  const BEAM_GEO = new THREE.CylinderGeometry(0.15, 0.15, 1, 8, 1, true);
  const BEAM_MAT = new THREE.MeshBasicMaterial({ color: 0xffaa22, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const beam = new THREE.Mesh(BEAM_GEO, BEAM_MAT);
  beam.visible = false;
  SCENE.add(beam);

  const FLASH_GEO = new THREE.SphereGeometry(OVERCHARGE_RADIUS, 12, 10);
  const FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const flash = new THREE.Mesh(FLASH_GEO, FLASH_MAT);
  flash.visible = false;
  SCENE.add(flash);
  const flashLight = new THREE.PointLight(0xffaa22, 0, 40, 2);
  SCENE.add(flashLight);

  const sparks = [];
  for (let i = 0; i < 60; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, active: false });
  }
  let sparkIdx = 0;

  function spawnSpark(x, y, z, color, power) {
    const s = sparks[sparkIdx];
    sparkIdx = (sparkIdx + 1) % sparks.length;
    const ang = Math.random() * Math.PI * 2;
    const spd = (0.8 + Math.random() * 2.0) * power;
    s.vx = Math.cos(ang) * spd;
    s.vy = (1.0 + Math.random() * 3.0) * power;
    s.vz = Math.sin(ang) * spd;
    s.mesh.position.set(x, y, z);
    s.mesh.material.color.setHex(color);
    s.mesh.material.opacity = 1;
    s.mesh.scale.setScalar(0.5 + Math.random() * 0.8);
    s.mesh.visible = true;
    s.life = 0.4 + Math.random() * 0.3;
    s.active = true;
  }

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function init() {
    for (const pos of NODE_POSITIONS) {
      const gy = groundY(pos.x, pos.z);
      const group = new THREE.Group();
      group.position.set(pos.x, gy, pos.z);

      const base = new THREE.Mesh(BASE_GEO, BASE_MAT);
      base.castShadow = true;
      base.position.y = 0.25;
      group.add(base);

      for (let i = 0; i < 4; i++) {
        const strut = new THREE.Mesh(STRUT_GEO, STRUT_MAT);
        const ang = (i / 4) * Math.PI * 2;
        strut.position.set(Math.cos(ang) * 0.5, 0.5, Math.sin(ang) * 0.5);
        strut.rotation.z = Math.cos(ang) * 0.3;
        strut.rotation.x = -Math.sin(ang) * 0.3;
        group.add(strut);
      }

      const core = new THREE.Mesh(CORE_GEO, CORE_MAT.clone());
      core.position.y = 1.3;
      group.add(core);

      const beacon = new THREE.Mesh(BEACON_GEO, BEACON_MAT_NEUTRAL.clone());
      beacon.position.y = 2.2;
      group.add(beacon);

      const light = new THREE.PointLight(0x666666, 0.8, 10, 2);
      light.position.y = 1.3;
      group.add(light);

      const ring = new THREE.Mesh(RING_GEO, RING_NEUTRAL.clone());
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      group.add(ring);

      SCENE.add(group);

      state.nodes.push({
        x: pos.x, z: pos.z,
        group, core, beacon, light, ring,
        owner: null,
        progress: 0,
        spinPhase: Math.random() * Math.PI * 2,
        bobPhase: Math.random() * Math.PI * 2,
        pulseTimer: 0,
        sparkTimer: 0,
      });
    }

    if (window.addEventListener) {
      window.addEventListener('keydown', (e) => {
        if (e.key !== 'k' && e.key !== 'K') return;
        if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
        if (!window.Player || !Player.state.locked) return;
        requestStrike();
      });
    }

    buildHUD();
  }

  const hudWrap = document.createElement('div');
  hudWrap.style.cssText = 'position:absolute;left:50%;top:80px;transform:translateX(-50%);display:flex;gap:40px;pointer-events:none;z-index:6;';

  const deerPanel = document.createElement('div');
  deerPanel.style.cssText = 'text-align:center;font-size:10px;letter-spacing:2px;text-shadow:0 1px 3px #000;';
  const deerLabel = document.createElement('div');
  deerLabel.style.cssText = 'color:#f0c98a;margin-bottom:3px;';
  deerLabel.textContent = 'DEER ENERGY';
  deerPanel.appendChild(deerLabel);
  const deerBarWrap = document.createElement('div');
  deerBarWrap.style.cssText = 'width:140px;height:8px;background:rgba(0,0,0,0.55);border:1px solid rgba(240,201,138,0.4);border-radius:4px;overflow:hidden;';
  const deerFill = document.createElement('div');
  deerFill.style.cssText = 'width:0%;height:100%;background:linear-gradient(90deg,#cc9955,#f0c98a);transition:width 0.15s;';
  deerBarWrap.appendChild(deerFill);
  deerPanel.appendChild(deerBarWrap);
  hudWrap.appendChild(deerPanel);

  const centerMsg = document.createElement('div');
  centerMsg.style.cssText = 'font-size:10px;letter-spacing:3px;color:#ffaa44;text-shadow:0 1px 3px #000;opacity:0;transition:opacity 0.3s;align-self:center;text-align:center;width:120px;';
  centerMsg.textContent = 'OVERCHARGE READY [K]';
  hudWrap.appendChild(centerMsg);

  const hunterPanel = document.createElement('div');
  hunterPanel.style.cssText = 'text-align:center;font-size:10px;letter-spacing:2px;text-shadow:0 1px 3px #000;';
  const hunterLabel = document.createElement('div');
  hunterLabel.style.cssText = 'color:#c9d8ff;margin-bottom:3px;';
  hunterLabel.textContent = 'HUNTER ENERGY';
  hunterPanel.appendChild(hunterLabel);
  const hunterBarWrap = document.createElement('div');
  hunterBarWrap.style.cssText = 'width:140px;height:8px;background:rgba(0,0,0,0.55);border:1px solid rgba(201,216,255,0.4);border-radius:4px;overflow:hidden;';
  const hunterFill = document.createElement('div');
  hunterFill.style.cssText = 'width:0%;height:100%;background:linear-gradient(90deg,#6688cc,#c9d8ff);transition:width 0.15s;';
  hunterBarWrap.appendChild(hunterFill);
  hunterPanel.appendChild(hunterBarWrap);
  hudWrap.appendChild(hunterPanel);

  function buildHUD() {
    const hud = document.getElementById('hud');
    if (!hud) return;
    hud.appendChild(hudWrap);
  }

  function requestStrike() {
    const pt = (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
    if (state.energy[pt] < OVERCHARGE_COST) {
      if (window.FX) window.FX.message('NOT ENOUGH ENERGY', '#ff6644');
      return;
    }
    if (state.pendingStrike) return;

    const cam = window.CAMERA;
    if (!cam) return;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const tx = cam.position.x + fwd.x * 30;
    const tz = cam.position.z + fwd.z * 30;
    state.pendingStrike = true;
    state.strikeTimer = STRIKE_DELAY;
    state.strikePos.set(tx, 0, tz);
    state.strikeTeam = pt;
    state.energy[pt] -= OVERCHARGE_COST;

    targetMarker.position.set(tx, groundY(tx, tz) + 0.1, tz);
    targetMarker.material.opacity = 0.7;
    targetMarker.visible = true;

    if (window.FX) window.FX.message('OVERCHARGE STRIKE INBOUND', '#ffaa44');
    if (window.Sound) {
      window.Sound.tone(110, 0.6, 'sawtooth', 0.3, 600);
      window.Sound.tone(220, 0.4, 'square', 0.2, 900);
    }
  }

  function getPlayerPos() {
    const cam = window.CAMERA;
    if (!cam) return null;
    return cam.position;
  }

  function countNearby(x, z, team) {
    let n = 0;
    const ents = (window.Entities && window.Entities.list) || [];
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.team !== team) continue;
      const m = e.mesh;
      if (!m) continue;
      const dx = m.position.x - x, dz = m.position.z - z;
      if (dx * dx + dz * dz < CAP_RADIUS * CAP_RADIUS) n++;
    }
    return n;
  }

  function isPlayerNear(x, z) {
    const pp = getPlayerPos();
    if (!pp) return false;
    const dx = pp.x - x, dz = pp.z - z;
    return dx * dx + dz * dz < CAP_RADIUS * CAP_RADIUS;
  }

  function getPlayerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function updateNode(node, dt) {
    const deerN = countNearby(node.x, node.z, 'deer');
    const hunterN = countNearby(node.x, node.z, 'hunter');
    const pt = getPlayerTeam();
    const playerNear = isPlayerNear(node.x, node.z);
    const playerCounts = playerNear ? 1 : 0;
    const deerTotal = deerN + (pt === 'deer' ? playerCounts : 0);
    const hunterTotal = hunterN + (pt === 'hunter' ? playerCounts : 0);

    if (deerTotal > 0 && hunterTotal > 0) {
      // contested — drain slowly
      node.progress -= NEUTRAL_DECAY * dt;
      if (node.progress < 0) { node.progress = 0; node.owner = null; }
    } else if (deerTotal > 0) {
      if (node.owner === 'hunter') {
        node.progress -= CONTEST_RATE * dt * deerTotal;
        if (node.progress <= 0) { node.progress = 0; node.owner = null; }
      } else {
        node.owner = 'deer';
        node.progress += CAP_RATE * dt * deerTotal;
        if (node.progress > 100) node.progress = 100;
        state.energy.deer += CAP_RATE * dt * deerTotal * 0.4;
      }
    } else if (hunterTotal > 0) {
      if (node.owner === 'deer') {
        node.progress -= CONTEST_RATE * dt * hunterTotal;
        if (node.progress <= 0) { node.progress = 0; node.owner = null; }
      } else {
        node.owner = 'hunter';
        node.progress += CAP_RATE * dt * hunterTotal;
        if (node.progress > 100) node.progress = 100;
        state.energy.hunter += CAP_RATE * dt * hunterTotal * 0.4;
      }
    } else {
      node.progress -= NEUTRAL_DECAY * 0.3 * dt;
      if (node.progress < 0) { node.progress = 0; node.owner = null; }
    }

    state.energy.deer = Math.min(ENERGY_MAX, state.energy.deer);
    state.energy.hunter = Math.min(ENERGY_MAX, state.energy.hunter);

    // visuals
    node.spinPhase += dt * (1.0 + node.progress * 0.03);
    node.bobPhase += dt * 2.5;
    node.core.rotation.y = node.spinPhase;
    node.core.rotation.x = node.spinPhase * 0.6;
    node.core.position.y = 1.3 + Math.sin(node.bobPhase) * 0.12;
    node.pulseTimer -= dt;
    node.sparkTimer -= dt;

    let coreColor, beaconColor, ringColor, lightColor, glow;
    if (node.owner === 'deer') {
      coreColor = 0xf0c98a; beaconColor = 0xf0c98a; ringColor = 0xf0c98a; lightColor = 0xf0c98a;
      glow = 0.4 + node.progress * 0.01;
    } else if (node.owner === 'hunter') {
      coreColor = 0xc9d8ff; beaconColor = 0xc9d8ff; ringColor = 0xc9d8ff; lightColor = 0xc9d8ff;
      glow = 0.4 + node.progress * 0.01;
    } else {
      coreColor = 0xaaaaaa; beaconColor = 0x888888; ringColor = 0xaaaaaa; lightColor = 0x888888;
      glow = 0.2;
    }
    node.core.material.emissive.setHex(coreColor);
    node.core.material.emissiveIntensity = glow;
    node.beacon.material.color.setHex(beaconColor);
    node.light.color.setHex(lightColor);
    node.light.intensity = 0.6 + glow * 1.5;
    node.ring.material.color.setHex(ringColor);
    node.ring.material.opacity = 0.15 + Math.sin(node.bobPhase * 0.8) * 0.05 + (node.owner ? 0.15 : 0);

    if (node.owner && node.sparkTimer <= 0) {
      node.sparkTimer = 0.15 + Math.random() * 0.1;
      const gy = groundY(node.x, node.z);
      spawnSpark(
        node.x + (Math.random() - 0.5) * 1.2,
        gy + 1.0 + Math.random() * 0.6,
        node.z + (Math.random() - 0.5) * 1.2,
        coreColor,
        0.5 + node.progress * 0.005
      );
    }
  }

  function detonateStrike() {
    const sx = state.strikePos.x;
    const sz = state.strikePos.z;
    const gy = groundY(sx, sz);
    const team = state.strikeTeam;

    flash.position.set(sx, gy + 1, sz);
    flash.material.opacity = 0.9;
    flash.visible = true;
    flashLight.position.set(sx, gy + 4, sz);
    flashLight.intensity = 12;

    for (let i = 0; i < 30; i++) {
      spawnSpark(sx + (Math.random() - 0.5) * 8, gy + Math.random() * 3, sz + (Math.random() - 0.5) * 8, 0xffaa33, 2.5);
    }

    const ents = (window.Entities && window.Entities.list) || [];
    const r2 = OVERCHARGE_RADIUS * OVERCHARGE_RADIUS;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.team === team) continue;
      const m = e.mesh;
      if (!m) continue;
      const dx = m.position.x - sx, dz = m.position.z - sz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r2) {
        const falloff = 1 - Math.sqrt(d2) / OVERCHARGE_RADIUS;
        const dmg = OVERCHARGE_DAMAGE * falloff;
        if (e.takeDamage) e.takeDamage(dmg, team);
        else if (e.hp !== undefined) {
          e.hp -= dmg;
          if (e.hp <= 0 && e.die) e.die();
        }
      }
    }

    const pp = getPlayerPos();
    const pt = getPlayerTeam();
    if (pp && pt !== team) {
      const dx = pp.x - sx, dz = pp.z - sz;
      if (dx * dx + dz * dz < r2) {
        const falloff = 1 - Math.sqrt(dx * dx + dz * dz) / OVERCHARGE_RADIUS;
        const dmg = OVERCHARGE_DAMAGE * falloff * 0.5;
        if (window.Manager && window.Manager.state) {
          window.Manager.state.playerHp -= dmg;
          if (window.FX) window.FX.bloodBurst(pp.clone(), new THREE.Vector3(0, 1, 0));
          if (window.FX && window.FX.shake) window.FX.shake(0.6);
        }
      }
    }

    if (window.Craters) window.Craters.create(sx, sz, OVERCHARGE_RADIUS * 0.7);
    if (window.Fire && window.Fire.ignite) {
      window.Fire.ignite(sx, sz, OVERCHARGE_RADIUS);
    }
    if (window.Sound) window.Sound.explosion();

    if (window.FX && window.FX.shake) window.FX.shake(0.8);

    state.pendingStrike = false;
    state.beamActive = false;
    beam.visible = false;
    targetMarker.visible = false;
  }

  function updateStrike(dt) {
    if (!state.pendingStrike) {
      if (flash.visible) {
        flash.material.opacity *= Math.pow(0.02, dt);
        flashLight.intensity *= Math.pow(0.01, dt);
        if (flash.material.opacity < 0.01) { flash.visible = false; flashLight.intensity = 0; }
      }
      return;
    }

    state.strikeTimer -= dt;
    if (state.strikeTimer > 0) {
      const pulse = 0.4 + Math.abs(Math.sin(state.strikeTimer * 8)) * 0.5;
      targetMarker.material.opacity = pulse;
      const scl = 1 + Math.sin(state.strikeTimer * 12) * 0.05;
      targetMarker.scale.setScalar(scl);
      return;
    }

    if (!state.beamActive) {
      state.beamActive = true;
      const sx = state.strikePos.x;
      const sz = state.strikePos.z;
      const gy = groundY(sx, sz);
      beam.position.set(sx, gy + 30, sz);
      beam.scale.y = 60 / 1;
      beam.material.opacity = 0.8;
      beam.visible = true;
      if (window.Sound) window.Sound.tone(880, 0.3, 'sawtooth', 0.4, 2000);
    }

    state.strikeTimer -= dt * 0.5;
    beam.material.opacity *= Math.pow(0.4, dt);
    const sx = state.strikePos.x, sz = state.strikePos.z;
    const gy = groundY(sx, sz);

    for (let i = 0; i < 3; i++) {
      spawnSpark(sx + (Math.random() - 0.5) * 3, gy + Math.random() * 2, sz + (Math.random() - 0.5) * 3, 0xffaa33, 1.5);
    }

    if (state.strikeTimer < -STRIKE_TRAVEL) {
      detonateStrike();
    }
  }

  function updateHUD() {
    deerFill.style.width = (state.energy.deer / ENERGY_MAX * 100) + '%';
    hunterFill.style.width = (state.energy.hunter / ENERGY_MAX * 100) + '%';
    const pt = getPlayerTeam();
    const ready = state.energy[pt] >= OVERCHARGE_COST && !state.pendingStrike;
    centerMsg.style.opacity = ready ? '1' : '0';
    centerMsg.style.color = pt === 'deer' ? '#f0c98a' : '#c9d8ff';
  }

  function updateSparks(dt) {
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; s.active = false; continue; }
      s.vy -= 6 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      const gy = groundY(s.mesh.position.x, s.mesh.position.z);
      if (s.mesh.position.y < gy) { s.mesh.visible = false; s.active = false; continue; }
      s.mesh.material.opacity = Math.min(1, s.life * 3);
      s.mesh.scale.multiplyScalar(Math.pow(0.92, dt * 60));
    }
  }

  function update(dt) {
    if (dt > 0.1) dt = 0.1;
    for (let i = 0; i < state.nodes.length; i++) updateNode(state.nodes[i], dt);
    updateStrike(dt);
    updateSparks(dt);
    updateHUD();
  }

  return { init, update, state };
})();

window.Warbatteries = Warbatteries;