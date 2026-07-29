// world.js — FORESTWAR world dressing: rocks, bushes, distant ridge, fog tint cycle hook
const THREE = window.THREE;
const SCENE = window.SCENE;

const ROCK_MAT = new THREE.MeshStandardMaterial({ color: 0x4a4a48, roughness: 0.95, flatShading: true });
const BUSH_MAT = new THREE.MeshStandardMaterial({ color: 0x244020, roughness: 0.9, flatShading: true });

const worldColliders = [];
window.worldColliders = worldColliders;

const rockGeos = [
  new THREE.DodecahedronGeometry(1.0, 0),
  new THREE.IcosahedronGeometry(1.1, 0),
];

for (let i = 0; i < 80; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 8 + Math.random() * 160;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const geo = rockGeos[i % 2];
  const rock = new THREE.Mesh(geo, ROCK_MAT);
  const s = 0.6 + Math.random() * 1.4;
  rock.scale.set(s, s * (0.5 + Math.random() * 0.4), s);
  rock.position.set(x, groundHeight(x, z) + s * 0.3, z);
  rock.rotation.set(Math.random() * 0.5, Math.random() * Math.PI * 2, Math.random() * 0.5);
  rock.castShadow = true;
  rock.receiveShadow = true;
  SCENE.add(rock);
  worldColliders.push({ x, z, r: s * 1.05 });
}

const BUSH_GEO = new THREE.IcosahedronGeometry(0.8, 0);
for (let i = 0; i < 120; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 5 + Math.random() * 170;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const cluster = 1 + (Math.random() * 3 | 0);
  for (let j = 0; j < cluster; j++) {
    const bush = new THREE.Mesh(BUSH_GEO, BUSH_MAT);
    const ox = (Math.random() - 0.5) * 2.5;
    const oz = (Math.random() - 0.5) * 2.5;
    const bx = x + ox, bz = z + oz;
    const s = 0.5 + Math.random() * 0.7;
    bush.scale.set(s, s * 0.7, s);
    bush.position.set(bx, groundHeight(bx, bz) + s * 0.25, bz);
    bush.castShadow = true;
    SCENE.add(bush);
  }
  worldColliders.push({ x, z, r: 1.0 });
}

const RIDGE_MAT = new THREE.MeshStandardMaterial({ color: 0x2a3528, roughness: 1, flatShading: true });
const ridgeGeo = new THREE.ConeGeometry(14, 50, 5);
for (let i = 0; i < 18; i++) {
  const a = (i / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.15;
  const r = 210 + Math.random() * 30;
  const ridge = new THREE.Mesh(ridgeGeo, RIDGE_MAT);
  const s = 0.8 + Math.random() * 0.8;
  ridge.scale.set(s, s * (0.7 + Math.random() * 0.6), s);
  ridge.position.set(Math.cos(a) * r, 18, Math.sin(a) * r);
  ridge.rotation.y = Math.random() * Math.PI;
  SCENE.add(ridge);
}

const STUMP_GEO = new THREE.CylinderGeometry(0.45, 0.6, 0.5, 6);
const STUMP_MAT = new THREE.MeshStandardMaterial({ color: 0x4a3422, roughness: 0.95 });
for (let i = 0; i < 40; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 4 + Math.random() * 160;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const stump = new THREE.Mesh(STUMP_GEO, STUMP_MAT);
  stump.position.set(x, groundHeight(x, z) + 0.2, z);
  stump.rotation.y = Math.random() * Math.PI;
  stump.castShadow = true;
  stump.receiveShadow = true;
  SCENE.add(stump);
  worldColliders.push({ x, z, r: 0.55 });
}

const FERN_MAT = new THREE.MeshStandardMaterial({ color: 0x3a6a30, roughness: 0.9, side: THREE.DoubleSide, flatShading: true });
const fernGeo = new THREE.PlaneGeometry(0.5, 0.9);
for (let i = 0; i < 200; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 3 + Math.random() * 165;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const fern = new THREE.Mesh(fernGeo, FERN_MAT);
  fern.position.set(x, groundHeight(x, z) + 0.45, z);
  fern.rotation.y = Math.random() * Math.PI;
  SCENE.add(fern);
}

console.log('World populated: rocks, stumps, bushes, ferns, distant ridge');