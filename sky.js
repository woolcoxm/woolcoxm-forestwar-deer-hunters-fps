// sky.js — FORESTWAR dynamic day/night cycle: sun arc, sky tint, fog, moon, phase HUD clock
const Sky = (() => {
  const THREE = window.THREE;
  const SCENE = window.SCENE;
  const SUN = window.SUN;
  const FOG = window.FOG;
  const SKY_LIGHT = window.SKY_LIGHT;
  if (!SCENE || !SUN || !FOG || !SKY_LIGHT) return null;

  const state = {
    time: 0.32,
    speed: 0.004,
    paused: false,
  };

  const SKY_DOME_GEO = new THREE.SphereGeometry(450, 32, 16);
  const skyMatUniforms = {
    topColor: { value: new THREE.Color(0x4a8fc8) },
    bottomColor: { value: new THREE.Color(0xcfe8d0) },
    offset: { value: 80 },
    exponent: { value: 0.7 },
  };
  const SKY_DOME_MAT = new THREE.ShaderMaterial({
    uniforms: skyMatUniforms,
    vertexShader: [
      'varying vec3 vWorldPos;',
      'void main(){',
      '  vec4 wp = modelMatrix * vec4(position,1.0);',
      '  vWorldPos = wp.xyz;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 topColor;',
      'uniform vec3 bottomColor;',
      'uniform float offset;',
      'uniform float exponent;',
      'varying vec3 vWorldPos;',
      'void main(){',
      '  float h = normalize(vWorldPos + vec3(0.0, offset, 0.0)).y;',
      '  float t = max(pow(max(h,0.0), exponent), 0.0);',
      '  gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);',
      '}'
    ].join('\n'),
    side: THREE.BackSide,
    depthWrite: false,
  });
  const SKY_DOME = new THREE.Mesh(SKY_DOME_GEO, SKY_DOME_MAT);
  SCENE.add(SKY_DOME);

  const MOON_GEO = new THREE.SphereGeometry(6, 12, 10);
  const MOON_MAT = new THREE.MeshBasicMaterial({ color: 0xeef2ff, fog: false });
  const MOON = new THREE.Mesh(MOON_GEO, MOON_MAT);
  MOON.position.set(60, 90, -40);
  SCENE.add(MOON);

  const MOON_GLOW_MAT = new THREE.SpriteMaterial({
    color: 0xaabbff,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    fog: false,
  });
  const MOON_GLOW = new THREE.Sprite(MOON_GLOW_MAT);
  MOON_GLOW.scale.set(34, 34, 1);
  MOON.add(MOON_GLOW);

  const STAR_GEO = new THREE.BufferGeometry();
  const STAR_COUNT = 420;
  const starPos = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const r = 420;
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.abs(Math.cos(phi)) * 0.75 + 50;
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  STAR_GEO.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const STAR_MAT = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false });
  const STARS = new THREE.Points(STAR_GEO, STAR_MAT);
  SCENE.add(STARS);

  const CLOUD_GEO = new THREE.PlaneGeometry(600, 600, 1, 1);
  const CLOUD_MAT = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    fog: false,
  });
  const CLOUDS = new THREE.Mesh(CLOUD_GEO, CLOUD_MAT);
  CLOUDS.position.y = 130;
  CLOUDS.rotation.x = -Math.PI / 2;
  SCENE.add(CLOUDS);

  const _v = new THREE.Vector3();
  const dayColor = new THREE.Color();
  const nightTop = new THREE.Color(0x0a1030);
  const nightBot = new THREE.Color(0x1a2038);
  const dayTop = new THREE.Color(0x4a8fc8);
  const dayBot = new THREE.Color(0xcfe8d0);
  const duskTop = new THREE.Color(0x3a2050);
  const duskBot = new THREE.Color(0xe89050);
  const dawnTop = new THREE.Color(0x6040a0);
  const dawnBot = new THREE.Color(0xffb070);

  function getPhase(t) {
    if (t < 0.20) return 'NIGHT';
    if (t < 0.32) return 'DAWN';
    if (t < 0.68) return 'DAY';
    if (t < 0.80) return 'DUSK';
    return 'NIGHT';
  }

  function getPhaseColor(phase) {
    switch (phase) {
      case 'NIGHT': return '#8a9aff';
      case 'DAWN': return '#ffb070';
      case 'DAY': return '#ffe8a0';
      case 'DUSK': return '#ff8855';
      default: return '#cccccc';
    }
  }

  const hud = document.getElementById('hud');
  let clockEl = null;
  if (hud) {
    clockEl = document.createElement('div');
    clockEl.id = 'sky-clock';
    clockEl.style.cssText = 'position:absolute;right:14px;bottom:198px;text-align:right;font-size:12px;letter-spacing:2px;line-height:1.7;text-shadow:0 2px 4px #000;pointer-events:none;z-index:8;';
    hud.appendChild(clockEl);
  }

  function formatTime(t) {
    const total = (t * 24 * 60) | 0;
    const hh = (total / 60 | 0) % 24;
    const mm = total % 60;
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }

  function updateClock() {
    if (!clockEl) return;
    const phase = getPhase(state.time);
    const c = getPhaseColor(phase);
    clockEl.innerHTML = '<div style="font-size:14px;color:' + c + ';font-weight:bold;letter-spacing:3px;">' + phase + '</div><div style="color:#dfe8df;">' + formatTime(state.time) + '</div>';
  }

  function update(dt) {
    if (state.paused) return;
    state.time += state.speed * dt;
    if (state.time >= 1) state.time -= 1;

    const t = state.time;
    const ang = (t - 0.25) * Math.PI * 2;
    SUN.position.set(Math.cos(ang) * 100, Math.sin(ang) * 100, 35);

    const sunY = SUN.position.y;
    const dayFactor = Math.max(0, Math.min(1, (sunY + 8) / 28));

    if (t < 0.2) {
      const k = t / 0.2;
      dayColor.copy(nightTop).lerp(nightTop, k);
      skyMatUniforms.topColor.value.copy(nightTop);
      skyMatUniforms.bottomColor.value.copy(nightBot);
    } else if (t < 0.32) {
      const k = (t - 0.2) / 0.12;
      skyMatUniforms.topColor.value.copy(nightTop).lerp(dawnTop, k);
      skyMatUniforms.bottomColor.value.copy(nightBot).lerp(dawnBot, k);
    } else if (t < 0.42) {
      const k = (t - 0.32) / 0.10;
      skyMatUniforms.topColor.value.copy(dawnTop).lerp(dayTop, k);
      skyMatUniforms.bottomColor.value.copy(dawnBot).lerp(dayBot, k);
    } else if (t < 0.68) {
      skyMatUniforms.topColor.value.copy(dayTop);
      skyMatUniforms.bottomColor.value.copy(dayBot);
    } else if (t < 0.78) {
      const k = (t - 0.68) / 0.10;
      skyMatUniforms.topColor.value.copy(dayTop).lerp(duskTop, k);
      skyMatUniforms.bottomColor.value.copy(dayBot).lerp(duskBot, k);
    } else if (t < 0.88) {
      const k = (t - 0.78) / 0.10;
      skyMatUniforms.topColor.value.copy(duskTop).lerp(nightTop, k);
      skyMatUniforms.bottomColor.value.copy(duskBot).lerp(nightBot, k);
    } else {
      skyMatUniforms.topColor.value.copy(nightTop);
      skyMatUniforms.bottomColor.value.copy(nightBot);
    }

    SUN.intensity = 0.15 + dayFactor * 1.1;
    SUN.color.setHex(t < 0.32 || t > 0.78 ? 0xff8855 : 0xfff2d0);
    SKY_LIGHT.intensity = 0.15 + dayFactor * 0.5;
    SKY_LIGHT.color.setHex(t < 0.32 || t > 0.78 ? 0x6a7090 : 0xbfd8c0);

    FOG.density = 0.014 + (1 - dayFactor) * 0.016;
    FOG.color.copy(skyMatUniforms.bottomColor.value).multiplyScalar(0.65);

    const moonAng = ang + Math.PI;
    MOON.position.set(Math.cos(moonAng) * 100, Math.sin(moonAng) * 100, -30);
    MOON.visible = MOON.position.y > -10;
    MOON_GLOW.visible = MOON.visible;

    STAR_MAT.opacity = Math.max(0, 1 - dayFactor * 2.2);
    STARS.rotation.y += dt * 0.005;

    CLOUD_MAT.opacity = 0.04 + dayFactor * 0.14;
    CLOUDS.rotation.z += dt * 0.003;

    updateClock();
  }

  function setTime(t) { state.time = ((t % 1) + 1) % 1; }
  function getTime() { return state.time; }
  function getPhaseLabel() { return getPhase(state.time); }
  function isNight() { const p = getPhase(state.time); return p === 'NIGHT' || p === 'DUSK'; }
  function getDayFactor() {
    const ang = (state.time - 0.25) * Math.PI * 2;
    return Math.max(0, Math.min(1, (Math.sin(ang) * 100 + 8) / 28));
  }

  return { state, update, setTime, getTime, getPhaseLabel, isNight, getDayFactor, domeMat: SKY_DOME_MAT, moon: MOON, moonGlow: MOON_GLOW };
})();

window.Sky = Sky;