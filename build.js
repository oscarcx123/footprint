const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'dist');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

// Copy data/visits.json to the dist folder (serve as a static JSON file)
const dataSrc = path.join(__dirname, 'data', 'visits.json');
const dataDstDir = path.join(outDir, 'data');
if (!fs.existsSync(dataDstDir)) fs.mkdirSync(dataDstDir, { recursive: true });
try { fs.copyFileSync(dataSrc, path.join(dataDstDir, 'visits.json')); } catch (e) { /* ignore missing data */ }

// copy static files
const copy = (p) => {
  const src = path.join(__dirname, p);
  const dst = path.join(outDir, p);
  const dir = path.dirname(dst);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, dst);
};

// Stop shipping the local editor (it's been removed) and ensure the GeoJSON/TopoJSON is copied
['index.html','src/main.js','geojson/jp_municipalities.topojson','geojson/jp_municipalities.json','geojson/jp_municipalities.geojson','geojson/jp_sample.geojson'].forEach(p => {
  try { copy(p); } catch (e) { /* ignore missing optional files */ }
});

console.log('Built to dist/');
