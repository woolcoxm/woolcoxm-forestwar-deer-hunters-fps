// supply-request.js — FORESTWAR personal supply radio: call in a parachute ammo crate that lands near the player
const THREE = window.THREE;
const SCENE = window.SCENE;
const SupplyRequest = (() => {
  const COOLDOWN_MAX = 35;
  const STAMINA_COST = 30;
  const DROP_ALT = 45;
  const DESCEND_SPEED = 8;
  const RELEASE_HEIGHT = 2.5;
  const LIFETIME = 25;
  const PICKUP_RADIUS = 2.2;
  const CRATE_HP = 80;
  const HEAL_AMOUNT = 30;
  const LAND_GLOW_TIME = 0.5;

  const state = {
    cd: 0,
    ready: true,
    active: null,
    pulse: 0,
  };

  const CRATE_GEO = new THREE.BoxGeometry(1.0, 1.0, 1.0);
  const CRATE_MAT = new THREE.MeshStandardMaterial({ color: 0x5a6a3a, roughness: 0.8, metalness: 0.2 });
  const STRAP_GEO = new THREE.BoxGeometry(1.04, 0.1, 1.04);
  const STRAP_MAT = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
  const LID_GEO = new THREE.BoxGeometry(1.04, 0.08, 1.04);
  const LID_MAT = new THREE.MeshStandardMaterial({ color: 0x4a5a30, roughness: 0.8 });
  const BADGE_GEO = new THREE.CircleGeometry(0.28, 12);
  const BADGE_MAT = new THREE.MeshBasicMaterial({ color: 0xffcc44, side: THREE.DoubleSide });
  const CROSS_H_GEO = new THREE.BoxGeometry(0.32, 0.07, 0.02);
  const CROSS_V_GEO = new THREE.BoxGeometry(0.07, 0.32, 0.02);
  const CROSS_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const CANOPY_GEO = new THREE.SphereGeometry(1.8, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const CANOPY_MAT = new THREE.MeshStandardMaterial({ color: 0x88aa55, roughness: 0.7, flatShading: true, side: THREE.DoubleSide, emissive: 0x222200, emissiveIntensity: 0.2 });
  const STRING_GEO = new THREE.CylinderGeometry(0.018, 0.018, 3.5, 3);
  const STRING_MAT = new THREE.MeshBasicMaterial({ color: 0x555555 });

  const GLOW_GEO = new THREE.SphereGeometry(0.5, 10, 8);
  const GLOW_MAT = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  const BEACON_GEO = new THREE.CylinderGeometry(0.1, 0.1, 0.3, 6);
  const BEACON_MAT = new THREE.MeshBasicMaterial({ color: 0xffcc44 });

  const RING_GEO = new THREE.RingGeometry(0.5, 1.6, 24);
  const RING_MAT = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });

  const SPARK_GEO = new THREE.SphereGeometry(0.12, 5, 4);
  const SPARK_MAT = new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });

  const sparks = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vy: 0, vx: 0, vz: 0, active: false });
  }
  let sparkIdx = 0;

  function spawnSparks(x, y, z, count) {
    for (let i = 0; i < count; i++) {
      const s = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % sparks.length;
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 5;
      s.mesh.position.set(x, y, z);
      s.vx = Math.cos(ang) * spd;
      s.vy = 4 + Math.random() * 4;
      s.vz = Math.sin(ang) * spd;
      s.life = 0.5 + Math.random() * 0.3;
      s.mesh.material.opacity = 1;
      s.mesh.scale.setScalar(0.6 + Math.random() * 0.5);
      s.mesh.visible = true;
      s.active = true;
    }
  }

  function updateSparks(dt) {
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) { s.active = false; s.mesh.visible = false; continue; }
      s.vy -= 16 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.material.opacity = Math.max(0, s.life / 0.8);
    }
  }

  const hud = document.getElementById('hud');
  if (hud) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;left:16px;bottom:170px;width:170px;font-size:11px;letter-spacing:2px;text-shadow:0 1px 3px #000;z-index:6;';
    const label = document.createElement('div');
    label.style.cssText = 'color:#ffcc44;margin-bottom:3px;';
    label.textContent = 'SUPPLY REQUEST [R]';
    wrap.appendChild(label);
    const bar = document.createElement('div');
    bar.style.cssText = 'width:100%;height:7px;background:rgba(0,0,0,0.55);border:1px solid rgba(255,200,60,0.4);border-radius:4px;overflow:hidden;';
    const fill = document.createElement('div');
    fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#cc8822,#ffdd55);border-radius:3px;transition:width 0.1s linear;';
    bar.appendChild(fill);
    wrap.appendChild(bar);
    const status = document.createElement('div');
    status.style.cssText = 'margin-top:3px;font-size:9px;letter-spacing:1px;color:#ccaa44;opacity:0.7;';
    status.textContent = 'READY';
    wrap.appendChild(status);
    hud.appendChild(wrap);
    state._fill = fill;
    state._status = status;
  }

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function request() {
    const ms = window.Manager && window.Manager.state;
    if (!ms || ms.phase !== 'playing') return;
    if (!state.ready) {
      if (window.FX) window.FX.message('SUPPLY RECHARGING', '#ff6644');
      return;
    }
    const p = window.Player && window.Player.state;
    if (!p) return;
    if (p.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('INSUFFICIENT STAMINA', '#ff6644');
      return;
    }
    p.stamina -= STAMINA_COST;
    if (p.regenTimer !== undefined) p.regenTimer = 1.5;
    state.ready = false;
    state.cd = COOLDOWN_MAX;

    const cam = window.CAMERA;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 0.001) fwd.set(0, 0, 1);
    fwd.normalize();
    const px = cam.position.x + fwd.x * 6 + (Math.random() - 0.5) * 3;
    const pz = cam.position.z + fwd.z * 6 + (Math.random() - 0.5) * 3;

    const mesh = buildCrate();
    mesh.position.set(px, DROP_ALT, pz);
    SCENE.add(mesh);

    state.active = {
      mesh,
      x: px,
      z: pz,
      vy: -DESCEND_SPEED,
      descending: true,
      hp: CRATE_HP,
      life: LIFETIME,
      spin: 0,
      landGlow: 0,
    };

    if (window.FX) window.FX.message('SUPPLY INBOUND', '#ffcc44');
    if (window.Sound) {
      window.Sound.tone(180, 0.5, 'sawtooth', 0.25, 800);
      window.Sound.tone(360, 0.3, 'square', 0.15, 1200);
    }
    updateHUD();
  }

  function buildCrate() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(CRATE_GEO, CRATE_MAT);
    body.castShadow = true;
    g.add(body);
    const lid = new THREE.Mesh(LID_GEO, LID_MAT);
    lid.position.y = 0.5;
    g.add(lid);
    const strap1 = new THREE.Mesh(STRAP_GEO, STRAP_MAT);
    g.add(strap1);
    const strap2 = new THREE.Mesh(STRAP_GEO, STRAP_MAT);
    strap2.rotation.y = Math.PI / 2;
    g.add(strap2);
    const badge = new THREE.Mesh(BADGE_GEO, BADGE_MAT);
    badge.position.set(0, 0, 0.51);
    g.add(badge);
    const crossH = new THREE.Mesh(CROSS_H_GEO, CROSS_MAT);
    crossH.position.set(0, 0, 0.52);
    g.add(crossH);
    const crossV = new THREE.Mesh(CROSS_V_GEO, CROSS_MAT);
    crossV.position.set(0, 0, 0.52);
    g.add(crossV);

    const beacon = new THREE.Mesh(BEACON_GEO, BEACON_MAT);
    beacon.position.y = 0.58;
    g.add(beacon);
    g.userData.beacon = beacon;

    const glow = new THREE.Mesh(GLOW_GEO, GLOW_MAT.clone());
    glow.scale.setScalar(0.6);
    g.add(glow);
    g.userData.glow = glow;

    const para = buildParachute();
    para.position.y = 3.5;
    para.visible = true;
    g.add(para);
    g.userData.para = para;

    return g;
  }

  function buildParachute() {
    const pg = new THREE.Group();
    const canopy = new THREE.Mesh(CANOPY_GEO, CANOPY_MAT);
    canopy.castShadow = true;
    pg.add(canopy);
    for (const sx of [-0.8, 0.8]) {
      const str = new THREE.Mesh(STRING_GEO, STRING_MAT);
      str.position.set(sx, -1.5, 0);
      str.rotation.z = sx * 0.25;
      pg.add(str);
    }
    return pg;
  }

  function grantLoot() {
    const w = window.Weapons;
    if (w && w.state && w.state.slots) {
      const slots = w.state.slots;
      if (slots[0]) { slots[0].totalAmmo = Math.min(slots[0].totalAmmo + 60, 240); }
      if (slots[1]) { slots[1].totalAmmo = Math.min(slots[1].totalAmmo + 2, 20); }
      if (slots[2]) { slots[2].totalAmmo = Math.min(slots[2].totalAmmo + 3, 24); }
    }
    if (window.DMR) window.DMR.reserveAmmo(3);
    if (window.Sniper) window.Sniper.reserveAmmo(3);
    const ms = window.Manager && window.Manager.state;
    if (ms) {
      ms.playerHp = Math.min(ms.playerMaxHp, ms.playerHp + HEAL_AMOUNT);
    }
  }

  function collect(a) {
    grantLoot();
    spawnSparks(a.x, groundY(a.x, a.z) + 0.5, a.z, 14);
    if (window.FX) window.FX.message('+60 RIFLE  +2 ROCKETS  +3 GRENADES  +HEALTH', '#ffcc44');
    if (window.Sound) {
      window.Sound.tone(523, 0.12, 'sine', 0.2, 2000);
      window.Sound.tone(659, 0.12, 'sine', 0.2, 2000);
      window.Sound.tone(784, 0.18, 'sine', 0.22, 2000);
    }
    disposeActive();
  }

  function disposeActive() {
    if (!state.active) return;
    SCENE.remove(state.active.mesh);
    state.active = null;
  }

  function damageActive(amount) {
    if (!state.active || !state.active.descending) return;
    state.active.hp -= amount;
    spawnSparks(state.active.x, state.active.mesh.position.y, state.active.z, 4);
    if (state.active.hp <= 0) {
      spawnSparks(state.active.x, groundY(state.active.x, state.active.z) + 0.5, state.active.z, 20);
      if (window.Sound && window.Sound.explosion) window.Sound.explosion();
      if (window.Craters) window.Craters.create(state.active.x, state.active.z, 2);
      disposeActive();
    }
  }

  function updateHUD() {
    if (!state._fill) return;
    const frac = state.ready ? 1 : (1 - state.cd / COOLDOWN_MAX);
    state._fill.style.width = (frac * 100) + '%';
    if (state._status) {
      state._status.textContent = state.ready ? 'READY' : ('CHARGING ' + Math.ceil(state.cd) + 's');
    }
  }

  function update(dt) {
    if (state.cd > 0) {
      state.cd -= dt;
      if (state.cd <= 0) {
        state.cd = 0;
        state.ready = true;
        if (window.FX) window.FX.message('SUPPLY REQUEST READY', '#ffcc44');
        if (window.Sound) window.Sound.tone(440, 0.15, 'sine', 0.18, 1500);
      }
      updateHUD();
    }

    state.pulse += dt * 4;
    updateSparks(dt);

    const a = state.active;
    if (!a) return;

    const gy = groundY(a.x, a.z);
    if (a.descending) {
      a.mesh.position.y += a.vy * dt;
      a.spin += dt * 1.5;
      a.mesh.rotation.y = a.spin;
      a.vy = Math.max(-DESCEND_SPEED * 1.2, a.vy - 0.5 * dt);
      if (a.mesh.userData.beacon) {
        const mat = a.mesh.userData.beacon.material;
        mat.color.setHSL(0.13, 1, 0.5 + Math.sin(state.pulse * 3) * 0.2);
      }
      if (a.mesh.userData.glow) {
        a.mesh.userData.glow.scale.setScalar(0.5 + Math.sin(state.pulse * 2) * 0.15);
        a.mesh.userData.glow.material.opacity = 0.5 + Math.sin(state.pulse * 3) * 0.2;
      }
      if (a.mesh.position.y <= gy + RELEASE_HEIGHT) {
        a.mesh.position.y = gy + RELEASE_HEIGHT * 0.5;
        a.descending = false;
        a.landGlow = LAND_GLOW_TIME;
        if (a.mesh.userData.para) {
          a.mesh.userData.para.visible = false;
        }
        spawnSparks(a.x, gy + 0.3, a.z, 10);
        if (window.Sound) window.Sound.tone(120, 0.3, 'square', 0.25, 600);
        if (window.Craters) window.Craters.create(a.x, a.z, 1.5);
      }
    } else {
      a.life -= dt;
      a.spin += dt * 0.8;
      a.mesh.rotation.y = a.spin;
      if (a.mesh.userData.glow) {
        const pulse = 0.5 + Math.sin(state.pulse * 3) * 0.2;
        a.mesh.userData.glow.scale.setScalar(0.5 + pulse * 0.2);
        a.mesh.userData.glow.material.opacity = pulse;
      }
      if (a.landGlow > 0) {
        a.landGlow -= dt;
        const t = Math.max(0, a.landGlow / LAND_GLOW_TIME);
        if (a.mesh.userData.glow) {
          a.mesh.userData.glow.scale.setScalar(0.5 + (1 - t) * 2);
          a.mesh.userData.glow.material.opacity = t * 0.8;
        }
      }
      const cam = window.CAMERA;
      if (cam) {
        const dx = cam.position.x - a.x;
        const dz = cam.position.z - a.z;
        if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
          collect(a);
          return;
        }
      }
      if (a.life <= 0) {
        if (window.FX) window.FX.message('SUPPLY EXPIRED', '#888888');
        disposeActive();
      }
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'r' && e.key !== 'R') return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const ms = window.Manager && window.Manager.state;
    if (!ms || ms.phase !== 'playing') return;
    if (!window.Player || !Player.state.locked) return;
    e.preventDefault();
    request();
  });

  function reset() {
    disposeActive();
    state.cd = 0;
    state.ready = true;
    updateHUD();
  }

  return { update, reset, request, damageActive, state };
})();
window.SupplyRequest = SupplyRequest;