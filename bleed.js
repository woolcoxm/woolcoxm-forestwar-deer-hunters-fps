// bleed.js — FORESTWAR damage-over-time system: enemies bleed out after taking bullet hits
const THREE = window.THREE;
const SCENE = window.SCENE;
const Bleed = (() => {
  const TICK_INTERVAL = 0.5;
  const TICK_FRACTION = 0.08;
  const MIN_DAMAGE = 3;
  const MAX_DAMAGE = 12;
  const MAX_DURATION = 4.0;
  const STACK_MAX = 3;
  const DRIP_POOL = 48;
  const DRIP_GRAVITY = 16;
  const DRIP_LIFE = 0.7;
  const DRIP_SPAWN_RATE = 0.12;
  const AURA_OPACITY = 0.22;

  const active = [];

  const DRIP_GEO = new THREE.SphereGeometry(0.07, 5, 4);
  const DRIP_MAT = new THREE.MeshBasicMaterial({
    color: 0x9a1a1a, transparent: true, opacity: 0.85, depthWrite: false,
  });

  const AURA_GEO = new THREE.SphereGeometry(0.6, 8, 6);
  const AURA_MAT = new THREE.MeshBasicMaterial({
    color: 0xaa1818, transparent: true, opacity: 0,
    side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  const drips = [];
  for (let i = 0; i < DRIP_POOL; i++) {
    const m = new THREE.Mesh(DRIP_GEO, DRIP_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    drips.push({ mesh: m, vy: 0, life: 0, active: false });
  }
  let dripIdx = 0;

  const auras = [];
  const AURA_POOL = 50;
  for (let i = 0; i < AURA_POOL; i++) {
    const m = new THREE.Mesh(AURA_GEO, AURA_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    auras.push({ mesh: m, target: null, active: false });
  }
  let auraIdx = 0;

  const _pos = new THREE.Vector3();

  function spawnDripBurst(pos) {
    const slot = drips[dripIdx];
    dripIdx = (dripIdx + 1) % DRIP_POOL;
    slot.mesh.position.copy(pos);
    slot.mesh.position.x += (Math.random() - 0.5) * 0.4;
    slot.mesh.position.z += (Math.random() - 0.5) * 0.4;
    slot.mesh.scale.setScalar(0.5 + Math.random() * 0.5);
    slot.vy = -2 - Math.random() * 2;
    slot.life = DRIP_LIFE;
    slot.mesh.material.opacity = 0.85;
    slot.mesh.visible = true;
    slot.active = true;
  }

  function getAura(target) {
    for (let i = 0; i < auras.length; i++) {
      if (auras[i].target === target) return auras[i];
    }
    const slot = auras[auraIdx];
    auraIdx = (auraIdx + 1) % AURA_POOL;
    slot.target = target;
    slot.mesh.visible = true;
    slot.active = true;
    return slot;
  }

  function releaseAura(target) {
    for (let i = 0; i < auras.length; i++) {
      if (auras[i].target === target) {
        auras[i].target = null;
        auras[i].active = false;
        auras[i].mesh.visible = false;
      }
    }
  }

  function apply(target, damage, source) {
    if (!target || target.dead || target.hp <= 0) return;
    const tickDmg = Math.max(MIN_DAMAGE, Math.min(MAX_DAMAGE, Math.round(damage * TICK_FRACTION)));
    const duration = Math.min(MAX_DURATION, tickDmg * 0.4);

    let entry = null;
    for (let i = 0; i < active.length; i++) {
      if (active[i].target === target) { entry = active[i]; break; }
    }

    if (!entry) {
      entry = {
        target,
        stacks: [],
        totalDamage: 0,
        tickTimer: 0,
        duration: 0,
        maxDuration: 0,
        dripTimer: 0,
        source,
        killCredit: source,
      };
      active.push(entry);
    } else {
      entry.source = source;
    }

    if (entry.stacks.length >= STACK_MAX) entry.stacks.shift();
    entry.stacks.push({ damage: tickDmg });
    entry.maxDuration = duration;
    entry.duration = duration;

    getAura(target);
  }

  function removeForTarget(target) {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].target === target) {
        active.splice(i, 1);
        releaseAura(target);
      }
    }
  }

  function dealDamage(entry) {
    let totalTick = 0;
    for (let i = 0; i < entry.stacks.length; i++) {
      totalTick += entry.stacks[i].damage;
    }
    if (totalTick <= 0) return;

    const target = entry.target;
    if (target.dead || target.hp <= 0) return;

    target.hp -= totalTick;
    entry.totalDamage += totalTick;

    if (target.mesh) {
      _pos.copy(target.mesh.position);
      _pos.y += 0.8;
      spawnDripBurst(_pos);
    }

    if (target.hp <= 0 && !target.dead) {
      target.hp = 0;
      target.dead = true;
      target.deathTime = performance.now() / 1000;
      target.killedBy = entry.killCredit;

      if (window.Entities && typeof window.Entities.onKilled === 'function') {
        window.Entities.onKilled(target, entry.killCredit, 'bleed');
      }

      if (window.KillRewards && entry.killCredit && entry.killCredit.isPlayer) {
        window.KillRewards.notify(target.team);
      }
      if (window.KillPanel && entry.killCredit && entry.killCredit.isPlayer) {
        window.KillPanel.reportKill(target, entry.killCredit, 'bleed');
      }
    }
  }

  function update(dt) {
    for (let i = active.length - 1; i >= 0; i--) {
      const entry = active[i];
      const target = entry.target;

      if (!target || target.dead) {
        releaseAura(target);
        active.splice(i, 1);
        continue;
      }

      entry.duration -= dt;
      if (entry.duration <= 0) {
        releaseAura(target);
        active.splice(i, 1);
        continue;
      }

      entry.tickTimer -= dt;
      if (entry.tickTimer <= 0) {
        entry.tickTimer = TICK_INTERVAL;
        dealDamage(entry);
      }

      entry.dripTimer -= dt;
      if (entry.dripTimer <= 0 && target.mesh) {
        const intensity = Math.min(1, entry.stacks.length / STACK_MAX);
        entry.dripTimer = DRIP_SPAWN_RATE / (0.5 + intensity);
        _pos.copy(target.mesh.position);
        _pos.y += 0.5;
        spawnDripBurst(_pos);
      }

      const intensity = Math.min(1, entry.stacks.length / STACK_MAX);
      const fade = entry.duration / entry.maxDuration;
      for (let j = 0; j < auras.length; j++) {
        if (auras[j].target === target && target.mesh) {
          auras[j].mesh.position.copy(target.mesh.position);
          auras[j].mesh.position.y += 1.0;
          auras[j].mesh.scale.setScalar(0.8 + intensity * 0.5);
          auras[j].mesh.material.opacity = AURA_OPACITY * intensity * fade;
        }
      }
    }

    for (let i = 0; i < drips.length; i++) {
      const d = drips[i];
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.active = false;
        d.mesh.visible = false;
        continue;
      }
      d.vy -= DRIP_GRAVITY * dt;
      d.mesh.position.y += d.vy * dt;
      const lifeFrac = d.life / DRIP_LIFE;
      d.mesh.material.opacity = 0.85 * lifeFrac;
    }
  }

  function reset() {
    for (let i = active.length - 1; i >= 0; i--) {
      releaseAura(active[i].target);
    }
    active.length = 0;
    for (let i = 0; i < drips.length; i++) {
      drips[i].active = false;
      drips[i].mesh.visible = false;
    }
    for (let i = 0; i < auras.length; i++) {
      auras[i].target = null;
      auras[i].active = false;
      auras[i].mesh.visible = false;
    }
  }

  function dispose() {
    DRIP_GEO.dispose();
    DRIP_MAT.dispose();
    AURA_GEO.dispose();
    AURA_MAT.dispose();
    for (let i = 0; i < drips.length; i++) drips[i].mesh.material.dispose();
    for (let i = 0; i < auras.length; i++) auras[i].mesh.material.dispose();
    active.length = 0;
    drips.length = 0;
    auras.length = 0;
  }

  return { apply, update, reset, removeForTarget, dispose, state: { active } };
})();

window.Bleed = Bleed;