# Map-tile fixtures

Static OpenStreetMap raster tiles served by the e2e tile mock
(`e2e/mock-routes.js`) so map screenshots show a real rendered map while the
suite stays hermetic — no request leaves the test runner.

- Files are named `{z}-{x}-{y}.png`, matching the standard slippy-map tile
  scheme (the `{a,b,c}` load-balancing subdomain is ignored).
- A tile coordinate with no fixture is served as a solid pale-green
  placeholder and recorded in `test-results/missing-tiles.log`; run
  `node scripts/fetch-map-tiles.mjs` and re-run the suite to backfill after
  a viewport/fixture/fit change.

**Attribution:** tile imagery © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors, used under ODbL as test fixtures; the rendered UI in every
screenshot carries the standard OSM attribution control.
