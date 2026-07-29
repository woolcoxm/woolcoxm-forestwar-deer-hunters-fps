// weapons.js — FORESTWAR weapon systems: rifle hitscan, rocket launcher, grenade launcher, recoil
const Weapons = (() => {
  const THREE = window.THREE;
  const SCENE = window.SCENE;
  const CAMERA = window.CAMERA;

  const RIFLE = {
    name: 'RIFLE',
    damage: 22,
    range: 120,
    fireRate: 0.12,
    magSize: 30,
    reload: 1.6,
    spread: 0.012,
    auto: true,
    recoilV: 0.013,
    recoilH: 0.006,
    recovery: 9.0,
  };
  const ROCKET = {
    name: 'ROCKETS',
    damage: 85,
    splashRadius: 7,
    fireRate: 0.7,
    magSize: 4,
    reload: 2.4,
    rocketSpeed: 48,
    recoilV: 0.045,
    recoilH: 0.006,
    recovery: 6.0,
  };
  const GRENADE = {
    name: 'GRENADES',
    damage: 70,
    splashRadius: 6,
    fireRate: 0.55,
    magSize: 6,
    reload: 2.0,
    launchSpeed: 24,
    bounce: 0.45,
    armTime: 0.35,
    recoilV: 0.028,
    recoilH: 0.008,
    recovery: 7.0,
  };

  const state = {
    slot: 0,
    slots: [
      Object.assign({}, RIFLE, { ammo: 30, totalAmmo: 120, reloading: false, reloadTimer: 0, cd: 0 }),
      Object.assign({}, ROCKET, { ammo: 4, totalAmmo: 12, reloading: false, reloadTimer: 0, cd: 0 }),
      Object.assign({}, GRENADE, { ammo: 6, totalAmmo: 18, reloading: false, reloadTimer: 0, cd: 0 }),
    ],
    active: null,
    recoilOffset: 0,
    recoilHOffset: 0,
    swayPhase: 0,
    swayTime: 0,
  };
  state.active = state.slots[0];

  const rockets = [];
  const grenades = [];
  const trails = [];

  const ROCKET_GEO = new THREE.CylinderGeometry(0.1, 0.1, 0.6, 6);
  ROCKET_GEO.rotateX(Math.PI / 2);
  const ROCKET_MAT = new THREE.MeshStandardMaterial({ color: 0x556633, roughness: 0.5, metalness: 0.4 });
  const TIP_GEO = new THREE.ConeGeometry(0.11, 0.3, 6);
  const TIP_MAT = new THREE.MeshStandardMaterial({ color: 0x883322, roughness: 0.4 });
  const SMOKE_GEO = new THREE.SphereGeometry(0.2, 5, 4);
  const SMOKE_MAT = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true });

  const GRENADE_GEO = new THREE.SphereGeometry(0.14, 8, 6);
  const GRENADE_MAT = new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.6, metalness: 0.3, emissive: 0x0a0a0a });
  const GRENADE_RING_GEO = new THREE.TorusGeometry(0.14, 0.03, 5, 12);
  const GRENADE_RING_MAT = new THREE.MeshStandardMaterial({ color: 0x1a2a1a, roughness: 0.7 });
  const GRENADE_GLOW_GEO = new THREE.SphereGeometry(0.2, 6, 5);
  const GRENADE_GLOW_MAT = new THREE.MeshBasicMaterial({ color: 0xff4422, transparent: true, opacity: 0.5 });

  const MUZZLE_REF = new THREE.Vector3(0.2, -0.18, -0.8);

  const weaponHUD = document.createElement('div');
  weaponHUD.style.cssText = 'position:absolute;bottom:30px;left:50%;transform:translateX(-50%);display:flex;gap:14px;font-size:13px;letter-spacing:2px;text-shadow:0 2px 4px #000;z-index:6;';
  document.getElementById('hud').appendChild(weaponHUD);
  const slotsEls = [];
  for (let i = 0; i < 3; i++) {
    const el = document.createElement('div');
    el.style.cssText = 'padding:4px 10px;border:1px solid rgba(150,200,150,0.3);border-radius:4px;background:rgba(0,0,0,0.45);transition:all 0.15s;';
    weaponHUD.appendChild(el);
    slotsEls.push(el);
  }

  const reloadEl = document.createElement('div');
  reloadEl.style.cssText = 'position:absolute;bottom:64px;left:50%;transform:translateX(-50%);font-size:12px;letter-spacing:3px;color:#ffaa44;text-shadow:0 2px 4px #000;opacity:0;transition:opacity 0.2s;z-index:6;';
  document.getElementById('hud').appendChild(reloadEl);

  const _ray = new THREE.Raycaster();
  const _muzzle = new THREE.Vector3();
  const _camDir = new THREE.Vector3();
  const _spread = new THREE.Vector3();
  const _hit = new THREE.Vector3();
  const _dist = new THREE.Vector3();
  const _tmpHit = new THREE.Vector3();
  const _tmpCenter = new THREE.Vector3();
  const HEADSHOT_MULT = 2.0;

  // Rank progression grants a per-tier damage multiplier; read live so a
  // mid-fight promotion immediately makes hits hit harder.
  function dmgMult() {
    return (window.Ranks && window.Ranks.getBuffs) ? (window.Ranks.getBuffs().damage || 1) : 1;
  }

  function getMuzzle() {
    CAMERA.getWorldDirection(_camDir);
    _muzzle.copy(CAMERA.position).addScaledVector(_camDir, 0.8);
    _muzzle.y -= 0.15;
    return _muzzle;
  }

  function buildViewModel() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.7), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.6 }));
    body.position.set(0.22, -0.22, -0.55);
    g.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.8 }));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.22, -0.18, -0.9);
    g.add(barrel);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.25), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 }));
    stock.position.set(0.22, -0.22, -0.2);
    g.add(stock);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.06), new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.8 }));
    grip.position.set(0.22, -0.32, -0.4);
    grip.rotation.x = 0.35;
    g.add(grip);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.06), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }));
    sight.position.set(0.22, -0.1, -0.45);
    g.add(sight);
    CAMERA.add(g);
    return g;
  }

  const viewModel = buildViewModel();
  const viewBase = new THREE.Vector3(0.22, -0.22, -0.55);

  function updateViewModel(dt, moving) {
    if (!viewModel) return;
    const sway = state.active ? state.active.recoilOffset : 0;
    state.swayTime += dt;
    const breath = Math.sin(state.swayTime * 1.5) * 0.004;
    const bob = moving ? Math.sin(state.swayTime * 8) * 0.008 : 0;
    viewModel.position.x = viewBase.x + Math.sin(state.swayTime * 1.3) * 0.003 + state.recoilHOffset * 0.15;
    viewModel.position.y = viewBase.y + breath + bob - sway * 0.5;
    viewModel.position.z = viewBase.z + sway * 0.8;
    viewModel.rotation.x = sway * 2.5 + (moving ? Math.cos(state.swayTime * 8) * 0.015 : 0);
  }

  function updateRecoil(dt) {
    if (state.recoilOffset > 0) {
      state.recoilOffset -= dt * (state.active ? state.active.recovery : 8);
      if (state.recoilOffset < 0) state.recoilOffset = 0;
    }
    if (Math.abs(state.recoilHOffset) > 0.0001) {
      state.recoilHOffset *= Math.max(0, 1 - dt * (state.active ? state.active.recovery * 0.8 : 6));
      if (Math.abs(state.recoilHOffset) < 0.0005) state.recoilHOffset = 0;
    }
    if (window.Player && Player.state) {
      Player.state.pitch -= state.recoilOffset * 0.4;
      Player.state.yaw += state.recoilHOffset * 0.3;
    }
  }

  function applyRecoil(weapon) {
    state.recoilOffset += weapon.recoilV;
    state.recoilHOffset += (Math.random() - 0.5) * weapon.recoilH * 2;
    if (state.recoilOffset > 0.08) state.recoilOffset = 0.08;
  }

  function switchSlot(i) {
    if (i < 0 || i > 2 || i === state.slot) return;
    state.slot = i;
    state.active = state.slots[i];
    state.recoilOffset = 0;
    state.recoilHOffset = 0;
    if (window.Sound) window.Sound.tone(600 + i * 120, 0.06, 'square', 0.12, 2000);
    updateHUD();
  }

  function updateHUD() {
    const names = ['1 RIFLE', '2 ROCKETS', '3 GRENADES'];
    for (let i = 0; i < 3; i++) {
      const s = state.slots[i];
      let label = names[i];
      if (s) label += ' ' + s.ammo + '/' + s.totalAmmo;
      slotsEls[i].textContent = label;
      if (i === state.slot) {
        slotsEls[i].style.background = 'rgba(80,140,80,0.55)';
        slotsEls[i].style.borderColor = 'rgba(180,255,180,0.7)';
        slotsEls[i].style.color = '#fff';
      } else {
        slotsEls[i].style.background = 'rgba(0,0,0,0.45)';
        slotsEls[i].style.borderColor = 'rgba(150,200,150,0.3)';
        slotsEls[i].style.color = '#aaa';
      }
    }
    if (state.active && state.active.reloading) {
      reloadEl.style.opacity = '1';
      reloadEl.textContent = 'RELOADING ' + state.active.name + '...';
    } else {
      reloadEl.style.opacity = '0';
    }
  }

  function reload() {
    const w = state.active;
    if (!w || w.reloading) return;
    if (w.ammo >= w.magSize || w.totalAmmo <= 0) return;
    w.reloading = true;
    w.reloadTimer = w.reload;
    updateHUD();
    if (window.Sound) window.Sound.tone(300, 0.08, 'square', 0.15, 1500);
  }

  function tryFire() {
    const w = state.active;
    if (!w || !window.Player || !Player.state.locked) return;
    if (window.Manager && Manager.state.phase !== 'playing') return;
    if (window.Manager && !Manager.state.playerAlive) return;
    if (w.reloading || w.cd > 0) return;
    if (w.ammo <= 0) {
      if (window.FX) window.FX.message('OUT OF AMMO — [R]', '#ff6644');
      if (window.Sound) window.Sound.tone(180, 0.12, 'sawtooth', 0.18, 500);
      w.cd = 0.4;
      return;
    }
    w.ammo--;
    const _frMult = (window.Adrenaline && Adrenaline.isActive()) ? Adrenaline.getFireRateMult() : 1;
    w.cd = w.fireRate / _frMult;
    applyRecoil(w);

    if (state.slot === 0) fireRifle(w);
    else if (state.slot === 1) fireRocket(w);
    else if (state.slot === 2) fireGrenade(w);
    updateHUD();
  }

  function fireRifle(w) {
    CAMERA.getWorldDirection(_camDir);
    _spread.set(
      (Math.random() - 0.5) * w.spread,
      (Math.random() - 0.5) * w.spread,
      (Math.random() - 0.5) * w.spread
    );
    _ray.set(CAMERA.position, _camDir.clone().add(_spread).normalize());
    _ray.far = w.range;
    const ents = (window.Entities && window.Entities.list) || [];
    const playerTeam = window.Manager && window.Manager.state.playerTeam;
    let bestEnt = null, bestT = Infinity, bestHead = false;
    for (const e of ents) {
      if (!e.mesh || e.dead) continue;
      if (e.team === playerTeam) continue;
      const ep = e.mesh.position;
      // Body hit zone — a sphere at chest height.
      const bodyHit = _ray.ray.intersectSphere(new THREE.Sphere(_tmpCenter.set(ep.x, ep.y + 1.0, ep.z), 0.7), _tmpHit);
      if (bodyHit) {
        const t = _ray.ray.origin.distanceTo(bodyHit);
        if (t < bestT) { bestT = t; bestEnt = e; bestHead = false; }
      }
      // Head hit zone — a clean shot here is a critical hit.
      const headY = ep.y + (e.team === 'deer' ? 1.55 : 1.72);
      const headHit = _ray.ray.intersectSphere(new THREE.Sphere(_tmpCenter.set(ep.x, headY, ep.z), 0.32), _tmpHit);
      if (headHit) {
        const t = _ray.ray.origin.distanceTo(headHit);
        if (t < bestT) { bestT = t; bestEnt = e; bestHead = true; }
      }
    }
    let groundT = Infinity;
    const ground = _ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    if (ground) groundT = _ray.ray.origin.distanceTo(ground);
    const trees = window.TREES || [];
    for (const t of trees) {
      const hit = _ray.ray.intersectSphere(new THREE.Sphere(_tmpCenter.set(t.x, 2, t.z), t.r), _tmpHit);
      if (hit) {
        const tt = _ray.ray.origin.distanceTo(hit);
        if (tt < bestT) { bestT = tt; bestEnt = null; bestHead = false; }
      }
    }
    if (groundT < bestT) { bestEnt = null; bestHead = false; }

    // Ambient wildlife: a clean round can drop a roaming deer. shootRay only
    // damages a deer if it is the closest thing along the ray (closer than any
    // combatant, tree or the ground), so forest cover still matters — and the
    // rest of the herd bolts from the shot.
    if (window.Herd && window.Herd.shootRay) {
      const hd = window.Herd.shootRay(CAMERA.position, _ray.ray.direction, w.range, w.damage * dmgMult(), bestT);
      if (hd < bestT) {
        bestEnt = null;
        bestHead = false;
        if (window.CombatText && window.CombatText.spawn) {
          const ip = _ray.ray.at(hd, _hit);
          window.CombatText.spawn(ip.clone().setY(ip.y + 0.6), Math.round(w.damage * dmgMult()), { crit: false });
        }
      }
    }

    // Comeback portal: the rift is a tall energy torus, so test a fat sphere
    // at its centre. A round through it chips the rift shut (closer hit wins).
    if (window.Portals && window.Portals.getPortal) {
      const portal = window.Portals.getPortal();
      if (portal) {
        const ph = _ray.ray.intersectSphere(new THREE.Sphere(_tmpCenter.set(portal.x, portal.gy + 2.75, portal.z), 2.4), _tmpHit);
        if (ph) {
          const tt = _ray.ray.origin.distanceTo(ph);
          if (tt < bestT) {
            const pdmg = w.damage * dmgMult();
            window.Portals.takeDamage(pdmg);
            bestEnt = null;
            bestHead = false;
            bestT = tt;
            if (window.CombatText && window.CombatText.spawn) {
              window.CombatText.spawn(ph.clone(), Math.round(pdmg), { crit: false });
            }
            if (window.FX) window.FX.burst(ph, new THREE.Vector3(0, 1, 0), portal.team === 'deer' ? 0xffaa44 : 0x66aaff, 6);
          }
        }
      }
    }

    const origin = getMuzzle();
    if (window.FX) window.FX.muzzleFlash(origin, _camDir);
    if (window.Suppression) {
      const tx = bestEnt ? bestEnt.mesh.position.x : (ground ? ground.x : 0);
      const tz = bestEnt ? bestEnt.mesh.position.z : (ground ? ground.z : 0);
      window.Suppression.applyNearMiss(tx, tz, playerTeam);
    }
    if (window.Sound) window.Sound.shot();
    if (bestEnt) {
      const dmg = (bestHead ? w.damage * HEADSHOT_MULT : w.damage) * dmgMult();
      const impact = _ray.ray.at(bestT, _tmpHit);
      window.Entities.damage(bestEnt, dmg, impact, { headshot: bestHead, byPlayer: true, team: playerTeam });
    } else if (ground && groundT < w.range && window.Craters && Math.random() < 0.2) {
      window.Craters.create(ground.x, ground.z, 0.4);
    }
  }

  function fireRocket(w) {
    CAMERA.getWorldDirection(_camDir);
    const origin = getMuzzle();
    const rocket = {
      mesh: makeRocketMesh(),
      pos: origin.clone(),
      vel: _camDir.clone().multiplyScalar(w.rocketSpeed),
      life: 4,
      damage: w.damage * dmgMult(),
      radius: w.splashRadius,
    };
    rocket.mesh.position.copy(origin);
    SCENE.add(rocket.mesh);
    rockets.push(rocket);
    if (window.FX) window.FX.muzzleFlash(origin, _camDir);
    if (window.Sound) window.Sound.rocket();
  }

  function makeRocketMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(ROCKET_GEO, ROCKET_MAT);
    g.add(body);
    const tip = new THREE.Mesh(TIP_GEO, TIP_MAT);
    tip.position.z = -0.4;
    tip.rotation.x = -Math.PI / 2;
    g.add(tip);
    return g;
  }

  function fireGrenade(w) {
    CAMERA.getWorldDirection(_camDir);
    const origin = getMuzzle();
    const grenade = {
      mesh: makeGrenadeMesh(),
      pos: origin.clone(),
      vel: _camDir.clone().multiplyScalar(w.launchSpeed),
      life: 5,
      damage: w.damage * dmgMult(),
      radius: w.splashRadius,
      bounced: false,
      armTimer: w.armTime,
    };
    grenade.mesh.position.copy(origin);
    SCENE.add(grenade.mesh);
    grenades.push(grenade);
    if (window.FX) window.FX.muzzleFlash(origin, _camDir);
    if (window.Sound) window.Sound.tone(200, 0.1, 'sawtooth', 0.2, 800);
  }

  function makeGrenadeMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(GRENADE_GEO, GRENADE_MAT);
    g.add(body);
    const ring = new THREE.Mesh(GRENADE_RING_GEO, GRENADE_RING_MAT);
    ring.position.y = 0.14;
    g.add(ring);
    const glow = new THREE.Mesh(GRENADE_GLOW_GEO, GRENADE_GLOW_MAT.clone());
    g.add(glow);
    g.userData.glow = glow;
    return g;
  }

  function explodeRocket(r) {
    const ents = (window.Entities && window.Entities.list) || [];
    const pt = window.Manager && Manager.state.playerTeam;
    for (const e of ents) {
      if (!e.mesh || e.dead) continue;
      const d = e.mesh.position.distanceTo(r.pos);
      if (d < r.radius) {
        const falloff = 1 - d / r.radius;
        const pos = e.mesh.position.clone();
        window.Entities.damage(e, r.damage * falloff, pos, { byPlayer: !!pt, team: pt });
      }
    }
    if (pt) {
      const enemies = ents.filter(e => !e.dead && e.team !== pt);
      for (const e of enemies) {
        const d = e.mesh.position.distanceTo(r.pos);
        if (d < r.radius + 3 && window.Suppression) {
          window.Suppression.applyExplosion(r.pos.x, r.pos.z, pt);
          break;
        }
      }
    }
    if (window.Boss && Boss.active && Boss.mesh) {
      const d = Boss.mesh.position.distanceTo(r.pos);
      if (d < r.radius) Boss.damage(r.damage * (1 - d / r.radius), r.pos);
    }
    if (window.APC && APC.alive && APC.mesh) {
      const d = APC.mesh.position.distanceTo(r.pos);
      if (d < r.radius + 2) APC.damage(r.damage * 0.6 * (1 - d / (r.radius + 2)));
    }
    if (window.Portals && window.Portals.getPortal) {
      const portal = window.Portals.getPortal();
      if (portal) {
        const dx = portal.x - r.pos.x, dz = portal.z - r.pos.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < r.radius + 3) window.Portals.takeDamage(r.damage * (1 - d / (r.radius + 3)));
      }
    }
    if (window.Fire) window.Fire.ignite(r.pos.x, r.pos.z, r.radius);
    if (window.Craters) window.Craters.create(r.pos.x, r.pos.z, r.radius * 0.7);
    // The blast panics nearby wildlife — herds stampede away from the epicentre.
    if (window.scatterHerds) window.scatterHerds(r.pos.x, r.pos.z);
    if (window.BloodPools) {
      for (const e of ents) {
        if (e.dead && e.mesh.position.distanceTo(r.pos) < r.radius) {
          window.BloodPools.spawn(e.mesh.position.x, e.mesh.position.z, 1.2);
        }
      }
    }
    if (window.FX) {
      window.FX.explosion(r.pos, r.radius);
    }
    if (window.Sound) window.Sound.explosion();
    if (window.Weather) window.Weather.shake(r.pos, r.radius);
    const playerPos = window.CAMERA.position;
    const pd = playerPos.distanceTo(r.pos);
    if (pd < r.radius && window.Manager && Manager.state.playerAlive) {
      const falloff = 1 - pd / r.radius;
      window.Manager.damagePlayer(r.damage * 0.5 * falloff, r.pos.x, r.pos.z);
    }
  }

  function explodeGrenade(g) {
    explodeRocket({ pos: g.pos, damage: g.damage * 0.85, radius: g.radius });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === '1') switchSlot(0);
    else if (e.key === '2') switchSlot(1);
    else if (e.key === '3') switchSlot(2);
    else if (e.key === 'r' || e.key === 'R') reload();
  });

  let firing = false;
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (!window.Player || !Player.state.locked) return;
    if (window.Chaingun && window.Chaingun.isMounted && window.Chaingun.isMounted()) return;
    firing = true;
    tryFire();
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) firing = false;
  });

  function updateRockets(dt) {
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.life -= dt;
      r.pos.addScaledVector(r.vel, dt);
      r.mesh.position.copy(r.pos);
      r.mesh.lookAt(r.pos.clone().add(r.vel));
      if (window.groundHeight) {
        const gy = window.groundHeight(r.pos.x, r.pos.z);
        if (r.pos.y <= gy || r.life <= 0) {
          explodeRocket(r);
          recycleMesh(r.mesh);
          rockets.splice(i, 1);
          continue;
        }
      }
      if (Math.random() < 0.6) {
        const s = new THREE.Mesh(SMOKE_GEO, SMOKE_MAT.clone());
        s.position.copy(r.pos);
        s.userData.life = 0.4;
        s.userData.maxLife = 0.4;
        SCENE.add(s);
        trails.push(s);
      }
      const ents = (window.Entities && window.Entities.list) || [];
      for (const e of ents) {
        if (!e.mesh || e.dead) continue;
        if (r.pos.distanceTo(e.mesh.position) < (e.radius || 0.6)) {
          explodeRocket(r);
          recycleMesh(r.mesh);
          rockets.splice(i, 1);
          break;
        }
      }
      const trees = window.TREES || [];
      for (const t of trees) {
        const dx = r.pos.x - t.x, dz = r.pos.z - t.z;
        if (dx * dx + dz * dz < t.r * t.r && r.pos.y < 8) {
          explodeRocket(r);
          recycleMesh(r.mesh);
          rockets.splice(i, 1);
          break;
        }
      }
    }
  }

  function updateGrenades(dt) {
    for (let i = grenades.length - 1; i >= 0; i--) {
      const g = grenades[i];
      g.life -= dt;
      g.armTimer -= dt;
      g.vel.y -= 18 * dt;
      const prev = g.pos.clone();
      g.pos.addScaledVector(g.vel, dt);
      if (window.groundHeight) {
        const gy = window.groundHeight(g.pos.x, g.pos.z);
        if (g.pos.y <= gy + 0.14) {
          g.pos.y = gy + 0.14;
          if (Math.abs(g.vel.y) > 1.5) {
            g.vel.y *= -0.45;
            g.vel.x *= 0.7;
            g.vel.z *= 0.7;
          } else {
            g.vel.set(0, 0, 0);
          }
        }
      }
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += dt * 5;
      g.mesh.rotation.z += dt * 3;
      if (g.mesh.userData.glow) {
        const pulse = 0.5 + Math.sin(performance.now() * 0.012) * 0.3;
        g.mesh.userData.glow.material.opacity = g.armTimer > 0 ? 0.3 : pulse;
      }
      if (g.armTimer <= 0) {
        const ents = (window.Entities && window.Entities.list) || [];
        for (const e of ents) {
          if (!e.mesh || e.dead) continue;
          if (g.pos.distanceTo(e.mesh.position) < (e.radius || 0.6) + 0.3) {
            explodeGrenade(g);
            recycleMesh(g.mesh);
            grenades.splice(i, 1);
            break;
          }
        }
      }
      if (g.life <= 0) {
        explodeGrenade(g);
        recycleMesh(g.mesh);
        grenades.splice(i, 1);
      }
    }
  }

  function updateTrails(dt) {
    for (let i = trails.length - 1; i >= 0; i--) {
      const t = trails[i];
      t.userData.life -= dt;
      if (t.userData.life <= 0) {
        SCENE.remove(t);
        trails.splice(i, 1);
        continue;
      }
      const f = t.userData.life / t.userData.maxLife;
      t.material.opacity = f * 0.5;
      t.scale.setScalar(1 + (1 - f) * 2);
    }
  }

  function recycleMesh(m) {
    SCENE.remove(m);
  }

  function update(dt) {
    for (const s of state.slots) {
      if (s.cd > 0) s.cd = Math.max(0, s.cd - dt);
      if (s.reloading) {
        s.reloadTimer -= dt;
        if (s.reloadTimer <= 0) {
          const needed = s.magSize - s.ammo;
          const take = Math.min(needed, s.totalAmmo);
          s.ammo += take;
          s.totalAmmo -= take;
          s.reloading = false;
          updateHUD();
        }
      }
    }
    if (firing && state.active && state.active.auto && state.active.ammo > 0 && !state.active.reloading && state.active.cd <= 0 && !(window.Chaingun && window.Chaingun.isMounted && window.Chaingun.isMounted())) {
      tryFire();
    }
    updateRecoil(dt);
    const player = window.Player;
    const moving = player && player.state && (player.state.vel.x !== 0 || player.state.vel.z !== 0);
    updateViewModel(dt, moving);
    updateRockets(dt);
    updateGrenades(dt);
    updateTrails(dt);
  }

  function init() {
    updateHUD();
  }

  return { init, update, tryFire, reload, switchSlot, updateHUD, get state() { return state; } };
})();
window.Weapons = Weapons;