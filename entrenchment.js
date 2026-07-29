// entrenchment.js — FORESTWAR deployable sandbag walls: blocks LOS, absorbs damage, provides cover
const THREE = window.THREE;
const SCENE = window.SCENE;
const Entrenchment = (() => {
  const MAX_WALLS = 20;
  const SEGMENT_LENGTH = 2.6;
  const SEGMENT_HEIGHT = 1.2;
  const SEGMENT_THICKNESS = 1.0;
  const SEGMENT_HP = 300;
  const COOLDOWN = 1.2;
  const STAMINA_COST = 30;
  const MAX_LENGTH = 8;

  const state = {
    cd: 0,
    building: false,
    buildStart: null,
    preview: null,
    previewSegments: [],
    walls: [],
    wallCount: 0,
  };

  const BAG_GEO = new THREE.BoxGeometry(0.4, 0.4, 0.3);
  const BAG_MAT = new THREE.MeshStandardMaterial({ color: 0x6a5a38, roughness: 0.95, flatShading: true });
  const BAG_MAT_DARK = new THREE.MeshStandardMaterial({ color: 0x4a3e26, roughness: 0.95, flatShading: true });
  const PREVIEW_GEO = new THREE.BoxGeometry(SEGMENT_LENGTH, 0.05, SEGMENT_THICKNESS);
  const PREVIEW_MAT = new THREE.MeshBasicMaterial({ color: 0x88cc66, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
  const PREVIEW_MAT_BAD = new THREE.MeshBasicMaterial({ color: 0xcc4444, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
  const DUST_GEO = new THREE.SphereGeometry(0.2, 5, 4);
  const DUST_MAT = new THREE.MeshBasicMaterial({ color: 0x8a7a5a, transparent: true, opacity: 0, depthWrite: false });
  const CHIP_GEO = new THREE.BoxGeometry(0.12, 0.12, 0.12);

  const obstacles = [];
  window.coverObstacles = obstacles;

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function canPlace(x, z) {
    const trees = window.TREES || [];
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      const dx = x - t.x, dz = z - t.z;
      if (dx * dx + dz * dz < (t.r + 0.8) * (t.r + 0.8)) return false;
    }
    const wc = window.worldColliders || [];
    for (let i = 0; i < wc.length; i++) {
      const c = wc[i];
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < (c.r + 0.5) * (c.r + 0.5)) return false;
    }
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (!o.active) continue;
      const dx = x - o.x, dz = z - o.z;
      if (dx * dx + dz * dz < (o.r + 1.5) * (o.r + 1.5)) return false;
    }
    return true;
  }

  function buildHUD() {
    const hud = document.createElement('div');
    hud.style.cssText = 'position:absolute;left:16px;bottom:230px;font-size:11px;letter-spacing:2px;color:#c9d8ff;text-shadow:0 1px 3px #000;z-index:6;';
    const label = document.createElement('div');
    label.textContent = 'ENTRENCH [B]';
    hud.appendChild(label);
    const bar = document.createElement('div');
    bar.style.cssText = 'margin-top:3px;width:80px;height:5px;background:rgba(0,0,0,0.5);border:1px solid rgba(150,170,210,0.3);border-radius:3px;overflow:hidden;';
    const fill = document.createElement('div');
    fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#668844,#aacc88);transition:width 0.05s;';
    bar.appendChild(fill);
    hud.appendChild(bar);
    const status = document.createElement('div');
    status.style.cssText = 'margin-top:3px;font-size:10px;color:#889977;';
    status.textContent = 'WALLS: 0/' + MAX_WALLS;
    hud.appendChild(status);
    document.getElementById('hud').appendChild(hud);
    state._fill = fill;
    state._status = status;
  }

  function buildPreview() {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(PREVIEW_GEO, PREVIEW_MAT.clone());
      seg.visible = false;
      g.add(seg);
      state.previewSegments.push(seg);
    }
    state.preview = g;
    SCENE.add(g);
  }

  function getForwardFlat() {
    const cam = window.CAMERA;
    if (!cam) return { x: 0, z: -1 };
    const e = cam.matrix.elements;
    const len = Math.sqrt(e[8] * e[8] + e[10] * e[10]);
    if (len < 0.001) return { x: 0, z: -1 };
    return { x: -e[8] / len, z: -e[10] / len };
  }

  function getRightFlat() {
    const cam = window.CAMERA;
    if (!cam) return { x: 1, z: 0 };
    const e = cam.matrix.elements;
    const len = Math.sqrt(e[0] * e[0] + e[2] * e[2]);
    if (len < 0.001) return { x: 1, z: 0 };
    return { x: e[0] / len, z: e[2] / len };
  }

  function startBuild() {
    const p = window.Player ? window.Player.state : null;
    if (!p || !p.locked) return;
    if (state.cd > 0) {
      if (window.FX) window.FX.message('ENTRENCH RECHARGING', '#ff6644');
      return;
    }
    if (p.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('TOO EXHAUSTED', '#ff6644');
      return;
    }
    if (state.wallCount >= MAX_WALLS) {
      if (window.FX) window.FX.message('WALL LIMIT REACHED', '#ff6644');
      return;
    }
    state.building = true;
    const cam = window.CAMERA;
    state.buildStart = { x: cam.position.x, z: cam.position.z };
    if (state.preview) state.preview.visible = true;
    if (window.Sound) window.Sound.tone(330, 0.08, 'square', 0.15, 2000);
  }

  function finishBuild() {
    if (!state.building) return;
    state.building = false;
    if (state.preview) state.preview.visible = false;
    const p = window.Player ? window.Player.state : null;
    if (!p) return;

    const cam = window.CAMERA;
    const dx = cam.position.x - state.buildStart.x;
    const dz = cam.position.z - state.buildStart.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 1.0) {
      if (window.FX) window.FX.message('TRENCH TOO SHORT', '#ff6644');
      return;
    }

    const clamped = Math.min(dist, MAX_LENGTH);
    const segCount = Math.max(1, Math.ceil(clamped / SEGMENT_LENGTH));
    let placed = 0;
    for (let i = 0; i < segCount; i++) {
      const t = (i + 0.5) / segCount;
      const wx = state.buildStart.x + dx * (t * clamped / dist);
      const wz = state.buildStart.z + dz * (t * clamped / dist);
      if (!canPlace(wx, wz)) continue;
      if (state.wallCount >= MAX_WALLS) break;
      buildWallSegment(wx, wz, Math.atan2(dx, dz));
      placed++;
    }

    if (placed > 0) {
      p.stamina -= STAMINA_COST;
      if (p.regenTimer !== undefined) p.regenTimer = 1.5;
      state.cd = COOLDOWN;
      if (window.Sound) {
        window.Sound.tone(180, 0.15, 'sawtooth', 0.25, 800);
        window.Sound.tone(120, 0.2, 'sine', 0.15, 400);
      }
      if (window.FX) window.FX.message('SANDBAGS DEPLOYED x' + placed, '#aacc88');
    } else {
      if (window.FX) window.FX.message('NO ROOM TO BUILD', '#ff6644');
    }
  }

  function cancelBuild() {
    if (!state.building) return;
    state.building = false;
    if (state.preview) state.preview.visible = false;
  }

  function buildWallSegment(x, z, yaw) {
    const group = new THREE.Group();
    const cols = 3;
    const rows = 3;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const mat = (row + col) % 2 === 0 ? BAG_MAT : BAG_MAT_DARK;
        const bag = new THREE.Mesh(BAG_GEO, mat);
        bag.castShadow = true;
        bag.receiveShadow = true;
        bag.position.x = (col - 1) * 0.42;
        bag.position.y = 0.2 + row * 0.4;
        bag.position.z = (row % 2) * 0.1 - 0.05;
        bag.rotation.y = Math.random() * 0.2 - 0.1;
        bag.rotation.x = Math.random() * 0.08 - 0.04;
        group.add(bag);
      }
    }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.35), BAG_MAT_DARK);
    cap.position.y = rows * 0.4 + 0.1;
    cap.castShadow = true;
    group.add(cap);

    group.position.set(x, groundY(x, z), z);
    group.rotation.y = yaw;
    SCENE.add(group);

    const entry = {
      mesh: group,
      x: x,
      z: z,
      r: SEGMENT_LENGTH * 0.5,
      hp: SEGMENT_HP,
      maxHp: SEGMENT_HP,
      active: true,
      hitFlash: 0,
      chips: [],
    };
    state.walls.push(entry);
    obstacles.push(entry);
    state.wallCount++;
  }

  function damageWall(wall, amount, hitX, hitY, hitZ) {
    wall.hp -= amount;
    wall.hitFlash = 0.15;
    spawnChips(wall, hitX || wall.x, hitY || 0.6, hitZ || wall.z, 4);
    if (wall.hp <= 0) destroyWall(wall);
  }

  function destroyWall(wall) {
    wall.active = false;
    const idx = obstacles.indexOf(wall);
    if (idx >= 0) obstacles.splice(idx, 1);
    wall.mesh.traverse((child) => {
      if (child.geometry && child.geometry.type === 'BoxGeometry') {
        spawnChips(wall, child.getWorldPosition(new THREE.Vector3()).x, child.position.y + 0.3, child.getWorldPosition(new THREE.Vector3()).z, 2);
      }
    });
    SCENE.remove(wall.mesh);
    wall.mesh.traverse((child) => {
      if (child.isMesh && child.geometry !== BAG_GEO && child.geometry !== CHIP_GEO) {
        child.geometry.dispose && child.geometry.dispose();
      }
    });
    state.wallCount--;
    if (window.Sound) {
      window.Sound.tone(80, 0.3, 'sawtooth', 0.3, 300);
      window.Sound.tone(50, 0.4, 'sine', 0.2, 150);
    }
  }

  const chipPool = [];
  for (let i = 0; i < 60; i++) {
    const mesh = new THREE.Mesh(CHIP_GEO, new THREE.MeshBasicMaterial({ color: 0x6a5a38, transparent: true }));
    mesh.visible = false;
    mesh.frustumCulled = false;
    SCENE.add(mesh);
    chipPool.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0, rotVx: 0, rotVy: 0, rotVz: 0, active: false });
  }
  let chipIdx = 0;

  function spawnChips(wall, x, y, z, count) {
    for (let i = 0; i < count; i++) {
      const slot = chipPool[chipIdx];
      chipIdx = (chipIdx + 1) % chipPool.length;
      slot.mesh.position.set(x + (Math.random() - 0.5) * 0.5, y + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.5);
      slot.vx = (Math.random() - 0.5) * 4;
      slot.vy = 2 + Math.random() * 3;
      slot.vz = (Math.random() - 0.5) * 4;
      slot.rotVx = (Math.random() - 0.5) * 8;
      slot.rotVy = (Math.random() - 0.5) * 8;
      slot.rotVz = (Math.random() - 0.5) * 8;
      slot.mesh.material.color.setHSL(0.09, 0.3, 0.25 + Math.random() * 0.15);
      slot.mesh.material.opacity = 1;
      slot.mesh.visible = true;
      slot.life = 0.8 + Math.random() * 0.4;
      slot.active = true;
    }
  }

  function updatePreview() {
    if (!state.building || !state.preview) return;
    const cam = window.CAMERA;
    const dx = cam.position.x - state.buildStart.x;
    const dz = cam.position.z - state.buildStart.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const clamped = Math.min(dist, MAX_LENGTH);
    const segCount = Math.max(1, Math.ceil(clamped / SEGMENT_LENGTH));
    const yaw = Math.atan2(dx, dz);

    for (let i = 0; i < state.previewSegments.length; i++) {
      const seg = state.previewSegments[i];
      if (i < segCount) {
        const t = (i + 0.5) / segCount;
        const wx = state.buildStart.x + dx * (t * clamped / dist);
        const wz = state.buildStart.z + dz * (t * clamped / dist);
        seg.position.set(wx, groundY(wx, wz) + 0.05, wz);
        seg.rotation.y = yaw;
        seg.visible = true;
        const ok = canPlace(wx, wz);
        seg.material = ok ? PREVIEW_MAT : PREVIEW_MAT_BAD;
      } else {
        seg.visible = false;
      }
    }
  }

  function updateHUD() {
    if (state._fill) {
      const ready = state.cd <= 0 ? 1 : 1 - state.cd / COOLDOWN;
      state._fill.style.width = (ready * 100) + '%';
      state._fill.style.background = ready >= 1 ? 'linear-gradient(90deg,#668844,#aacc88)' : 'linear-gradient(90deg,#554433,#776644)';
    }
    if (state._status) {
      state._status.textContent = 'WALLS: ' + state.wallCount + '/' + MAX_WALLS;
    }
  }

  const _expPos = new THREE.Vector3();

  function init() {
    buildHUD();
    buildPreview();
    window.addEventListener('keydown', (e) => {
      if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
      if (e.key === 'b' || e.key === 'B') {
        if (!state.building) startBuild();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'b' || e.key === 'B') {
        if (state.building) finishBuild();
      }
    });
  }

  const _losTmp = new THREE.Vector3();

  function blocksLineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const dist = Math.sqrt(dx * dx + dy * * dy + dz * dz);
    if (dist < 0.01) return false;
    const steps = Math.ceil(dist / 0.8);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = ax + dx * t;
      const pz = az + dz * t;
      for (let j = 0; j < obstacles.length; j++) {
        const o = obstacles[j];
        if (!o.active) continue;
        const ox = px - o.x;
        const oz = pz - o.z;
        if (ox * ox + oz * oz < o.r * o.r) {
          const py = ay + dy * t;
          if (py < SEGMENT_HEIGHT + groundY(o.x, o.z)) return true;
        }
      }
    }
    return false;
  }

  function update(dt) {
    if (state.cd > 0) state.cd = Math.max(0, state.cd - dt);
    updateHUD();

    if (state.building) updatePreview();

    for (let i = state.walls.length - 1; i >= 0; i--) {
      const w = state.walls[i];
      if (!w.active) {
        state.walls.splice(i, 1);
        continue;
      }
      if (w.hitFlash > 0) {
        w.hitFlash -= dt;
        const flash = Math.max(0, w.hitFlash / 0.15);
        w.mesh.traverse((child) => {
          if (child.isMesh && child.material && child.material.emissive) {
            child.material.emissive.setRGB(flash * 0.5, 0, 0);
          }
        });
      }
    }

    for (let i = 0; i < chipPool.length; i++) {
      const c = chipPool[i];
      if (!c.active) continue;
      c.life -= dt;
      if (c.life <= 0) {
        c.active = false;
        c.mesh.visible = false;
        continue;
      }
      c.vy -= 20 * dt;
      c.mesh.position.x += c.vx * dt;
      c.mesh.position.y += c.vy * dt;
      c.mesh.position.z += c.vz * dt;
      const gy = groundY(c.mesh.position.x, c.mesh.position.z);
      if (c.mesh.position.y < gy) {
        c.mesh.position.y = gy;
        c.vy *= -0.3;
        c.vx *= 0.5;
        c.vz *= 0.5;
      }
      c.mesh.rotation.x += c.rotVx * dt;
      c.mesh.rotation.y += c.rotVy * dt;
      c.mesh.rotation.z += c.rotVz * dt;
      c.mesh.material.opacity = Math.min(1, c.life * 2);
    }

    if (window.Entities && Array.isArray(window.Entities.list)) {
      const ents = window.Entities.list;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (e.dead) continue;
        const m = e.mesh;
        if (!m) continue;
        for (let j = 0; j < obstacles.length; j++) {
          const o = obstacles[j];
          if (!o.active) continue;
          const dx = m.position.x - o.x;
          const dz = m.position.z - o.z;
          const dist2 = dx * dx + dz * dz;
          if (dist2 < o.r * o.r && dist2 > 0.01) {
            const push = o.r / Math.sqrt(dist2);
            m.position.x = o.x + dx * push;
            m.position.z = o.z + dz * push;
          }
        }
      }
    }

    if (window.Explosions && window.Explosions.recent) {
      const recent = window.Explosions.recent;
      for (let i = 0; i < recent.length; i++) {
        const exp = recent[i];
        for (let j = 0; j < obstacles.length; j++) {
          const o = obstacles[j];
          if (!o.active) continue;
          const dx = o.x - exp.x;
          const dz = o.z - exp.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < exp.radius + o.r) {
            const falloff = 1 - dist / (exp.radius + o.r);
            damageWall(o, exp.damage * falloff * 0.6, o.x, 0.5, o.z);
          }
        }
      }
    }
  }

  function reset() {
    for (let i = state.walls.length - 1; i >= 0; i--) {
      const w = state.walls[i];
      if (w.mesh) SCENE.remove(w.mesh);
    }
    state.walls.length = 0;
    obstacles.length = 0;
    state.wallCount = 0;
    state.building = false;
    state.cd = 0;
    if (state.preview) state.preview.visible = false;
    for (let i = 0; i < chipPool.length; i++) {
      chipPool[i].active = false;
      chipPool[i].mesh.visible = false;
    }
  }

  return { init, update, reset, blocksLineOfSight, damageWall, state, obstacles };
})();

window.Entrenchment = Entrenchment;