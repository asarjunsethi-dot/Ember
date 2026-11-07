# Ember

## City viewer

A three.js scene that lays out the voxel buildings from `assets/manifest.json` on a street grid.

```bash
npm install
npm run dev
```

Open the printed local address.

The site is published to GitHub Pages by `.github/workflows/pages.yml` on every push to the working branch. Add `?seed=<number>` to the address for a specific layout, or use the Build and Random buttons.

- `city/layout.js` decides placement. It has no three.js code, so it can run in Node. The grid is 4 by 4 blocks, each block is 2 by 2 lots of 5 units, and roads are 4 units wide. Tall buildings are weighted toward the centre and tiny ones toward the edges. The large building takes a whole row of a block.
- `city/main.js` loads the models, builds the ground and roads, and renders.
- Assets are served from `assets/`. See `assets/README.md`.
