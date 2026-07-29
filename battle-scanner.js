// battle-scanner.js — FORESTWAR tactical sonar: expanding pulse ring that reveals nearby enemies on screen and minimap
const THREE = window.THREE;
const SCENE = window.SCENE;
const BattleScanner = (() => {
  const COOLDOWN_MAX = 16;
  const STAMINA_COST = 30;
  const PULSE_RADIUS = 45;
  const PULSE_EXPAND_TIME = 0.7;
  const TAG_LIFE = 3.5;
  const TAG_BLINK_RATE = 0.15;
  const TAG_POOL_SIZE = 40;

  const state = {
    cd: 0,
    ready: true,
    active: false,
    pulseT: 0,
    pulseCenter: new THREE.Vector3(),
    taggedCount: 0,
    lastPulseTeam: 'hunter',
  };

  const RING_GEO = new THREE.RingGeometry(0.5, 1.0, 64);
  const RING_MAT = new THREE.MeshBasicMaterial({
    color: 0x66ddff, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const ring1 = new THREE.Mesh(RING_GEO, RING_MAT.clone());
  ring1.rotation.x = -Math.PI / 2;
  ring1.visible = false;
  ring1.frustumCulled = false;
  SCENE.add(ring1);

  const ring2 = new THREE.Mesh(RING_GEO, RING_MAT.clone());
  ring2.rotation.x = -Math.PI / 2;
  ring2.visible = false;
  ring2.frustumCulled = false;
  SCENE.add(ring2);

  const FLASH_LIGHT = new THREE.PointLight(0x66ddff, 0, 20, 2);
  FLASH_LIGHT.visible = false;
  SCENE.add(FLASH_LIGHT);

  const MARK_GEO = new THREE.RingGeometry(0.7, 1.0, 20);
  const MARK_MAT = new THREE.MeshBasicMaterial({
    color: 0x66ddff, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const BLOB_GEO = new THREE.SphereGeometry(0.7, 8, 6);
  const BLOB_MAT = new THREE.MeshBasicMaterial({
    color: 0x66ddff, transparent: true, opacity: 0,
    side: THREE.BackSide, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const tags = [];
  for (let i = 0; i < TAG_POOL_SIZE; i++) {
    const ring = new THREE.Mesh(MARK_GEO, MARK_MAT.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    ring.frustumCulled = false;
    SCENE.add(ring);
    const blob = new THREE.Mesh(BLOB_GEO, BLOB_MAT.clone());
    blob.visible = false;
    blob.frustumCulled = false;
    SCENE.add(blob);
    tags.push({ ring, blob, target: null, life: 0, active: false });
  }
  let tagIdx = 0;

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:16px;bottom:310px;font-size:11px;letter-spacing:2px;color:#66ddff;text-shadow:0 1px 3px #000;z-index:6;';
  const label = document.createElement('div');
  label.textContent = 'SCANNER [N]';
  hud.appendChild(label);
  const bar = document.createElement('div');
  bar.style.cssText = 'margin-top:3px;width:80px;height:5px;background:rgba(0,0,0,0.5);border:1px solid rgba(100,200,255,0.3);border-radius:3px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#3399cc,#77ddff);transition:width 0.06s;';
  bar.appendChild(fill);
  hud.appendChild(bar);
  document.getElementById('hud').appendChild(hud);

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function getPlayerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function getEntities() {
    if (window.Entities && Array.isArray(window.Entities.list)) return window.Entities.list;
    return [];
  }

  function activate() {
    const p = window.Player ? window.Player.state : null;
    if (!p || !p.locked) return;
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    if (!state.ready) {
      if (window.FX) window.FX.message('SCANNER RECHARGING', '#ff6644');
      return;
    }
    if (p.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('INSUFFICIENT STAMINA', '#ff6644');
      return;
    }
    p.stamina -= STAMINA_COST;
    if (p.regenTimer !== undefined) p.regenTimer = 1.5;
    state.ready = false;
    state.cd = COOLDOWN_MAX;
    state.active = true;
    state.pulseT = 0;
    const cam = window.CAMERA;
    state.pulseCenter.set(cam.position.x, groundY(cam.position.x, cam.position.z), cam.position.z);
    state.lastPulseTeam = getPlayerTeam();
    ring1.position.set(state.pulseCenter.x, state.pulseCenter.y + 0.1, state.pulseCenter.z);
    ring2.position.copy(ring1.position);
    ring1.scale.setScalar(0.5);
    ring2.scale.setScalar(0.5);
    ring1.material.opacity = 0.8;
    ring2.material.opacity = 0.5;
    ring1.visible = true;
    ring2.visible = true;
    FLASH_LIGHT.position.set(state.pulseCenter.x, state.pulseCenter.y + 3, state.pulseCenter.z);
    FLASH_LIGHT.intensity = 4;
    FLASH_LIGHT.visible = true;
    tagEnemies();
    if (window.Sound) {
      window.Sound.tone(300, 0.3, 'sine', 0.25, 2000);
      window.Sound.tone(600, 0.2, 'sine', 0.15, 3000);
    }
    if (window.FX) window.FX.message('BATTLE SCANNER ACTIVE', '#66ddff');
  }

  function tagEnemies() {
    const ents = getEntities();
    const px = state.pulseCenter.x;
    const pz = state.pulseCenter.z;
    const r2 = PULSE_RADIUS * PULSE_RADIUS;
    const playerTeam = state.lastPulseTeam;
    let count = 0;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.team === playerTeam) continue;
      const m = e.mesh;
      if (!m) continue;
      const dx = m.position.x - px;
      const dz = m.position.z - pz;
      if (dx * dx + dz * dz > r2) continue;
      const slot = tags[tagIdx];
      tagIdx = (tagIdx + 1) % TAG_POOL_SIZE;
      slot.target = e;
      slot.life = TAG_LIFE;
      slot.active = true;
      slot.ring.visible = true;
      slot.blob.visible = true;
      slot.ring.material.opacity = 0.9;
      slot.blob.material.opacity = 0.4;
      count++;
    }
    state.taggedCount = count;
  }

  function update(dt) {
    if (state.cd > 0) {
      state.cd -= dt;
      if (state.cd <= 0) {
        state.cd = 0;
        state.ready = true;
      }
    }
    fill.style.width = state.ready ? '100%' : (100 * (1 - state.cd / COOLDOWN_MAX)) + '%';

    if (state.active) {
      state.pulseT += dt;
      const t = state.pulseT / PULSE_EXPAND_TIME;
      const radius = t * PULSE_RADIUS;
      ring1.scale.setScalar(Math.max(0.5, radius));
      ring2.scale.setScalar(Math.max(0.5, radius * 0.6));
      ring1.material.opacity = Math.max(0, 0.8 * (1 - t));
      ring2.material.opacity = Math.max(0, 0.5 * (1 - t));
      FLASH_LIGHT.intensity = Math.max(0, 4 * (1 - t));
      if (state.pulseT >= PULSE_EXPAND_TIME) {
        state.active = false;
        ring1.visible = false;
        ring2.visible = false;
        FLASH_LIGHT.visible = false;
      }
    }

    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      if (!tag.active) continue;
      tag.life -= dt;
      if (tag.life <= 0 || !tag.target || tag.target.dead) {
        tag.active = false;
        tag.ring.visible = false;
        tag.blob.visible = false;
        tag.target = null;
        continue;
      }
      const m = tag.target.mesh;
      if (!m) { tag.active = false; tag.ring.visible = false; tag.blob.visible = false; tag.target = null; continue; }
      const gy = groundY(m.position.x, m.position.z);
      tag.ring.position.set(m.position.x, gy + 0.15, m.position.z);
      tag.blob.position.set(m.position.x, m.position.y + 1.0, m.position.z);
      const frac = tag.life / TAG_LIFE;
      const blink = 0.4 + 0.6 * Math.abs(Math.sin(state.pulseT / TAG_BLINK_RATE * 10));
      tag.ring.material.opacity = Math.max(0, frac * blink * 0.9);
      tag.blob.material.opacity = Math.max(0, frac * blink * 0.35);
      const pulseScale = 1.0 + 0.15 * Math.sin(state.pulseT * 8 + i);
      tag.blob.scale.setScalar(pulseScale);
    }
  }

  function getTagged() {
    const out = [];
    for (let i = 0; i < tags.length; i++) {
      if (tags[i].active && tags[i].target && !tags[i].target.dead) out.push(tags[i].target);
    }
    return out;
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'n' && e.key !== 'N') return;
    if (e.repeat) return;
    activate();
  });

  function reset() {
    state.cd = 0;
    state.ready = true;
    state.active = false;
    state.pulseT = 0;
    state.taggedCount = 0;
    ring1.visible = false;
    ring2.visible = false;
    FLASH_LIGHT.visible = false;
    for (let i = 0; i < tags.length; i++) {
      tags[i].active = false;
      tags[i].ring.visible = false;
      tags[i].blob.visible = false;
      tags[i].target = null;
    }
  }

  return { update, reset, getTagged, activate, state };
})();
window.BattleScanner = BattleScanner;