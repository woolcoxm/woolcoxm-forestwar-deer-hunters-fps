// boss.js — FORESTWAR mega-stag boss: spawns on cycle, charge trample, ground-slam shockwave, boss bar
const THREE = window.THREE;
const SCENE = window.SCENE;
const Boss = (() => {
  const BOSS_HP = 1600;
  const CHARGE_SPEED = 30;
  const CHARGE_WARMUP = 1.4;
  const CHARGE_DURATION = 2.4;
  const SLAM_DAMAGE = 42;
  const SLAM_RADIUS = 11;
  const TRAMPLE_DAMAGE = 75;
  const SPAWN_WAVE = 2;

  const boss = {
    active: false,
    mesh: null,
    hp: BOSS_HP,
    maxHp: BOSS_HP,
    phase: 'idle',
    timer: 0,
    chargeDir: new THREE.Vector3(),
    slamCd: 5,
    aura: null,
    runeGlow: null,
  };

  const BODY_GEO = new THREE.CapsuleGeometry(0.7, 2.2, 6, 12);
  const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.85 });
  const HEAD_GEO = new THREE.SphereGeometry(0.55, 12, 10);
  const ANTLER_GEO = new THREE.ConeGeometry(0.09, 1.4, 5);
  const ANTLER_MAT = new THREE.MeshStandardMaterial({ color: 0xe8d8a8, roughness: 0.5, emissive: 0x442200, emissiveIntensity: 0.4 });
  const LEG_GEO = new THREE.CylinderGeometry(0.18, 0.22, 1.6, 6);
  const EYE_GEO = new THREE.SphereGeometry(0.1, 6, 5);
  const EYE_MAT = new THREE.MeshBasicMaterial({ color: 0xff2200 });
  const AURA_MAT = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.25, side: THREE.BackSide });
  const RUNE_MAT = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.8 });
  const SHOCK_GEO = new THREE.RingGeometry(0.5, 1.0, 32);
  const SHOCK_MAT = new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 0.7, side: THREE.DoubleSide });

  const shocks = [];

  function buildMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(BODY_GEO, BODY_MAT);
    body.castShadow = true;
    body.position.y = 2.2;
    g.add(body);
    const head = new THREE.Mesh(HEAD_GEO, BODY_MAT);
    head.position.set(0, 3.5, 0.7);
    head.castShadow = true;
    g.add(head);
    for (const sx of [-1, 1]) {
      for (const sb of [-1, 1]) {
        const ant = new THREE.Mesh(ANTLER_GEO, ANTLER_MAT);
        ant.position.set(sx * 0.3, 4.1 + sb * 0.15, 0.6);
        ant.rotation.z = sx * 0.6 + sb * 0.3;
        ant.rotation.x = -0.4;
        g.add(ant);
      }
    }
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(EYE_GEO, EYE_MAT.clone());
      eye.position.set(sx * 0.22, 3.55, 1.15);
      g.add(eye);
    }
    for (const sx of [-0.45, 0.45]) {
      for (const sz of [-0.7, 0.7]) {
        const leg = new THREE.Mesh(LEG_GEO, BODY_MAT);
        leg.position.set(sx, 0.8, sz);
        leg.castShadow = true;
        g.add(leg);
      }
    }
    const aura = new THREE.Mesh(new THREE.SphereGeometry(3.0, 12, 10), AURA_MAT.clone());
    aura.position.y = 2.2;
    aura.visible = false;
    g.add(aura);
    const rune = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.08, 5, 20), RUNE_MAT.clone());
    rune.rotation.x = Math.PI / 2;
    rune.position.y = 0.2;
    rune.visible = false;
    g.add(rune);
    boss.aura = aura;
    boss.runeGlow = rune;
    g.userData.boss = true;
    return g;
  }

  function spawn() {
    if (boss.active) return;
    boss.active = true;
    boss.hp = BOSS_HP;
    boss.maxHp = BOSS_HP;
    boss.phase = 'idle';
    boss.timer = 3;
    boss.slamCd = 5;
    boss.mesh = buildMesh();
    const a = Math.random() * Math.PI * 2;
    const r = 70 + Math.random() * 30;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    boss.mesh.position.set(x, window.groundHeight ? window.groundHeight(x, z) : 0, z);
    SCENE.add(boss.mesh);
    if (window.FX) window.FX.message('MEGA-STAG APPROACHES', '#ff4422');
    if (window.Sound) {
      window.Sound.tone(80, 1.2, 'sawtooth', 0.4, 400);
      window.Sound.tone(55, 1.5, 'sawtooth', 0.3, 250);
    }
    showBar();
  }

  function dealDamage(amount) {
    if (!boss.active) return;
    boss.hp -= amount;
    if (window.FX && boss.mesh) window.FX.bloodBurst(boss.mesh.position.clone().setY(2.5), new THREE.Vector3(0, 1, 0));
    if (boss.hp <= 0) defeat();
  }

  function defeat() {
    if (!boss.active) return;
    if (window.FX && boss.mesh) {
      for (let i = 0; i < 40; i++) window.FX.bloodBurst(boss.mesh.position.clone().setY(2 + Math.random() * 2), new THREE.Vector3((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2));
      window.FX.shake(0.8);
    }
    if (window.Sound) {
      window.Sound.tone(120, 0.8, 'sawtooth', 0.4, 600);
      window.Sound.tone(90, 1.0, 'square', 0.3, 300);
    }
    SCENE.remove(boss.mesh);
    boss.mesh = null;
    boss.active = false;
    boss.phase = 'idle';
    if (window.FX) window.FX.message('MEGA-STAG DEFEATED', '#9fe8a0');
    if (window.Manager) {
      window.Manager.state.kills.deer += 5;
      window.Manager.state.bossDefeated = true;
    }
    hideBar();
  }

  function startCharge() {
    const cam = window.CAMERA;
    if (!cam || !boss.mesh) return;
    boss.phase = 'charging';
    boss.timer = CHARGE_DURATION;
    const dir = new THREE.Vector3().subVectors(cam.position, boss.mesh.position);
    dir.y = 0;
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    dir.normalize();
    boss.chargeDir.copy(dir);
    boss.mesh.rotation.y = Math.atan2(dir.x, dir.z);
    if (boss.aura) {
      boss.aura.visible = true;
      boss.aura.material.opacity = 0.5;
    }
    if (window.Sound) window.Sound.tone(180, 0.5, 'sawtooth', 0.35, 500);
  }

  function endCharge() {
    boss.phase = 'idle';
    boss.timer = 3 + Math.random() * 2;
    if (boss.aura) boss.aura.visible = false;
  }

  function groundSlam() {
    if (!boss.mesh) return;
    const shock = new THREE.Mesh(SHOCK_GEO, SHOCK_MAT.clone());
    shock.rotation.x = -Math.PI / 2;
    shock.position.copy(boss.mesh.position);
    shock.position.y += 0.2;
    shock.userData.life = 0.6;
    shock.userData.maxLife = 0.6;
    shock.userData.grew = false;
    SCENE.add(shock);
    shocks.push(shock);
    if (window.FX) {
      window.FX.shake(0.6);
      window.FX.message('SLAM!', '#ff8833');
    }
    if (window.Sound) {
      window.Sound.tone(60, 0.5, 'sawtooth', 0.45, 200);
      window.Sound.tone(40, 0.7, 'square', 0.3, 120);
    }
    const cam = window.CAMERA;
    if (cam) {
      const d = Math.hypot(cam.position.x - boss.mesh.position.x, cam.position.z - boss.mesh.position.z);
      if (d < SLAM_RADIUS && window.Manager) {
        window.Manager.damagePlayer(SLAM_DAMAGE * (1 - d / SLAM_RADIUS));
      }
    }
    if (window.Entities) {
      for (const e of window.Entities.list) {
        if (e.dead || e.team === 'deer') continue;
        const d = Math.hypot(e.mesh.position.x - boss.mesh.position.x, e.mesh.position.z - boss.mesh.position.z);
        if (d < SLAM_RADIUS) e.takeDamage(SLAM_DAMAGE * 0.6);
      }
    }
  }

  function update(dt) {
    if (!boss.active || !boss.mesh) return;
    const cam = window.CAMERA;
    const gh = window.groundHeight || (() => 0);
    boss.timer -= dt;
    boss.slamCd -= dt;

    if (boss.phase === 'idle') {
      if (cam) {
        const dir = new THREE.Vector3().subVectors(cam.position, boss.mesh.position);
        dir.y = 0;
        const dist = dir.length();
        if (dist > 0.5) {
          dir.normalize();
          const speed = 4.5;
          const nx = boss.mesh.position.x + dir.x * speed * dt;
          const nz = boss.mesh.position.z + dir.z * speed * dt;
          boss.mesh.position.x = nx;
          boss.mesh.position.z = nz;
          boss.mesh.rotation.y = Math.atan2(dir.x, dir.z);
        }
        if (boss.timer <= 0 && dist < 40) startCharge();
      }
      if (boss.slamCd <= 0) {
        const d = cam ? Math.hypot(cam.position.x - boss.mesh.position.x, cam.position.z - boss.mesh.position.z) : 99;
        if (d < 9) {
          groundSlam();
          boss.slamCd = 6 + Math.random() * 3;
        } else {
          boss.slamCd = 1.0;
        }
      }
    } else if (boss.phase === 'charging') {
      const step = CHARGE_SPEED * dt;
      const nx = boss.mesh.position.x + boss.chargeDir.x * step;
      const nz = boss.mesh.position.z + boss.chargeDir.z * step;
      boss.mesh.position.x = nx;
      boss.mesh.position.z = nz;
      if (cam) {
        const d = Math.hypot(cam.position.x - boss.mesh.position.x, cam.position.z - boss.mesh.position.z);
        if (d < 3.0 && window.Manager) {
          window.Manager.damagePlayer(TRAMPLE_DAMAGE * dt * 12);
        }
      }
      if (window.Entities) {
        for (const e of window.Entities.list) {
          if (e.dead || e.team === 'deer') continue;
          const d = Math.hypot(e.mesh.position.x - boss.mesh.position.x, e.mesh.position.z - boss.mesh.position.z);
          if (d < 3.0) e.takeDamage(900);
        }
      }
      if (boss.timer <= 0) endCharge();
    }

    boss.mesh.position.y = gh(boss.mesh.position.x, boss.mesh.position.z);

    if (boss.runeGlow) {
      boss.runeGlow.rotation.z += dt * 1.5;
      boss.runeGlow.material.opacity = 0.4 + Math.sin(performance.now() * 0.005) * 0.3;
      boss.runeGlow.visible = boss.phase === 'charging';
    }
    if (boss.aura && boss.phase === 'charging') {
      boss.aura.material.opacity = 0.3 + Math.sin(performance.now() * 0.015) * 0.2;
    }

    for (let i = shocks.length - 1; i >= 0; i--) {
      const s = shocks[i];
      s.userData.life -= dt;
      const t = 1 - s.userData.life / s.userData.maxLife;
      s.scale.setScalar(1 + t * SLAM_RADIUS);
      s.material.opacity = (1 - t) * 0.7;
      if (!s.userData.grew && t > 0.3) {
        s.userData.grew = true;
      }
      if (s.userData.life <= 0) {
        SCENE.remove(s);
        shocks.splice(i, 1);
      }
    }
    updateBar();
  }

  let barEl = null, barFill = null, barLabel = null;
  function showBar() {
    if (!barEl) {
      barEl = document.createElement('div');
      barEl.style.cssText = 'position:absolute;top:50px;left:50%;transform:translateX(-50%);width:460px;max-width:80vw;z-index:8;text-align:center;';
      barLabel = document.createElement('div');
      barLabel.style.cssText = 'font-size:12px;letter-spacing:4px;color:#ff6644;text-shadow:0 0 8px #aa0000,0 2px 4px #000;margin-bottom:4px;font-weight:bold;';
      barLabel.textContent = 'MEGA-STAG';
      barEl.appendChild(barLabel);
      const track = document.createElement('div');
      track.style.cssText = 'width:100%;height:16px;background:rgba(0,0,0,0.7);border:1px solid rgba(255,80,40,0.6);border-radius:3px;overflow:hidden;box-shadow:0 0 12px rgba(255,50,0,0.4);';
      barFill = document.createElement('div');
      barFill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#cc1100,#ff6633);transition:width 0.15s;';
      track.appendChild(barFill);
      barEl.appendChild(track);
      document.getElementById('hud').appendChild(barEl);
    }
    barEl.style.display = 'block';
  }
  function hideBar() { if (barEl) barEl.style.display = 'none'; }
  function updateBar() {
    if (barFill) barFill.style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
  }

  function onWaveCleared(waveNum) {
    if (waveNum >= SPAWN_WAVE && !boss.active) spawn();
  }

  function isActive() { return boss.active; }
  function getPosition() { return boss.mesh ? boss.mesh.position : null; }
  function getRadius() { return 3.0; }

  function reset() {
    if (boss.mesh) SCENE.remove(boss.mesh);
    boss.mesh = null;
    boss.active = false;
    boss.phase = 'idle';
    boss.hp = BOSS_HP;
    boss.slamCd = 5;
    if (boss.aura) boss.aura.visible = false;
    if (boss.runeGlow) boss.runeGlow.visible = false;
    hideBar();
  }

  return { spawn, dealDamage, damage: dealDamage, update, reset, isActive, getPosition, getRadius, onWaveCleared, state: boss };
})();
window.Boss = Boss;