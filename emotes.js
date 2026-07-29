// emotes.js — FORESTWAR player taunt system: visual overhead emotes with sound and bot reactions
const THREE = window.THREE;
const SCENE = window.SCENE;
const CAMERA = window.CAMERA;
const Emotes = (() => {
  const EMOTE_LIFE = 3.0;
  const EMOTE_RISE = 2.8;
  const BOT_REACT_RADIUS = 22;
  const COOLDOWN = 0.7;

  const ICONS = {
    victory: { color: 0xffdd44, glow: 0xffaa00, sound: 'victory' },
    skull: { color: 0xeeeeee, glow: 0x666666, sound: 'skull' },
    heart: { color: 0xff5588, glow: 0xff2266, sound: 'heart' },
    rage: { color: 0xff3322, glow: 0xff6600, sound: 'rage' },
    laugh: { color: 0x66ff99, glow: 0x22cc55, sound: 'laugh' },
    salute: { color: 0x66aaff, glow: 0x3366cc, sound: 'salute' },
  };

  const KEY_MAP = {
    '7': 'victory',
    '8': 'laugh',
    '9': 'heart',
    '0': 'rage',
  };

  const state = {
    active: null,
    life: 0,
    cooldown: 0,
    bob: 0,
    ringPulse: 0,
  };

  const shared = {
    pos: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    targetPos: new THREE.Vector3(),
    camDir: new THREE.Vector3(),
  };

  function buildIcon(type) {
    const cfg = ICONS[type];
    const g = new THREE.Group();

    const ringGeo = new THREE.RingGeometry(0.55, 0.72, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: cfg.color, transparent: true, opacity: 0.9,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.z = 0.01;
    g.add(ring);

    const glowGeo = new THREE.CircleGeometry(0.85, 20);
    const glowMat = new THREE.MeshBasicMaterial({
      color: cfg.glow, transparent: true, opacity: 0.3,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    g.add(glow);

    if (type === 'victory') {
      const leftGeo = new THREE.TorusGeometry(0.22, 0.05, 6, 12, Math.PI);
      const left = new THREE.Mesh(leftGeo, new THREE.MeshBasicMaterial({ color: cfg.color }));
      left.rotation.z = Math.PI * 0.85;
      left.position.x = -0.18;
      g.add(left);
      const right = new THREE.Mesh(leftGeo, left.material);
      right.rotation.z = Math.PI * 0.15;
      right.position.x = 0.18;
      g.add(right);
      const stemGeo = new THREE.BoxGeometry(0.1, 0.28, 0.05);
      const stem = new THREE.Mesh(stemGeo, new THREE.MeshBasicMaterial({ color: 0x4a8a3a }));
      stem.position.set(0, -0.2, 0);
      g.add(stem);
    } else if (type === 'skull') {
      const skullGeo = new THREE.SphereGeometry(0.3, 10, 8);
      const skull = new THREE.Mesh(skullGeo, new THREE.MeshBasicMaterial({ color: cfg.color }));
      g.add(skull);
      const sockGeo = new THREE.SphereGeometry(0.08, 6, 5);
      for (const sx of [-0.12, 0.12]) {
        const sock = new THREE.Mesh(sockGeo, new THREE.MeshBasicMaterial({ color: 0x000000 }));
        sock.position.set(sx, 0.04, 0.22);
        g.add(sock);
      }
      const jawGeo = new THREE.BoxGeometry(0.22, 0.1, 0.1);
      const jaw = new THREE.Mesh(jawGeo, new THREE.MeshBasicMaterial({ color: cfg.color }));
      jaw.position.set(0, -0.28, 0.04);
      g.add(jaw);
    } else if (type === 'heart') {
      const heartShape = new THREE.Shape();
      heartShape.moveTo(0, 0.25);
      heartShape.bezierCurveTo(0, 0.35, -0.35, 0.35, -0.35, 0.0);
      heartShape.bezierCurveTo(-0.35, -0.2, 0, -0.3, 0, -0.35);
      heartShape.bezierCurveTo(0, -0.3, 0.35, -0.2, 0.35, 0.0);
      heartShape.bezierCurveTo(0.35, 0.35, 0, 0.35, 0, 0.25);
      const heartGeo = new THREE.ShapeGeometry(heartShape);
      const heart = new THREE.Mesh(heartGeo, new THREE.MeshBasicMaterial({ color: cfg.color, side: THREE.DoubleSide }));
      heart.scale.setScalar(1.4);
      heart.position.y = 0.05;
      g.add(heart);
    } else if (type === 'rage') {
      const burstGeo = new THREE.ConeGeometry(0.1, 0.35, 4);
      const burstMat = new THREE.MeshBasicMaterial({ color: cfg.color });
      for (let i = 0; i < 7; i++) {
        const spike = new THREE.Mesh(burstGeo, burstMat);
        const ang = (i / 7) * Math.PI * 2;
        spike.position.set(Math.cos(ang) * 0.32, Math.sin(ang) * 0.32, 0);
        spike.rotation.z = ang - Math.PI / 2;
        spike.scale.set(1, 1.5, 1);
        g.add(spike);
      }
      const core = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), new THREE.MeshBasicMaterial({ color: cfg.glow }));
      g.add(core);
    } else if (type === 'laugh') {
      const leftGeo = new THREE.CapsuleGeometry(0.06, 0.2, 4, 6);
      const left = new THREE.Mesh(leftGeo, new THREE.MeshBasicMaterial({ color: 0x222222 }));
      left.rotation.z = -0.3;
      left.position.set(-0.14, 0.12, 0.2);
      g.add(left);
      const right = new THREE.Mesh(leftGeo, left.material);
      right.rotation.z = 0.3;
      right.position.set(0.14, 0.12, 0.2);
      g.add(right);
      const mouthGeo = new THREE.TorusGeometry(0.16, 0.04, 6, 12, Math.PI);
      const mouth = new THREE.Mesh(mouthGeo, new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide }));
      mouth.rotation.z = Math.PI;
      mouth.position.set(0, -0.08, 0.2);
      g.add(mouth);
    } else if (type === 'salute') {
      const starGeo = new THREE.OctahedronGeometry(0.28, 0);
      const star = new THREE.Mesh(starGeo, new THREE.MeshBasicMaterial({ color: cfg.color }));
      g.add(star);
      const barGeo = new THREE.BoxGeometry(0.4, 0.06, 0.05);
      for (const dy of [-0.22, 0.22]) {
        const bar = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: cfg.glow }));
        bar.position.y = dy;
        g.add(bar);
      }
    }

    return g;
  }

  function clearActive() {
    if (!state.active) return;
    SCENE.remove(state.active);
    const meshes = [];
    state.active.traverse(c => { if (c.isMesh) meshes.push(c); });
    for (const m of meshes) {
      if (m.geometry && !m.geometry._shared) m.geometry.dispose();
      if (m.material) m.material.dispose();
    }
    state.active = null;
  }

  function play(type) {
    if (!ICONS[type]) return;
    const ms = window.Manager && window.Manager.state ? window.Manager.state : null;
    if (!ms || ms.phase !== 'playing' || !ms.playerAlive) return;
    if (state.cooldown > 0) return;
    clearActive();
    state.active = buildIcon(type);
    state.active.visible = false;
    SCENE.add(state.active);
    state.life = EMOTE_LIFE;
    state.cooldown = COOLDOWN;
    state.ringPulse = 1.0;
    playSound(type);
    reactBots(type);
  }

  function playSound(type) {
    if (!window.Sound || !window.Sound.tone) return;
    const cfg = ICONS[type];
    if (cfg.sound === 'victory') {
      Sound.tone(523, 0.1, 'square', 0.2, 2000);
      setTimeout(() => Sound.tone(659, 0.1, 'square', 0.2, 2000), 90);
      setTimeout(() => Sound.tone(784, 0.22, 'square', 0.22, 2000), 180);
    } else if (cfg.sound === 'skull') {
      Sound.tone(110, 0.5, 'sawtooth', 0.25, 600);
    } else if (cfg.sound === 'heart') {
      Sound.tone(660, 0.12, 'sine', 0.2, 3000);
      setTimeout(() => Sound.tone(880, 0.18, 'sine', 0.18, 3000), 100);
    } else if (cfg.sound === 'rage') {
      Sound.tone(80, 0.35, 'sawtooth', 0.3, 800);
      Sound.tone(200, 0.25, 'square', 0.15, 1500);
    } else if (cfg.sound === 'laugh') {
      for (let i = 0; i < 3; i++) {
        setTimeout(() => Sound.tone(400 + i * 100, 0.08, 'square', 0.18, 1800), i * 110);
      }
    } else if (cfg.sound === 'salute') {
      Sound.tone(440, 0.08, 'sine', 0.18, 2500);
      setTimeout(() => Sound.tone(660, 0.15, 'sine', 0.2, 2500), 80);
    }
  }

  // Taunts ripple through the battlefield: mocking foes (rage/laugh) snaps them
  // onto the player — deer break into antler charges, gunners open up at once —
  // while cheering allies (victory/heart) patches them up and steadies their aim.
  // Uses real entity fields read by entities.js, so the effect is tactical, not
  // just cosmetic.
  function reactBots(type) {
    if (!window.Entities || !Array.isArray(Entities.list)) return;
    const pt = (window.Manager && window.Manager.state) ? Manager.state.playerTeam : 'hunter';
    const cp = CAMERA.position;
    const enraged = (type === 'rage' || type === 'laugh');   // mock foes → they snap & charge
    const rally = (type === 'victory' || type === 'heart');  // cheer allies → patch-up & push
    if (!enraged && !rally) return;
    for (const e of Entities.list) {
      if (e.dead) continue;
      const m = e.mesh;
      if (!m) continue;
      const dx = m.position.x - cp.x;
      const dz = m.position.z - cp.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > BOT_REACT_RADIUS * BOT_REACT_RADIUS) continue;
      if (e.team !== pt) {
        if (!enraged) continue;
        // Provocation: snap-target the player and open fire at once; deer break
        // into an antler charge aimed straight at you.
        e.fireCd = Math.min(e.fireCd || 0, 0.15);
        e.facing = Math.atan2(cp.x - m.position.x, cp.z - m.position.z);
        if (e.team === 'deer' && e.hasAntlers && !e.charging && (e.chargeCd || 0) <= 0) {
          e.charging = true;
          e.chargeTime = Math.max(e.chargeTime || 0, 1.1);
          e.chargeCd = 5;
          if (m.userData && m.userData.aura) m.userData.aura.visible = true;
        }
        if (window.CombatText) {
          window.CombatText.spawn(m.position.clone().setY(m.position.y + 1.7), '!', { color: '#ff5533', size: 18 });
        }
      } else {
        if (!rally) continue;
        // Morale boost: a quick patch-up plus a snapped trigger so the line holds.
        const before = e.hp;
        e.hp = Math.min(e.maxHp || e.hp, e.hp + 14);
        e.fireCd = Math.min(e.fireCd || 0, 0.2);
        if (window.CombatText && e.hp > before) {
          window.CombatText.spawn(m.position.clone().setY(m.position.y + 1.6), '+' + Math.round(e.hp - before), { color: '#7fff9a', size: 14 });
        }
      }
    }
  }

  function update(dt) {
    if (state.cooldown > 0) state.cooldown -= dt;
    if (state.ringPulse > 0) state.ringPulse = Math.max(0, state.ringPulse - dt * 0.8);
    if (!state.active || state.life <= 0) return;

    state.life -= dt;
    if (state.life <= 0) {
      clearActive();
      return;
    }

    const t = state.life / EMOTE_LIFE;
    const fadeStart = 0.3;
    const opacity = t < fadeStart ? t / fadeStart : 1;
    const scale = 0.7 + (1 - t) * 0.35 + Math.sin(state.bob) * 0.06;
    state.bob += dt * 5;

    state.active.position.set(
      CAMERA.position.x,
      CAMERA.position.y + EMOTE_RISE + Math.sin(state.bob * 0.7) * 0.15,
      CAMERA.position.z,
    );

    if (CAMERA.matrixWorldNeedsUpdate) CAMERA.updateMatrixWorld();
    shared.camDir.setFromMatrixColumn(CAMERA.matrixWorld, 2).normalize();
    shared.targetPos.copy(state.active.position).addScaledVector(shared.camDir, -1.5);
    state.active.position.copy(shared.targetPos);
    state.active.quaternion.copy(CAMERA.quaternion);

    const pulseScale = 1 + state.ringPulse * 0.5;
    state.active.scale.setScalar(scale * pulseScale);
    state.active.visible = true;

    state.active.traverse(c => {
      if (c.isMesh && c.material) {
        if (c.material.opacity !== undefined) {
          c.material.transparent = true;
          c.material.opacity = (c.userData.baseOpacity || 1) * opacity;
        }
        if (c.userData._launched) return;
        c.userData._launched = true;
        c.userData.baseOpacity = c.material.opacity || 1;
      }
    });
  }

  function init() {
    window.addEventListener('keydown', (e) => {
      const type = KEY_MAP[e.key];
      if (type) play(type);
    });
    if (window.FX && window.FX.message) {
      const orig = FX.message;
      FX.message = function(text, color) {
        orig(text, color);
      };
    }
  }

  if (window.Sky && window.Sky.state) {
    const hookUpdate = () => {};
    hookUpdate();
  }

  if (window.GameLoopHooks) window.GameLoopHooks.emotes = update;

  return { state, play, update, init, ICONS };
})();
window.Emotes = Emotes;