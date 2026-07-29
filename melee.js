// melee.js — FORESTWAR bayonet lunge: close-range blade strike with stamina cost, cooldown, and backstab assassination bonus
const THREE = window.THREE;
const SCENE = window.SCENE;
const CAMERA = window.CAMERA;
const Melee = (() => {
  const RANGE = 3.2;
  const ARC = 0.6;
  const DAMAGE = 55;
  const COOLDOWN = 0.65;
  const STAMINA_COST = 18;
  const LUNGE_FORCE = 7;
  const BLADE_LIFE = 0.18;
  const BACKSTAB_MULT = 3.0;
  const BACKSTAB_DOT = 0.3;
  const UNAWARE_MAX_THREAT = 10;

  const state = { cd: 0, active: false, timer: 0, hitSet: null };

  const BLADE_GEO = new THREE.ConeGeometry(0.05, 0.7, 4);
  BLADE_GEO.translate(0, -0.35, 0);
  const BLADE_MAT = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.2, metalness: 0.9 });
  const GUARD_GEO = new THREE.BoxGeometry(0.14, 0.05, 0.14);
  const GUARD_MAT = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 });

  const blade = new THREE.Mesh(BLADE_GEO, BLADE_MAT);
  blade.visible = false;
  SCENE.add(blade);

  const slash = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 1.3, 16, 1, 0, Math.PI * 0.55),
    new THREE.MeshBasicMaterial({ color: 0xeeffdd, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
  );
  slash.visible = false;
  SCENE.add(slash);

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;bottom:30px;left:50%;transform:translateX(-50%);font-size:11px;letter-spacing:2px;color:#9fe8a0;text-shadow:0 1px 3px #000;opacity:0.6;z-index:6;';
  const label = document.createElement('div');
  label.textContent = 'BAYONET [V]';
  hud.appendChild(label);
  const bar = document.createElement('div');
  bar.style.cssText = 'margin-top:3px;width:70px;height:5px;background:rgba(0,0,0,0.5);border:1px solid rgba(150,200,150,0.3);border-radius:3px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#5fd07a,#c9e87a);transition:width 0.05s;';
  bar.appendChild(fill);
  hud.appendChild(bar);
  document.getElementById('hud').appendChild(hud);

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'v' && e.key !== 'V') return;
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    if (!window.Player || !Player.state.locked) return;
    swing();
  });

  function swing() {
    if (state.cd > 0) return;
    const p = window.Player ? Player.state : null;
    if (p && p.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('TOO EXHAUSTED', '#ff6644');
      return;
    }
    if (p) {
      p.stamina -= STAMINA_COST;
      p.regenTimer = 1.5;
    }
    state.cd = COOLDOWN;
    state.active = true;
    state.timer = BLADE_LIFE;
    state.hitSet = new Set();
    if (window.Sound) window.Sound.tone(900, 0.06, 'sawtooth', 0.12, 2500);
    const camDir = new THREE.Vector3();
    CAMERA.getWorldDirection(camDir);
    const right = new THREE.Vector3(camDir.z, 0, -camDir.x);
    blade.position.copy(CAMERA.position).addScaledVector(camDir, 0.75);
    blade.position.y -= 0.35;
    blade.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), camDir);
    blade.visible = true;
    slash.position.copy(CAMERA.position).addScaledVector(camDir, 1.1);
    slash.position.y -= 0.3;
    slash.quaternion.setFromRotationY(Math.atan2(camDir.x, camDir.z));
    slash.visible = true;
  }

  function lunge() {
    const p = window.Player ? window.Player.state : null;
    if (!p || !p.vel) return;
    const camDir = new THREE.Vector3();
    CAMERA.getWorldDirection(camDir);
    camDir.y = 0;
    camDir.normalize();
    p.vel.x += camDir.x * LUNGE_FORCE;
    p.vel.z += camDir.z * LUNGE_FORCE;
  }

  function _isBackstab(ent, camPos) {
    const m = ent.mesh;
    if (!m) return false;
    const dx = m.position.x - camPos.x;
    const dz = m.position.z - camPos.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.01) return false;
    const facing = ent.facing || 0;
    const angleToPlayer = Math.atan2(dx, dz);
    let diff = angleToPlayer - facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return diff < -BACKSTAB_DOT || diff > BACKSTAB_DOT;
  }

  function _isUnaware(ent) {
    if (ent.target && ent.target !== null) return false;
    if (typeof ent.threat === 'number' && ent.threat > UNAWARE_MAX_THREAT) return false;
    if (typeof ent.alerted === 'boolean' && ent.alerted) return false;
    if (typeof ent.aggro === 'boolean' && ent.aggro) return false;
    return true;
  }

  function checkHits() {
    const ents = window.Entities && Array.isArray(window.Entities.list) ? window.Entities.list : [];
    const camPos = CAMERA.position;
    const camDir = new THREE.Vector3();
    CAMERA.getWorldDirection(camDir);
    const playerTeam = (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
    let classBonus = 1.0;
    if (window.Classes && typeof window.Classes.getMeleeBonus === 'function') {
      classBonus = window.Classes.getMeleeBonus() || 1.0;
    }
    let didLunge = false;
    for (let i = 0; i < ents.length; i++) {
      const ent = ents[i];
      if (ent.dead || ent.team === playerTeam || state.hitSet.has(ent)) continue;
      const m = ent.mesh;
      if (!m) continue;
      const dx = m.position.x - camPos.x;
      const dz = m.position.z - camPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > RANGE) continue;
      const dot = (dx * camDir.x + dz * camDir.z) / Math.max(dist, 0.01);
      if (dot < ARC) continue;
      state.hitSet.add(ent);
      let dmg = DAMAGE * classBonus;
      let crit = false;
      let kill = false;
      const backstab = _isBackstab(ent, camPos);
      const unaware = _isUnaware(ent);
      if (backstab && unaware) {
        dmg *= BACKSTAB_MULT;
        crit = true;
        if (window.Sound) {
          window.Sound.tone(1400, 0.15, 'square', 0.2, 1800);
          window.Sound.tone(700, 0.2, 'sine', 0.15, 900);
        }
      }
      if (typeof ent.hp === 'number') {
        const before = ent.hp;
        ent.hp -= dmg;
        ent.lastDamager = 'player';
        ent.lastDamageTime = (window.Manager && window.Manager.state) ? window.Manager.state.time : 0;
        ent.alerted = true;
        ent.aggro = true;
        ent.threat = Math.max(ent.threat || 0, 60);
        ent.target = null;
        if (ent.hp <= 0 && before > 0) {
          kill = true;
          if (window.KillRewards) window.KillRewards.notify(ent.team);
          if (window.Killstreak) window.Killstreak.add();
          if (window.KillPanel) {
            window.KillPanel.reportKill({
              weapon: 'melee',
              killer: 'YOU',
              victim: ent.name || (ent.team === 'deer' ? 'DEER' : 'HUNTER'),
              team: ent.team,
              crit: backstab && unaware,
            });
          }
          if (window.Entities && typeof window.Entities.killEntity === 'function') {
            window.Entities.killEntity(ent);
          } else {
            ent.dead = true;
          }
        }
      }
      if (window.FX && typeof window.FX.bloodBurst === 'function') {
        const hitPos = new THREE.Vector3(m.position.x, m.position.y + 1.0, m.position.z);
        window.FX.bloodBurst(hitPos, new THREE.Vector3(camDir.x, 0.3, camDir.z));
      }
      if (window.CombatText) {
        const hitPos = new THREE.Vector3(m.position.x, m.position.y + 1.2, m.position.z);
        window.CombatText.spawn(hitPos, Math.round(dmg), { crit, kill, color: (backstab && unaware) ? '#ffd24a' : '#ffffff' });
      }
      if (window.Suppression && typeof window.Suppression.applyDirect === 'function') {
        window.Suppression.applyDirect(ent, 25);
      }
      if (!didLunge) {
        lunge();
        didLunge = true;
      }
    }
    if (state.hitSet.size > 0 && window.FX && typeof window.FX.shake === 'function') {
      window.FX.shake(0.08);
    }
  }

  function update(dt) {
    if (state.cd > 0) {
      state.cd -= dt;
      if (state.cd < 0) state.cd = 0;
      fill.style.width = ((1 - state.cd / COOLDOWN) * 100) + '%';
    }
    if (state.active) {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.active = false;
        blade.visible = false;
      } else {
        const t = state.timer / BLADE_LIFE;
        blade.material.opacity = t;
        slash.material.opacity = t * 0.5;
        const camDir = new THREE.Vector3();
        CAMERA.getWorldDirection(camDir);
        blade.position.copy(CAMERA.position).addScaledVector(camDir, 0.75);
        blade.position.y -= 0.35;
        blade.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), camDir);
        slash.position.copy(CAMERA.position).addScaledVector(camDir, 1.1);
        slash.position.y -= 0.3;
        const slashRot = Math.atan2(camDir.x, camDir.z);
        slash.rotation.set(0, slashRot, (1 - t) * 0.8);
      }
      checkHits();
    }
  }

  return { update, swing };
})();
window.Melee = Melee;