// turret.js — FORESTWAR deployable auto-turret: ground-mounted, tracks nearest foe, hitscan fire
const THREE = window.THREE;
const SCENE = window.SCENE;
const Turret = (() => {
  const RANGE = 42;
  const FIRE_RATE = 0.18;
  const DAMAGE = 14;
  const TURRET_HP = 140;
  const DEPLOY_RANGE = 5;
  const COOLDOWN = 32;
  const MAX_ACTIVE = 2;
  const LIFETIME = 60;
  const SWEEP_ARC = 0.78;
  const ROT_SPEED = 4.5;

  const state = { ready: true, cooldownTimer: 0, count: 0 };
  const turrets = [];

  const BASE_GEO = new THREE.CylinderGeometry(0.55, 0.7, 0.35, 10);
  const BASE_MAT = new THREE.MeshStandardMaterial({ color: 0x3a3a2e, roughness: 0.8, metalness: 0.4 });
  const PIVOT_GEO = new THREE.CylinderGeometry(0.3, 0.3, 0.5, 8);
  const PIVOT_MAT = new THREE.MeshStandardMaterial({ color: 0x555544, roughness: 0.7, metalness: 0.5 });
  const BARREL_GEO = new THREE.CylinderGeometry(0.07, 0.07, 1.0, 6);
  BARREL_GEO.rotateX(Math.PI / 2);
  const BARREL_MAT = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.7 });
  const HOUSING_GEO = new THREE.BoxGeometry(0.5, 0.4, 0.6);
  const HOUSING_MAT = new THREE.MeshStandardMaterial({ color: 0x4a4a38, roughness: 0.7, metalness: 0.4 });
  const EYE_GEO = new THREE.SphereGeometry(0.07, 6, 5);
  const EYE_MAT = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  const RING_GEO = new THREE.RingGeometry(RANGE - 0.3, RANGE, 48);
  const RING_MAT = new THREE.MeshBasicMaterial({ color: 0x9fe8a0, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false });
  const SPARK_GEO = new THREE.SphereGeometry(0.1, 4, 3);

  const placementMarker = new THREE.Group();
  const pmBase = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 24), new THREE.MeshBasicMaterial({ color: 0x9fe8a0, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
  pmBase.rotation.x = -Math.PI / 2;
  placementMarker.add(pmBase);
  const pmRing = new THREE.Mesh(RING_GEO.clone(), RING_MAT.clone());
  pmRing.rotation.x = -Math.PI / 2;
  placementMarker.add(pmRing);
  placementMarker.visible = false;
  SCENE.add(placementMarker);

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:16px;bottom:140px;font-size:11px;letter-spacing:2px;color:#9fe8a0;text-shadow:0 1px 3px #000;z-index:6;';
  const label = document.createElement('div');
  label.textContent = 'TURRET [T]';
  hud.appendChild(label);
  const bar = document.createElement('div');
  bar.style.cssText = 'width:150px;height:7px;background:rgba(0,0,0,0.6);border:1px solid rgba(150,200,150,0.4);margin-top:3px;border-radius:3px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#5fd07a,#c9e87a);transition:width 0.1s;';
  bar.appendChild(fill);
  hud.appendChild(bar);
  const status = document.createElement('div');
  status.style.cssText = 'font-size:9px;margin-top:2px;opacity:0.8;';
  status.textContent = 'READY';
  hud.appendChild(status);
  document.getElementById('hud').appendChild(hud);

  function getEnemyList(turretTeam) {
    if (!window.Entities || !Array.isArray(window.Entities.list)) return [];
    return window.Entities.list.filter(e => !e.dead && e.team !== turretTeam);
  }

  function findTarget(pos, team) {
    const enemies = getEnemyList(team);
    let nearest = null;
    let bestDist = RANGE * RANGE;
    for (const e of enemies) {
      const dx = e.mesh.position.x - pos.x;
      const dz = e.mesh.position.z - pos.z;
      const dy = e.mesh.position.y - pos.y;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestDist) { bestDist = d; nearest = e; }
    }
    if (nearest && window.Boss && window.Boss.boss && window.Boss.boss.active) {
      const bd = window.Boss.boss.mesh.position.distanceToSquared(pos);
      if (bd < bestDist) nearest = { mesh: window.Boss.boss.mesh, team: 'deer' };
    }
    return nearest;
  }

  function dealDamage(target, amount) {
    if (target.takeDamage) {
      target.takeDamage(amount, 'hunter');
    } else if (window.Entities && window.Entities.damage) {
      window.Entities.damage(target, amount, 'hunter');
    }
    if (window.Boss && window.Boss.boss && window.Boss.boss.active && target === window.Boss.boss.mesh) {
      window.Boss.damage(amount);
    }
  }

  function fire(t, target) {
    const origin = new THREE.Vector3();
    t.barrel.getWorldPosition(origin);
    const dest = target.mesh.position.clone();
    dest.y += 0.8;
    const dir = dest.clone().sub(origin).normalize();
    const end = origin.clone().addScaledVector(dir, RANGE);
    const ray = new THREE.Raycaster(origin, dir, 0, RANGE);
    let hitPoint = end;
    if (target.mesh) {
      const spheres = [];
      target.mesh.traverse(c => { if (c.isMesh && c.geometry && c.geometry.boundingSphere) spheres.push(c); });
      let bestT = Infinity;
      for (const c of spheres) {
        const sph = c.geometry.boundingSphere.clone();
        sph.applyMatrix4(c.matrixWorld);
        const inter = ray.ray.intersectSphere(sph, new THREE.Vector3());
        if (inter) {
          const dd = origin.distanceToSquared(inter);
          if (dd < bestT) { bestT = dd; hitPoint = inter.clone(); }
        }
      }
    }
    if (window.FX && window.FX.muzzleFlash) window.FX.muzzleFlash(origin, dir);
    if (window.FX && window.FX.tracer) {
      window.FX.tracer(origin, hitPoint);
    } else {
      consttg = new THREE.BufferGeometry().setFromPoints([origin, hitPoint]);
      consttl = new THREE.LineBasicMaterial({ color: 0xffee66, transparent: true, opacity: 0.7 });
      const tr = new THREE.Line(tg, tl);
      SCENE.add(tr);
      setTimeout(() => SCENE.remove(tr), 60);
    }
    if (window.FX && window.FX.bloodBurst) window.FX.bloodBurst(hitPoint, dir.clone().negate());
    if (window.Sound && window.Sound.shot) window.Sound.shot();
    dealDamage(target, DAMAGE);
  }

  function buildTurretMesh() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(BASE_GEO, BASE_MAT);
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);
    const pivot = new THREE.Group();
    pivot.position.y = 0.3;
    g.add(pivot);
    const housing = new THREE.Mesh(HOUSING_GEO, HOUSING_MAT);
    housing.castShadow = true;
    pivot.add(housing);
    const eye = new THREE.Mesh(EYE_GEO, EYE_MAT.clone());
    eye.position.set(0, 0.12, 0.3);
    pivot.add(eye);
    const barrel = new THREE.Mesh(BARREL_GEO, BARREL_MAT);
    barrel.position.set(0, 0.05, 0.5);
    barrel.castShadow = true;
    pivot.add(barrel);
    const ring = new THREE.Mesh(RING_GEO.clone(), RING_MAT.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    g.add(ring);
    g.userData = { pivot, barrel, eye, ring };
    return g;
  }

  function deploy() {
    if (!state.ready) {
      if (window.FX) window.FX.message('TURRET RECHARGING', '#ff6644');
      return;
    }
    if (turrets.length >= MAX_ACTIVE) {
      removeTurret(turrets[0]);
    }
    const cam = window.CAMERA;
    if (!cam) return;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const px = cam.position.x + fwd.x * DEPLOY_RANGE;
    const pz = cam.position.z + fwd.z * DEPLOY_RANGE;
    const gy = window.groundHeight ? window.groundHeight(px, pz) : 0;
    const mesh = buildTurretMesh();
    mesh.position.set(px, gy, pz);
    SCENE.add(mesh);
    const pt = (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
    const team = pt === 'deer' ? 'deer' : 'hunter';
    const t = {
      mesh,
      pivot: mesh.userData.pivot,
      barrel: mesh.userData.barrel,
      eye: mesh.userData.eye,
      ring: mesh.userData.ring,
      team,
      hp: TURRET_HP,
      maxHp: TURRET_HP,
      cd: 0,
      currentYaw: 0,
      targetYaw: 0,
      target: null,
      lifetime: LIFETIME,
      sparkTimer: 0,
      barEl: null,
    };
    const barBg = document.createElement('div');
    barBg.style.cssText = 'position:absolute;width:48px;height:4px;background:rgba(0,0,0,0.7);border:1px solid rgba(150,200,150,0.4);border-radius:2px;overflow:hidden;pointer-events:none;z-index:8;';
    const barFg = document.createElement('div');
    barFg.style.cssText = 'width:100%;height:100%;background:#ff6644;transition:width 0.1s;';
    barBg.appendChild(barFg);
    document.getElementById('hud').appendChild(barBg);
    t.barEl = barBg;
    t.barFg = barFg;
    turrets.push(t);
    state.ready = false;
    state.cooldownTimer = COOLDOWN;
    if (window.FX) window.FX.message('TURRET DEPLOYED', '#9fe8a0');
    if (window.Sound) window.Sound.tone(330, 0.15, 'square', 0.25, 1500);
  }

  function removeTurret(t) {
    if (!t) return;
    SCENE.remove(t.mesh);
    if (t.barEl && t.barEl.parentNode) t.barEl.parentNode.removeChild(t.barEl);
    const idx = turrets.indexOf(t);
    if (idx >= 0) turrets.splice(idx, 1);
  }

  function damageTurret(t, amount) {
    t.hp -= amount;
    t.sparkTimer = 0.15;
    if (t.hp <= 0) {
      if (window.FX && window.FX.explosion) {
        window.FX.explosion(t.mesh.position.clone(), 4);
      }
      if (window.Sound && window.Sound.explosion) window.Sound.explosion();
      removeTurret(t);
    }
  }

  function showPlacement() {
    const cam = window.CAMERA;
    if (!cam) return;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const px = cam.position.x + fwd.x * DEPLOY_RANGE;
    const pz = cam.position.z + fwd.z * DEPLOY_RANGE;
    const gy = window.groundHeight ? window.groundHeight(px, pz) : 0;
    placementMarker.position.set(px, gy + 0.05, pz);
    placementMarker.visible = true;
  }

  function updateBars() {
    const cam = window.CAMERA;
    for (const t of turrets) {
      if (!t.barEl) continue;
      const dx = t.mesh.position.x - cam.position.x;
      const dz = t.mesh.position.z - cam.position.z;
      if (dx * dx + dz * dz > 9000) { t.barEl.style.display = 'none'; continue; }
      t.barEl.style.display = 'block';
      const sp = t.mesh.position.clone();
      sp.y += 1.6;
      sp.project(cam);
      const x = (sp.x * 0.5 + 0.5) * innerWidth - 24;
      const y = (-sp.y * 0.5 + 0.5) * innerHeight - 30;
      t.barEl.style.left = x + 'px';
      t.barEl.style.top = y + 'px';
      t.barFg.style.width = Math.max(0, (t.hp / t.maxHp) * 100) + '%';
    }
  }

  function update(dt) {
    const cam = window.CAMERA;
    if (cam) {
      const fwd = new THREE.Vector3();
      cam.getWorldDirection(fwd);
      if (fwd.y < 0.4) showPlacement();
      else placementMarker.visible = false;
    }
    if (!state.ready) {
      state.cooldownTimer -= dt;
      if (state.cooldownTimer <= 0) {
        state.ready = true;
        if (window.FX) window.FX.message('TURRET READY', '#9fe8a0');
      }
    }
    fill.style.width = state.ready ? '100%' : Math.max(0, 1 - state.cooldownTimer / COOLDOWN) * 100 + '%';
    status.textContent = state.ready ? 'READY' : ('CHARGING ' + Math.ceil(state.cooldownTimer) + 's');
    for (let i = turrets.length - 1; i >= 0; i--) {
      const t = turrets[i];
      t.lifetime -= dt;
      if (t.lifetime <= 0) { removeTurret(t); continue; }
      t.sparkTimer -= dt;
      if (t.sparkTimer <= 0) t.eye.material.color.setHex(0xff2222);
      else t.eye.material.color.setHex(0xffaa22);
      t.target = findTarget(t.mesh.position, t.team);
      if (t.target) {
        const tp = t.target.mesh.position;
        const dx = tp.x - t.mesh.position.x;
        const dz = tp.z - t.mesh.position.z;
        t.targetYaw = Math.atan2(dx, dz);
        let diff = t.targetYaw - t.currentYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        t.currentYaw += Math.sign(diff) * Math.min(Math.abs(diff), ROT_SPEED * dt);
        t.pivot.rotation.y = t.currentYaw;
        const aiming = Math.abs(diff) < SWEEP_ARC * 0.5;
        t.ring.material.opacity = aiming ? 0.18 : 0.08;
        t.cd -= dt;
        if (aiming && t.cd <= 0) {
          fire(t, t.target);
          t.cd = FIRE_RATE;
        }
      } else {
        t.currentYaw += 0.6 * dt;
        t.pivot.rotation.y = t.currentYaw;
        t.ring.material.opacity = 0.05;
        t.cd = Math.max(0, t.cd - dt);
      }
    }
    updateBars();
  }

  function init() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 't' || e.key === 'T') {
        const ph = window.Manager && window.Manager.state ? window.Manager.state.phase : 'idle';
        if (ph === 'playing') deploy();
      }
    });
  }

  return { init, update, deploy, damageTurret, state, get turrets() { return turrets; } };
})();
window.Turret = Turret;