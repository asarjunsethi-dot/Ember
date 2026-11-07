import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { layoutCity, SIDEWALK, CURB_H } from './layout.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const SKY = 0xbcd3e6;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 140, 330);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 800);
camera.position.set(95, 70, 95);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 3, 0);
controls.maxPolarAngle = Math.PI / 2.1;
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xe4f0ff, 0x6a5a48, 1.1));
const sun = new THREE.DirectionalLight(0xffe8cc, 2.4);
sun.position.set(60, 80, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -85, right: 85, top: 85, bottom: -85, near: 1, far: 260 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);

const status = document.getElementById('status');
const seedInput = document.getElementById('seed');

// Slight per building colour shifts so repeated models do not look identical.
// Instance colour multiplies the palette texture.
const TINTS = [0xffffff, 0xf3e4d3, 0xe2e8ef, 0xffe6c8, 0xdcd5cb, 0xf0d8d0].map((c) => new THREE.Color(c));
const CAR_COLORS = [0xc8372d, 0x2f5fa8, 0xe8e4da, 0x2b2b2e, 0xd9a330, 0x4f8a5b, 0x8b8f96, 0x6d3f8a].map((c) => new THREE.Color(c));
const LEAF = [0x5c8f3e, 0x4a7d36, 0x6f9c45, 0x3f6e33].map((c) => new THREE.Color(c));

// Load each building once. MagicaVoxel OBJs colour faces by sampling a 256 by 1
// palette strip, so the texture must use nearest filtering or colours bleed.
// Each model's meshes are baked into centred geometries (base on y = 0) so every
// copy can be drawn with one InstancedMesh per model.
async function loadBuildings(manifest) {
  const texLoader = new THREE.TextureLoader();
  const objLoader = new OBJLoader();
  const entries = manifest.assets.buildings;
  const models = await Promise.all(entries.map(async (b) => {
    const [obj, tex] = await Promise.all([objLoader.loadAsync(b.model), texLoader.loadAsync(b.palette)]);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const centre = box.getCenter(new THREE.Vector3());
    const shift = new THREE.Matrix4().makeTranslation(-centre.x, -box.min.y, -centre.z);
    const geometries = [];
    obj.traverse((m) => {
      if (m.isMesh) geometries.push(m.geometry.clone().applyMatrix4(m.matrixWorld).applyMatrix4(shift));
    });
    return [b.id, { geometries, material }];
  }));
  return { entries, models: new Map(models) };
}

const tmp = new THREE.Object3D();
function instanced(geometry, material, items, place, colorOf) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
  mesh.count = items.length;
  items.forEach((it, i) => {
    place(it, tmp);
    tmp.updateMatrix();
    mesh.setMatrixAt(i, tmp.matrix);
    if (colorOf) mesh.setColorAt(i, colorOf(it));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
const reset = (o) => { o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); };

const MAT = {
  asphalt: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 1 }),
  sidewalk: new THREE.MeshStandardMaterial({ color: 0xbdb8ad, roughness: 0.95 }),
  lot: new THREE.MeshStandardMaterial({ color: 0xa59f92, roughness: 1 }),
  grass: new THREE.MeshStandardMaterial({ color: 0x6f9a4a, roughness: 1 }),
  field: new THREE.MeshStandardMaterial({ color: 0x8aa863, roughness: 1 }),
  plaza: new THREE.MeshStandardMaterial({ color: 0xd8cdb6, roughness: 0.9 }),
  paint: new THREE.MeshStandardMaterial({ color: 0xf1e7b8, roughness: 0.8 }),
  white: new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.8 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
  pole: new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.6, metalness: 0.3 }),
  bulb: new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffd98a, emissiveIntensity: 0.6 }),
  car: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.2 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x23303d, roughness: 0.2, metalness: 0.4 }),
  water: new THREE.MeshStandardMaterial({ color: 0x5d9ec7, roughness: 0.1, metalness: 0.2 }),
  stone: new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.9 }),
};

function buildGround(city) {
  const g = new THREE.Group();
  // Countryside grass all around, asphalt only under the city itself.
  const field = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), MAT.field);
  field.rotation.x = -Math.PI / 2;
  field.position.y = -0.02;
  field.receiveShadow = true;
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(city.sizeX, city.sizeZ), MAT.asphalt);
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.receiveShadow = true;
  g.add(field, asphalt);

  // Raised block slabs: the sidewalk ring, then the inner surface by block type.
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const byType = { buildings: MAT.lot, park: MAT.grass, plaza: MAT.plaza };
  g.add(instanced(unit, MAT.sidewalk, city.blocks, (b, o) => {
    reset(o); o.position.set(b.x, CURB_H / 2, b.z); o.scale.set(b.w, CURB_H, b.d);
  }));
  for (const [type, mat] of Object.entries(byType)) {
    const list = city.blocks.filter((b) => b.type === type);
    g.add(instanced(unit, mat, list, (b, o) => {
      reset(o); o.position.set(b.x, CURB_H + 0.01, b.z);
      o.scale.set(b.w - 2 * SIDEWALK, 0.02, b.d - 2 * SIDEWALK);
    }));
  }
  g.add(instanced(unit, MAT.grass, city.yards, (y, o) => {
    reset(o); o.position.set(y.x, CURB_H + 0.025, y.z); o.scale.set(y.w - 0.2, 0.02, y.d - 0.2);
  }));

  // Centre line dashes on every street segment, and zebra crossings at both ends.
  const dashes = [];
  const zebras = [];
  for (const s of city.segments) {
    for (let t = s.from + 2.2; t < s.to - 2.2; t += 2.4) dashes.push({ s, t });
    for (const end of [s.from - 0.9, s.to + 0.9]) {
      for (let k = -s.w / 2 + 0.5; k <= s.w / 2 - 0.5; k += 0.7) zebras.push({ s, t: end, k });
    }
  }
  const at = (s, t, k = 0) => (s.dir === 'x' ? [t, s.c + k] : [s.c + k, t]);
  g.add(instanced(new THREE.BoxGeometry(1, 0.02, 0.15), MAT.paint, dashes, ({ s, t }, o) => {
    reset(o); const [x, z] = at(s, t); o.position.set(x, 0.01, z); o.rotation.y = s.dir === 'x' ? 0 : Math.PI / 2;
  }));
  g.add(instanced(new THREE.BoxGeometry(1.3, 0.02, 0.35), MAT.white, zebras, ({ s, t, k }, o) => {
    reset(o); const [x, z] = at(s, t, k); o.position.set(x, 0.01, z); o.rotation.y = s.dir === 'x' ? 0 : Math.PI / 2;
  }));
  g.traverse((m) => { if (m.isMesh) m.castShadow = false; });
  return g;
}

function buildProps(city) {
  const g = new THREE.Group();
  const trunk = new THREE.BoxGeometry(0.25, 1, 0.25).translate(0, 0.5, 0);
  const crown = new THREE.BoxGeometry(1.3, 1.3, 1.3).translate(0, 1.55, 0);
  const crownTop = new THREE.BoxGeometry(0.8, 0.6, 0.8).translate(0, 2.4, 0);
  const placeTree = (t, o) => { reset(o); o.position.set(t.x, CURB_H, t.z); o.scale.setScalar(t.h); o.rotation.y = t.h * 7; };
  g.add(instanced(trunk, MAT.trunk, city.trees, placeTree));
  g.add(instanced(crown, MAT.leaf, city.trees, placeTree, (t) => LEAF[t.shade]));
  g.add(instanced(crownTop, MAT.leaf, city.trees, placeTree, (t) => LEAF[(t.shade + 1) % LEAF.length]));

  const pole = new THREE.BoxGeometry(0.1, 2.4, 0.1).translate(0, 1.2, 0);
  const arm = new THREE.BoxGeometry(0.08, 0.08, 0.6).translate(0, 2.35, 0.25);
  const bulb = new THREE.BoxGeometry(0.22, 0.12, 0.3).translate(0, 2.28, 0.5);
  const placeLamp = (l, o) => { reset(o); o.position.set(l.x, CURB_H, l.z); o.rotation.y = l.rotation; };
  g.add(instanced(pole, MAT.pole, city.lamps, placeLamp));
  g.add(instanced(arm, MAT.pole, city.lamps, placeLamp));
  g.add(instanced(bulb, MAT.bulb, city.lamps, placeLamp));

  const body = new THREE.BoxGeometry(0.85, 0.45, 1.8).translate(0, 0.38, 0);
  const cabin = new THREE.BoxGeometry(0.75, 0.38, 0.95).translate(0, 0.78, -0.1);
  const placeCar = (c, o) => { reset(o); o.position.set(c.x, 0, c.z); o.rotation.y = c.rotation; };
  g.add(instanced(body, MAT.car, city.cars, placeCar, (c) => CAR_COLORS[c.color]));
  g.add(instanced(cabin, MAT.glass, city.cars, placeCar));

  // Fountain in the plaza.
  for (const b of city.blocks.filter((x) => x.type === 'plaza')) {
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 0.6, 8), MAT.stone);
    basin.position.set(b.x, CURB_H + 0.3, b.z);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.1, 8), MAT.water);
    water.position.set(b.x, CURB_H + 0.56, b.z);
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.2, 0.6), MAT.stone);
    column.position.set(b.x, CURB_H + 1.4, b.z);
    for (const m of [basin, water, column]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  }
  return g;
}

function buildBuildings(city) {
  const g = new THREE.Group();
  const byId = new Map();
  for (const p of city.placements) {
    if (!byId.has(p.id)) byId.set(p.id, []);
    byId.get(p.id).push(p);
  }
  for (const [id, list] of byId) {
    const { geometries, material } = lib.models.get(id);
    for (const geo of geometries) {
      g.add(instanced(geo, material, list, (p, o) => {
        reset(o); o.position.set(p.x, CURB_H, p.z); o.rotation.y = p.rotation; o.scale.setScalar(p.scale);
      }, (p) => TINTS[p.tint]));
    }
  }
  return g;
}

let cityGroup = null;
let lib = null;

function build(seed) {
  if (cityGroup) {
    scene.remove(cityGroup);
    cityGroup.traverse((m) => { if (m.isInstancedMesh) m.dispose(); });
  }
  const city = layoutCity(lib.entries, { seed, blocks: 5 });
  cityGroup = new THREE.Group();
  cityGroup.add(buildGround(city), buildProps(city), buildBuildings(city));
  scene.add(cityGroup);

  const counts = {};
  for (const p of city.placements) counts[p.id] = (counts[p.id] || 0) + 1;
  status.textContent = `${city.placements.length} buildings, ${city.trees.length} trees, ${city.cars.length} cars · seed ${seed}`;
  seedInput.value = seed;
  const url = new URL(location.href);
  url.searchParams.set('seed', seed);
  history.replaceState(null, '', url);
  // Read by the smoke test.
  window.__city = { seed, count: city.placements.length, counts, trees: city.trees.length, cars: city.cars.length, camera, controls };
}

const randomSeed = () => Math.floor(Math.random() * 1e6);
document.getElementById('regen').onclick = () => build(Number(seedInput.value) || 1);
document.getElementById('random').onclick = () => build(randomSeed());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

try {
  const manifest = await (await fetch('manifest.json')).json();
  lib = await loadBuildings(manifest);
  // A new city on every visit unless the address pins a seed.
  build(Number(new URLSearchParams(location.search).get('seed')) || randomSeed());
} catch (err) {
  status.textContent = 'Failed to load: ' + err.message;
  console.error(err);
}
