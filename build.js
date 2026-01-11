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
['index.html','src/main.js'].forEach(p => { try { copy(p); } catch (e) { /* ignore missing optional files */ } });

// Recursively copy geojson/ folder if present
const geoSrcDir = path.join(__dirname, 'geojson');
function copyDir(srcDir, dstDir) {
  if (!fs.existsSync(srcDir)) return;
  if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    const srcPath = path.join(srcDir, name);
    const dstPath = path.join(dstDir, name);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) copyDir(srcPath, dstPath);
    else fs.copyFileSync(srcPath, dstPath);
  }
}
copyDir(geoSrcDir, path.join(outDir, 'geojson'));
// Also copy optional manifest.json alongside
try { copy('geojson/manifest.json'); } catch (e) { /* ignore */ }


console.log('Built to dist/');
