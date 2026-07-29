// chaingun.js — FORESTWAR mounted minigun emplacement: wind-up spinning barrels, extreme fire rate, overheat management
(() => {
const THREE = window.THREE;
const SCENE = window.SCENE;
const CAMERA = window.CAMERA;
const RENDERER = window.RENDERER;
const CONFIG = {
  MOUNT_RANGE: 3.2,
  ROT_ACCEL: 9.0,
  ROT_MAX: 55,
  ROT_DECAY: 4.5,
  FIRE_RATE: 0.028,
  DAMAGE: 11,
  RANGE: 150,
  SPREAD_BASE: 0.012,
  SPREAD_MAX: 0.06,
  SPREAD_PER_SHOT: 0.0028,
  SPREAD_DECAY: 0.6,
  HEAT_PER_SHOT: 0.38,
  HEAT_DECAY: 14,
  HEAT_COOLDOWN_THRESHOLD: 95,
  OVERHEAT_PENALTY: 2.0,
  TRACER_LIFE: 0.05,
  TRACER_POOL: 20,
  SHELL_EJECT_SPEED: 5.0,
  SHELL_LIFE: 0.9,
  SHELL_GRAVITY: 18,
  SHELL_POOL: 30,
  MUZZLE_LIGHT_LIFE: 0.03,
  TRACER_LEN: 4.0,
  MOUNT_LOCK_DIST: 8,
  ROTATE_LERP: 14,
  PITCH_LERP: 14,
  SPIN_AUD_INTERVAL: 0.06,
  SPIN_AUD_RATE: 0.05,
  MAX_PLACEMENT: 4,
  PLACEMENT_RADIUS: 100,
  PLACE_DIST: 5.5,
  SEAT_HEIGHT: 1.45,
};

const state = {
  emplacements: [],
  placementActive: false,
  placementValid: false,
};

const _muzzle = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _target = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const BIPOD_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2a20, roughness: 0.6, metalness: 0.7 });
const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x3a3a2e, roughness: 0.5, metalness: 0.6 });
const BARREL_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1a14, roughness: 0.3, metalness: 0.9 });
const AMMO_BOX_MAT = new THREE.MeshStandardMaterial({ color: 0x4a3a22, roughness: 0.8 });
const SHELL_MAT = new THREE.MeshStandardMaterial({ color: 0xddaa44, roughness: 0.4, metalness: 0.6 });

const BASE_GEO = new THREE.CylinderGeometry(0.55, 0.75, 0.25, 12);
const BIPOD_LEG_GEO = new THREE.CylinderGeometry(0.04, 0.05, 1.1, 5);
BIPOD_LEG_GEO.rotateX(0.4);
const GUN_BODY_GEO = new THREE.BoxGeometry(0.95, 0.32, 0.45);
const HOUSING_GEO = new THREE.BoxGeometry(0.4, 0.34, 0.4);
const BARREL_GEO = new THREE.CylinderGeometry(0.045, 0.045, 1.6, 6);
BARREL_GEO.rotateX(Math.PI / 2);
const BARREL_CLAMP_GEO = new THREE.CylinderGeometry(0.11, 0.11, 0.16, 8);
BARREL_CLAMP_GEO.rotateX(Math.PI / 2);
const AMMO_BOX_GEO = new THREE.BoxGeometry(0.35, 0.25, 0.5);
const HANDLE_GEO = new THREE.BoxGeometry(0.06, 0.22, 0.3);
const SIGHT_GEO = new THREE.BoxGeometry(0.03, 0.12, 0.06);
const SHELL_GEO = new THREE.CylinderGeometry(0.016, 0.016, 0.06, 5);
const TRACER_GEO = new THREE.CylinderGeometry(0.012, 0.003, 1, 4);
TRACER_GEO.rotateX(Math.PI / 2);
const TRACER_MAT = new THREE.MeshBasicMaterial({
  color: 0xffee88, transparent: true, opacity: 0.85,
  blending: THREE.AdditiveBlending, depthWrite: false,
});
const MUZZLE_GEO = new THREE.SphereGeometry(0.16, 6, 5);
const MUZZLE_MAT = new THREE.MeshBasicMaterial({
  color: 0xffdd66, transparent: true, opacity: 0,
  blending: THREE.AdditiveBlending, depthWrite: false,
});

function groundY(x, z) {
  return window.groundHeight ? window.groundHeight(x, z) : 0;
}

function buildEmplacement(x, z) {
  const group = new THREE.Group();
  group.position.set(x, groundY(x, z), z);

  const base = new THREE.Mesh(BASE_GEO, BIPOD_MAT);
  base.castShadow = true;
  base.position.y = 0.12;
  group.add(base);

  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(BIPOD_LEG_GEO, BODY_MAT);
    leg.castShadow = true;
    leg.position.set(sx * 0.35, 0.45, 0.2);
    group.add(leg);
  }

  const pivot = new THREE.Group();
  pivot.position.y = 0.3;
  group.add(pivot);

  const housing = new THREE.Mesh(HOUSING_GEO, BODY_MAT);
  housing.castShadow = true;
  housing.position.y = 0;
  pivot.add(housing);

  const ammoBox = new THREE.Mesh(AMMO_BOX_GEO, AMMO_BOX_MAT);
  ammoBox.castShadow = true;
  ammoBox.position.set(0, -0.1, -0.42);
  pivot.add(ammoBox);

  const grip = new THREE.Mesh(HANDLE_GEO, BIPOD_MAT);
  grip.position.set(0, -0.2, -0.05);
  pivot.add(grip);

  const sight = new THREE.Mesh(SIGHT_GEO, BARREL_MAT);
  sight.position.set(0, 0.24, 0);
  pivot.add(sight);

  const clamp = new THREE.Mesh(BARREL_CLAMP_GEO, BARREL_MAT);
  clamp.position.set(0, 0, 0.55);
  pivot.add(clamp);

  const spinAssembly = new THREE.Group();
  spinAssembly.position.set(0, 0, 0.95);
  pivot.add(spinAssembly);

  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const barrel = new THREE.Mesh(BARREL_GEO, BARREL_MAT);
    barrel.position.set(Math.cos(ang) * 0.07, Math.sin(ang) * 0.07, 0);
    spinAssembly.add(barrel);
  }

  const frontClamp = new THREE.Mesh(BARREL_CLAMP_GEO, BARREL_MAT);
  frontClamp.position.z = 0.75;
  spinAssembly.add(frontClamp);

  const muzzleFlash = new THREE.Mesh(MUZZLE_GEO, MUZZLE_MAT.clone());
  muzzleFlash.position.set(0, 0, 1.75);
  muzzleFlash.visible = false;
  pivot.add(muzzleFlash);

  const muzzleLight = new THREE.PointLight(0xffcc55, 0, 8, 2);
  muzzleLight.position.set(0, 0, 1.9);
  pivot.add(muzzleLight);

  SCENE.add(group);

  const tracers = [];
  for (let i = 0; i < CONFIG.TRACER_POOL; i++) {
    const t = new THREE.Mesh(TRACER_GEO, TRACER_MAT.clone());
    t.visible = false;
    t.frustumCulled = false;
    SCENE.add(t);
    tracers.push({ mesh: t, life: 0, sx: 0, sy: 0, sz: 0, ex: 0, ey: 0, ez: 0 });
  }

  const shells = [];
  for (let i = 0; i < CONFIG.SHELL_POOL; i++) {
    const s = new THREE.Mesh(SHELL_GEO, SHELL_MAT);
    s.visible = false;
    s.frustumCulled = false;
    SCENE.add(s);
    shells.push({ mesh: s, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, vrx: 0, vry: 0, vrz: 0, life: 0, active: false });
  }

  return {
    group, pivot, spinAssembly, muzzleFlash, muzzleLight,
    tracers, tracerIdx: 0,
    shells, shellIdx: 0,
    rotVel: 0,
    fireCd: 0,
    spread: CONFIG.SPREAD_BASE,
    heat: 0,
    overheated: false,
    spinAudTimer: 0,
    active: false,
  };
}

function spawnShell(emp) {
  const slot = emp.shells[emp.shellIdx];
  emp.shellIdx = (emp.shellIdx + 1) % CONFIG.SHELL_POOL;
  emp.pivot.localToWorld(_muzzle.set(0, 0, 0.3));
  slot.mesh.position.copy(_muzzle);
  slot.mesh.position.x += (Math.random() - 0.5) * 0.1;
  slot.mesh.visible = true;
  slot.vx = -2 - Math.random() * 2;
  slot.vy = 2 + Math.random() * 2;
  slot.vz = (Math.random() - 0.5) * 1.5;
  slot.vrx = (Math.random() - 0.5) * 20;
  slot.vry = (Math.random() - 0.5) * 20;
  slot.vrz = (Math.random() - 0.5) * 20;
  slot.life = CONFIG.SHELL_LIFE;
  slot.active = true;
}

function spawnTracer(emp, sx, sy, sz, ex, ey, ez) {
  const slot = emp.tracers[emp.tracerIdx];
  emp.tracerIdx = (emp.tracerIdx + 1) % CONFIG.TRACER_POOL;
  slot.sx = sx; slot.sy = sy; slot.sz = sz;
  slot.ex = ex; slot.ey = ey; slot.ez = ez;
  slot.life = CONFIG.TRACER_LIFE;
  slot.mesh.visible = true;
}

function fire(emp) {
  if (emp.overheated || emp.rotVel < CONFIG.ROT_MAX * 0.5) return;
  emp.pivot.localToWorld(_muzzle.set(0, 0, 1.75));

  CAMERA.getWorldDirection(_camDir);
  _dir.copy(_camDir);
  _dir.x += (Math.random() - 0.5) * emp.spread;
  _dir.y += (Math.random() - 0.5) * emp.spread;
  _dir.z += (Math.random() - 0.5) * emp.spread;
  _dir.normalize();

  _target.copy(_muzzle).addScaledVector(_dir, CONFIG.RANGE);
  _ray.set(_muzzle, _dir);
  _ray.far = CONFIG.RANGE;

  const ents = window.Entities ? window.Entities.list : null;
  const pt = (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  let hitEnt = null;
  let hitDist = CONFIG.RANGE;
  if (ents) {
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.team === pt) continue;
      if (!e.mesh) continue;
      const res = _ray.intersectObject(e.mesh, true);
      if (res.length > 0 && res[0].distance < hitDist) {
        hitDist = res[0].distance;
        hitEnt = e;
      }
    }
  }

  let ex, ey, ez;
  if (hitEnt) {
    ex = _muzzle.x + _dir.x * hitDist;
    ey = _muzzle.y + _dir.y * hitDist;
    ez = _muzzle.z + _dir.z * hitDist;
  } else {
    ex = _target.x; ey = _target.y; ez = _target.z;
  }

  spawnTracer(emp, _muzzle.x, _muzzle.y, _muzzle.z, ex, ey, ez);
  spawnShell(emp);

  if (hitEnt && window.Entities) {
    window.Entities.damage(hitEnt, CONFIG.DAMAGE, _dir, { team: pt, byPlayer: true });
    if (hitEnt.dead && window.KillRewards) {
      window.KillRewards.notify(hitEnt.team);
    }
  }

  emp.muzzleFlash.material.opacity = 1;
  emp.muzzleFlash.scale.setScalar(0.5 + Math.random() * 0.4);
  emp.muzzleLight.intensity = 5;

  emp.spread = Math.min(CONFIG.SPREAD_MAX, emp.spread + CONFIG.SPREAD_PER_SHOT);
  emp.heat = Math.min(100, emp.heat + CONFIG.HEAT_PER_SHOT);

  if (emp.heat >= CONFIG.HEAT_COOLDOWN_THRESHOLD && !emp.overheated) {
    emp.overheated = true;
    if (window.FX) window.FX.message('CHAINGUN OVERHEAT', '#ff6644');
    if (window.Sound) window.Sound.tone(160, 0.3, 'sawtooth', 0.25, 400);
  }

  if (window.Sound && window.Sound.tone) {
    window.Sound.tone(200 + Math.random() * 40, 0.04, 'square', 0.12, 2200);
  }
}

function updateEmplacement(emp, dt, playerMounted) {
  const firing = playerMounted && window.Player && Player.state.locked && window.Player.state.firing;

  if (firing && !emp.overheated) {
    emp.rotVel = Math.min(CONFIG.ROT_MAX, emp.rotVel + CONFIG.ROT_ACCEL * dt);
  } else {
    emp.rotVel = Math.max(0, emp.rotVel - CONFIG.ROT_DECAY * dt);
  }

  emp.spinAssembly.rotation.z += emp.rotVel * dt;

  if (emp.rotVel > CONFIG.ROT_MAX * 0.5) {
    emp.spinAudTimer -= dt;
    if (emp.spinAudTimer <= 0) {
      emp.spinAudTimer = CONFIG.SPIN_AUD_INTERVAL;
      if (window.Sound && window.Sound.tone) {
        window.Sound.tone(80 + emp.rotVel * 2, CONFIG.SPIN_AUD_RATE, 'sawtooth', 0.04, 600);
      }
    }
  }

  if (firing && !emp.overheated) {
    emp.fireCd -= dt;
    while (emp.fireCd <= 0) {
      fire(emp);
      emp.fireCd += CONFIG.FIRE_RATE;
    }
  } else {
    emp.fireCd = Math.max(0, emp.fireCd - dt);
  }

  emp.muzzleFlash.material.opacity = Math.max(0, emp.muzzleFlash.material.opacity - dt * 20);
  emp.muzzleLight.intensity = Math.max(0, emp.muzzleLight.intensity - dt * 100);

  emp.spread = Math.max(CONFIG.SPREAD_BASE, emp.spread - CONFIG.SPREAD_DECAY * dt);

  if (emp.overheated) {
    emp.heat -= CONFIG.HEAT_DECAY * 0.6 * dt;
    if (emp.heat <= 0) {
      emp.overheated = false;
      emp.heat = 0;
    }
  } else if (!firing) {
    emp.heat = Math.max(0, emp.heat - CONFIG.HEAT_DECAY * dt);
  }

  for (let i = 0; i < emp.tracers.length; i++) {
    const t = emp.tracers[i];
    if (t.life <= 0) {
      if (t.mesh.visible) t.mesh.visible = false;
      continue;
    }
    t.life -= dt;
    t.mesh.position.set((t.sx + t.ex) * 0.5, (t.sy + t.ey) * 0.5, (t.sz + t.ez) * 0.5);
    const dx = t.ex - t.sx, dy = t.ey - t.sy, dz = t.ez - t.sz;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    t.mesh.scale.set(1, 1, len);
    if (len > 0.001) t.mesh.lookAt(t.ex, t.ey, t.ez);
    t.mesh.material.opacity = Math.max(0, (t.life / CONFIG.TRACER_LIFE) * 0.85);
  }

  for (let i = 0; i < emp.shells.length; i++) {
    const s = emp.shells[i];
    if (!s.active) continue;
    s.life -= dt;
    if (s.life <= 0) {
      s.mesh.visible = false;
      s.active = false;
      continue;
    }
    s.vy -= CONFIG.SHELL_GRAVITY * dt;
    s.mesh.position.x += s.vx * dt;
    s.mesh.position.y += s.vy * dt;
    s.mesh.position.z += s.vz * dt;
    const gy = groundY(s.mesh.position.x, s.mesh.position.z);
    if (s.mesh.position.y < gy + 0.03) {
      s.mesh.position.y = gy + 0.03;
      s.vy *= -0.3;
      s.vx *= 0.5;
      s.vz *= 0.5;
      s.vrx *= 0.5;
      s.vry *= 0.5;
      s.vrz *= 0.5;
    }
    s.mesh.rotation.x += s.vrx * dt;
    s.mesh.rotation.y += s.vry * dt;
    s.mesh.rotation.z += s.vrz * dt;
    s.mesh.material.opacity = Math.min(1, s.life * 2.5);
  }
}

// ---- HUD ----
const hud = document.getElementById('hud');
const hudRoot = document.createElement('div');
hudRoot.style.cssText = 'position:absolute;left:50%;bottom:80px;transform:translateX(-50%);'
  + 'width:340px;pointer-events:none;z-index:6;opacity:0;transition:opacity 0.2s;';
if (hud) hud.appendChild(hudRoot);

const heatLabel = document.createElement('div');
heatLabel.style.cssText = 'font-size:10px;letter-spacing:4px;color:#ffaa44;text-align:center;'
  + 'margin-bottom:4px;text-shadow:0 1px 3px #000;font-weight:bold;';
heatLabel.textContent = 'BARREL HEAT';
hudRoot.appendChild(heatLabel);

const heatBar = document.createElement('div');
heatBar.style.cssText = 'width:100%;height:10px;background:rgba(0,0,0,0.6);'
  + 'border:1px solid rgba(255,140,40,0.4);border-radius:5px;overflow:hidden;';
const heatFill = document.createElement('div');
heatFill.style.cssText = 'width:0%;height:100%;background:linear-gradient(90deg,#44aa44,#ffaa22,#ff2222);'
  + 'border-radius:4px;transition:width 0.04s;';
heatBar.appendChild(heatFill);
hudRoot.appendChild(heatBar);

const spinRow = document.createElement('div');
spinRow.style.cssText = 'margin-top:6px;display:flex;align-items:center;gap:8px;';
hudRoot.appendChild(spinRow);

const spinLabel = document.createElement('div');
spinLabel.style.cssText = 'font-size:9px;letter-spacing:2px;color:#998866;min-width:40px;text-shadow:0 1px 3px #000;';
spinLabel.textContent = 'SPIN';
spinRow.appendChild(spinLabel);

const spinBar = document.createElement('div');
spinBar.style.cssText = 'flex:1;height:5px;background:rgba(0,0,0,0.55);'
  + 'border:1px solid rgba(150,130,80,0.3);border-radius:3px;overflow:hidden;';
const spinFill = document.createElement('div');
spinFill.style.cssText = 'width:0%;height:100%;background:linear-gradient(90deg,#554422,#ffcc66);border-radius:2px;transition:width 0.04s;';
spinBar.appendChild(spinFill);
spinRow.appendChild(spinBar);

// ---- Placement preview ----
const previewGroup = new THREE.Group();
const pmBase = new THREE.Mesh(
  new THREE.RingGeometry(0.5, 0.8, 24),
  new THREE.MeshBasicMaterial({ color: 0x88cc66, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })
);
pmBase.rotation.x = -Math.PI / 2;
previewGroup.add(pmBase);
const pmBad = new THREE.Mesh(
  new THREE.RingGeometry(0.5, 0.8, 24),
  new THREE.MeshBasicMaterial({ color: 0xcc4444, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })
);
pmBad.rotation.x = -Math.PI / 2;
pmBad.visible = false;
previewGroup.add(pmBad);
previewGroup.visible = false;
SCENE.add(previewGroup);

const placementHint = document.createElement('div');
placementHint.style.cssText = 'position:absolute;top:60%;left:50%;transform:translateX(-50%);'
  + 'font-size:14px;letter-spacing:3px;color:#88cc66;text-shadow:0 0 8px rgba(0,0,0,0.8),0 2px 4px #000;'
  + 'opacity:0;transition:opacity 0.2s;pointer-events:none;z-index:6;text-align:center;';
placementHint.innerHTML = 'CHAINGUN EMPLACEMENT<br><span style="font-size:11px;letter-spacing:1px;color:#aaa;">[SCROLL] rotate &nbsp; [LMB] place &nbsp; [RMB] cancel</span>';
if (hud) hud.appendChild(placementHint);

function checkPlacementValid(x, z) {
  const trees = window.TREES || [];
  for (let i = 0; i < trees.length; i++) {
    const t = trees[i];
    const dx = x - t.x, dz = z - t.z;
    if (dx * dx + dz * dz < (t.r + 1.2) * (t.r + 1.2)) return false;
  }
  const wc = window.worldColliders || [];
  for (let i = 0; i < wc.length; i++) {
    const c = wc[i];
    const dx = x - c.x, dz = z - c.z;
    if (dx * dx + dz * dz < (c.r + 1.0) * (c.r + 1.0)) return false;
  }
  for (let i = 0; i < state.emplacements.length; i++) {
    const e = state.emplacements[i];
    const dx = x - e.group.position.x, dz = z - e.group.position.z;
    if (dx * dx + dz * dz < 16) return false;
  }
  return true;
}

function getAimGround() {
  if (!CAMERA) return null;
  CAMERA.getWorldDirection(_camDir);
  _ray.set(CAMERA.position, _camDir);
  _ray.far = CONFIG.PLACEMENT_RADIUS;
  const hit = _ray.ray.intersectPlane(_ground, _target);
  return hit ? _target : null;
}

let scrollAngle = 0;
function updatePlacement() {
  if (!state.placementActive) {
    previewGroup.visible = false;
    placementHint.style.opacity = '0';
    return;
  }
  const pos = getAimGround();
  if (!pos) {
    previewGroup.visible = false;
    return;
  }
  previewGroup.visible = true;
  previewGroup.position.set(pos.x, groundY(pos.x, pos.z) + 0.05, pos.z);
  previewGroup.rotation.y = scrollAngle;
  state.placementValid = checkPlacementValid(pos.x, pos.z);
  pmBase.visible = state.placementValid;
  pmBad.visible = !state.placementValid;
  placementHint.style.opacity = '1';
}

function startPlacement() {
  if (state.emplacements.length >= CONFIG.MAX_PLACEMENT) {
    if (window.FX) window.FX.message('MAX CHAINGUNS DEPLOYED', '#ff6644');
    return;
  }
  const ms = window.Manager && window.Manager.state ? window.Manager.state : null;
  if (!ms || ms.phase !== 'playing') return;
  state.placementActive = true;
  scrollAngle = 0;
  if (window.Player && Player.state) Player.state.locked = false;
  if (document.exitPointerLock) document.exitPointerLock();
}

function confirmPlacement() {
  if (!state.placementActive) return;
  const pos = getAimGround();
  if (!pos || !state.placementValid) {
    if (window.Sound) window.Sound.tone(120, 0.1, 'square', 0.15, 600);
    return;
  }
  const emp = buildEmplacement(pos.x, pos.z);
  emp.group.rotation.y = scrollAngle;
  state.emplacements.push(emp);
  state.placementActive = false;
  previewGroup.visible = false;
  placementHint.style.opacity = '0';
  if (window.Sound) {
    window.Sound.tone(330, 0.15, 'square', 0.2, 1500);
    window.Sound.tone(440, 0.1, 'square', 0.15, 1800);
  }
  if (window.FX) window.FX.message('CHAINGUN DEPLOYED', '#88cc66');
  if (RENDERER && RENDERER.domElement.requestPointerLock) {
    RENDERER.domElement.requestPointerLock();
  }
}

function cancelPlacement() {
  if (!state.placementActive) return;
  state.placementActive = false;
  previewGroup.visible = false;
  placementHint.style.opacity = '0';
  if (RENDERER && RENDERER.domElement.requestPointerLock) {
    RENDERER.domElement.requestPointerLock();
  }
}

// ---- Input ----
// Instant deploy (turret-style): drop a chaingun a few metres in front of the
// operator, facing the way they're looking. Avoids the broken unlocked-cursor
// placement flow and matches how beacons/turrets are fielded.
function deployInstant() {
  const ms = window.Manager && window.Manager.state ? window.Manager.state : null;
  if (!ms || ms.phase !== 'playing' || mounted) return;
  if (state.emplacements.length >= CONFIG.MAX_PLACEMENT) {
    if (window.FX) window.FX.message('MAX CHAINGUNS DEPLOYED (' + CONFIG.MAX_PLACEMENT + ')', '#ff6644');
    if (window.Sound) window.Sound.tone(120, 0.1, 'square', 0.15, 600);
    return;
  }
  if (!CAMERA) return;
  CAMERA.getWorldDirection(_camDir);
  const fx = _camDir.x, fz = _camDir.z;
  const fl = Math.hypot(fx, fz) || 1;
  let dist = CONFIG.PLACE_DIST;
  let px = CAMERA.position.x + (fx / fl) * dist;
  let pz = CAMERA.position.z + (fz / fl) * dist;
  let tries = 0;
  while (!checkPlacementValid(px, pz) && tries < 10) {
    dist = Math.max(2, dist - 1.0);
    px = CAMERA.position.x + (fx / fl) * dist;
    pz = CAMERA.position.z + (fz / fl) * dist;
    tries++;
  }
  if (!checkPlacementValid(px, pz)) {
    if (window.FX) window.FX.message('NO CLEAR GROUND FOR CHAINGUN', '#ff6644');
    if (window.Sound) window.Sound.tone(120, 0.1, 'square', 0.15, 600);
    return;
  }
  const emp = buildEmplacement(px, pz);
  emp.group.rotation.y = Math.atan2(fx, fz);
  state.emplacements.push(emp);
  if (window.Sound) {
    window.Sound.tone(330, 0.15, 'square', 0.2, 1500);
    window.Sound.tone(440, 0.1, 'square', 0.15, 1800);
  }
  if (window.FX) window.FX.message('CHAINGUN DEPLOYED — APPROACH & [E] MOUNT', '#88cc66');
}

window.addEventListener('keydown', (e) => {
  if (e.key !== 'z' && e.key !== 'Z') return;
  deployInstant();
});

window.addEventListener('mousedown', (e) => {
  if (!state.placementActive) return;
  if (e.button === 0) {
    confirmPlacement();
  } else if (e.button === 2) {
    cancelPlacement();
  }
});

window.addEventListener('contextmenu', (e) => {
  if (state.placementActive) e.preventDefault();
});

window.addEventListener('wheel', (e) => {
  if (!state.placementActive) return;
  e.preventDefault();
  scrollAngle += e.deltaY > 0 ? 0.2 : -0.2;
}, { passive: false });

let mounted = null;
function tryMount() {
  if (!CAMERA) return;
  // Don't hijack the vehicle's interact key while driving.
  if (window.Vehicle && window.Vehicle.isInVehicle && window.Vehicle.isInVehicle()) return;
  for (let i = 0; i < state.emplacements.length; i++) {
    const emp = state.emplacements[i];
    const dx = emp.group.position.x - CAMERA.position.x;
    const dz = emp.group.position.z - CAMERA.position.z;
    if (dx * dx + dz * dz < CONFIG.MOUNT_RANGE * CONFIG.MOUNT_RANGE) {
      mounted = emp;
      emp.active = true;
      hudRoot.style.opacity = '1';
      if (window.Player && Player.state) {
        Player.state.frozen = true;
        Player.state.locked = true;
      }
      if (RENDERER && RENDERER.domElement.requestPointerLock) RENDERER.domElement.requestPointerLock();
      if (window.FX) window.FX.message('MOUNTED — [LMB] FIRE · [E] DISMOUNT', '#ffaa44');
      return;
    }
  }
}

function dismount() {
  if (!mounted) return;
  mounted.active = false;
  mounted = null;
  hudRoot.style.opacity = '0';
  if (window.Player && Player.state) Player.state.frozen = false;
}

window.addEventListener('keydown', (e) => {
  if (e.key !== 'e' && e.key !== 'E') return;
  if (state.placementActive) return; // don't fight the placement cursor
  const ms = window.Manager && window.Manager.state ? window.Manager.state : null;
  if (!ms || ms.phase !== 'playing') return;
  if (mounted) {
    dismount();
  } else {
    tryMount();
  }
});

function update(dt) {
  updatePlacement();

  // Auto-dismount if the round ends or the operator goes down.
  const ms = window.Manager && window.Manager.state ? window.Manager.state : null;
  if (mounted && (!ms || ms.phase !== 'playing' || !ms.playerAlive)) {
    dismount();
  }

  for (let i = 0; i < state.emplacements.length; i++) {
    updateEmplacement(state.emplacements[i], dt, state.emplacements[i] === mounted);
  }

  if (mounted) {
    // Pin the operator to the gun seat so it reads as a true emplacement.
    const g = mounted.group.position;
    CAMERA.position.set(g.x, g.y + CONFIG.SEAT_HEIGHT, g.z);
    // Swing the barrels to track where the operator is aiming.
    if (window.Player && Player.state) {
      const targetYaw = Player.state.yaw + Math.PI - mounted.group.rotation.y;
      let dy = targetYaw - mounted.pivot.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      mounted.pivot.rotation.y += dy * Math.min(1, CONFIG.ROTATE_LERP * dt);
      const targetPitch = -Player.state.pitch;
      mounted.pivot.rotation.x += (targetPitch - mounted.pivot.rotation.x) * Math.min(1, CONFIG.PITCH_LERP * dt);
    }
    heatFill.style.width = Math.min(100, mounted.heat) + '%';
    spinFill.style.width = Math.min(100, (mounted.rotVel / CONFIG.ROT_MAX) * 100) + '%';
    if (mounted.overheated) {
      heatLabel.textContent = '⚠ OVERHEATED';
      heatLabel.style.color = '#ff2222';
    } else {
      heatLabel.textContent = 'BARREL HEAT';
      heatLabel.style.color = '#ffaa44';
    }
  }
}

function reset() {
  for (let i = 0; i < state.emplacements.length; i++) {
    const emp = state.emplacements[i];
    SCENE.remove(emp.group);
    for (let j = 0; j < emp.tracers.length; j++) SCENE.remove(emp.tracers[j].mesh);
    for (let j = 0; j < emp.shells.length; j++) SCENE.remove(emp.shells[j].mesh);
  }
  state.emplacements = [];
  state.placementActive = false;
  mounted = null;
  hudRoot.style.opacity = '0';
  previewGroup.visible = false;
  placementHint.style.opacity = '0';
  if (window.Player && Player.state) Player.state.frozen = false;
}

window.Chaingun = { update, reset, state, dismount, isMounted: () => mounted !== null };
return window.Chaingun;
})();