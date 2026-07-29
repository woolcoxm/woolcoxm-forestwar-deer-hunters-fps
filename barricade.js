// barricade.js — FORESTWAR deployable wooden-stake barricades: physical cover that absorbs damage and blocks movement
const THREE = window.THREE;
const SCENE = window.SCENE;
const Barricade = (() => {
  const MAX_BARRICADES = 12;
  const STAKE_HP = 350;
  const COOLDOWN = 1.8;
  const STAMINA_COST = 22;
  const PLACE_RANGE = 5.5;
  const WEEP_RADIUS = 0.9;
  const DAMAGE_ABSORB = 0.6;
  const CHIP_LIFE = 0.6;
  const SHATTER_DEBRIS = 14;

  const state = {
    cd: 0,
    ready: true,
    count: 0,
    preview: null,
    previewValid: false,
    placementActive: false,
  };

  const _muzzle = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const _ray = new THREE.Raycaster();
  const _hit = new THREE.Vector3();

  const STAKE_GEO = new THREE.BoxGeometry(0.1, 1.5, 0.1);
  const STAKE_MAT = new THREE.MeshStandardMaterial({ color: 0x5a4226, roughness: 0.9, metalness: 0.1, flatShading: true });
  const CROSSBAR_GEO = new THREE.BoxGeometry(1.3, 0.07, 0.07);
  const CROSSBAR_MAT = new THREE.MeshStandardMaterial({ color: 0x3a2e1a, roughness: 0.95 });
  const BASE_GEO = new THREE.CylinderGeometry(0.65, 0.75, 0.12, 8);
  const BASE_MAT = new THREE.MeshStandardMaterial({ color: 0x3a3022, roughness: 1.0 });
  const SPIKE_GEO = new THREE.ConeGeometry(0.06, 0.25, 5);
  const SPIKE_MAT = new THREE.MeshStandardMaterial({ color: 0x888877, roughness: 0.3, metalness: 0.8 });
  const PREV_RING_GEO = new THREE.RingGeometry(0.55, 0.75, 24);
  const PREV_GOOD_MAT = new THREE.MeshBasicMaterial({ color: 0x88cc66, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  const PREV_BAD_MAT = new THREE.MeshBasicMaterial({ color: 0xcc4444, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  const PREV_OUT_GEO = new THREE.RingGeometry(WEEP_RADIUS - 0.05, WEEP_RADIUS, 28);
  const PREV_OUT_GOOD = new THREE.MeshBasicMaterial({ color: 0x88cc66, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const PREV_OUT_BAD = new THREE.MeshBasicMaterial({ color: 0xcc4444, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const CHIP_GEO = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const CHIP_MAT = new THREE.MeshStandardMaterial({ color: 0x4a3a20, roughness: 0.9 });
  const DUST_GEO = new THREE.SphereGeometry(0.15, 4, 3);
  const DUST_MAT = new THREE.MeshBasicMaterial({ color: 0x8a7a5a, transparent: true, opacity: 0, depthWrite: false });
  const SMOKE_GEO = new THREE.SphereGeometry(0.4, 5, 4);
  const SMOKE_MAT = new THREE.MeshBasicMaterial({ color: 0x6a5a44, transparent: true, opacity: 0, depthWrite: false });

  const barricades = [];
  const obstacles = [];
  window.barricadeObstacles = obstacles;

  function buildPreview() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(PREV_RING_GEO, PREV_GOOD_MAT.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);
    const outer = new THREE.Mesh(PREV_OUT_GEO, PREV_OUT_GOOD.clone());
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = 0.05;
    g.add(outer);
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0x88cc66, transparent: true, opacity: 0.25, depthWrite: false });
    const ghost = new THREE.Group();
    const ghostStake = new THREE.Mesh(STAKE_GEO, ghostMat);
    ghostStake.position.y = 0.75;
    ghost.add(ghostStake);
    const ghostBar = new THREE.Mesh(CROSSBAR_GEO, ghostMat);
    ghostBar.position.y = 0.9;
    ghost.add(ghostBar);
    ghost.position.y = 0.01;
    g.add(ghost);
    g.visible = false;
    SCENE.add(g);
    return { group: g, ring, outer, ghost };
  }

  const preview = buildPreview();

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function canPlace(x, z) {
    const trees = window.TREES || [];
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      const dx = x - t.x, dz = z - t.z;
      if (dx * dx + dz * dz < (t.r + 0.6) * (t.r + 0.6)) return false;
    }
    const wc = window.worldColliders || [];
    for (let i = 0; i < wc.length; i++) {
      const c = wc[i];
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < (c.r + 0.5) * (c.r + 0.5)) return false;
    }
    const others = window.barricadeObstacles || [];
    for (let i = 0; i < others.length; i++) {
      const o = others[i];
      if (!o.active) continue;
      const dx = x - o.x, dz = z - o.z;
      if (dx * dx + dz * dz < (o.r + 0.8) * (o.r + 0.8)) return false;
    }
    return true;
  }

  function getPlacementPoint() {
    const cam = window.CAMERA;
    if (!cam) return null;
    cam.getWorldDirection(_dir);
    _ray.set(cam.position, _dir);
    _ray.far = PLACE_RANGE;
    const hit = _ray.raycast ? null : null;
    if (_ray.ray.intersectPlane(_ground, _hit)) {
      const dist = cam.position.distanceTo(_hit);
      if (dist < PLACE_RANGE && dist > 0.5) return _hit.clone();
    }
    return new THREE.Vector3(
      cam.position.x + _dir.x * PLACE_RANGE,
      groundY(cam.position.x + _dir.x * PLACE_RANGE, cam.position.z + _dir.z * PLACE_RANGE),
      cam.position.z + _dir.z * PLACE_RANGE
    );
  }

  function buildBarricadeMesh() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(BASE_GEO, BASE_MAT);
    base.castShadow = true;
    base.receiveShadow = true;
    base.position.y = 0.06;
    g.add(base);
    const positions = [-0.4, -0.2, 0, 0.2, 0.4];
    for (const px of positions) {
      const stake = new THREE.Mesh(STAKE_GEO, STAKE_MAT);
      stake.castShadow = true;
      stake.position.set(px, 0.75, 0);
      stake.rotation.z = (Math.random() - 0.5) * 0.15;
      g.add(stake);
    }
    for (const py of [0.5, 0.95]) {
      const bar = new THREE.Mesh(CROSSBAR_GEO, CROSSBAR_MAT);
      bar.castShadow = true;
      bar.position.y = py;
      g.add(bar);
    }
    for (const sx of [-0.45, 0.45]) {
      const spike = new THREE.Mesh(SPIKE_GEO, SPIKE_MAT);
      spike.position.set(sx, 1.55, 0);
      g.add(spike);
    }
    return g;
  }

  function createChip(pos) {
    const chips = state.chipPool;
    for (let i = 0; i < chips.length; i++) {
      const c = chips[i];
      if (c.active) continue;
      c.mesh.position.copy(pos);
      c.mesh.position.x += (Math.random() - 0.5) * 0.4;
      c.mesh.position.y += Math.random() * 0.3;
      c.mesh.position.z += (Math.random() - 0.5) * 0.4;
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 3;
      c.vx = Math.cos(ang) * spd;
      c.vy = 2 + Math.random() * 3;
      c.vz = Math.sin(ang) * spd;
      c.spin = (Math.random() - 0.5) * 12;
      c.life = CHIP_LIFE;
      c.mesh.visible = true;
      c.active = true;
      return;
    }
  }

  function createDust(pos, count) {
    const pool = state.dustPool;
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < pool.length; j++) {
        const d = pool[j];
        if (d.active) continue;
        const ang = Math.random() * Math.PI * 2;
        const spd = 0.5 + Math.random() * 1.5;
        d.mesh.position.copy(pos);
        d.mesh.position.x += (Math.random() - 0.5) * 0.3;
        d.mesh.position.y += 0.1;
        d.mesh.position.z += (Math.random() - 0.5) * 0.3;
        d.vx = Math.cos(ang) * spd;
        d.vy = 0.8 + Math.random() * 1.5;
        d.vz = Math.sin(ang) * spd;
        d.life = 0.5;
        d.maxLife = 0.5;
        d.mesh.material.opacity = 0.5;
        d.mesh.scale.setScalar(0.5 + Math.random() * 0.5);
        d.mesh.visible = true;
        d.active = true;
        break;
      }
    }
  }

  function shatter(b) {
    const pos = b.mesh.position;
    for (let i = 0; i < SHATTER_DEBRIS; i++) createChip(pos);
    createDust(pos, 8);
    b.mesh.visible = false;
    b.obstacle.active = false;
    b.alive = false;
    state.count--;
    if (window.FX && window.FX.shake) window.FX.shake(0.06);
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(120 + Math.random() * 80, 0.2, 'sawtooth', 0.15, 600);
      window.Sound.noise(0.25, 0.3, 800);
    }
  }

  state.chipPool = [];
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(CHIP_GEO, CHIP_MAT);
    m.castShadow = true;
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    state.chipPool.push({ mesh: m, vx: 0, vy: 0, vz: 0, spin: 0, life: 0, active: false });
  }

  state.dustPool = [];
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(DUST_GEO, DUST_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    state.dustPool.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.5, active: false });
  }

  function deploy() {
    if (!state.ready) {
      if (window.FX && window.FX.message) window.FX.message('BARRICADE RECHARGING', '#ff6644');
      return false;
    }
    const ms = window.Manager && window.Manager.state ? window.Manager.state : null;
    if (!ms || ms.phase !== 'playing') return false;
    const p = window.Player ? window.Player.state : null;
    if (!p || !p.locked) return false;
    if (state.count >= MAX_BARRICADES) {
      if (window.FX && window.FX.message) window.FX.message('BARRICADE LIMIT REACHED', '#ff6644');
      return false;
    }
    const pt = getPlacementPoint();
    if (!pt) return false;
    if (!canPlace(pt.x, pt.z)) {
      if (window.FX && window.FX.message) window.FX.message('CANNOT PLACE HERE', '#ff6644');
      return false;
    }
    if (p.stamina < STAMINA_COST) {
      if (window.FX && window.FX.message) window.FX.message('TOO EXHAUSTED', '#ff6644');
      return false;
    }
    p.stamina -= STAMINA_COST;
    if (p.regenTimer !== undefined) p.regenTimer = 1.5;
    state.ready = false;
    state.cd = COOLDOWN;

    const mesh = buildBarricadeMesh();
    const gy = groundY(pt.x, pt.z);
    mesh.position.set(pt.x, gy, pt.z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    SCENE.add(mesh);

    const obstacle = {
      x: pt.x, z: pt.z, r: WEEP_RADIUS,
      hp: STAKE_HP, maxHp: STAKE_HP, active: true,
    };
    obstacles.push(obstacle);

    const b = { mesh, obstacle, hp: STAKE_HP, maxHp: STAKE_HP, alive: true, hitFlash: 0 };
    barricades.push(b);
    state.count++;

    createDust(mesh.position, 6);
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(160, 0.12, 'square', 0.15, 800);
      window.Sound.tone(80, 0.18, 'sawtooth', 0.12, 400);
    }
    if (window.FX && window.FX.message) window.FX.message('BARRICADE DEPLOYED', '#9fe8a0');
    return true;
  }

  function buildHUD() {
    const hud = document.createElement('div');
    hud.style.cssText = 'position:absolute;left:16px;bottom:252px;font-size:11px;letter-spacing:2px;color:#c9d8ff;text-shadow:0 1px 3px #000;z-index:6;';
    const label = document.createElement('div');
    label.textContent = 'BARRICADE [J]';
    hud.appendChild(label);
    const countEl = document.createElement('div');
    countEl.style.cssText = 'margin-top:2px;font-size:9px;color:#8899bb;';
    countEl.textContent = '0/' + MAX_BARRICADES;
    hud.appendChild(countEl);
    const bar = document.createElement('div');
    bar.style.cssText = 'margin-top:3px;width:80px;height:5px;background:rgba(0,0,0,0.5);border:1px solid rgba(150,170,210,0.3);border-radius:3px;overflow:hidden;';
    const fill = document.createElement('div');
    fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#667799,#aabbdd);transition:width 0.05s;';
    bar.appendChild(fill);
    hud.appendChild(bar);
    document.getElementById('hud').appendChild(hud);
    return { label, countEl, fill };
  }

  const hudEls = buildHUD();

  window.addEventListener('keydown', (e) => {
    if (e.key === 'j' || e.key === 'J') {
      if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
      deploy();
    }
  });

  function updatePreview() {
    const ms = window.Manager && window.Manager.state ? window.Manager.state : null;
    const p = window.Player ? window.Player.state : null;
    const shouldShow = ms && ms.phase === 'playing' && p && p.locked;
    if (!shouldShow) {
      preview.group.visible = false;
      return;
    }
    const pt = getPlacementPoint();
    if (!pt) {
      preview.group.visible = false;
      return;
    }
    const gy = groundY(pt.x, pt.z);
    preview.group.position.set(pt.x, gy, pt.z);
    const valid = state.ready && state.count < MAX_BARRICADES && canPlace(pt.x, pt.z);
    preview.ring.material = valid ? PREV_GOOD_MAT : PREV_BAD_MAT;
    preview.outer.material = valid ? PREV_OUT_GOOD : PREV_OUT_BAD;
    const col = valid ? 0x88cc66 : 0xcc4444;
    preview.ghost.children.forEach(c => { if (c.material) c.material.color.setHex(col); });
    preview.group.visible = true;
  }

  function update(dt) {
    if (state.cd > 0) {
      state.cd -= dt;
      if (state.cd <= 0) { state.cd = 0; state.ready = true; }
    }
    hudEls.fill.style.width = (state.ready ? 100 : (1 - state.cd / COOLDOWN) * 100) + '%';
    hudEls.countEl.textContent = state.count + '/' + MAX_BARRICADES;
    hudEls.countEl.style.color = state.count >= MAX_BARRICADES ? '#ff6644' : '#8899bb';

    updatePreview();

    for (let i = barricades.length - 1; i >= 0; i--) {
      const b = barricades[i];
      if (!b.alive) {
        barricades.splice(i, 1);
        continue;
      }
      if (b.hitFlash > 0) {
        b.hitFlash -= dt;
        const intensity = Math.max(0, b.hitFlash / 0.15);
        b.mesh.children.forEach(c => {
          if (c.material && c.material.emissive) {
            if (c.material === STAKE_MAT || c.material === CROSSBAR_MAT) {
              c.material.emissive.setRGB(intensity * 0.4, 0, 0);
            }
          }
        });
      }
    }

    for (let i = 0; i < state.chipPool.length; i++) {
      const c = state.chipPool[i];
      if (!c.active) continue;
      c.life -= dt;
      if (c.life <= 0) {
        c.mesh.visible = false;
        c.active = false;
        continue;
      }
      c.vy -= 16 * dt;
      c.mesh.position.x += c.vx * dt;
      c.mesh.position.y += c.vy * dt;
      c.mesh.position.z += c.vz * dt;
      if (c.mesh.position.y < 0.05) {
        c.mesh.position.y = 0.05;
        c.vy *= -0.3;
        c.vx *= 0.6;
        c.vz *= 0.6;
      }
      c.mesh.rotation.x += c.spin * dt;
      c.mesh.rotation.y += c.spin * 0.7 * dt;
      c.mesh.material.opacity = Math.min(1, c.life / 0.3);
    }

    for (let i = 0; i < state.dustPool.length; i++) {
      const d = state.dustPool[i];
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.mesh.visible = false;
        d.active = false;
        continue;
      }
      d.vy -= 4 * dt;
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += d.vz * dt;
      if (d.mesh.position.y < 0.05) {
        d.mesh.position.y = 0.05;
        d.vy = 0;
        d.vx *= 0.85;
        d.vz *= 0.85;
      }
      d.mesh.material.opacity = (d.life / d.maxLife) * 0.5;
      const sc = 1 + (1 - d.life / d.maxLife) * 0.8;
      d.mesh.scale.setScalar(sc);
    }
  }

  function findBarricadeAt(x, z) {
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (!o.active) continue;
      const dx = x - o.x, dz = z - o.z;
      if (dx * dx + dz * dz < o.r * o.r) return { obstacle: o, index: i };
    }
    return null;
  }

  function applyDamage(x, z, amount) {
    const hit = findBarricadeAt(x, z);
    if (!hit) return false;
    const obs = hit.obstacle;
    obs.hp -= amount;
    for (let i = 0; i < barricades.length; i++) {
      if (barricades[i].obstacle === obs) {
        barricades[i].hp = obs.hp;
        barricades[i].hitFlash = 0.15;
        createChip(barricades[i].mesh.position);
        break;
      }
    }
    if (obs.hp <= 0) {
      for (let i = 0; i < barricades.length; i++) {
        if (barricades[i].obstacle === obs) {
          shatter(barricades[i]);
          break;
        }
      }
    }
    return true;
  }

  function rayHitsBarricade(origin, direction, maxDist) {
    for (let i = 0; i < barricades.length; i++) {
      const b = barricades[i];
      if (!b.alive) continue;
      const pos = b.mesh.position;
      const dx = origin.x - pos.x;
      const dy = origin.y - (pos.y + 0.7);
      const dz = origin.z - pos.z;
      const a = direction.x * direction.x + direction.z * direction.z;
      const bl = direction.x * dx + direction.z * dz;
      const c = dx * dx + dz * dz - WEEP_RADIUS * WEEP_RADIUS;
      const disc = bl * bl - a * c;
      if (disc < 0 || a < 1e-6) continue;
      const sq = Math.sqrt(disc);
      const t1 = (-bl - sq) / a;
      const t2 = (-bl + sq) / a;
      if (t1 > 0 && t1 < maxDist) {
        const hitY = origin.y + direction.y * t1;
        if (hitY > pos.y + 0.05 && hitY < pos.y + 1.5) return { x: origin.x + direction.x * t1, z: origin.z + direction.z * t1, dist: t1 };
      }
      if (t2 > 0 && t2 < maxDist) {
        const hitY = origin.y + direction.y * t2;
        if (hitY > pos.y + 0.05 && hitY < pos.y + 1.5) return { x: origin.x + direction.x * t2, z: origin.z + direction.z * t2, dist: t2 };
      }
    }
    return null;
  }

  function reset() {
    for (let i = barricades.length - 1; i >= 0; i--) {
      if (barricades[i].mesh) SCENE.remove(barricades[i].mesh);
    }
    barricades.length = 0;
    obstacles.length = 0;
    state.count = 0;
    state.cd = 0;
    state.ready = true;
    for (let i = 0; i < state.chipPool.length; i++) {
      state.chipPool[i].active = false;
      state.chipPool[i].mesh.visible = false;
    }
    for (let i = 0; i < state.dustPool.length; i++) {
      state.dustPool[i].active = false;
      state.dustPool[i].mesh.visible = false;
    }
    preview.group.visible = false;
  }

  return { update, deploy, applyDamage, rayHitsBarricade, reset, state };
})();

window.Barricade = Barricade;