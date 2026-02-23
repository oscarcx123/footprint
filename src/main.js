const DEFAULT_CENTER = [36, 115];
const DEFAULT_ZOOM = 4;
// Whether to auto-fit bounds on initial render. Set to false to preserve default view and avoid map "flash".
const AUTO_FIT_ON_LOAD = false;
let _firstUpdate = true;

const PREFECTURE_ZOOM_THRESHOLD = 7; // zoom < 7 => show prefecture layer; >=7 => show municipalities

const map = L.map('map', { zoomControl: false }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
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
  sel.onchange = ()=>{ currentYearFilter = sel.value; recomputeVisitedPrefectures(); for (const id of Object.keys(countryLayers)) if (map.hasLayer(countryLayers[id])) { if (id.endsWith('_pref')) countryLayers[id].setStyle(stylePrefectureFeature); else countryLayers[id].setStyle(styleFeature); } };
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

  const fetchAndConvert = async (s) => {
    try {
      const res = await fetch(s.file);
      if (!res.ok) return null;
      const data = await res.json();
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
      if (gj && gj.type === 'FeatureCollection' && Array.isArray(gj.features)) {
        gj.features.forEach(f => { if (!f.properties) f.properties = {}; f.properties._country = s.id; });
        return { id: s.id, name: s.name, file: s.file, geojson: gj };
      }
    } catch (e) {
      // ignore per-file errors
    }
    return null;
  };

  // Kick off all top-level source fetches in parallel
  const sourcePromises = tried.map(s => fetchAndConvert(s));

  // Also attempt to fetch JP prefecture topojson in parallel (optional)
  const prefPromise = (async () => {
    try {
      const prefRes = await fetch('geojson/jp_prefecture.topojson');
      if (!prefRes.ok) return null;
      const prefData = await prefRes.json();
      let gjpref = null;
      if (prefData && prefData.type === 'Topology') {
        if (typeof topojson === 'undefined') throw new Error('TopoJSON file detected but topojson-client is not loaded.');
        const names = Object.keys(prefData.objects || {});
        if (names.length) gjpref = topojson.feature(prefData, prefData.objects[names[0]]);
      } else if (prefData && (prefData.type === 'FeatureCollection' || prefData.type === 'Feature' || prefData.features)) {
        gjpref = prefData;
      }
      if (gjpref && gjpref.type === 'FeatureCollection' && Array.isArray(gjpref.features)) {
        gjpref.features.forEach(f => { if (!f.properties) f.properties = {}; f.properties._country = 'jp_pref'; f.properties._layerType = 'prefecture'; });
        return { id: 'jp_pref', name: '日本（县）', file: 'geojson/jp_prefecture.topojson', geojson: gjpref };
      }
    } catch (e) {
      // ignore optional prefecture file errors
    }
    return null;
  })();

  const results = await Promise.all([...sourcePromises, prefPromise]);
  const found = results.filter(r => r);
  if (found.length === 0) throw new Error('No geojson/topojson found (looked for manifest or known files)');
  return found;
}

function populateCountryFilter(sources) {
  const sel = document.getElementById('countryFilter');
  if (!sel) return;
  
  // Clear existing (except first '全部')
  while (sel.options.length > 1) sel.remove(1);
  // Skip internal layers like 'jp_pref' – those are toggled by zoom
  sources.filter(s => !s.id.endsWith('_pref')).forEach(s => {
    const o = document.createElement('option'); o.value = s.id; o.textContent = s.name || s.id; sel.appendChild(o);
  });
  sel.onchange = ()=>{ currentCountryFilter = sel.value; updateVisibleLayers(); };
  sel.value = currentCountryFilter;
}

let currentCountryFilter = 'all';
const countryLayers = {}; // id -> L.GeoJSON layer
let displayedCountryIds = new Set();

// JP municipality -> prefecture name mapping (built when JP municipalities are loaded)
const municipalityToPrefecture = {};
let visitedPrefectures = new Set();

function recomputeVisitedPrefectures() {
  visitedPrefectures.clear();
  if (!VISITS_DATA) return;
  for (const mid of Object.keys(VISITS_DATA)) {
    const visit = VISITS_DATA[mid];
    if (!isVisitedForFilter(visit)) continue;
    const pref = municipalityToPrefecture[mid];
    if (pref) visitedPrefectures.add(pref);
  }
}

function stylePrefectureFeature(feature) {
  const p = feature.properties || {};
  const prefName = p.N03_001 || p.name || p.NAME || null;
  const isVisited = prefName && visitedPrefectures.has(prefName);
  const color = isVisited ? '#d9534f' : '#3388ff';
  return {
    color: color,
    weight: 1,
    fillColor: color,
    fillOpacity: isVisited ? 0.6 : 0.12,
    opacity: 1
  };
}

function updateVisibleLayers(skipFit) {
  skipFit = !!skipFit;
  // Remove all currently displayed country layers
  for (const id of Object.keys(countryLayers)) {
    const layer = countryLayers[id];
    if (map.hasLayer(layer)) map.removeLayer(layer);
  }
  displayedCountryIds.clear();

  const addCountry = (id) => {
    if (id === 'jp') {
      // choose between municipality layer ('jp') and prefecture layer ('jp_pref') based on zoom
      const jpLayerId = (map.getZoom() < PREFECTURE_ZOOM_THRESHOLD && countryLayers['jp_pref']) ? 'jp_pref' : 'jp';
      if (countryLayers[jpLayerId]) { map.addLayer(countryLayers[jpLayerId]); displayedCountryIds.add(jpLayerId); }
    } else {
      if (countryLayers[id]) { map.addLayer(countryLayers[id]); displayedCountryIds.add(id); }
    }
  };

  if (currentCountryFilter === 'all') {
    // add base countries (skip internal '_pref' layers)
    for (const id of Object.keys(countryLayers)) {
      if (id.endsWith('_pref')) continue;
      addCountry(id);
    }
  } else {
    addCountry(currentCountryFilter);
  }

  // Recompute bounds to fit visible layers (skip on first render if configured)
  const group = L.featureGroup(Array.from(displayedCountryIds).map(id=>countryLayers[id]));
  if (group && group.getLayers().length) {
    if ((!_firstUpdate || AUTO_FIT_ON_LOAD) && !skipFit) {
      map.fitBounds(group.getBounds());
    }
  }
  _firstUpdate = false;

  // Update styles for visible country layers
  for (const id of Array.from(displayedCountryIds)) {
    if (!countryLayers[id]) continue;
    if (id.endsWith('_pref')) countryLayers[id].setStyle(stylePrefectureFeature);
    else countryLayers[id].setStyle(styleFeature);
  }
}

// Update JP layer visibility on zoom changes (switch municipality <-> prefecture)
// Pass skipFit=true so changing zoom level does not trigger fitBounds and reset the view
map.on('zoomend', ()=>{ updateVisibleLayers(true); });

async function renderGeo() {
  const sources = await loadGeo();
  await loadVisits();
  populateYearFilter(VISITS_DATA || {});
  populateCountryFilter(sources);
  // Remove any previous layers
  if (geoLayer) { geoLayer.remove(); geoLayer = null; }
  // Clear existing country layers
  for (const k of Object.keys(countryLayers)) { if (countryLayers[k]) { countryLayers[k].remove(); } delete countryLayers[k]; }
  // Clear municipality->pref mapping
  for (const k of Object.keys(municipalityToPrefecture)) delete municipalityToPrefecture[k];
  visitedPrefectures.clear();

  for (const s of sources) {
    // Prefecture layers are tagged with id ending in '_pref'
    if (s.id && s.id.endsWith('_pref')) {
      const layer = L.geoJSON(s.geojson, { style: stylePrefectureFeature, onEachFeature }).addTo(map);
      countryLayers[s.id] = layer;
    } else {
      const layer = L.geoJSON(s.geojson, { style: styleFeature, onEachFeature }).addTo(map);
      countryLayers[s.id] = layer;
      // If this is JP municipalities, build municipality->prefecture mapping
      if (s.id === 'jp' && s.geojson && Array.isArray(s.geojson.features)) {
        for (const f of s.geojson.features) {
          const mid = getFeatureId(f.properties || {});
          const pref = (f.properties && (f.properties.N03_001 || f.properties.N03_003 || f.properties.prefecture || f.properties.name)) || null;
          if (mid && pref) municipalityToPrefecture[mid] = pref;
        }
      }
    }
  }

  // Compute prefecture-level visited state from municipality visits
  recomputeVisitedPrefectures();

  updateVisibleLayers();
}

function getFeatureId(p) {
  return p && (p.N03_007 || p.N03_003 || p.N03_004 || p.id || p.code || p.CITYCODE || p.name) || null;
}
function getFeatureName(p) {
  if (!p) return 'Unnamed';
  // Prefer `fullname` for Chinese topojson
  if (p._country === 'cn' && p.fullname) return p.fullname;
  // Prefer `N03_001` for Japanese Prefecture topojson
  if (p._country === 'jp_pref' && p.N03_001) return p.N03_001;
  // For Japanese municipalities, N03_004 (市区町村) is preferred. For 政令指定都市, N03_004 is null so use N03_003 instead. Notes: Usually N03_001 (都道府県), N03_002 (振興局 in 北海道) and N03_003 (郡) are not used.
  if (p._country === 'jp') return p.N03_004 || p.N03_003;
  // This is a fallback for other cases
  return 'Unnamed';
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
  const title = getFeatureName(p);
  let content = `<b>${title}</b><br/>`;
  // Prefecture-level tooltip (derived visits)
  if (p._layerType === 'prefecture') {
    const prefName = p.N03_001 || p.name || p.NAME || null;
    const isVisitedPref = prefName && visitedPrefectures.has(prefName);
    if (isVisitedPref) content += 'Visited<br/>';
    else content += 'Not visited<br/>';
  } else {
    const id = getFeatureId(p);
    const visit = (VISITS_DATA && id) ? VISITS_DATA[id] : null;
    const allDates = getVisitDates(visit);
    const note = visit ? (visit.note || '') : '';
    const noteHtml = note ? note.replace(/\n/g, '<br/>') : '';
    // Apply current year filter when present
    const yf = (typeof currentYearFilter !== 'undefined') ? currentYearFilter : 'all';
    const dates = (yf === 'all') ? allDates.slice() : allDates.filter(d => d && d.startsWith(yf));

    if (dates.length) {
      if (dates.length >= 4) {
        const middleCount = dates.length - 2;
        content += 'Visited: ' + dates[0] + ', (' + middleCount + ' more), ' + dates[dates.length-1] + '<br/>';
      } else {
        content += 'Visited: ' + dates.join(', ') + '<br/>';
      }
    } else if (visit && (visit.name || visit.note)) {
      content += 'Visited<br/>';
    } else content += 'Not visited<br/>';
    content += noteHtml;
  }
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
    if (p && p._layerType === 'prefecture') layer.setStyle(stylePrefectureFeature(layer.feature));
    else layer.setStyle(styleFeature(layer.feature));
  }
  layer.closeTooltip();
}

function zoomToFeature(e) {
  map.fitBounds(e.target.getBounds());
}

// Start rendering multi-country geo data
renderGeo();
