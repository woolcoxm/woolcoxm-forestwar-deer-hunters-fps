// sighting-laser.js — FORESTWAR sighting laser: thin beam from the rifle muzzle to the first object the player aims at
const THREE = window.THREE;
const SCENE = window.SCENE;
const SightingLaser = (() => {
  const LASER_MAX = 220;
  const LASER_WIDTH = 0.018;
  const UPDATE_INTERVAL = 0.02;
  const FADE_TIME = 0.18;
  const DOT_SCALE = 0.12;
  const DOT_MAX_DIST = 140;
  const MUZZLE_FORWARD = 0.7;
  const MUZZLE_DOWN = 0.12;

  const state = {
    visible: false,
    opacity: 0,
    scanT: 0,
  };

  const SEGMENTS = 6;
  const positions = new Float32Array((SEGMENTS + 1) * 3);
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const beamMat = new THREE.LineBasicMaterial({
    color: 0xff2211,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const beam = new THREE.Line(beamGeo, beamMat);
  beam.frustumCulled = false;
  beam.visible = false;
  SCENE.add(beam);

  const DOT_GEO = new THREE.CircleGeometry(1, 14);
  const DOT_MAT = new THREE.MeshBasicMaterial({
    color: 0xff3322,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const dot = new THREE.Mesh(DOT_GEO, DOT_MAT);
  dot.visible = false;
  dot.frustumCulled = false;
  SCENE.add(dot);

  const GLOW_GEO = new THREE.CircleGeometry(1, 12);
  const GLOW_MAT = new THREE.MeshBasicMaterial({
    color: 0xff4422,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const glow = new THREE.Mesh(GLOW_GEO, GLOW_MAT);
  glow.visible = false;
  glow.frustumCulled = false;
  SCENE.add(glow);

  const _origin = new THREE.Vector3();
  const _camDir = new THREE.Vector3();
  const _camRight = new THREE.Vector3();
  const _camUp = new THREE.Vector3();
  const _target = new THREE.Vector3();
  const _rayDir = new THREE.Vector3();
  const _hitPoint = new THREE.Vector3();
  const _hitNormal = new THREE.Vector3();
  const _ray = new THREE.Raycaster();
  const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function getMuzzle() {
    const cam = window.CAMERA;
    if (!cam) return null;
    cam.getWorldDirection(_camDir);
    cam.matrixWorld.extractBasis(_camRight, _camUp, _origin);
    _origin.copy(cam.position);
    _origin.addScaledVector(_camDir, MUZZLE_FORWARD);
    _origin.addScaledVector(_camUp, -MUZZLE_DOWN);
    _origin.addScaledVector(_camRight, 0.14);
    return _origin;
  }

  function raycastTo(origin, dir) {
    _hitPoint.set(0, -999, 0);
    _hitNormal.set(0, 1, 0);
    let bestDist = LASER_MAX;
    let hit = false;

    if (window.TREES) {
      _ray.set(origin, dir);
      _ray.far = bestDist;
      const meshes = [];
      for (let i = 0; i < window.TREES.length; i++) {
        const t = window.TREES[i];
        if (!t || !t.mesh) continue;
        meshes.push(t.mesh);
      }
      if (meshes.length > 0) {
        const hits = _ray.intersectObjects(meshes, false);
        if (hits.length > 0 && hits[0].distance < bestDist) {
          bestDist = hits[0].distance;
          _hitPoint.copy(hits[0].point);
          _hitNormal.copy(hits[0].face ? hits[0].face.normal : _hitNormal);
          hit = true;
        }
      }
    }

    if (window.worldColliders) {
      for (let i = 0; i < window.worldColliders.length; i++) {
        const c = window.worldColliders[i];
        if (!c) continue;
        const dx = c.x - origin.x;
        const dz = c.z - origin.z;
        const proj = dx * dir.x + dz * dir.z;
        if (proj < 0 || proj > bestDist) continue;
        const perp2 = (dx * dx + dz * dz) - proj * proj;
        if (perp2 < c.r * c.r) {
          const offset = Math.sqrt(c.r * c.r - perp2);
          const d = proj - offset;
          if (d > 0 && d < bestDist) {
            bestDist = d;
            _hitPoint.set(origin.x + dir.x * d, origin.y + dir.y * d, origin.z + dir.z * d);
            _hitNormal.set(-dir.x, 0, -dir.z).normalize();
            hit = true;
          }
        }
      }
    }

    if (window.groundHeight) {
      _ray.set(origin, dir);
      _ray.far = bestDist;
      const gh = _ray.ray.intersectPlane(_ground, _target);
      if (gh) {
        const d = gh.distanceTo(origin);
        if (d > 0 && d < bestDist) {
          bestDist = d;
          _hitPoint.copy(gh);
          _hitNormal.set(0, 1, 0);
          hit = true;
        }
      }
    }

    if (!hit) {
      _hitPoint.copy(origin).addScaledVector(dir, LASER_MAX);
      _hitNormal.copy(dir).multiplyScalar(-1);
    }
    return bestDist;
  }

  function getActiveWeaponSlot() {
    if (window.Weapons && window.Weapons.state && window.Weapons.state.active) return 0;
    if (window.Sniper && window.Sniper.state && window.Sniper.state.active) return 4;
    if (window.DMR && window.DMR.state && window.DMR.state.active) return 3;
    return -1;
  }

  function shouldShow() {
    const ms = window.Manager && window.Manager.state;
    if (!ms || ms.phase !== 'playing') return false;
    if (!window.Player || !Player.state || !Player.state.locked) return false;
    const slot = getActiveWeaponSlot();
    if (slot === -1) return false;
    if (slot === 4 && window.Sniper && window.Sniper.state && window.Sniper.state.aiming) return false;
    if (slot === 3 && window.DMR && window.DMR.state && window.DMR.state.aiming) return false;
    return true;
  }

  function updateBeam(opacity) {
    const origin = getMuzzle();
    if (!origin) return;
    const cam = window.CAMERA;
    cam.getWorldDirection(_rayDir);
    const dist = raycastTo(origin, _rayDir);

    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      positions[i * 3] = origin.x + (_hitPoint.x - origin.x) * t;
      positions[i * 3 + 1] = origin.y + (_hitPoint.y - origin.y) * t;
      positions[i * 3 + 2] = origin.z + (_hitPoint.z - origin.z) * t;
    }
    beamGeo.attributes.position.needsUpdate = true;
    beam.visible = true;
    beamMat.opacity = 0.55 * opacity;

    if (dist < DOT_MAX_DIST) {
      dot.position.copy(_hitPoint).addScaledVector(_hitNormal, 0.02);
      dot.lookAt(_hitPoint.x + _hitNormal.x, _hitPoint.y + _hitNormal.y, _hitPoint.z + _hitNormal.z);
      const dotSize = DOT_SCALE * (0.7 + (dist / DOT_MAX_DIST) * 0.6);
      dot.scale.setScalar(dotSize);
      dot.visible = true;
      dot.material.opacity = 0.75 * opacity;

      glow.position.copy(dot.position);
      glow.rotation.copy(dot.rotation);
      glow.scale.setScalar(dotSize * 2.5);
      glow.visible = true;
      glow.material.opacity = 0.20 * opacity;
    } else {
      dot.visible = false;
      glow.visible = false;
    }
  }

  function update(dt) {
    state.scanT -= dt;
    if (state.scanT > 0) return;
    state.scanT = UPDATE_INTERVAL;

    const want = shouldShow();
    if (want) {
      state.opacity = Math.min(1, state.opacity + dt / FADE_TIME);
      updateBeam(state.opacity);
    } else {
      state.opacity = Math.max(0, state.opacity - dt / FADE_TIME);
      if (state.opacity > 0) {
        beamMat.opacity = 0.55 * state.opacity;
        beam.visible = true;
        if (dot.visible) dot.material.opacity = 0.75 * state.opacity;
        if (glow.visible) glow.material.opacity = 0.20 * state.opacity;
      } else {
        beam.visible = false;
        dot.visible = false;
        glow.visible = false;
      }
    }
  }

  function reset() {
    state.opacity = 0;
    state.scanT = 0;
    beam.visible = false;
    dot.visible = false;
    glow.visible = false;
  }

  return { update, reset, state };
})();
window.SightingLaser = SightingLaser;