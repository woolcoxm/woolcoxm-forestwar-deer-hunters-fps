// vehicle.js — FORESTWAR jeep: enter/exit, driving physics, collision, tire animation, ramming damage
const Vehicle = (() => {
  const THREE = window.THREE;
  const SCENE = window.SCENE;

  const DRIVE = 28;
  const REVERSE = 14;
  const BRAKE = 45;
  const FRICTION = 14;
  const DRAG = 0.97;
  const MAX_SPEED = 34;
  const TURN_RATE = 1.6;
  const RAM_DAMAGE = 65;
  const RAM_RADIUS = 2.6;

  const WHEEL_GEO = new THREE.CylinderGeometry(0.55, 0.55, 0.38, 12);
  const WHEEL_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x4a5e3a, roughness: 0.7, metalness: 0.3 });
  const TRIM_MAT = new THREE.MeshStandardMaterial({ color: 0x2a3a22, roughness: 0.8 });
  const GRILL_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.6 });
  const GLASS_MAT = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.2, metalness: 0.8, transparent: true, opacity: 0.55 });
  const LIGHT_MAT = new THREE.MeshBasicMaterial({ color: 0xffee88 });
  const ROLL_MAT = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, roughness: 0.9 });

  const wheels = [];
  const spinRate = [0, 0, 0, 0];

  function buildJeep() {
    const jeep = new THREE.Group();
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 4.2), BODY_MAT);
    chassis.castShadow = true;
    chassis.position.y = 0.85;
    jeep.add(chassis);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 1.3), TRIM_MAT);
    hood.castShadow = true;
    hood.position.set(0, 1.0, 1.5);
    jeep.add(hood);
    const grill = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.1), GRILL_MAT);
    grill.position.set(0, 1.0, 2.15);
    jeep.add(grill);
    for (const sx of [-1, 1]) {
      const light = new THREE.Mesh(new THREE.CircleGeometry(0.18, 10), LIGHT_MAT);
      light.position.set(sx * 0.6, 1.0, 2.2);
      light.rotation.y = sx * 0.1;
      jeep.add(light);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.12, 2.0), BODY_MAT);
    roof.castShadow = true;
    roof.position.set(0, 1.65, 0.2);
    jeep.add(roof);
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 0.7), GLASS_MAT);
    windshield.position.set(0, 1.3, 1.15);
    windshield.rotation.x = -0.35;
    jeep.add(windshield);
    for (const sx of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), GLASS_MAT);
      door.position.set(sx * 0.92, 1.25, 0.3);
      door.rotation.y = sx * Math.PI / 2;
      jeep.add(door);
    }
    const rear = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.7), GLASS_MAT);
    rear.position.set(0, 1.3, -0.8);
    rear.rotation.y = Math.PI;
    jeep.add(rear);
    const rollbar1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), ROLL_MAT);
    rollbar1.position.set(-0.7, 1.5, -0.6);
    jeep.add(rollbar1);
    const rollbar2 = rollbar1.clone();
    rollbar2.position.x = 0.7;
    jeep.add(rollbar2);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.3, 0.3), TRIM_MAT);
    bumper.position.set(0, 0.6, 2.1);
    jeep.add(bumper);
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6), GRILL_MAT);
    exhaust.rotation.z = Math.PI / 2;
    exhaust.position.set(0.9, 0.5, -1.8);
    jeep.add(exhaust);
    const positions = [[-1.0, 1.5], [1.0, 1.5], [-1.0, -1.5], [1.0, -1.5]];
    for (let i = 0; i < 4; i++) {
      const wheel = new THREE.Mesh(WHEEL_GEO, WHEEL_MAT);
      wheel.castShadow = true;
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(positions[i][0], 0.55, positions[i][1]);
      jeep.add(wheel);
      wheels.push(wheel);
    }
    return jeep;
  }

  const jeep = buildJeep();
  jeep.position.set(8, 0, 8);
  jeep.rotation.y = 0.5;
  SCENE.add(jeep);
  jeep.visible = false;
  jeep.userData.spawned = true;

  const state = {
    inVehicle: false,
    speed: 0,
    steerAngle: 0,
    health: 100,
    engineOn: false,
    camYaw: 0,
    camPitch: 0.35,
    camDist: 8,
  };

  const playerState = window.Player ? window.Player.state : null;

  const camTarget = new THREE.Vector3();

  function isNearJeep() {
    if (!playerState) return false;
    const dx = playerState.pos.x - jeep.position.x;
    const dz = playerState.pos.z - jeep.position.z;
    return dx * dx + dz * dz < 16;
  }

  function enter() {
    if (state.inVehicle || !playerState) return;
    if (!isNearJeep()) {
      if (window.FX) window.FX.message('NO VEHICLE NEARBY', '#ff6644');
      return;
    }
    state.inVehicle = true;
    state.engineOn = true;
    if (window.Player && window.Player.setVehicleMode) window.Player.setVehicleMode(true);
    jeep.visible = true;
    if (window.Sound && window.Sound.engineStart) window.Sound.engineStart();
    if (window.FX) window.FX.message('JEEP [ENTERED]', '#9fe8a0');
  }

  function exit() {
    if (!state.inVehicle) return;
    state.inVehicle = false;
    state.engineOn = false;
    state.speed = 0;
    if (window.Player && window.Player.setVehicleMode) {
      const ex = jeep.position.x + Math.cos(jeep.rotation.y) * 2;
      const ez = jeep.position.z - Math.sin(jeep.rotation.y) * 2;
      window.Player.setVehicleMode(false, { x: ex, z: ez });
    }
    if (window.Sound && window.Sound.engineStop) window.Sound.engineStop();
    if (window.FX) window.FX.message('JEEP [EXITED]', '#9fe8a0');
  }

  function checkCollision(x, z, r) {
    const trees = window.TREES || [];
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      const dx = x - t.x, dz = z - t.z;
      const rr = t.r + r;
      if (dx * dx + dz * dz < rr * rr) return { x: t.x, z: t.z, r: t.r };
    }
    const wc = window.worldColliders || [];
    for (let i = 0; i < wc.length; i++) {
      const c = wc[i];
      const dx = x - c.x, dz = z - c.z;
      const rr = c.r + r;
      if (dx * dx + dz * dz < rr * rr) return { x: c.x, z: c.z, r: c.r };
    }
    return null;
  }

  function ramEnemies() {
    if (Math.abs(state.speed) < 8) return;
    if (!window.Entities || !Array.isArray(window.Entities.list)) return;
    const fx = jeep.position.x + Math.sin(jeep.rotation.y) * 1.5;
    const fz = jeep.position.z + Math.cos(jeep.rotation.y) * 1.5;
    for (const e of window.Entities.list) {
      if (e.dead) continue;
      const dx = e.mesh.position.x - fx;
      const dz = e.mesh.position.z - fz;
      const d2 = dx * dx + dz * dz;
      if (d2 < RAM_RADIUS * RAM_RADIUS) {
        e.takeDamage(RAM_DAMAGE, 'ram');
        if (window.__Suppression) {
          const pt = window.Manager && window.Manager.state ? window.Manager.state.playerTeam : 'hunter';
          window.__Suppression.applyRam(fx, fz, RAM_RADIUS, pt);
        }
        if (window.FX && window.FX.bloodBurst) {
          window.FX.bloodBurst(e.mesh.position.clone(), new THREE.Vector3(0, 1, 0));
        }
        state.health -= 4;
      }
    }
  }

  function update(dt) {
    if (state.inVehicle) {
      driveUpdate(dt);
      camUpdate(dt);
    } else {
      jeep.visible = true;
      const gh = window.groundHeight ? window.groundHeight(jeep.position.x, jeep.position.z) : 0;
      jeep.position.y = gh;
    }
    if (state.health <= 0) {
      exit();
      state.health = 100;
      const gh = window.groundHeight ? window.groundHeight(jeep.position.x, jeep.position.z) : 0;
      jeep.position.set((Math.random() - 0.5) * 120, gh, (Math.random() - 0.5) * 120);
      if (window.FX) window.FX.message('JEEP DESTROYED — RESPAWNED', '#ff4444');
      if (window.FX && window.FX.bloodBurst) {
        for (let i = 0; i < 3; i++) {
          const p = jeep.position.clone();
          p.y += 1;
          window.FX.bloodBurst(p, new THREE.Vector3((Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2));
        }
      }
    }
    if (!state.inVehicle && jeep.userData.spawned && playerState) {
      jeep.visible = true;
    }
  }

  function driveUpdate(dt) {
    const KEYS = window.Player ? window.Player.KEYS : {};
    const accel = (KEYS['KeyW'] ? 1 : 0) - (KEYS['KeyS'] ? 1 : 0);
    const turn = (KEYS['KeyA'] ? 1 : 0) - (KEYS['KeyD'] ? 1 : 0);
    const braking = KEYS['Space'];
    if (accel > 0) state.speed += DRIVE * dt;
    else if (accel < 0) state.speed -= REVERSE * dt;
    else {
      const fric = FRICTION * dt;
      if (state.speed > fric) state.speed -= fric;
      else if (state.speed < -fric) state.speed += fric;
      else state.speed = 0;
    }
    if (braking) {
      const bk = BRAKE * dt;
      if (state.speed > bk) state.speed -= bk;
      else if (state.speed < -bk) state.speed += bk;
      else state.speed = 0;
    }
    state.speed *= DRAG;
    state.speed = Math.max(-MAX_SPEED * 0.5, Math.min(MAX_SPEED, state.speed));
    const speedRatio = Math.abs(state.speed) / MAX_SPEED;
    state.steerAngle = turn * TURN_RATE * (1.0 - speedRatio * 0.55);
    if (Math.abs(state.speed) > 0.5) {
      const turnFactor = state.speed > 0 ? 1 : -1;
      jeep.rotation.y += state.steerAngle * dt * turnFactor * (Math.abs(state.speed) / 6);
    }
    const dirX = Math.sin(jeep.rotation.y);
    const dirZ = Math.cos(jeep.rotation.y);
    const moveX = dirX * state.speed * dt;
    const moveZ = dirZ * state.speed * dt;
    const newX = jeep.position.x + moveX;
    const newZ = jeep.position.z + moveZ;
    const hit = checkCollision(newX, newZ, 1.4);
    if (hit) {
      state.speed *= 0.15;
      state.health -= Math.abs(state.speed) * 0.3;
      const px = jeep.position.x - hit.x;
      const pz = jeep.position.z - hit.z;
      const pl = Math.sqrt(px * px + pz * pz) || 1;
      jeep.position.x = hit.x + (px / pl) * (hit.r + 1.5);
      jeep.position.z = hit.z + (pz / pl) * (hit.r + 1.5);
      if (window.FX && window.FX.shake) window.FX.shake(0.1);
    } else {
      jeep.position.x = newX;
      jeep.position.z = newZ;
    }
    const gh = window.groundHeight ? window.groundHeight(jeep.position.x, jeep.position.z) : 0;
    jeep.position.y = gh;
    const targetTilt = Math.max(-0.3, Math.min(0.3, -state.steerAngle * speedRatio * 0.25));
    jeep.rotation.z += (targetTilt - jeep.rotation.z) * 0.08;
    const targetPitch = Math.max(-0.15, Math.min(0.15, accel * 0.05));
    jeep.rotation.x += (targetPitch - jeep.rotation.x) * 0.1;
    ramEnemies();
    for (let i = 0; i < 4; i++) {
      spinRate[i] += (state.speed * 1.8 - spinRate[i]) * 0.15;
      wheels[i].rotation.x += spinRate[i] * dt;
      if (i < 2) wheels[i].rotation.y = state.steerAngle * 0.4;
    }
    if (state.engineOn && window.Sound && window.Sound.engineUpdate) {
      window.Sound.engineUpdate(Math.abs(state.speed) / MAX_SPEED);
    }
  }

  function camUpdate(dt) {
    if (!window.CAMERA) return;
    const KEYS = window.Player ? window.Player.KEYS : {};
    if (KEYS['ArrowLeft']) state.camYaw -= 1.5 * dt;
    if (KEYS['ArrowRight']) state.camYaw += 1.5 * dt;
    if (KEYS['ArrowUp']) state.camPitch = Math.max(0.05, state.camPitch - 1.2 * dt);
    if (KEYS['ArrowDown']) state.camPitch = Math.min(1.2, state.camPitch + 1.2 * dt);
    const baseYaw = -jeep.rotation.y - Math.PI / 2;
    let diff = baseYaw + state.camYaw - camTarget.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (!camTarget.y) camTarget.y = baseYaw;
    camTarget.y += diff * 0.12;
    camTarget.x = jeep.position.x;
    camTarget.z = jeep.position.z;
    camTarget.y = baseYaw + state.camYaw * 0.3;
    const cy = camTarget.y;
    const cp = state.camPitch;
    const cd = state.camDist;
    const camX = camTarget.x + Math.cos(cy) * Math.cos(cp) * cd;
    const camY = jeep.position.y + 3.5 + Math.sin(cp) * cd;
    const camZ = camTarget.z + Math.sin(cy) * Math.cos(cp) * cd;
    window.CAMERA.position.set(camX, camY, camZ);
    window.CAMERA.lookAt(jeep.position.x, jeep.position.y + 1.5, jeep.position.z);
  }

  function handleKey(e) {
    if (e.code === 'KeyE' && !e.repeat) {
      if (state.inVehicle) exit();
      else enter();
    }
  }

  function init() {
    window.addEventListener('keydown', handleKey);
  }

  function isInVehicle() { return state.inVehicle; }
  function getHealth() { return Math.max(0, state.health); }
  function getPosition() { return jeep.position.clone(); }

  return { init, update, enter, exit, isInVehicle, getHealth, getPosition, state };
})();

window.Vehicle = Vehicle;