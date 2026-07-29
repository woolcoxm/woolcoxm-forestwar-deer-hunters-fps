// chain-lightning.js — FORESTWAR chain lightning ability: arcs between enemies, decaying damage, cooldown bar
const THREE = window.THREE;
const SCENE = window.SCENE;
const ChainLightning = (() => {
  const COOLDOWN_MAX = 9;
  const STAMINA_COST = 35;
  const RANGE = 42;
  const CHAIN_RADIUS = 9;
  const MAX_JUMPS = 5;
  const BASE_DAMAGE = 60;
  const DECAY = 0.78;
  const BOLT_LIFE = 0.28;
  const NODE_LIFE = 0.35;
  const SPARK_COUNT = 8;
  const SPARK_LIFE = 0.4;

  const state = {
    cd: 0,
    ready: true,
    active: false,
  };

  const BOLT_SEGMENTS = 10;
  const BOLT_MAX = 6;
  const bolts = [];
  for (let i = 0; i < BOLT_MAX; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BOLT_SEGMENTS * 3), 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x66ddff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.visible = false;
    SCENE.add(line);
    bolts.push({ line, life: 0, active: false });
  }
  let boltIdx = 0;

  const NODE_GEO = new THREE.SphereGeometry(0.4, 8, 6);
  const NODE_MAT = new THREE.MeshBasicMaterial({
    color: 0xaaeeff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const nodes = [];
  for (let i = 0; i < MAX_JUMPS + 1; i++) {
    const m = new THREE.Mesh(NODE_GEO, NODE_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    nodes.push({ mesh: m, life: 0, active: false });
  }
  let nodeIdx = 0;

  const SPARK_GEO = new THREE.SphereGeometry(0.08, 4, 3);
  const SPARK_MAT = new THREE.MeshBasicMaterial({
    color: 0x88ccff, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sparks = [];
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT.clone());
    m.visible = false;
    m.frustumCulled = false;
    SCENE.add(m);
    sparks.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0, active: false });
  }
  let sparkIdx = 0;

  const FLASH_LIGHT = new THREE.PointLight(0x66ddff, 0, 12, 2);
  SCENE.add(FLASH_LIGHT);

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:16px;bottom:290px;font-size:11px;letter-spacing:2px;color:#66ddff;text-shadow:0 0 6px rgba(100,200,255,0.5),0 1px 3px #000;z-index:6;';
  const label = document.createElement('div');
  label.textContent = 'CHAIN LIGHTNING [J]';
  hud.appendChild(label);
  const barWrap = document.createElement('div');
  barWrap.style.cssText = 'margin-top:3px;width:90px;height:6px;background:rgba(0,0,0,0.55);border:1px solid rgba(100,200,255,0.4);border-radius:3px;overflow:hidden;';
  const barFill = document.createElement('div');
  barFill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#3399ff,#aaeeff);transition:width 0.08s,background 0.2s;border-radius:2px;';
  barWrap.appendChild(barFill);
  hud.appendChild(barWrap);
  document.getElementById('hud').appendChild(hud);

  const _camDir = new THREE.Vector3();
  const _ray = new THREE.Raycaster();
  const _origin = new THREE.Vector3();
  const _hitPoint = new THREE.Vector3();
  const _tmp = new THREE.Vector3();

  function getPlayerTeam() {
    return (window.Manager && window.Manager.state) ? window.Manager.state.playerTeam : 'hunter';
  }

  function getEntities() {
    if (window.Entities && Array.isArray(window.Entities.list)) return window.Entities.list;
    return [];
  }

  function findNearestEnemy(fromX, fromY, fromZ, maxDist, excludeSet) {
    const ents = getEntities();
    const team = getPlayerTeam();
    let best = null;
    let bestDist = maxDist * maxDist;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.team === team) continue;
      if (excludeSet.has(e)) continue;
      const m = e.mesh;
      if (!m) continue;
      const dx = m.position.x - fromX;
      const dy = (m.position.y + 1.0) - fromY;
      const dz = m.position.z - fromZ;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bestDist) {
        bestDist = d2;
        best = e;
      }
    }
    return best;
  }

  function spawnBolt(fromX, fromY, fromZ, toX, toY, toZ) {
    const slot = bolts[boltIdx];
    boltIdx = (boltIdx + 1) % BOLT_MAX;
    const pos = slot.line.geometry.attributes.position;
    for (let i = 0; i < BOLT_SEGMENTS; i++) {
      const t = i / (BOLT_SEGMENTS - 1);
      let x = fromX + (toX - fromX) * t;
      let y = fromY + (toY - fromY) * t;
      let z = fromZ + (toZ - fromZ) * t;
      if (i > 0 && i < BOLT_SEGMENTS - 1) {
        const jitter = (1 - Math.abs(t - 0.5) * 2) * 1.2;
        x += (Math.random() - 0.5) * jitter;
        y += (Math.random() - 0.5) * jitter;
        z += (Math.random() - 0.5) * jitter;
      }
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    slot.line.material.opacity = 0.9;
    slot.line.material.color.setHSL(0.55, 0.8, 0.65 + Math.random() * 0.15);
    slot.line.visible = true;
    slot.life = BOLT_LIFE;
    slot.active = true;
  }

  function spawnNode(x, y, z) {
    const slot = nodes[nodeIdx];
    nodeIdx = (nodeIdx + 1) % nodes.length;
    slot.mesh.position.set(x, y, z);
    const sc = 0.6 + Math.random() * 0.4;
    slot.mesh.scale.setScalar(sc);
    slot.mesh.material.opacity = 0.85;
    slot.mesh.visible = true;
    slot.life = NODE_LIFE;
    slot.active = true;
  }

  function spawnSparks(x, y, z, count) {
    for (let i = 0; i < count; i++) {
      const slot = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % sparks.length;
      const ang = Math.random() * Math.PI * 2;
      const el = Math.random() * Math.PI;
      const spd = 2 + Math.random() * 5;
      slot.vx = Math.sin(el) * Math.cos(ang) * spd;
      slot.vy = Math.cos(el) * spd + 1;
      slot.vz = Math.sin(el) * Math.sin(ang) * spd;
      slot.mesh.position.set(x, y, z);
      slot.mesh.material.opacity = 1;
      slot.life = SPARK_LIFE * (0.6 + Math.random() * 0.5);
      slot.mesh.visible = true;
      slot.active = true;
    }
  }

  function fire() {
    if (state.cd > 0) return;
    const cam = window.CAMERA;
    if (!cam) return;
    const p = window.Player ? window.Player.state : null;
    if (!p || !p.locked) return;
    if (p.stamina < STAMINA_COST) {
      if (window.FX) window.FX.message('TOO EXHAUSTED', '#ff6644');
      return;
    }
    p.stamina -= STAMINA_COST;
    if (p.regenTimer !== undefined) p.regenTimer = 1.5;
    state.cd = COOLDOWN_MAX;
    state.ready = false;

    cam.getWorldDirection(_camDir);
    _origin.copy(cam.position);
    _ray.set(_origin, _camDir);
    _ray.far = RANGE;

    const ents = getEntities();
    const team = getPlayerTeam();
    let firstTarget = null;
    let nearestDist = RANGE * RANGE;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.team === team) continue;
      const m = e.mesh;
      if (!m) continue;
      _tmp.subVectors(m.position, _origin);
      const proj = _tmp.dot(_camDir);
      if (proj < 0 || proj > RANGE) continue;
      _tmp.copy(m.position);
      _tmp.y += 1.0;
      _tmp.sub(_origin);
      _tmp.addScaledVector(_camDir, -proj);
      const perp = _tmp.length();
      if (perp < 2.0 && proj < nearestDist) {
        nearestDist = proj;
        firstTarget = e;
      }
    }

    if (firstTarget) {
      _hitPoint.copy(firstTarget.mesh.position);
      _hitPoint.y += 1.0;
    } else {
      _hitPoint.copy(_origin).addScaledVector(_camDir, RANGE);
    }

    spawnBolt(_origin.x, _origin.y - 0.3, _origin.z, _hitPoint.x, _hitPoint.y, _hitPoint.z);
    spawnNode(_hitPoint.x, _hitPoint.y, _hitPoint.z);
    spawnSparks(_hitPoint.x, _hitPoint.y, _hitPoint.z, SPARK_COUNT);

    FLASH_LIGHT.position.copy(_hitPoint);
    FLASH_LIGHT.color.set(0x66ddff);
    FLASH_LIGHT.intensity = 8;

    const chain = [];
    const hitSet = new Set();
    if (firstTarget) {
      chain.push(firstTarget);
      hitSet.add(firstTarget);
    }

    let prevX = _hitPoint.x;
    let prevY = _hitPoint.y;
    let prevZ = _hitPoint.z;
    let damage = BASE_DAMAGE;

    for (let i = 0; i < chain.length; i++) {
      const target = chain[i];
      if (window.Entities && window.Entities.damage) {
        window.Entities.damage(target, damage, _camDir, true);
      } else if (target && target.hp !== undefined) {
        target.hp -= damage;
      }
      if (window.Suppression && window.Suppression.applyNearMiss) {
        window.Suppression.applyNearMiss(target.mesh.position.x, target.mesh.position.z, team);
      }
      const next = findNearestEnemy(prevX, prevY, prevZ, CHAIN_RADIUS, hitSet);
      if (!next) break;
      const nx = next.mesh.position.x;
      const ny = next.mesh.position.y + 1.0;
      const nz = next.mesh.position.z;
      spawnBolt(prevX, prevY, prevZ, nx, ny, nz);
      spawnNode(nx, ny, nz);
      spawnSparks(nx, ny, nz, SPARK_COUNT >> 1);
      chain.push(next);
      hitSet.add(next);
      prevX = nx;
      prevY = ny;
      prevZ = nz;
      damage *= DECAY;
      if (chain.length >= MAX_JUMPS) break;
    }

    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(180, 0.08, 'sawtooth', 0.3, 6000);
      window.Sound.tone(900, 0.12, 'square', 0.18, 4000);
      window.Sound.tone(1400, 0.06, 'sine', 0.15, 8000);
    }

    if (window.FX && window.FX.message) {
      window.FX.message('CHAIN LIGHTNING — ' + chain.length + ' HIT' + (chain.length > 1 ? 'S' : ''), '#66ddff');
    }
    updateHUD();
  }

  function update(dt) {
    if (state.cd > 0) {
      state.cd -= dt;
      if (state.cd <= 0) {
        state.cd = 0;
        state.ready = true;
        if (window.FX) window.FX.message('CHAIN LIGHTNING READY', '#66ddff');
      }
      updateHUD();
    }

    for (let i = 0; i < bolts.length; i++) {
      const b = bolts[i];
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.line.visible = false;
        b.active = false;
      } else {
        b.line.material.opacity = (b.life / BOLT_LIFE) * 0.9;
      }
    }

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!n.active) continue;
      n.life -= dt;
      if (n.life <= 0) {
        n.mesh.visible = false;
        n.active = false;
      } else {
        const t = n.life / NODE_LIFE;
        n.mesh.material.opacity = t * 0.85;
        n.mesh.scale.setScalar(0.6 + (1 - t) * 1.2);
      }
    }

    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        s.active = false;
        continue;
      }
      s.vy -= 12 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.material.opacity = s.life / SPARK_LIFE;
      s.mesh.scale.setScalar(0.5 + s.life / SPARK_LIFE * 0.5);
    }

    if (FLASH_LIGHT.intensity > 0) {
      FLASH_LIGHT.intensity -= dt * 40;
      if (FLASH_LIGHT.intensity < 0) FLASH_LIGHT.intensity = 0;
    }
  }

  function updateHUD() {
    const pct = state.cd > 0 ? (1 - state.cd / COOLDOWN_MAX) * 100 : 100;
    barFill.style.width = pct + '%';
    if (state.ready) {
      barFill.style.background = 'linear-gradient(90deg,#3399ff,#aaeeff)';
      label.style.color = '#aaeeff';
    } else {
      barFill.style.background = 'linear-gradient(90deg,#223344,#446677)';
      label.style.color = '#446677';
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'j' && e.key !== 'J') return;
    if (window.Manager && window.Manager.state && window.Manager.state.phase !== 'playing') return;
    fire();
  });

  updateHUD();

  return { update, fire, get state() { return state; } };
})();
window.ChainLightning = ChainLightning;