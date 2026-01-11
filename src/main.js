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
  sel.onchange = ()=>{ currentYearFilter = sel.value; if (geoLayer) geoLayer.setStyle(styleFeature); };
}

async function loadGeo() {
  const candidates = ['geojson/jp_municipalities.topojson','geojson/jp_municipalities.json','geojson/jp_municipalities.geojson', 'geojson/jp_sample.geojson'];
  for (const c of candidates) {
    try {
      const res = await fetch(c);
      if (!res.ok) continue;
      const data = await res.json();
      // If TopoJSON, convert to GeoJSON
      if (data && data.type === 'Topology') {
        if (typeof topojson === 'undefined') throw new Error('TopoJSON file detected but topojson-client is not loaded.');
        const objNames = Object.keys(data.objects || {});
        if (objNames.length === 0) throw new Error('TopoJSON has no objects');
        const objName = objNames[0];
        const gj = topojson.feature(data, data.objects[objName]);
        console.log('Loaded topojson and converted to geojson:', c, 'object:', objName);
        return gj;
      }
      // If already GeoJSON FeatureCollection or Feature
      if (data && (data.type === 'FeatureCollection' || data.type === 'Feature' || data.features)) {
        console.log('Loaded geojson:', c);
        return data;
      }
      console.warn('Unknown geo data format in', c);
    } catch (e) {
      // try next candidate
    }
  }
  throw new Error('No geojson found in geojson/ folder');
} 

function getFeatureId(p) {
  return p && (p.N03_007 || p.N03_003 || p.N03_004 || p.id || p.code || p.CITYCODE || p.name) || null;
}
function getFeatureName(p) {
  return p && (p.N03_004 || p.N03_003 || p.name || p.NAME) || 'Unnamed';
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
  geoLayer.resetStyle(layer);
  layer.closeTooltip();
}

function zoomToFeature(e) {
  map.fitBounds(e.target.getBounds());
}

async function renderGeo() {
  const gj = await loadGeo();
  await loadVisits();
  populateYearFilter(VISITS_DATA || {});
  if (geoLayer) geoLayer.remove();
  geoLayer = L.geoJSON(gj, { style: styleFeature, onEachFeature }).addTo(map);
}

renderGeo();
