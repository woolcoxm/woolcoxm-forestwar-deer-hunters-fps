// charge-ability.js — FORESTWAR sprint-bash: forward dash that damages and knocks back enemies in a frontal cone
const THREE = window.THREE;
const SCENE = window.SCENE;
const CAMERA = window.CAMERA;

const Charge = (() => {
  const DASH_SPEED = 28;
  const DASH_DURATION = 0.28;
  const DAMAGE = 75;
  const CONE_DOT = 0.5;
  const CONE_RANGE = 5.5;
  const COOLDOWN = 6.0;
  const STAMINA_COST = 35;
  const KNOCKBACK_FORCE = 14;
  const KNOCKBACK_UP = 5;
  const TRAIL_MAX = 14;
  const TRAIL_LIFE = 0.3;
  const IMPACT_RING_LIFE = 0.45;
  const SCREEN_SHAKE = 0.12;
  const RECOVER_LERP = 4.0;

  const state = {
    active: false,
    timer: 0,
    cd: 0,
    direction: new THREE.Vector3(),
    hitSet: null,
  };

  const TRAIL_GEO = new THREE.SphereGeometry(0.3, 6, 5);
  const TRAIL_MAT = new THREE.MeshBasicMaterial({
    color: 0xffcc44, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const trails = [];
  for (let i = 0; i < TRAIL_MAX; i++) {
    const m = new THREE.Mesh(TRAIL_GEO, TRAIL_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    trails.push({ mesh: m, life: 0, active: false });
  }
  let trailIdx = 0;

  const IMPACT_GEO = new THREE.RingGeometry(0.5, 1.2, 24);
  const impacts = [];
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffdd66, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Mesh(IMPACT_GEO, mat);
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    impacts.push({ mesh: m, life: 0, active: false });
  }
  let impactIdx = 0;

  const SLICE_GEO = new THREE.RingGeometry(1.0, 2.2, 16, 1, -Math.PI * 0.35, Math.PI * 0.7);
  const SLICE_MAT = new THREE.MeshBasicMaterial({
    color: 0xffeeaa, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const slice = new THREE.Mesh(SLICE_GEO, SLICE_MAT.clone());
  slice.visible = false;
  slice.frustumCulled = false;
  SCENE.add(slice);

  const DASH_LIGHT = new THREE.PointLight(0xffcc44, 0, 10, 2);
  SCENE.add(DASH_LIGHT);

  const _dir = new THREE.Vector3();
  const _tmp = new THREE.Vector3();
  const _coneDot = new THREE.Vector3();

  function groundY(x, z) {
    return window.groundHeight ? window.groundHeight(x, z) : 0;
  }

  function getEnemies() {
    if (!window.Entities || !Array.isArray(window.Entities.list)) return [];
    const pt = (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
    return window.Entities.list.filter(e => !e.dead && e.team !== pt);
  }

  function tryActivate() {
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    if (!window.Player || !window.Player.state.locked) return;
    if (state.active || state.cd > 0) return;
    const p = window.Player.state;
    if (p.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('TOO EXHAUSTED', '#ff6644');
      return;
    }
    p.stamina -= STAMINA_COST;
    if (p.regenTimer !== undefined) p.regenTimer = 2.0;

    CAMERA.getWorldDirection(_dir);
    _dir.y = 0;
    if (_dir.lengthSq() < 0.001) _dir.set(0, 0, -1);
    _dir.normalize();
    state.direction.copy(_dir);
    state.active = true;
    state.timer = DASH_DURATION;
    state.hitSet = new Set();

    slice.position.copy(CAMERA.position);
    slice.position.y = groundY(CAMERA.position.x, CAMERA.position.z) + 1.2;
    slice.rotation.z = Math.atan2(_dir.x, _dir.z);
    slice.material.opacity = 0.8;
    slice.scale.setScalar(0.5);
    slice.visible = true;

    DASH_LIGHT.position.copy(CAMERA.position);
    DASH_LIGHT.intensity = 4;

    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(180, 0.15, 'sawtooth', 0.35, 1200);
      window.Sound.tone(90, 0.2, 'square', 0.25, 600);
    }
    if (window.FX && window.FX.shake) window.FX.shake(SCREEN_SHAKE);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'b' && e.key !== 'B') return;
    tryActivate();
  });

  function spawnTrail() {
    const slot = trails[trailIdx];
    trailIdx = (trailIdx + 1) % TRAIL_MAX;
    slot.mesh.position.copy(CAMERA.position);
    slot.mesh.position.y -= 0.3;
    slot.mesh.scale.setScalar(0.8 + Math.random() * 0.5);
    slot.mesh.material.opacity = 0.55;
    slot.mesh.visible = true;
    slot.life = TRAIL_LIFE;
    slot.active = true;
  }

  function spawnImpact(x, z) {
    const slot = impacts[impactIdx];
    impactIdx = (impactIdx + 1) % impacts.length;
    slot.mesh.position.set(x, groundY(x, z) + 0.08, z);
    slot.mesh.scale.setScalar(0.4);
    slot.mesh.material.opacity = 0.8;
    slot.mesh.visible = true;
    slot.life = IMPACT_RING_LIFE;
    slot.active = true;
  }

  function checkHits() {
    const camPos = CAMERA.position;
    const enemies = getEnemies();
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (state.hitSet.has(e.id || e)) continue;
      const m = e.mesh;
      if (!m) continue;
      _tmp.subVectors(m.position, camPos);
      _tmp.y = 0;
      const dist = _tmp.length();
      if (dist > CONE_RANGE) continue;
      if (dist > 0.01) {
        _tmp.divideScalar(dist);
        if (_tmp.dot(state.direction) < CONE_DOT) continue;
      }
      state.hitSet.add(e.id || e);
      const dmg = DAMAGE * ((window.Classes && window.Classes.getMeleeMult) ? window.Classes.getMeleeMult() : 1.0);
      if (e.hp !== undefined) e.hp -= dmg;
      if (e.vel) {
        e.vel.x += state.direction.x * KNOCKBACK_FORCE;
        e.vel.z += state.direction.z * KNOCKBACK_FORCE;
        e.vel.y += KNOCKBACK_UP;
      }
      if (e.knockback) {
        _coneDot.copy(state.direction).multiplyScalar(KNOCKBACK_FORCE);
        _coneDot.y = KNOCKBACK_UP;
        e.knockback.add(_coneDot);
      }
      if (e.suppress) e.suppress = Math.min(100, (e.suppress || 0) + 40);
      if (window.FX && window.FX.bloodBurst) {
        _tmp.copy(m.position);
        _tmp.y += 1.0;
        window.FX.bloodBurst(_tmp, state.direction);
      }
      if (window.CombatText && window.CombatText.spawn) {
        _tmp.copy(m.position);
        _tmp.y += 1.2;
        window.CombatText.spawn(_tmp, Math.round(dmg), { crit: true });
      }
      spawnImpact(m.position.x, m.position.z);
      if (e.hp !== undefined && e.hp <= 0 && !e.dead) {
        e.dead = true;
        if (e.deathMark) e.deathMark();
        if (window.KillRewards && window.KillRewards.notify) window.KillRewards.notify(e.team);
        if (window.KillPanel && window.KillPanel.reportKill) window.KillPanel.reportKill('melee', e);
        if (window.Manager && window.Manager.state) {
          window.Manager.state.kills[window.Manager.state.playerTeam]++;
        }
      }
    }
  }

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:16px;bottom:310px;font-size:11px;letter-spacing:2px;color:#ffcc44;text-shadow:0 1px 3px #000;z-index:6;';
  const label = document.createElement('div');
  label.textContent = 'CHARGE [B]';
  hud.appendChild(label);
  const bar = document.createElement('div');
  bar.style.cssText = 'margin-top:3px;width:80px;height:5px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,204,68,0.35);border-radius:3px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#cc8822,#ffdd55);transition:width 0.06s;';
  bar.appendChild(fill);
  hud.appendChild(bar);
  document.getElementById('hud').appendChild(hud);

  function update(dt) {
    if (state.cd > 0) {
      state.cd -= dt;
      if (state.cd < 0) state.cd = 0;
    }

    if (state.active) {
      state.timer -= dt;
      const p = window.Player.state;
      const moveDt = Math.min(dt, state.timer > 0 ? state.timer + 0.001 : dt);
      const moveDist = DASH_SPEED * moveDt;
      p.vel.x = state.direction.x * DASH_SPEED;
      p.vel.z = state.direction.z * DASH_SPEED;
      if (p.locked && window.Player.tryMove) {
        window.Player.tryMove(state.direction.x * moveDist, state.direction.z * moveDist);
      }
      spawnTrail();
      checkHits();

      DASH_LIGHT.position.copy(CAMERA.position);
      DASH_LIGHT.intensity = 3 + Math.sin(state.timer * 40) * 1.5;

      const slicePct = 1 - state.timer / DASH_DURATION;
      slice.scale.setScalar(0.5 + slicePct * 1.0);
      slice.material.opacity = 0.8 * (1 - slicePct);

      if (state.timer <= 0) {
        state.active = false;
        state.cd = COOLDOWN;
        p.vel.x *= 0.2;
        p.vel.z *= 0.2;
        DASH_LIGHT.intensity = 0;
        slice.visible = false;
      }
    } else {
      if (DASH_LIGHT.intensity > 0.01) DASH_LIGHT.intensity *= Math.pow(0.001, dt);
    }

    for (let i = 0; i < trails.length; i++) {
      const t = trails[i];
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.mesh.visible = false;
        t.active = false;
      } else {
        const pct = t.life / TRAIL_LIFE;
        t.mesh.material.opacity = pct * 0.5;
        t.mesh.scale.setScalar(0.8 + (1 - pct) * 1.2);
      }
    }

    for (let i = 0; i < impacts.length; i++) {
      const r = impacts[i];
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.mesh.visible = false;
        r.active = false;
      } else {
        const pct = r.life / IMPACT_RING_LIFE;
        r.mesh.material.opacity = pct * 0.7;
        r.mesh.scale.setScalar(0.4 + (1 - pct) * 2.2);
      }
    }

    if (!state.active && slice.material.opacity > 0) {
      slice.material.opacity *= Math.pow(0.001, dt);
      if (slice.material.opacity < 0.01) slice.visible = false;
    }

    const cdPct = state.cd > 0 ? (1 - state.cd / COOLDOWN) : 1;
    fill.style.width = (cdPct * 100) + '%';
    fill.style.background = state.cd > 0
      ? 'linear-gradient(90deg,#554422,#887744)'
      : 'linear-gradient(90deg,#cc8822,#ffdd55)';
  }

  function reset() {
    state.active = false;
    state.timer = 0;
    state.cd = 0;
    state.hitSet = null;
    DASH_LIGHT.intensity = 0;
    slice.visible = false;
    for (const t of trails) { t.active = false; t.mesh.visible = false; }
    for (const r of impacts) { r.active = false; r.mesh.visible = false; }
  }

  function init() {
    if (window.Manager && window.Manager.addUpdate) window.Manager.addUpdate(update);
  }

  window.Charge = { update, reset, init, state };
  return window.Charge;
})();