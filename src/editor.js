const map = L.map('map', { zoomControl: true }).setView([36, 138], 5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap'
}).addTo(map);

let VISITS_EDITOR = {};
let gjData = null;
let geoLayer = null;
let currentFeature = null;

function getFeatureId(p) {
  return p && (p.N03_007 || p.N03_003 || p.N03_004 || p.id || p.code || p.CITYCODE || p.name) || null;
}
function getFeatureName(p) {
  if (!p) return 'Unnamed';
  // Prefer `fullname` for Chinese topojson features (marked with _country = 'cn')
  if (p._country === 'cn' && p.fullname) return p.fullname;
  return p.N03_004 || p.N03_003 || p.name || p.NAME || 'Unnamed';
}

async function loadVisits() {
  const res = await fetch('data/visits.json');
  if (!res.ok) return {};
  return await res.json();
}

async function loadGeo() {
  // Load an optional manifest like: [{"id":"jp","name":"日本","file":"jp_municipalities.topojson"},{"id":"cn","name":"中国","file":"cn_municipalities.topojson"}]
  let sources = null;
  try {
    const mr = await fetch('geojson/manifest.json');
    if (mr.ok) sources = await mr.json();
  } catch(e) { /* ignore */ }
  const fallback = [
    {id:'jp', name:'日本', file:'geojson/jp_municipalities.topojson'},
    {id:'cn', name:'中国', file:'geojson/cn_municipalities.topojson'}
  ];
  const tried = sources && Array.isArray(sources) ? sources.map(s => ({id:s.id||s.name, name:s.name||s.id, file:'geojson/'+(s.file||s.path||s.file)})) : fallback;
  const found = [];
  for (const s of tried) {
    try {
      const res = await fetch(s.file);
      if (!res.ok) continue;
      const data = await res.json();
      let gj = null;
      if (data && data.type === 'Topology') {
        if (typeof topojson === 'undefined') throw new Error('TopoJSON file detected but topojson-client is not loaded.');
        const objNames = Object.keys(data.objects || {});
        if (objNames.length === 0) throw new Error('TopoJSON has no objects');
        const objName = objNames[0];
        gj = topojson.feature(data, data.objects[objName]);
      } else if (data && (data.type === 'FeatureCollection' || data.type === 'Feature' || data.features)) {
        gj = data;
      }
      if (gj && gj.type === 'FeatureCollection' && Array.isArray(gj.features)) {
        gj.features.forEach(f => { if (!f.properties) f.properties = {}; f.properties._country = s.id; });
        found.push({ id: s.id, name: s.name, file: s.file, geojson: gj });
      }
    } catch (e) {
      // ignore
    }
  }
  if (found.length === 0) throw new Error('No geojson/topojson found (looked for manifest or known files)');
  return found;
}

function populateCountryFilter(sources) {
  const sel = document.getElementById('countryFilterEditor');
  if (!sel) return;
  while (sel.options.length > 1) sel.remove(1);
  sources.forEach(s => { const o = document.createElement('option'); o.value = s.id; o.textContent = s.name || s.id; sel.appendChild(o); });
  sel.onchange = ()=>{ currentCountryFilter = sel.value; updateVisibleLayers(); };
  sel.value = currentCountryFilter;
}

let currentCountryFilter = 'all';
const countryLayers = {}; // id -> L.GeoJSON layer
let displayedCountryIds = new Set();

function updateVisibleLayers() {
  for (const id of Object.keys(countryLayers)) { const layer = countryLayers[id]; if (map.hasLayer(layer)) map.removeLayer(layer); }
  displayedCountryIds.clear();
  if (currentCountryFilter === 'all') { for (const id of Object.keys(countryLayers)) { map.addLayer(countryLayers[id]); displayedCountryIds.add(id); } } else { if (countryLayers[currentCountryFilter]) { map.addLayer(countryLayers[currentCountryFilter]); displayedCountryIds.add(currentCountryFilter); } }
  // Recompute bounds
  const group = L.featureGroup(Array.from(displayedCountryIds).map(id=>countryLayers[id]));
  if (group && group.getLayers().length) map.fitBounds(group.getBounds());
  for (const id of Array.from(displayedCountryIds)) if (countryLayers[id]) countryLayers[id].setStyle(styleForFeature);
}

async function init() {
  const sources = await loadGeo();
  VISITS_EDITOR = await loadVisits();
  populateCountryFilter(sources);
  // create layers for each source
  for (const s of sources) {
    const layer = L.geoJSON(s.geojson, { style: styleForFeature, onEachFeature: (feature, layer)=>{ layer.on({ click: onFeatureClick, mouseover: highlightOnHover, mouseout: resetOnLeave }); }}).addTo(map);
    countryLayers[s.id] = layer;
  }
  updateVisibleLayers();
}

document.getElementById('close').addEventListener('click', ()=>{
  document.getElementById('editor-panel').style.display = 'none';
  document.getElementById('save-status').style.display = 'none';
});


function onFeatureClick(e) {
  const layer = e.target;
  const props = layer.feature.properties || {};
  const id = getFeatureId(props);
  currentFeature = { id, props };
  const visit = VISITS_EDITOR[id] || {};
  document.getElementById('panel-title').textContent = `${getFeatureName(props)} (${id})`;
  document.getElementById('field-name').value = visit.name || getFeatureName(props) || '';
  document.getElementById('field-dates').value = (visit.dates || []).join(',');
  document.getElementById('field-note').value = visit.note || '';
  document.getElementById('editor-panel').style.display = 'block';
}

function highlightOnHover(e) {
  const layer = e.target;
  layer.setStyle({ weight: 2, fillOpacity: 0.8 });
  if (layer.bringToFront) layer.bringToFront();
  const props = layer.feature.properties || {};
  const id = getFeatureId(props);
  const visit = VISITS_EDITOR[id] || {};
  const dates = Array.isArray(visit.dates) ? visit.dates : (visit.date ? [visit.date] : []);
  const note = visit.note || '';
  const noteHtml = note ? note.replace(/\n/g, '<br/>') : '';
  const title = getFeatureName(props);
  let content = `<b>${title}</b><br/>`;
  if (dates.length) content += 'Visited: ' + dates.join(', ') + '<br/>';
  else if (visit && (visit.name || visit.note)) content += 'Visited<br/>';
  else content += 'Not visited<br/>';
  content += noteHtml;
  layer.bindTooltip(content, { permanent: false, direction: 'auto' }).openTooltip();
}
function resetOnLeave(e) { const layer = e.target; const p = layer.feature && layer.feature.properties; const cid = p && p._country; if (cid && countryLayers[cid] && countryLayers[cid].resetStyle) countryLayers[cid].resetStyle(layer); else layer.setStyle(styleForFeature(layer.feature)); layer.closeTooltip(); }

function styleForFeature(feature) {
  const id = getFeatureId(feature.properties || {});
  const visit = VISITS_EDITOR[id] || null;
  const dates = visit ? (Array.isArray(visit.dates) ? visit.dates : (visit.date ? [visit.date] : [])) : [];
  const isVisited = dates.length > 0 || (visit && (visit.name || visit.note));
  const color = isVisited ? '#d9534f' : '#3388ff';
  return { color: color, weight: 1, fillColor: color, fillOpacity: isVisited ? 0.6 : 0.12, opacity:1 };
}



document.getElementById('save').addEventListener('click', async ()=>{
  if (!currentFeature) return;
  const id = currentFeature.id;
  const name = document.getElementById('field-name').value.trim();
  const dates = document.getElementById('field-dates').value.split(',').map(s=>s.trim()).filter(Boolean);
  const note = document.getElementById('field-note').value.trim();
  // If user cleared both dates and note, treat this as deletion of the visit entry
  if (dates.length === 0 && (!note || note === '')) {
    if (VISITS_EDITOR.hasOwnProperty(id)) delete VISITS_EDITOR[id];
  } else {
    VISITS_EDITOR[id] = { name, dates, note };
  }
  // send to local server
  try {
    const res = await fetch('/save-visits', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(VISITS_EDITOR) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const r = await res.json();
    // Show different messages when deletion happened
    if (!VISITS_EDITOR.hasOwnProperty(id)) {
      document.getElementById('save-status').textContent = '已删除';
      document.getElementById('editor-panel').style.display = 'none';
    } else {
      document.getElementById('save-status').textContent = '已保存';
    }
    document.getElementById('save-status').style.display = 'block';
    // update styles on map in case user wants immediate feedback
    for (const id of Array.from(displayedCountryIds)) if (countryLayers[id]) countryLayers[id].setStyle(styleForFeature);
  } catch (e) {
    alert('保存失败: ' + e.message + '\n请确认已通过 `node scripts/editor_server.js` 启动本地服务器。');
  }
});

init();
