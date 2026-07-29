const THREE = window.THREE;
const SCENE = window.SCENE;
const Beacon = (() => {
  const BEACON_LIFE = 28;
  const HEAL_RADIUS = 9;
  const HEAL_RATE = 8;
  const PLAYER_HEAL_RATE = 5;
  const COOLDOWN = 40;
  const STAMINA_COST = 45;
  const ANTENNA_HP = 30;

  const state = {
    active: null,
    cooldownTimer: 0,
    ready: true,
  };

  const BASE_GEO = new THREE.CylinderGeometry(0.45, 0.6, 0.3, 10);
  const BASE_MAT = new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.7, metalness: 0.4 });
  const RING_GEO = new THREE.TorusGeometry(0.5, 0.05, 6, 18);
  const ANTENNA_GEO = new THREE.CylinderGeometry(0.04, 0.06, 1.6, 6);
  const ANTENNA_MAT = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.7 });
  const TIP_GEO = new THREE.SphereGeometry(0.12, 8, 6);
  const TIP_MAT = new THREE.MeshBasicMaterial({ color: 0x66ff88 });
  const AURA_GEO = new THREE.RingGeometry(HEAL_RADIUS - 0.4, HEAL_RADIUS, 48);
  const AURA_MAT = new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });

  function deploy() {
    if (!state.ready) {
      if (window.FX) window.FX.message('BEACON RECHARGING', '#ff6644');
      return;
    }
    const player = window.Player;
    if (!player || !player.state) return;
    if (player.state.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('INSUFFICIENT STAMINA', '#ff6644');
      return;
    }
    player.state.stamina -= STAMINA_COST;
    player.state.regenTimer = player.state.regenTimer || 0;
    if (player.state.regenTimer !== undefined) player.state.regenTimer = 1.5;
    state.ready = false;
    state.cooldownTimer = COOLDOWN;

    if (state.active) removeBeacon();

    const cam = window.CAMERA;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const px = cam.position.x + fwd.x * 2.5;
    const pz = cam.position.z + fwd.z * 2.5;
    const gy = window.groundHeight ? window.groundHeight(px, pz) : 0;

    const g = new THREE.Group();
    const base = new THREE.Mesh(BASE_GEO, BASE_MAT);
    base.castShadow = true;
    base.position.y = 0.15;
    g.add(base);
    const ring1 = new THREE.Mesh(RING_GEO, TIP_MAT.clone());
    ring1.rotation.x = Math.PI / 2;
    ring1.position.y = 0.32;
    g.add(ring1);
    const ring2 = new THREE.Mesh(RING_GEO, TIP_MAT.clone());
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 0.32;
    ring2.scale.setScalar(1.5);
    g.add(ring2);
    const antenna = new THREE.Mesh(ANTENNA_GEO, ANTENNA_MAT);
    antenna.position.y = 1.1;
    g.add(antenna);
    const tip = new THREE.Mesh(TIP_GEO, TIP_MAT);
    tip.position.y = 2.0;
    g.add(tip);
    const aura = new THREE.Mesh(AURA_GEO, AURA_MAT);
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.05;
    g.add(aura);
    const light = new THREE.PointLight(0x66ff88, 1.2, HEAL_RADIUS * 1.4, 2);
    light.position.y = 2.0;
    g.add(light);

    g.position.set(px, gy, pz);
    SCENE.add(g);

    state.active = {
      group: g,
      tip, ring1, ring2, antenna, aura, light,
      life: BEACON_LIFE,
      hp: ANTENNA_HP,
      pulse: 0,
      x: px, z: pz,
    };
    if (window.FX) window.FX.message('BEACON DEPLOYED', '#66ff88');
    if (window.Sound) {
      window.Sound.tone(660, 0.18, 'sine', 0.28, 2400);
      window.Sound.tone(880, 0.22, 'sine', 0.2, 2600);
    }
    updateHUD();
  }

  function damageBeacon(dmg) {
    if (!state.active) return;
    state.active.hp -= dmg;
    state.active.tip.material.color.setHex(0xffaa44);
    if (window.Sound) window.Sound.tone(200, 0.08, 'square', 0.15, 800);
    if (state.active.hp <= 0) {
      if (window.FX) window.FX.message('BEACON DESTROYED', '#ff6644');
      removeBeacon();
    }
  }

  function removeBeacon() {
    if (!state.active) return;
    const a = state.active;
    if (window.FX && window.FX.bloodBurst) {
      const pos = new THREE.Vector3(a.x, a.group.position.y + 1, a.z);
      window.FX.bloodBurst(pos, new THREE.Vector3(0, 1, 0));
    }
    SCENE.remove(a.group);
    state.active = null;
  }

  function update(dt) {
    if (!state.ready) {
      state.cooldownTimer -= dt;
      if (state.cooldownTimer <= 0) {
        state.ready = true;
        if (window.FX) window.FX.message('BEACON READY', '#66ff88');
        updateHUD();
      }
    }
    const a = state.active;
    if (!a) return;
    a.life -= dt;
    a.pulse += dt * 3;
    a.tip.material.opacity = 0.7 + Math.sin(a.pulse) * 0.3;
    a.tip.material.transparent = true;
    a.ring1.scale.setScalar(1 + Math.sin(a.pulse * 1.5) * 0.12);
    a.ring2.scale.setScalar(1.5 + Math.cos(a.pulse * 1.2) * 0.15);
    a.ring2.rotation.z += dt * 1.2;
    a.light.intensity = 1.0 + Math.sin(a.pulse * 2) * 0.4;
    a.aura.material.opacity = 0.18 + Math.sin(a.pulse * 0.8) * 0.1;
    a.aura.scale.setScalar(1 + Math.sin(a.pulse * 0.7) * 0.04);
    if (a.life < 4) {
      const blink = Math.sin(a.life * 14) > 0;
      a.tip.visible = blink;
      a.light.intensity *= blink ? 1 : 0.3;
    }

    if (window.Entities && Array.isArray(window.Entities.list)) {
      for (const e of window.Entities.list) {
        if (e.dead) continue;
        const dx = e.mesh.position.x - a.x;
        const dz = e.mesh.position.z - a.z;
        if (dx * dx + dz * dz < HEAL_RADIUS * HEAL_RADIUS) {
          e.hp = Math.min(e.maxHp, (e.hp || 0) + HEAL_RATE * dt);
        }
      }
    }
    if (window.Manager && window.Manager.state && window.Manager.state.playerAlive) {
      const cam = window.CAMERA;
      const dx = cam.position.x - a.x;
      const dz = cam.position.z - a.z;
      if (dx * dx + dz * dz < HEAL_RADIUS * HEAL_RADIUS) {
        const s = window.Manager.state;
        s.playerHp = Math.min(s.playerMaxHp, s.playerHp + PLAYER_HEAL_RATE * dt);
      }
    }
    if (a.life <= 0) {
      if (window.FX) window.FX.message('BEACON EXPIRED', '#aaaaaa');
      removeBeacon();
    }
  }

  function hitTest(origin, dir, maxDist) {
    const a = state.active;
    if (!a) return null;
    const center = new THREE.Vector3(a.x, a.group.position.y + 1.0, a.z);
    const toCenter = new THREE.Vector3().subVectors(center, origin);
    const proj = toCenter.dot(dir);
    if (proj < 0 || proj > maxDist) return null;
    const closest = new THREE.Vector3().copy(dir).multiplyScalar(proj).add(origin);
    if (closest.distanceTo(center) < 0.5) {
      return { type: 'beacon', point: closest };
    }
    return null;
  }

  const hudWrap = document.createElement('div');
  hudWrap.style.cssText = 'position:absolute;left:16px;bottom:130px;width:180px;font-size:11px;letter-spacing:2px;text-shadow:0 1px 3px #000;z-index:6;';
  const hudLabel = document.createElement('div');
  hudLabel.style.cssText = 'color:#66ff88;margin-bottom:3px;';
  hudLabel.textContent = 'BEACON [B]';
  hudWrap.appendChild(hudLabel);
  const cdBar = document.createElement('div');
  cdBar.style.cssText = 'width:100%;height:7px;background:rgba(0,0,0,0.55);border:1px solid rgba(100,255,140,0.4);border-radius:4px;overflow:hidden;';
  const cdFill = document.createElement('div');
  cdFill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#66ff88,#aaffcc);transition:width 0.1s;';
  cdBar.appendChild(cdFill);
  hudWrap.appendChild(cdBar);
  document.getElementById('hud').appendChild(hudWrap);

  function updateHUD() {
    if (state.ready) {
      cdFill.style.width = '100%';
      hudLabel.style.color = '#66ff88';
      hudLabel.textContent = 'BEACON READY [B]';
    } else {
      const pct = Math.max(0, 1 - state.cooldownTimer / COOLDOWN);
      cdFill.style.width = (pct * 100) + '%';
      hudLabel.style.color = '#888888';
      hudLabel.textContent = 'BEACON ' + Math.ceil(state.cooldownTimer) + 's';
    }
  }

  function init() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'b' || e.key === 'B') {
        if (window.Manager && window.Manager.state && window.Manager.state.phase === 'playing' && window.Player && window.Player.state.locked) {
          deploy();
        }
      }
    });
    updateHUD();
  }

  return { init, update, hitTest, damageBeacon, state };
})();
window.Beacon = Beacon;