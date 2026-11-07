// Pure city layout: no three.js, no DOM. Given the building list and a seed,
// returns where every building goes. Kept separate so it can be tested in Node.

export const LOT = 5;        // lot size in model units (largest small footprint is 3.4)
export const ROAD = 4;       // road width between blocks
export const LOTS_PER_BLOCK = 2; // each block is 2 by 2 lots, so every lot touches a road
export const BLOCK = LOT * LOTS_PER_BLOCK;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Category weights by distance from the centre (0 = centre, 1 = corner):
// tall buildings cluster downtown, tiny ones sit on the outskirts.
function weightsFor(d) {
  if (d < 0.35) return { tall: 6, large: 1, small: 2, tiny: 0 };
  if (d < 0.7) return { tall: 1.5, large: 1.5, small: 5, tiny: 0.5 };
  return { tall: 0, large: 1, small: 5, tiny: 4 };
}

function pickWeighted(rand, weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  let r = rand() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) {
    if ((r -= w) <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

/**
 * @param {Array<{id:string, category:string}>} buildings
 * @param {{seed?:number, blocks?:number}} opts
 * @returns {{placements: Array<{id:string, x:number, z:number, rotation:number, lots:number}>, size:number, blocks:number}}
 */
export function layoutCity(buildings, { seed = 1, blocks = 4 } = {}) {
  const rand = mulberry32(seed);
  const byCat = {};
  for (const b of buildings) (byCat[b.category] ??= []).push(b.id);

  const size = blocks * BLOCK + (blocks + 1) * ROAD; // roads also ring the city
  const half = size / 2;
  const maxDist = Math.hypot(half, half);
  const placements = [];

  for (let bx = 0; bx < blocks; bx++) {
    for (let bz = 0; bz < blocks; bz++) {
      const x0 = -half + ROAD + bx * (BLOCK + ROAD);
      const z0 = -half + ROAD + bz * (BLOCK + ROAD);
      for (let row = 0; row < LOTS_PER_BLOCK; row++) {
        const z = z0 + LOT * (row + 0.5);
        const rowCentre = x0 + BLOCK / 2;
        const d = Math.hypot(rowCentre, z) / maxDist;
        let cat = pickWeighted(rand, weightsFor(d));
        if (!byCat[cat]) cat = 'small';

        if (cat === 'large') {
          // A large building spans the whole row (two lots, 10 units for an 8.8 model).
          // Only 0 or 180 degrees, so its long side stays along the row.
          placements.push({
            id: pick(rand, byCat.large), x: rowCentre, z,
            rotation: rand() < 0.5 ? 0 : Math.PI, lots: 2,
          });
          continue;
        }
        for (let col = 0; col < LOTS_PER_BLOCK; col++) {
          const x = x0 + LOT * (col + 0.5);
          let c = col === 0 ? cat : pickWeighted(rand, weightsFor(Math.hypot(x, z) / maxDist));
          if (c === 'large' || !byCat[c]) c = 'small';
          // Face the nearest street: the lot's outer edges are the road sides.
          const faceX = col === 0 ? -1 : 1;
          const faceZ = row === 0 ? -1 : 1;
          const towardX = rand() < 0.5;
          const rotation = towardX ? (faceX > 0 ? Math.PI / 2 : -Math.PI / 2) : (faceZ > 0 ? 0 : Math.PI);
          placements.push({ id: pick(rand, byCat[c]), x, z, rotation, lots: 1 });
        }
      }
    }
  }
  return { placements, size, blocks };
}

function pick(rand, list) {
  return list[Math.floor(rand() * list.length)];
}
