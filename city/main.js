import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { layoutCity, BLOCK, ROAD } from './layout.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9c9e8);
scene.fog = new THREE.Fog(0xa9c9e8, 90, 220);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(55, 45, 55);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2, 0);
controls.maxPolarAngle = Math.PI / 2.1;
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xdfefff, 0x5a5040, 1.2));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.position.set(40, 60, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 160 });
sun.shadow.bias = -0.0005;
scene.add(sun);

const status = document.getElementById('status');
const seedInput = document.getElementById('seed');

// Load each building once. MagicaVoxel OBJs colour faces by sampling a 256 by 1
// palette strip, so the texture must use nearest filtering or colours bleed.
async function loadBuildings(manifest) {
  const texLoader = new THREE.TextureLoader();
  const objLoader = new OBJLoader();
  const entries = manifest.assets.buildings;
  const models = await Promise.all(entries.map(async (b) => {
    const [obj, tex] = await Promise.all([
      objLoader.loadAsync(b.model),
      texLoader.loadAsync(b.palette),
    ]);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    obj.traverse((m) => {
      if (m.isMesh) { m.material = material; m.castShadow = true; m.receiveShadow = true; }
    });
    // Centre on x and z and sit the base on y = 0, so a placement is just a position.
    const box = new THREE.Box3().setFromObject(obj);
    const centre = box.getCenter(new THREE.Vector3());
    obj.position.set(-centre.x, -box.min.y, -centre.z);
    const pivot = new THREE.Group();
    pivot.add(obj);
    return [b.id, pivot];
  }));
  return { entries, models: new Map(models) };
}

function buildGround(size, blocks) {
  const g = new THREE.Group();
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(size + 40, size + 40),
    new THREE.MeshStandardMaterial({ color: 0x3b3f45, roughness: 1 }),
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.receiveShadow = true;
  g.add(asphalt);

  const half = size / 2;
  const curb = new THREE.MeshStandardMaterial({ color: 0xb9b6ad, roughness: 0.95 });
  const block = new THREE.BoxGeometry(BLOCK + 0.8, 0.15, BLOCK + 0.8);
  for (let bx = 0; bx < blocks; bx++) {
    for (let bz = 0; bz < blocks; bz++) {
      const m = new THREE.Mesh(block, curb);
      m.position.set(
        -half + ROAD + bx * (BLOCK + ROAD) + BLOCK / 2, 0.075,
        -half + ROAD + bz * (BLOCK + ROAD) + BLOCK / 2,
      );
      m.receiveShadow = true;
      g.add(m);
    }
  }

  // Dashed centre lines down every road, both directions.
  const dash = new THREE.BoxGeometry(1, 0.02, 0.15);
  const paint = new THREE.MeshStandardMaterial({ color: 0xf1e7b8 });
  const dashes = [];
  for (let i = 0; i <= blocks; i++) {
    const c = -half + ROAD / 2 + i * (BLOCK + ROAD);
    for (let t = -half + 1; t < half; t += 2.5) {
      dashes.push([t, c, 0], [c, t, Math.PI / 2]);
    }
  }
  const inst = new THREE.InstancedMesh(dash, paint, dashes.length);
  const mtx = new THREE.Object3D();
  dashes.forEach(([x, z, r], i) => {
    mtx.position.set(x, 0.01, z); mtx.rotation.set(0, r, 0); mtx.updateMatrix();
    inst.setMatrixAt(i, mtx.matrix);
  });
  g.add(inst);
  return g;
}

let cityGroup = null;
let lib = null;

function build(seed) {
  if (cityGroup) scene.remove(cityGroup);
  const { placements, size, blocks } = layoutCity(lib.entries, { seed, blocks: 4 });
  cityGroup = new THREE.Group();
  cityGroup.add(buildGround(size, blocks));
  for (const p of placements) {
    const b = lib.models.get(p.id).clone(); // clones share geometry and material
    b.position.set(p.x, 0.15, p.z);
    b.rotation.y = p.rotation;
    cityGroup.add(b);
  }
  scene.add(cityGroup);

  const counts = {};
  for (const p of placements) counts[p.id] = (counts[p.id] || 0) + 1;
  status.textContent = `${placements.length} buildings, seed ${seed}`;
  seedInput.value = seed;
  const url = new URL(location.href);
  url.searchParams.set('seed', seed);
  history.replaceState(null, '', url);
  window.__city = { seed, count: placements.length, counts, camera, controls }; // read by the smoke test
}

document.getElementById('regen').onclick = () => build(Number(seedInput.value) || 1);
document.getElementById('random').onclick = () => build(Math.floor(Math.random() * 1e6));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

try {
  const manifest = await (await fetch('manifest.json')).json();
  lib = await loadBuildings(manifest);
  build(Number(new URLSearchParams(location.search).get('seed')) || 1);
} catch (err) {
  status.textContent = 'Failed to load: ' + err.message;
  console.error(err);
}
