// helmets.js — FORESTWAR protective helmets: enemies may spawn wearing one that absorbs the first headshot
const THREE = window.THREE;
const SCENE = window.SCENE;
const Helmets = (() => {
  const SPAWN_CHANCE = 0.28;
  const SHATTER_DEBRIS = 10;
  const DEBRIS_LIFE = 0.8;
  const DEBRIS_GRAVITY = 20;
  const SPARK_COUNT = 6;
  const SPARK_LIFE = 0.35;
  const PING_RANGE = 45;

  const HELMET_GEO = new THREE.SphereGeometry(0.3, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const HELMET_MAT_DEER = new THREE.MeshStandardMaterial({ color: 0x3a2e1a, roughness: 0.5, metalness: 0.6, flatShading: true });
  const HELMET_MAT_HUNTER = new THREE.MeshStandardMaterial({ color: 0x2a3320, roughness: 0.5, metalness: 0.6, flatShading: true });
  const STRAP_GEO = new THREE.BoxGeometry(0.04, 0.02, 0.5);
  const STRAP_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1a12, roughness: 0.9 });
  const RIM_GEO = new THREE.TorusGeometry(0.29, 0.025, 5, 16);
  const RIM_MAT = new THREE.MeshStandardMaterial({ color: 0x555544, roughness: 0.4, metalness: 0.7 });

  const DEBRIS_GEO = new THREE.TetrahedronGeometry(0.1, 0);
  const DEBRIS_MAT = new THREE.MeshStandardMaterial({ color: 0x4a4234, roughness: 0.6, metalness: 0.4, flatShading: true });
  const SPARK_GEO = new THREE.SphereGeometry(0.06, 4, 3);
  const SPARK_MAT = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const FLASH_GEO = new THREE.SphereGeometry(0.35, 8, 6);
  const FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });

  const RICOCHET_GEO = new THREE.CylinderGeometry(0.008, 0.008, 1, 3);
  RICOCHET_GEO.rotateX(Math.PI / 2);
  const RICOCHET_MAT = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });

  const debrisPool = [];
  for (let i = 0; i < 30; i++) {
    const m = new THREE.Mesh(DEBRIS_GEO, DEBRIS_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    debrisPool.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, active: false });
  }
  let debrisIdx = 0;

  const sparkPool = [];
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparkPool.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, active: false });
  }
  let sparkIdx = 0;

  const flashes = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(FLASH_GEO, FLASH_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    flashes.push({ mesh: m, life: 0, active: false });
  }
  let flashIdx = 0;

  const ricochets = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(RICOCHET_GEO, RICOCHET_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    ricochets.push({ mesh: m, life: 0, active: false });
  }
  let ricochetIdx = 0;

  const _pos = new THREE.Vector3();
  const _camPos = new THREE.Vector3();

  function rollSpawn() {
    return Math.random() < SPAWN_CHANCE;
  }

  function attach(entity) {
    if (!entity || !entity.mesh || entity._helmet) return;
    const team = entity.team || 'hunter';
    const mat = team === 'deer' ? HELMET_MAT_DEER : HELMET_MAT_HUNTER;

    const helmet = new THREE.Mesh(HELMET_GEO, mat);
    helmet.castShadow = true;
    helmet.position.y = 0.32;
    entity.mesh.add(helmet);

    const rim = new THREE.Mesh(RIM_GEO, RIM_MAT);
    rim.position.y = 0.32;
    rim.rotation.x = Math.PI / 2;
    entity.mesh.add(rim);

    for (const sx of [-1, 1]) {
      const strap = new THREE.Mesh(STRAP_GEO, STRAP_MAT);
      strap.position.set(sx * 0.24, 0.2, 0.0);
      entity.mesh.add(strap);
    }

    entity._helmet = { mesh: helmet, rim, straps: [], intact: true };
  }

  function detach(entity) {
    if (!entity || !entity._helmet) return;
    const h = entity._helmet;
    if (h.mesh && h.mesh.parent) h.mesh.parent.remove(h.mesh);
    if (h.rim && h.rim.parent) h.rim.parent.remove(h.rim);
    entity._helmet = null;
  }

  function tryAbsorbHeadshot(entity, hitPos) {
    if (!entity || !entity._helmet || !entity._helmet.intact) return false;
    entity._helmet.intact = false;

    const team = entity.team || 'hunter';
    const mat = team === 'deer' ? HELMET_MAT_DEER : HELMET_MAT_HUNTER;
    const newMat = mat.clone();
    newMat.color.multiplyScalar(0.3);
    if (entity._helmet.mesh) entity._helmet.mesh.material = newMat;
    if (entity._helmet.rim) entity._helmet.rim.visible = false;

    spawnDebris(hitPos);
    spawnSparks(hitPos);
    spawnFlash(hitPos);
    spawnRicochet(hitPos);
    playPing(hitPos);

    if (window.CAMERA) {
      _camPos.copy(window.CAMERA.position);
      _pos.copy(hitPos);
      if (_camPos.distanceTo(_pos) < 12 && window.FX && window.FX.shake) {
        window.FX.shake(0.06);
      }
    }

    if (window.CombatText && window.CombatText.spawn) {
      window.CombatText.spawn(hitPos, 'HELMET', { color: '#ffcc44', size: 14 });
    }

    return true;
  }

  function spawnDebris(pos) {
    for (let i = 0; i < SHATTER_DEBRIS; i++) {
      const slot = debrisPool[debrisIdx];
      debrisIdx = (debrisIdx + 1) % debrisPool.length;
      const ang = Math.random() * Math.PI * 2;
      const up = 3 + Math.random() * 5;
      const out = 3 + Math.random() * 5;
      slot.vx = Math.cos(ang) * out;
      slot.vy = up;
      slot.vz = Math.sin(ang) * out;
      slot.rx = (Math.random() - 0.5) * 14;
      slot.ry = (Math.random() - 0.5) * 14;
      slot.rz = (Math.random() - 0.5) * 14;
      slot.mesh.position.copy(pos);
      const sc = 0.6 + Math.random() * 0.8;
      slot.mesh.scale.setScalar(sc);
      slot.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      slot.mesh.visible = true;
      slot.life = DEBRIS_LIFE;
      slot.active = true;
    }
  }

  function spawnSparks(pos) {
    for (let i = 0; i < SPARK_COUNT; i++) {
      const slot = sparkPool[sparkIdx];
      sparkIdx = (sparkIdx + 1) % sparkPool.length;
      const ang = Math.random() * Math.PI * 2;
      const spd = 5 + Math.random() * 7;
      slot.vx = Math.cos(ang) * spd;
      slot.vy = 2 + Math.random() * 5;
      slot.vz = Math.sin(ang) * spd;
      slot.mesh.position.copy(pos);
      slot.mesh.material.opacity = 1;
      slot.mesh.scale.setScalar(0.6 + Math.random() * 0.6);
      slot.mesh.visible = true;
      slot.life = SPARK_LIFE;
      slot.active = true;
    }
  }

  function spawnFlash(pos) {
    const slot = flashes[flashIdx];
    flashIdx = (flashIdx + 1) % flashes.length;
    slot.mesh.position.copy(pos);
    slot.mesh.material.opacity = 0.85;
    slot.mesh.scale.setScalar(0.7);
    slot.mesh.visible = true;
    slot.life = 0.14;
    slot.active = true;
  }

  function spawnRicochet(pos) {
    if (!window.CAMERA) return;
    const slot = ricochets[ricochetIdx];
    ricochetIdx = (ricochetIdx + 1) % ricochets.length;
    _camPos.copy(window.CAMERA.position);
    const len = Math.max(0.5, _camPos.distanceTo(pos));
    slot.mesh.position.copy(pos).lerp(_camPos, 0.5);
    slot.mesh.lookAt(_camPos);
    slot.mesh.scale.set(1, 1, len);
    slot.mesh.visible = true;
    slot.life = 0.05;
    slot.active = true;
  }

  function playPing(pos) {
    if (!window.CAMERA || !window.Sound || !window.Sound.tone) return;
    _camPos.copy(window.CAMERA.position);
    const dist = _camPos.distanceTo(pos);
    if (dist > PING_RANGE) return;
    const vol = Math.max(0.08, 1 - dist / PING_RANGE) * 0.3;
    const freq = 1800 + Math.random() * 600;
    window.Sound.tone(freq, 0.06, 'square', vol, 4000);
    window.Sound.tone(freq * 0.5, 0.1, 'sine', vol * 0.4, 2000);
  }

  function update(dt) {
    for (let i = 0; i < debrisPool.length; i++) {
      const d = debrisPool[i];
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.mesh.visible = false;
        d.active = false;
        continue;
      }
      d.vy -= DEBRIS_GRAVITY * dt;
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += d.vz * dt;
      d.mesh.rotation.x += d.rx * dt;
      d.mesh.rotation.y += d.ry * dt;
      d.mesh.rotation.z += d.rz * dt;
      if (d.mesh.position.y < 0.1) {
        d.mesh.position.y = 0.1;
        d.vy = Math.abs(d.vy) * 0.3;
        d.vx *= 0.5;
        d.vz *= 0.5;
      }
    }

    for (let i = 0; i < sparkPool.length; i++) {
      const s = sparkPool[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        s.active = false;
        continue;
      }
      s.vy -= 16 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.material.opacity = (s.life / SPARK_LIFE) * 0.9;
    }

    for (let i = 0; i < flashes.length; i++) {
      const f = flashes[i];
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.mesh.visible = false;
        f.active = false;
        continue;
      }
      const t = f.life / 0.14;
      f.mesh.material.opacity = t * 0.85;
      f.mesh.scale.setScalar(0.7 + (1 - t) * 1.8);
    }

    for (let i = 0; i < ricochets.length; i++) {
      const r = ricochets[i];
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.mesh.visible = false;
        r.active = false;
        continue;
      }
      r.mesh.material.opacity = (r.life / 0.05) * 0.8;
    }
  }

  function hasHelmet(entity) {
    return !!(entity && entity._helmet && entity._helmet.intact);
  }

  function init() {
    if (!window.Entities) return;
    const origSpawn = window.Entities.spawn;
    window.Entities.spawn = function (team, x, z) {
      const result = origSpawn.call(this, team, x, z);
      if (result && result.mesh && !result._helmet && Math.random() < SPAWN_CHANCE) {
        attach(result);
      }
      return result;
    };
  }

  setTimeout(init, 200);

  function reset() {
    for (let i = 0; i < debrisPool.length; i++) {
      debrisPool[i].mesh.visible = false;
      debrisPool[i].active = false;
    }
    for (let i = 0; i < sparkPool.length; i++) {
      sparkPool[i].mesh.visible = false;
      sparkPool[i].active = false;
    }
    for (let i = 0; i < flashes.length; i++) {
      flashes[i].mesh.visible = false;
      flashes[i].active = false;
    }
    for (let i = 0; i < ricochets.length; i++) {
      ricochets[i].mesh.visible = false;
      ricochets[i].active = false;
    }
  }

  window.Helmets = {
    attach,
    detach,
    tryAbsorbHeadshot,
    hasHelmet,
    update,
    reset,
    rollSpawn,
  };

  return window.Helmets;
})();