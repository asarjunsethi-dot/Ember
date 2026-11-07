# Ember

## City viewer

A three.js scene that lays out the voxel buildings from `assets/manifest.json` on a street grid.

```bash
npm install
npm run dev
```

Open the printed local address.

The site is published to GitHub Pages by `.github/workflows/pages.yml` on every push to the working branch. Add `?seed=<number>` to the address for a specific layout, or use the Build and Random buttons.

- `city/layout.js` decides placement. It has no three.js code, so it can run in Node. Each seed gives a 5 by 5 grid of blocks with random sizes (2 to 4 lots of 5 units each way) and one wide avenue in each direction. The block nearest the centre is a plaza with a fountain, and some blocks become parks, more often toward the edge. Buildings line the edge of each block facing the street, with tall ones weighted toward the centre and tiny ones and empty lots toward the outskirts. Each building gets a small random scale, setback and colour tint. Street trees, lamps and cars are placed too.
- Without `?seed=` in the address, every visit builds a new random city.
- `city/main.js` loads the models, builds the ground and roads, and renders.
- Assets are served from `assets/`. See `assets/README.md`.
