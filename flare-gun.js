// flare-gun.js — FORESTWAR flare gun: single-shot arcing flare that ignites a burn zone and emits a bright team light
const THREE = window.THREE;
const SCENE = window.SCENE;
const FlareGun = (() => {
  const GRAVITY = 22;
  const LAUNCH_SPEED = 40;
  const FIRE_RATE = 1.5;
  const MAG_SIZE = 4;
  const RELOAD_TIME = 3.0;
  const SLOT = 6;
  const BURN_DURATION = 7;
  const BURN_RADIUS = 6;
  const BURN_DPS_ENTITY = 18;
  const BURN_TICK_INTERVAL = 0.4;
  const BURN_PLAYER_DPS = 4;
  const LIGHT_LIFETIME = 5;
  const LIGHT_INTENSITY = 4.5;
  const LIGHT_RANGE = 24;

  const state = {
    active: false,
    ammo: MAG_SIZE,
    reserve: 8,
    cd: 0,
    reloading: false,
    reloadT: 0,
    projectiles: [],
    burnZones: [],
    hud: null,
    barFill: null,
  };

  const FLARE_GEO = new THREE.CylinderGeometry(0.06, 0.06, 0.28, 6);
  FLARE_GEO.rotateX(Math.PI / 2);
  const FLARE_MAT = new THREE.MeshStandardMaterial({
    color: 0xff5522, roughness: 0.3, metalness: 0.5,
    emissive: 0xff4400, emissiveIntensity: 0.8,
  });
  const TAIL_GEO = new THREE.ConeGeometry(0.1, 0.5, 5);
  TAIL_GEO.rotateX(Math.PI / 2);
  const TAIL_MAT = new THREE.MeshBasicMaterial({
    color: 0xffaa44, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const SPARK_GEO = new THREE.SphereGeometry(0.1, 5, 4);
  const SPARK_MAT = new THREE.MeshBasicMaterial({
    color: 0xffcc55, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const GROUND_GEO = new THREE.CircleGeometry(BURN_RADIUS, 24);
  const GROUND_MAT = new THREE.MeshBasicMaterial({
    color: 0xff4400, transparent: true, opacity: 0.25,
    side: THREE.DoubleSide, depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const RING_GEO = new THREE.RingGeometry(BURN_RADIUS - 0.5, BURN_RADIUS, 32);
  const RING_MAT = new THREE.MeshBasicMaterial({
    color: 0xff7722, transparent: true, opacity: 0.5,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function getPlayerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function buildHUD() {
    const hud = document.createElement('div');
    hud.style.cssText = 'position:absolute;left:16px;bottom:200px;font-size:11px;letter-spacing:2px;color:#ff8844;text-shadow:0 1px 3px #000;z-index:6;';
    const label = document.createElement('div');
    label.textContent = 'FLARE GUN [Y]';
    hud.appendChild(label);
    const ammo = document.createElement('div');
    ammo.id = 'flareAmmo';
    ammo.style.cssText = 'margin-top:3px;font-size:12px;color:#ffaa66;';
    ammo.textContent = state.ammo + ' / ' + state.reserve;
    hud.appendChild(ammo);
    const bar = document.createElement('div');
    bar.style.cssText = 'margin-top:3px;width:80px;height:5px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,120,50,0.3);border-radius:3px;overflow:hidden;';
    const fill = document.createElement('div');
    fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#ff4422,#ffaa44);transition:width 0.05s;';
    bar.appendChild(fill);
    hud.appendChild(bar);
    document.getElementById('hud').appendChild(hud);
    state.hud = hud;
    state.ammoEl = ammo;
    state.barFill = fill;
  }

  function updateHUD() {
    if (!state.ammoEl) return;
    state.ammoEl.textContent = state.ammo + ' / ' + state.reserve;
    if (state.reloading) {
      state.barFill.style.width = ((1 - state.reloadT / RELOAD_TIME) * 100) + '%';
    } else {
      state.barFill.style.width = (state.cd > 0 ? (1 - state.cd / FIRE_RATE) * 100 : 100) + '%';
    }
  }

  function fire() {
    if (!state.active) return;
    if (state.reloading) return;
    if (state.cd > 0) return;
    if (state.ammo <= 0) {
      if (window.FX) window.FX.message('FLARE GUN EMPTY', '#ff6644');
      return;
    }
    state.ammo--;
    state.cd = FIRE_RATE;
    const cam = window.CAMERA;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    dir.y += 0.18;
    dir.normalize();

    const mesh = new THREE.Mesh(FLARE_GEO, FLARE_MAT);
    const tail = new THREE.Mesh(TAIL_GEO, TAIL_MAT.clone());
    mesh.add(tail);
    mesh.position.copy(cam.position).addScaledVector(dir, 1.2);
    SCENE.add(mesh);

    const light = new THREE.PointLight(0xff6633, 2.5, 14, 2);
    mesh.add(light);

    const vel = dir.clone().multiplyScalar(LAUNCH_SPEED);
    state.projectiles.push({ mesh, light, vel, life: 8, sparks: [] });

    if (window.Weapons && window.Weapons.applyRecoil) {
      window.Weapons.applyRecoil(0.035, 0.006);
    }
    if (window.FX) window.FX.muzzleFlash(cam.position.clone().addScaledVector(dir, 0.8), dir);
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(180, 0.15, 'sawtooth', 0.2, 600);
      window.Sound.tone(320, 0.1, 'square', 0.15, 1000);
    }
    updateHUD();
  }

  function startReload() {
    if (!state.active) return;
    if (state.reloading) return;
    if (state.ammo >= MAG_SIZE) return;
    if (state.reserve <= 0) {
      if (window.FX) window.FX.message('NO FLARES LEFT', '#ff6644');
      return;
    }
    state.reloading = true;
    state.reloadT = 0;
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(440, 0.1, 'sine', 0.15, 800);
    }
  }

  function finishReload() {
    const needed = MAG_SIZE - state.ammo;
    const take = Math.min(needed, state.reserve);
    state.ammo += take;
    state.reserve -= take;
    state.reloading = false;
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(660, 0.12, 'sine', 0.18, 1200);
    }
    updateHUD();
  }

  function detonate(pos) {
    const gy = groundY(pos.x, pos.z);
    const center = new THREE.Vector3(pos.x, gy, pos.z);

    const groundMesh = new THREE.Mesh(GROUND_GEO, GROUND_MAT.clone());
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.copy(center);
    groundMesh.position.y += 0.06;
    SCENE.add(groundMesh);

    const ringMesh = new THREE.Mesh(RING_GEO, RING_MAT.clone());
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.copy(center);
    ringMesh.position.y += 0.07;
    SCENE.add(ringMesh);

    const light = new THREE.PointLight(0xff5522, LIGHT_INTENSITY, LIGHT_RANGE, 2);
    light.position.copy(center);
    light.position.y += 3;
    SCENE.add(light);

    const flames = [];
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const r = Math.random() * BURN_RADIUS * 0.8;
      const fm = new THREE.Mesh(
        new THREE.ConeGeometry(0.4 + Math.random() * 0.3, 1.5 + Math.random() * 1.0, 5),
        new THREE.MeshBasicMaterial({
          color: 0xff6622, transparent: true, opacity: 0.8,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      fm.position.set(center.x + Math.cos(ang) * r, center.y + 0.75, center.z + Math.sin(ang) * r);
      SCENE.add(fm);
      flames.push({ mesh: fm, baseScale: 0.8 + Math.random() * 0.4, phase: Math.random() * Math.PI * 2 });
    }

    state.burnZones.push({
      center, groundMesh, ringMesh, light, flames,
      life: BURN_DURATION, tick: 0, lightLife: LIGHT_LIFETIME,
    });

    if (window.Craters && window.Craters.create) {
      window.Craters.create(center.x, center.z, BURN_RADIUS * 0.5);
    }

    if (window.FX && window.FX.burst) {
      window.FX.burst(center, new THREE.Vector3(0, 1, 0), 0xff6600, 20);
    }
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(120, 0.3, 'sawtooth', 0.25, 400);
      window.Sound.tone(80, 0.4, 'square', 0.2, 200);
    }
  }

  function damageEntities(x, z, dps) {
    const ents = (window.Entities && window.Entities.list) || [];
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead) continue;
      const m = e.mesh;
      if (!m) continue;
      const dx = m.position.x - x;
      const dz = m.position.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > BURN_RADIUS * BURN_RADIUS) continue;
      if (e.hp !== undefined) {
        e.hp -= dps;
        if (e.hp <= 0 && !e.dead) {
          if (window.Entities && window.Entities.kill) window.Entities.kill(e);
        }
      }
    }
    const team = getPlayerTeam();
    const player = window.Manager && window.Manager.state;
    if (player && player.playerAlive) {
      const cam = window.CAMERA;
      if (cam) {
        const dx = cam.position.x - x;
        const dz = cam.position.z - z;
        if (dx * dx + dz * dz < BURN_RADIUS * BURN_RADIUS) {
          player.playerHp -= BURN_PLAYER_DPS;
          if (player.playerHp <= 0 && player.playerAlive) {
            if (window.Manager && window.Manager.playerDie) window.Manager.playerDie();
          }
        }
      }
    }
  }

  function update(dt) {
    const clamped = Math.min(dt, 0.05);
    state.cd = Math.max(0, state.cd - clamped);

    if (state.reloading) {
      state.reloadT += clamped;
      if (state.reloadT >= RELOAD_TIME) finishReload();
    }
    updateHUD();

    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const p = state.projectiles[i];
      p.vel.y -= GRAVITY * clamped;
      p.mesh.position.x += p.vel.x * clamped;
      p.mesh.position.y += p.vel.y * clamped;
      p.mesh.position.z += p.vel.z * clamped;
      p.mesh.lookAt(
        p.mesh.position.x + p.vel.x,
        p.mesh.position.y + p.vel.y,
        p.mesh.position.z + p.vel.z
      );
      p.light.intensity = 2.5 + Math.sin(p.life * 20) * 0.5;

      if (Math.random() < 0.6) {
        const sp = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
        sp.position.copy(p.mesh.position);
        SCENE.add(sp);
        p.sparks.push({ mesh: sp, life: 0.3, vy: -1 + Math.random() * 2, vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3 });
      }
      for (let j = p.sparks.length - 1; j >= 0; j--) {
        const s = p.sparks[j];
        s.life -= clamped;
        s.mesh.position.x += s.vx * clamped;
        s.mesh.position.y += s.vy * clamped;
        s.mesh.position.z += s.vz * clamped;
        s.mesh.material.opacity = Math.max(0, s.life / 0.3) * 0.9;
        if (s.life <= 0) {
          SCENE.remove(s.mesh);
          s.mesh.material.dispose();
          p.sparks.splice(j, 1);
        }
      }

      const gy = groundY(p.mesh.position.x, p.mesh.position.z);
      p.life -= clamped;
      if (p.mesh.position.y <= gy + 0.1 || p.life <= 0) {
        detonate(p.mesh.position);
        SCENE.remove(p.mesh);
        for (const s of p.sparks) {
          SCENE.remove(s.mesh);
          s.mesh.material.dispose();
        }
        state.projectiles.splice(i, 1);
      }
    }

    for (let i = state.burnZones.length - 1; i >= 0; i--) {
      const z = state.burnZones[i];
      z.life -= clamped;
      z.tick -= clamped;
      z.lightLife -= clamped;

      if (z.tick <= 0) {
        z.tick = BURN_TICK_INTERVAL;
        damageEntities(z.center.x, z.center.z, BURN_DPS_ENTITY * BURN_TICK_INTERVAL);
      }

      const lifeFrac = Math.max(0, z.life / BURN_DURATION);
      z.groundMesh.material.opacity = 0.25 * lifeFrac;
      z.ringMesh.material.opacity = 0.5 * lifeFrac;
      const ringScale = 1 + (1 - lifeFrac) * 0.15;
      z.ringMesh.scale.setScalar(ringScale);

      if (z.lightLife > 0) {
        z.light.intensity = LIGHT_INTENSITY * (z.lightLife / LIGHT_LIFETIME) + Math.sin(z.life * 15) * 0.3;
      } else {
        z.light.intensity = 0;
      }

      for (const f of z.flames) {
        f.phase += clamped * 8;
        const flick = 0.7 + Math.sin(f.phase) * 0.3;
        f.mesh.scale.y = f.baseScale * flick * lifeFrac;
        f.mesh.scale.x = f.baseScale * (0.8 + Math.sin(f.phase * 1.3) * 0.2);
        f.mesh.material.opacity = 0.8 * lifeFrac;
      }

      if (z.life <= 0) {
        SCENE.remove(z.groundMesh);
        SCENE.remove(z.ringMesh);
        SCENE.remove(z.light);
        z.groundMesh.material.dispose();
        z.ringMesh.material.dispose();
        for (const f of z.flames) {
          SCENE.remove(f.mesh);
          f.mesh.geometry.dispose();
          f.mesh.material.dispose();
        }
        state.burnZones.splice(i, 1);
      }
    }
  }

  function setActive(on) {
    state.active = on;
    if (state.hud) state.hud.style.opacity = on ? '1' : '0.4';
  }

  function init() {
    buildHUD();
    window.addEventListener('keydown', (e) => {
      if (!state.active) return;
      if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
      if (!window.Player || !Player.state.locked) return;
      if (e.key === 'r' || e.key === 'R') startReload();
    });
  }

  init();

  return { fire, startReload, update, setActive, state,
    get slot() { return SLOT; },
    get magSize() { return MAG_SIZE; },
  };
})();
window.FlareGun = FlareGun;