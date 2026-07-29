// objectives.js — FORESTWAR capture-point flags: contested zones that grant team buffs and score
const THREE = window.THREE;
const SCENE = window.SCENE;
const Objectives = (() => {
  const FLAGS = [
    { x: -45, z: -45 },
    { x: 55, z: -30 },
    { x: 5, z: 65 },
  ];
  const CAP_RADIUS = 8;
  const TICK_RATE = 0.6;
  const BUFF_THRESHOLD = 90;
  const BUFF_DURATION = 8;

  const state = {
    points: [],
    buff: { deer: 0, hunter: 0 },
    score: { deer: 0, hunter: 0 },
    heldTimer: 0,
    lastHolder: null,
  };

  const POLE_MAT = new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.7, metalness: 0.5 });
  const FLAG_MAT_DEER = new THREE.MeshStandardMaterial({ color: 0xf0c98a, roughness: 0.8, side: THREE.DoubleSide });
  const FLAG_MAT_HUNTER = new THREE.MeshStandardMaterial({ color: 0xc9d8ff, roughness: 0.8, side: THREE.DoubleSide });
  const FLAG_MAT_NEUTRAL = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9, side: THREE.DoubleSide });
  const RING_GEO = new THREE.RingGeometry(CAP_RADIUS - 0.5, CAP_RADIUS, 48);
  const RING_MAT_NEUTRAL = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
  const RING_MAT_DEER = new THREE.MeshBasicMaterial({ color: 0xf0c98a, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const RING_MAT_HUNTER = new THREE.MeshBasicMaterial({ color: 0xc9d8ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const POLE_GEO = new THREE.CylinderGeometry(0.08, 0.08, 5, 6);
  const FLAG_GEO = new THREE.PlaneGeometry(1.8, 1.1, 1, 1);

  function init() {
    for (const f of FLAGS) {
      const pole = new THREE.Mesh(POLE_GEO, POLE_MAT);
      pole.castShadow = true;
      pole.position.set(f.x, groundHeight(f.x, f.z) + 2.5, f.z);
      SCENE.add(pole);
      const flag = new THREE.Mesh(FLAG_GEO, FLAG_MAT_NEUTRAL);
      flag.position.set(f.x + 0.9, groundHeight(f.x, f.z) + 4.2, f.z);
      SCENE.add(flag);
      const ring = new THREE.Mesh(RING_GEO, RING_MAT_NEUTRAL);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(f.x, groundHeight(f.x, f.z) + 0.05, f.z);
      SCENE.add(ring);
      const light = new THREE.PointLight(0x888888, 0.8, 14, 2);
      light.position.set(f.x, groundHeight(f.x, f.z) + 3.5, f.z);
      SCENE.add(light);
      state.points.push({
        x: f.x, z: f.z, pole, flag, ring, light,
        capture: 0,
        owner: null,
        deerPresent: 0,
        hunterPresent: 0,
        flash: 0,
      });
    }
  }

  function countPresent(pt) {
    let deer = 0, hunter = 0;
    const ents = window.Entities ? window.Entities.list : [];
    for (const e of ents) {
      if (e.dead) continue;
      const dx = e.mesh.position.x - pt.x;
      const dz = e.mesh.position.z - pt.z;
      if (dx * dx + dz * dz < CAP_RADIUS * CAP_RADIUS) {
        if (e.team === 'deer') deer++;
        else hunter++;
      }
    }
    if (window.Manager && window.Manager.state.playerAlive) {
      const px = window.CAMERA.position.x;
      const pz = window.CAMERA.position.z;
      const team = window.Manager.state.playerTeam;
      const dpx = px - pt.x, dpz = pz - pt.z;
      if (dpx * dpx + dpz * dpz < CAP_RADIUS * CAP_RADIUS) {
        if (team === 'deer') deer++;
        else hunter++;
      }
    }
    pt.deerPresent = deer;
    pt.hunterPresent = hunter;
  }

  function update(dt) {
    if (!state.points.length) return;
    let allDeer = true, allHunter = true;
    for (const pt of state.points) {
      countPresent(pt);
      const contested = pt.deerPresent > 0 && pt.hunterPresent > 0;
      if (contested) {
        pt.flash = Math.min(1, pt.flash + dt * 3);
      } else {
        pt.flash = Math.max(0, pt.flash - dt * 1.5);
      }
      if (!contested) {
        if (pt.deerPresent > 0 && pt.hunterPresent === 0) {
          pt.capture = Math.min(100, pt.capture + TICK_RATE * dt * 60 * Math.min(pt.deerPresent, 3));
        } else if (pt.hunterPresent > 0 && pt.deerPresent === 0) {
          pt.capture = Math.max(-100, pt.capture - TICK_RATE * dt * 60 * Math.min(pt.hunterPresent, 3));
        } else if (pt.deerPresent === 0 && pt.hunterPresent === 0) {
          pt.capture *= Math.pow(0.5, dt * 0.4);
        }
      }
      let newOwner = pt.owner;
      if (pt.capture >= 100) newOwner = 'deer';
      else if (pt.capture <= -100) newOwner = 'hunter';
      else if (pt.capture > -30 && pt.capture < 30) newOwner = null;
      if (newOwner !== pt.owner) {
        pt.owner = newOwner;
        pt.flash = 1;
        if (window.Sound) window.Sound.horn();
      }
      if (pt.owner !== 'deer') allDeer = false;
      if (pt.owner !== 'hunter') allHunter = false;
      applyVisuals(pt);
    }
    if (allDeer) {
      state.heldTimer += dt;
      if (state.lastHolder !== 'deer') { state.heldTimer = 0; state.lastHolder = 'deer'; }
      if (state.heldTimer >= 3) { grantBuff('deer'); state.score.deer += 5; state.heldTimer = 0; }
    } else if (allHunter) {
      state.heldTimer += dt;
      if (state.lastHolder !== 'hunter') { state.heldTimer = 0; state.lastHolder = 'hunter'; }
      if (state.heldTimer >= 3) { grantBuff('hunter'); state.score.hunter += 5; state.heldTimer = 0; }
    } else {
      state.heldTimer = 0;
      state.lastHolder = null;
    }
    if (state.buff.deer > 0) state.buff.deer = Math.max(0, state.buff.deer - dt);
    if (state.buff.hunter > 0) state.buff.hunter = Math.max(0, state.buff.hunter - dt);
  }

  function applyVisuals(pt) {
    const t = performance.now() * 0.003;
    pt.flag.rotation.y = Math.sin(t + pt.x) * 0.15;
    pt.flag.position.x = pt.x + 0.9 + Math.sin(t * 1.5 + pt.x) * 0.05;
    let mat;
    if (pt.owner === 'deer') mat = FLAG_MAT_DEER;
    else if (pt.owner === 'hunter') mat = FLAG_MAT_HUNTER;
    else mat = FLAG_MAT_NEUTRAL;
    if (pt.flag.material !== mat) pt.flag.material = mat;
    let ringMat;
    if (pt.owner === 'deer') ringMat = RING_MAT_DEER;
    else if (pt.owner === 'hunter') ringMat = RING_MAT_HUNTER;
    else ringMat = RING_MAT_NEUTRAL;
    if (pt.ring.material !== ringMat) pt.ring.material = ringMat;
    const intensity = 0.5 + Math.sin(t * 2) * 0.2 + pt.flash * 1.5;
    pt.light.intensity = Math.max(0.3, intensity);
    if (pt.owner === 'deer') pt.light.color.setHex(0xf0c98a);
    else if (pt.owner === 'hunter') pt.light.color.setHex(0xc9d8ff);
    else pt.light.color.setHex(0x888888);
    pt.ring.material.opacity = 0.3 + pt.flash * 0.4;
  }

  function grantBuff(team) {
    state.buff[team] = BUFF_DURATION;
    if (window.Sound) window.Sound.horn();
  }

  function hasBuff(team) {
    return state.buff[team] > 0;
  }

  function reset() {
    for (const pt of state.points) {
      pt.capture = 0;
      pt.owner = null;
      pt.flash = 0;
    }
    state.buff.deer = 0;
    state.buff.hunter = 0;
    state.score.deer = 0;
    state.score.hunter = 0;
    state.heldTimer = 0;
    state.lastHolder = null;
  }

  function nearestFlag(x, z) {
    let best = null, bestD = Infinity;
    for (const pt of state.points) {
      const d = (pt.x - x) * (pt.x - x) + (pt.z - z) * (pt.z - z);
      if (d < bestD) { bestD = d; best = pt; }
    }
    return best;
  }

  function getCaptureInfo() {
    return state.points.map(pt => ({
      x: pt.x, z: pt.z,
      capture: pt.capture,
      owner: pt.owner,
      contested: pt.deerPresent > 0 && pt.hunterPresent > 0,
    }));
  }

  return { init, update, reset, hasBuff, nearestFlag, getCaptureInfo, state };
})();
window.Objectives = Objectives;