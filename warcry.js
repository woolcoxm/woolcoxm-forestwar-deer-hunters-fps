// warcry.js — FORESTWAR battle roar: a shockwave bellow that shatters enemy ranks
// and inspires nearby allies. (Deer bellow, hunters bawl — even a parrot can yell.)
//   [Y]  unleashes the roar at the cost of stamina; knocks back, stuns & damages foes
//        in radius, and briefly inspires allied fighters + the player with extra speed.
const THREE = window.THREE;
const SCENE = window.SCENE;

const Warcry = (() => {
  const RADIUS = 9.0;
  const ENEMY_DAMAGE = 26;
  const KNOCKBACK = 3.4;
  const FIRE_STUN = 1.7;       // how long struck foes are too rattled to attack
  const ALLY_SPEED_MULT = 1.35;
  const ALLY_DAMAGE_MULT = 1.25;
  const ALLY_DURATION = 6.0;
  const PLAYER_SPEED_MULT = 1.28;
  const PLAYER_DURATION = 4.0;
  const STAMINA_COST = 38;
  const COOLDOWN = 16.0;
  const WAVE_TIME = 0.55;      // shockwave expansion window

  const state = {
    ready: true,
    cd: 0,
    playerBuff: 0,
    pulsePhase: 0,
  };

  // Active shockwave visuals + the tracked ally buffs.
  const waves = [];
  const buffs = [];

  // ---- Reusable geometry/materials ----
  const RING_GEO = new THREE.RingGeometry(0.6, 1.0, 40);
  const RING_MAT = new THREE.MeshBasicMaterial({
    color: 0xffd24a, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const DOME_GEO = new THREE.TorusGeometry(1.0, 0.07, 8, 28);
  const DOME_MAT = new THREE.MeshBasicMaterial({
    color: 0xffe98a, transparent: true, opacity: 0,
  });
  const CORE_GEO = new THREE.SphereGeometry(0.5, 10, 8);
  const CORE_MAT = new THREE.MeshBasicMaterial({
    color: 0xfff0b0, transparent: true, opacity: 0,
  });

  // ---- HUD ----
  const hud = document.getElementById('hud');
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:16px;bottom:212px;width:170px;'
    + 'font-size:11px;letter-spacing:2px;text-shadow:0 1px 3px #000;z-index:6;';
  const label = document.createElement('div');
  label.style.cssText = 'color:#ffcc55;margin-bottom:3px;';
  label.textContent = 'WARCRY [Y]';
  wrap.appendChild(label);
  const bar = document.createElement('div');
  bar.style.cssText = 'width:100%;height:7px;background:rgba(0,0,0,0.55);'
    + 'border:1px solid rgba(255,180,60,0.4);border-radius:4px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#cc6622,#ffd24a);'
    + 'transition:width 0.08s linear;';
  bar.appendChild(fill);
  wrap.appendChild(bar);
  if (hud) hud.appendChild(wrap);

  // Golden radial flash that punches in on activation, then fades.
  const flash = document.createElement('div');
  flash.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;'
    + 'z-index:4;box-shadow:inset 0 0 160px 36px rgba(255,180,40,0.55);'
    + 'transition:opacity 0.5s ease-out;';
  if (hud) hud.appendChild(flash);

  function playerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function updateHUD() {
    if (state.ready) {
      fill.style.width = '100%';
      label.style.color = '#ffcc55';
      label.textContent = 'WARCRY READY [Y]';
    } else {
      const pct = Math.max(0, 1 - state.cd / COOLDOWN);
      fill.style.width = (pct * 100) + '%';
      label.style.color = '#8a8a6a';
      label.textContent = 'WARCRY ' + Math.ceil(state.cd) + 's';
    }
  }

  function getPlayerSpeedMult() {
    return state.playerBuff > 0 ? PLAYER_SPEED_MULT : 1.0;
  }

  function spawnShockwave(origin) {
    // Flat ground ring expanding outward.
    const ring = new THREE.Mesh(RING_GEO, RING_MAT.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(origin);
    ring.position.y += 0.08;
    SCENE.add(ring);
    waves.push({ mesh: ring, life: WAVE_TIME, maxLife: WAVE_TIME, maxScale: RADIUS, kind: 'ring' });

    // Upright dome for a sense of 3D pressure.
    const dome = new THREE.Mesh(DOME_GEO, DOME_MAT.clone());
    dome.position.copy(origin);
    dome.position.y += 0.6;
    SCENE.add(dome);
    waves.push({ mesh: dome, life: WAVE_TIME, maxLife: WAVE_TIME, maxScale: RADIUS * 0.9, kind: 'dome' });

    // Bright core flash at the bellow's source.
    const core = new THREE.Mesh(CORE_GEO, CORE_MAT.clone());
    core.position.copy(origin);
    core.position.y += 1.0;
    SCENE.add(core);
    waves.push({ mesh: core, life: 0.22, maxLife: 0.22, maxScale: 2.4, kind: 'core' });

    // Warm point-light pop so the forest lights up for a beat.
    const light = new THREE.PointLight(0xffcc55, 10, RADIUS * 2.4, 2);
    light.position.copy(origin);
    light.position.y += 1.4;
    SCENE.add(light);
    waves.push({ mesh: light, life: 0.34, maxLife: 0.34, kind: 'light' });

    // Kicked-up dust + embers around the roar.
    if (window.FX && window.FX.burst) {
      window.FX.burst(origin.clone().setY(0.6), new THREE.Vector3(0, 1, 0), 0x9a7a44, 10);
      window.FX.burst(origin.clone().setY(1.0), new THREE.Vector3(0, 1, 0), 0xffcc66, 8);
    }
  }

  function buffAlly(e) {
    if (!e || e.dead) return;
    // Capture originals only once so stacking re-roars refresh, never compound.
    if (!e._warcryOrig) {
      e._warcryOrig = { speed: e.speed, damage: e.damage };
      e.speed *= ALLY_SPEED_MULT;
      e.damage *= ALLY_DAMAGE_MULT;
    }
    let entry = null;
    for (const b of buffs) if (b.ent === e) { entry = b; break; }
    if (!entry) { entry = { ent: e, timer: 0 }; buffs.push(entry); }
    entry.timer = ALLY_DURATION;
  }

  function expireBuff(entry) {
    const e = entry.ent;
    if (e && e._warcryOrig) {
      e.speed = e._warcryOrig.speed;
      e.damage = e._warcryOrig.damage;
      e._warcryOrig = null;
    }
  }

  function roar() {
    if (!state.ready) {
      if (window.FX) window.FX.message('WARCRY RECOVERING', '#ff6644');
      return;
    }
    const p = window.Player ? window.Player.state : null;
    if (p && p.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('INSUFFICIENT STAMINA', '#ff6644');
      return;
    }
    if (!window.Player || !Player.state.locked) return;

    if (p) {
      p.stamina -= STAMINA_COST;
      p.regenTimer = Math.max(p.regenTimer || 0, 1.4);
    }
    state.ready = false;
    state.cd = COOLDOWN;
    state.playerBuff = PLAYER_DURATION;
    state.pulsePhase = 0;

    const cam = window.CAMERA;
    const gx = window.groundHeight ? window.groundHeight(cam.position.x, cam.position.z) : cam.position.y - 1.7;
    const origin = new THREE.Vector3(cam.position.x, gx, cam.position.z);
    spawnShockwave(origin);

    const pt = playerTeam();
    const r2 = RADIUS * RADIUS;
    const ents = (window.Entities && Array.isArray(window.Entities.list)) ? window.Entities.list : [];
    const srcPos = new THREE.Vector3(cam.position.x, gx + 1.0, cam.position.z);

    for (const e of ents) {
      if (e.dead || !e.mesh) continue;
      const dx = e.mesh.position.x - cam.position.x;
      const dz = e.mesh.position.z - cam.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      if (e.team === pt) {
        // Ally in range is fired up — speed & bite damage up for a stretch.
        buffAlly(e);
      } else {
        // Foe is bowled over: damage, shove, and a beat of shock where they can't strike back.
        if (window.Entities && window.Entities.damage) {
          window.Entities.damage(e, ENEMY_DAMAGE, srcPos.clone(), { byPlayer: true, team: pt });
        }
        const d = Math.sqrt(d2) || 1;
        const shx = (dx / d) * KNOCKBACK;
        const shz = (dz / d) * KNOCKBACK;
        e.mesh.position.x += shx;
        e.mesh.position.z += shz;
        e.facing = Math.atan2(shx, shz);
        e.fireCd = Math.max(e.fireCd, FIRE_STUN);
        // A charging stag gets knocked clean out of its charge.
        if (e.charging) {
          e.charging = false;
          e.chargeTime = 0;
          if (e.mesh.userData && e.mesh.userData.aura) e.mesh.userData.aura.visible = false;
        }
        if (window.FX && window.FX.burst) {
          window.FX.burst(e.mesh.position.clone().setY(1.1), new THREE.Vector3(shx, 1, shz).normalize(), 0xff8844, 6);
        }
      }
    }

    // Player feedback: golden flash, screen shake, and a layered beastly bellow.
    flash.style.transition = 'opacity 0.08s';
    flash.style.opacity = '1';
    setTimeout(() => {
      flash.style.transition = 'opacity 0.5s ease-out';
      flash.style.opacity = '0';
    }, 90);
    if (window.FX && window.FX.shake) window.FX.shake(0.22);
    if (window.FX && window.FX.message) window.FX.message('WARCRY!', '#ffd24a');
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(150, 0.45, 'sawtooth', 0.34, 420);
      window.Sound.tone(95, 0.6, 'sawtooth', 0.28, 260);
      window.Sound.tone(300, 0.18, 'square', 0.14, 900);
    }
    updateHUD();
  }

  function updateWaves(dt) {
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.life -= dt;
      const t = Math.max(0, w.life / w.maxLife);   // 1 -> 0
      const grow = 1 - t;
      if (w.kind === 'ring' || w.kind === 'dome') {
        w.mesh.scale.setScalar(Math.max(0.15, grow * w.maxScale));
        if (w.mesh.material) w.mesh.material.opacity = t * 0.85;
        if (w.kind === 'dome') w.mesh.rotation.y += dt * 6;
      } else if (w.kind === 'core') {
        w.mesh.scale.setScalar(0.6 + grow * w.maxScale);
        if (w.mesh.material) w.mesh.material.opacity = t;
      } else if (w.kind === 'light') {
        w.mesh.intensity = t * 10;
      }
      if (w.life <= 0) {
        SCENE.remove(w.mesh);
        // Shared geometries (RING/DOME/CORE) are module-level and reused;
        // only the per-shot cloned materials get disposed.
        if (w.mesh.material && w.mesh.material.dispose && (w.kind === 'ring' || w.kind === 'dome' || w.kind === 'core')) {
          w.mesh.material.dispose();
        }
        waves.splice(i, 1);
      }
    }
  }

  function updateBuffs(dt) {
    for (let i = buffs.length - 1; i >= 0; i--) {
      const entry = buffs[i];
      const e = entry.ent;
      entry.timer -= dt;
      if (!e || e.dead || entry.timer <= 0) {
        expireBuff(entry);
        buffs.splice(i, 1);
      }
    }
  }

  function update(dt) {
    if (!state.ready) {
      state.cd -= dt;
      if (state.cd <= 0) {
        state.cd = 0;
        state.ready = true;
        if (window.FX) window.FX.message('WARCRY READY', '#ffd24a');
        updateHUD();
      } else {
        updateHUD();
      }
    }
    if (state.playerBuff > 0) {
      state.playerBuff -= dt;
      if (state.playerBuff < 0) state.playerBuff = 0;
    }
    updateWaves(dt);
    updateBuffs(dt);
  }

  function reset() {
    state.ready = true;
    state.cd = 0;
    state.playerBuff = 0;
    state.pulsePhase = 0;
    for (const w of waves) {
      SCENE.remove(w.mesh);
      if (w.mesh.material && w.mesh.material.dispose && (w.kind === 'ring' || w.kind === 'dome' || w.kind === 'core')) {
        w.mesh.material.dispose();
      }
    }
    waves.length = 0;
    for (const entry of buffs) expireBuff(entry);
    buffs.length = 0;
    flash.style.opacity = '0';
    updateHUD();
  }

  // Keybind (matches the overlay hint).
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'y' && e.key !== 'Y') return;
    if (window.Manager && window.Manager.state && window.Manager.state.phase === 'playing' && window.Player && Player.state.locked) {
      roar();
    }
  });

  updateHUD();

  return { state, update, reset, roar, getPlayerSpeedMult };
})();
window.Warcry = Warcry;
