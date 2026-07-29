// heli-strike.js — FORESTWAR killstreak: helicopter gunship that circles a target zone strafing enemies with auto-cannon
const THREE = window.THREE;
const SCENE = window.SCENE;
const HeliStrike = (() => {
  const KILLS_NEEDED = 10;
  const COOLDOWN_MAX = 90;
  const HOVER_ALT = 32;
  const HOVER_RADIUS = 38;
  const ORBIT_SPEED = 0.55;
  const STRAFE_RATE = 0.14;
  const DAMAGE = 20;
  const MAX_TARGETS = 40;
  const TARGET_RANGE = 55;
  const DURATION = 16;
  const SPAWN_TIME = 2.5;
  const TRACER_LIFE = 0.08;
  const TRACER_POOL = 40;
  const SPARK_POOL = 24;
  const SPARK_LIFE = 0.3;

  const state = {
    kills: 0,
    ready: false,
    cooldown: 0,
    active: false,
    phase: 'idle',
    timer: 0,
    center: new THREE.Vector3(),
    angle: 0,
    fireCd: 0,
    spinPhase: 0,
    spinVel: 0,
    rotorAngle: 0,
    tailRotorAngle: 0,
    searchLightT: 0,
  };

  const _heliPos = new THREE.Vector3();
  const _targetPos = new THREE.Vector3();
  const _aimDir = new THREE.Vector3();
  const _muzzle = new THREE.Vector3();
  const _camPos = new THREE.Vector3();
  const _camDir = new THREE.Vector3();
  const _ray = new THREE.Raycaster();
  const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function buildHeli() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a4030, roughness: 0.6, metalness: 0.5 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x2a2a20, roughness: 0.7 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.2, metalness: 0.8, transparent: true, opacity: 0.55 });
    const rotorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const accentMat = new THREE.MeshBasicMaterial({ color: 0xff4422 });

    const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 3.0, 6, 12), bodyMat);
    fuselage.rotation.z = Math.PI / 2;
    fuselage.castShadow = true;
    g.add(fuselage);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), glassMat);
    canopy.scale.set(0.8, 0.7, 1.0);
    canopy.position.set(1.8, 0.25, 0);
    g.add(canopy);

    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.1, 3.8, 6), trimMat);
    boom.rotation.z = Math.PI / 2;
    boom.position.set(-2.8, 0.15, 0);
    g.add(boom);

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.7), bodyMat);
    fin.position.set(-4.6, 0.5, 0);
    g.add(fin);

    const skidL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 5), trimMat);
    skidL.rotation.z = Math.PI / 2;
    skidL.position.set(0, -1.0, 0.8);
    g.add(skidL);
    const skidR = skidL.clone();
    skidR.position.z = -0.8;
    g.add(skidR);
    for (const sz of [-0.8, 0.8]) {
      for (const sx of [-1, 0, 1]) {
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 4), trimMat);
        strut.position.set(sx * 0.9, -0.7, sz);
        g.add(strut);
      }
    }

    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 3.6), bodyMat);
    wing.position.set(0.3, 0.1, 0);
    g.add(wing);

    const gunMount = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 8), trimMat);
    gunMount.position.set(0.3, -0.45, 0);
    g.add(gunMount);

    const gun = new THREE.Group();
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.3), trimMat);
    gun.add(gunBody);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), rotorMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.y = -0.7;
    gun.add(barrel);
    gun.position.set(0.3, -0.6, 0);
    g.add(gun);
    g.userData.gun = gun;

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 8), trimMat);
    hub.position.set(0, 0.6, 0);
    g.add(hub);

    const rotorGeo = new THREE.BoxGeometry(8.5, 0.06, 0.4);
    const rotor = new THREE.Mesh(rotorGeo, rotorMat);
    rotor.material.transparent = true;
    rotor.material.opacity = 0.55;
    rotor.position.set(0, 0.75, 0);
    g.add(rotor);
    g.userData.rotor = rotor;

    const tailHub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 6), trimMat);
    tailHub.rotation.z = Math.PI / 2;
    tailHub.position.set(-4.6, 0.5, 0);
    g.add(tailHub);
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.8, 0.3), rotorMat);
    tailRotor.material = tailRotor.material.clone();
    tailRotor.material.transparent = true;
    tailRotor.material.opacity = 0.5;
    tailRotor.position.set(-4.6, 0.5, 0);
    g.add(tailRotor);
    g.userData.tailRotor = tailRotor;

    for (const sz of [-1, 1]) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), accentMat);
      light.position.set(2.0, 0.1, sz * 0.5);
      g.add(light);
    }
    const belly = new THREE.PointLight(0xff4422, 0.8, 10, 2);
    belly.position.set(0, -0.5, 0);
    g.add(belly);
    g.userData.belly = belly;

    return g;
  }

  const heli = buildHeli();
  heli.visible = false;
  SCENE.add(heli);

  const TRACER_GEO = new THREE.CylinderGeometry(0.03, 0.03, 1, 4);
  TRACER_GEO.rotateX(Math.PI / 2);
  const TRACER_MAT = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i++) {
    const m = new THREE.Mesh(TRACER_GEO, TRACER_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    tracers.push({ mesh: m, life: 0 });
  }
  let tracerIdx = 0;

  const SPARK_GEO = new THREE.SphereGeometry(0.1, 4, 3);
  const SPARK_MAT = new THREE.MeshBasicMaterial({ color: 0xff8822, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks = [];
  for (let i = 0; i < SPARK_POOL; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  let sparkIdx = 0;

  const searchLight = new THREE.SpotLight(0xff6633, 0, 60, Math.PI / 8, 0.4, 1.5);
  searchLight.visible = false;
  SCENE.add(searchLight);
  const searchTarget = new THREE.Object3D();
  SCENE.add(searchTarget);
  searchLight.target = searchTarget;

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:50%;top:16%;transform:translateX(-50%);font-size:13px;letter-spacing:3px;color:#ffaa44;text-shadow:0 0 8px rgba(255,80,0,0.6),0 2px 4px #000;opacity:0;transition:opacity 0.3s;text-align:center;z-index:6;';
  document.getElementById('hud').appendChild(hud);

  const status = document.createElement('div');
  status.style.cssText = 'font-weight:bold;font-size:16px;';
  hud.appendChild(status);
  const subtext = document.createElement('div');
  subtext.style.cssText = 'font-size:11px;color:#cc8844;margin-top:2px;';
  hud.appendChild(subtext);

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'j' && e.key !== 'J') return;
    if (!window.Player || !Player.state.locked) return;
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    activate();
  });

  function activate() {
    if (state.active) return;
    if (!state.ready) {
      if (window.FX) window.FX.message(state.kills < KILLS_NEEDED ? (KILLS_NEEDED - state.kills + ' KILLS TO HELI') : 'HELI RECHARGING', '#ff6644');
      return;
    }
    const cam = window.CAMERA;
    if (!cam) return;
    _camPos.copy(cam.position);
    _camDir.set(0, 0, 0);
    cam.getWorldDirection(_camDir);
    _ray.set(_camPos, _camDir);
    const hit = _ray.ray.intersectPlane(_ground, _targetPos);
    if (!hit) {
      _targetPos.copy(_camPos).addScaledVector(_camDir, 30);
    }
    _targetPos.x = Math.max(-150, Math.min(150, _targetPos.x));
    _targetPos.z = Math.max(-150, Math.min(150, _targetPos.z));
    state.center.copy(_targetPos);

    const sx = state.center.x + 80;
    const sz = state.center.z + 80;
    const gy = window.groundHeight ? window.groundHeight(sx, sz) : 0;
    heli.position.set(sx, gy + HOVER_ALT + 10, sz);
    heli.visible = true;
    state.active = true;
    state.phase = 'entering';
    state.timer = SPAWN_TIME;
    state.angle = 0;
    state.fireCd = 0.6;
    state.rotorAngle = 0;
    state.spinVel = 0;
    state.searchLightT = 0;
    searchLight.visible = true;
    state.ready = false;
    state.cooldown = COOLDOWN_MAX;

    status.textContent = 'GUNSHIP INBOUND';
    subtext.textContent = 'STANDBY...';
    hud.style.opacity = '1';

    if (window.Sound) {
      window.Sound.tone(80, 0.5, 'sawtooth', 0.3, 600);
      window.Sound.tone(120, 0.3, 'square', 0.2, 800);
    }
    if (window.FX) window.FX.message('GUNSHIP DEPLOYED', '#ffaa44');
  }

  function onKill() {
    state.kills++;
    if (state.kills >= KILLS_NEEDED && !state.ready && state.cooldown <= 0) {
      state.ready = true;
      if (window.FX) window.FX.message('GUNSHIP READY [J]', '#ffaa44');
      if (window.Sound) window.Sound.tone(660, 0.2, 'sine', 0.25, 2000);
    }
  }

  function getEntities() {
    if (window.Entities && Array.isArray(window.Entities.list)) return window.Entities.list;
    return [];
  }

  function getPlayerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function findTarget() {
    const pt = getPlayerTeam();
    const ents = getEntities();
    let best = null;
    let bestDist = TARGET_RANGE * TARGET_RANGE;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.team === pt || e.team === 'none') continue;
      const m = e.mesh;
      if (!m) continue;
      const dx = m.position.x - state.center.x;
      const dz = m.position.z - state.center.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > bestDist) continue;
      bestDist = d2;
      best = e;
    }
    return best;
  }

  function fire(target) {
    if (!target || !target.mesh) return;
    const tp = target.mesh.position;
    _targetPos.set(tp.x, tp.y + 1.0, tp.z);
    heli.getWorldPosition(_heliPos);
    const gun = heli.userData.gun;
    if (gun) {
      gun.lookAt(_targetPos);
    }
    _muzzle.set(_heliPos.x, _heliPos.y - 0.5, _heliPos.z);
    _aimDir.subVectors(_targetPos, _muzzle);
    const dist = _aimDir.length();
    _aimDir.divideScalar(dist || 1);

    const slot = tracers[tracerIdx];
    tracerIdx = (tracerIdx + 1) % TRACER_POOL;
    slot.mesh.position.copy(_muzzle).addScaledVector(_aimDir, dist * 0.5);
    const len = Math.max(1.5, dist * 0.4);
    slot.mesh.scale.set(1, 1, len);
    slot.mesh.lookAt(_targetPos);
    slot.mesh.visible = true;
    slot.life = TRACER_LIFE;

    if (target.hp !== undefined) {
      target.hp -= DAMAGE;
      if (window.FX && target.mesh) {
        const hp = target.mesh.position;
        window.FX.bloodBurst(hp.clone().add(new THREE.Vector3(0, 1, 0)), _aimDir.clone().negate());
      }
      if (target.hp <= 0 && !target.dead) {
        if (window.Entities && window.Entities.kill) {
          window.Entities.kill(target, getPlayerTeam());
        } else {
          target.dead = true;
        }
      }
    }

    const sp = sparks[sparkIdx];
    sparkIdx = (sparkIdx + 1) % SPARK_POOL;
    sp.mesh.position.copy(_targetPos);
    sp.mesh.scale.setScalar(0.6 + Math.random() * 0.5);
    sp.mesh.visible = true;
    sp.life = SPARK_LIFE;
    sp.vx = (Math.random() - 0.5) * 5;
    sp.vy = 1 + Math.random() * 3;
    sp.vz = (Math.random() - 0.5) * 5;
    sp.mesh.material.opacity = 0.9;

    if (window.Sound) window.Sound.tone(180 + Math.random() * 60, 0.04, 'square', 0.12, 2500);
  }

  function update(dt) {
    state.searchLightT += dt;

    if (state.cooldown > 0) {
      state.cooldown -= dt;
      if (state.cooldown <= 0 && state.kills >= KILLS_NEEDED && !state.active) {
        state.ready = true;
        if (window.FX) window.FX.message('GUNSHIP READY [J]', '#ffaa44');
      }
    }

    for (let i = 0; i < tracers.length; i++) {
      const t = tracers[i];
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; continue; }
      t.mesh.material.opacity = (t.life / TRACER_LIFE) * 0.9;
    }

    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      s.vy -= 12 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.material.opacity = (s.life / SPARK_LIFE) * 0.9;
    }

    if (state.active) {
      state.timer -= dt;

      if (state.phase === 'entering') {
        if (state.timer <= 0) {
          state.phase = 'strafing';
          state.timer = DURATION;
          subtext.textContent = 'ENGAGING';
          status.textContent = 'GUNSHIP ACTIVE';
        }
      } else if (state.phase === 'strafing') {
        if (state.timer <= 0) {
          state.phase = 'departing';
          state.timer = 3.5;
          subtext.textContent = 'RTB';
        } else {
          state.fireCd -= dt;
          if (state.fireCd <= 0) {
            state.fireCd = STRAFE_RATE;
            const tgt = findTarget();
            if (tgt) fire(tgt);
          }
        }
      } else if (state.phase === 'departing') {
        if (state.timer <= 0) {
          state.active = false;
          state.phase = 'idle';
          heli.visible = false;
          searchLight.visible = false;
          hud.style.opacity = '0';
          state.kills = 0;
        }
      }

      const gy = window.groundHeight ? window.groundHeight(state.center.x, state.center.z) : 0;
      const cx = state.center.x + Math.cos(state.angle) * HOVER_RADIUS;
      const cz = state.center.z + Math.sin(state.angle) * HOVER_RADIUS;

      if (state.phase === 'entering') {
        const enterT = 1 - state.timer / SPAWN_TIME;
        const e = enterT * enterT * (3 - 2 * enterT);
        const startX = state.center.x + 80;
        const startZ = state.center.z + 80;
        heli.position.x = startX + (cx - startX) * e;
        heli.position.z = startZ + (cz - startZ) * e;
        heli.position.y = gy + HOVER_ALT + (1 - e) * 10;
        state.angle += ORBIT_SPEED * dt * 0.5;
      } else if (state.phase === 'departing') {
        const depT = 1 - state.timer / 3.5;
        const e = depT * depT;
        heli.position.x = cx + e * 90;
        heli.position.z = cz + e * 90;
        heli.position.y = gy + HOVER_ALT + e * 25;
        state.angle += ORBIT_SPEED * dt;
      } else {
        heli.position.x = cx;
        heli.position.z = cz;
        heli.position.y = gy + HOVER_ALT + Math.sin(state.searchLightT * 0.7) * 1.5;
        state.angle += ORBIT_SPEED * dt;
      }

      const lookX = state.center.x + Math.cos(state.angle + 0.3) * 5;
      const lookZ = state.center.z + Math.sin(state.angle + 0.3) * 5;
      heli.lookAt(lookX, heli.position.y, lookZ);

      state.rotorAngle += dt * (state.phase === 'entering' ? 15 + (1 - state.timer / SPAWN_TIME) * 35 : 50);
      state.tailRotorAngle += dt * 60;
      if (heli.userData.rotor) heli.userData.rotor.rotation.y = state.rotorAngle;
      if (heli.userData.tailRotor) heli.userData.tailRotor.rotation.x = state.tailRotorAngle;

      const pulse = 0.7 + Math.sin(state.searchLightT * 6) * 0.3;
      if (heli.userData.belly) heli.userData.belly.intensity = pulse * (state.phase === 'strafing' ? 1.2 : 0.5);

      if (state.phase === 'strafing' || state.phase === 'entering') {
        searchLight.intensity = 3 + Math.sin(state.searchLightT * 4) * 0.5;
        searchLight.position.set(heli.position.x, heli.position.y - 1, heli.position.z);
        searchTarget.position.set(
          state.center.x + Math.cos(state.angle * 2) * 10,
          gy + 1,
          state.center.z + Math.sin(state.angle * 2) * 10
        );
      } else {
        searchLight.intensity = 0;
      }

      if (state.active && Math.random() < dt * 2) {
        const ndx = heli.position.x + (Math.random() - 0.5) * 4;
        const ndy = heli.position.y - 1;
        const ndz = heli.position.z + (Math.random() - 0.5) * 4;
        if (window.Sound) window.Sound.tone(70 + Math.random() * 30, 0.15, 'sawtooth', 0.06, 400);
      }
    }
  }

  function init() {
    hud.style.opacity = '0';
  }

  // Player kills are funnelled in through the central KillRewards dispatcher
  // (fed by weapons.js + melee.js), so the gunship charges from real combat
  // rather than the rarely-fired force-kill path.
  if (window.KillRewards) {
    window.KillRewards.register(function (victimTeam) {
      if (victimTeam && victimTeam !== getPlayerTeam()) onKill();
    });
  }

  function reset() {
    state.kills = 0;
    state.ready = false;
    state.cooldown = 0;
    state.active = false;
    state.phase = 'idle';
    state.timer = 0;
    state.fireCd = 0;
    heli.visible = false;
    searchLight.visible = false;
    hud.style.opacity = '0';
    for (let i = 0; i < tracers.length; i++) { tracers[i].life = 0; tracers[i].mesh.visible = false; }
    for (let i = 0; i < sparks.length; i++) { sparks[i].life = 0; sparks[i].mesh.visible = false; }
  }

  return { update, activate, state, init, onKill, reset };
})();

window.HeliStrike = HeliStrike;