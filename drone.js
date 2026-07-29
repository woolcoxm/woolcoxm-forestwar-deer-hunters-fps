// drone.js — FORESTWAR medic drone: hovering companion that heals the player via tether beam
const THREE = window.THREE;
const SCENE = window.SCENE;
const Drone = (() => {
  const HEAL_RATE = 3.5;
  const REVIVE_AMOUNT = 35;
  const REVIVE_THRESHOLD = 22;
  const REVIVE_COOLDOWN = 55;
  const FOLLOW_DIST = 3.2;
  const HOVER_HEIGHT = 2.1;
  const LERP = 4.0;
  const BOB_FREQ = 2.4;

  const state = {
    mesh: null,
    light: null,
    tether: null,
    pos: new THREE.Vector3(0, HOVER_HEIGHT, FOLLOW_DIST),
    bobPhase: 0,
    reviving: false,
    reviveTimer: 0,
    cooldown: 0,
    active: false,
  };

  const BODY_GEO = new THREE.IcosahedronGeometry(0.32, 0);
  const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0xb8d4ff, roughness: 0.3, metalness: 0.7, emissive: 0x1a3a6a, emissiveIntensity: 0.5 });
  const RING_GEO = new THREE.TorusGeometry(0.5, 0.04, 6, 20);
  const RING_MAT = new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.6 });
  const CORE_GEO = new THREE.SphereGeometry(0.14, 10, 8);
  const CORE_MAT = new THREE.MeshBasicMaterial({ color: 0x66ffaa });
  const FIN_GEO = new THREE.BoxGeometry(0.08, 0.08, 0.4);
  const FIN_MAT = new THREE.MeshStandardMaterial({ color: 0x446688, roughness: 0.5, metalness: 0.6 });
  const TETHER_GEO = new THREE.BufferGeometry();
  TETHER_GEO.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const TETHER_MAT = new THREE.LineBasicMaterial({ color: 0x66ffaa, transparent: true, opacity: 0.4 });

  function build() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(BODY_GEO, BODY_MAT);
    body.castShadow = true;
    g.add(body);
    const core = new THREE.Mesh(CORE_GEO, CORE_MAT);
    g.add(core);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(RING_GEO, RING_MAT.clone());
      ring.rotation.x = (i / 3) * Math.PI;
      ring.rotation.z = (i / 3) * Math.PI * 0.7;
      ring.userData.spin = (i % 2 === 0 ? 1 : -1) * (1.2 + i * 0.3);
      g.add(ring);
    }
    for (const sx of [-1, 1]) {
      const fin = new THREE.Mesh(FIN_GEO, FIN_MAT);
      fin.position.set(sx * 0.34, 0, 0);
      fin.rotation.z = sx * 0.3;
      g.add(fin);
    }
    const light = new THREE.PointLight(0x66ffaa, 1.2, 6, 2);
    light.position.y = 0;
    g.add(light);
    const tether = new THREE.Line(TETHER_GEO, TETHER_MAT.clone());
    tether.frustumCulled = false;
    SCENE.add(tether);
    state.mesh = g;
    state.light = light;
    state.tether = tether;
    SCENE.add(g);
  }

  function show() {
    if (!state.mesh) build();
    if (state.active) return;
    state.active = true;
    state.mesh.visible = true;
    state.tether.visible = true;
    if (window.FX && window.FX.message) window.FX.message('MEDIC DRONE ONLINE', '#66ffaa');
  }

  function hide() {
    state.active = false;
    if (state.mesh) state.mesh.visible = false;
    if (state.tether) state.tether.visible = false;
  }

  function update(dt) {
    if (!state.active || !state.mesh || !window.CAMERA || !window.Manager) return;
    const cam = window.CAMERA;
    const mgr = window.Manager.state;
    if (mgr.phase !== 'playing' || !mgr.playerAlive) {
      state.tether.visible = false;
      return;
    }
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const target = new THREE.Vector3();
    target.x = cam.position.x - fwd.x * FOLLOW_DIST + fwd.z * 1.4;
    target.z = cam.position.z - fwd.z * FOLLOW_DIST - fwd.x * 1.4;
    target.y = HOVER_HEIGHT;
    state.pos.lerp(target, Math.min(1, LERP * dt));
    state.bobPhase += dt * BOB_FREQ;
    state.mesh.position.set(state.pos.x, state.pos.y + Math.sin(state.bobPhase) * 0.15, state.pos.z);
    const lookTarget = new THREE.Vector3(cam.position.x, state.pos.y, cam.position.z);
    state.mesh.lookAt(lookTarget);
    for (const child of state.mesh.children) {
      if (child.userData.spin) child.rotation.z += child.userData.spin * dt;
    }
    if (state.cooldown > 0) state.cooldown -= dt;
    const hpRatio = mgr.playerHp / mgr.playerMaxHp;
    const lowHp = mgr.playerHp <= REVIVE_THRESHOLD;
    if (lowHp && !state.reviving && state.cooldown <= 0) {
      state.reviving = true;
      state.reviveTimer = 1.5;
    }
    if (state.reviving) {
      state.reviveTimer -= dt;
      state.light.intensity = 4 + Math.sin(state.bobPhase * 8) * 2;
      state.mesh.scale.setScalar(1 + Math.sin(state.reviveTimer * 12) * 0.06);
      if (state.reviveTimer <= 0) {
        mgr.playerHp = Math.min(mgr.playerMaxHp, mgr.playerHp + REVIVE_AMOUNT);
        state.reviving = false;
        state.cooldown = REVIVE_COOLDOWN;
        if (window.Sound && window.Sound.tone) {
          window.Sound.tone(880, 0.3, 'sine', 0.25, 3000);
          window.Sound.tone(1320, 0.2, 'sine', 0.15, 4000);
        }
        if (window.FX && window.FX.message) window.FX.message('DRONE REVIVE +' + REVIVE_AMOUNT + ' HP', '#66ffaa');
      }
    } else {
      state.light.intensity = hpRatio < 1 ? 1.5 + (1 - hpRatio) * 3 : 0.8;
      state.mesh.scale.setScalar(1);
    }
    let healAmount = 0;
    if (mgr.playerHp < mgr.playerMaxHp && !state.reviving) {
      healAmount = Math.min(HEAL_RATE * dt, mgr.playerMaxHp - mgr.playerHp);
    }
    if (state.reviving) healAmount = 0;
    if (healAmount > 0) {
      mgr.playerHp += healAmount;
    }
    const posAttr = state.tether.geometry.attributes.position;
    const offset = new THREE.Vector3(0, -0.1, 0);
    offset.applyQuaternion(state.mesh.quaternion);
    posAttr.setXYZ(0, state.mesh.position.x + offset.x, state.mesh.position.y + offset.y, state.mesh.position.z + offset.z);
    posAttr.setXYZ(1, cam.position.x, cam.position.y - 0.3, cam.position.z);
    posAttr.needsUpdate = true;
    state.tether.visible = true;
    const mat = state.tether.material;
    if (state.reviving) {
      mat.color.setHex(0xff4422);
      mat.opacity = 0.5 + Math.sin(state.reviveTimer * 15) * 0.3;
    } else if (lowHp) {
      mat.color.setHex(0xffaa44);
      mat.opacity = 0.45;
    } else if (mgr.playerHp < mgr.playerMaxHp) {
      mat.color.setHex(0x66ffaa);
      mat.opacity = 0.35;
    } else {
      mat.color.setHex(0x66ffaa);
      mat.opacity = 0.15;
    }
    if (healAmount > 0 && Math.random() < dt * 6) {
      if (window.Sound && window.Sound.tone) window.Sound.tone(2400, 0.04, 'sine', 0.04, 5000);
    }
    updateHUD();
  }

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:16px;bottom:172px;font-size:11px;letter-spacing:2px;text-shadow:0 1px 3px #000;z-index:6;display:none;';
  const label = document.createElement('div');
  label.style.cssText = 'color:#66ffaa;margin-bottom:3px;';
  label.textContent = 'MEDIC DRONE';
  hud.appendChild(label);
  const bar = document.createElement('div');
  bar.style.cssText = 'width:120px;height:7px;background:rgba(0,0,0,0.5);border:1px solid rgba(100,255,170,0.4);border-radius:3px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#33dd88,#66ffaa);transition:width 0.1s;';
  bar.appendChild(fill);
  hud.appendChild(bar);
  const status = document.createElement('div');
  status.style.cssText = 'margin-top:3px;font-size:9px;color:#66ffaa;';
  status.textContent = 'ACTIVE';
  hud.appendChild(status);
  document.getElementById('hud').appendChild(hud);

  function updateHUD() {
    if (!state.active) { hud.style.display = 'none'; return; }
    hud.style.display = 'block';
    if (state.reviving) {
      fill.style.width = (100 - (state.reviveTimer / 1.5) * 100) + '%';
      fill.style.background = 'linear-gradient(90deg,#ff4422,#ffaa44)';
      status.textContent = 'REVIVING';
      status.style.color = '#ff6644';
    } else if (state.cooldown > 0) {
      fill.style.width = (100 - (state.cooldown / REVIVE_COOLDOWN) * 100) + '%';
      fill.style.background = 'linear-gradient(90deg,#556655,#888888)';
      status.textContent = 'RECHARGING';
      status.style.color = '#888888';
    } else {
      fill.style.width = '100%';
      fill.style.background = 'linear-gradient(90deg,#33dd88,#66ffaa)';
      status.textContent = 'READY';
      status.style.color = '#66ffaa';
    }
  }

  function init() {
    build();
    state.mesh.visible = false;
    state.tether.visible = false;
  }

  if (SCENE && window.CAMERA) init();

  return { update, show, hide, state };
})();
window.Drone = Drone;