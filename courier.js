// courier.js — FORESTWAR flag courier: elite runner who sprints to enemy objective, rewards kill or auto-capture
const THREE = window.THREE;
const SCENE = window.SCENE;
const Courier = (() => {
  const SPAWN_INTERVAL = 38;
  const SPAWN_FIRST = 22;
  const SPEED = 7.5;
  const BOOST_SPEED = 11;
  const HEALTH = 200;
  const CAPTURE_RADIUS = 4;
  const KILL_SCORE = 25;
  const CAPTURE_SCORE = 18;
  const BUFF_DURATION = 12;
  const BUFF_DAMAGE = 1.35;
  const BUFF_SPEED = 1.25;
  const GLOW_RADIUS = 18;
  const SPAWN_EDGE = 120;
  const AURA_RISE = 2.0;

  const state = {
    active: null,
    timer: SPAWN_FIRST,
    buff: { deer: 0, hunter: 0 },
  };

  const BODY_GEO = new THREE.CapsuleGeometry(0.32, 1.0, 4, 8);
  const BODY_MAT_DEER = new THREE.MeshStandardMaterial({ color: 0xffaa44, roughness: 0.4, metalness: 0.3, emissive: 0x442200, emissiveIntensity: 0.6 });
  const BODY_MAT_HUNTER = new THREE.MeshStandardMaterial({ color: 0x66aaff, roughness: 0.4, metalness: 0.3, emissive: 0x112244, emissiveIntensity: 0.6 });
  const HEAD_GEO = new THREE.SphereGeometry(0.26, 10, 8);
  const FLAG_POLE_GEO = new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5);
  const FLAG_POLE_MAT = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 });
  const FLAG_GEO = new THREE.PlaneGeometry(0.9, 0.6);
  const FLAG_MAT_DEER = new THREE.MeshStandardMaterial({ color: 0xf0c98a, roughness: 0.7, side: THREE.DoubleSide, emissive: 0x442200, emissiveIntensity: 0.4 });
  const FLAG_MAT_HUNTER = new THREE.MeshStandardMaterial({ color: 0xc9d8ff, roughness: 0.7, side: THREE.DoubleSide, emissive: 0x222244, emissiveIntensity: 0.4 });
  const AURA_GEO = new THREE.SphereGeometry(GLOW_RADIUS, 10, 8);
  const AURA_MAT = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.1, side: THREE.BackSide, depthWrite: false });
  const RING_GEO = new THREE.RingGeometry(0.8, 1.2, 24);
  const RING_MAT_DEER = new THREE.MeshBasicMaterial({ color: 0xf0c98a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const RING_MAT_HUNTER = new THREE.MeshBasicMaterial({ color: 0xc9d8ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const SPARK_GEO = new THREE.SphereGeometry(0.12, 5, 4);

  const beams = [];
  for (let i = 0; i < 3; i++) {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.5, depthWrite: false })
    );
    beam.visible = false;
    SCENE.add(beam);
    beams.push(beam);
  }

  const sparks = [];
  for (let i = 0; i < 24; i++) {
    const s = new THREE.Mesh(SPARK_GEO, new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true }));
    s.visible = false;
    SCENE.add(s);
    sparks.push({ mesh: s, life: 0, maxLife: 0.5, vx: 0, vy: 0, vz: 0 });
  }
  let sparkIdx = 0;

  function getGroundY(x, z) {
    if (typeof window.groundHeight === 'function') return window.groundHeight(x, z);
    return 0;
  }

  function getEnemyObjective(team) {
    if (!window.Objectives || !Objectives.state || !Objectives.state.points) return null;
    const target = team === 'deer' ? 'hunter' : 'deer';
    let best = null;
    let bestVal = -1;
    for (const p of Objectives.state.points) {
      let val = 0;
      if (p.owner === null) val = 0.5;
      else if (p.owner === target) val = 1.0;
      else val = 0.1;
      val += Math.random() * 0.15;
      if (val > bestVal) { bestVal = val; best = p; }
    }
    return best;
  }

  function spawnCourier() {
    const team = Math.random() < 0.5 ? 'deer' : 'hunter';
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * SPAWN_EDGE;
    const z = Math.sin(a) * SPAWN_EDGE;
    const objective = getEnemyObjective(team);
    if (!objective) return;

    const g = new THREE.Group();
    const bodyMat = team === 'deer' ? BODY_MAT_DEER : BODY_MAT_HUNTER;
    const body = new THREE.Mesh(BODY_GEO, bodyMat);
    body.castShadow = true;
    body.position.y = 1.0;
    g.add(body);

    const head = new THREE.Mesh(HEAD_GEO, bodyMat);
    head.castShadow = true;
    head.position.set(0, 1.65, 0.25);
    g.add(head);

    const pole = new THREE.Mesh(FLAG_POLE_GEO, FLAG_POLE_MAT);
    pole.position.set(0.3, 2.0, 0);
    pole.rotation.z = -0.15;
    g.add(pole);

    const flagMat = team === 'deer' ? FLAG_MAT_DEER : FLAG_MAT_HUNTER;
    const flag = new THREE.Mesh(FLAG_GEO, flagMat);
    flag.position.set(0.78, 2.5, 0);
    g.add(flag);
    g.userData.flag = flag;

    const aura = new THREE.Mesh(AURA_GEO, AURA_MAT.clone());
    aura.material.color.setHex(team === 'deer' ? 0xffaa44 : 0x66aaff);
    aura.position.y = AURA_RISE;
    g.add(aura);

    const ringMat = team === 'deer' ? RING_MAT_DEER : RING_MAT_HUNTER;
    const ring = new THREE.Mesh(RING_GEO, ringMat.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    g.add(ring);

    const light = new THREE.PointLight(team === 'deer' ? 0xff8833 : 0x3388ff, 1.5, 12, 2);
    light.position.y = 2;
    g.add(light);

    g.position.set(x, getGroundY(x, z), z);
    SCENE.add(g);

    state.active = {
      mesh: g,
      team,
      hp: HEALTH,
      maxHp: HEALTH,
      objective,
      flag: flag,
      aura: aura,
      ring: ring,
      light: light,
      dead: false,
      bobPhase: 0,
      ringPulse: 0,
      captureFlash: 0,
    };

    if (window.FX && window.FX.message) {
      const col = team === 'deer' ? '#f0c98a' : '#c9d8ff';
      window.FX.message(team.toUpperCase() + ' COURIER DEPLOYED — STOP THEM!', col);
    }
    if (window.Sound) {
      window.Sound.tone(180, 0.5, 'sawtooth', 0.3, 600);
      window.Sound.tone(360, 0.3, 'square', 0.2, 1000);
    }
  }

  function takeDamage(amount, fromTeam) {
    const c = state.active;
    if (!c || c.dead) return;
    c.hp -= amount;
    c.captureFlash = 0.15;
    spawnSparks(c.mesh.position.x, c.mesh.position.y + 1.2, c.mesh.position.z, 4);
    if (window.FX && window.FX.bloodBurst) {
      const dummy = { x: 0, y: 1, z: 0 };
      window.FX.bloodBurst(c.mesh.position.clone().setY(c.mesh.position.y + 1), dummy);
    }
    if (c.hp <= 0) {
      c.dead = true;
      onCourierKilled(fromTeam || (c.team === 'deer' ? 'hunter' : 'deer'));
    }
  }

  function onCourierKilled(killerTeam) {
    const c = state.active;
    if (!c) return;
    if (window.Manager && Manager.state) {
      Manager.state.score[killerTeam] = (Manager.state.score[killerTeam] || 0) + KILL_SCORE;
      Manager.state.kills[killerTeam] = (Manager.state.kills[killerTeam] || 0) + 1;
    }
    spawnSparks(c.mesh.position.x, c.mesh.position.y + 1.0, c.mesh.position.z, 16);
    if (window.FX && window.FX.message) {
      window.FX.message('COURIER SLAIN +' + KILL_SCORE, '#9fe8a0');
    }
    if (window.Sound) window.Sound.explosion();
    if (window.Entities && Entities.onCourierKilled) Entities.onCourierKilled(c.mesh.position, c.team);
    removeCourier();
  }

  function onCourierCapture() {
    const c = state.active;
    if (!c) return;
    state.buff[c.team] = BUFF_DURATION;
    if (window.Manager && Manager.state) {
      Manager.state.score[c.team] = (Manager.state.score[c.team] || 0) + CAPTURE_SCORE;
    }
    if (window.Objectives && c.objective) {
      c.objective.owner = c.team;
      c.objective.capture = 100;
      if (c.objective.heldTimer !== undefined) c.objective.heldTimer = 0;
      if (c.objective.lastHolder !== undefined) c.objective.lastHolder = c.team;
    }
    spawnSparks(c.mesh.position.x, c.mesh.position.y + 1.0, c.mesh.position.z, 20);
    if (window.FX && window.FX.message) {
      const col = c.team === 'deer' ? '#f0c98a' : '#c9d8ff';
      window.FX.message(c.team.toUpperCase() + ' COURIER CAPTURED OBJECTIVE!', col);
    }
    if (window.Sound) {
      window.Sound.tone(523, 0.3, 'square', 0.25, 1500);
      window.Sound.tone(659, 0.3, 'square', 0.25, 1500);
      window.Sound.tone(784, 0.5, 'square', 0.25, 1500);
    }
    removeCourier();
  }

  function removeCourier() {
    const c = state.active;
    if (!c) return;
    SCENE.remove(c.mesh);
    c.mesh.traverse((child) => {
      if (child.geometry && child.geometry !== BODY_GEO && child.geometry !== HEAD_GEO &&
          child.geometry !== FLAG_POLE_GEO && child.geometry !== FLAG_GEO &&
          child.geometry !== AURA_GEO && child.geometry !== RING_GEO) {
        child.geometry.dispose();
      }
      if (child.material && child.material.dispose &&
          child.material !== BODY_MAT_DEER && child.material !== BODY_MAT_HUNTER &&
          child.material !== FLAG_POLE_MAT && child.material !== FLAG_MAT_DEER &&
          child.material !== FLAG_MAT_HUNTER) {
        child.material.dispose();
      }
    });
    state.active = null;
  }

  function spawnSparks(x, y, z, count) {
    for (let i = 0; i < count; i++) {
      const s = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % sparks.length;
      s.mesh.position.set(x, y, z);
      s.mesh.visible = true;
      s.mesh.material.opacity = 1;
      s.life = 0.4 + Math.random() * 0.3;
      s.maxLife = s.life;
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 5;
      s.vx = Math.cos(a) * sp;
      s.vy = 2 + Math.random() * 4;
      s.vz = Math.sin(a) * sp;
    }
  }

  const _dir = new THREE.Vector3();
  const _flat = new THREE.Vector3();

  function update(dt) {
    if (!state.active) {
      state.timer -= dt;
      if (state.timer <= 0) {
        spawnCourier();
        state.timer = SPAWN_INTERVAL + Math.random() * 10;
      }
    } else {
      const c = state.active;
      if (!c.dead) {
        if (c.objective) {
          const ox = c.objective.x;
          const oz = c.objective.z;
          const dx = ox - c.mesh.position.x;
          const dz = oz - c.mesh.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < CAPTURE_RADIUS) {
            onCourierCapture();
          } else {
            const inv = 1 / (dist || 1);
            const boosting = dist < 20;
            const spd = boosting ? BOOST_SPEED : SPEED;
            const nx = dx * inv;
            const nz = dz * inv;
            _dir.set(nx, 0, nz);
            c.mesh.position.x += _dir.x * spd * dt;
            c.mesh.position.z += _dir.z * spd * dt;
            c.mesh.position.y = getGroundY(c.mesh.position.x, c.mesh.position.z);
            const targetYaw = Math.atan2(nx, nz);
            let cy = c.mesh.rotation.y;
            let diff = targetYaw - cy;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            c.mesh.rotation.y += diff * Math.min(1, dt * 8);
            c.bobPhase += dt * spd * 1.5;
            c.mesh.position.y += Math.abs(Math.sin(c.bobPhase)) * 0.12;
            if (c.flag) c.flag.rotation.y = Math.sin(c.bobPhase * 0.8) * 0.3;
          }
        }
      }
      if (c.ring) {
        c.ringPulse += dt * 4;
        const s = 1 + Math.sin(c.ringPulse) * 0.3;
        c.ring.scale.setScalar(s);
        c.ring.material.opacity = 0.4 + Math.sin(c.ringPulse) * 0.2;
      }
      if (c.aura) {
        c.aura.material.opacity = 0.08 + Math.sin(c.ringPulse * 0.5) * 0.04;
      }
      if (c.captureFlash > 0) {
        c.captureFlash -= dt;
        const intensity = Math.max(0, c.captureFlash / 0.15);
        if (c.light) c.light.intensity = 1.5 + intensity * 4;
      } else if (c.light) {
        c.light.intensity = 1.5;
      }
    }
    if (state.buff.deer > 0) state.buff.deer -= dt;
    if (state.buff.hunter > 0) state.buff.hunter -= dt;
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        continue;
      }
      s.vy -= 14 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      const gy = getGroundY(s.mesh.position.x, s.mesh.position.z);
      if (s.mesh.position.y < gy) {
        s.mesh.position.y = gy;
        s.vy *= -0.3;
        s.vx *= 0.5;
        s.vz *= 0.5;
      }
      s.mesh.material.opacity = s.life / s.maxLife;
      s.mesh.scale.setScalar(0.5 + (s.life / s.maxLife) * 0.8);
    }
    if (state.active && state.active.mesh) {
      const c = state.active;
      const px = c.mesh.position.x;
      const pz = c.mesh.position.z;
      for (let i = 0; i < beams.length; i++) {
        const beam = beams[i];
        const off = (i - 1) * 1.2;
        beam.visible = true;
        beam.position.set(px + off, getGroundY(px, pz) + 0.5, pz);
        const ph = performance.now() * 0.003 + i * 2;
        const h = 3 + Math.sin(ph) * 1.5;
        beam.scale.y = h;
        beam.position.y = getGroundY(px, pz) + h * 0.5;
        beam.material.opacity = 0.3 + Math.sin(ph * 1.5) * 0.15;
        beam.material.color.setHex(c.team === 'deer' ? 0xffaa44 : 0x66aaff);
      }
    } else {
      for (let i = 0; i < beams.length; i++) beams[i].visible = false;
    }
  }

  function getBuff(team) {
    const b = state.buff[team];
    if (b && b > 0) return { damage: BUFF_DAMAGE, speed: BUFF_SPEED };
    return null;
  }

  function getActive() { return state.active; }

  return { state, update, takeDamage, getBuff, getActive };
})();
window.Courier = Courier;