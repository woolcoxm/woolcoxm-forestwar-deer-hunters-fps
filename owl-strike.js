// owl-strike.js — FORESTWAR killstreak reward: predatory owl airstrikes that swoop across the battlefield
const THREE = window.THREE;
const SCENE = window.SCENE;
const OwlStrike = (() => {
  const KILLS_NEEDED = 7;
  const STRIKE_COOLDOWN = 55;
  const OWL_SPEED = 80;
  const STRIKE_DURATION = 5;
  const STRAFE_COUNT = 3;
  const STRAFE_SPACING = 9;
  const OWL_RADIUS = 5.5;
  const OWL_DAMAGE = 55;
  const SCREECH_RANGE = 60;

  const state = {
    kills: 0,
    ready: false,
    cooldownTimer: 0,
    active: false,
    timer: 0,
    strafesRun: 0,
    strafeTimer: 0,
    owlPos: new THREE.Vector3(),
    owlDir: new THREE.Vector3(),
    owlStart: new THREE.Vector3(),
    owlEnd: new THREE.Vector3(),
    hitSet: new Set(),
  };

  const BODY_GEO = new THREE.CapsuleGeometry(0.45, 1.3, 4, 8);
  BODY_GEO.rotateZ(Math.PI / 2);
  const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.85 });
  const WING_GEO = new THREE.PlaneGeometry(5.5, 1.4);
  const WING_MAT = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.9, side: THREE.DoubleSide });
  const HEAD_GEO = new THREE.SphereGeometry(0.32, 10, 8);
  const BEAK_GEO = new THREE.ConeGeometry(0.1, 0.35, 5);
  BEAK_GEO.rotateY(-Math.PI / 2);
  const BEAK_MAT = new THREE.MeshStandardMaterial({ color: 0xddaa33, roughness: 0.4, metalness: 0.4 });
  const EYE_GEO = new THREE.SphereGeometry(0.08, 6, 5);
  const EYE_MAT = new THREE.MeshBasicMaterial({ color: 0xffee44 });
  const TALON_GEO = new THREE.ConeGeometry(0.06, 0.3, 4);
  const TALON_MAT = new THREE.MeshStandardMaterial({ color: 0xccaa55, roughness: 0.3, metalness: 0.5 });
  const AURA_GEO = new THREE.SphereGeometry(OWL_RADIUS, 10, 8);
  const AURA_MAT = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.18, side: THREE.BackSide, depthWrite: false });
  const TRAIL_GEO = new THREE.SphereGeometry(0.25, 5, 4);
  const TRAIL_MAT = new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 0.5 });

  const owlMesh = buildOwl();
  owlMesh.visible = false;
  SCENE.add(owlMesh);

  const auraMesh = new THREE.Mesh(AURA_GEO, AURA_MAT.clone());
  auraMesh.visible = false;
  SCENE.add(auraMesh);

  const trails = [];
  for (let i = 0; i < 30; i++) {
    const t = new THREE.Mesh(TRAIL_GEO, TRAIL_MAT.clone());
    t.visible = false;
    t.frustumCulled = false;
    SCENE.add(t);
    trails.push({ mesh: t, life: 0, maxLife: 0.4 });
  }
  let trailIdx = 0;

  const _tmp = new THREE.Vector3();
  const _gridOut = [];

  function buildOwl() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(BODY_GEO, BODY_MAT);
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(HEAD_GEO, BODY_MAT);
    head.position.set(0.6, 0.3, 0);
    head.castShadow = true;
    g.add(head);
    const beak = new THREE.Mesh(BEAK_GEO, BEAK_MAT);
    beak.position.set(0.85, 0.28, 0);
    g.add(beak);
    for (const sz of [-1, 1]) {
      const eye = new THREE.Mesh(EYE_GEO, EYE_MAT);
      eye.position.set(0.8, 0.36, sz * 0.15);
      g.add(eye);
    }
    for (const sz of [-1, 1]) {
      const wing = new THREE.Mesh(WING_GEO, WING_MAT);
      wing.position.set(0, 0, sz * 0.3);
      wing.userData.side = sz;
      g.add(wing);
    }
    for (const sx of [-0.15, 0.15]) {
      for (const sz of [-0.15, 0.15]) {
        const talon = new THREE.Mesh(TALON_GEO, TALON_MAT);
        talon.position.set(-0.7 + sx, -0.35, sz);
        talon.rotation.z = Math.PI;
        g.add(talon);
      }
    }
    return g;
  }

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:50%;bottom:96px;transform:translateX(-50%);font-size:12px;letter-spacing:2px;text-shadow:0 1px 4px #000;z-index:6;text-align:center;';
  const counter = document.createElement('div');
  counter.style.cssText = 'color:#ff8833;opacity:0.7;margin-bottom:4px;';
  counter.textContent = 'KILLSTREAK: 0';
  hud.appendChild(counter);
  const statusBar = document.createElement('div');
  statusBar.style.cssText = 'width:140px;height:8px;margin:0 auto;background:rgba(0,0,0,0.5);border:1px solid rgba(255,136,51,0.35);border-radius:4px;overflow:hidden;';
  const statusFill = document.createElement('div');
  statusFill.style.cssText = 'width:0%;height:100%;background:linear-gradient(90deg,#ff6622,#ffcc44);transition:width 0.2s;border-radius:3px;';
  statusBar.appendChild(statusFill);
  hud.appendChild(statusBar);
  const statusLabel = document.createElement('div');
  statusLabel.style.cssText = 'margin-top:3px;color:#8a7a6a;font-size:10px;letter-spacing:1px;';
  statusLabel.textContent = 'OWL STRIKE';
  hud.appendChild(statusLabel);
  document.getElementById('hud').appendChild(hud);

  function getEnemyTeam() {
    const pt = (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
    return pt === 'deer' ? 'hunter' : 'deer';
  }

  function getEnemyCenter() {
    const enemyTeam = getEnemyTeam();
    const ents = window.Entities && Array.isArray(window.Entities.list) ? window.Entities.list : [];
    let cx = 0, cz = 0, count = 0;
    for (const e of ents) {
      if (e.dead || e.team !== enemyTeam) continue;
      if (e.mesh) { cx += e.mesh.position.x; cz += e.mesh.position.z; count++; }
    }
    if (count === 0) return null;
    return { x: cx / count, z: cz / count };
  }

  // Called directly from the player's own damage paths (weapons.js, melee.js)
  // with the VICTIM's team. We only credit enemy kills toward the streak.
  function notifyKill(victimTeam) {
    if (state.ready || state.active) return;
    const pt = (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
    if (!victimTeam || victimTeam === pt) return; // ignore friendly / ally deaths
    state.kills++;
    counter.textContent = 'KILLSTREAK: ' + state.kills;
    if (state.kills >= KILLS_NEEDED) {
      state.ready = true;
      state.kills = 0;
      if (window.FX && window.FX.message) window.FX.message('OWL STRIKE READY [Q]', '#ff8833');
      if (window.Sound && window.Sound.tone) {
        window.Sound.tone(440, 0.15, 'sine', 0.3, 2000);
        window.Sound.tone(660, 0.2, 'sine', 0.25, 2400);
      }
    }
    updateHUD();
  }

  function call() {
    if (!state.ready || state.active) return false;
    const cam = window.CAMERA;
    if (!cam) return false;
    const center = getEnemyCenter();
    if (!center) {
      const fwd = new THREE.Vector3();
      cam.getWorldDirection(fwd);
      center.x = cam.position.x + fwd.x * 50;
      center.z = cam.position.z + fwd.z * 50;
    }
    const dir = new THREE.Vector3();
    dir.subVectors(new THREE.Vector3(center.x, 0, center.z), cam.position);
    dir.y = 0;
    if (dir.lengthSq() < 1) dir.set(0, 0, 1);
    dir.normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    const halfWidth = (STRAFE_COUNT - 1) * STRAFE_SPACING * 0.5;
    state.owlDir.copy(dir);
    state.owlStart.set(center.x - dir.x * 70 + perp.x * (-halfWidth), 24, center.z - dir.z * 70 + perp.z * (-halfWidth));
    state.owlEnd.set(center.x + dir.x * 70 + perp.x * (-halfWidth), 24, center.z + dir.z * 70 + perp.z * (-halfWidth));
    state.owlPos.copy(state.owlStart);
    state.active = true;
    state.ready = false;
    state.timer = 0;
    state.strafesRun = 0;
    state.strafeTimer = 0;
    state.hitSet.clear();
    owlMesh.visible = true;
    owlMesh.position.copy(state.owlStart);
    auraMesh.visible = true;
    auraMesh.position.copy(state.owlStart);
    if (window.FX && window.FX.message) window.FX.message('OWL STRIKE INBOUND', '#ff8833');
    if (window.Sound) {
      if (window.Sound.tone) {
        window.Sound.tone(180, 0.5, 'sawtooth', 0.35, 800);
        window.Sound.tone(90, 0.8, 'sine', 0.3, 400);
      }
    }
    updateHUD();
    return true;
  }

  function nextStrafe() {
    const cam = window.CAMERA;
    const center = getEnemyCenter();
    if (!center) return false;
    const dir = new THREE.Vector3().copy(state.owlDir);
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    const offset = (state.strafesRun + 1 - (STRAFE_COUNT - 1) * 0.5) * STRAFE_SPACING;
    state.owlStart.set(center.x - dir.x * 70 + perp.x * offset, 24, center.z - dir.z * 70 + perp.z * offset);
    state.owlEnd.set(center.x + dir.x * 70 + perp.x * offset, 24, center.z + dir.z * 70 + perp.z * offset);
    state.owlPos.copy(state.owlStart);
    state.hitSet.clear();
    return true;
  }

  function endStrike() {
    state.active = false;
    state.cooldownTimer = STRIKE_COOLDOWN;
    owlMesh.visible = false;
    auraMesh.visible = false;
    for (const t of trails) { t.mesh.visible = false; t.life = 0; }
    updateHUD();
  }

  function spawnTrail() {
    const slot = trails[trailIdx];
    trailIdx = (trailIdx + 1) % trails.length;
    slot.mesh.position.copy(state.owlPos);
    slot.mesh.position.y += (Math.random() - 0.5) * 0.5;
    slot.mesh.scale.setScalar(0.8 + Math.random() * 0.4);
    slot.mesh.visible = true;
    slot.life = slot.maxLife;
  }

  function update(dt) {
    if (state.cooldownTimer > 0) {
      state.cooldownTimer -= dt;
      if (state.cooldownTimer <= 0) updateHUD();
    }
    for (let i = 0; i < trails.length; i++) {
      const t = trails[i];
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) { t.mesh.visible = false; }
        else {
          t.mesh.material.opacity = (t.life / t.maxLife) * 0.5;
          t.mesh.scale.multiplyScalar(1 + dt * 1.5);
        }
      }
    }
    if (!state.active) return;
    state.timer += dt;
    state.strafeTimer += dt;
    const strafeTime = 140 / OWL_SPEED;
    const progress = Math.min(state.strafeTimer / strafeTime, 1);
    state.owlPos.lerpVectors(state.owlStart, state.owlEnd, progress);
    owlMesh.position.copy(state.owlPos);
    owlMesh.lookAt(_tmp.copy(state.owlPos).add(state.owlDir));
    owlMesh.rotation.x = Math.sin(state.timer * 18) * 0.05;
    const wings = owlMesh.children.filter(c => c.userData.side !== undefined);
    for (const w of wings) {
      w.rotation.x = Math.sin(state.timer * 14 + (w.userData.side > 0 ? 0 : Math.PI)) * 0.7;
    }
    auraMesh.position.copy(state.owlPos);
    auraMesh.scale.setScalar(1 + Math.sin(state.timer * 8) * 0.12);
    if (Math.random() < dt * 25) spawnTrail();
    // Refresh the uniform grid so the radius query in applyDamage() is accurate.
    if (window.Grid && typeof window.Grid.rebuild === 'function') window.Grid.rebuild(performance.now());
    applyDamage();
    if (progress >= 1) {
      state.strafesRun++;
      state.strafeTimer = 0;
      if (state.strafesRun >= STRAFE_COUNT || state.timer >= STRIKE_DURATION) { endStrike(); return; }
      nextStrafe();
    }
  }

  function applyDamage() {
    if (!window.Entities || !window.Grid) return;
    const enemyTeam = getEnemyTeam();
    window.Grid.queryRadius(state.owlPos.x, state.owlPos.z, OWL_RADIUS, _gridOut, (e) => !e.dead && e.team === enemyTeam);
    // NOTE: queryRadius truncates _gridOut to exactly the matches, so the old
    // loop that nulled every entry here wiped the results before they were
    // used (no damage was ever applied). It is removed below.
    if (_gridOut.length === 0) return;
    const pt = (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
    const r2 = OWL_RADIUS * OWL_RADIUS;
    for (const e of _gridOut) {
      if (!e || !e.mesh) continue;
      if (state.hitSet.has(e)) continue;
      const dx = e.mesh.position.x - state.owlPos.x;
      const dz = e.mesh.position.z - state.owlPos.z;
      if (dx * dx + dz * dz <= r2) {
        state.hitSet.add(e);
        if (e.takeDamage) {
          e.takeDamage(OWL_DAMAGE, pt);
        }
        if (window.FX && window.FX.burst) {
          window.FX.burst(e.mesh.position, new THREE.Vector3(0, 1, 0), 0xaa5522, 8);
        }
      }
    }
  }

  function updateHUD() {
    if (state.active) {
      statusFill.style.width = '100%';
      statusFill.style.background = 'linear-gradient(90deg,#ff4400,#ffaa22)';
      statusLabel.textContent = 'STRIKE ACTIVE';
      statusLabel.style.color = '#ffcc44';
      counter.textContent = 'OWL INBOUND';
    } else if (state.ready) {
      statusFill.style.width = '100%';
      statusFill.style.background = 'linear-gradient(90deg,#ff6622,#ffcc44)';
      statusLabel.textContent = 'PRESS [Q] TO STRIKE';
      statusLabel.style.color = '#ff8833';
      counter.textContent = 'OWL STRIKE READY';
    } else {
      const pct = Math.min(state.kills / KILLS_NEEDED, 1) * 100;
      statusFill.style.width = pct + '%';
      statusFill.style.background = 'linear-gradient(90deg,#5a4a3a,#8a6a4a)';
      statusLabel.textContent = 'OWL STRIKE';
      statusLabel.style.color = '#8a7a6a';
      counter.textContent = 'KILLSTREAK: ' + state.kills;
    }
  }

  // 'Q' calls the strike. ('G' is taken by the artillery barrage.)
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'q' && e.key !== 'Q') return;
    if (e.repeat) return;
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    if (!window.Player || !Player.state.locked) return;
    call();
  });

  function reset() {
    state.kills = 0;
    state.ready = false;
    state.cooldownTimer = 0;
    state.active = false;
    state.timer = 0;
    state.strafesRun = 0;
    state.strafeTimer = 0;
    state.hitSet.clear();
    owlMesh.visible = false;
    auraMesh.visible = false;
    for (const t of trails) { t.mesh.visible = false; t.life = 0; }
    updateHUD();
  }

  function init() {
    updateHUD();
  }

  // Funnel player kills (rifle, rocket, grenade, bayonet) into the streak via
  // the central dispatcher so every weapon counts — not just the bayonet.
  if (window.KillRewards) window.KillRewards.register(notifyKill);

  return { init, update, call, reset, notifyKill, state, KILLS_NEEDED };
})();
window.OwlStrike = OwlStrike;