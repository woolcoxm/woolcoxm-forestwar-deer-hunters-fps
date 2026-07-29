# FORESTWAR — Deer vs Hunters FPS

A chaotic, single-player **3D arena shooter** built in **three.js** (raw ES modules,
no build step). The old forest has become a battlefield: **antler against rifle,
herd against trap**. Pick a side — the antlered deer or the woodland hunters — and
hold the line against escalating waves, capture points, bosses, and your own
killstreaks raining fire from the sky.

🦜 **Built live on Twitch by [Dysfunctional Parrot](https://twitch.tv/functionalparrot)**
— an autonomous AI parrot who streams coding. Free and open-source (MIT).

---

## 🚀 Run it

No bundler, no dependencies to install. The only external resource is the
`three.js` module pulled from a CDN, so you need an internet connection on first
load.

**Option A — just open the file:** double-click `index.html` (Chrome / Edge /
Firefox). Modern browsers allow ES-module loading over `file://` for a same-folder
project like this.

**Option B — local server (recommended, avoids any browser file:// quirks):**
```bash
# from this folder, any static server works:
python3 -m http.server 8000
# then open http://localhost:8000
```

Click the screen to lock the mouse, choose **PLAY AS HUNTER** or **PLAY AS DEER**,
and deploy.

> `game.js` is an early standalone prototype kept for reference — the live game
> boots through `index.html` → `main.js`, which wires together ~60 feature modules.

---

## 🎮 Controls

| Action | Key | Action | Key |
|---|---|---|---|
| Move | `W A S D` | Reload | `R` |
| Look / Aim | `Mouse` | Switch weapon | `1` `2` `3` |
| Shoot | `Left Click` | **Aim down sights** (zoom + tight cone) | `Right Click` hold |
| Jump | `Space` | Bayonet melee | `V` |
| Sprint | `Shift` | Reinforce (call allies) | `5` / `F` |
| Crouch | `Ctrl` / `C` | Bear trap | `6` |
| Squad orders | hold `1`–`4` | Mute music | `M` |

**Abilities & killstreaks**

| Ability | Key | Ability | Key |
|---|---|---|---|
| **WARCRY** — radial knockback + ally rally | `Y` | **STAMPEDE** — herd of elk charges the lane you face | `O` |
| **CHAINGUN** — deploy & mount a minigun nest (`E` to mount) | `Z` | **OWL STRIKE** — predatory airstrike (7-kill streak) | `Q` |
| **GUNSHIP** — attack helicopter (10-kill streak) | `J` | **AC‑130 GUNSHIP** (15-kill streak) | `U` |
| **ARTILLERY** barrage | `G` | **TURRET** deploy | `T` |
| **BEACON** | `B` | **THREAT VISION** | `X` |
| Attack drone / sentry hold (hunters) | `P` / `Shift+P` | Smoke screen | `H` |
| Med-tent | `N` | Killstreak info | `K` |

**Other:** `Tab` tactical scoreboard · `M` mute music · `7` `8` `9` `0` taunt emotes.

Survive as long as you can. Every **5 waves** a **Mega‑Stag boss** arrives.

---

## ✨ Features

- **Two playable factions** — deer (antler charges, caster/support deer) vs hunters
  (rifles, rockets, deployables), each with friendly AI squads.
- **FPS controller** with sprint stamina, crouch, headshot crits, reload, and
  multiple weapons.
- **Aim down sights (ADS)** — hold right-click to shoulder any weapon: a smooth
  FOV zoom, a dramatically tighter bullet cone, braced recoil and a steadier
  sight picture (the viewmodel lifts to centre), at the cost of movement speed.
  Sprint, mount a chaingun, or take a killcam hit to drop the sight automatically.
- **Wave & objective system** — capture-point flags grant team buffs; waves scale
  in size, and bosses trigger on a cycle.
- **Killstreak economy** — chain kills for a rising score multiplier and to unlock
  air support (Owl Strike, Gunship, AC‑130), plus the always-available
  **WARCRY** and **STAMPEDE** abilities.
- **STAMPEDE** *(newest)* — unleash a 16-elk wedge that thunders from behind you
  down the lane you're facing. A 1-second warning lane telegraphs the path, then a
  deep column of charging elk sweeps through, trampling (continuous DPS),
  scattering and stun-knocking every enemy — and the boss — caught in the corridor.
  Long cooldown. Aim it at a clustered enemy formation for maximum carnage, and
  watch the ambient wildlife stampede away in panic.
- **Tactical HUD** — directional threat radar, capture-point tracker, killstreak
  bar, hold-`Tab` scoreboard with K/D and rank, and a live **tactical minimap**.
- **Dynamic battlefield** — day/night sky, weather, a **Blood Moon** that enrages
  the herd, spreading wildfires, craters, blood pools, suppression/pinning,
  comeback portals, supply planes airdropping loot, ballistic vests, ammo pouches,
  adrenaline last-stand, med-tents, bear traps, smoke screens, and more.
- **Ambient wildlife** — peaceful deer herds roam and bolt from gunfire, adding
  life (and panic) to the forest.
- **Juice** — screen shake, hit markers, floating combat text, damage flashes,
  killcam orbit on death, footstep dust, and a procedural adaptive score.

---

## 🗂️ Project layout

The whole game is plain `.js` modules loaded by `index.html` (which sets up the
renderer, scene, terrain and forest) and orchestrated by `main.js` (the fixed-step
game loop). Each feature is a self-contained module exposing `init` / `update` /
`reset` and hanging its state off `window.*` globals:

- **Core:** `index.html`, `main.js`, `manager.js` (waves/score/lifecycle),
  `player.js`, `entities.js` (deer & hunter AI), `weapons.js`, `fx.js`, `sound.js`,
  `music.js`, `sky.js`, `weather.js`, `world.js`.
- **Abilities & killstreaks:** `stampede.js`, `warcry.js`, `owl-strike.js`,
  `heli-strike.js`, `ac130.js`, `chaingun.js`, `killstreak.js`, `kill-rewards.js`.
- **Objectives & flow:** `objectives.js`, `squads.js`, `reinforcements.js`,
  `boss.js`, `portals.js`, `scoreboard.js`, `command-map.js`, `ranks.js`.
- **Gear & deployables:** `armor-vest.js`, `med-tent.js`, `supply-drop.js`,
  `traps.js`, `turret.js`, `artillery.js`, `smoke-grenade.js`, `beacon.js`,
  `drone.js`, `combat-drone.js`, `melee.js`, `pickups.js`, `ammo-drops.js`.
- **Atmosphere & FX:** `herd.js`, `blood-moon.js`, `fire-propagation.js`,
  `blood-pools.js`, `craters.js`, `footsteps.js`, `suppression.js`, `emotes.js`,
  `killcam.js`, `radar.js`, `threat-vision.js`, `combat-text.js`, `regen.js`,
  `adrenaline.js`, `spatial-grid.js`.

---

## 📄 License

Free and open-source under the **[MIT License](./LICENSE)** — use it, fork it,
mod it, ship it. Built by Dysfunctional Parrot.
