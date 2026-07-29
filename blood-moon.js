// blood-moon.js — FORESTWAR rare night event: a crimson moon rises and drives the herd into a frenzied rage.
// Deer move faster, strike harder and charge far more often while the sky bleeds red. Runs after Sky.update
// each frame so its colour overrides ride on top of the live day/night cycle and fade out cleanly.
const BloodMoon = (() => {
  const THREE = window.THREE;
  const SCENE = window.SCENE;
  const FOG = window.FOG;
  const SUN = window.SUN;
  const SKY_LIGHT = window.SKY_LIGHT;
  if (!THREE || !SCENE) return { update() {}, reset() {}, init() {}, state: {} };

  // ---- Tuning ----------------------------------------------------------
  const CHECK_INTERVAL = 6;     // seconds between trigger rolls
  const NIGHT_CHANCE   = 0.40;  // chance per roll while night + off cooldown
  const COOLDOWN       = 95;    // min seconds between blood moons
  const RAMP           = 3.2;   // visual strength 0 -> 1
  const HOLD           = 34;    // seconds at full strength
  const FADE           = 4.5;   // visual strength 1 -> 0

  // Deer frenzy multipliers while the moon rules the sky.
  const SPD_MULT    = 1.50;     // +50% move speed
  const RATE_MULT   = 0.62;     // fireRate (cooldown base) -> ~35% faster shots
  const DMG_MULT    = 1.35;     // +35% damage
  const CHARGE_MULT = 0.50;     // charge cooldown halved (charges 2x as often)

  // ---- State -----------------------------------------------------------
  const state = {
    phase: 'dormant',   // dormant | rising | peak | falling
    t: 0,
    strength: 0,        // 0..1 visual + logic intensity
    checkCd: 22,        // time until first trigger roll
    cooldown: 60,       // time until next allowed trigger
    buffing: false,     // are deer currently frenzied?
  };

  // ---- Colour targets --------------------------------------------------
  const bloodTop = new THREE.Color(0x3a0606);
  const bloodBot = new THREE.Color(0x8a1410);
  const bloodFog = new THREE.Color(0x2a0606);
  const bloodSun = new THREE.Color(0xff3a22);
  const bloodAmb = new THREE.Color(0x601a1a);
  const bloodMoonCol   = new THREE.Color(0xff2a18);
  const bloodMoonGlow  = new THREE.Color(0xff5a33);
  const neutralMoon    = new THREE.Color(0xeef2ff);
  const neutralGlow    = new THREE.Color(0xaabbff);

  // Re-sampled every frame from whatever Sky just wrote (the neutral baseline).
  const baseTop = new THREE.Color();
  const baseBot = new THREE.Color();
  const baseFog = new THREE.Color();
  const baseSun = new THREE.Color();
  const baseAmb = new THREE.Color();

  // ---- HUD -------------------------------------------------------------
  const hud = document.getElementById('hud');

  const banner = document.createElement('div');
  banner.style.cssText = 'position:absolute;top:10%;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:9px;opacity:0;transition:opacity 0.6s;pointer-events:none;z-index:7;';
  const moonDot = document.createElement('div');
  moonDot.style.cssText = 'width:16px;height:16px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#ff9a7a,#b01810 70%);box-shadow:0 0 14px #ff3a22;';
  const moonTxt = document.createElement('div');
  moonTxt.style.cssText = 'font-size:14px;font-weight:bold;letter-spacing:5px;color:#ff5a44;text-shadow:0 2px 6px #000;';
  moonTxt.textContent = 'BLOOD MOON';
  banner.appendChild(moonDot);
  banner.appendChild(moonTxt);
  if (hud) hud.appendChild(banner);

  const veil = document.createElement('div');
  veil.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;z-index:5;background:radial-gradient(ellipse at center,transparent 34%,rgba(130,0,0,0.55) 100%);';
  if (hud) hud.appendChild(veil);

  // ---- Deer frenzy -----------------------------------------------------
  const GLOW_MAT = new THREE.SpriteMaterial({
    color: 0xff3a22, transparent: true, opacity: 0.6,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });

  function buffDeer() {
    const ents = window.Entities;
    if (!ents || !Array.isArray(ents.list)) return;
    for (const e of ents.list) {
      if (e.dead || e.team !== 'deer' || e.__bmBuffed) continue;
      e.__bmBuffed = true;
      e.__bmSnap = { speed: e.speed, fireRate: e.fireRate, damage: e.damage };
      e.speed *= SPD_MULT;
      e.fireRate *= RATE_MULT;
      e.damage *= DMG_MULT;
      const glow = new THREE.Sprite(GLOW_MAT);
      glow.scale.set(1.7, 1.7, 1);
      glow.position.y = 1.55;
      e.mesh.add(glow);
      e.__bmGlow = glow;
    }
  }

  function restoreDeer() {
    const ents = window.Entities;
    if (!ents || !Array.isArray(ents.list)) return;
    for (const e of ents.list) {
      if (!e.__bmBuffed) continue;
      if (e.__bmSnap) {
        e.speed = e.__bmSnap.speed;
        e.fireRate = e.__bmSnap.fireRate;
        e.damage = e.__bmSnap.damage;
      }
      if (e.__bmGlow && e.mesh) e.mesh.remove(e.__bmGlow);
      delete e.__bmBuffed;
      delete e.__bmSnap;
      delete e.__bmGlow;
    }
  }

  function frenzyTick(dt) {
    // Make frenzied deer build charge faster (extra decay on top of Entities' own tick).
    const extra = dt * (1 / CHARGE_MULT - 1);
    const ents = window.Entities;
    if (!ents || !Array.isArray(ents.list)) return;
    for (const e of ents.list) {
      if (e.dead || e.team !== 'deer' || !e.__bmBuffed) continue;
      if (e.chargeCd && e.chargeCd > 0) e.chargeCd -= extra;
    }
    const pulse = (0.5 + 0.25 * Math.sin(performance.now() * 0.01)) * Math.max(0.3, state.strength);
    GLOW_MAT.opacity = pulse;
  }

  // ---- Sky / atmosphere override --------------------------------------
  function applyVisuals(s) {
    const sky = window.Sky;
    const dome = sky && sky.domeMat ? sky.domeMat.uniforms : null;

    // Sample this frame's neutral baseline (Sky.update ran just before us).
    if (dome) { baseTop.copy(dome.topColor.value); baseBot.copy(dome.bottomColor.value); }
    if (FOG) baseFog.copy(FOG.color);
    if (SUN) baseSun.copy(SUN.color);
    if (SKY_LIGHT) baseAmb.copy(SKY_LIGHT.color);
    const sunI0 = SUN ? SUN.intensity : 1;
    const ambI0 = SKY_LIGHT ? SKY_LIGHT.intensity : 1;

    if (s <= 0) {
      // Let Sky's values pass through untouched; only restore the moon (Sky never rewrites it).
      if (sky && sky.moon) sky.moon.material.color.copy(neutralMoon);
      if (sky && sky.moonGlow) sky.moonGlow.material.color.copy(neutralGlow);
      return;
    }

    if (dome) {
      dome.topColor.value.copy(baseTop).lerp(bloodTop, s);
      dome.bottomColor.value.copy(baseBot).lerp(bloodBot, s);
    }
    if (FOG) FOG.color.copy(baseFog).lerp(bloodFog, s);
    if (SUN) {
      SUN.color.copy(baseSun).lerp(bloodSun, s);
      SUN.intensity = sunI0 * (1 - 0.55 * s);
    }
    if (SKY_LIGHT) {
      SKY_LIGHT.color.copy(baseAmb).lerp(bloodAmb, s);
      SKY_LIGHT.intensity = ambI0 * (1 - 0.4 * s);
    }
    if (sky && sky.moon) sky.moon.material.color.copy(neutralMoon).lerp(bloodMoonCol, s);
    if (sky && sky.moonGlow) sky.moonGlow.material.color.copy(neutralGlow).lerp(bloodMoonGlow, s);
  }

  // ---- Event lifecycle -------------------------------------------------
  function beginEvent() {
    state.phase = 'rising';
    state.t = 0;
    state.strength = 0;
    state.cooldown = COOLDOWN;
    if (window.FX && window.FX.message) window.FX.message('THE BLOOD MOON RISES — THE HERD IS ENRAGED', '#ff3a22');
    if (window.FX && window.FX.shake) window.FX.shake(0.28);
    if (window.Sound) {
      if (window.Sound.horn) window.Sound.horn();
      if (window.Sound.tone) {
        window.Sound.tone(64, 1.8, 'sawtooth', 0.26, 70);
        window.Sound.tone(96, 1.5, 'sine', 0.16, 92);
      }
    }
  }

  function endEvent() {
    state.phase = 'dormant';
    state.t = 0;
    state.strength = 0;
    state.cooldown = COOLDOWN;
    if (window.FX && window.FX.message) window.FX.message('THE BLOOD MOON WANES', '#bb6a5a');
  }

  // ---- Main update -----------------------------------------------------
  function update(dt) {
    const mgr = window.Manager;
    const playing = mgr && mgr.state && mgr.state.phase === 'playing';

    if (!playing) {
      // Round ended mid-event: tear down buffs + visuals.
      if (state.buffing) { restoreDeer(); state.buffing = false; }
      if (state.phase !== 'dormant') { state.phase = 'dormant'; state.t = 0; state.strength = 0; state.cooldown = 45; }
      applyVisuals(0);
      banner.style.opacity = '0';
      veil.style.opacity = '0';
      GLOW_MAT.opacity = 0;
      return;
    }

    // Trigger rolling (only at night, off cooldown).
    state.cooldown -= dt;
    if (state.phase === 'dormant') {
      state.checkCd -= dt;
      if (state.checkCd <= 0) {
        state.checkCd = CHECK_INTERVAL;
        const sky = window.Sky;
        const night = sky && sky.isNight ? sky.isNight() : false;
        if (night && state.cooldown <= 0 && Math.random() < NIGHT_CHANCE) beginEvent();
      }
    }

    // Phase progression drives the visual strength curve.
    if (state.phase !== 'dormant') {
      state.t += dt;
      if (state.phase === 'rising') {
        state.strength = Math.min(1, state.t / RAMP);
        if (state.strength >= 1) { state.phase = 'peak'; state.t = 0; }
      } else if (state.phase === 'peak') {
        state.strength = 1;
        if (state.t >= HOLD) { state.phase = 'falling'; state.t = 0; }
      } else if (state.phase === 'falling') {
        state.strength = Math.max(0, 1 - state.t / FADE);
        if (state.strength <= 0) endEvent();
      }
    }

    // Deer frenzy toggles with the visual presence of the moon.
    const wantBuff = state.phase !== 'dormant' && state.strength > 0.02;
    if (wantBuff && !state.buffing) { state.buffing = true; buffDeer(); }
    if (state.buffing) {
      buffDeer();           // catch deer spawned mid-event
      frenzyTick(dt);
      if (!wantBuff) { restoreDeer(); state.buffing = false; GLOW_MAT.opacity = 0; }
    }

    applyVisuals(state.strength);

    banner.style.opacity = state.strength > 0.05 ? Math.min(1, state.strength * 1.3).toFixed(2) : '0';
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);
    veil.style.opacity = (state.strength * (0.5 + 0.22 * pulse)).toFixed(3);
  }

  function reset() {
    if (state.buffing) restoreDeer();
    state.buffing = false;
    state.phase = 'dormant';
    state.t = 0;
    state.strength = 0;
    state.checkCd = 22;
    state.cooldown = 55;
    banner.style.opacity = '0';
    veil.style.opacity = '0';
    GLOW_MAT.opacity = 0;
    applyVisuals(0);
  }

  function init() { /* HUD built at load */ }

  return { update, reset, init, state, isActive: () => state.phase !== 'dormant', getStrength: () => state.strength };
})();
window.BloodMoon = BloodMoon;
