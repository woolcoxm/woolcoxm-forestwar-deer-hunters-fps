// flashbang.js — FORESTWAR stun grenade: thrown flash that blinds/deafens nearby enemies for a tactical window
const THREE = window.THREE;
const SCENE = window.SCENE;
const Flashbang = (() => {
  const THROW_SPEED = 22;
  const GRAVITY = 18;
  const ARM_TIME = 0.7;
  const DETONATE_RADIUS = 11;
  const STUN_AMOUNT = 85;
  const STUN_DURATION = 4.5;
  const COOLDOWN = 12;
  const STAMINA_COST = 25;
  const BOUNCE = 0.35;
  const FRICTION = 0.8;
  const FLASH_EXPAND_TIME = 0.35;
  const FLASH_MAX_RADIUS = DETONATE_RADIUS * 1.4;
  const MAX_PROJECTILES = 3;

  const state = { cd: 0, projectiles: [] };

  const SHELL_GEO = new THREE.CylinderGeometry(0.07, 0.07, 0.18, 8);
  const SHELL_MAT = new THREE.MeshStandardMaterial({ color: 0x888866, roughness: 0.5, metalness: 0.5 });
  const TIP_GEO = new THREE.ConeGeometry(0.07, 0.08, 8);
  TIP_GEO.rotateX(Math.PI);
  const TIP_MAT = new THREE.MeshBasicMaterial({ color: 0xffdd44 });

  const FLASH_GEO = new THREE.SphereGeometry(1, 16, 12);
  const FLASH_MAT = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const RING_GEO = new THREE.RingGeometry(0.8, 1.0, 32);
  const RING_MAT = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const SPARK_GEO = new THREE.SphereGeometry(0.1, 5, 4);
  const SPARK_COUNT = 16;
  const SPARK_LIFE = 0.5;

  const _throwDir = new THREE.Vector3();
  const _detonatePos = new THREE.Vector3();
  const _tmp = new THREE.Vector3();

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function buildFlashMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(SHELL_GEO, SHELL_MAT);
    body.castShadow = true;
    g.add(body);
    const tip = new THREE.Mesh(TIP_GEO, TIP_MAT);
    tip.position.y = -0.13;
    g.add(tip);
    const flash = new THREE.Mesh(FLASH_GEO, FLASH_MAT.clone());
    flash.visible = false;
    flash.frustumCulled = false;
    g.add(flash);
    const ring = new THREE.Mesh(RING_GEO, RING_MAT.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    ring.frustumCulled = false;
    g.add(ring);
    const light = new THREE.PointLight(0xffffff, 0, 30, 2);
    g.add(light);
    const sparks = [];
    for (let i = 0; i < SPARK_COUNT; i++) {
      const s = new THREE.Mesh(SPARK_GEO, new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.visible = false;
      s.frustumCulled = false;
      g.add(s);
      sparks.push({ mesh: s, vx: 0, vy: 0, vz: 0, life: 0 });
    }
    SCENE.add(g);
    return { group: g, body, tip, flash, ring, light, sparks };
  }

  function throwFlash() {
    if (state.cd > 0) return;
    const p = window.Player ? window.Player.state : null;
    if (!p || !p.locked) return;
    if (p.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('TOO EXHAUSTED', '#ff6644');
      return;
    }
    p.stamina -= STAMINA_COST;
    if (p.regenTimer !== undefined) p.regenTimer = 1.5;
    state.cd = COOLDOWN;

    const cam = window.CAMERA;
    cam.getWorldDirection(_throwDir);
    _throwDir.normalize();

    const mesh = buildFlashMesh();
    mesh.group.position.copy(cam.position).addScaledVector(_throwDir, 1.2);
    mesh.group.position.y -= 0.3;

    const vel = _throwDir.clone().multiplyScalar(THROW_SPEED);
    vel.y += 3.5;

    state.projectiles.push({
      mesh,
      vel,
      armed: false,
      timer: 0,
      detonated: false,
      detonateTimer: 0,
      flashExpand: 0,
      grounded: false,
    });

    if (window.Sound) {
      window.Sound.tone(800, 0.08, 'square', 0.15, 2000);
    }
  }

  function detonate(proj) {
    proj.detonated = true;
    proj.detonateTimer = 0;
    proj.flashExpand = 0;
    const pos = proj.mesh.group.position;
    _detonatePos.copy(pos);

    proj.mesh.flash.visible = true;
    proj.mesh.flash.material.opacity = 1;
    proj.mesh.flash.scale.setScalar(0.5);
    proj.mesh.ring.visible = true;
    proj.mesh.ring.material.opacity = 0.9;
    proj.mesh.ring.scale.setScalar(0.3);
    proj.mesh.light.intensity = 40;
    proj.mesh.body.visible = false;
    proj.mesh.tip.visible = false;

    for (const sp of proj.mesh.sparks) {
      sp.mesh.visible = true;
      sp.mesh.material.opacity = 1;
      sp.mesh.position.set(0, 0, 0);
      const ang = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.5;
      const spd = 8 + Math.random() * 12;
      sp.vx = Math.cos(ang) * Math.cos(phi) * spd;
      sp.vy = Math.sin(phi) * spd + 4;
      sp.vz = Math.sin(ang) * Math.cos(phi) * spd;
      sp.life = SPARK_LIFE * (0.6 + Math.random() * 0.4);
    }

    applyStun(_detonatePos.x, _detonatePos.z);

    if (window.Sound) {
      window.Sound.tone(180, 0.5, 'sawtooth', 0.4, 1200);
      window.Sound.tone(60, 0.3, 'square', 0.3, 400);
      if (window.Sound.rumble) window.Sound.rumble(0.4);
    }

    if (window.Suppression && window.Suppression.applyExplosion) {
      window.Suppression.applyExplosion(_detonatePos.x, _detonatePos.z, DETONATE_RADIUS, 'deer');
      window.Suppression.applyExplosion(_detonatePos.x, _detonatePos.z, DETONATE_RADIUS, 'hunter');
    }
  }

  function applyStun(x, z) {
    if (!window.Entities || !Array.isArray(window.Entities.list)) return;
    const ents = window.Entities.list;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead) continue;
      const m = e.mesh;
      if (!m) continue;
      const dx = m.position.x - x;
      const dz = m.position.z - z;
      const distSq = dx * dx + dz * dz;
      if (distSq > DETONATE_RADIUS * DETONATE_RADIUS) continue;
      const dist = Math.sqrt(distSq);
      const falloff = 1 - dist / DETONATE_RADIUS;
      const amount = STUN_AMOUNT * falloff;
      e.stunned = Math.max(e.stunned || 0, STUN_DURATION * falloff);
      e.suppression = Math.min(100, (e.suppression || 0) + amount);
      e.stunTimer = STUN_DURATION * (0.5 + falloff * 0.5);
      if (e.stagger) e.stagger(falloff);
      if (window.CombatText && e.mesh) {
        window.CombatText.spawn(m.position.clone().setY(m.position.y + 1.5), 'STUN', { color: '#ffff44', size: 16 });
      }
    }
  }

  function updateProjectile(proj, dt) {
    const mesh = proj.mesh;
    if (proj.detonated) {
      proj.detonateTimer += dt;
      proj.flashExpand += dt;
      const t = Math.min(proj.flashExpand / FLASH_EXPAND_TIME, 1);
      const radius = FLASH_MAX_RADIUS * t;
      mesh.flash.scale.setScalar(radius);
      mesh.flash.material.opacity = Math.max(0, 1 - t);
      mesh.ring.scale.setScalar(radius * 0.8);
      mesh.ring.material.opacity = Math.max(0, 0.9 - t * 1.2);
      mesh.light.intensity = Math.max(0, 40 * (1 - t * 2));

      for (const sp of mesh.sparks) {
        if (sp.life <= 0) continue;
        sp.life -= dt;
        sp.vx *= 0.92;
        sp.vy *= 0.92;
        sp.vz *= 0.92;
        sp.vy -= 20 * dt;
        sp.mesh.position.x += sp.vx * dt;
        sp.mesh.position.y += sp.vy * dt;
        sp.mesh.position.z += sp.vz * dt;
        sp.mesh.material.opacity = Math.max(0, sp.life / SPARK_LIFE);
        if (sp.life <= 0) sp.mesh.visible = false;
      }

      if (proj.detonateTimer > FLASH_EXPAND_TIME + 0.3) {
        SCENE.remove(mesh.group);
        mesh.flash.material.dispose();
        mesh.ring.material.dispose();
        for (const sp of mesh.sparks) sp.mesh.material.dispose();
        proj.dead = true;
      }
      return;
    }

    proj.timer += dt;
    if (proj.timer >= ARM_TIME) proj.armed = true;

    proj.vel.y -= GRAVITY * dt;
    const pos = mesh.group.position;
    const nextX = pos.x + proj.vel.x * dt;
    const nextY = pos.y + proj.vel.y * dt;
    const nextZ = pos.z + proj.vel.z * dt;

    const gy = groundY(nextX, nextZ) + 0.12;

    if (nextY <= gy) {
      pos.set(nextX, gy, nextZ);
      if (Math.abs(proj.vel.y) > 1.0) {
        proj.vel.y = -proj.vel.y * BOUNCE;
        proj.vel.x *= FRICTION;
        proj.vel.z *= FRICTION;
        if (window.Sound && window.Sound.tone) {
          window.Sound.tone(300, 0.06, 'square', 0.08, 1500);
        }
      } else {
        proj.vel.set(0, 0, 0);
        proj.grounded = true;
      }
    } else {
      pos.set(nextX, nextY, nextZ);
    }

    mesh.group.rotation.x += dt * 8;
    mesh.group.rotation.z += dt * 6;

    if (proj.armed && (proj.grounded || proj.timer >= ARM_TIME + 1.5)) {
      detonate(proj);
    }
  }

  function update(dt) {
    if (state.cd > 0) state.cd -= dt;
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      updateProjectile(state.projectiles[i], dt);
      if (state.projectiles[i].dead) state.projectiles.splice(i, 1);
    }
    updateHUD();
  }

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:16px;bottom:120px;font-size:11px;letter-spacing:2px;color:#ffdd44;text-shadow:0 1px 3px #000;z-index:6;';
  const label = document.createElement('div');
  label.textContent = 'FLASHBANG [H]';
  hud.appendChild(label);
  const bar = document.createElement('div');
  bar.style.cssText = 'margin-top:3px;width:80px;height:5px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,221,68,0.3);border-radius:3px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#ffaa22,#ffdd55);transition:width 0.05s;';
  bar.appendChild(fill);
  hud.appendChild(bar);
  document.getElementById('hud').appendChild(hud);

  function updateHUD() {
    const ratio = Math.max(0, 1 - state.cd / COOLDOWN);
    fill.style.width = (ratio * 100) + '%';
    label.style.opacity = state.cd > 0 ? '0.5' : '1';
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'h' && e.key !== 'H') return;
    if (e.repeat) return;
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    if (!window.Player || !Player.state.locked) return;
    throwFlash();
  });

  return { update, throwFlash, state };
})();
window.Flashbang = Flashbang;