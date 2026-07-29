// pickups.js — FORESTWAR power-up crates: health and ammo, floating with glow rings, auto-collected on proximity
const THREE = window.THREE;
const SCENE = window.SCENE;
const FX = window.FX || {};

const Pickups = (() => {
  const crates = [];
  const RESPAWN_TIME = 25;
  const PICKUP_RADIUS = 2.0;

  const CRATE_GEO = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  const HEALTH_GEO = new THREE.BoxGeometry(0.5, 0.5, 0.1);
  const AMMO_GEO = new THREE.BoxGeometry(0.45, 0.25, 0.1);

  const HEALTH_MAT = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.5, emissive: 0x440000, emissiveIntensity: 0.4 });
  const AMMO_MAT = new THREE.MeshStandardMaterial({ color: 0x44aa55, roughness: 0.5, emissive: 0x003300, emissiveIntensity: 0.4 });
  const CROSS_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const BULLET_MAT = new THREE.MeshBasicMaterial({ color: 0xddffdd });
  const RING_GEO = new THREE.TorusGeometry(0.7, 0.04, 6, 24);
  const RING_MAT_HEALTH = new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.6 });
  const RING_MAT_AMMO = new THREE.MeshBasicMaterial({ color: 0x55ff66, transparent: true, opacity: 0.6 });

  const SPAWN_POINTS = [
    { x: -30, z: 20 }, { x: 25, z: 35 }, { x: -50, z: -10 },
    { x: 40, z: -40 }, { x: 0, z: -50 }, { x: 60, z: 10 },
    { x: -65, z: 50 }, { x: 15, z: 80 },
  ];

  const AMMO_TABLE = [
    { slot: 0, grant: 60, label: 'RIFLE AMMO +60' },
    { slot: 1, grant: 2, label: 'ROCKETS +2' },
    { slot: 2, grant: 3, label: 'GRENADES +3' },
  ];

  function createCrate(type, sp) {
    const group = new THREE.Group();
    const mat = type === 'health' ? HEALTH_MAT : AMMO_MAT;
    const crate = new THREE.Mesh(CRATE_GEO, mat);
    crate.castShadow = true;
    group.add(crate);

    if (type === 'health') {
      const bar1 = new THREE.Mesh(HEALTH_GEO, CROSS_MAT);
      bar1.position.z = 0.46;
      group.add(bar1);
      const bar2 = new THREE.Mesh(HEALTH_GEO, CROSS_MAT);
      bar2.position.z = 0.46;
      bar2.rotation.z = Math.PI / 2;
      group.add(bar2);
    } else {
      for (let i = 0; i < 3; i++) {
        const bul = new THREE.Mesh(AMMO_GEO, BULLET_MAT);
        bul.position.set(-0.22 + i * 0.22, 0, 0.46);
        group.add(bul);
      }
    }

    const ringMat = type === 'health' ? RING_MAT_HEALTH : RING_MAT_AMMO;
    const ring1 = new THREE.Mesh(RING_GEO, ringMat);
    ring1.rotation.x = Math.PI / 2;
    ring1.position.y = -0.55;
    group.add(ring1);
    const ring2 = new THREE.Mesh(RING_GEO, ringMat.clone());
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 0.7;
    group.add(ring2);

    const lightColor = type === 'health' ? 0xff4444 : 0x55ff66;
    const light = new THREE.PointLight(lightColor, 1.2, 7, 2);
    light.position.y = 0.5;
    group.add(light);

    group.position.set(sp.x, (window.groundHeight ? window.groundHeight(sp.x, sp.z) : 0) + 1.0, sp.z);
    SCENE.add(group);
    crates.push({ group, ring1, ring2, light, type, sp, available: true, timer: 0, baseY: group.position.y, phase: Math.random() * Math.PI * 2 });
  }

  function init() {
    for (let i = 0; i < SPAWN_POINTS.length; i++) {
      createCrate(i % 2 === 0 ? 'health' : 'ammo', SPAWN_POINTS[i]);
    }
  }

  function pickUp(crate) {
    crate.available = false;
    crate.group.visible = false;
    crate.timer = RESPAWN_TIME;
    const pos = crate.group.position;
    const fakeNorm = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 14; i++) {
      const c = crate.type === 'health' ? 0xff4444 : 0x55ff66;
      FX.burst(pos, fakeNorm, c, 3.2);
    }
    FX.message(crate.type === 'health' ? 'HEALTH +40' : pickAmmo(), crate.type === 'health' ? '#ff8888' : '#88ff88');
    if (window.Sound) window.Sound.ping(crate.type === 'health' ? 720 : 880);
  }

  function pickAmmo() {
    const W = window.Weapons;
    if (!W || !W.state) return 'AMMO +';
    const s = W.state.slots;
    const avail = AMMO_TABLE.filter(a => s[a.slot].totalAmmo < maxAmmo(a.slot));
    if (avail.length === 0) return 'AMMO FULL';
    const pick = avail[(Math.random() * avail.length) | 0];
    const room = maxAmmo(pick.slot) - s[pick.slot].totalAmmo;
    const give = Math.min(pick.grant, room);
    s[pick.slot].totalAmmo += give;
    if (pick.slot === 0) s[0].totalAmmo = Math.min(s[0].totalAmmo, maxAmmo(0));
    return pick.label;
  }

  function maxAmmo(slot) {
    return [120, 12, 18][slot] || 60;
  }

  function giveHealth() {
    if (window.Manager && window.Manager.state) {
      const m = window.Manager.state;
      m.playerHp = Math.min(m.playerMaxHp, m.playerHp + 40);
    }
  }

  function update(dt) {
    for (const c of crates) {
      if (!c.available) {
        c.timer -= dt;
        if (c.timer <= 0) {
          c.available = true;
          c.group.visible = true;
        }
        continue;
      }
      c.phase += dt * 2;
      c.group.position.y = c.baseY + Math.sin(c.phase) * 0.2;
      c.group.rotation.y += dt * 0.8;
      c.ring1.rotation.z += dt * 2.5;
      c.ring2.rotation.z -= dt * 1.8;
      const lightFlicker = 1.0 + Math.sin(c.phase * 3) * 0.25;
      c.light.intensity = 1.2 * lightFlicker;
      const p = window.CAMERA ? window.CAMERA.position : null;
      if (p && window.Manager && window.Manager.state) {
        const dx = p.x - c.group.position.x;
        const dz = p.z - c.group.position.z;
        if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
          if (c.type === 'health') {
            if (window.Manager.state.playerHp < window.Manager.state.playerMaxHp) {
              giveHealth();
              pickUp(c);
            }
          } else {
            pickUp(c);
          }
        }
      }
    }
  }

  function collectByNPC(crate, entity) {
    if (!crate || !crate.available) return;
    crate.available = false;
    crate.group.visible = false;
    crate.timer = RESPAWN_TIME;
    if (crate.type === 'health' && entity && entity.maxHp) {
      entity.hp = Math.min(entity.maxHp, entity.hp + 40);
    } else if (entity && entity.maxAmmo) {
      entity.ammo = Math.min(entity.maxAmmo, (entity.ammo || 0) + 30);
    }
    if (window.FX && window.FX.burst) {
      window.FX.burst(crate.group.position, new THREE.Vector3(0, 1, 0), crate.type === 'health' ? 0xff4444 : 0x55ff66, 10);
    }
  }

  return { init, update, crates, collectByNPC };
})();

window.Pickups = Pickups;