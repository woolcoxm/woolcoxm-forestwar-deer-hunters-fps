// sentry-tower.js — FORESTWAR deployable elevated sentry tower: tall platform with a long-range auto-turret nest on top
const THREE = window.THREE;
const SCENE = window.SCENE;
const SentryTower = (() => {
  const MAX_TOWERS = 2;
  const RANGE = 65;
  const FIRE_RATE = 0.14;
  const DAMAGE = 16;
  const TOWER_HP = 320;
  const LIFETIME = 75;
  const COOLDOWN = 40;
  const STAMINA_COST = 45;
  const DEPLOY_RANGE = 6;
  const ROT_SPEED = 3.2;
  const SWEEP_ARC = 0.6;
  const PLATFORM_HEIGHT = 5.5;
  const TRACER_LIFE = 0.06;
  const TRACER_POOL = 8;
  const SPARK_POOL = 12;
  const SPARK_LIFE = 0.3;
  const HEADSHOT_MULT = 1.6;

  const state = {
    ready: true,
    cd: 0,
    towers: [],
    placementValid: false,
  };

  const _tmpDir = new THREE.Vector3();
  const _tmpTarget = new THREE.Vector3();
  const _tmpMuzzle = new THREE.Vector3();
  const _tmpVec = new THREE.Vector3();

  // ---- Shared geometry & materials -----------------------------------------
  const LEG_GEO = new THREE.BoxGeometry(0.2, PLATFORM_HEIGHT, 0.2);
  const LEG_MAT = new THREE.MeshStandardMaterial({ color: 0x3a3528, roughness: 0.85, metalness: 0.35 });
  const PLATFORM_GEO = new THREE.BoxGeometry(2.2, 0.16, 2.2);
  const PLATFORM_MAT = new THREE.MeshStandardMaterial({ color: 0x4a4334, roughness: 0.8, metalness: 0.3 });
  const RAIL_GEO = new THREE.BoxGeometry(0.06, 0.5, 0.06);
  const RAIL_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.7, metalness: 0.5 });
  const SAND_GEO = new THREE.BoxGeometry(0.32, 0.22, 0.24);
  const SAND_MAT = new THREE.MeshStandardMaterial({ color: 0x6a5a38, roughness: 0.95, flatShading: true });

  const PIVOT_GEO = new THREE.CylinderGeometry(0.18, 0.22, 0.3, 8);
  const PIVOT_MAT = new THREE.MeshStandardMaterial({ color: 0x555044, roughness: 0.6, metalness: 0.55 });
  const HOUSING_GEO = new THREE.BoxGeometry(0.5, 0.38, 0.55);
  const HOUSING_MAT = new THREE.MeshStandardMaterial({ color: 0x3a382e, roughness: 0.7, metalness: 0.4 });
  const BARREL_GEO = new THREE.CylinderGeometry(0.055, 0.055, 0.9, 6);
  BARREL_GEO.rotateX(Math.PI / 2);
  const BARREL_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1a14, roughness: 0.35, metalness: 0.85 });
  const SCOPE_GEO = new THREE.CylinderGeometry(0.05, 0.05, 0.22, 6);
  SCOPE_GEO.rotateX(Math.PI / 2);
  const SCOPE_MAT = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.9 });
  const LENS_GEO = new THREE.SphereGeometry(0.045, 6, 5);
  const LENS_MAT = new THREE.MeshBasicMaterial({ color: 0xff3322 });

  const MUZZLE_GEO = new THREE.SphereGeometry(0.14, 6, 5);
  const MUZZLE_MAT_BASE = new THREE.MeshBasicMaterial({ color: 0xffee66, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const TRACER_GEO = new THREE.CylinderGeometry(0.02, 0.006, 1, 4);
  TRACER_GEO.rotateX(Math.PI / 2);
  const TRACER_MAT_BASE = new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const SPARK_GEO = new THREE.SphereGeometry(0.1, 4, 3);
  const SPARK_MAT_BASE = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const HP_RING_GEO = new THREE.RingGeometry(1.2, 1.5, 24);
  const HP_RING_MAT = new THREE.MeshBasicMaterial({ color: 0x9fe8a0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });

  // ---- Placement preview ---------------------------------------------------
  const preview = new THREE.Group();
  const previewBase = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 1.5, 24),
    new THREE.MeshBasicMaterial({ color: 0x88ff66, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
  );
  previewBase.rotation.x = -Math.PI / 2;
  preview.add(previewBase);
  const previewRange = new THREE.Mesh(
    new THREE.RingGeometry(RANGE - 0.5, RANGE, 64),
    new THREE.MeshBasicMaterial({ color: 0x88ff66, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false })
  );
  previewRange.rotation.x = -Math.PI / 2;
  preview.add(previewRange);
  preview.visible = false;
  SCENE.add(preview);

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function canPlace(x, z) {
    const trees = window.TREES || [];
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      const dx = x - t.x, dz = z - t.z;
      if (dx * dx + dz * dz < (t.r + 1.5) * (t.r + 1.5)) return false;
    }
    const wc = window.worldColliders || [];
    for (let i = 0; i < wc.length; i++) {
      const c = wc[i];
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < (c.r + 1.2) * (c.r + 1.2)) return false;
    }
    const obs = window.coverObstacles || [];
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      if (!o.active) continue;
      const dx = x - o.x, dz = z - o.z;
      if (dx * dx + dz * dz < (o.r + 1.5) * (o.r + 1.5)) return false;
    }
    return true;
  }

  function getPlayerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function getEnemies(x, z, team) {
    if (window.Grid) {
      const out = [];
      window.Grid.queryRadius(x, z, RANGE, out, (e) => !e.dead && e.team !== team);
      return out;
    }
    if (!window.Entities || !Array.isArray(window.Entities.list)) return [];
    const result = [];
    const r2 = RANGE * RANGE;
    for (let i = 0; i < window.Entities.list.length; i++) {
      const e = window.Entities.list[i];
      if (e.dead || e.team === team || !e.mesh) continue;
      const dx = e.mesh.position.x - x;
      const dz = e.mesh.position.z - z;
      if (dx * dx + dz * dz <= r2) result.push(e);
    }
    return result;
  }

  function buildTower() {
    const root = new THREE.Group();

    // Four splayed legs
    const legOffsets = [
      [-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8],
    ];
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(LEG_GEO, LEG_MAT);
      leg.castShadow = true;
      const [lx, lz] = legOffsets[i];
      leg.position.set(lx * 0.9, PLATFORM_HEIGHT * 0.5, lz * 0.9);
      leg.rotation.z = -lx * 0.08;
      leg.rotation.x = lz * 0.08;
      root.add(leg);

      // Cross-bracing
      const brace = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.05, Math.abs(lz) * 2.4),
        LEG_MAT
      );
      brace.position.set(lx * 0.9, PLATFORM_HEIGHT * 0.35, 0);
      root.add(brace);
      const brace2 = new THREE.Mesh(
        new THREE.BoxGeometry(Math.abs(lx) * 2.4, 0.05, 0.05),
        LEG_MAT
      );
      brace2.position.set(0, PLATFORM_HEIGHT * 0.55, lz * 0.9);
      root.add(brace2);
    }

    // Platform deck
    const deck = new THREE.Mesh(PLATFORM_GEO, PLATFORM_MAT);
    deck.castShadow = true;
    deck.receiveShadow = true;
    deck.position.y = PLATFORM_HEIGHT;
    root.add(deck);

    // Sandbag rim — 8 bags around the edge
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const bag = new THREE.Mesh(SAND_GEO, i % 2 === 0 ? SAND_MAT : new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.95, flatShading: true }));
      bag.castShadow = true;
      bag.position.set(
        Math.cos(ang) * 0.95,
        PLATFORM_HEIGHT + 0.19,
        Math.sin(ang) * 0.95
      );
      bag.rotation.y = ang;
      root.add(bag);
    }

    // Corner rails
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const post = new THREE.Mesh(RAIL_GEO, RAIL_MAT);
      post.position.set(Math.cos(ang) * 1.0, PLATFORM_HEIGHT + 0.33, Math.sin(ang) * 1.0);
      root.add(post);
    }

    // Turret pivot on the deck
    const pivot = new THREE.Group();
    pivot.position.y = PLATFORM_HEIGHT + 0.2;
    root.add(pivot);

    const baseMount = new THREE.Mesh(PIVOT_GEO, PIVOT_MAT);
    baseMount.castShadow = true;
    baseMount.position.y = 0.05;
    pivot.add(baseMount);

    const housing = new THREE.Mesh(HOUSING_GEO, HOUSING_MAT);
    housing.castShadow = true;
    housing.position.y = 0.32;
    pivot.add(housing);

    const barrel = new THREE.Mesh(BARREL_GEO, BARREL_MAT);
    barrel.position.set(0, 0.35, 0.5);
    pivot.add(barrel);

    const scope = new THREE.Mesh(SCOPE_GEO, SCOPE_MAT);
    scope.position.set(0, 0.5, 0.15);
    pivot.add(scope);

    const lens = new THREE.Mesh(LENS_GEO, LENS_MAT.clone());
    lens.position.set(0, 0.5, 0.27);
    pivot.add(lens);

    // Muzzle flash
    const muzzle = new THREE.Mesh(MUZZLE_GEO, MUZZLE_MAT_BASE.clone());
    muzzle.visible = false;
    muzzle.position.set(0, 0.35, 1.0);
    pivot.add(muzzle);

    // HP ring at the base
    const hpRing = new THREE.Mesh(HP_RING_GEO, HP_RING_MAT.clone());
    hpRing.rotation.x = -Math.PI / 2;
    hpRing.position.y = 0.12;
    root.add(hpRing);

    // Tracer pool
    const tracers = [];
    for (let i = 0; i < TRACER_POOL; i++) {
      const t = new THREE.Mesh(TRACER_GEO, TRACER_MAT_BASE.clone());
      t.visible = false;
      t.frustumCulled = false;
      SCENE.add(t);
      tracers.push({ mesh: t, life: 0, start: new THREE.Vector3(), end: new THREE.Vector3() });
    }

    // Spark pool
    const sparks = [];
    for (let i = 0; i < SPARK_POOL; i++) {
      const s = new THREE.Mesh(SPARK_GEO, SPARK_MAT_BASE.clone());
      s.visible = false;
      s.frustumCulled = false;
      SCENE.add(s);
      sparks.push({ mesh: s, life: 0, vx: 0, vy: 0, vz: 0 });
    }

    // Muzzle point light
    const muzzleLight = new THREE.PointLight(0xffcc55, 0, 8, 2);
    muzzleLight.position.set(0, PLATFORM_HEIGHT + 0.5, 1.0);
    root.add(muzzleLight);

    return {
      root,
      pivot,
      housing,
      lens,
      barrel,
      muzzle,
      hpRing,
      muzzleLight,
      tracers,
      sparks,
      sparkIdx: 0,
      tracerIdx: 0,
      scanAngle: Math.random() * Math.PI * 2,
      targetYaw: 0,
      currentYaw: 0,
      target: null,
      fireCd: 0,
      acquireTimer: 0,
      hp: TOWER_HP,
      maxHp: TOWER_HP,
      team: 'hunter',
      life: LIFETIME,
      x: 0,
      z: 0,
      active: false,
      dead: false,
    };
  }

  function fire(tower) {
    const tgt = tower.target;
    if (!tgt || !tgt.mesh || tgt.dead) return;
    const muzzleWorld = _tmpMuzzle.set(0, PLATFORM_HEIGHT + 0.55, 1.0);
    tower.root.localToWorld(muzzleWorld);

    _tmpTarget.copy(tgt.mesh.position);
    _tmpTarget.y += 1.0;
    _tmpDir.subVectors(_tmpTarget, muzzleWorld);
    const dist = _tmpDir.length();
    if (dist < 0.1) return;
    _tmpDir.divideScalar(dist);

    // Hitscan damage
    const headshot = _tmpTarget.y > (tgt.mesh.position.y + 1.4);
    const dmg = DAMAGE * (headshot ? HEADSHOT_MULT : 1.0);
    if (window.Entities && window.Entities.damage) {
      window.Entities.damage(tgt, dmg, 'hunter', { source: 'turret', ranged: true });
    } else if (tgt.hp !== undefined) {
      tgt.hp -= dmg;
      if (tgt.hp <= 0 && !tgt.dead && window.Entities) window.Entities.kill(tgt, 'hunter');
    }

    // Tracer
    const slot = tower.tracers[tower.tracerIdx];
    tower.tracerIdx = (tower.tracerIdx + 1) % TRACER_POOL;
    slot.start.copy(muzzleWorld);
    slot.end.copy(_tmpTarget);
    slot.life = TRACER_LIFE;
    const mid = _tmpVec.copy(muzzleWorld).lerp(_tmpTarget, 0.5);
    slot.mesh.position.copy(mid);
    slot.mesh.lookAt(_tmpTarget);
    const len = Math.max(0.5, muzzleWorld.distanceTo(_tmpTarget));
    slot.mesh.scale.set(1, 1, len);
    slot.mesh.visible = true;
    slot.mesh.material.opacity = 0.8;

    // Muzzle flash
    tower.muzzle.visible = true;
    tower.muzzle.material.opacity = 1;
    tower.muzzleLight.intensity = 5;

    // Impact sparks at target
    spawnSparks(tower, _tmpTarget);

    // Sound
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(900 + Math.random() * 100, 0.04, 'square', 0.08, 2500);
    }

    // Suppression near miss on enemies close to the target
    if (window.Suppression && window.Suppression.applyNearMiss) {
      window.Suppression.applyNearMiss(_tmpTarget.x, _tmpTarget.z, 'hunter');
    }
  }

  function spawnSparks(tower, pos) {
    const slot = tower.sparks[tower.sparkIdx];
    tower.sparkIdx = (tower.sparkIdx + 1) % SPARK_POOL;
    const ang = Math.random() * Math.PI * 2;
    const spd = 2 + Math.random() * 3;
    slot.vx = Math.cos(ang) * spd;
    slot.vy = 1 + Math.random() * 3;
    slot.vz = Math.sin(ang) * spd;
    slot.life = SPARK_LIFE;
    slot.mesh.position.copy(pos);
    slot.mesh.material.opacity = 1;
    slot.mesh.visible = true;
  }

  function updateTower(t, dt) {
    if (t.dead) return;

    t.life -= dt;
    if (t.life <= 0 || t.hp <= 0) {
      destroyTower(t);
      return;
    }

    // HP ring
    const hpFrac = Math.max(0, t.hp / t.maxHp);
    t.hpRing.material.opacity = 0.3 + 0.2 * Math.sin(performance.now() * 0.003);
    if (hpFrac < 0.5) {
      t.hpRing.material.color.setRGB(1, hpFrac * 1.4, hpFrac * 0.3);
    } else {
      t.hpRing.material.color.setRGB(1 - hpFrac, 1, 0.3);
    }
    t.hpRing.scale.setScalar(0.6 + 0.4 * (1 - hpFrac));

    // Tracers fade
    for (let i = 0; i < t.tracers.length; i++) {
      const tr = t.tracers[i];
      if (tr.life <= 0) continue;
      tr.life -= dt;
      if (tr.life <= 0) { tr.mesh.visible = false; continue; }
      tr.mesh.material.opacity = (tr.life / TRACER_LIFE) * 0.8;
    }

    // Muzzle flash fade
    if (t.muzzle.visible) {
      t.muzzle.material.opacity -= dt * 12;
      if (t.muzzle.material.opacity <= 0) {
        t.muzzle.visible = false;
        t.muzzle.material.opacity = 0;
      }
    }
    t.muzzleLight.intensity *= Math.max(0, 1 - dt * 18);

    // Sparks
    for (let i = 0; i < t.sparks.length; i++) {
      const s = t.sparks[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      s.vy -= 12 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.material.opacity = s.life / SPARK_LIFE;
    }

    // Acquire target on staggered interval
    t.acquireTimer -= dt;
    if (t.acquireTimer <= 0) {
      t.acquireTimer = 0.25;
      const enemies = getEnemies(t.x, t.z, t.team);
      let best = null;
      let bestDist = RANGE * RANGE;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e.mesh) continue;
        const dx = e.mesh.position.x - t.x;
        const dz = e.mesh.position.z - t.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestDist) {
          bestDist = d2;
          best = e;
        }
      }
      t.target = best;
    }

    // Aim toward target or sweep
    if (t.target && t.target.mesh && !t.target.dead) {
      _tmpTarget.copy(t.target.mesh.position);
      _tmpTarget.sub(t.root.position);
      t.targetYaw = Math.atan2(_tmpTarget.x, _tmpTarget.z);
    } else {
      t.scanAngle += dt * 0.6;
      t.targetYaw = t.scanAngle;
    }

    // Smooth yaw
    let dy = t.targetYaw - t.currentYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    t.currentYaw += dy * Math.min(1, ROT_SPEED * dt);
    t.pivot.rotation.y = t.currentYaw;

    // Lens pulse
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
    t.lens.material.color.setRGB(1, 0.2 + pulse * 0.3, 0.1 + pulse * 0.15);

    // Fire when aimed
    t.fireCd -= dt;
    if (t.fireCd <= 0 && t.target && t.target.mesh && !t.target.dead) {
      const aimedDiff = Math.abs(dy);
      if (aimedDiff < SWEEP_ARC) {
        fire(t);
        t.fireCd = FIRE_RATE;
      }
    }
  }

  function destroyTower(t) {
    if (t.dead) return;
    t.dead = true;
    t.active = false;

    // Explosion FX
    if (window.FX && window.FX.burst) {
      const pos = _tmpVec.copy(t.root.position);
      pos.y = PLATFORM_HEIGHT * 0.5;
      window.FX.burst(pos, new THREE.Vector3(0, 1, 0), 0x664422, 20);
    }
    if (window.Sound && window.Sound.explosion) window.Sound.explosion();
    if (window.Craters && window.Craters.create) window.Craters.create(t.x, t.z, 3.5);

    // Dispose per-tower resources
    for (let i = 0; i < t.tracers.length; i++) {
      SCENE.remove(t.tracers[i].mesh);
      t.tracers[i].mesh.material.dispose();
    }
    for (let i = 0; i < t.sparks.length; i++) {
      SCENE.remove(t.sparks[i].mesh);
      t.sparks[i].mesh.material.dispose();
    }
    t.muzzle.material.dispose();
    t.lens.material.dispose();
    t.hpRing.material.dispose();
    SCENE.remove(t.root);

    // Sweep from array
    const idx = state.towers.indexOf(t);
    if (idx !== -1) state.towers.splice(idx, 1);
  }

  function deploy() {
    if (!state.ready) {
      if (window.FX) window.FX.message('SENTRY TOWER RECHARGING', '#ff6644');
      return;
    }
    const player = window.Player;
    if (!player || !player.state) return;
    if (player.state.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('INSUFFICIENT STAMINA', '#ff6644');
      return;
    }

    // Remove oldest if at cap
    while (state.towers.length >= MAX_TOWERS) {
      destroyTower(state.towers[0]);
    }

    const cam = window.CAMERA;
    const fwd = _tmpDir;
    cam.getWorldDirection(fwd);
    const x = cam.position.x + fwd.x * DEPLOY_RANGE;
    const z = cam.position.z + fwd.z * DEPLOY_RANGE;

    if (!canPlace(x, z)) {
      if (window.FX) window.FX.message('CANNOT DEPLOY HERE', '#ff6644');
      return;
    }

    player.state.stamina -= STAMINA_COST;
    if (player.state.regenTimer !== undefined) player.state.regenTimer = 1.5;

    const tower = buildTower();
    const gy = groundY(x, z);
    tower.root.position.set(x, gy, z);
    tower.x = x;
    tower.z = z;
    tower.team = getPlayerTeam();
    tower.active = true;
    SCENE.add(tower.root);
    state.towers.push(tower);

    state.ready = false;
    state.cd = COOLDOWN;

    if (window.FX) window.FX.message('SENTRY TOWER DEPLOYED', '#88ff66');
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(180, 0.2, 'sawtooth', 0.25, 800);
      window.Sound.tone(360, 0.15, 'square', 0.15, 1500);
    }
  }

  // ---- Placement preview update --------------------------------------------
  function updatePreview() {
    const ms = window.Manager;
    const phase = ms && ms.state ? ms.state.phase : 'idle';
    const player = window.Player;
    const locked = player && player.state && player.state.locked;
    if (phase !== 'playing' || !locked) {
      preview.visible = false;
      return;
    }
    const cam = window.CAMERA;
    const fwd = _tmpDir;
    cam.getWorldDirection(fwd);
    const x = cam.position.x + fwd.x * DEPLOY_RANGE;
    const z = cam.position.z + fwd.z * DEPLOY_RANGE;
    const gy = groundY(x, z);
    preview.position.set(x, gy + 0.05, z);
    preview.visible = true;

    const valid = canPlace(x, z);
    state.placementValid = valid;
    const col = valid ? 0x88ff66 : 0xff4422;
    previewBase.material.color.setHex(col);
    previewRange.material.color.setHex(col);
    previewRange.material.opacity = valid ? 0.06 : 0.04;
  }

  // ---- Input ---------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'g' && e.key !== 'G') return;
    const ms = window.Manager;
    if (!ms || !ms.state || ms.state.phase !== 'playing') return;
    if (!window.Player || !Player.state.locked) return;
    deploy();
  });

  // ---- HUD -----------------------------------------------------------------
  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:16px;bottom:120px;font-size:11px;letter-spacing:2px;color:#88ff66;text-shadow:0 1px 3px #000;z-index:6;';
  const label = document.createElement('div');
  label.textContent = 'SENTRY TOWER [G]';
  hud.appendChild(label);
  const bar = document.createElement('div');
  bar.style.cssText = 'margin-top:3px;width:90px;height:5px;background:rgba(0,0,0,0.5);border:1px solid rgba(120,255,100,0.3);border-radius:3px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#44aa44,#88ff66);transition:width 0.05s;';
  bar.appendChild(fill);
  hud.appendChild(bar);
  const countEl = document.createElement('div');
  countEl.style.cssText = 'margin-top:2px;font-size:9px;color:#66aa55;';
  countEl.textContent = '0 / ' + MAX_TOWERS;
  hud.appendChild(countEl);
  document.getElementById('hud').appendChild(hud);

  function update(dt) {
    if (!state.ready) {
      state.cd -= dt;
      if (state.cd <= 0) {
        state.ready = true;
        state.cd = 0;
        if (window.FX) window.FX.message('SENTRY TOWER READY', '#88ff66');
      }
    }

    for (let i = state.towers.length - 1; i >= 0; i--) {
      updateTower(state.towers[i], dt);
    }

    updatePreview();

    // HUD
    const ready = state.ready;
    fill.style.width = ready ? '100%' : Math.max(0, 100 - (state.cd / COOLDOWN) * 100) + '%';
    fill.style.background = ready
      ? 'linear-gradient(90deg,#44aa44,#88ff66)'
      : 'linear-gradient(90deg,#445533,#667755)';
    label.style.color = ready ? '#88ff66' : '#667755';
    countEl.textContent = state.towers.length + ' / ' + MAX_TOWERS;
  }

  function reset() {
    while (state.towers.length > 0) destroyTower(state.towers[0]);
    state.ready = true;
    state.cd = 0;
  }

  function dispose() {
    reset();
    LEG_GEO.dispose();
    LEG_MAT.dispose();
    PLATFORM_GEO.dispose();
    PLATFORM_MAT.dispose();
    RAIL_GEO.dispose();
    RAIL_MAT.dispose();
    SAND_GEO.dispose();
    SAND_MAT.dispose();
    PIVOT_GEO.dispose();
    PIVOT_MAT.dispose();
    HOUSING_GEO.dispose();
    HOUSING_MAT.dispose();
    BARREL_GEO.dispose();
    BARREL_MAT.dispose();
    SCOPE_GEO.dispose();
    SCOPE_MAT.dispose();
    LENS_GEO.dispose();
    MUZZLE_GEO.dispose();
    TRACER_GEO.dispose();
    SPARK_GEO.dispose();
    HP_RING_GEO.dispose();
    previewBase.geometry.dispose();
    previewBase.material.dispose();
    previewRange.geometry.dispose();
    previewRange.material.dispose();
    SCENE.remove(preview);
  }

  return { init() {}, update, reset, dispose, deploy, state };
})();

window.SentryTower = SentryTower;