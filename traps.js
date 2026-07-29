// traps.js — FORESTWAR bear traps: placeable snares that clamp enemies, deal bite damage, and root them briefly
const THREE = window.THREE;
const SCENE = window.SCENE;
const Traps = (() => {
  const MAX_TRAPS = 8;
  const TRIGGER_RADIUS = 1.3;
  const SNAP_DAMAGE = 45;
  const ROOT_DURATION = 3.0;
  const LIFETIME = 90;
  const COOLDOWN = 4.5;
  const STAMINA_COST = 20;
  const THROW_SPEED = 16;
  const GRAVITY = 20;
  const ARM_DELAY = 0.8;

  const state = { ready: true, cd: 0 };
  const traps = [];
  const projectiles = [];

  const BASE_GEO = new THREE.CylinderGeometry(0.35, 0.45, 0.12, 10);
  const BASE_MAT = new THREE.MeshStandardMaterial({ color: 0x3a3a2e, roughness: 0.8, metalness: 0.4 });
  const JAW_GEO = new THREE.TorusGeometry(0.5, 0.06, 5, 10, Math.PI * 1.1);
  const JAW_MAT = new THREE.MeshStandardMaterial({ color: 0x66665a, roughness: 0.5, metalness: 0.6 });
  const TOOTH_GEO = new THREE.ConeGeometry(0.05, 0.18, 4);
  const SPIKE_GEO = new THREE.ConeGeometry(0.1, 0.3, 5);
  const SPIKE_MAT = new THREE.MeshStandardMaterial({ color: 0x555548, roughness: 0.4, metalness: 0.7 });
  const RING_GEO = new THREE.RingGeometry(TRIGGER_RADIUS - 0.15, TRIGGER_RADIUS, 20);
  const RING_ARMED = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });
  const RING_TRIGGERED = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false });
  const PROJ_GEO = new THREE.SphereGeometry(0.22, 8, 6);
  const PROJ_MAT = new THREE.MeshStandardMaterial({ color: 0x66665a, roughness: 0.5, metalness: 0.6 });

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:16px;bottom:170px;font-size:11px;letter-spacing:2px;color:#c9d8ff;text-shadow:0 1px 3px #000;z-index:6;';
  const label = document.createElement('div');
  label.textContent = 'BEAR TRAP [6]';
  hud.appendChild(label);
  const bar = document.createElement('div');
  bar.style.cssText = 'margin-top:3px;width:80px;height:5px;background:rgba(0,0,0,0.5);border:1px solid rgba(150,170,210,0.3);border-radius:3px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#8899cc,#c9d8ff);transition:width 0.05s;';
  bar.appendChild(fill);
  hud.appendChild(bar);
  document.getElementById('hud').appendChild(hud);

  function buildTrapMesh() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(BASE_GEO, BASE_MAT);
    base.castShadow = true;
    g.add(base);
    for (const sx of [-1, 1]) {
      const jaw = new THREE.Mesh(JAW_GEO, JAW_MAT);
      jaw.position.set(sx * 0.15, 0.06, 0);
      jaw.rotation.set(0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
      jaw.userData.side = sx;
      jaw.userData.baseRotZ = 0;
      g.add(jaw);
      for (let i = 0; i < 5; i++) {
        const tooth = new THREE.Mesh(TOOTH_GEO, JAW_MAT);
        const ang = (i / 4) * Math.PI * 1.0;
        const tx = Math.cos(ang) * 0.48;
        const tz = Math.sin(ang) * 0.48;
        tooth.position.set(sx * 0.15 + tx * sx, 0.12, tz);
        tooth.rotation.x = Math.PI;
        g.add(tooth);
      }
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const spike = new THREE.Mesh(SPIKE_GEO, SPIKE_MAT);
        spike.position.set(sx * 0.38, 0.0, sz * 0.38);
        spike.rotation.x = -Math.PI / 2;
        spike.position.y = 0.0;
        g.add(spike);
      }
    }
    const ring = new THREE.Mesh(RING_GEO, RING_ARMED.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    g.add(ring);
    return { group: g, ring, jawL: g.children[1], jawR: g.children[2] };
  }

  function deploy() {
    if (!state.ready) {
      if (window.FX) window.FX.message('TRAP RECHARGING', '#ff6644');
      return;
    }
    const p = window.Player ? window.Player.state : null;
    if (p && p.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('INSUFFICIENT STAMINA', '#ff6644');
      return;
    }
    if (p) {
      p.stamina -= STAMINA_COST;
      p.regenTimer = 1.5;
    }
    state.ready = false;
    state.cd = COOLDOWN;
    const cam = window.CAMERA;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const proj = new THREE.Mesh(PROJ_GEO, PROJ_MAT);
    proj.castShadow = true;
    proj.position.copy(cam.position).addScaledVector(fwd, 1.0);
    proj.position.y -= 0.3;
    SCENE.add(proj);
    const vel = fwd.clone().multiplyScalar(THROW_SPEED);
    vel.y += 2.5;
    projectiles.push({ mesh: proj, vel, life: 5 });
    if (window.Sound) {
      window.Sound.tone(300, 0.1, 'square', 0.15, 1000);
    }
  }

  function plantAt(x, z, team) {
    const gy = window.groundHeight ? window.groundHeight(x, z) : 0;
    const built = buildTrapMesh();
    built.group.position.set(x, gy, z);
    SCENE.add(built.group);
    const trap = {
      group: built.group,
      ring: built.ring,
      jawL: built.jawL,
      jawR: built.jawR,
      x, z,
      team,
      armed: false,
      armTimer: ARM_DELAY,
      triggered: false,
      snapAnim: 0,
      rootTarget: null,
      rootTimer: 0,
      life: LIFETIME,
      pulsePhase: Math.random() * Math.PI * 2,
    };
    traps.push(trap);
    if (traps.length > MAX_TRAPS) {
      const old = traps.shift();
      SCENE.remove(old.group);
      disposeGroup(old.group);
    }
  }

  function disposeGroup(g) {
    g.traverse((c) => {
      if (c.isMesh && c.material && !c.userData.shared) {
        if (c.material.dispose && !c.material._shared) c.material.dispose();
      }
    });
  }

  function getPlayerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.vel.y -= GRAVITY * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.y += dt * 6;
      p.life -= dt;
      const gy = window.groundHeight ? window.groundHeight(p.mesh.position.x, p.mesh.position.z) : 0;
      if (p.mesh.position.y <= gy + 0.08 || p.life <= 0) {
        plantAt(p.mesh.position.x, p.mesh.position.z, getPlayerTeam());
        SCENE.remove(p.mesh);
        projectiles.splice(i, 1);
        if (window.Sound) {
          window.Sound.tone(150, 0.08, 'square', 0.2, 500);
        }
      }
    }
  }

  function updateTraps(dt) {
    const ents = (window.Entities && Array.isArray(window.Entities.list)) ? window.Entities.list : [];
    for (let i = traps.length - 1; i >= 0; i--) {
      const trap = traps[i];
      trap.life -= dt;
      if (trap.life <= 0) {
        SCENE.remove(trap.group);
        disposeGroup(trap.group);
        traps.splice(i, 1);
        continue;
      }
      if (!trap.armed) {
        trap.armTimer -= dt;
        if (trap.armTimer <= 0) {
          trap.armed = true;
          trap.ring.material.opacity = 0.25;
        } else {
          trap.ring.material.opacity = 0.15 + Math.sin(trap.armTimer * 20) * 0.1;
          continue;
        }
      }
      if (trap.triggered) {
        trap.snapAnim = Math.min(1, trap.snapAnim + dt * 12);
        const s = trap.snapAnim;
        trap.jawL.rotation.y = -Math.PI / 2 + s * 0.9;
        trap.jawR.rotation.y = Math.PI / 2 - s * 0.9;
        trap.ring.material.opacity = Math.max(0, trap.ring.material.opacity - dt * 0.8);
        if (trap.rootTarget) {
          trap.rootTimer -= dt;
          const e = trap.rootTarget;
          if (!e || e.dead || !e.mesh) {
            trap.rootTarget = null;
            trap.rootTimer = 0;
          } else {
            const m = e.mesh;
            m.position.x = trap.x;
            m.position.z = trap.z;
            m.position.y = (window.groundHeight ? window.groundHeight(trap.x, trap.z) : 0) + 1.0;
            if (e.vel) {
              e.vel.x = 0;
              e.vel.z = 0;
            }
            if (e.rootTimer !== undefined) e.rootTimer = Math.max(e.rootTimer || 0, trap.rootTimer);
            if (trap.rootTimer <= 0) {
              e.rootTimer = 0;
              trap.rootTarget = null;
              trap.life = Math.min(trap.life, 2.0);
            }
          }
        }
        if (!trap.rootTarget && trap.snapAnim >= 1) {
          trap.life = Math.min(trap.life, 1.5);
        }
        continue;
      }
      trap.pulsePhase += dt * 3;
      trap.ring.material.opacity = 0.18 + Math.sin(trap.pulsePhase) * 0.08;
      for (let j = 0; j < ents.length; j++) {
        const e = ents[j];
        if (e.dead || e.team === trap.team) continue;
        const m = e.mesh;
        if (!m) continue;
        if (e.rootTimer && e.rootTimer > 0) continue;
        const dx = m.position.x - trap.x;
        const dz = m.position.z - trap.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < TRIGGER_RADIUS * TRIGGER_RADIUS) {
          triggerTrap(trap, e);
          break;
        }
      }
    }
  }

  function triggerTrap(trap, entity) {
    trap.triggered = true;
    trap.snapAnim = 0;
    trap.rootTarget = entity;
    trap.rootTimer = ROOT_DURATION;
    trap.ring.material.color.setHex(0xff2222);
    trap.ring.material.opacity = 0.7;
    if (window.Entities && window.Entities.applyDamage) {
      const gy = window.groundHeight ? window.groundHeight(trap.x, trap.z) : 0;
      const src = new THREE.Vector3(trap.x, gy + 0.8, trap.z);
      window.Entities.applyDamage(entity, SNAP_DAMAGE, src);
    } else if (entity.hp !== undefined) {
      entity.hp -= SNAP_DAMAGE;
    }
    if (window.FX) {
      const gy = window.groundHeight ? window.groundHeight(trap.x, trap.z) : 0;
      window.FX.burst(
        new THREE.Vector3(trap.x, gy + 0.8, trap.z),
        new THREE.Vector3(0, 1, 0),
        0xff4422,
        14
      );
    }
    if (window.Sound) {
      window.Sound.tone(120, 0.12, 'sawtooth', 0.3, 600);
      window.Sound.tone(80, 0.2, 'square', 0.2, 400);
    }
  }

  function update(dt) {
    if (!state.ready) {
      state.cd -= dt;
      if (state.cd <= 0) state.ready = true;
    }
    updateProjectiles(dt);
    updateTraps(dt);
    const ratio = state.ready ? 1 : (1 - state.cd / COOLDOWN);
    fill.style.width = Math.max(0, Math.min(1, ratio)) * 100 + '%';
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== '6' && e.code !== 'Digit6') return;
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    if (!window.Player || !Player.state.locked) return;
    deploy();
  });

  return { state, traps, update, deploy, plantAt };
})();
window.Traps = Traps;