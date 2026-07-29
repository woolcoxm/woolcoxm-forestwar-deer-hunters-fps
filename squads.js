// squads.js — FORESTWAR command system: squad orders, team stance, kill feed, radio cooldowns, ally callouts
const Squads = (() => {
  const THREE = window.THREE;

  const RADIO_COOLDOWN = 60;
  const CALL_OUT_RANGE = 16;
  const LOW_AMMO_FRAC = 0.3;
  const LOW_HP_FRAC = 0.35;

  const state = {
    order: 'engage',
    rallyPoint: null,
    marker: null,
    radioCd: 0,
    radioReady: true,
    radioActive: 0,
  };

  const ORDERS = {
    '1': 'engage',
    '2': 'rally',
    '3': 'push',
    '4': 'scatter',
  };

  const ORDER_LABELS = {
    engage: 'ENGAGE',
    rally: 'RALLY',
    push: 'PUSH',
    scatter: 'SCATTER',
  };

  const MARKER_GEO = new THREE.CylinderGeometry(2.5, 3.5, 8, 3);
  const MARKER_MAT = new THREE.MeshBasicMaterial({ color: 0x9fe8a0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });

  const _v1 = new THREE.Vector3();

  function setOrder(order) {
    if (!ORDER_LABELS[order]) return;
    state.order = order;
    if (order === 'rally') {
      const p = window.CAMERA ? window.CAMERA.position : { x: 0, z: 0 };
      const a = window.CAMERA ? Math.atan2(window.CAMERA.matrix.elements[8], window.CAMERA.matrix.elements[10]) : 0;
      state.rallyPoint = { x: p.x + Math.sin(a) * 6, z: p.z + Math.cos(a) * 6 };
      if (!state.marker) {
        state.marker = new THREE.Mesh(MARKER_GEO, MARKER_MAT);
        state.marker.rotation.x = Math.PI;
        window.SCENE.add(state.marker);
      }
      if (window.groundHeight) state.marker.position.set(state.rallyPoint.x, window.groundHeight(state.rallyPoint.x, state.rallyPoint.z) + 4, state.rallyPoint.z);
      state.marker.visible = true;
    } else {
      state.rallyPoint = null;
      if (state.marker) state.marker.visible = false;
    }
    if (window.Sound && window.Sound.tone) window.Sound.tone(440 + (order === 'push' ? 120 : order === 'rally' ? -60 : 0), 0.14, 'square', 0.18, 1800);
    if (window.FX) window.FX.message('ORDER: ' + ORDER_LABELS[order], '#9fe8a0');
    updateHUD();
  }

  function callRadio() {
    if (!state.radioReady) {
      if (window.FX) window.FX.message('RADIO RECHARGING', '#ff6644');
      return;
    }
    const ms = window.Manager && window.Manager.state ? window.Manager.state : null;
    if (!ms || ms.phase !== 'playing') return;
    const team = ms.playerTeam;
    const p = window.Player && window.Player.state ? window.Player.state : null;
    if (p && p.stamina < 25) {
      if (window.FX) window.FX.message('INSUFFICIENT STAMINA', '#ff6644');
      return;
    }
    if (p) {
      p.stamina -= 25;
      if (p.regenTimer !== undefined) p.regenTimer = 1.5;
    }
    state.radioReady = false;
    state.radioCd = RADIO_COOLDOWN;
    state.radioActive = 3.0;
    if (window.Reinforcements && window.Reinforcements.call) {
      window.Reinforcements.call(team);
    }
    if (window.FX) window.FX.message('RADIO: REINFORCEMENTS INBOUND', '#c9d8ff');
    if (window.Sound && window.Sound.tone) {
      window.Sound.tone(330, 0.12, 'square', 0.18, 2000);
      window.Sound.tone(550, 0.12, 'square', 0.14, 2000);
    }
    updateHUD();
  }

  function getOrder() { return state.order; }
  function getRally() { return state.rallyPoint; }

  function updateAllies(dt) {
    const ms = window.Manager && window.Manager.state ? window.Manager.state : null;
    if (!ms || ms.phase !== 'playing') return;
    if (!window.Entities || !Array.isArray(window.Entities.list)) return;
    if (!window.CAMERA) return;
    const cam = window.CAMERA;
    const px = cam.position.x, pz = cam.position.z;
    const team = ms.playerTeam;
    let lowAmmoCount = 0, lowHpCount = 0;
    for (let i = 0; i < window.Entities.list.length; i++) {
      const e = window.Entities.list[i];
      if (e.dead || e.team !== team) continue;
      const m = e.mesh;
      if (!m) continue;
      _v1.set(m.position.x - px, 0, m.position.z - pz);
      const dist2 = _v1.x * _v1.x + _v1.z * _v1.z;
      if (dist2 > CALL_OUT_RANGE * CALL_OUT_RANGE) continue;
      const dist = Math.sqrt(dist2);
      const urgency = 1 - dist / CALL_OUT_RANGE;
      if (e.hp !== undefined && e.maxHp && e.hp / e.maxHp < LOW_HP_FRAC) {
        lowHpCount++;
        e.calloutLowHp = (e.calloutLowHp || 0) + dt;
        if (e.calloutLowHp > 4.0) {
          e.calloutLowHp = 0;
          showAllyCallout(m.position.x, m.position.y + 2.2, m.position.z, 'MEDIC!', '#ff4444', urgency);
        }
      } else {
        e.calloutLowHp = 0;
      }
      if (e.ammo !== undefined && e.maxAmmo && e.ammo / e.maxAmmo < LOW_AMMO_FRAC) {
        lowAmmoCount++;
        e.calloutLowAmmo = (e.calloutLowAmmo || 0) + dt;
        if (e.calloutLowAmmo > 5.0) {
          e.calloutLowAmmo = 0;
          showAllyCallout(m.position.x, m.position.y + 2.2, m.position.z, 'RESUPPLY!', '#ffcc44', urgency);
        }
      } else {
        e.calloutLowAmmo = 0;
      }
    }
    if (lowHpCount > 0 && !state._lastHpPing) {
      state._lastHpPing = 8.0;
      if (window.FX) window.FX.message(lowHpCount + ' ALLY(IES) NEED MEDIC', '#ff6666');
    }
    if (state._lastHpPing !== undefined && state._lastHpPing > 0) state._lastHpPing -= dt;
    if (state._lastHpPing !== undefined && state._lastHpPing <= 0) state._lastHpPing = lowHpCount > 0 ? 8.0 : 0;
  }

  function showAllyCallout(wx, wy, wz, text, color, urgency) {
    const cam = window.CAMERA;
    if (!cam) return;
    _v1.set(wx - cam.position.x, wy - cam.position.y, wz - cam.position.z);
    const dist = _v1.length();
    if (dist > CALL_OUT_RANGE + 4) return;
    const ndc = _v1.clone();
    ndc.applyMatrix4(cam.projectionMatrix);
    ndc.applyMatrix4(cam.matrixWorldInverse);
    const screenX = (ndc.x / Math.max(0.1, -ndc.z) * 0.5 + 0.5) * innerWidth;
    const screenY = (-ndc.y / Math.max(0.1, -ndc.z) * 0.5 + 0.5) * innerHeight;
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'position:absolute;left:' + screenX + 'px;top:' + screenY + 'px;'
      + 'transform:translate(-50%,-50%);font-size:' + (11 + urgency * 4) + 'px;'
      + 'font-weight:bold;letter-spacing:2px;color:' + color + ';'
      + 'text-shadow:0 0 6px ' + color + ',0 2px 4px #000;'
      + 'opacity:0;transition:opacity 0.2s,transform 0.2s;'
      + 'pointer-events:none;z-index:8;';
    const hud = document.getElementById('hud');
    if (hud) hud.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translate(-50%,-110%)';
    });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 250);
    }, 1800);
  }

  const keyHandler = (e) => {
    const k = e.key;
    if (ORDERS[k]) {
      e.preventDefault();
      setOrder(ORDERS[k]);
    }
  };

  function init() {
    window.addEventListener('keydown', keyHandler);
    buildHUD();
    if (window.FX && !window.FX.message) {
      window.FX.message = (text, color) => {
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;top:58%;left:50%;transform:translate(-50%,-50%);font-size:18px;font-weight:bold;color:' + (color || '#9fe8a0') + ';letter-spacing:3px;text-shadow:0 2px 6px #000;opacity:0;transition:opacity 0.35s;';
        document.getElementById('hud').appendChild(el);
        el.textContent = text;
        requestAnimationFrame(() => { el.style.opacity = '1'; });
        setTimeout(() => {
          el.style.opacity = '0';
          setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
        }, 2200);
      };
    }
    if (window.KillRewards && window.KillRewards.register) {
      window.KillRewards.register(() => {});
    }
  }

  function update(dt) {
    if (state.radioCd > 0) {
      state.radioCd -= dt;
      if (state.radioCd <= 0) {
        state.radioCd = 0;
        state.radioReady = true;
        if (window.FX) window.FX.message('RADIO READY', '#c9d8ff');
      }
      updateRadioBar();
    }
    if (state.radioActive > 0) state.radioActive -= dt;
    if (state.marker && state.rallyPoint && state.marker.visible) {
      state.marker.rotation.y += dt * 0.8;
    }
    updateAllies(dt);
  }

  let hudBuilt = false;
  function buildHUD() {
    if (hudBuilt) return;
    hudBuilt = true;
    const hud = document.getElementById('hud');
    if (!hud) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;bottom:118px;left:50%;transform:translateX(-50%);'
      + 'display:flex;gap:14px;align-items:flex-end;pointer-events:none;z-index:6;';
    hud.appendChild(wrap);
    for (const key of ['1','2','3','4']) {
      const order = ORDERS[key];
      const card = document.createElement('div');
      card.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;'
        + 'opacity:0.45;transition:opacity 0.2s,transform 0.2s;';
      card.dataset.order = order;
      const k = document.createElement('div');
      k.style.cssText = 'font-size:10px;color:#888;text-shadow:0 1px 2px #000;';
      k.textContent = '[' + key + ']';
      card.appendChild(k);
      const lbl = document.createElement('div');
      lbl.style.cssText = 'font-size:11px;letter-spacing:2px;color:#9fe8a0;text-shadow:0 1px 3px #000;font-weight:bold;';
      lbl.textContent = ORDER_LABELS[order];
      card.appendChild(lbl);
      wrap.appendChild(card);
    }
    const radioWrap = document.createElement('div');
    radioWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;margin-left:8px;';
    wrap.appendChild(radioWrap);
    const rkey = document.createElement('div');
    rkey.style.cssText = 'font-size:10px;color:#888;text-shadow:0 1px 2px #000;';
    rkey.textContent = '[F]';
    radioWrap.appendChild(rkey);
    const rlbl = document.createElement('div');
    rlbl.style.cssText = 'font-size:11px;letter-spacing:2px;color:#c9d8ff;text-shadow:0 1px 3px #000;font-weight:bold;';
    rlbl.textContent = 'RADIO';
    radioWrap.appendChild(rlbl);
    const rbar = document.createElement('div');
    rbar.style.cssText = 'width:50px;height:4px;background:rgba(0,0,0,0.5);border:1px solid rgba(150,170,210,0.3);border-radius:2px;overflow:hidden;margin-top:2px;';
    const rfill = document.createElement('div');
    rfill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#5577aa,#c9d8ff);transition:width 0.1s;';
    rfill.id = 'sq-radio-fill';
    rbar.appendChild(rfill);
    radioWrap.appendChild(rbar);
    state._radioFill = rfill;
    updateHUD();
  }

  function updateHUD() {
    const wrap = document.querySelector('#hud > div[style*="bottom:118px"]');
    if (!wrap) return;
    const cards = wrap.querySelectorAll('[data-order]');
    cards.forEach(card => {
      if (card.dataset.order === state.order) {
        card.style.opacity = '1';
        card.style.transform = 'scale(1.1)';
      } else {
        card.style.opacity = '0.45';
        card.style.transform = 'scale(1)';
      }
    });
  }

  function updateRadioBar() {
    if (!state._radioFill) return;
    const frac = state.radioReady ? 1 : (1 - state.radioCd / RADIO_COOLDOWN);
    state._radioFill.style.width = (frac * 100) + '%';
    state._radioFill.style.background = state.radioReady
      ? 'linear-gradient(90deg,#5577aa,#c9d8ff)'
      : 'linear-gradient(90deg,#332244,#665577)';
  }

  function reset() {
    state.order = 'engage';
    state.rallyPoint = null;
    state.radioCd = 0;
    state.radioReady = true;
    state.radioActive = 0;
    if (state.marker) state.marker.visible = false;
    updateHUD();
    updateRadioBar();
  }

  function dispose() {
    window.removeEventListener('keydown', keyHandler);
    if (state.marker) {
      window.SCENE.remove(state.marker);
      state.marker = null;
    }
  }

  return { init, update, reset, dispose, getOrder, getRally, setOrder, callRadio, state,
    ORDERS, ORDER_LABELS };
})();

window.Squads = Squads;