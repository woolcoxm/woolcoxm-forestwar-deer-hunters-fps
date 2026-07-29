// herd.js — FORESTWAR ambient wildlife: peaceful deer herds that roam the forest and flee from danger
const THREE = window.THREE;
const SCENE = window.SCENE;
const Herd = (() => {
  const MAX_HERDS = 4;
  const HERD_SIZE_MIN = 3;
  const HERD_SIZE_MAX = 6;
  const WANDER_SPEED = 1.8;
  const FLEE_SPEED = 11;
  const FLEE_RADIUS = 16;
  const DANGER_RADIUS = 14;
  const SAFE_RADIUS = 36;
  const GRAVITY = 18;
  const LIFETIME = 100;
  const SPAWN_INTERVAL = 28;
  const SPAWN_FIRST = 12;
  const MAP_BOUND = 145;
  const UPDATE_DIST = 120;

  const BODY_GEO = new THREE.CapsuleGeometry(0.22, 0.7, 4, 8);
  const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0xc89868, roughness: 0.9, flatShading: true });
  const HEAD_GEO = new THREE.SphereGeometry(0.18, 8, 6);
  const LEG_GEO = new THREE.CylinderGeometry(0.05, 0.06, 0.7, 5);
  const LEG_MAT = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 });
  const TAIL_GEO = new THREE.SphereGeometry(0.1, 5, 4);
  const TAIL_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const SPARK_GEO = new THREE.SphereGeometry(0.1, 4, 3);
  const SPARK_MAT = new THREE.MeshBasicMaterial({ color: 0xffaa66, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });

  const herds = [];
  let spawnTimer = SPAWN_FIRST;

  const sparks = [];
  for (let i = 0; i < 20; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, active: false });
  }
  let sparkIdx = 0;

  const _v = new THREE.Vector3();
  const _camPos = new THREE.Vector3();

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function isBlocked(x, z) {
    const trees = window.TREES || [];
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      const dx = x - t.x, dz = z - t.z;
      if (dx * dx + dz * dz < (t.r + 0.5) * (t.r + 0.5)) return true;
    }
    return false;
  }

  function buildDeer() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(BODY_GEO, BODY_MAT);
    body.castShadow = true;
    body.position.y = 0.75;
    g.add(body);
    const head = new THREE.Mesh(HEAD_GEO, BODY_MAT);
    head.position.set(0, 1.15, 0.3);
    g.add(head);
    for (const sx of [-0.15, 0.15]) {
      for (const sz of [-0.25, 0.25]) {
        const leg = new THREE.Mesh(LEG_GEO, LEG_MAT);
        leg.position.set(sx, 0.35, sz);
        g.add(leg);
      }
    }
    const tail = new THREE.Mesh(TAIL_GEO, TAIL_MAT);
    tail.position.set(0, 0.9, -0.5);
    g.add(tail);
    g.userData.legs = [];
    g.children.forEach(c => {
      if (c.geometry === LEG_GEO) g.userData.legs.push(c);
    });
    return g;
  }

  function spawnHerd() {
    if (herds.length >= MAX_HERDS) return;
    const a = Math.random() * Math.PI * 2;
    const r = 30 + Math.random() * 90;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const size = HERD_SIZE_MIN + ((Math.random() * (HERD_SIZE_MAX - HERD_SIZE_MIN + 1)) | 0);
    const members = [];
    for (let i = 0; i < size; i++) {
      const ox = (Math.random() - 0.5) * 6;
      const oz = (Math.random() - 0.5) * 6;
      const mx = cx + ox, mz = cz + oz;
      if (isBlocked(mx, mz)) continue;
      const mesh = buildDeer();
      mesh.position.set(mx, groundY(mx, mz), mz);
      mesh.rotation.y = Math.random() * Math.PI * 2;
      SCENE.add(mesh);
      members.push({
        mesh,
        vel: new THREE.Vector3(),
        heading: Math.random() * Math.PI * 2,
        targetHeading: Math.random() * Math.PI * 2,
        wanderTimer: Math.random() * 3,
        legPhase: Math.random() * Math.PI * 2,
        fleeing: false,
        dead: false,
        health: 30,
      });
    }
    if (members.length === 0) return;
    const herd = {
      members,
      wanderTarget: new THREE.Vector3(cx + (Math.random() - 0.5) * 30, 0, cz + (Math.random() - 0.5) * 30),
      wanderTimer: 5 + Math.random() * 8,
      life: LIFETIME,
      fleeCenter: new THREE.Vector3(),
      fleeTimer: 0,
    };
    herds.push(herd);
  }

  function findDanger(x, z, radius) {
    const ents = window.Entities && window.Entities.list;
    if (!ents) return null;
    let closest = null;
    let closestDist = radius * radius;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || !e.mesh) continue;
      const m = e.mesh;
      const dx = m.position.x - x;
      const dz = m.position.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < closestDist) {
        const shooting = (e.fireCd !== undefined && e.fireCd < 0.5) || e.charging;
        if (shooting || d2 < (DANGER_RADIUS * 0.6) * (DANGER_RADIUS * 0.6)) {
          closestDist = d2;
          closest = m.position;
        }
      }
    }
    if (window.CAMERA) {
      const dx = window.CAMERA.position.x - x;
      const dz = window.CAMERA.position.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < closestDist && d2 < FLEE_RADIUS * FLEE_RADIUS) {
        closestDist = d2;
        closest = window.CAMERA.position;
      }
    }
    return closest;
  }

  function scatter(x, z) {
    for (let h = 0; h < herds.length; h++) {
      const herd = herds[h];
      for (let i = 0; i < herd.members.length; i++) {
        const m = herd.members[i];
        if (m.dead) continue;
        const dx = m.mesh.position.x - x;
        const dz = m.mesh.position.z - z;
        if (dx * dx + dz * dz < FLEE_RADIUS * FLEE_RADIUS) {
          m.fleeing = true;
          m.targetHeading = Math.atan2(dx, dz);
        }
      }
      herd.fleeTimer = 6;
      herd.fleeCenter.set(x, 0, z);
    }
  }
  window.scatterHerds = scatter;

  function damageMember(herd, member, dmg) {
    if (member.dead) return;
    member.health -= dmg;
    if (member.health <= 0) {
      member.dead = true;
      SCENE.remove(member.mesh);
      member.mesh.traverse(o => {
        if (o.geometry && o.geometry !== BODY_GEO && o.geometry !== HEAD_GEO &&
            o.geometry !== LEG_GEO && o.geometry !== TAIL_GEO) o.geometry.dispose();
      });
    } else {
      member.fleeing = true;
      herd.fleeTimer = 5;
      const cp = member.mesh.position;
      _v.set(cp.x - 2 + Math.random() * 4, 2 + Math.random() * 2, cp.z - 2 + Math.random() * 4);
      herd.fleeCenter.copy(cp);
      member.targetHeading = Math.atan2(_v.x - cp.x, _v.z - cp.z);
    }
    spawnSpark(member.mesh.position);
  }

  function spawnSpark(pos) {
    const s = sparks[sparkIdx];
    sparkIdx = (sparkIdx + 1) % sparks.length;
    s.mesh.position.copy(pos);
    s.mesh.position.y += 0.5;
    s.mesh.visible = true;
    s.life = 0.4;
    s.vx = (Math.random() - 0.5) * 4;
    s.vy = 2 + Math.random() * 3;
    s.vz = (Math.random() - 0.5) * 4;
    s.active = true;
  }

  function rayTestHerds(origin, dir, range, damage) {
    const dx = dir.x, dz = dir.z;
    for (let h = 0; h < herds.length; h++) {
      const herd = herds[h];
      for (let i = 0; i < herd.members.length; i++) {
        const m = herd.members[i];
        if (m.dead) continue;
        const mp = m.mesh.position;
        const ex = mp.x - origin.x;
        const ez = mp.z - origin.z;
        const proj = ex * dx + ez * dz;
        if (proj < 0 || proj > range) continue;
        const cx = origin.x + dx * proj;
        const cz = origin.z + dz * proj;
        const perp2 = (mp.x - cx) * (mp.x - cx) + (mp.z - cz) * (mp.z - cz);
        if (perp2 < 0.35) {
          damageMember(herd, m, damage);
        }
      }
    }
  }
  window.Herd_rayTest = rayTestHerds;

  // Occlusion-aware hitscan for the player's rifle: finds the SINGLE closest live
  // ambient deer along the ray (ignoring anything farther than maxDist, so trees /
  // ground / combatants in front are respected), damages only that one, and
  // returns its impact distance. Returns Infinity when no deer is in the clear.
  // This lets a hunter's clean round drop roaming wildlife — and the rest of the
  // herd bolts from the shot.
  function shootRay(origin, dir, range, damage, maxDist) {
    const dx = dir.x, dz = dir.z;
    let best = null, bestProj = Infinity;
    const limit = isFinite(maxDist) ? maxDist : range;
    for (let h = 0; h < herds.length; h++) {
      const herd = herds[h];
      for (let i = 0; i < herd.members.length; i++) {
        const m = herd.members[i];
        if (m.dead) continue;
        const mp = m.mesh.position;
        const ex = mp.x - origin.x;
        const ez = mp.z - origin.z;
        const proj = ex * dx + ez * dz;
        if (proj < 0 || proj > range || proj >= limit) continue;
        const cx = origin.x + dx * proj;
        const cz = origin.z + dz * proj;
        const perp2 = (mp.x - cx) * (mp.x - cx) + (mp.z - cz) * (mp.z - cz);
        if (perp2 < 0.35 && proj < bestProj) { bestProj = proj; best = { herd, m }; }
      }
    }
    if (best) {
      damageMember(best.herd, best.m, damage);
      return bestProj;
    }
    return Infinity;
  }
  window.Herd_shootRay = shootRay;

  function removeHerd(idx) {
    const herd = herds[idx];
    for (let i = 0; i < herd.members.length; i++) {
      const m = herd.members[i];
      if (!m.dead) {
        SCENE.remove(m.mesh);
        m.dead = true;
      }
    }
    herds.splice(idx, 1);
  }

  function update(dt) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = SPAWN_INTERVAL;
      spawnHerd();
    }

    if (window.CAMERA) _camPos.copy(window.CAMERA.position);

    for (let h = herds.length - 1; h >= 0; h--) {
      const herd = herds[h];
      herd.life -= dt;
      let aliveCount = 0;
      for (let i = 0; i < herd.members.length; i++) {
        if (!herd.members[i].dead) aliveCount++;
      }
      if (aliveCount === 0 || herd.life <= 0) {
        removeHerd(h);
        continue;
      }

      herd.wanderTimer -= dt;
      if (herd.wanderTimer <= 0 && herd.fleeTimer <= 0) {
        herd.wanderTimer = 6 + Math.random() * 10;
        const cx = herd.wanderTarget.x;
        const cz = herd.wanderTarget.z;
        herd.wanderTarget.set(
          cx + (Math.random() - 0.5) * 50,
          0,
          cz + (Math.random() - 0.5) * 50
        );
        if (Math.abs(herd.wanderTarget.x) > MAP_BOUND) herd.wanderTarget.x *= -0.8;
        if (Math.abs(herd.wanderTarget.z) > MAP_BOUND) herd.wanderTarget.z *= -0.8;
      }

      if (herd.fleeTimer > 0) herd.fleeTimer -= dt;

      let centerX = 0, centerZ = 0, cn = 0;
      for (let i = 0; i < herd.members.length; i++) {
        const m = herd.members[i];
        if (m.dead) continue;
        centerX += m.mesh.position.x;
        centerZ += m.mesh.position.z;
        cn++;
      }
      if (cn > 0) {
        centerX /= cn;
        centerZ /= cn;
        if (herd.fleeTimer <= 0) {
          const danger = findDanger(centerX, centerZ, DANGER_RADIUS);
          if (danger) {
            herd.fleeTimer = 6;
            herd.fleeCenter.copy(danger);
            for (let i = 0; i < herd.members.length; i++) {
              const m = herd.members[i];
              if (m.dead) continue;
              m.fleeing = true;
              const dx = m.mesh.position.x - danger.x;
              const dz = m.mesh.position.z - danger.z;
              m.targetHeading = Math.atan2(dx, dz);
            }
          }
        }
      }

      for (let i = 0; i < herd.members.length; i++) {
        const m = herd.members[i];
        if (m.dead) continue;

        const mp = m.mesh.position;
        const distToCam = _camPos.distanceTo(mp);
        if (distToCam > UPDATE_DIST) continue;

        let diff = m.targetHeading - m.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        m.heading += diff * Math.min(1, dt * 3.5);
        m.mesh.rotation.y = m.heading;

        const speed = m.fleeing ? FLEE_SPEED : WANDER_SPEED;
        const vx = Math.sin(m.heading) * speed;
        const vz = Math.cos(m.heading) * speed;

        const nx = mp.x + vx * dt;
        const nz = mp.z + vz * dt;

        if (!isBlocked(nx, mp.z) && Math.abs(nx) < MAP_BOUND) mp.x = nx;
        else m.targetHeading += Math.PI * 0.5 + Math.random();
        if (!isBlocked(mp.x, nz) && Math.abs(nz) < MAP_BOUND) mp.z = nz;
        else m.targetHeading += Math.PI * 0.5 + Math.random();

        const gy = groundY(mp.x, mp.z);
        mp.y = gy;

        m.wanderTimer -= dt;
        if (m.wanderTimer <= 0) {
          m.wanderTimer = 2 + Math.random() * 4;
          if (!m.fleeing) {
            m.targetHeading = m.heading + (Math.random() - 0.5) * 2.2;
          }
        }

        m.legPhase += dt * speed * 0.8;
        const legs = m.mesh.userData.legs;
        if (legs && legs.length === 4) {
          legs[0].rotation.x = Math.sin(m.legPhase) * 0.3;
          legs[1].rotation.x = Math.sin(m.legPhase + Math.PI) * 0.3;
          legs[2].rotation.x = Math.sin(m.legPhase + Math.PI) * 0.3;
          legs[3].rotation.x = Math.sin(m.legPhase) * 0.3;
        }

        if (herd.fleeTimer > 0) {
          const ddx = mp.x - herd.fleeCenter.x;
          const ddz = mp.z - herd.fleeCenter.z;
          if (ddx * ddx + ddz * ddz > SAFE_RADIUS * SAFE_RADIUS) {
            m.fleeing = false;
          }
        } else {
          m.fleeing = false;
        }
      }
    }

    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        s.active = false;
        continue;
      }
      s.vy -= GRAVITY * 0.5 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.material.opacity = s.life / 0.4;
      s.mesh.scale.setScalar(s.life / 0.4);
    }
  }

  function init() {
    spawnHerd();
    spawnHerd();
  }

  function reset() {
    for (let h = herds.length - 1; h >= 0; h--) removeHerd(h);
    spawnTimer = SPAWN_FIRST;
  }

  window.Herd = { update, init, reset, scatter, shootRay, state: { herds } };
  return { update, init, reset, scatter, shootRay, state: { herds } };
})();