// classes.js — FORESTWAR class system: assault, medic, engineer with unique stats and passive bonuses
const Classes = (() => {
  const CLASSES = {
    assault: {
      name: 'ASSAULT',
      maxHp: 120,
      speedMult: 1.0,
      staminaMult: 1.2,
      sprintMult: 1.15,
      recoilMult: 0.85,
      reloadMult: 0.85,
      meleeBonus: 1.5,
      startingWeapon: 0,
      passive: 'STABILITY — reduced recoil and faster reloads',
      color: '#c9d8ff',
      icon: '⚔',
    },
    medic: {
      name: 'MEDIC',
      maxHp: 90,
      speedMult: 1.05,
      staminaMult: 1.3,
      sprintMult: 1.1,
      recoilMult: 1.0,
      reloadMult: 1.0,
      meleeBonus: 1.0,
      regenRate: 6,
      regenDelay: 3.5,
      auraHeal: 4,
      auraRadius: 8,
      startingWeapon: 0,
      passive: 'TRIAGE — faster self-regen and heals nearby allies',
      color: '#9fe8a0',
      icon: '✚',
    },
    engineer: {
      name: 'ENGINEER',
      maxHp: 110,
      speedMult: 0.95,
      staminaMult: 1.0,
      sprintMult: 0.9,
      recoilMult: 0.95,
      reloadMult: 0.9,
      meleeBonus: 1.0,
      turretBonus: 0.35,
      deployDiscount: 0.3,
      startingWeapon: 1,
      passive: 'FABRICATION — stronger turrets, cheaper deployables, bonus rockets',
      color: '#ffcc66',
      icon: '⚙',
    },
  };

  const state = {
    selected: 'assault',
    applied: null,
    auraPulse: 0,
  };

  const AURA_GEO = new THREE.RingGeometry(0.5, 8, 40);
  const AURA_MAT = new THREE.MeshBasicMaterial({
    color: 0x66ff88, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const auraRings = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(AURA_GEO, AURA_MAT.clone());
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    auraRings.push({ mesh: m, t: 0, active: false });
  }
  let auraIdx = 0;

  function buildClassSelector() {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;
    let panel = document.getElementById('classpanel');
    if (panel) panel.remove();
    panel = document.createElement('div');
    panel.id = 'classpanel';
    panel.style.cssText = 'display:flex;gap:14px;margin-top:24px;';
    overlay.appendChild(panel);

    for (const key of ['assault', 'medic', 'engineer']) {
      const cls = CLASSES[key];
      const card = document.createElement('div');
      card.className = 'class-card';
      card.dataset.cls = key;
      card.style.cssText = 'width:200px;padding:18px 16px;border:2px solid rgba(150,200,150,0.35);border-radius:8px;background:rgba(20,35,20,0.7);cursor:pointer;transition:all 0.2s;text-align:center;';
      if (key === state.selected) {
        card.style.borderColor = cls.color;
        card.style.boxShadow = '0 0 20px ' + cls.color + '44';
      }
      const icon = document.createElement('div');
      icon.style.cssText = 'font-size:42px;color:' + cls.color + ';margin-bottom:8px;line-height:1;';
      icon.textContent = cls.icon;
      card.appendChild(icon);
      const name = document.createElement('div');
      name.style.cssText = 'font-size:16px;font-weight:bold;letter-spacing:3px;color:' + cls.color + ';margin-bottom:10px;';
      name.textContent = cls.name;
      card.appendChild(name);
      const stats = document.createElement('div');
      stats.style.cssText = 'font-size:11px;color:#a0b8a0;line-height:1.7;margin-bottom:10px;';
      stats.innerHTML = 'HP: ' + cls.maxHp + '<br>'
        + 'SPEED: ' + Math.round(cls.speedMult * 100) + '%<br>'
        + 'STAMINA: ' + Math.round(cls.staminaMult * 100) + '%';
      card.appendChild(stats);
      const passive = document.createElement('div');
      passive.style.cssText = 'font-size:10px;color:#8aa88a;line-height:1.5;border-top:1px solid rgba(150,200,150,0.2);padding-top:8px;';
      passive.textContent = cls.passive;
      card.appendChild(passive);
      panel.appendChild(card);
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        state.selected = key;
        for (const c of panel.querySelectorAll('.class-card')) {
          const cl = CLASSES[c.dataset.cls];
          c.style.borderColor = 'rgba(150,200,150,0.35)';
          c.style.boxShadow = 'none';
        }
        card.style.borderColor = cls.color;
        card.style.boxShadow = '0 0 20px ' + cls.color + '44';
        if (window.Sound && window.Sound.tone) window.Sound.tone(330 + Object.keys(CLASSES).indexOf(key) * 100, 0.12, 'square', 0.15);
      });
    }
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;color:#7a9a7a;letter-spacing:2px;margin-top:14px;';
    hint.textContent = 'CLICK A CLASS TO SELECT — THEN CHOOSE YOUR TEAM';
    panel.appendChild(hint);
  }

  function getSelected() { return CLASSES[state.selected]; }
  function isSelected(key) { return state.selected === key; }

  function applyToPlayer() {
    const cls = CLASSES[state.selected];
    const mgr = window.Manager;
    if (!mgr || !mgr.state) return;
    mgr.state.playerMaxHp = cls.maxHp;
    mgr.state.playerHp = cls.maxHp;
    state.applied = state.selected;
    if (window.Player && window.Player.state) {
      Player.state.sprintMax = (Player.STAMINA_MAX || 100) * cls.staminaMult;
      Player.state.stamina = Player.state.sprintMax;
    }
    if (window.Weapons && cls.startingWeapon !== undefined) {
      window.Weapons.switchSlot(cls.startingWeapon);
    }
    if (cls.startingWeapon === 1 && window.Weapons && window.Weapons.state && window.Weapons.state.slots[1]) {
      window.Weapons.state.slots[1].ammo = 6;
      window.Weapons.state.slots[1].totalAmmo = 16;
    }
    if (window.FX && window.FX.message) {
      window.FX.message('CLASS: ' + cls.name, cls.color);
    }
  }

  function getSpeedMult() {
    const c = state.applied ? CLASSES[state.applied] : null;
    return c ? c.speedMult : 1.0;
  }
  function getSprintMult() {
    const c = state.applied ? CLASSES[state.applied] : null;
    return c ? c.sprintMult : 1.0;
  }
  function getStaminaMult() {
    const c = state.applied ? CLASSES[state.applied] : null;
    return c ? c.staminaMult : 1.0;
  }
  function getRecoilMult() {
    const c = state.applied ? CLASSES[state.applied] : null;
    return c ? c.recoilMult : 1.0;
  }
  function getReloadMult() {
    const c = state.applied ? CLASSES[state.applied] : null;
    return c ? c.reloadMult : 1.0;
  }
  function getMeleeBonus() {
    const c = state.applied ? CLASSES[state.applied] : null;
    return c ? c.meleeBonus : 1.0;
  }
  function getRegenBonus() {
    const c = state.applied ? CLASSES[state.applied] : null;
    if (!c) return { rate: 0, delay: 0 };
    return { rate: c.regenRate || 0, delay: c.regenDelay || 0 };
  }
  function getTurretBonus() {
    const c = state.applied ? CLASSES[state.applied] : null;
    return c ? c.turretBonus || 0 : 0;
  }
  function getDeployDiscount() {
    const c = state.applied ? CLASSES[state.applied] : null;
    return c ? c.deployDiscount || 0 : 0;
  }

  function pulseAura(x, z, gy) {
    const slot = auraRings[auraIdx];
    auraIdx = (auraIdx + 1) % auraRings.length;
    slot.mesh.position.set(x, gy + 0.05, z);
    slot.mesh.scale.setScalar(0.15);
    slot.mesh.visible = true;
    slot.t = 0;
    slot.active = true;
  }

  function update(dt) {
    const cls = state.applied ? CLASSES[state.applied] : null;
    state.auraPulse += dt;
    if (cls && cls.auraHeal && cls.auraRadius && state.auraPulse >= 1.0) {
      state.auraPulse = 0;
      const cam = window.CAMERA;
      if (!cam) return;
      if (!window.Entities || !Array.isArray(window.Entities.list)) return;
      const px = cam.position.x, pz = cam.position.z;
      const r2 = cls.auraRadius * cls.auraRadius;
      const playerTeam = (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
      let healed = false;
      for (const e of window.Entities.list) {
        if (e.dead || e.team !== playerTeam) continue;
        const dx = e.mesh.position.x - px, dz = e.mesh.position.z - pz;
        if (dx * dx + dz * dz < r2) {
          if (e.hp < e.maxHp) {
            e.hp = Math.min(e.maxHp, e.hp + cls.auraHeal);
            healed = true;
          }
        }
      }
      if (healed) {
        const gy = window.groundHeight ? window.groundHeight(px, pz) : 0;
        pulseAura(px, pz, gy);
      }
    }
    for (const ring of auraRings) {
      if (!ring.active) continue;
      ring.t += dt;
      const progress = ring.t / 1.0;
      if (progress >= 1) {
        ring.active = false;
        ring.mesh.visible = false;
        continue;
      }
      ring.mesh.scale.setScalar(0.15 + progress * 1.0);
      ring.mesh.material.opacity = (1 - progress) * 0.35;
    }
  }

  function init() {
    buildClassSelector();
    window.addEventListener('keydown', (e) => {
      if (e.key === 'c' || e.key === 'C') {
        if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
        if (!window.Player || !Player.state.locked) return;
        const keys = ['assault', 'medic', 'engineer'];
        const idx = keys.indexOf(state.selected);
        state.selected = keys[(idx + 1) % keys.length];
        const cls = CLASSES[state.selected];
        if (window.FX && window.FX.message) window.FX.message('NEXT CLASS: ' + cls.name, cls.color);
      }
    });
  }

  return { init, update, applyToPlayer, getSelected, isSelected,
    getSpeedMult, getSprintMult, getStaminaMult, getRecoilMult, getReloadMult,
    getMeleeBonus, getRegenBonus, getTurretBonus, getDeployDiscount,
    buildClassSelector, CLASSES };
})();
window.Classes = Classes;