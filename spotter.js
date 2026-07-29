// spotter.js — FORESTWAR recon pulse: reveals all enemies through walls for a few seconds and marks them on the minimap
const THREE = window.THREE;
const SCENE = window.SCENE;
const Spotter = (() => {
  const PING_COST = 35;
  const COOLDOWN = 14;
  const REVEAL_DURATION = 4.5;
  const SCAN_RADIUS = 80;
  const PING_EXPAND_TIME = 0.6;
  const MARK_RING_LIFE = 1.5;

  const state = {
    cd: 0,
    active: false,
    timer: 0,
    pulseT: 0,
    pingMesh: null,
  };

  const PING_GEO = new THREE.RingGeometry(0.5, 1.0, 48);
  const PING_MAT = new THREE.MeshBasicMaterial({
    color: 0xffaa44, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  const MARK_GEO = new THREE.RingGeometry(0.7, 1.0, 20);
  const MARK_MAT = new THREE.MeshBasicMaterial({
    color: 0xff3322, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false,
  });

  const BLOB_GEO = new THREE.SphereGeometry(0.6, 8, 6);
  const BLOB_MAT = new THREE.MeshBasicMaterial({
    color: 0xff3322, transparent: true, opacity: 0,
    side: THREE.BackSide, depthWrite: false,
  });

  const pingRing = new THREE.Mesh(PING_GEO, PING_MAT.clone());
  pingRing.rotation.x = -Math.PI / 2;
  pingRing.visible = false;
  SCENE.add(pingRing);

  const MARK_POOL = 32;
  const marks = [];
  for (let i = 0; i < MARK_POOL; i++) {
    const ring = new THREE.Mesh(MARK_GEO, MARK_MAT.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    ring.frustumCulled = false;
    SCENE.add(ring);
    const blob = new THREE.Mesh(BLOB_GEO, BLOB_MAT.clone());
    blob.visible = false;
    blob.frustumCulled = false;
    SCENE.add(blob);
    marks.push({ ring, blob, target: null, life: 0, active: false });
  }
  let markIdx = 0;

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:16px;bottom:260px;font-size:11px;letter-spacing:2px;color:#ffaa44;text-shadow:0 1px 3px #000;z-index:6;';
  const label = document.createElement('div');
  label.textContent = 'SPOTTER [B]';
  hud.appendChild(label);
  const bar = document.createElement('div');
  bar.style.cssText = 'margin-top:3px;width:80px;height:5px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,170,60,0.3);border-radius:3px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#ff8822,#ffdd55);transition:width 0.08s;';
  bar.appendChild(fill);
  hud.appendChild(bar);
  document.getElementById('hud').appendChild(hud);

  const _camDir = new THREE.Vector3();
  const _camPos = new THREE.Vector3();
  const _toEnt = new THREE.Vector3();

  function trigger() {
    if (!window.Player || !Player.state.locked) return;
    const p = Player.state;
    if (p.stamina < PING_COST) {
      if (window.FX) window.FX.message('INSUFFICIENT STAMINA', '#ff6644');
      return;
    }
    if (state.cd > 0) return;
    p.stamina -= PING_COST;
    if (p.regenTimer !== undefined) p.regenTimer = 1.5;
    state.cd = COOLDOWN;
    state.active = true;
    state.timer = REVEAL_DURATION;
    state.pulseT = 0;
    const cam = window.CAMERA;
    if (cam) {
      _camPos.copy(cam.position);
      pingRing.position.set(_camPos.x, (window.groundHeight ? window.groundHeight(_camPos.x, _camPos.z) : 0) + 0.1, _camPos.z);
      pingRing.scale.setScalar(1);
      pingRing.material.opacity = 0.9;
      pingRing.visible = true;
    }
    if (window.Sound) {
      window.Sound.tone(880, 0.12, 'sine', 0.25, 3000);
      window.Sound.tone(1320, 0.18, 'sine', 0.18, 4000);
    }
    if (window.FX) window.FX.message('SPOTTER PING — ENEMIES MARKED', '#ffaa44');
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'b' && e.key !== 'B') return;
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    trigger();
  });

  function getEnemyList() {
    if (!window.Entities || !Array.isArray(window.Entities.list)) return [];
    const pt = (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
    return window.Entities.list.filter(en => !en.dead && en.team !== pt);
  }

  function assignMark(ent) {
    if (!ent || !ent.mesh) return;
    const slot = marks[markIdx];
    markIdx = (markIdx + 1) % MARK_POOL;
    slot.target = ent;
    slot.life = MARK_RING_LIFE;
    slot.active = true;
    slot.ring.visible = true;
    slot.blob.visible = true;
    slot.blob.material.opacity = 0.5;
  }

  function refreshMarks() {
    const enemies = getEnemyList();
    for (let i = 0; i < enemies.length && i < MARK_POOL; i++) {
      assignMark(enemies[i]);
    }
  }

  let refreshAccum = 0;

  function update(dt) {
    if (state.cd > 0) {
      state.cd -= dt;
      if (state.cd < 0) state.cd = 0;
    }
    fill.style.width = ((1 - state.cd / COOLDOWN) * 100) + '%';

    if (state.active) {
      state.timer -= dt;
      state.pulseT += dt;
      const expandT = Math.min(state.pulseT / PING_EXPAND_TIME, 1);
      const ringScale = 1 + expandT * (SCAN_RADIUS / 1.0);
      pingRing.scale.setScalar(ringScale);
      pingRing.material.opacity = 0.9 * (1 - expandT);
      if (state.pulseT >= PING_EXPAND_TIME) {
        pingRing.visible = false;
      }
      refreshAccum += dt;
      if (refreshAccum >= 0.7) {
        refreshAccum = 0;
        refreshMarks();
      }
      if (state.timer <= 0) {
        state.active = false;
        pingRing.visible = false;
      }
    } else {
      refreshAccum = 0;
    }

    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      if (!m.active) continue;
      m.life -= dt;
      if (m.life <= 0 || !m.target || m.target.dead || !m.target.mesh) {
        m.active = false;
        m.ring.visible = false;
        m.blob.visible = false;
        m.target = null;
        continue;
      }
      const pos = m.target.mesh.position;
      const gy = window.groundHeight ? window.groundHeight(pos.x, pos.z) : 0;
      m.ring.position.set(pos.x, gy + 0.1, pos.z);
      const pulse = 1 + Math.sin(state.timer * 8 + i) * 0.15;
      m.ring.scale.setScalar(pulse);
      m.ring.material.opacity = 0.6 + Math.sin(state.timer * 8 + i) * 0.25;
      m.blob.position.set(pos.x, gy + 1.0, pos.z);
      m.blob.material.opacity = 0.35 + Math.sin(state.timer * 10 + i * 0.5) * 0.2;
      m.blob.scale.setScalar(1 + Math.sin(state.timer * 6 + i) * 0.1);
    }
  }

  function isActive() { return state.active; }

  function getMarkedPositions() {
    const out = [];
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      if (m.active && m.target && m.target.mesh && !m.target.dead) {
        out.push(m.target.mesh.position);
      }
    }
    return out;
  }

  function init() {
    if (window.Looper) window.Looper.add(update, 100);
  }

  return { init, update, isActive, getMarkedPositions, trigger };
})();
window.Spotter = Spotter;