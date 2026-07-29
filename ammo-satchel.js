// ammo-satchel.js — FORESTWAR deployable ammo satchel: ground-placed resupply bag that refills ammo and stamina in a radius
const THREE = window.THREE;
const SCENE = window.SCENE;
const AmmoSatchel = (() => {
  const MAX_SATCHELS = 3;
  const RESUPPLY_RADIUS = 7;
  const AMMO_PER_SEC = 0.8;
  const STAMINA_PER_SEC = 10;
  const HEAL_PER_SEC = 3;
  const LIFETIME = 28;
  const COOLDOWN = 16;
  const STAMINA_COST = 30;
  const PULSE_INTERVAL = 0.8;
  const SCAN_INTERVAL = 0.25;

  const state = {
    active: [],
    cd: 0,
    ready: true,
    scanTimer: 0,
  };

  const BAG_GEO = new THREE.BoxGeometry(0.7, 0.45, 0.55);
  const BAG_MAT = new THREE.MeshStandardMaterial({ color: 0x4a3a22, roughness: 0.9, flatShading: true });
  const STRAP_GEO = new THREE.BoxGeometry(0.74, 0.08, 0.58);
  const STRAP_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 });
  const BUCKLE_GEO = new THREE.BoxGeometry(0.16, 0.1, 0.06);
  const BUCKLE_MAT = new THREE.MeshStandardMaterial({ color: 0x888866, roughness: 0.4, metalness: 0.7 });
  const GLOW_GEO = new THREE.SphereGeometry(0.16, 8, 6);
  const GLOW_MAT = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const RING_GEO = new THREE.RingGeometry(RESUPPLY_RADIUS - 0.4, RESUPPLY_RADIUS, 48);
  const RING_MAT = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const PULSE_GEO = new THREE.RingGeometry(0.5, 0.8, 32);
  const PULSE_MAT = new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const SPARK_GEO = new THREE.SphereGeometry(0.1, 5, 4);
  const SPARK_MAT = new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });

  const pulses = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(PULSE_GEO, PULSE_MAT.clone());
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    pulses.push({ mesh: m, t: 0, active: false });
  }
  let pulseIdx = 0;

  const sparks = [];
  for (let i = 0; i < 20; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vy: 0, active: false });
  }
  let sparkIdx = 0;

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function buildMesh() {
    const g = new THREE.Group();
    const bag = new THREE.Mesh(BAG_GEO, BAG_MAT);
    bag.castShadow = true;
    g.add(bag);
    const strap = new THREE.Mesh(STRAP_GEO, STRAP_MAT);
    strap.position.y = 0.06;
    g.add(strap);
    const buckle = new THREE.Mesh(BUCKLE_GEO, BUCKLE_MAT);
    buckle.position.set(0, 0.06, 0.3);
    g.add(buckle);
    const glow1 = new THREE.Mesh(GLOW_GEO, GLOW_MAT.clone());
    glow1.position.set(0.2, 0.3, 0);
    g.add(glow1);
    const glow2 = new THREE.Mesh(GLOW_GEO, GLOW_MAT.clone());
    glow2.position.set(-0.2, 0.3, 0);
    g.add(glow2);
    g.userData.glows = [glow1, glow2];
    const ring = new THREE.Mesh(RING_GEO, RING_MAT.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    g.add(ring);
    g.userData.ring = ring;
    return g;
  }

  function deploy() {
    if (!state.ready) {
      if (window.FX) window.FX.message('SATCHEL RECHARGING', '#ff6644');
      return;
    }
    const p = window.Player ? window.Player.state : null;
    if (!p || !p.locked) return;
    if (p.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('INSUFFICIENT STAMINA', '#ff6644');
      return;
    }
    p.stamina -= STAMINA_COST;
    if (p.regenTimer !== undefined) p.regenTimer = 1.5;

    state.ready = false;
    state.cd = COOLDOWN;

    const cam = window.CAMERA;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const px = cam.position.x + fwd.x * 2.0;
    const pz = cam.position.z + fwd.z * 2.0;

    const mesh = buildMesh();
    const gy = groundY(px, pz);
    mesh.position.set(px, gy, pz);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    SCENE.add(mesh);

    const satchel = {
      mesh,
      x: px,
      z: pz,
      life: LIFETIME,
      pulseTimer: 0,
      dying: false,
      dieT: 0,
    };
    state.active.push(satchel);

    if (state.active.length > MAX_SATCHELS) {
      const oldest = state.active.shift();
      expireSatchel(oldest);
    }

    for (let i = 0; i < 8; i++) spawnSpark(px, gy + 0.3, pz);

    if (window.FX) window.FX.message('AMMO SATCHEL DEPLOYED', '#ffcc44');
    if (window.Sound) {
      window.Sound.tone(330, 0.12, 'square', 0.18, 1500);
      window.Sound.tone(550, 0.08, 'square', 0.14, 1800);
    }
    updateHUD();
  }

  function expireSatchel(s) {
    for (let i = 0; i < 6; i++) spawnSpark(s.x, s.mesh.position.y + 0.2, s.z);
    SCENE.remove(s.mesh);
    disposeMesh(s.mesh);
  }

  function disposeMesh(m) {
    m.traverse((child) => {
      if (child.geometry && child.geometry !== BAG_GEO && child.geometry !== STRAP_GEO && child.geometry !== BUCKLE_GEO && child.geometry !== GLOW_GEO && child.geometry !== RING_GEO) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(mt => mt.dispose());
        else child.material.dispose();
      }
    });
  }

  function spawnPulse(x, z) {
    const slot = pulses[pulseIdx];
    pulseIdx = (pulseIdx + 1) % pulses.length;
    const gy = groundY(x, z) + 0.06;
    slot.mesh.position.set(x, gy, z);
    slot.mesh.scale.setScalar(0.3);
    slot.mesh.material.opacity = 0.7;
    slot.mesh.visible = true;
    slot.t = 0;
    slot.active = true;
  }

  function spawnSpark(x, y, z) {
    const slot = sparks[sparkIdx];
    sparkIdx = (sparkIdx + 1) % sparks.length;
    const ang = Math.random() * Math.PI * 2;
    slot.mesh.position.set(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4);
    slot.vy = 1.5 + Math.random() * 1.5;
    slot.life = 0.5 + Math.random() * 0.3;
    slot.mesh.scale.setScalar(0.6 + Math.random() * 0.5);
    slot.mesh.visible = true;
    slot.active = true;
  }

  function getWeaponSlots() {
    if (!window.Weapons || !Weapons.state) return [];
    return Weapons.state.slots || [];
  }

  function resupplyPlayer(dt) {
    const ms = window.Manager && window.Manager.state;
    if (!ms) return;
    if (ms.playerHp < ms.playerMaxHp) {
      ms.playerHp = Math.min(ms.playerMaxHp, ms.playerHp + HEAL_PER_SEC * dt);
    }
    const p = window.Player && Player.state;
    if (p) {
      p.stamina = Math.min(100, p.stamina + STAMINA_PER_SEC * dt);
    }
    const slots = getWeaponSlots();
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s) continue;
      const grant = s.magSize * AMMO_PER_SEC * dt;
      s.totalAmmo = Math.min(s.totalAmmo + grant, s.magSize * 6);
    }
  }

  function resupplyEntity(e, dt) {
    if (e.dead) return;
    if (e.hp !== undefined && e.maxHp !== undefined && e.hp < e.maxHp) {
      e.hp = Math.min(e.maxHp, e.hp + HEAL_PER_SEC * dt);
    }
    if (e.ammo !== undefined && e.ammo < 60) {
      e.ammo = Math.min(60, e.ammo + AMMO_PER_SEC * 8 * dt);
    }
  }

  function update(dt) {
    if (state.cd > 0) {
      state.cd -= dt;
      if (state.cd <= 0) {
        state.cd = 0;
        state.ready = true;
        if (window.FX) window.FX.message('SATCHEL READY', '#ffcc44');
      }
    }

    const r2 = RESUPPLY_RADIUS * RESUPPLY_RADIUS;
    const cam = window.CAMERA;
    const playerTeam = (window.Manager && Manager.state) ? Manager.state.playerTeam : 'hunter';
    const ents = (window.Entities && Array.isArray(Entities.list)) ? Entities.list : [];

    for (let i = state.active.length - 1; i >= 0; i--) {
      const s = state.active[i];
      s.life -= dt;
      s.pulseTimer -= dt;

      if (!s.dying && s.pulseTimer <= 0) {
        s.pulseTimer = PULSE_INTERVAL;
        spawnPulse(s.x, s.z);
      }

      if (s.life <= 0 && !s.dying) {
        s.dying = true;
        s.dieT = 0.6;
      }

      if (s.dying) {
        s.dieT -= dt;
        const fade = Math.max(0, s.dieT / 0.6);
        s.mesh.scale.setScalar(fade);
        if (s.dieT <= 0) {
          state.active.splice(i, 1);
          SCENE.remove(s.mesh);
          disposeMesh(s.mesh);
          continue;
        }
      } else {
        const lowTime = s.life < 5;
        const blink = lowTime ? (Math.sin(s.life * 12) > 0 ? 1 : 0.3) : 1;
        if (s.mesh.userData.glows) {
          for (const g of s.mesh.userData.glows) {
            const pulse = 0.7 + Math.sin(performance.now() * 0.004 + s.x) * 0.3;
            g.material.opacity = 0.9 * pulse * blink;
            g.scale.setScalar(0.8 + pulse * 0.4);
          }
        }
        if (s.mesh.userData.ring) {
          s.mesh.userData.ring.material.opacity = 0.18 * (0.5 + Math.sin(performance.now() * 0.003) * 0.2) * blink;
        }
      }

      if (s.dying) continue;

      if (cam) {
        const dx = cam.position.x - s.x;
        const dz = cam.position.z - s.z;
        if (dx * dx + dz * dz < r2) {
          resupplyPlayer(dt);
        }
      }

      for (let j = 0; j < ents.length; j++) {
        const e = ents[j];
        if (e.dead || e.team !== playerTeam) continue;
        const m = e.mesh;
        if (!m) continue;
        const dx = m.position.x - s.x;
        const dz = m.position.z - s.z;
        if (dx * dx + dz * dz < r2) {
          resupplyEntity(e, dt);
        }
      }
    }

    for (let i = 0; i < pulses.length; i++) {
      const p = pulses[i];
      if (!p.active) continue;
      p.t += dt;
      const prog = p.t / PULSE_INTERVAL;
      if (prog >= 1) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      const sc = 0.3 + prog * (RESUPPLY_RADIUS / 0.8 - 0.3);
      p.mesh.scale.setScalar(sc);
      p.mesh.material.opacity = 0.7 * (1 - prog);
    }

    for (let i = 0; i < sparks.length; i++) {
      const sp = sparks[i];
      if (!sp.active) continue;
      sp.life -= dt;
      if (sp.life <= 0) {
        sp.active = false;
        sp.mesh.visible = false;
        continue;
      }
      sp.vy -= 5 * dt;
      sp.mesh.position.y += sp.vy * dt;
      const t = sp.life / 0.7;
      sp.mesh.material.opacity = Math.min(1, t * 1.5);
      sp.mesh.scale.setScalar(t);
    }

    updateHUD();
  }

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:16px;bottom:195px;font-size:11px;letter-spacing:2px;color:#ffcc44;text-shadow:0 1px 3px #000;z-index:6;';
  const label = document.createElement('div');
  label.textContent = 'AMMO SATCHEL [J]';
  hud.appendChild(label);
  const bar = document.createElement('div');
  bar.style.cssText = 'margin-top:3px;width:80px;height:5px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,200,60,0.3);border-radius:3px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#cc8822,#ffdd55);transition:width 0.05s;';
  bar.appendChild(fill);
  hud.appendChild(bar);
  document.getElementById('hud').appendChild(hud);

  function updateHUD() {
    if (state.ready) {
      fill.style.width = '100%';
      fill.style.background = 'linear-gradient(90deg,#cc8822,#ffdd55)';
      label.style.opacity = '1';
    } else {
      const pct = 1 - (state.cd / COOLDOWN);
      fill.style.width = (pct * 100) + '%';
      fill.style.background = 'linear-gradient(90deg,#554422,#886633)';
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'j' && e.key !== 'J') return;
    if (window.Manager && Manager.state && Manager.state.phase !== 'playing') return;
    if (!window.Player || !Player.state.locked) return;
    deploy();
  });

  function dispose() {
    for (const s of state.active) {
      SCENE.remove(s.mesh);
      disposeMesh(s.mesh);
    }
    state.active.length = 0;
    for (const p of pulses) {
      SCENE.remove(p.mesh);
      p.mesh.material.dispose();
    }
    for (const sp of sparks) {
      SCENE.remove(sp.mesh);
      sp.mesh.material.dispose();
    }
  }

  return { update, deploy, dispose, state };
})();

window.AmmoSatchel = AmmoSatchel;