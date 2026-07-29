// settings.js — FORESTWAR runtime settings panel: screen-shake intensity, master volume, FOV scale
const Settings = (() => {
  const STORAGE_KEY = 'forestwar_settings';
  const PANEL_W = 280;
  const SLIDER_H = 6;
  const_defaults = null;

  const defaults = {
    shakeIntensity: 1.0,
    masterVolume: 0.55,
    fovScale: 1.0,
    particleDensity: 1.0,
  };

  const state = {
    open: false,
    values: Object.assign({}, defaults),
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      for (const k in defaults) {
        if (typeof saved[k] === 'number') state.values[k] = saved[k];
      }
    }
  } catch (e) { /* ignore corrupt storage */ }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.values)); } catch (e) { /* quota */ }
  }

  function applyShakeMultiplier() {
    if (window.FX && typeof window.FX.setShakeScale === 'function') {
      window.FX.setShakeScale(state.values.shakeIntensity);
    }
  }

  function applyVolume() {
    if (window.Sound && typeof window.Sound.setMaster === 'function') {
      window.Sound.setMaster(state.values.masterVolume);
    }
  }

  function applyFOV() {
    if (window.CAMERA && typeof window.CAMERA.fov === 'number') {
      const base = window.CAMERA.userData.baseFov || window.CAMERA.fov;
      window.CAMERA.userData.baseFov = base;
      window.CAMERA.fov = Math.round(base * state.values.fovScale);
      window.CAMERA.updateProjectionMatrix();
    }
  }

  function applyParticleDensity() {
    if (window.FX && typeof window.FX.setParticleScale === 'function') {
      window.FX.setParticleScale(state.values.particleDensity);
    }
  }

  function applyAll() {
    applyShakeMultiplier();
    applyVolume();
    applyFOV();
    applyParticleDensity();
  }

  // ---- Panel DOM ----
  const panel = document.createElement('div');
  panel.id = 'settings-panel';
  panel.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);'
    + 'width:' + PANEL_W + 'px;background:rgba(10,18,10,0.94);border:1px solid rgba(150,200,150,0.4);'
    + 'border-radius:8px;padding:18px 20px;z-index:25;'
    + 'box-shadow:0 8px 40px rgba(0,0,0,0.7);display:none;'
    + 'font-family:"Trebuchet MS",sans-serif;color:#dfe;';
  document.getElementById('hud').appendChild(panel);

  const title = document.createElement('div');
  title.style.cssText = 'font-size:15px;letter-spacing:4px;color:#9fe8a0;text-align:center;margin-bottom:16px;font-weight:bold;';
  title.textContent = 'SETTINGS';
  panel.appendChild(title);

  const rows = [];

  function makeSlider(labelText, min, max, step, key, formatter) {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom:14px;';
    const labelRow = document.createElement('div');
    labelRow.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;letter-spacing:1px;margin-bottom:4px;';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'color:#b9d6b9;';
    lbl.textContent = labelText;
    const val = document.createElement('span');
    val.style.cssText = 'color:#ffcc66;font-weight:bold;';
    val.textContent = formatter(state.values[key]);
    labelRow.appendChild(lbl);
    labelRow.appendChild(val);
    row.appendChild(labelRow);

    const trackBg = document.createElement('div');
    trackBg.style.cssText = 'position:relative;width:100%;height:' + SLIDER_H + 'px;'
      + 'background:rgba(0,0,0,0.5);border-radius:3px;cursor:pointer;';
    const fill = document.createElement('div');
    fill.style.cssText = 'position:absolute;left:0;top:0;height:100%;border-radius:3px;'
      + 'background:linear-gradient(90deg,#5fd07a,#c9e87a);pointer-events:none;';
    trackBg.appendChild(fill);
    const knob = document.createElement('div');
    knob.style.cssText = 'position:absolute;top:50%;width:14px;height:14px;border-radius:50%;'
      + 'background:#e8f3e8;border:2px solid #5fd07a;transform:translate(-50%,-50%);'
      + 'box-shadow:0 2px 6px rgba(0,0,0,0.5);pointer-events:none;';
    trackBg.appendChild(knob);
    row.appendChild(trackBg);

    function updateUI(v) {
      const frac = (v - min) / (max - min);
      fill.style.width = (frac * 100) + '%';
      knob.style.left = (frac * 100) + '%';
      val.textContent = formatter(v);
    }
    updateUI(state.values[key]);

    let dragging = false;
    function setFromEvent(e) {
      const rect = trackBg.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX);
      let frac = (cx - rect.left) / rect.width;
      frac = Math.max(0, Math.min(1, frac));
      let v = min + frac * (max - min);
      v = Math.round(v / step) * step;
      v = Math.max(min, Math.min(max, v));
      state.values[key] = v;
      updateUI(v);
      if (key === 'shakeIntensity') applyShakeMultiplier();
      else if (key === 'masterVolume') applyVolume();
      else if (key === 'fovScale') applyFOV();
      else if (key === 'particleDensity') applyParticleDensity();
      persist();
    }
    trackBg.addEventListener('mousedown', (e) => { dragging = true; setFromEvent(e); e.preventDefault(); });
    window.addEventListener('mousemove', (e) => { if (dragging) setFromEvent(e); });
    window.addEventListener('mouseup', () => { if (dragging) { dragging = false; persist(); } });
    trackBg.addEventListener('touchstart', (e) => { dragging = true; setFromEvent(e); e.preventDefault(); }, { passive: false });
    window.addEventListener('touchmove', (e) => { if (dragging) { setFromEvent(e); e.preventDefault(); } }, { passive: false });
    window.addEventListener('touchend', () => { if (dragging) { dragging = false; persist(); } });

    rows.push({ row, key });
    panel.appendChild(row);
  }

  makeSlider('SCREEN SHAKE', 0, 2, 0.1, 'shakeIntensity', (v) => v <= 0.01 ? 'OFF' : Math.round(v * 100) + '%');
  makeSlider('MASTER VOLUME', 0, 1, 0.05, 'masterVolume', (v) => v <= 0.01 ? 'MUTED' : Math.round(v * 100) + '%');
  makeSlider('FIELD OF VIEW', 0.8, 1.3, 0.05, 'fovScale', (v) => Math.round(v * 100) + '%');
  makeSlider('PARTICLES', 0, 1, 0.1, 'particleDensity', (v) => v <= 0.01 ? 'OFF' : Math.round(v * 100) + '%');

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
  panel.appendChild(btnRow);

  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'RESET';
  resetBtn.style.cssText = 'flex:1;padding:7px;border:1px solid rgba(150,200,150,0.35);border-radius:4px;'
    + 'background:rgba(40,60,40,0.7);color:#dfe;font-size:11px;letter-spacing:2px;cursor:pointer;font-family:inherit;';
  resetBtn.addEventListener('mouseenter', () => { resetBtn.style.background = 'rgba(60,90,60,0.8)'; });
  resetBtn.addEventListener('mouseleave', () => { resetBtn.style.background = 'rgba(40,60,40,0.7)'; });
  resetBtn.addEventListener('click', () => {
    state.values = Object.assign({}, defaults);
    for (const r of rows) {
      const slider = r.row.querySelector('div:nth-child(2)');
      const fill = slider.children[0];
      const knob = slider.children[1];
      const valLabel = r.row.querySelector('span:last-child');
      const min = 0, max = 1;
      if (r.key === 'shakeIntensity' || r.key === 'particleDensity') max = r.key === 'shakeIntensity' ? 2 : 1;
      const frac = (state.values[r.key] - min) / (max - min);
      fill.style.width = (frac * 100) + '%';
      knob.style.left = (frac * 100) + '%';
    }
    applyAll();
    persist();
    rebuildLabels();
  });
  btnRow.appendChild(resetBtn);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'CLOSE';
  closeBtn.style.cssText = 'flex:1;padding:7px;border:1px solid rgba(150,200,150,0.35);border-radius:4px;'
    + 'background:rgba(40,60,40,0.7);color:#dfe;font-size:11px;letter-spacing:2px;cursor:pointer;font-family:inherit;';
  closeBtn.addEventListener('mouseenter', () => { closeBtn.style.background = 'rgba(60,90,60,0.8)'; });
  closeBtn.addEventListener('mouseleave', () => { closeBtn.style.background = 'rgba(40,60,40,0.7)'; });
  closeBtn.addEventListener('click', () => { toggle(false); });
  btnRow.appendChild(closeBtn);

  function rebuildLabels() {
    const fmts = {
      shakeIntensity: (v) => v <= 0.01 ? 'OFF' : Math.round(v * 100) + '%',
      masterVolume: (v) => v <= 0.01 ? 'MUTED' : Math.round(v * 100) + '%',
      fovScale: (v) => Math.round(v * 100) + '%',
      particleDensity: (v) => v <= 0.01 ? 'OFF' : Math.round(v * 100) + '%',
    };
    for (const r of rows) {
      const valLabel = r.row.querySelector('div > span:last-child');
      if (valLabel) valLabel.textContent = fmts[r.key](state.values[r.key]);
    }
  }

  function toggle(force) {
    const next = force !== undefined ? force : !state.open;
    state.open = next;
    panel.style.display = next ? 'block' : 'none';
    if (next) {
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
      if (window.Player) Player.state.locked = false;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const ms = window.Manager;
    if (ms && ms.state && ms.state.phase === 'playing') toggle();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.open) toggle(false);
  });

  function init() {
    applyAll();
    rebuildLabels();
    if (window.FX && !window.FX.setShakeScale) {
      window.FX.setShakeScale = (s) => { window.FX._shakeScale = s; };
      if (window.FX.shake) {
        const orig = window.FX.shake;
        window.FX.shake = function(amt) {
          const scale = window.FX._shakeScale !== undefined ? window.FX._shakeScale : 1.0;
          orig(amt * scale);
        };
      }
    }
    if (window.Sound && !window.Sound.setMaster) {
      window.Sound.setMaster = (v) => {
        if (window.Sound.master && window.Sound.master.gain) {
          window.Sound.master.gain.value = v;
        }
      };
    }
  }

  return { state, init, toggle, applyAll };
})();
window.Settings = Settings;