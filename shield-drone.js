// shield-drone.js — FORESTWAR shield drone: hovering companion that projects a forward energy bubble absorbing incoming damage
const THREE = window.THREE;
const SCENE = window.SCENE;
const ShieldDrone = (() => {
  const FOLLOW_DIST = 3.0;
  const FOLLOW_HEIGHT = 2.8;
  const LERP = 5.0;
  const BOB_FREQ = 2.6;
  const SHIELD_RADIUS = 3.2;
  const SHIELD_HALF_ANGLE = 1.15;
  const MAX_SHIELD = 250;
  const REGEN_RATE = 12;
  const REGEN_DELAY = 2.5;
  const PULSE_DURATION = 0.4;
  const PULSE_COLOR = 0xff4444;
  const IDLE_COLOR = 0x44ddff;
  const TEAM = 'hunter';
  const RING_SEGMENTS = 40;

  const state = {
    active: false,
    pos: new THREE.Vector3(0, FOLLOW_HEIGHT, FOLLOW_DIST),
    bobPhase: 0,
    shield: MAX_SHIELD,
    regenTimer: 0,
    angle: 0,
    targetAngle: 0,
    pulseTimer: 0,
    ringPhase: 0,
    spinPhase: 0,
    chargeFlash: 0,
    despawnTimer: 0,
  };

  const BODY_GEO = new THREE.IcosahedronGeometry(0.3, 0);
  const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x225577, roughness: 0.3, metalness: 0.7, emissive: 0x002233, emissiveIntensity: 0.6 });
  const RING_GEO = new THREE.TorusGeometry(0.48, 0.04, 6, 22);
  const RING_MAT = new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.7 });
  const CORE_GEO = new THREE.SphereGeometry(0.12, 10, 8);
  const CORE_MAT = new THREE.MeshBasicMaterial({ color: 0x88eeff });
  const FIN_GEO = new THREE.BoxGeometry(0.07, 0.07, 0.38);
  const FIN_MAT = new THREE.MeshStandardMaterial({ color: 0x113355, roughness: 0.5, metalness: 0.6 });
  const LENS_GEO = new THREE.SphereGeometry(0.06, 8, 6);
  const LENS_MAT = new THREE.MeshBasicMaterial({ color: 0xaaeeff });

  const BUBBLE_MAT = new THREE.MeshBasicMaterial({
    color: IDLE_COLOR,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(SHIELD_RADIUS, 16, 12), BUBBLE_MAT);
  bubble.visible = false;
  SCENE.add(bubble);

  const ARC_SEGMENTS = 28;
  const arcPositions = new Float32Array(ARC_SEGMENTS * 3);
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPositions, 3));
  const arcMat = new THREE.LineBasicMaterial({ color: IDLE_COLOR, transparent: true, opacity: 0.5 });
  const arc = new THREE.Line(arcGeo, arcMat);
  arc.visible = false;
  arc.frustumCulled = false;
  SCENE.add(arc);

  const innerArcPositions = new Float32Array(ARC_SEGMENTS * 3);
  const innerArcGeo = new THREE.BufferGeometry();
  innerArcGeo.setAttribute('position', new THREE.BufferAttribute(innerArcPositions, 3));
  const innerArcMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
  const innerArc = new THREE.Line(innerArcGeo, innerArcMat);
  innerArc.visible = false;
  innerArc.frustumCulled = false;
  SCENE.add(innerArc);

  const SPARK_GEO = new THREE.SphereGeometry(0.07, 4, 3);
  const SPARK_POOL = 20;
  const SPARK_LIFE = 0.3;
  const sparks = [];
  for (let i = 0; i < SPARK_POOL; i++) {
    const mesh = new THREE.Mesh(SPARK_GEO, new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.visible = false;
    mesh.frustumCulled = false;
    SCENE.add(mesh);
    sparks.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0, active: false });
  }
  let sparkIdx = 0;

  const RIPPLE_POOL = 6;
  const ripples = [];
  for (let i = 0; i < RIPPLE_POOL; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.3, 20),
      new THREE.MeshBasicMaterial({ color: 0x88ddff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    ring.visible = false;
    ring.frustumCulled = false;
    SCENE.add(ring);
    ripples.push({ mesh: ring, life: 0, active: false });
  }
  let rippleIdx = 0;

  const droneLight = new THREE.PointLight(0x44ccff, 0, 8, 2);
  SCENE.add(droneLight);

  let mesh = null;
  const coreRef = { mesh: null };
  const ringsRef = [];

  function build() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(BODY_GEO, BODY_MAT);
    body.castShadow = true;
    g.add(body);
    const core = new THREE.Mesh(CORE_GEO, CORE_MAT);
    g.add(core);
    coreRef.mesh = core;
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(RING_GEO, RING_MAT.clone());
      ring.rotation.x = (i / 3) * Math.PI;
      ring.rotation.z = (i / 3) * Math.PI * 0.7;
      ring.userData.spin = (i % 2 === 0 ? 1 : -1) * (1.5 + i * 0.4);
      g.add(ring);
      ringsRef.push(ring);
    }
    for (const sx of [-1, 1]) {
      const fin = new THREE.Mesh(FIN_GEO, FIN_MAT);
      fin.position.set(sx * 0.3, 0, 0);
      fin.rotation.z = sx * 0.25;
      g.add(fin);
      const lens = new THREE.Mesh(LENS_GEO, LENS_MAT);
      lens.position.set(sx * 0.28, 0, 0.12);
      g.add(lens);
    }
    return g;
  }

  function activate() {
    if (state.active) return;
    mesh = build();
    SCENE.add(mesh);
    state.active = true;
    state.shield = MAX_SHIELD;
    bubble.visible = true;
    arc.visible = true;
    innerArc.visible = true;
    droneLight.intensity = 1.5;
  }

  function deactivate() {
    if (!state.active) return;
    SCENE.remove(mesh);
    mesh = null;
    ringsRef.length = 0;
    state.active = false;
    bubble.visible = false;
    arc.visible = false;
    innerArc.visible = false;
    droneLight.intensity = 0;
    for (const s of sparks) { s.mesh.visible = false; s.active = false; }
    for (const r of ripples) { r.mesh.visible = false; r.active = false; }
  }

  function _getPlayerForward() {
    const cam = window.CAMERA;
    if (!cam) return { x: 0, z: -1 };
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    return { x: fwd.x, z: fwd.z };
  }

  function tryAbsorb(bulletX, bulletZ, bulletY, shooterTeam) {
    if (!state.active) return false;
    if (state.shield <= 0) return false;
    if (shooterTeam === TEAM) return false;
    const cam = window.CAMERA;
    if (!cam) return false;
    const dx = bulletX - state.pos.x;
    const dy = bulletY - state.pos.y;
    const dz = bulletZ - state.pos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > SHIELD_RADIUS + 0.5) return false;
    const dot = (-dx * state.dirX + -dz * state.dirZ) / (dist + 0.001);
    const angleFromFront = Math.acos(Math.max(-1, Math.min(1, dot)));
    if (angleFromFront > SHIELD_HALF_ANGLE) return false;

    const absorbed = Math.min(state.shield, 20);
    state.shield -= absorbed;
    state.regenTimer = REGEN_DELAY;
    state.pulseTimer = PULSE_DURATION;

    spawnImpactSparks(bulletX, bulletY, bulletZ);
    spawnRipple(bulletX, bulletY, bulletZ);

    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(800 + Math.random() * 200, 0.04, 'square', 0.08, 3000);
    }
    if (state.shield <= 0) {
      state.shield = 0;
      state.despawnTimer = 4;
      bubble.visible = false;
      arc.visible = false;
      innerArc.visible = false;
      droneLight.intensity = 0.3;
      if (window.FX && window.FX.message) {
        window.FX.message('SHIELD DOWN', '#ff4444');
      }
    }
    return true;
  }

  state.dirX = 0;
  state.dirZ = -1;

  function spawnImpactSparks(x, y, z) {
    for (let i = 0; i < 5; i++) {
      const s = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % SPARK_POOL;
      const ang = Math.random() * Math.PI * 2;
      const elev = Math.random() * Math.PI * 0.5;
      const spd = 3 + Math.random() * 4;
      s.vx = Math.cos(ang) * Math.cos(elev) * spd;
      s.vy = Math.sin(elev) * spd;
      s.vz = Math.sin(ang) * Math.cos(elev) * spd;
      s.mesh.position.set(x, y, z);
      s.mesh.material.opacity = 1;
      s.mesh.visible = true;
      s.life = SPARK_LIFE;
      s.active = true;
    }
  }

  function spawnRipple(x, y, z) {
    const r = ripples[rippleIdx];
    rippleIdx = (rippleIdx + 1) % RIPPLE_POOL;
    r.mesh.position.set(x, y, z);
    r.mesh.lookAt(state.pos.x, state.pos.y, state.pos.z);
    r.mesh.scale.setScalar(0.3);
    r.mesh.material.opacity = 0.8;
    r.mesh.visible = true;
    r.life = 0.45;
    r.active = true;
  }

  function updateArcs(t) {
    const baseOpacity = state.shield > 0 ? (0.15 + (state.shield / MAX_SHIELD) * 0.2) : 0;
    const pulseFactor = state.pulseTimer > 0 ? (state.pulseTimer / PULSE_DURATION) : 0;
    bubble.material.color.setHex(state.pulseTimer > 0 ? PULSE_COLOR : IDLE_COLOR);
    bubble.material.opacity = baseOpacity + pulseFactor * 0.3;

    const arcCol = state.pulseTimer > 0 ? PULSE_COLOR : IDLE_COLOR;
    arc.material.color.setHex(arcCol);
    arc.material.opacity = 0.45 + (state.shield / MAX_SHIELD) * 0.35 + Math.sin(t * 4) * 0.05;
    innerArc.material.opacity = 0.25 + (state.shield / MAX_SHIELD) * 0.15;

    const dirX = state.dirX, dirZ = state.dirZ;
    const px = state.pos.x, py = state.pos.y, pz = state.pos.z;
    const wobble = Math.sin(t * 3) * 0.04;

    for (let i = 0; i < ARC_SEGMENTS; i++) {
      const frac = i / (ARC_SEGMENTS - 1);
      const theta = -SHIELD_HALF_ANGLE + frac * (SHIELD_HALF_ANGLE * 2) + wobble;
      const ca = Math.cos(theta), sa = Math.sin(theta);
      const rx = dirX * ca - dirZ * sa;
      const rz = dirX * sa + dirZ * ca;
      arcPositions[i * 3] = px + rx * SHIELD_RADIUS;
      arcPositions[i * 3 + 1] = py;
      arcPositions[i * 3 + 2] = pz + rz * SHIELD_RADIUS;
      const innerR = SHIELD_RADIUS * 0.85;
      innerArcPositions[i * 3] = px + rx * innerR;
      innerArcPositions[i * 3 + 1] = py + Math.sin(frac * Math.PI * 2 + t * 5) * 0.15;
      innerArcPositions[i * 3 + 2] = pz + rz * innerR;
    }
    arc.geometry.attributes.position.needsUpdate = true;
    innerArc.geometry.attributes.position.needsUpdate = true;
  }

  function updateSparks(dt) {
    for (let i = 0; i < SPARK_POOL; i++) {
      const s = sparks[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; s.active = false; continue; }
      s.vy -= 12 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.material.opacity = s.life / SPARK_LIFE;
    }
  }

  function updateRipples(dt) {
    for (let i = 0; i < RIPPLE_POOL; i++) {
      const r = ripples[i];
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) { r.mesh.visible = false; r.active = false; continue; }
      const t = 1 - r.life / 0.45;
      r.mesh.scale.setScalar(0.3 + t * 2.5);
      r.mesh.material.opacity = (1 - t) * 0.8;
    }
  }

  function update(dt) {
    if (!state.active) return;
    const cam = window.CAMERA;
    if (!cam) return;
    state.bobPhase += dt * BOB_FREQ;
    state.ringPhase += dt;
    state.spinPhase += dt;
    const fwd = _getPlayerForward();
    state.targetAngle = Math.atan2(fwd.x, fwd.z);
    let diff = state.targetAngle - state.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    state.angle += diff * Math.min(1, dt * 8);
    state.dirX = Math.sin(state.angle);
    state.dirZ = Math.cos(state.angle);
    const behindX = cam.position.x - fwd.x * FOLLOW_DIST;
    const behindZ = cam.position.z - fwd.z * FOLLOW_DIST;
    const tx = behindX + Math.sin(state.angle) * 0.5;
    const tz = behindZ + Math.cos(state.angle) * 0.5;
    const ty = cam.position.y + FOLLOW_HEIGHT + Math.sin(state.bobPhase) * 0.18;
    const lerpF = Math.min(1, dt * LERP);
    state.pos.x += (tx - state.pos.x) * lerpF;
    state.pos.y += (ty - state.pos.y) * lerpF;
    state.pos.z += (tz - state.pos.z) * lerpF;

    if (mesh) {
      mesh.position.copy(state.pos);
      mesh.rotation.y = state.angle;
      for (const ring of ringsRef) {
        ring.rotation.x += ring.userData.spin * dt;
        ring.rotation.z += ring.userData.spin * 0.7 * dt;
      }
      if (coreRef.mesh) {
        const s = 1 + Math.sin(state.bobPhase * 2) * 0.1;
        coreRef.mesh.scale.setScalar(s);
      }
    }

    bubble.position.copy(state.pos);
    droneLight.position.set(state.pos.x, state.pos.y - 0.3, state.pos.z);

    if (state.shield > 0) {
      updateArcs(state.ringPhase);
    } else {
      state.despawnTimer -= dt;
      if (state.despawnTimer <= 0) {
        state.shield = MAX_SHIELD * 0.5;
        state.regenTimer = 0;
        bubble.visible = true;
        arc.visible = true;
        innerArc.visible = true;
        droneLight.intensity = 1.5;
        if (window.FX && window.FX.message) {
          window.FX.message('SHIELD REBOOTED', '#44ddff');
        }
      }
    }

    state.pulseTimer = Math.max(0, state.pulseTimer - dt);
    state.regenTimer = Math.max(0, state.regenTimer - dt);
    if (state.regenTimer === 0 && state.shield < MAX_SHIELD) {
      state.shield = Math.min(MAX_SHIELD, state.shield + REGEN_RATE * dt);
    }

    updateSparks(dt);
    updateRipples(dt);
    updateHUD();
  }

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:88px;width:200px;text-align:center;z-index:6;opacity:0;transition:opacity 0.3s;';
  const label = document.createElement('div');
  label.style.cssText = 'font-size:10px;letter-spacing:3px;color:#44ddff;text-shadow:0 0 6px rgba(0,150,255,0.5),0 1px 3px #000;margin-bottom:3px;';
  label.textContent = 'SHIELD DRONE';
  hud.appendChild(label);
  const barWrap = document.createElement('div');
  barWrap.style.cssText = 'width:100%;height:6px;background:rgba(0,0,0,0.55);border:1px solid rgba(68,221,255,0.4);border-radius:3px;overflow:hidden;';
  const barFill = document.createElement('div');
  barFill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#2288cc,#66eeff);border-radius:2px;transition:width 0.1s,background 0.2s;';
  barWrap.appendChild(barFill);
  hud.appendChild(barWrap);
  const valText = document.createElement('div');
  valText.style.cssText = 'font-size:9px;color:#88ddff;text-shadow:0 1px 2px #000;margin-top:2px;';
  valText.textContent = '250 / 250';
  hud.appendChild(valText);
  document.getElementById('hud').appendChild(hud);

  function updateHUD() {
    if (!state.active) { hud.style.opacity = '0'; return; }
    hud.style.opacity = '1';
    const pct = state.shield / MAX_SHIELD;
    barFill.style.width = (pct * 100) + '%';
    valText.textContent = Math.ceil(state.shield) + ' / ' + MAX_SHIELD;
    if (pct < 0.25) {
      barFill.style.background = 'linear-gradient(90deg,#cc2222,#ff6644)';
      valText.style.color = '#ff6644';
    } else if (pct < 0.6) {
      barFill.style.background = 'linear-gradient(90deg,#cc8822,#ffcc44)';
      valText.style.color = '#ffcc44';
    } else {
      barFill.style.background = 'linear-gradient(90deg,#2288cc,#66eeff)';
      valText.style.color = '#88ddff';
    }
  }

  function getShieldValue() { return state.shield; }
  function getMaxShield() { return MAX_SHIELD; }
  function isActive() { return state.active; }

  return { activate, deactivate, update, tryAbsorb, getShieldValue, getMaxShield, isActive };
})();

if (window) window.ShieldDrone = ShieldDrone;