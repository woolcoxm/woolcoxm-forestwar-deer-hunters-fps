// game.js — FORESTWAR core engine: forest, FPS controller, rifle, rocket launcher
const THREE = window.THREE;
const SCENE = new THREE.Scene();
const FOG = new THREE.FogExp2(0x1a2a18, 0.018);
SCENE.fog = FOG;
SCENE.background = new THREE.Color(0x1a2a18);

const CAMERA = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 600);
CAMERA.position.set(0, 1.7, 0);

const RENDERER = new THREE.WebGLRenderer({ antialias: true });
RENDERER.setPixelRatio(Math.min(devicePixelRatio, 2));
RENDERER.setSize(innerWidth, innerHeight);
RENDERER.shadowMap.enabled = true;
RENDERER.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(RENDERER.domElement);

const SKY_LIGHT = new THREE.HemisphereLight(0xbfd8c0, 0x33402b, 0.55);
SCENE.add(SKY_LIGHT);
const SUN = new THREE.DirectionalLight(0xfff2d0, 1.1);
SUN.position.set(40, 80, 30);
SUN.castShadow = true;
SUN.shadow.mapSize.set(2048, 2048);
SUN.shadow.camera.near = 1;
SUN.shadow.camera.far = 300;
SUN.shadow.camera.left = -120;
SUN.shadow.camera.right = 120;
SUN.shadow.camera.top = 120;
SUN.shadow.camera.bottom = -120;
SUN.shadow.bias = -0.0004;
SCENE.add(SUN);
const SUN_TARGET = new THREE.Object3D();
SCENE.add(SUN_TARGET);
SUN.target = SUN_TARGET;

// --- Forest floor ---
const GROUND_GEO = new THREE.PlaneGeometry(400, 400, 80, 80);
const POS = GROUND_GEO.attributes.position;
for (let i = 0; i < POS.count; i++) {
  const x = POS.getX(i), y = POS.getY(i);
  const h = Math.sin(x * 0.08) * Math.cos(y * 0.07) * 0.6 + Math.sin(x * 0.3 + y * 0.2) * 0.25;
  POS.setZ(i, h);
}
GROUND_GEO.computeVertexNormals();
const GROUND = new THREE.Mesh(GROUND_GEO, new THREE.MeshStandardMaterial({ color: 0x2c3a22, roughness: 1 }));
GROUND.rotation.x = -Math.PI / 2;
GROUND.receiveShadow = true;
SCENE.add(GROUND);

function groundHeight(x, z) {
  return Math.sin(x * 0.08) * Math.cos(z * 0.07) * 0.6 + Math.sin(x * 0.3 + z * 0.2) * 0.25;
}
window.groundHeight = groundHeight;

// --- Trees with collision ---
const TREES = [];
const TRUNK_GEO = new THREE.CylinderGeometry(0.3, 0.55, 8, 7);
const TRUNK_MAT = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 });
const LEAF_GEO = new THREE.IcosahedronGeometry(3.2, 1);
const LEAF_MAT = new THREE.MeshStandardMaterial({ color: 0x2f4a26, roughness: 0.85, flatShading: true });
for (let i = 0; i < 140; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 6 + Math.random() * 150;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const trunk = new THREE.Mesh(TRUNK_GEO, TRUNK_MAT);
  trunk.position.set(x, groundHeight(x, z) + 4, z);
  trunk.castShadow = true;
  SCENE.add(trunk);
  const leaves = new THREE.Mesh(LEAF_GEO, LEAF_MAT);
  leaves.position.set(x, groundHeight(x, z) + 9, z);
  leaves.scale.setScalar(0.8 + Math.random() * 0.7);
  leaves.rotation.y = Math.random() * Math.PI;
  leaves.castShadow = true;
  SCENE.add(leaves);
  TREES.push({ x, z, r: 0.6 });
}
window.TREES = TREES;

// --- Input ---
const KEYS = {};
window.addEventListener('keydown', (e) => {
  KEYS[e.code] = true;
  if (e.code === 'Digit2') Weapons.toggle();
});
window.addEventListener('keyup', (e) => { KEYS[e.code] = false; });

let pointerLocked = false;
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === RENDERER.domElement;
});
window.addEventListener('click', () => {
  if (window.Manager && window.Manager.state.phase === 'playing') {
    if (!pointerLocked) RENDERER.domElement.requestPointerLock();
    else Weapons.tryFire();
  }
});

// --- Mouse look ---
let yaw = 0, pitch = 0;
document.addEventListener('mousemove', (e) => {
  if (!pointerLocked) return;
  yaw -= e.movementX * 0.0022;
  pitch -= e.movementY * 0.0022;
  pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch));
});

// --- Player state ---
const PLAYER = {
  pos: new THREE.Vector3(0, 1.7, 0),
  vel: new THREE.Vector3(),
  onGround: true,
  hp: 100,
  radius: 0.4,
};

const WEAPON_SLOTS = [
  { name: 'rifle', dmg: 18, cd: 0.13, ammo: 90, reserve: 180, mag: 30, reloadT: 0, spread: 0.012 },
  { name: 'rocket', dmg: 90, cd: 1.2, ammo: 6, reserve: 12, mag: 1, reloadT: 0, splash: 7 },
];
let currentSlot = 0;

const Weapons = {
  current() { return WEAPON_SLOTS[currentSlot]; },
  toggle() {
    if (currentSlot === 0) currentSlot = 1;
    else currentSlot = 0;
    this.refreshHud();
  },
  refreshHud() {
    const w = this.current();
    const slot = document.getElementById('weap');
    if (slot) slot.textContent = w.name.toUpperCase() + ' ' + w.ammo + '/' + w.reserve;
  },
  canFire() {
    const w = this.current();
    return w.ammo > 0 && w.reloadT <= 0 && this.cooldown <= 0;
  },
  cooldown: 0,
  tryFire() {
    if (!this.canFire()) return;
    const w = this.current();
    w.ammo--;
    this.cooldown = w.cd;
    this.refreshHud();
    if (w.name === 'rocket') {
      const camDir = new THREE.Vector3();
      CAMERA.getWorldDirection(camDir);
      const origin = new THREE.Vector3();
      CAMERA.getWorldPosition(origin);
      Rockets.launch(origin, camDir);
    } else {
      fireRaycast();
    }
  },
  tick(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    for (const w of WEAPON_SLOTS) {
      if (w.reloadT > 0) w.reloadT -= dt;
      if (w.ammo < w.mag && w.reserve > 0 && w.reloadT <= 0 && (w.name === 'rifle' && w.ammo === 0)) {
        const need = w.mag - w.ammo;
        const take = Math.min(need, w.reserve);
        w.ammo += take;
        w.reserve -= take;
      }
    }
  }
};
window.Weapons = Weapons;

// --- Raycast rifle ---
const _ray = new THREE.Raycaster();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _hitList = [];
function fireRaycast() {
  CAMERA.getWorldPosition(_origin);
  CAMERA.getWorldDirection(_dir);
  _dir.x += (Math.random() - 0.5) * Weapons.current().spread;
  _dir.y += (Math.random() - 0.5) * Weapons.current().spread;
  _dir.normalize();
  _ray.set(_origin, _dir);
  _ray.far = 200;
  _hitList.length = 0;
  let closest = null;
  let closestDist = Infinity;
  if (window.Entities) {
    for (const e of window.Entities.list) {
      if (e.dead || e.team === window.Manager.state.playerTeam) continue;
      const hit = _ray.ray.distanceToPoint(e.mesh.position);
      if (hit < 1.0) {
        const proj = new THREE.Vector3().subVectors(e.mesh.position, _origin).dot(_dir);
        if (proj > 0 && proj < closestDist) { closestDist = proj; closest = e; }
      }
    }
  }
  if (closest) {
    window.Entities.damage(closest, Weapons.current().dmg, _dir);
  }
  if (window.FX) window.FX.muzzleFlash(_origin, _dir);
}

// --- Rockets ---
const Rockets = (() => {
  const rockets = [];
  const GEO = new THREE.CapsuleGeometry(0.12, 0.4, 4, 6);
  const MAT = new THREE.MeshStandardMaterial({ color: 0x664433, emissive: 0x553311, emissiveIntensity: 0.5 });
  const SMOKE_GEO = new THREE.SphereGeometry(0.3, 5, 4);
  const SMOKE_MAT = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.5 });
  const active = [];
  function launch(origin, dir) {
    const mesh = new THREE.Mesh(GEO, MAT);
    mesh.position.copy(origin);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
    SCENE.add(mesh);
    const light = new THREE.PointLight(0xff8844, 3, 10, 2);
    mesh.add(light);
    rockets.push({ mesh, vel: dir.clone().normalize().multiplyScalar(60), life: 4 });
    if (window.FX) window.FX.muzzleFlash(origin, dir);
    if (window.Sound) window.Sound.rocket();
  }
  function tick(dt) {
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.life -= dt;
      r.mesh.position.addScaledVector(r.vel, dt);
      r.mesh.rotateZ(dt * 8);
      const s = new THREE.Mesh(SMOKE_GEO, SMOKE_MAT.clone());
      s.position.copy(r.mesh.position);
      s.position.y -= 0.3;
      s.userData = { life: 1.0, max: 1.0 };
      SCENE.add(s);
      active.push(s);
      const gy = groundHeight(r.mesh.position.x, r.mesh.position.z);
      if (r.mesh.position.y <= gy + 0.3 || r.life <= 0) {
        explode(r.mesh.position.clone());
        SCENE.remove(r.mesh);
        rockets.splice(i, 1);
      } else if (window.Entities) {
        for (const e of window.Entities.list) {
          if (e.dead || e.team === window.Manager.state.playerTeam) continue;
          if (r.mesh.position.distanceTo(e.mesh.position) < 1.5) {
            explode(r.mesh.position.clone());
            SCENE.remove(r.mesh);
            rockets.splice(i, 1);
            break;
          }
        }
      }
    }
    for (let i = active.length - 1; i >= 0; i--) {
      const s = active[i];
      s.userData.life -= dt;
      s.material.opacity = 0.5 * (s.userData.life / s.userData.max);
      s.scale.setScalar(1 + (1 - s.userData.life / s.userData.max) * 2);
      if (s.userData.life <= 0) { SCENE.remove(s); active.splice(i, 1); }
    }
  }
  function explode(pos) {
    if (window.Entities) {
      for (const e of window.Entities.list) {
        if (e.dead || e.team === window.Manager.state.playerTeam) continue;
        const d = pos.distanceTo(e.mesh.position);
        if (d < Weapons.current().splash) {
          const dmg = Weapons.current().dmg * (1 - d / Weapons.current().splash);
          const dir = new THREE.Vector3().subVectors(e.mesh.position, pos).normalize();
          window.Entities.damage(e, dmg, dir);
        }
      }
    }
    if (window.FX) {
      window.FX.muzzleFlash(pos, new THREE.Vector3(0,1,0));
      window.FX.bloodBurst(pos, new THREE.Vector3(0,1,0));
    }
    if (window.Sound) window.Sound.explode();
  }
  return { launch, tick, get active() { return active; } };
})();
window.Rockets = Rockets;

// --- Player movement & collisions ---
const GRAVITY = -22;
const MOVE_SPEED = 7;
const JUMP = 8;

function tryMove(dx, dz) {
  const r = PLAYER.radius;
  for (const t of TREES) {
    const ddx = PLAYER.pos.x + dx - t.x, ddz = PLAYER.pos.z + dz - t.z;
    if (ddx * ddx + ddz * ddz < (t.r + r) * (t.r + r)) return false;
  }
  if (window.worldColliders) {
    for (const c of window.worldColliders) {
      const ddx = PLAYER.pos.x + dx - c.x, ddz = PLAYER.pos.z + dz - c.z;
      if (ddx * ddx + ddz * ddz < (c.r + r) * (c.r + r)) return false;
    }
  }
  return true;
}

let lastTime = performance.now();
function loop() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (window.Manager && window.Manager.state.phase === 'playing') {
    update(dt);
  }
  RENDERER.render(SCENE, CAMERA);
  requestAnimationFrame(loop);
}

function update(dt) {
  Weapons.tick(dt);
  Rockets.tick(dt);
  CAMERA.rotation.order = 'YXZ';
  CAMERA.rotation.y = yaw;
  CAMERA.rotation.x = pitch;
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const move = new THREE.Vector3();
  if (KEYS['KeyW']) move.add(forward);
  if (KEYS['KeyS']) move.sub(forward);
  if (KEYS['KeyD']) move.add(right);
  if (KEYS['KeyA']) move.sub(right);
  if (move.lengthSq() > 0) move.normalize();
  PLAYER.vel.x = move.x * MOVE_SPEED;
  PLAYER.vel.z = move.z * MOVE_SPEED;
  PLAYER.vel.y += GRAVITY * dt;
  if (PLAYER.vel.y < -30) PLAYER.vel.y = -30;
  if (tryMove(PLAYER.vel.x * dt, 0)) PLAYER.pos.x += PLAYER.vel.x * dt;
  if (tryMove(0, PLAYER.vel.z * dt)) PLAYER.pos.z += PLAYER.vel.z * dt;
  PLAYER.pos.y += PLAYER.vel.y * dt;
  const gy = groundHeight(PLAYER.pos.x, PLAYER.pos.z) + 1.7;
  if (PLAYER.pos.y <= gy) {
    PLAYER.pos.y = gy;
    PLAYER.vel.y = 0;
    PLAYER.onGround = true;
  } else PLAYER.onGround = false;
  if (KEYS['Space'] && PLAYER.onGround) {
    PLAYER.vel.y = JUMP;
    PLAYER.onGround = false;
  }
  if (window.Manager.state.playerAlive) {
    CAMERA.position.lerp(PLAYER.pos, 0.5);
    if (window.FX) {
      const s = window.FX.getShake();
      CAMERA.position.x += s.x;
      CAMERA.position.y += s.y;
    }
  }
  if (window.Entities) window.Entities.tick(dt);
  if (window.Objectives) window.Objectives.tick(dt);
  if (window.Pickups) window.Pickups.tick(dt);
  if (window.Sky) window.Sky.tick(dt);
  if (window.Manager) window.Manager.tick(dt);
  Weapons.refreshHud();
}

window.addEventListener('resize', () => {
  CAMERA.aspect = innerWidth / innerHeight;
  CAMERA.updateProjectionMatrix();
  RENDERER.setSize(innerWidth, innerHeight);
});

loop();