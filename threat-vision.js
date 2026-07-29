// threat-vision.js — FORESTWAR threat highlight: pulsing colored outlines on enemies and allies in range
const THREE = window.THREE;
const SCENE = window.SCENE;
const ThreatVision = (() => {
  const RANGE = 55;
  const FOV_DOT = 0.28;
  const PULSE_SPEED = 3.2;
  const SCAN_INTERVAL = 0.18;
  const HIGHLIGHT_SCALE = 1.12;

  const OUTLINE_GEO = new THREE.SphereGeometry(0.55, 10, 8);
  const HOSTILE_MAT = new THREE.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false });
  const ALLY_MAT = new THREE.MeshBasicMaterial({ color: 0x33ff66, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false });
  const RING_GEO = new THREE.RingGeometry(0.7, 0.85, 20);
  const RING_HOSTILE = new THREE.MeshBasicMaterial({ color: 0xff4433, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const RING_ALLY = new THREE.MeshBasicMaterial({ color: 0x44ff77, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });

  const overlays = [];
  const rings = [];
  const POOL_SIZE = 32;

  for (let i = 0; i < POOL_SIZE; i++) {
    const ov = new THREE.Mesh(OUTLINE_GEO, HOSTILE_MAT.clone());
    ov.visible = false;
    ov.frustumCulled = false;
    SCENE.add(ov);
    overlays.push({ mesh: ov, target: null, life: 0 });

    const rg = new THREE.Mesh(RING_GEO, RING_HOSTILE.clone());
    rg.rotation.x = -Math.PI / 2;
    rg.visible = false;
    rg.frustumCulled = false;
    SCENE.add(rg);
    rings.push({ mesh: rg, target: null });
  }

  const state = {
    enabled: true,
    scanTimer: 0,
    time: 0,
    activeCount: 0,
  };

  const camDir = new THREE.Vector3();
  const toEnt = new THREE.Vector3();

  function inView(entPos) {
    const cam = window.CAMERA;
    if (!cam) return false;
    cam.getWorldDirection(camDir);
    toEnt.subVectors(entPos, cam.position);
    const dist = toEnt.length();
    if (dist > RANGE) return false;
    if (dist < 4) return true;
    toEnt.divideScalar(dist);
    return toEnt.dot(camDir) >= FOV_DOT;
  }

  function getPlayerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function getEntities() {
    if (window.Entities && Array.isArray(window.Entities.list)) return window.Entities.list;
    return [];
  }

  function scan() {
    for (const o of overlays) { o.target = null; o.life = 0; o.mesh.visible = false; }
    for (const r of rings) { r.target = null; r.mesh.visible = false; }
    let idx = 0;
    const pt = getPlayerTeam();
    for (const e of getEntities()) {
      if (e.dead || !e.mesh) continue;
      const pos = e.mesh.position;
      if (!inView(pos)) continue;
      if (idx >= POOL_SIZE) break;
      const hostile = e.team !== pt;
      const mat = overlays[idx].mesh.material;
      mat.color.setHex(hostile ? 0xff3322 : 0x33ff66);
      overlays[idx].mesh.position.copy(pos);
      overlays[idx].mesh.position.y += 0.95;
      overlays[idx].mesh.scale.setScalar(HIGHLIGHT_SCALE);
      overlays[idx].mesh.visible = true;
      overlays[idx].target = e;
      overlays[idx].life = 1;
      const rmat = rings[idx].mesh.material;
      rmat.color.setHex(hostile ? 0xff4433 : 0x44ff77);
      const gy = window.groundHeight ? window.groundHeight(pos.x, pos.z) : 0;
      rings[idx].mesh.position.set(pos.x, gy + 0.06, pos.z);
      rings[idx].mesh.visible = true;
      rings[idx].target = e;
      idx++;
    }
    state.activeCount = idx;
  }

  function update(dt) {
    if (!state.enabled) return;
    state.time += dt;
    state.scanTimer -= dt;
    if (state.scanTimer <= 0) {
      scan();
      state.scanTimer = SCAN_INTERVAL;
    }
    const pulse = 0.5 + 0.5 * Math.sin(state.time * PULSE_SPEED);
    for (const o of overlays) {
      if (!o.target || o.life <= 0) continue;
      o.life -= dt * 0.9;
      const e = o.target;
      if (e.dead || !e.mesh) { o.mesh.visible = false; o.life = 0; continue; }
      o.mesh.position.x = e.mesh.position.x;
      o.mesh.position.z = e.mesh.position.z;
      o.mesh.position.y = e.mesh.position.y + 0.95;
      o.mesh.material.opacity = Math.max(0, o.life) * (0.16 + pulse * 0.14);
    }
    for (const r of rings) {
      if (!r.target) continue;
      const e = r.target;
      if (e.dead || !e.mesh) { r.mesh.visible = false; continue; }
      r.mesh.position.x = e.mesh.position.x;
      r.mesh.position.z = e.mesh.position.z;
      const gy = window.groundHeight ? window.groundHeight(e.mesh.position.x, e.mesh.position.z) : 0;
      r.mesh.position.y = gy + 0.06;
      r.mesh.material.opacity = 0.32 + pulse * 0.26;
      r.mesh.scale.setScalar(1.0 + pulse * 0.22);
      r.mesh.rotation.z = state.time * 0.6;
    }
  }

  function toggle() {
    state.enabled = !state.enabled;
    if (!state.enabled) {
      for (const o of overlays) { o.mesh.visible = false; o.life = 0; }
      for (const r of rings) r.mesh.visible = false;
    }
    if (window.FX) window.FX.message(state.enabled ? 'THREAT VISION ON' : 'THREAT VISION OFF', '#9fe8a0');
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'x' || e.key === 'X') toggle();
  });

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:16px;bottom:200px;font-size:11px;letter-spacing:2px;color:#9fe8a0;text-shadow:0 1px 3px #000;z-index:6;';
  const lbl = document.createElement('div');
  lbl.textContent = 'THREAT VISION [X]';
  hud.appendChild(lbl);
  const ind = document.createElement('div');
  ind.style.cssText = 'margin-top:3px;font-size:10px;color:#5fd07a;';
  ind.textContent = 'ACTIVE';
  hud.appendChild(ind);
  document.getElementById('hud').appendChild(hud);

  let _origToggle = toggle;
  function _wrap() {
    _origToggle();
    ind.textContent = state.enabled ? 'ACTIVE' : 'OFF';
    ind.style.color = state.enabled ? '#5fd07a' : '#888';
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'x' || e.key === 'X') setTimeout(_wrap, 0);
  });

  return { update, toggle, state };
})();
window.ThreatVision = ThreatVision;