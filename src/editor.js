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
  return p && (p.N03_004 || p.N03_003 || p.name || p.NAME) || 'Unnamed';
}

async function loadVisits() {
  const res = await fetch('data/visits.json');
  if (!res.ok) return {};
  return await res.json();
}

async function loadGeo() {
  // Try standard GeoJSON / TopoJSON first (no modified variant)
  let res = await fetch('geojson/jp_municipalities.topojson');
  if (!res.ok) {
    res = await fetch('geojson/jp_municipalities.json');
    if (!res.ok) throw new Error('No geojson');
  }
  const data = await res.json();
  if (data && data.type === 'Topology') {
    if (typeof topojson === 'undefined') throw new Error('TopoJSON file detected but topojson-client is not loaded.');
    const objName = Object.keys(data.objects || {})[0];
    if (!objName) throw new Error('TopoJSON has no objects');
    return topojson.feature(data, data.objects[objName]);
  }
  return data;
}

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
function resetOnLeave(e) { geoLayer.resetStyle(e.target); e.target.closeTooltip(); }

function styleForFeature(feature) {
  const id = getFeatureId(feature.properties || {});
  const visit = VISITS_EDITOR[id] || null;
  const dates = visit ? (Array.isArray(visit.dates) ? visit.dates : (visit.date ? [visit.date] : [])) : [];
  const isVisited = dates.length > 0 || (visit && (visit.name || visit.note));
  const color = isVisited ? '#d9534f' : '#3388ff';
  return { color: color, weight: 1, fillColor: color, fillOpacity: isVisited ? 0.6 : 0.12, opacity:1 };
}

function createGeoLayer(gj) {
  if (geoLayer) geoLayer.remove();
  geoLayer = L.geoJSON(gj, {
    style: styleForFeature,
    onEachFeature: (feature, layer) => {
      layer.on({ click: onFeatureClick, mouseover: highlightOnHover, mouseout: resetOnLeave });
    }
  }).addTo(map);
}

async function init() {
  gjData = await loadGeo();
  VISITS_EDITOR = await loadVisits();
  createGeoLayer(gjData);
}

document.getElementById('close').addEventListener('click', ()=>{
  document.getElementById('editor-panel').style.display = 'none';
  document.getElementById('save-status').style.display = 'none';
});

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
    if (geoLayer) geoLayer.setStyle(styleForFeature);
  } catch (e) {
    alert('保存失败: ' + e.message + '\n请确认已通过 `node scripts/editor_server.js` 启动本地服务器。');
  }
});

init();
