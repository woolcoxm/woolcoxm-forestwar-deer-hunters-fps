// thermal-vision.js — FORESTWAR thermal overlay: DMR ADS activates a monochrome heatmap that reveals enemies through foliage
const THREE = window.THREE;
const SCENE = window.SCENE;
const ThermalVision = (() => {
  const SCAN_INTERVAL = 0.12;
  const BLINK_RATE = 0.12;
  const WASH_LERP = 8.0;
  const RING_ROTATE_SPEED = 1.5;
  const TARGET_SCALE = 1.3;
  const HIGHLIGHT_LIFE = 0.35;
  const POOL_SIZE = 40;

  const state = {
    active: false,
    strength: 0,
    scanTimer: 0,
    blinkPhase: 0,
    ringAngle: 0,
    enabled: true,
    unlocked: false,
  };

  const FRIENDLY_COLOR = new THREE.Color(0x4488ff);
  const HOSTILE_COLOR = new THREE.Color(0xff4422);
  const NEUTRAL_COLOR = new THREE.Color(0x666666);
  const _camDir = new THREE.Vector3();
  const _toEnt = new THREE.Vector3();

  const BLOB_GEO = new THREE.SphereGeometry(0.6, 8, 6);
  const BLOB_BASE_MAT = new THREE.MeshBasicMaterial({
    color: 0xff4422, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  const blobs = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const inner = new THREE.Mesh(BLOB_GEO, BLOB_BASE_MAT.clone());
    inner.visible = false;
    inner.frustumCulled = false;
    SCENE.add(inner);
    const outer = new THREE.Mesh(BLOB_GEO, BLOB_BASE_MAT.clone());
    outer.visible = false;
    outer.frustumCulled = false;
    SCENE.add(outer);
    blobs.push({ inner, outer, target: null, life: 0, active: false });
  }

  const hud = document.getElementById('hud');
  if (!hud) return { activate() {}, deactivate() {}, update() {}, setUnlocked() {}, state };

  const overlay = document.createElement('div');
  overlay.id = 'thermal-overlay';
  overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:3;opacity:0;mix-blend-mode:multiply;';
  overlay.style.background = 'radial-gradient(circle at 50% 50%, rgba(40,20,10,0.28) 0%, rgba(10,8,6,0.72) 60%, rgba(2,2,2,0.9) 100%)';
  hud.appendChild(overlay);

  const scanlines = document.createElement('div');
  scanlines.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:3;opacity:0;background:repeating-linear-gradient(0deg,transparent 0px,transparent 3px,rgba(0,0,0,0.18) 4px);transition:opacity 0.2s;';
  hud.appendChild(scanlines);

  const ringSvg = document.createElement('div');
  ringSvg.style.cssText = 'position:absolute;top:50%;left:50%;width:200px;height:200px;transform:translate(-50%,-50%);pointer-events:none;z-index:4;opacity:0;transition:opacity 0.2s;';
  ringSvg.innerHTML =
    '<svg width="200" height="200" viewBox="0 0 200 200">' +
    '<circle cx="100" cy="100" r="90" fill="none" stroke="rgba(255,120,60,0.15)" stroke-width="1"/>' +
    '<circle cx="100" cy="100" r="70" fill="none" stroke="rgba(255,120,60,0.1)" stroke-width="1" stroke-dasharray="6,10"/>' +
    '<g id="thermalRingGroup">' +
    '<line x1="100" y1="14" x2="100" y2="28" stroke="rgba(255,120,60,0.5)" stroke-width="2"/>' +
    '<line x1="100" y1="172" x2="100" y2="186" stroke="rgba(255,120,60,0.5)" stroke-width="2"/>' +
    '<line x1="14" y1="100" x2="28" y2="100" stroke="rgba(255,120,60,0.5)" stroke-width="2"/>' +
    '<line x1="172" y1="100" x2="186" y2="100" stroke="rgba(255,120,60,0.5)" stroke-width="2"/>' +
    '</g>' +
    '<text x="100" y="9" fill="rgba(255,150,80,0.6)" font-size="7" letter-spacing="2" text-anchor="middle" font-family="monospace">THERMAL</text>' +
    '<text x="100" y="198" fill="rgba(255,150,80,0.6)" font-size="7" letter-spacing="2" text-anchor="middle" font-family="monospace">TRACKING</text>' +
    '</svg>';
  hud.appendChild(ringSvg);
  const ringGroup = ringSvg.querySelector('#thermalRingGroup');

  const labelEl = document.createElement('div');
  labelEl.style.cssText = 'position:absolute;top:calc(50% + 110px);left:50%;transform:translateX(-50%);font-size:9px;letter-spacing:3px;color:rgba(255,130,70,0.7);text-shadow:0 0 6px rgba(0,0,0,0.8);pointer-events:none;z-index:4;opacity:0;transition:opacity 0.2s;font-family:monospace;';
  labelEl.textContent = 'THERMAL OVERLAY ACTIVE';
  hud.appendChild(labelEl);

  function setUnlocked(v) { state.unlocked = v; }

  function activate() {
    if (!state.unlocked) return false;
    state.active = true;
    overlay.style.opacity = '1';
    scanlines.style.opacity = '0.5';
    ringSvg.style.opacity = '1';
    labelEl.style.opacity = '1';
    return true;
  }

  function deactivate() {
    state.active = false;
    overlay.style.opacity = '0';
    scanlines.style.opacity = '0';
    ringSvg.style.opacity = '0';
    labelEl.style.opacity = '0';
    for (const b of blobs) {
      b.active = false;
      b.target = null;
      b.life = 0;
      b.inner.visible = false;
      b.outer.visible = false;
    }
  }

  function getPlayerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function getEntities() {
    if (window.Entities && Array.isArray(window.Entities.list)) return window.Entities.list;
    return [];
  }

  function allocateBlob() {
    for (let i = 0; i < blobs.length; i++) {
      if (!blobs[i].active) return blobs[i];
    }
    let oldest = blobs[0];
    for (let i = 1; i < blobs.length; i++) {
      if (blobs[i].life < oldest.life) oldest = blobs[i];
    }
    return oldest;
  }

  function scan() {
    for (const b of blobs) {
      if (b.active && (!b.target || b.target.dead)) {
        b.life -= 0.1;
        if (b.life <= 0) {
          b.active = false;
          b.target = null;
          b.inner.visible = false;
          b.outer.visible = false;
        }
      }
    }
    const ents = getEntities();
    const playerTeam = getPlayerTeam();
    const cam = window.CAMERA;
    if (!cam) return;
    cam.getWorldDirection(_camDir);
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e.mesh || e.dead) continue;
      const mp = e.mesh.position;
      _toEnt.subVectors(mp, cam.position);
      const dist = _toEnt.length();
      if (dist > 120) continue;
      if (dist > 8) {
        _toEnt.divideScalar(dist);
        if (_toEnt.dot(_camDir) < 0.15) continue;
      }
      let blob = null;
      for (let j = 0; j < blobs.length; j++) {
        if (blobs[j].target === e) { blob = blobs[j]; break; }
      }
      if (!blob) {
        blob = allocateBlob();
        blob.target = e;
        blob.inner.material.color.copy(HOSTILE_COLOR);
        blob.outer.material.color.copy(HOSTILE_COLOR);
        blob.inner.visible = true;
        blob.outer.visible = true;
      }
      blob.active = true;
      blob.life = HIGHLIGHT_LIFE;
      const isFriendly = (e.team === playerTeam);
      const baseColor = isFriendly ? FRIENDLY_COLOR : HOSTILE_COLOR;
      if (!blob.inner.material.color.equals(baseColor)) {
        blob.inner.material.color.copy(baseColor);
        blob.outer.material.color.copy(baseColor);
      }
      blob.inner.position.set(mp.x, mp.y + 0.8, mp.z);
      blob.outer.position.set(mp.x, mp.y + 0.8, mp.z);
      blob.inner.scale.setScalar(TARGET_SCALE);
      blob.outer.scale.setScalar(TARGET_SCALE * 1.7);
    }
  }

  function update(dt) {
    if (!state.active) {
      if (state.strength > 0.001) {
        state.strength -= dt * WASH_LERP;
        if (state.strength < 0) state.strength = 0;
      } else return;
    } else {
      if (state.strength < 1) {
        state.strength += dt * WASH_LERP;
        if (state.strength > 1) state.strength = 1;
      }
    }
    state.blinkPhase += dt;
    state.scanTimer += dt;
    if (state.scanTimer >= SCAN_INTERVAL) {
      state.scanTimer = 0;
      if (state.active) scan();
    }
    state.ringAngle += dt * RING_ROTATE_SPEED;
    if (ringGroup) ringGroup.setAttribute('transform', 'rotate(' + (state.ringAngle * 180 / Math.PI).toFixed(1) + ' 100 100)');
    const blink = state.active ? (0.5 + Math.sin(state.blinkPhase / BLINK_RATE) * 0.5) : 0;
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];
      if (b.active) {
        b.life -= dt;
        if (b.life <= 0) {
          b.active = false;
          b.target = null;
          b.inner.visible = false;
          b.outer.visible = false;
        } else {
          const fade = Math.min(1, b.life / HIGHLIGHT_LIFE);
          const breath = 0.85 + Math.sin(state.blinkPhase * 6 + i) * 0.15;
          b.inner.material.opacity = 0.75 * fade * state.strength * breath;
          b.outer.material.opacity = 0.3 * fade * state.strength * breath;
        }
      }
    }
  }

  function dispose() {
    for (const b of blobs) {
      b.inner.material.dispose();
      b.outer.material.dispose();
    }
    BLOB_GEO.dispose();
    BLOB_BASE_MAT.dispose();
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (scanlines.parentNode) scanlines.parentNode.removeChild(scanlines);
    if (ringSvg.parentNode) ringSvg.parentNode.removeChild(ringSvg);
    if (labelEl.parentNode) labelEl.parentNode.removeChild(labelEl);
  }

  window.ThermalVision = { activate, deactivate, update, setUnlocked, dispose, state };
  return window.ThermalVision;
})();