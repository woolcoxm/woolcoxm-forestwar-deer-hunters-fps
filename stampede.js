// stampede.js — FORESTWAR ultimate: call a thundering wedge of wild elk that
// charges through the enemy line, trampling and scattering everything ahead.
// Direction follows where you face. A long-cooldown tactical tide of nature.
//   [O]  unleash the stampede (long cooldown; brief warning lane, then the herd)
const THREE = window.THREE;
const SCENE = window.SCENE;

const Stampede = (() => {
  const COOLDOWN = 52.0;          // seconds between uses
  const WINDUP = 1.0;             // telegraph lane before the herd arrives
  const SPAWN_BACK = 26;          // how far behind the player the herd forms
  const SPEED = 27;               // charge speed (units / second)
  const MAX_LIFE = 7.0;           // hard cap before any survivors disperse
  // Wedge layout: a DEEP column of elk so the herd lingers over each point it sweeps
  // (a thin wall would blow past too fast to hurt anything).
  const COLS = 4, ROWS = 4;
  const ELK_COUNT = COLS * ROWS;          // 16
  const LAT_SPACING = 3.0;                // lateral gap between elk
  const DEPTH_SPACING = 4.0;              // gap between rows along the charge axis
  const HERD_DEPTH = (ROWS - 1) * DEPTH_SPACING;
  const WEDGE_HALF_WIDTH = (COLS - 1) / 2 * LAT_SPACING + 1.8;
  const DPS = 190;                        // damage/sec while a foe is under the herd
                                        // -> ~95 dmg over a full pass (HERD_DEPTH / SPEED)
  const ENTRY_KNOCKBACK = 1.4;           // shove along the charge dir on first contact
  const FIRE_STUN = 0.9;                  // how long trampled foes are too rattled to fire
  const MAP_HALF = (window.WORLD_SIZE || 300) / 2 + 26;
  const NEAR_PLAYER_SHAKE_R2 = 26; // elk this close kicks the camera

  const state = {
    phase: 'idle',                // 'idle' | 'winding' | 'charging'
    cd: 0,
    windTimer: 0,
    chargeTimer: 0,
    yaw: 0,
    dir: new THREE.Vector3(0, 0, -1),
    right: new THREE.Vector3(1, 0, 0),
    origin: new THREE.Vector3(),
    hoofTimer: 0,
  };

  const elks = [];
  const inside = new Set();       // foes currently under the herd (entry effects fire once)
  let bossInside = false;

  // ---- reusable elk geometry (shared; never disposed per-shot) ----
  const BODY_GEO = new THREE.CapsuleGeometry(0.26, 0.95, 4, 8);
  const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: 0.9, flatShading: true });
  const HEAD_GEO = new THREE.SphereGeometry(0.2, 8, 6);
  const LEG_GEO = new THREE.CylinderGeometry(0.055, 0.07, 0.85, 5);
  const LEG_MAT = new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.95 });
  const HORN_GEO = new THREE.ConeGeometry(0.045, 0.55, 4);
  const HORN_MAT = new THREE.MeshStandardMaterial({ color: 0xd8c8a0, roughness: 0.6 });
  const EYE_GEO = new THREE.SphereGeometry(0.045, 6, 5);
  const EYE_MAT = new THREE.MeshBasicMaterial({ color: 0xff3322 });

  function buildElk() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(BODY_GEO, BODY_MAT);
    body.castShadow = true;
    body.rotation.x = Math.PI / 2;   // lay the capsule along the forward (Z) axis
    body.position.y = 0.9;
    g.add(body);
    const head = new THREE.Mesh(HEAD_GEO, BODY_MAT);
    head.castShadow = true;
    head.position.set(0, 1.08, 0.6);
    g.add(head);
    for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(HORN_GEO, HORN_MAT);
      h.position.set(sx * 0.1, 1.36, 0.58);
      h.rotation.z = sx * 0.6;
      g.add(h);
    }
    for (const sx of [-0.08, 0.08]) {
      const eye = new THREE.Mesh(EYE_GEO, EYE_MAT);
      eye.position.set(sx, 1.12, 0.78);
      g.add(eye);
    }
    // Defined leg order so the gallop diagonal pairs are explicit: [FL, FR, BL, BR]
    const legs = [];
    const legDefs = [
      [-0.15, 0.32],   // front-left
      [0.15, 0.32],    // front-right
      [-0.15, -0.32],  // back-left
      [0.15, -0.32],   // back-right
    ];
    for (const [sx, sz] of legDefs) {
      const leg = new THREE.Mesh(LEG_GEO, LEG_MAT);
      leg.position.set(sx, 0.45, sz);
      g.add(leg);
      legs.push(leg);
    }
    g.userData.legs = legs;
    return g;
  }

  // ---- windup telegraph: a flat glowing lane that orients with the player's facing ----
  const laneMat = new THREE.MeshBasicMaterial({
    color: 0xd08a3a, transparent: true, opacity: 0.32,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const lanePivot = new THREE.Group();
  const lanePlane = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 112), laneMat);
  lanePlane.rotation.x = -Math.PI / 2;   // lay flat (long axis then orients with pivot Y)
  lanePivot.add(lanePlane);
  lanePivot.visible = false;
  SCENE.add(lanePivot);

  // ---- HUD: cooldown / ready bar (mirrors the warcry layout, slotted just below it) ----
  const hud = document.getElementById('hud');
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:16px;bottom:172px;width:170px;'
    + 'font-size:11px;letter-spacing:2px;text-shadow:0 1px 3px #000;z-index:6;';
  const label = document.createElement('div');
  label.style.cssText = 'color:#c8843a;margin-bottom:3px;';
  label.textContent = 'STAMPEDE [O]';
  wrap.appendChild(label);
  const bar = document.createElement('div');
  bar.style.cssText = 'width:100%;height:7px;background:rgba(0,0,0,0.55);'
    + 'border:1px solid rgba(200,132,58,0.4);border-radius:4px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#7a4a22,#d08a3a);'
    + 'transition:width 0.1s linear;';
  bar.appendChild(fill);
  wrap.appendChild(bar);
  if (hud) hud.appendChild(wrap);

  function playerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function updateHUD() {
    if (state.phase === 'charging' || state.phase === 'winding') {
      fill.style.width = '100%';
      fill.style.background = 'linear-gradient(90deg,#a85a22,#ffaa44)';
      label.style.color = '#ffaa55';
      label.textContent = state.phase === 'winding' ? 'STAMPEDE INCOMING' : 'STAMPEDE CHARGING';
    } else if (state.cd > 0) {
      const pct = Math.max(0, 1 - state.cd / COOLDOWN);
      fill.style.width = (pct * 100) + '%';
      fill.style.background = 'linear-gradient(90deg,#5a3a22,#8a6a3a)';
      label.style.color = '#8a6a6a';
      label.textContent = 'STAMPEDE ' + Math.ceil(state.cd) + 's';
    } else {
      fill.style.width = '100%';
      fill.style.background = 'linear-gradient(90deg,#7a4a22,#d08a3a)';
      label.style.color = '#c8843a';
      label.textContent = 'STAMPEDE READY [O]';
    }
  }

  function beginWindup() {
    const p = window.Player ? window.Player.state : null;
    if (!p) return;
    const yaw = p.yaw || 0;
    state.yaw = yaw;
    state.dir.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
    state.right.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
    state.phase = 'winding';
    state.windTimer = WINDUP;

    const cam = window.CAMERA;
    const gy = window.groundHeight ? window.groundHeight(cam.position.x, cam.position.z) : cam.position.y - 1.7;
    lanePivot.position.set(cam.position.x, gy + 0.12, cam.position.z);
    lanePivot.rotation.y = yaw;          // long axis points along the player's forward
    lanePivot.visible = true;

    if (window.FX && window.FX.message) window.FX.message('STAMPEDE INCOMING!', '#d08a3a');
    if (window.Sound && window.Sound.rumble) window.Sound.rumble(0.8);
    if (window.FX && window.FX.shake) window.FX.shake(0.08);
    updateHUD();
  }

  function spawnHerd() {
    const cam = window.CAMERA;
    const gy = window.groundHeight ? window.groundHeight(cam.position.x, cam.position.z) : cam.position.y - 1.7;
    state.origin.set(
      cam.position.x - state.dir.x * SPAWN_BACK,
      gy,
      cam.position.z - state.dir.z * SPAWN_BACK
    );
    let idx = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const lat = (c - (COLS - 1) / 2) * LAT_SPACING + (Math.random() - 0.5) * 0.8;
        const dep = r * DEPTH_SPACING + (Math.random() - 0.5) * 0.6;
        const px = state.origin.x + state.right.x * lat + state.dir.x * dep;
        const pz = state.origin.z + state.right.z * lat + state.dir.z * dep;
        const m = buildElk();
        const ey = window.groundHeight ? window.groundHeight(px, pz) : gy;
        m.position.set(px, ey, pz);
        m.rotation.y = Math.atan2(state.dir.x, state.dir.z);   // face the charge direction
        SCENE.add(m);
        elks.push({
          mesh: m,
          legPhase: Math.random() * Math.PI * 2 + r * 0.5,
          weave: Math.random() * Math.PI * 2,
          lateral: lat,
        });
        idx++;
      }
    }
    // Panicked ambient wildlife bolts from the thunder — emergent battlefield chaos.
    if (typeof window.scatterHerds === 'function') window.scatterHerds(state.origin.x, state.origin.z);
    if (window.Sound && window.Sound.rumble) window.Sound.rumble(1.4);
    if (window.FX && window.FX.shake) window.FX.shake(0.2);
  }

  // Project a world point onto the charge axis (dir) and the lane axis (right),
  // relative to where the herd's trailing row currently sits.
  function laneProjection(fx, fz) {
    const refX = state.origin.x + state.dir.x * (SPEED * state.chargeTimer);
    const refZ = state.origin.z + state.dir.z * (SPEED * state.chargeTimer);
    const dx = fx - refX, dz = fz - refZ;
    const along = dx * state.dir.x + dz * state.dir.z;      // depth into the herd (0 = trailing row)
    const across = dx * state.right.x + dz * state.right.z;  // lateral offset from lane centre
    return { along, across };
  }

  // First-contact impact: a shove down the lane, a beat of shock, and dust.
  function entryImpact(e) {
    e.mesh.position.x += state.dir.x * ENTRY_KNOCKBACK;
    e.mesh.position.z += state.dir.z * ENTRY_KNOCKBACK;
    if (e.fireCd !== undefined) e.fireCd = Math.max(e.fireCd, FIRE_STUN);
    if (e.charging) {
      e.charging = false;
      e.chargeTime = 0;
      if (e.mesh.userData && e.mesh.userData.aura) e.mesh.userData.aura.visible = false;
    }
    if (window.FX && window.FX.burst) {
      window.FX.burst(e.mesh.position.clone().setY(1.0), new THREE.Vector3(state.dir.x, 1, state.dir.z), 0xb07040, 7);
    }
  }

  function applyTrample(dt) {
    const ents = (window.Entities && Array.isArray(window.Entities.list)) ? window.Entities.list : [];
    const pt = playerTeam();
    const dmg = DPS * dt;
    for (const e of ents) {
      if (e.dead || e.team === pt || !e.mesh) { inside.delete(e); continue; }
      const p = laneProjection(e.mesh.position.x, e.mesh.position.z);
      const inLane = p.across <= WEDGE_HALF_WIDTH && p.across >= -WEDGE_HALF_WIDTH &&
                     p.along >= -1.6 && p.along <= HERD_DEPTH + 1.6;
      if (!inLane) { inside.delete(e); continue; }
      if (!inside.has(e)) { inside.add(e); entryImpact(e); }
      // Continuous trample damage; route the killing blow through Entities.kill
      // so it still credits the player's killstreak, score and loot.
      e.hp -= dmg;
      if (e.hp <= 0 && !e.dead) {
        if (window.Entities && window.Entities.kill) window.Entities.kill(e, pt);
        inside.delete(e);
      }
    }

    // The mega-stag shrugs but still bleeds while the whole wedge pours through it.
    const B = window.Boss;
    if (B && B.state && B.state.active && B.state.mesh && B.state.phase !== 'dead') {
      const p = laneProjection(B.state.mesh.position.x, B.state.mesh.position.z);
      const br = B.state.radius || 2.6;
      const inLane = p.across <= WEDGE_HALF_WIDTH + br && p.across >= -(WEDGE_HALF_WIDTH + br) &&
                     p.along >= -1.6 - br && p.along <= HERD_DEPTH + 1.6 + br;
      if (!inLane) {
        bossInside = false;
      } else {
        if (!bossInside) {
          bossInside = true;
          if (window.FX && window.FX.burst) window.FX.burst(B.state.mesh.position.clone().setY(2), new THREE.Vector3(0, 1, 0), 0xaa5533, 10);
        }
        if (typeof B.damage === 'function') B.damage(dmg);
      }
    } else {
      bossInside = false;
    }
  }

  function dustPuff(pos, gy) {
    if (!window.FX || !window.FX.dustPuff) return;
    const v = new THREE.Vector3(pos.x, gy + 0.1, pos.z);
    window.FX.dustPuff(v);
  }

  function removeElk(idx) {
    const elk = elks[idx];
    if (elk && elk.mesh) SCENE.remove(elk.mesh);
    elks.splice(idx, 1);
  }

  function endCharge() {
    for (let i = elks.length - 1; i >= 0; i--) removeElk(i);
    inside.clear();
    bossInside = false;
    state.phase = 'idle';
    state.cd = COOLDOWN;
    state.chargeTimer = 0;
    lanePivot.visible = false;
    updateHUD();
  }

  function update(dt) {
    if (state.cd > 0 && state.phase === 'idle') {
      state.cd -= dt;
      if (state.cd <= 0) {
        state.cd = 0;
        if (window.FX && window.FX.message) window.FX.message('STAMPEDE READY', '#d08a3a');
      }
      updateHUD();
    }

    if (state.phase === 'winding') {
      state.windTimer -= dt;
      // Pulse the warning lane so it reads as "something is coming".
      laneMat.opacity = 0.2 + Math.abs(Math.sin(state.windTimer * 14)) * 0.35;
      if (state.windTimer <= 0) {
        lanePivot.visible = false;
        state.phase = 'charging';
        state.chargeTimer = 0;
        state.hoofTimer = 0;
        spawnHerd();
      }
      return;
    }

    if (state.phase !== 'charging') return;

    state.chargeTimer += dt;
    const cam = window.CAMERA;
    // Layered distant thunder while the herd is loose.
    state.hoofTimer -= dt;
    if (state.hoofTimer <= 0) {
      state.hoofTimer = 0.16;
      if (window.Sound && window.Sound.tone) window.Sound.tone(70 + Math.random() * 30, 0.08, 'sine', 0.12, 220);
    }

    for (let i = elks.length - 1; i >= 0; i--) {
      const elk = elks[i];
      const m = elk.mesh;
      // Surge forward along the charge direction.
      m.position.x += state.dir.x * SPEED * dt;
      m.position.z += state.dir.z * SPEED * dt;
      // Small lateral weave for an organic, restless wedge.
      elk.weave += dt * 5;
      const w = Math.sin(elk.weave + elk.lateral) * 0.7 * dt;
      m.position.x += state.right.x * w;
      m.position.z += state.right.z * w;

      const gy = window.groundHeight ? window.groundHeight(m.position.x, m.position.z) : 0;
      elk.legPhase += dt * SPEED * 0.9;
      m.position.y = gy + Math.abs(Math.sin(elk.legPhase)) * 0.12;
      const legs = m.userData.legs;
      if (legs) {
        legs[0].rotation.x = Math.sin(elk.legPhase) * 0.6;        // FL
        legs[3].rotation.x = Math.sin(elk.legPhase) * 0.6;        // BR  (diagonal pair)
        legs[1].rotation.x = Math.sin(elk.legPhase + Math.PI) * 0.6; // FR
        legs[2].rotation.x = Math.sin(elk.legPhase + Math.PI) * 0.6; // BL
      }
      if (Math.random() < dt * 8) dustPuff(m.position, gy);

      if (cam) {
        const dxp = m.position.x - cam.position.x;
        const dzp = m.position.z - cam.position.z;
        if (dxp * dxp + dzp * dzp < NEAR_PLAYER_SHAKE_R2 && window.FX && window.FX.shake) {
          window.FX.shake(0.1);
        }
      }
      // Elk that clear the world edge thunder off into the treeline and are gone.
      if (Math.abs(m.position.x) > MAP_HALF || Math.abs(m.position.z) > MAP_HALF) removeElk(i);
    }

    applyTrample(dt);

    if (elks.length === 0 || state.chargeTimer >= MAX_LIFE) endCharge();
  }

  function reset() {
    for (let i = elks.length - 1; i >= 0; i--) removeElk(i);
    inside.clear();
    bossInside = false;
    state.phase = 'idle';
    state.cd = 0;
    state.windTimer = 0;
    state.chargeTimer = 0;
    lanePivot.visible = false;
    laneMat.opacity = 0.32;
    updateHUD();
  }

  function init() { updateHUD(); }

  // Keybind: [O] to call the herd. (G is the artillery barrage, Y the warcry.)
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'o' && e.key !== 'O') return;
    if (e.repeat) return;
    const ms = window.Manager && window.Manager.state;
    if (!ms || ms.phase !== 'playing') return;
    if (!window.Player || !Player.state.locked) return;
    if (state.phase !== 'idle') return;
    if (state.cd > 0) {
      if (window.FX && window.FX.message) window.FX.message('STAMPEDE ' + Math.ceil(state.cd) + 's', '#8a6a6a');
      return;
    }
    beginWindup();
  });

  updateHUD();

  return { state, init, update, reset };
})();
window.Stampede = Stampede;
