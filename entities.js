// entities.js — deer & hunter NPCs with team AI, health, combat, buck-rush, crate-seeking
const THREE = window.THREE;
const Entities = (() => {
  const list = [];
  const corpses = [];
  const bullets = [];
  const particles = [];
  const charges = [];
  let nextId = 1;

  const DEER_BODY = new THREE.CapsuleGeometry(0.28, 0.9, 4, 8);
  const DEER_MAT = new THREE.MeshStandardMaterial({ color: 0xb07a44, roughness: 0.9 });
  const HUNTER_BODY = new THREE.CapsuleGeometry(0.3, 1.0, 4, 8);
  const HUNTER_MAT = new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.85 });
  const ANTLER_GEO = new THREE.ConeGeometry(0.05, 0.5, 4);
  const ANTLER_MAT = new THREE.MeshStandardMaterial({ color: 0xddd0b0, roughness: 0.7 });
  const CHARGE_MAT = new THREE.MeshBasicMaterial({ color: 0xff6622, transparent: true, opacity: 0.7 });
  const TRAIL_GEO = new THREE.SphereGeometry(0.15, 4, 3);
  const CORPSE_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2a1e, roughness: 1 });

  function groundY(x, z) {
    if (typeof window.groundHeight === 'function') return window.groundHeight(x, z);
    return 0;
  }

  function spawn(team, x, z) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(team === 'deer' ? DEER_BODY : HUNTER_BODY, team === 'deer' ? DEER_MAT : HUNTER_MAT);
    body.castShadow = true;
    body.position.y = team === 'deer' ? 0.9 : 1.05;
    mesh.add(body);

    if (team === 'deer') {
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), DEER_MAT);
      head.position.set(0, 1.55, 0.3);
      mesh.add(head);
      for (const sx of [-1, 1]) {
        const ant = new THREE.Mesh(ANTLER_GEO, ANTLER_MAT);
        ant.position.set(sx * 0.12, 1.85, 0.3);
        ant.rotation.z = sx * 0.5;
        mesh.add(ant);
      }
      const aura = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 5), CHARGE_MAT.clone());
      aura.material.opacity = 0;
      aura.position.y = 1.0;
      aura.visible = false;
      mesh.add(aura);
      mesh.userData.aura = aura;
    } else {
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), HUNTER_MAT);
      head.position.set(0, 1.72, 0.25);
      mesh.add(head);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.12), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 }));
      visor.position.set(0, 1.72, 0.42);
      mesh.add(visor);
      const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.7), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
      rifle.position.set(0.22, 1.1, 0.25);
      mesh.add(rifle);
    }

    mesh.position.set(x, groundY(x, z), z);
    window.SCENE.add(mesh);

    const e = {
      id: nextId++,
      team,
      mesh,
      dead: false,
      hp: team === 'deer' ? 75 : 100,
      maxHp: team === 'deer' ? 75 : 100,
      speed: team === 'deer' ? 6.5 : 4.5,
      fireCd: 0,
      fireRate: team === 'deer' ? 2.0 : 1.5,
      damage: team === 'deer' ? 16 : 12,
      range: team === 'deer' ? 4 : 40,
      ammo: team === 'deer' ? 999 : 90,
      maxAmmo: team === 'deer' ? 999 : 90,
      target: null,
      state: 'idle',
      wanderDir: Math.random() * Math.PI * 2,
      wanderCd: 0,
      vel: new THREE.Vector3(),
      hasAntlers: team === 'deer',
      chargeCd: team === 'deer' ? 6 + Math.random() * 4 : 0,
      charging: false,
      chargeTime: 0,
      deathTimer: 0,
      facing: Math.random() * Math.PI * 2,
      crateSeek: 0,
      takeDamage(dmg, src) {
        const sp = (src && typeof src === 'object' && 'x' in src && 'y' in src) ? src : null;
        applyDamage(e, dmg, sp);
      },
    };
    mesh.userData.entity = e;
    list.push(e);
    return e;
  }

  function nearestEnemy(e) {
    let best = null, bestD = Infinity;
    // Smoke screens break line of sight: anything behind (or inside) a cloud is concealed.
    const smokeLOS = (typeof window.smokeBlocksLOS === 'function') ? window.smokeBlocksLOS : null;
    const ex = e.mesh.position.x, ez = e.mesh.position.z;
    for (const o of list) {
      if (o.dead || o.team === e.team) continue;
      if (smokeLOS && smokeLOS(ex, ez, o.mesh.position.x, o.mesh.position.z)) continue;
      const dx = o.mesh.position.x - ex;
      const dz = o.mesh.position.z - ez;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = o; }
    }
    const px = window.CAMERA.position.x, pz = window.CAMERA.position.z;
    if (window.Manager && window.Manager.state && window.Manager.state.playerAlive && window.Manager.state.playerTeam !== e.team) {
      const playerHidden = smokeLOS ? smokeLOS(ex, ez, px, pz) : false;
      if (!playerHidden) {
        const dx = px - ex, dz = pz - ez;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = { mesh: { position: window.CAMERA.position }, isPlayer: true };
        }
      }
    }
    if (window.Boss && window.Boss.boss && window.Boss.boss.active && e.team !== 'deer') {
      const b = window.Boss.boss;
      const dx = b.mesh.position.x - ex;
      const dz = b.mesh.position.z - ez;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = { mesh: b.mesh, isBoss: true }; }
    }
    return { ent: best, dist: Math.sqrt(bestD) };
  }

  function findNearestCrate(e) {
    if (!window.Pickups || !window.Pickups.crates) return null;
    let best = null, bestD = Infinity;
    const lowHp = e.hp < e.maxHp * 0.45;
    const lowAmmo = !e.isPlayer && e.ammo !== 999 && e.ammo < 15;
    if (!lowHp && !lowAmmo) return null;
    for (const c of window.Pickups.crates) {
      if (!c.alive || c.taken) continue;
      const dx = c.group.position.x - e.mesh.position.x;
      const dz = c.group.position.z - e.mesh.position.z;
      const d = dx * dx + dz * dz;
      const wantType = lowHp ? 'health' : 'ammo';
      if (c.type === wantType && d < bestD && d < 900) { bestD = d; best = c; }
    }
    return best ? { crate: best, dist: Math.sqrt(bestD) } : null;
  }

  function collideWorld(x, z, radius) {
    const trees = window.TREES || [];
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      const dx = x - t.x, dz = z - t.z;
      const rr = t.r + radius;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    const wc = window.worldColliders || [];
    for (let i = 0; i < wc.length; i++) {
      const c = wc[i];
      const dx = x - c.x, dz = z - c.z;
      const rr = c.r + radius;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }

  function applyDamage(e, dmg, srcPos) {
    if (e.dead) return;
    e.hp -= dmg;
    if (srcPos && window.FX) {
      const n = srcPos.clone().sub(e.mesh.position).normalize();
      window.FX.bloodBurst(e.mesh.position.clone().setY(1.2), n);
    }
    if (e.hp <= 0) killEntity(e);
  }

  function killEntity(e) {
    e.dead = true;
    e.mesh.rotation.z = Math.PI / 2;
    e.mesh.position.y = groundY(e.mesh.position.x, e.mesh.position.z) + 0.4;
    e.deathTimer = 8;
    // Gore decal: a persistent blood pool marks the spot this fighter fell.
    if (window.BloodPools && window.BloodPools.spawn) {
      window.BloodPools.spawn(e.mesh.position.x, e.mesh.position.z, 1.5);
    }
    corpses.push(e);
    if (window.Manager && window.Manager.registerKill) window.Manager.registerKill(e.team, e);
    if (window.FX && window.FX.message) {
      window.FX.message((e.team === 'deer' ? 'DEER' : 'HUNTER') + ' DOWN', e.team === 'deer' ? '#f0c98a' : '#c9d8ff');
    }
    if (e.mesh.userData.aura) e.mesh.userData.aura.visible = false;
  }

  // ---- Public damage API ---------------------------------------------------
  // Many modules (weapons.js rifle/rockets, turret.js, weather.js lightning,
  // chain-lightning/dmr, bleed DoT) call through here. We normalise the assorted
  // calling conventions and route to the internal applyDamage/killEntity.
  const HEADSHOT_MULT = 2.0;
  //   damage(entity, amount, srcInfo, opts)
  //     srcInfo: Vector3 (impact pos) | team string | null
  //     opts:    { headshot, byPlayer, team } | boolean(headshot) | team string
  function damage(entity, amount, srcInfo, opts) {
    if (!entity || entity.dead || amount <= 0) return;
    let headshot = false;
    let byPlayer = false;
    let srcTeam = null;
    if (typeof srcInfo === 'string') { srcTeam = srcInfo; srcInfo = null; }
    if (opts && typeof opts === 'object') {
      if (opts.headshot) headshot = true;
      if (opts.byPlayer) byPlayer = true;
      if (opts.team) srcTeam = opts.team;
    } else if (opts === true) {
      headshot = true;            // chain-lightning style 4th-arg
    } else if (typeof opts === 'string') {
      srcTeam = opts;             // dmr style: source team as 4th arg
    }
    const playerTeam = (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
    if (byPlayer && !srcTeam) srcTeam = playerTeam;

    const dmg = headshot ? amount * HEADSHOT_MULT : amount;
    let impactPos = null;
    if (srcInfo && typeof srcInfo === 'object' && 'x' in srcInfo) impactPos = srcInfo;

    // Remember the fatal blow's crit flag so the kill feed can brand the card.
    if (byPlayer) entity._killHeadshot = headshot;
    applyDamage(entity, dmg, impactPos);

    // Player-sourced hits earn floating damage numbers + crit feedback.
    if (byPlayer && window.CombatText && window.CombatText.spawn && entity.mesh) {
      const ct = entity.mesh.position.clone();
      ct.y += headshot ? 1.6 : 1.0;
      window.CombatText.spawn(ct, Math.round(dmg), { crit: headshot, kill: entity.dead });
    }
    // A killing blow landed by the player extends the killstreak combo.
    if (byPlayer && entity.dead && window.Killstreak && window.Killstreak.registerKill) {
      window.Killstreak.registerKill(10);
    }
    // Loot the dead: a fighter you down has a chance to spill a munitions
    // pouch. It's nearly guaranteed when your active weapon is running dry,
    // so an aggressive push always keeps you fed.
    if (byPlayer && entity.dead && window.AmmoDrops && window.AmmoDrops.spawn) {
      let desperate = false;
      const ws = window.Weapons && window.Weapons.state;
      if (ws && ws.active && ws.active.magSize && ws.active.totalAmmo !== undefined) {
        desperate = ws.active.totalAmmo < ws.active.magSize * 1.5;
      }
      if (desperate || Math.random() < 0.4) {
        window.AmmoDrops.spawn(entity.mesh.position.x, entity.mesh.position.z, entity.team);
      }
    }
    // Player kills also feed the killstreak-reward dispatcher (owl strike,
    // gunship...) so EVERY weapon counts toward unlocking them.
    if (byPlayer && entity.dead && window.KillRewards) window.KillRewards.notify(entity.team);
    if (headshot && byPlayer && window.Sound && window.Sound.tone) {
      window.Sound.tone(900, 0.06, 'square', 0.12, 2500);   // crit ping
    }
  }

  // Force-kill an entity (bleed DoT, heli-strike). Credits the player's
  // killstreak when the source is the player's own team.
  function kill(entity, srcTeam) {
    if (!entity || entity.dead) return;
    const playerTeam = (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
    if (srcTeam === playerTeam && window.Killstreak && window.Killstreak.registerKill) {
      window.Killstreak.registerKill(10);
    }
    if (srcTeam === playerTeam && window.KillRewards) window.KillRewards.notify(entity.team);
    killEntity(entity);
  }

  // Area damage with linear falloff from the epicentre (weather.js lightning).
  function damageArea(x, z, radius, amount, srcTeam) {
    const r2 = radius * radius;
    for (const e of list) {
      if (e.dead) continue;
      const dx = e.mesh.position.x - x, dz = e.mesh.position.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      const falloff = 1 - Math.sqrt(d2) / radius;
      damage(e, amount * falloff, srcTeam);
    }
  }

  function fireProjectile(e, targetPos) {
    const origin = e.mesh.position.clone();
    origin.y += 1.2;
    const dir = targetPos.clone().sub(origin).normalize();
    const geo = new THREE.SphereGeometry(0.1, 5, 4);
    const mat = new THREE.MeshBasicMaterial({ color: e.team === 'deer' ? 0xffaa44 : 0xffee66 });
    const b = new THREE.Mesh(geo, mat);
    b.position.copy(origin);
    window.SCENE.add(b);
    bullets.push({
      mesh: b,
      dir,
      speed: 60,
      life: 2.0,
      damage: e.damage,
      team: e.team,
    });
    if (window.FX) window.FX.muzzleFlash(origin, dir);
    if (window.Sound) window.Sound.shot();
    // Incoming fire landing near a cluster of foes pins them down.
    if (window.__Suppression) window.__Suppression.applyNearMiss(targetPos.x, targetPos.z, e.team);
  }

  function update(dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.dead) continue;
      updateEntity(e, dt);
    }
    updateBullets(dt);
    updateParticles(dt);
    updateCorpses(dt);
    updateCharges(dt);
  }

  function updateEntity(e, dt) {
    e.fireCd -= dt;
    e.wanderCd -= dt;
    e.crateSeek -= dt;

    const rally = window.Squads ? window.Squads.getRally() : null;
    const order = window.Squads ? window.Squads.getOrder() : 'engage';
    const playerTeam = window.Manager && window.Manager.state ? window.Manager.state.playerTeam : 'hunter';

    // Suppression: pinned/stressed units move slower and fire slower.
    const SUP = window.__Suppression;
    const sm = SUP ? SUP.getSpeedMult(e) : 1;       // movement multiplier (1 = normal)
    const frm = SUP ? SUP.getFireRateMult(e) : 1;   // fire-rate multiplier (1 = normal)

    const near = nearestEnemy(e);
    const enemy = near.ent;
    const enemyDist = near.dist;

    if (e.crateSeek <= 0) {
      const cinfo = findNearestCrate(e);
      if (cinfo) {
        e.crateTarget = cinfo.crate;
        e.crateSeek = 0.5;
      } else {
        e.crateTarget = null;
      }
    }
    if (e.crateTarget && (!e.crateTarget.alive || e.crateTarget.taken)) e.crateTarget = null;

    let moving = false;
    const myPos = e.mesh.position;
    const beforeX = myPos.x, beforeZ = myPos.z;

    if (e.crateTarget && enemyDist > 18) {
      const cp = e.crateTarget.group.position;
      const dx = cp.x - myPos.x, dz = cp.z - myPos.z;
      const cd = Math.sqrt(dx * dx + dz * dz);
      if (cd < 1.8) {
        if (window.Pickups && window.Pickups.collectByNPC) {
          window.Pickups.collectByNPC(e.crateTarget, e);
        }
        e.crateTarget = null;
      } else {
        e.facing = Math.atan2(dx, dz);
        const nx = myPos.x + Math.sin(e.facing) * e.speed * 0.8 * dt;
        const nz = myPos.z + Math.cos(e.facing) * e.speed * 0.8 * dt;
        if (!collideWorld(nx, nz, 0.4)) { myPos.x = nx; myPos.z = nz; }
        moving = true;
      }
    } else if (enemy && enemyDist < e.range) {
      const ep = enemy.mesh.position;
      e.facing = Math.atan2(ep.x - myPos.x, ep.z - myPos.z);
      e.mesh.rotation.y = e.facing;
      const effectiveRange = e.range * 0.85;
      if (enemyDist > effectiveRange && order !== 'scatter') {
        const nx = myPos.x + Math.sin(e.facing) * e.speed * dt;
        const nz = myPos.z + Math.cos(e.facing) * e.speed * dt;
        if (!collideWorld(nx, nz, 0.4)) { myPos.x = nx; myPos.z = nz; }
        moving = true;
      } else if (enemyDist < e.range * 0.35 && e.team !== 'deer') {
        const nx = myPos.x - Math.sin(e.facing) * e.speed * dt;
        const nz = myPos.z - Math.cos(e.facing) * e.speed * dt;
        if (!collideWorld(nx, nz, 0.4)) { myPos.x = nx; myPos.z = nz; }
        moving = true;
      }
      if (e.fireCd <= 0 && e.ammo > 0) {
        if (e.team === 'deer' && e.hasAntlers && enemyDist < 5) {
          if (e.charging) {
            if (enemy.isPlayer) {
              if (window.Manager && window.Manager.damagePlayer) window.Manager.damagePlayer(e.damage * 2.0, 'deer');
            } else {
              applyDamage(enemy.ent || enemy, e.damage * 2.5, e.mesh.position);
            }
            e.charging = false;
            e.chargeTime = 0;
            if (e.mesh.userData.aura) e.mesh.userData.aura.visible = false;
          } else if (e.chargeCd <= 0) {
            e.charging = true;
            e.chargeTime = 1.2;
            e.chargeCd = 6 + Math.random() * 4;
            if (e.mesh.userData.aura) e.mesh.userData.aura.visible = true;
          }
        } else if (e.team === 'hunter' || enemyDist > 5) {
          fireProjectile(e, enemy.mesh.position.clone().setY(1.2));
          e.fireCd = (e.fireRate + Math.random() * 0.4) / frm;
          e.ammo--;
        }
      }
    } else if (enemy && enemyDist < 50 && order !== 'scatter') {
      const ep = enemy.mesh.position;
      e.facing = Math.atan2(ep.x - myPos.x, ep.z - myPos.z);
      const nx = myPos.x + Math.sin(e.facing) * e.speed * 0.7 * dt;
      const nz = myPos.z + Math.cos(e.facing) * e.speed * 0.7 * dt;
      if (!collideWorld(nx, nz, 0.4)) { myPos.x = nx; myPos.z = nz; }
      moving = true;
    } else if (rally && e.team === playerTeam) {
      const dx = rally.x - myPos.x, dz = rally.z - myPos.z;
      const rd = Math.sqrt(dx * dx + dz * dz);
      if (rd > 4) {
        e.facing = Math.atan2(dx, dz);
        const nx = myPos.x + Math.sin(e.facing) * e.speed * 0.8 * dt;
        const nz = myPos.z + Math.cos(e.facing) * e.speed * 0.8 * dt;
        if (!collideWorld(nx, nz, 0.4)) { myPos.x = nx; myPos.z = nz; }
        moving = true;
      }
    } else {
      if (e.wanderCd <= 0) {
        e.wanderDir = Math.random() * Math.PI * 2;
        e.wanderCd = 2 + Math.random() * 3;
      }
      const nx = myPos.x + Math.sin(e.wanderDir) * e.speed * 0.4 * dt;
      const nz = myPos.z + Math.cos(e.wanderDir) * e.speed * 0.4 * dt;
      if (!collideWorld(nx, nz, 0.4)) {
        myPos.x = nx; myPos.z = nz;
      } else {
        e.wanderDir += Math.PI;
      }
      e.facing = e.wanderDir;
      moving = true;
    }

    if (e.chargeCd > 0) e.chargeCd -= dt;
    if (e.charging && e.chargeTime > 0) {
      e.chargeTime -= dt;
      const cx = myPos.x + Math.sin(e.facing) * e.speed * 2.0 * dt;
      const cz = myPos.z + Math.cos(e.facing) * e.speed * 2.0 * dt;
      if (!collideWorld(cx, cz, 0.4)) { myPos.x = cx; myPos.z = cz; }
      const trail = new THREE.Mesh(TRAIL_GEO, CHARGE_MAT.clone());
      trail.position.copy(myPos);
      trail.position.y = 1.0;
      trail.material.opacity = 0.6;
      window.SCENE.add(trail);
      charges.push({ mesh: trail, life: 0.4 });
      if (e.mesh.userData.aura) {
        e.mesh.userData.aura.material.opacity = 0.3 + Math.sin(performance.now() * 0.02) * 0.15;
      }
      if (e.chargeTime <= 0) {
        e.charging = false;
        if (e.mesh.userData.aura) e.mesh.userData.aura.visible = false;
      }
    }

    // Scale this frame's whole displacement by the suppression movement factor so
    // pinned units (deer caught in crossfire, etc.) actually slow down.
    if (sm < 1) {
      myPos.x = beforeX + (myPos.x - beforeX) * sm;
      myPos.z = beforeZ + (myPos.z - beforeZ) * sm;
    }
    e.mesh.rotation.y = e.facing;
    myPos.y = groundY(myPos.x, myPos.z);

    if (moving) {
      e.mesh.position.y += Math.abs(Math.sin(performance.now() * 0.008 + e.facing)) * 0.15;
    }
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      const step = b.speed * dt;
      b.mesh.position.addScaledVector(b.dir, step);
      b.life -= dt;
      let hit = false;
      for (const e of list) {
        if (e.dead || e.team === b.team) continue;
        const dx = e.mesh.position.x - b.mesh.position.x;
        const dz = e.mesh.position.z - b.mesh.position.z;
        const dy = 1.2 - b.mesh.position.y + e.mesh.position.y;
        if (dx * dx + dz * dz + dy * dy < 0.7) {
          applyDamage(e, b.damage, b.mesh.position);
          if (window.__Suppression) window.__Suppression.applyBulletHit(e);
          hit = true;
          break;
        }
      }
      if (window.Manager && window.Manager.state && window.Manager.state.playerAlive && window.Manager.state.playerTeam !== b.team) {
        const p = window.CAMERA.position;
        const dx = p.x - b.mesh.position.x, dz = p.z - b.mesh.position.z;
        const dy = p.y - b.mesh.position.y;
        if (dx * dx + dz * dz + dy * dy < 0.8) {
          window.Manager.damagePlayer(b.damage);
          hit = true;
        }
      }
      if (window.Boss && window.Boss.boss && window.Boss.boss.active && b.team !== 'deer') {
        const bm = window.Boss.boss.mesh;
        if (bm) {
          const dx = bm.position.x - b.mesh.position.x;
          const dz = bm.position.z - b.mesh.position.z;
          const dy = 2.5 - b.mesh.position.y + bm.position.y;
          if (dx * dx + dz * dz + dy * dy < 3.0) {
            window.Boss.damage(b.damage);
            hit = true;
          }
        }
      }
      if (b.mesh.position.y < window.groundHeight(b.mesh.position.x, b.mesh.position.z)) {
        if (window.FX) window.FX.bloodBurst(b.mesh.position, new THREE.Vector3(0, 1, 0));
        hit = true;
      }
      if (hit || b.life <= 0) {
        window.SCENE.remove(b.mesh);
        b.mesh.geometry.dispose();
        bullets.splice(i, 1);
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.y -= 10 * dt;
      if (p.mesh.material) p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) {
        window.SCENE.remove(p.mesh);
        if (p.mesh.geometry) p.mesh.geometry.dispose();
        particles.splice(i, 1);
      }
    }
  }

  function updateCorpses(dt) {
    for (let i = corpses.length - 1; i >= 0; i--) {
      const e = corpses[i];
      e.deathTimer -= dt;
      if (e.deathTimer <= 0) {
        window.SCENE.remove(e.mesh);
        const idx = list.indexOf(e);
        if (idx >= 0) list.splice(idx, 1);
        corpses.splice(i, 1);
      }
    }
  }

  function updateCharges(dt) {
    for (let i = charges.length - 1; i >= 0; i--) {
      const c = charges[i];
      c.life -= dt;
      c.mesh.material.opacity = Math.max(0, c.life / 0.4 * 0.6);
      c.mesh.scale.multiplyScalar(1 + dt * 2);
      if (c.life <= 0) {
        window.SCENE.remove(c.mesh);
        if (c.mesh.geometry) c.mesh.geometry.dispose();
        charges.splice(i, 1);
      }
    }
  }

  function reset() {
    for (const e of list) window.SCENE.remove(e.mesh);
    list.length = 0;
    corpses.length = 0;
    for (const b of bullets) window.SCENE.remove(b.mesh);
    bullets.length = 0;
    for (const c of charges) window.SCENE.remove(c.mesh);
    charges.length = 0;
  }

  return { list, spawn, update, applyDamage, damage, kill, damageArea, reset };
})();

window.Entities = Entities;