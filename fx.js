// fx.js — FORESTWAR combat feedback: muzzle flash, blood, hit marker, audio, shake, bleed DoT
const FX = (() => {
  const THREE = window.THREE;
  const SCENE = window.SCENE;
  const CAMERA = window.CAMERA;

  const flashPool = [];
  const burstPool = [];
  const active = [];

  const FLASH_GEO = new THREE.SphereGeometry(0.35, 6, 5);
  const FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true, opacity: 0 });
  const BLOOD_GEO = new THREE.SphereGeometry(0.09, 4, 3);
  const BLEED_TICK_COLOR = 0xaa1212;

  function getFlash() {
    for (const f of flashPool) if (!f.userData.alive) return f;
    const m = new THREE.Mesh(FLASH_GEO, FLASH_MAT.clone());
    SCENE.add(m);
    flashPool.push(m);
    return m;
  }

  function muzzleFlash(origin, dir) {
    const m = getFlash();
    m.material.opacity = 1;
    m.scale.setScalar(0.6 + Math.random() * 0.5);
    m.position.copy(origin).addScaledVector(dir, 0.6);
    m.userData.alive = true;
    m.userData.life = 0.07;
    m.userData.kind = 'flash';
    active.push(m);
    const light = new THREE.PointLight(0xffcc55, 6, 8, 2);
    light.position.copy(m.position);
    light.userData.alive = true;
    light.userData.life = 0.06;
    light.userData.kind = 'light';
    light.userData.maxLife = 0.06;
    SCENE.add(light);
    active.push(light);
    shake(0.05);
    sfxShot();
  }

  function bloodBurst(pos, normal) {
    const n = 8 + (Math.random() * 5 | 0);
    for (let i = 0; i < n; i++) {
      let p;
      for (const c of burstPool) if (!c.userData.alive) { p = c; break; }
      if (!p) {
        p = new THREE.Mesh(BLOOD_GEO, new THREE.MeshBasicMaterial({ color: 0x9a1a1a, transparent: true }));
        SCENE.add(p);
        burstPool.push(p);
      }
      p.material.opacity = 1;
      p.material.color.setHSL(0.0, 0.8, 0.3 + Math.random() * 0.15);
      p.position.copy(pos);
      p.scale.setScalar(0.6 + Math.random() * 0.8);
      const vx = normal.x + (Math.random() - 0.5) * 3;
      const vy = Math.abs(normal.y) + 1.5 + Math.random() * 2.5;
      const vz = normal.z + (Math.random() - 0.5) * 3;
      p.userData.alive = true;
      p.userData.life = 0.5 + Math.random() * 0.3;
      p.userData.maxLife = p.userData.life;
      p.userData.kind = 'blood';
      p.userData.vel = new THREE.Vector3(vx, vy, vz);
      active.push(p);
    }
    sfxImpact();
    hitMarker();
  }

  function burst(pos, normal, color, count) {
    const n = Math.max(1, count || 10);
    const hex = (color !== undefined && color !== null) ? color : 0x9a1a1a;
    for (let i = 0; i < n; i++) {
      let p;
      for (const c of burstPool) if (!c.userData.alive) { p = c; break; }
      if (!p) {
        p = new THREE.Mesh(BLOOD_GEO, new THREE.MeshBasicMaterial({ color: hex, transparent: true }));
        SCENE.add(p);
        burstPool.push(p);
      }
      p.material.opacity = 1;
      p.material.color.setHex(hex);
      p.position.copy(pos);
      p.scale.setScalar(0.6 + Math.random() * 0.8);
      const vx = normal.x + (Math.random() - 0.5) * 3;
      const vy = Math.abs(normal.y) + 1.5 + Math.random() * 2.5;
      const vz = normal.z + (Math.random() - 0.5) * 3;
      p.userData.alive = true;
      p.userData.life = 0.5 + Math.random() * 0.3;
      p.userData.maxLife = p.userData.life;
      p.userData.kind = 'blood';
      p.userData.vel = new THREE.Vector3(vx, vy, vz);
      active.push(p);
    }
  }

  let markerTimer = 0;
  const marker = document.createElement('div');
  marker.style.cssText = 'position:absolute;top:50%;left:50%;width:30px;height:30px;transform:translate(-50%,-50%);pointer-events:none;opacity:0;z-index:6;';
  marker.innerHTML = '<svg width="30" height="30" viewBox="0 0 30 30"><line x1="6" y1="6" x2="13" y2="13" stroke="#ff4444" stroke-width="2.5"/><line x1="24" y1="6" x2="17" y2="13" stroke="#ff4444" stroke-width="2.5"/><line x1="6" y1="24" x2="13" y2="17" stroke="#ff4444" stroke-width="2.5"/><line x1="24" y1="24" x2="17" y2="17" stroke="#ff4444" stroke-width="2.5"/></svg>';
  document.getElementById('hud').appendChild(marker);

  function hitMarker() {
    markerTimer = 0.18;
    marker.style.opacity = '1';
  }

  let msgTimer = 0;
  const msgEl = document.createElement('div');
  msgEl.style.cssText = 'position:absolute;top:18%;left:50%;transform:translate(-50%,-50%);font-size:16px;font-weight:bold;color:#9fe8a0;letter-spacing:3px;text-shadow:0 2px 6px #000;opacity:0;transition:opacity 0.3s;z-index:8;pointer-events:none;text-align:center;';
  document.getElementById('hud').appendChild(msgEl);

  function message(text, color) {
    msgEl.textContent = text;
    msgEl.style.color = color || '#9fe8a0';
    msgEl.style.opacity = '1';
    msgTimer = 2.0;
  }

  let shakeAmt = 0;
  const shakeOffset = new THREE.Vector3();
  function shake(amt) { shakeAmt = Math.max(shakeAmt, amt); }

  let sfxShot = () => { if (window.Sound) window.Sound.shot(); };
  let sfxImpact = () => { if (window.Sound) window.Sound.impact(); };

  const bleedDrips = [];
  const DRIP_GEO = new THREE.SphereGeometry(0.07, 4, 3);
  function spawnBleedDrip(pos) {
    let d = null;
    for (const b of bleedDrips) if (!b.userData.alive) { d = b; break; }
    if (!d) {
      d = new THREE.Mesh(DRIP_GEO, new THREE.MeshBasicMaterial({ color: BLEED_TICK_COLOR, transparent: true }));
      SCENE.add(d);
      bleedDrips.push(d);
    }
    d.material.opacity = 0.9;
    d.material.color.setHex(BLEED_TICK_COLOR);
    d.position.copy(pos);
    d.scale.setScalar(0.5 + Math.random() * 0.5);
    d.userData.alive = true;
    d.userData.life = 0.4;
    d.userData.maxLife = 0.4;
    d.userData.kind = 'drip';
    d.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.5 + Math.random(), (Math.random() - 0.5) * 1.5);
    active.push(d);
  }

  const bleeds = [];
  function applyBleed(entity, stacks, perTick, duration) {
    if (!entity || entity.dead) return;
    let entry = null;
    for (const b of bleeds) if (b.entity === entity) { entry = b; break; }
    if (!entry) {
      entry = { entity, stacks: 0, perTick, timer: 0, total: 0, tickCd: 0 };
      bleeds.push(entry);
    }
    entry.stacks = Math.min(entry.stacks + stacks, 8);
    entry.perTick = perTick;
    entry.timer = Math.max(entry.timer, duration);
    entry.tickCd = 0;
  }

  function updateBleeds(dt) {
    const mgr = window.Manager;
    for (let i = bleeds.length - 1; i >= 0; i--) {
      const b = bleeds[i];
      const e = b.entity;
      if (!e || e.dead || !e.mesh || !e.mesh.parent) {
        bleeds.splice(i, 1);
        continue;
      }
      b.timer -= dt;
      b.tickCd -= dt;
      if (b.tickCd <= 0) {
        b.tickCd = 0.5;
        const dmg = b.perTick * b.stacks;
        e.hp -= dmg;
        b.total += dmg;
        const pos = e.mesh.position.clone();
        pos.y += 0.8 + Math.random() * 0.6;
        spawnBleedDrip(pos);
        if (e.hp <= 0 && !e.dead) {
          if (window.Entities && window.Entities.kill) {
            const src = (mgr && mgr.state) ? mgr.state.playerTeam : 'hunter';
            window.Entities.kill(e, src);
          } else {
            e.dead = true;
          }
        }
      }
      if (b.timer <= 0) bleeds.splice(i, 1);
    }
  }

  function update(dt) {
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      p.userData.life -= dt;
      if (p.userData.life <= 0) {
        if (p.userData.kind === 'light' || p.userData.kind === 'tracer') {
          SCENE.remove(p);
          if (p.geometry) p.geometry.dispose();
        } else p.visible = false;
        p.userData.alive = false;
        active.splice(i, 1);
        continue;
      }
      p.visible = true;
      const t = p.userData.life / p.userData.maxLife;
      if (p.material) {
        if (p.userData.kind === 'flash') p.material.opacity = t;
        else if (p.userData.kind === 'blood' || p.userData.kind === 'drip') p.material.opacity = t * 0.95;
        else if (p.userData.kind === 'light') p.intensity = t * 6;
        else if (p.userData.kind === 'tracer') p.material.opacity = t * 0.85;
      }
      if (p.userData.vel) {
        p.userData.vel.y -= 14 * dt;
        p.position.addScaledVector(p.userData.vel, dt);
        if (p.position.y < 0.05) {
          p.position.y = 0.05;
          p.userData.vel.set(0, 0, 0);
        }
      }
    }
    if (markerTimer > 0) {
      markerTimer -= dt;
      if (markerTimer <= 0) marker.style.opacity = '0';
    }
    if (msgTimer > 0) {
      msgTimer -= dt;
      if (msgTimer <= 0) msgEl.style.opacity = '0';
    }
    if (shakeAmt > 0) {
      shakeAmt *= Math.pow(0.001, dt);
      shakeOffset.set((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt, 0);
      CAMERA.position.add(shakeOffset);
      if (shakeAmt < 0.002) shakeAmt = 0;
    }
    updateBleeds(dt);
  }

  function reset() {
    for (const b of bleeds) b.timer = 0;
    bleeds.length = 0;
    for (const d of bleedDrips) { d.userData.alive = false; d.visible = false; }
  }

  function tracer(from, to) {
    if (!from || !to) return;
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffeeaa, transparent: true, opacity: 0.85 });
    const line = new THREE.Line(geo, mat);
    SCENE.add(line);
    line.userData.life = 0.06;
    line.userData.maxLife = 0.06;
    line.userData.kind = 'tracer';
    active.push(line);
  }

  function damageFlash(frac) {
    const f = Math.max(0.08, Math.min(1, frac == null ? 0.4 : frac));
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;background:radial-gradient(circle,transparent 45%,rgba(200,0,0,' + (0.22 + f * 0.45).toFixed(2) + ') 100%);pointer-events:none;z-index:7;opacity:1;transition:opacity 0.45s;';
    const hud = document.getElementById('hud');
    (hud || document.body).appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '0'; });
    setTimeout(() => { if (el.parentNode) el.remove(); }, 550);
  }

  function dustPuff(pos) {
    if (!pos) return;
    burst(pos.clone(), new THREE.Vector3(0, 1, 0), 0x8a7a55, 6);
  }

  function explosion(pos, radius) {
    const r = Math.max(2, radius || 6);
    // Ground-level detonations scorch the forest floor with a lasting crater decal.
    if (window.Craters && window.Craters.create && window.groundHeight) {
      const gy = window.groundHeight(pos.x, pos.z);
      if (pos.y - gy < 4) window.Craters.create(pos.x, pos.z, r);
    }
    const fire = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff8833, transparent: true, opacity: 1 }));
    fire.position.copy(pos);
    fire.userData.life = 0.34; fire.userData.maxLife = 0.34; fire.userData.kind = 'tracer';
    SCENE.add(fire); active.push(fire);
    const light = new THREE.PointLight(0xff7733, 14, r * 4.5, 2);
    light.position.copy(pos);
    light.userData.life = 0.3; light.userData.maxLife = 0.3; light.userData.kind = 'light';
    SCENE.add(light); active.push(light);
    burst(pos, new THREE.Vector3(0, 1, 0), 0x666666, 8);
    burst(pos, new THREE.Vector3(0, 1, 0), 0xffaa44, 6);
    // Ground-level blasts can touch off a spreading wildfire through the pines.
    if (window.Fire && window.Fire.onExplosion) window.Fire.onExplosion(pos.x, pos.z, r);
  }

  return { muzzleFlash, bloodBurst, burst, tracer, damageFlash, dustPuff, explosion, update, shake, message, applyBleed, reset };
})();
window.FX = FX;