// spatial-grid.js — FORESTWAR uniform grid: per-frame neighbor queries for AI, weapons, deployables
const Grid = (() => {
  const CELL = 8;
  const HALF = 160;
  const WIDTH = (HALF * 2) / CELL | 0;
  const TOTAL = WIDTH * WIDTH;
  const _head = new Array(TOTAL).fill(null);
  const _tail = new Array(TOTAL).fill(null);

  function cx(x) {
    let c = ((x + HALF) / CELL) | 0;
    if (c < 0) c = 0;
    else if (c >= WIDTH) c = WIDTH - 1;
    return c;
  }
  function cz(z) {
    let c = ((z + HALF) / CELL) | 0;
    if (c < 0) c = 0;
    else if (c >= WIDTH) c = WIDTH - 1;
    return c;
  }

  let _frame = -1;
  let _count = 0;

  function rebuild(time) {
    if (time === _frame) return;
    _frame = time;
    _count = 0;
    const ents = window.Entities && window.Entities.list;
    if (!ents || ents.length === 0) return;
    for (let i = 0; i < TOTAL; i++) { _head[i] = null; _tail[i] = null; }
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.team === 'none') continue;
      const m = e.mesh;
      if (!m) continue;
      const p = m.position;
      const ix = cx(p.x), iz = cz(p.z);
      const idx = ix + iz * WIDTH;
      const slot = { ent: e, x: ix, z: iz };
      if (_tail[idx] === null) {
        _head[idx] = slot;
        _tail[idx] = slot;
      } else {
        _tail[idx].next = slot;
        _tail[idx] = slot;
      }
      _count++;
    }
  }

  function _collect(cx0, cz0, out, filter) {
    let n = 0;
    const ent = _head[cx0 + cz0 * WIDTH];
    let cur = ent;
    while (cur) {
      const e = cur.ent;
      if (filter(e)) {
        if (n >= out.length) out.push(e);
        else out[n] = e;
        n++;
      }
      cur = cur.next;
    }
    return n;
  }

  function queryRadius(x, z, radius, out, filter) {
    if (!out) out = [];
    let n = 0;
    const minX = cx(x - radius), maxX = cx(x + radius);
    const minZ = cz(z - radius), maxZ = cz(z + radius);
    const r2 = radius * radius;
    for (let iz = minZ; iz <= maxZ; iz++) {
      for (let ix = minX; ix <= maxX; ix++) {
        const idx = ix + iz * WIDTH;
        const head = _head[idx];
        if (!head) continue;
        let cur = head;
        while (cur) {
          const e = cur.ent;
          const m = e.mesh;
          if (m) {
            const dx = m.position.x - x;
            const dz = m.position.z - z;
            if (dx * dx + dz * dz <= r2) {
              if (!filter || filter(e)) {
                if (n >= out.length) out.push(e);
                else out[n] = e;
                n++;
              }
            }
          }
          cur = cur.next;
        }
      }
    }
    out.length = n;
    return n;
  }

  function queryNearest(x, z, radius, filter) {
    let best = null;
    let bestD2 = radius * radius;
    const minX = cx(x - radius), maxX = cx(x + radius);
    const minZ = cz(z - radius), maxZ = cz(z + radius);
    for (let iz = minZ; iz <= maxZ; iz++) {
      for (let ix = minX; ix <= maxX; ix++) {
        const head = _head[ix + iz * WIDTH];
        if (!head) continue;
        let cur = head;
        while (cur) {
          const e = cur.ent;
          const m = e.mesh;
          if (m && (!filter || filter(e))) {
            const dx = m.position.x - x;
            const dz = m.position.z - z;
            const d2 = dx * dx + dz * dz;
            if (d2 < bestD2) {
              bestD2 = d2;
              best = e;
            }
          }
          cur = cur.next;
        }
      }
    }
    return best;
  }

  function queryCone(x, z, dirX, dirZ, dotMin, radius, out, filter) {
    if (!out) out = [];
    let n = 0;
    const r2 = radius * radius;
    const minX = cx(x - radius), maxX = cx(x + radius);
    const minZ = cz(z - radius), maxZ = cz(z + radius);
    for (let iz = minZ; iz <= maxZ; iz++) {
      for (let ix = minX; ix <= maxX; ix++) {
        const head = _head[ix + iz * WIDTH];
        if (!head) continue;
        let cur = head;
        while (cur) {
          const e = cur.ent;
          const m = e.mesh;
          if (m) {
            const dx = m.position.x - x;
            const dz = m.position.z - z;
            const d2 = dx * dx + dz * dz;
            if (d2 <= r2 && d2 > 0.0001) {
              const inv = 1 / Math.sqrt(d2);
              const dot = dx * inv * dirX + dz * inv * dirZ;
              if (dot >= dotMin) {
                if (!filter || filter(e)) {
                  if (n >= out.length) out.push(e);
                  else out[n] = e;
                  n++;
                }
              }
            }
          }
          cur = cur.next;
        }
      }
    }
    out.length = n;
    return n;
  }

  function cellCount() { return _count; }

  return { rebuild, queryRadius, queryNearest, queryCone, cellCount };
})();
window.Grid = Grid;