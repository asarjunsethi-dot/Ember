// Pure city layout: no three.js, no DOM. Given the building list and a seed,
// returns where every building, tree, lamp and car goes. Kept separate so it
// can be tested in Node.

export const LOT = 5;          // lot size in model units (largest small footprint is 3.4)
export const SIDEWALK = 1.4;   // sidewalk ring around every block
export const ROAD = 4;         // normal two lane street
export const AVENUE = 7;       // one wider street in each direction
export const CURB_H = 0.15;    // sidewalk height; buildings sit on top of it

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

const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const range = (rand, a, b) => a + rand() * (b - a);

// Category weights by distance from the centre (0 = centre, 1 = corner):
// tall buildings cluster downtown, tiny ones sit on the outskirts.
function weightsFor(d) {
  if (d < 0.3) return { tall: 7, large: 1.5, small: 2, tiny: 0 };
  if (d < 0.6) return { tall: 2, large: 2, small: 5, tiny: 1 };
  return { tall: 0.3, large: 1, small: 4, tiny: 4 };
}

function pickWeighted(rand, weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  let r = rand() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) if ((r -= w) <= 0) return k;
  return entries[entries.length - 1][0];
}

// Chance that a lot is left empty (it gets trees instead), rising toward the edge.
const emptyChance = (d) => (d > 0.75 ? 0.4 : d > 0.5 ? 0.15 : 0.03);

// Facing vector to rotation about y, so the model's +z side points at the street.
const facingToRotation = ([fx, fz]) => Math.atan2(fx, fz);

/**
 * @param {Array<{id:string, category:string, size_xyz:number[]}>} buildings
 * @param {{seed?:number, blocks?:number}} opts
 */
export function layoutCity(buildings, { seed = 1, blocks: n = 5 } = {}) {
  const rand = mulberry32(seed);
  const byCat = {};
  const sizeOf = {};
  for (const b of buildings) {
    (byCat[b.category] ??= []).push(b.id);
    sizeOf[b.id] = b.size_xyz;
  }

  // Irregular grid: every column and row of blocks gets its own lot count,
  // and one interior street in each direction is a wide avenue.
  const lotOptions = [2, 3, 3, 3, 4];
  const colLots = Array.from({ length: n }, () => pick(rand, lotOptions));
  const rowLots = Array.from({ length: n }, () => pick(rand, lotOptions));
  const avenueX = 1 + Math.floor(rand() * (n - 1));
  const avenueZ = 1 + Math.floor(rand() * (n - 1));
  const roadW = (i, av) => (i === av ? AVENUE : ROAD);

  const axis = (lots, av) => {
    const starts = [];
    const roads = []; // centre and width of each street running across this axis
    let p = 0;
    for (let i = 0; i <= n; i++) {
      const w = roadW(i, av);
      roads.push({ c: p + w / 2, w });
      p += w;
      if (i < n) { starts.push(p); p += lots[i] * LOT + 2 * SIDEWALK; }
    }
    const shift = p / 2;
    return {
      starts: starts.map((s) => s - shift),
      roads: roads.map((r) => ({ c: r.c - shift, w: r.w })),
      size: p,
    };
  };
  const ax = axis(colLots, avenueX);
  const az = axis(rowLots, avenueZ);
  const half = Math.max(ax.size, az.size) / 2;
  const maxDist = Math.hypot(ax.size / 2, az.size / 2);

  const blocks = [];
  const placements = [];
  const trees = [];
  const lamps = [];
  const cars = [];
  const yards = []; // grass patches for empty and interior lots

  // The block nearest the centre becomes a plaza.
  let plazaIdx = -1;
  let best = Infinity;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const cx = ax.starts[i] + (colLots[i] * LOT) / 2 + SIDEWALK;
    const cz = az.starts[j] + (rowLots[j] * LOT) / 2 + SIDEWALK;
    const dd = Math.hypot(cx, cz);
    if (dd < best) { best = dd; plazaIdx = i * n + j; }
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const w = colLots[i];
      const dLots = rowLots[j];
      const bx = ax.starts[i];
      const bz = az.starts[j];
      const bw = w * LOT + 2 * SIDEWALK;
      const bd = dLots * LOT + 2 * SIDEWALK;
      const cx = bx + bw / 2;
      const cz = bz + bd / 2;
      const dBlock = Math.hypot(cx, cz) / maxDist;
      let type = 'buildings';
      if (i * n + j === plazaIdx) type = 'plaza';
      else if (rand() < (dBlock > 0.6 ? 0.18 : 0.08)) type = 'park';
      blocks.push({ x: cx, z: cz, w: bw, d: bd, type });

      // Street lamps and street trees along the sidewalk ring.
      addSidewalkProps(rand, bx, bz, bw, bd, lamps, trees);

      if (type === 'park') {
        const count = Math.round((w * dLots) * range(rand, 1.5, 2.5));
        for (let k = 0; k < count; k++) {
          trees.push(tree(rand, bx + SIDEWALK + 1 + rand() * (bw - 2 * SIDEWALK - 2),
            bz + SIDEWALK + 1 + rand() * (bd - 2 * SIDEWALK - 2)));
        }
        continue;
      }
      if (type === 'plaza') {
        // A ring of trees around a central fountain.
        const r = Math.min(bw, bd) / 2 - SIDEWALK - 1;
        const count = 10;
        for (let k = 0; k < count; k++) {
          const a = (k / count) * Math.PI * 2;
          trees.push(tree(rand, cx + Math.cos(a) * r, cz + Math.sin(a) * r, 0.8));
        }
        continue;
      }

      // Buildings go on the lots around the edge of the block, facing the street.
      // Interior lots (blocks of 3 or more lots each way) become back yards.
      const lotX0 = bx + SIDEWALK;
      const lotZ0 = bz + SIDEWALK;
      const used = new Set();
      const key = (a, b) => a + ',' + b;
      const order = [];
      for (let a = 0; a < w; a++) for (let b = 0; b < dLots; b++) order.push([a, b]);
      shuffle(rand, order);

      for (const [a, b] of order) {
        if (used.has(key(a, b))) continue;
        const lx = lotX0 + LOT * (a + 0.5);
        const lz = lotZ0 + LOT * (b + 0.5);
        const edges = [];
        if (a === 0) edges.push([-1, 0]);
        if (a === w - 1) edges.push([1, 0]);
        if (b === 0) edges.push([0, -1]);
        if (b === dLots - 1) edges.push([0, 1]);
        if (edges.length === 0) {
          used.add(key(a, b));
          yards.push({ x: lx, z: lz, w: LOT, d: LOT });
          if (rand() < 0.7) trees.push(tree(rand, lx + range(rand, -1.2, 1.2), lz + range(rand, -1.2, 1.2)));
          continue;
        }
        const d = Math.hypot(lx, lz) / maxDist;
        if (rand() < emptyChance(d)) {
          used.add(key(a, b));
          yards.push({ x: lx, z: lz, w: LOT, d: LOT });
          const t = 1 + Math.floor(rand() * 3);
          for (let k = 0; k < t; k++) trees.push(tree(rand, lx + range(rand, -1.6, 1.6), lz + range(rand, -1.6, 1.6)));
          continue;
        }
        const face = pick(rand, edges);
        let cat = pickWeighted(rand, weightsFor(d));
        if (!byCat[cat]) cat = 'small';

        if (cat === 'large') {
          // Needs a free neighbour along the same street edge.
          const along = face[0] === 0 ? [1, 0] : [0, 1];
          const cands = [1, -1]
            .map((s) => [a + along[0] * s, b + along[1] * s])
            .filter(([na, nb]) => na >= 0 && na < w && nb >= 0 && nb < dLots && !used.has(key(na, nb))
              && (face[0] === 0 ? nb === b : na === a));
          if (cands.length) {
            const [na, nb] = pick(rand, cands);
            used.add(key(a, b));
            used.add(key(na, nb));
            const id = pick(rand, byCat.large);
            const [sx, , sz] = sizeOf[id];
            const depth = Math.min(sx, sz);
            const cxL = (lx + lotX0 + LOT * (na + 0.5)) / 2;
            const czL = (lz + lotZ0 + LOT * (nb + 0.5)) / 2;
            const push = Math.max(0, (LOT - depth) / 2 - 0.1); // pull toward the street
            placements.push({
              id, x: cxL + face[0] * push, z: czL + face[1] * push,
              rotation: facingToRotation(face),
              scale: range(rand, 0.95, 1.05), tint: Math.floor(rand() * 6),
            });
            continue;
          }
          cat = 'small';
        }

        used.add(key(a, b));
        const id = pick(rand, byCat[cat]);
        const [sx, , sz] = sizeOf[id];
        const scale = cat === 'tall' && d < 0.35 ? range(rand, 1.05, 1.3) : range(rand, 0.88, 1.08);
        // The model's +z side faces the street whatever the rotation, so its x size
        // always runs along the street and its z size always runs into the lot.
        const fw = sx * scale;
        const fd = sz * scale;
        const slackW = Math.max(0, (LOT - fw) / 2 - 0.15);
        const slackD = Math.max(0, (LOT - fd) / 2 - 0.15);
        const lateral = range(rand, -slackW, slackW);
        const setback = slackD * range(rand, 0.4, 1); // most buildings hug the sidewalk
        placements.push({
          id,
          x: lx + face[0] * setback + (face[0] === 0 ? lateral : 0),
          z: lz + face[1] * setback + (face[1] === 0 ? lateral : 0),
          rotation: facingToRotation(face),
          scale,
          tint: Math.floor(rand() * 6),
        });
      }
    }
  }

  // Cars: parked or driving in both lanes of every street segment between intersections.
  // Right hand traffic: the lane on each side drives the opposite way.
  const segments = [];
  for (let k = 0; k <= n; k++) {
    for (let i = 0; i < n; i++) {
      const s0 = ax.starts[i];
      const len = colLots[i] * LOT + 2 * SIDEWALK;
      segments.push({ dir: 'x', c: az.roads[k].c, w: az.roads[k].w, from: s0, to: s0 + len });
      const t0 = az.starts[i];
      const lenZ = rowLots[i] * LOT + 2 * SIDEWALK;
      segments.push({ dir: 'z', c: ax.roads[k].c, w: ax.roads[k].w, from: t0, to: t0 + lenZ });
    }
  }
  for (const s of segments) {
    for (const side of [-1, 1]) {
      const laneOffset = side * s.w / 4;
      const count = Math.floor(rand() * (s.w > ROAD ? 3 : 2.4));
      const spots = [];
      for (let k = 0; k < count; k++) {
        const t = range(rand, s.from + 1.5, s.to - 1.5);
        if (spots.some((o) => Math.abs(o - t) < 2.6)) continue;
        spots.push(t);
        const heading = side > 0 ? 0 : Math.PI; // direction of travel along the segment
        const along = s.dir === 'x' ? heading + Math.PI / 2 : heading;
        cars.push({
          x: s.dir === 'x' ? t : s.c + laneOffset,
          z: s.dir === 'x' ? s.c + laneOffset : t,
          rotation: along,
          color: Math.floor(rand() * 8),
        });
      }
    }
  }

  return {
    placements, blocks, trees, lamps, cars, yards, segments,
    roadsX: ax.roads, roadsZ: az.roads, sizeX: ax.size, sizeZ: az.size, half,
  };
}

function tree(rand, x, z, sizeBias = 1) {
  return { x, z, h: range(rand, 0.8, 1.5) * sizeBias, shade: Math.floor(rand() * 4) };
}

function addSidewalkProps(rand, bx, bz, bw, bd, lamps, trees) {
  const inset = 0.45; // distance from the curb
  const sides = [
    { x0: bx, z0: bz + inset, x1: bx + bw, z1: bz + inset, n: [0, -1] },
    { x0: bx, z0: bz + bd - inset, x1: bx + bw, z1: bz + bd - inset, n: [0, 1] },
    { x0: bx + inset, z0: bz, x1: bx + inset, z1: bz + bd, n: [-1, 0] },
    { x0: bx + bw - inset, z0: bz, x1: bx + bw - inset, z1: bz + bd, n: [1, 0] },
  ];
  for (const s of sides) {
    const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
    const steps = Math.max(1, Math.floor((len - 3) / 7));
    for (let k = 0; k <= steps; k++) {
      const t = (1.5 + (k * (len - 3)) / steps) / len;
      const x = s.x0 + (s.x1 - s.x0) * t;
      const z = s.z0 + (s.z1 - s.z0) * t;
      if (k % 2 === 0) lamps.push({ x, z, rotation: Math.atan2(s.n[0], s.n[1]) });
      else if (rand() < 0.6) trees.push({ x, z, h: range(rand, 0.6, 0.9), shade: Math.floor(rand() * 4) });
    }
  }
}

function shuffle(rand, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
