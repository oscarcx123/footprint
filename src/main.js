const map = L.map('map', { zoomControl: false }).setView([36, 138], 5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap'
}).addTo(map);

// Visits data: prefer build-time `VISITS` if present, otherwise fetch `data/visits.json` at runtime
let VISITS_DATA = (typeof VISITS !== 'undefined') ? VISITS : null;
let currentYearFilter = 'all';
let geoLayer = null;

async function loadVisits() {
  if (VISITS_DATA) return VISITS_DATA;
  try {
    const res = await fetch('data/visits.json');
    if (res.ok) VISITS_DATA = await res.json();
    else VISITS_DATA = {};
  } catch (e) { VISITS_DATA = {}; }
  return VISITS_DATA;
}

function populateYearFilter(visits) {
  const sel = document.getElementById('yearFilter');
  if (!sel) return;
  const years = new Set();
  for (const k in visits) {
    const v = visits[k];
    const dates = getVisitDates(v);
    for (const d of dates) if (d && /^\d{4}/.test(d)) years.add(d.slice(0,4));
  }
  const arr = Array.from(years).sort();
  while (sel.options.length > 1) sel.remove(1);
  arr.forEach(y => { const o = document.createElement('option'); o.value = y; o.textContent = y; sel.appendChild(o); });
  sel.value = currentYearFilter;
  sel.onchange = ()=>{ currentYearFilter = sel.value; for (const id of Object.keys(countryLayers)) if (map.hasLayer(countryLayers[id])) countryLayers[id].setStyle(styleFeature); };
}

async function loadGeo() {
  // Attempt to load an optional manifest for available geo sources. The manifest should be an array of objects like:
  // [{"id":"jp","name":"日本","file":"jp_municipalities.topojson"}, {"id":"cn","name":"中国","file":"cn_municipalities.topojson"}]
  let sources = null;
  try {
    const mr = await fetch('geojson/manifest.json');
    if (mr.ok) sources = await mr.json();
  } catch(e) {
    // manifest optional - ignore errors
  }
  // Fallback built-in candidates (tries jp and cn automatically)
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
      // If TopoJSON, convert to GeoJSON
      let gj = null;
      if (data && data.type === 'Topology') {
        if (typeof topojson === 'undefined') throw new Error('TopoJSON file detected but topojson-client is not loaded.');
        const objNames = Object.keys(data.objects || {});
        if (objNames.length === 0) throw new Error('TopoJSON has no objects');
        const objName = objNames[0];
        gj = topojson.feature(data, data.objects[objName]);
        console.log('Loaded topojson and converted to geojson:', s.file, 'object:', objName);
      } else if (data && (data.type === 'FeatureCollection' || data.type === 'Feature' || data.features)) {
        gj = data;
        console.log('Loaded geojson:', s.file);
      }
      if (gj) {
        // Tag features with country id for filtering and future extensibility
        if (gj.type === 'FeatureCollection' && Array.isArray(gj.features)) {
          gj.features.forEach(f => { if (!f.properties) f.properties = {}; f.properties._country = s.id; });
        }
        found.push({ id: s.id, name: s.name, file: s.file, geojson: gj });
      }
    } catch (e) {
      // skip
    }
  }
  if (found.length === 0) throw new Error('No geojson/topojson found (looked for manifest or known files)');
  return found;
}

function populateCountryFilter(sources) {
  const sel = document.getElementById('countryFilter');
  if (!sel) return;
  
  // Clear existing (except first '全部')
  while (sel.options.length > 1) sel.remove(1);
  sources.forEach(s => {
    const o = document.createElement('option'); o.value = s.id; o.textContent = s.name || s.id; sel.appendChild(o);
  });
  sel.onchange = ()=>{ currentCountryFilter = sel.value; updateVisibleLayers(); };
  sel.value = currentCountryFilter;
}

let currentCountryFilter = 'all';
const countryLayers = {}; // id -> L.GeoJSON layer
let displayedCountryIds = new Set();

function updateVisibleLayers() {
  // Remove all currently displayed country layers
  for (const id of Object.keys(countryLayers)) {
    const layer = countryLayers[id];
    if (map.hasLayer(layer)) map.removeLayer(layer);
  }
  displayedCountryIds.clear();
  if (currentCountryFilter === 'all') {
    for (const id of Object.keys(countryLayers)) { map.addLayer(countryLayers[id]); displayedCountryIds.add(id); }
  } else {
    if (countryLayers[currentCountryFilter]) { map.addLayer(countryLayers[currentCountryFilter]); displayedCountryIds.add(currentCountryFilter); }
  }
  // Recompute bounds to fit visible layers
  const group = L.featureGroup(Array.from(displayedCountryIds).map(id=>countryLayers[id]));
  if (group && group.getLayers().length) map.fitBounds(group.getBounds());
  // Update styles for visible country layers
  for (const id of Array.from(displayedCountryIds)) if (countryLayers[id]) countryLayers[id].setStyle(styleFeature);
}

async function renderGeo() {
  const sources = await loadGeo();
  await loadVisits();
  populateYearFilter(VISITS_DATA || {});
  populateCountryFilter(sources);
  // Remove any previous layers
  if (geoLayer) { geoLayer.remove(); geoLayer = null; }
  for (const s of sources) {
    const layer = L.geoJSON(s.geojson, { style: styleFeature, onEachFeature }).addTo(map);
    countryLayers[s.id] = layer;
  }
  updateVisibleLayers();
}

function getFeatureId(p) {
  return p && (p.N03_007 || p.N03_003 || p.N03_004 || p.id || p.code || p.CITYCODE || p.name) || null;
}
function getFeatureName(p) {
  if (!p) return 'Unnamed';
  // Prefer `fullname` for Chinese topojson features (marked with _country = 'cn')
  if (p._country === 'cn' && p.fullname) return p.fullname;
  return p.N03_004 || p.N03_003 || p.name || p.NAME || 'Unnamed';
}

// Normalize visit record: accept {date: 'YYYY-MM'} or {dates: ['YYYY-MM', ...]} and return array of date strings
function getVisitDates(visit) {
  if (!visit) return [];
  if (Array.isArray(visit.dates)) return visit.dates.filter(Boolean);
  if (typeof visit.date === 'string' && visit.date) return [visit.date];
  return [];
}

// Determine whether a visit record should count as visited for the currently selected year filter
function isVisitedForFilter(visit) {
  if (!visit) return false;
  const dates = getVisitDates(visit);
  if (dates.length > 0) {
    if (currentYearFilter === 'all') return true;
    return dates.some(d => d && d.startsWith(currentYearFilter));
  }
  // If there are no explicit dates, consider it "visited" when not filtering by year
  return currentYearFilter === 'all' && (visit.name || visit.note);
}

function styleFeature(feature) {
  const id = getFeatureId(feature.properties || {});
  const visit = (VISITS_DATA && id) ? VISITS_DATA[id] : null;
  const isVisited = isVisitedForFilter(visit);
  const color = isVisited ? '#d9534f' : '#3388ff';
  return {
    color: color,
    weight: 1,
    fillColor: color,
    fillOpacity: isVisited ? 0.6 : 0.12,
    opacity: 1
  };
}

function onEachFeature(feature, layer) {
  layer.on({
    mouseover(e) { highlightFeature(e); },
    mouseout(e) { resetHighlight(e); },
    click(e) { zoomToFeature(e); }
  });
}

function highlightFeature(e) {
  const layer = e.target;
  // stronger border and visible fill highlight; bring to front for visibility
  layer.setStyle({ weight: 2, fillOpacity: 0.8 });
  if (layer.bringToFront) layer.bringToFront();
  const p = layer.feature.properties || {};
  const id = getFeatureId(p);
  const visit = (VISITS_DATA && id) ? VISITS_DATA[id] : null;
  const dates = getVisitDates(visit);
  const note = visit ? (visit.note || '') : '';
  const noteHtml = note ? note.replace(/\n/g, '<br/>') : '';
  const title = getFeatureName(p);
  let content = `<b>${title}</b><br/>`;
  if (dates.length) content += 'Visited: ' + dates.join(', ') + '<br/>';
  else if (visit && (visit.name || visit.note)) content += 'Visited<br/>';
  else content += 'Not visited<br/>';
  content += noteHtml;
  layer.bindTooltip(content, { permanent: false, direction: 'auto' }).openTooltip();
} 

function resetHighlight(e) {
  const layer = e.target;
  const p = layer.feature && layer.feature.properties;
  const cid = p && p._country;
  if (cid && countryLayers[cid] && countryLayers[cid].resetStyle) {
    countryLayers[cid].resetStyle(layer);
  } else {
    // fallback: attempt to set style based on feature again
    layer.setStyle(styleFeature(layer.feature));
  }
  layer.closeTooltip();
}

function zoomToFeature(e) {
  map.fitBounds(e.target.getBounds());
}

// Start rendering multi-country geo data
renderGeo();
