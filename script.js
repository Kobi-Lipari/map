const mapWidth = 8192;
const mapHeight = 5966;

const rows = 7;
const cols = 7;
const pieceWidth = mapWidth / cols;
const pieceHeight = mapHeight / rows;
const overlap = 1;

const imageUrls = [
  /*G1*/'https://i.imgur.com/kecSCl7.png',
  /*G2*/'https://i.imgur.com/4p7CSvu.png',
  /*G3*/'https://i.imgur.com/qJRiopu.png',
  /*G4*/'https://i.imgur.com/FGaeVDP.png',
  /*G5*/'https://i.imgur.com/yXfneGu.png',
  /*G6*/'https://i.imgur.com/btGHWGI.png',
  /*G7*/'https://i.imgur.com/yXhFlRh.png',

  /*F1*/'https://i.imgur.com/8JPrZgf.png',
  /*F2*/'https://i.imgur.com/HvpDNtM.jpeg',
  /*F3*/'https://i.imgur.com/9oX4cKv.png',
  /*F4*/'https://i.imgur.com/MP9g6MS.png',
  /*F5*/'https://i.imgur.com/slb03iz.png',
  /*F6*/'https://i.imgur.com/AORPOKP.png',
  /*F7*/'https://i.imgur.com/sN4XGl3.png',

  /*E1*/'https://i.imgur.com/6n8hCUc.png',
  /*E2*/'https://i.imgur.com/cvsnprm.png',
  /*E3*/'https://i.imgur.com/Qg8rWT2.jpeg',
  /*E4*/'https://i.imgur.com/bb55c7u.png',
  /*E5*/'https://i.imgur.com/YDq6Pf4.jpeg',
  /*E6*/'https://i.imgur.com/3zzg0EQ.png',
  /*E7*/'https://i.imgur.com/THeS9GE.png',

  /*D1*/'https://i.imgur.com/cpYiRpJ.png',
  /*D2*/'https://i.imgur.com/guuQxWy.jpeg',
  /*D3*/'https://i.imgur.com/ptIUQis.jpeg',
  /*D4*/'https://i.imgur.com/pg1Z97L.jpeg',
  /*D5*/'https://i.imgur.com/bzees9M.jpeg',
  /*D6*/'https://i.imgur.com/5XdYVjH.png',
  /*D7*/'https://i.imgur.com/sLsDwls.png',

  /*C1*/'https://i.imgur.com/8dQpJkV.png',
  /*C2*/'https://i.imgur.com/onHmbki.png',
  /*C3*/'https://i.imgur.com/x5GHp65.png',
  /*C4*/'https://i.imgur.com/km42GBZ.jpeg',
  /*C5*/'https://i.imgur.com/9k246mc.jpeg',
  /*C6*/'https://i.imgur.com/dMlm8We.jpeg',
  /*C7*/'https://i.imgur.com/V1pnCBz.png',

  /*B1*/'https://i.imgur.com/rTuUzIA.png',
  /*B2*/'https://i.imgur.com/3kdzTjJ.png',
  /*B3*/'https://i.imgur.com/DnYIJwk.png',
  /*B4*/'https://i.imgur.com/E5IPyDp.jpeg',
  /*B5*/'https://i.imgur.com/Js8q9Zd.jpeg',
  /*B6*/'https://i.imgur.com/NZ2S3OQ.png',
  /*B7*/'https://i.imgur.com/LD9w4VK.png',

  /*A1*/'https://i.imgur.com/vyXpGZc.png',
  /*A2*/'https://i.imgur.com/8JLQnpB.png',
  /*A3*/'https://i.imgur.com/vhp2Ars.png',
  /*A4*/'https://i.imgur.com/IUEdzm6.png',
  /*A5*/'https://i.imgur.com/6VahqC4.png',
  /*A6*/'https://i.imgur.com/HK3wOPN.png',
  /*A7*/'https://i.imgur.com/uwexvkC.png',
];

const fogRenderer = L.canvas({ padding: 2 });

var map = L.map('map', {
  crs: L.CRS.Simple,
  minZoom: -2,
  maxZoom: 3,
  zoomSnap: 1,
  zoomDelta: 1,
  fadeAnimation: false,
  zoomAnimation: false,
  markerZoomAnimation: false,
  doubleClickZoom: false,
  zoomControl: false,
  attributionControl: false,
  preferCanvas: true
});

map.createPane('tiles');
map.getPane('tiles').style.zIndex = 200;

for (let row = 0; row < rows; row++) {
  for (let col = 0; col < cols; col++) {
    const index = row * cols + col;
    const url = imageUrls[index];

    const y1 = row * pieceHeight - (row > 0 ? overlap : 0);
    const y2 = (row + 1) * pieceHeight + (row < rows - 1 ? overlap : 0);
    const x1 = col * pieceWidth - (col > 0 ? overlap : 0);
    const x2 = (col + 1) * pieceWidth + (col < cols - 1 ? overlap : 0);

    L.imageOverlay(url, [[y1, x1], [y2, x2]], {
      pane: 'tiles',
      interactive: false
    }).addTo(map);
  }
}

const bounds = [[0, 0], [mapHeight, mapWidth]];
map.fitBounds(bounds);


// ----- FOG LAYER GROUP -----

const fogState = {};

const fogLevels = {
  3: { fillOpacity: 0.94 }, // unknown
  2: { fillOpacity: 0.45 }, // mapped / informed
  1: { fillOpacity: 0.00 }  // present
};

const regions = {};
const regionState = {};
const regionScenes = {};
const sceneMarkers = {};

const sceneIcon = L.icon({
  iconUrl: 'https://i.imgur.com/AiZmxL8.png',
  iconSize: [36, 44],
  iconAnchor: [18, 44],
  popupAnchor: [0, -36]
});

const fogStyle = {
  renderer: fogRenderer,
  stroke: false,
  fillColor: '#111',
  fillOpacity: 0.62,
  interactive: true
};

function makeRegion(name, coords) {
  const polygon = L.polygon(coords, fogStyle).addTo(map);

  regions[name] = polygon;
  regionState[name] = 3;
  regionScenes[name] = [];

  polygon.on('dblclick', function (e) {
    L.DomEvent.stopPropagation(e);
    cycleRegionState(name);
  });
}

const sceneData = {};

function addScene(scene) {
  const isLocked = !!scene.passwordLocked;

  const marker = L.marker(scene.coords, {
    icon: isLocked ? lockedSceneIcon : sceneIcon,
    opacity: 0
  }).addTo(map);

  sceneData[scene.id] = scene;
  sceneMarkers[scene.id] = marker;
  lockedSceneState[scene.id] = !!scene.passwordLocked;

  if (!regionScenes[scene.region]) {
    regionScenes[scene.region] = [];
  }

  regionScenes[scene.region].push(scene.id);

  // Single click: normal popup
  marker.on('click', function () {
    marker.bindPopup(buildScenePopup(scene)).openPopup();
  });

  // Double click: variant chooser popup
  marker.on('dblclick', function (e) {
    L.DomEvent.stopPropagation(e);
    marker.bindPopup(buildVariantPopup(scene)).openPopup();
  });
}

function buildScenePopup(scene) {
  return `
    <div style="min-width:220px;">
      <h3 style="margin:0 0 8px 0;">${scene.name}</h3>
      <p style="margin:0 0 10px 0;">${scene.description}</p>
      <a href="${scene.url}" target="_blank">Open scene</a>
    </div>
  `;
}

function buildVariantPopup(scene) {
  const variants = scene.variants || { Default: scene.url };

  const links = Object.entries(variants)
    .map(([label, url]) => {
      return `<div style="margin:6px 0;"><a href="${url}" target="_blank">${label}</a></div>`;
    })
    .join('');

  return `
    <div style="min-width:220px;">
      <h3 style="margin:0 0 8px 0;">${scene.name} Variants</h3>
      <p style="margin:0 0 10px 0;">Choose a scene version:</p>
      ${links}
    </div>
  `;
}

function setSceneVisibility(sceneId, visible) {
  const marker = sceneMarkers[sceneId];
  if (!marker) return;

  marker.setOpacity(visible ? 1 : 0);

  if (!visible) {
    marker.closePopup();
  }
}

function updateRegionScenes(regionName) {
  const level = regionState[regionName];
  const ids = regionScenes[regionName] || [];

  ids.forEach(id => {
    setSceneVisibility(id, level === 1);
  });
}

function setRegionState(regionName, level) {
  const region = regions[regionName];
  if (!region) return;

  regionState[regionName] = level;

  region.setStyle({
    fillOpacity: fogLevels[level].fillOpacity
  });

  updateRegionScenes(regionName);
}

function cycleRegionState(regionName) {
  const current = regionState[regionName];
  const next = current === 3 ? 2 : current === 2 ? 1 : 3;
  setRegionState(regionName, next);
}

makeRegion('eastern_forest', [
  [2200, 4500],
  [2000, 6000],
  [2600, 7000],
  [3400, 6800],
  [3600, 5200],
  [3000, 4200]
]);

makeRegion('desert', [
  [3200, 4000],
  [3500, 6500],
  [4500, 7500],
  [5500, 6000],
  [5200, 4200],
  [4000, 3500]
]);

addScene({
  id: 'bridge_town',
  region: 'eastern_forest',
  name: 'Bridge Town',
  coords: [2850, 5600],
  description: 'A narrow crossing settlement with old timber walkways and suspicious tollkeepers.',
  url: 'https://example.com/bridge-town',
  passwordLocked: false,
  variants: {
    Default: 'https://example.com/bridge-town',
    Rain: 'https://example.com/bridge-town-rain',
    Snow: 'https://example.com/bridge-town-snow'
  }
});

addScene({
  id: 'bridge_town2',
  region: 'eastern_forest',
  name: 'Bridge Town2',
  coords: [1850, 5600],
  description: 'A narrow crossing settlement with old timber walkways and suspicious tollkeepers.',
  url: 'https://i.imgur.com/GEiwF7E.jpeg',
  passwordLocked: false,
  variants: {
    Default: 'https://i.imgur.com/GEiwF7E.jpeg',
    Rain: 'https://i.imgur.com/5M1PkDt.jpeg',
    Snow: 'https://i.imgur.com/xE8D6KX.jpeg',
    Fog: 'https://i.imgur.com/iFtXJnr.jpeg',
    Masaacre: 'https://i.imgur.com/KGVACTV.jpeg',
    DayEmpty: 'https://i.imgur.com/h7Xxz4I.jpeg',
    Sunset: 'https://i.imgur.com/gey3FnI.jpeg',
    SunsetEmpty: 'https://i.imgur.com/Nb5HOmr.jpeg'
  }
});

setRegionState('eastern_forest', 3);
setRegionState('desert', 3);

const archivistCodes = {
  'EASTERNFORESTGREEN': {
    message: 'Riverlands survey restored.',
    action: {
      type: 'regionLevel',
      region: 'eastern_forest',
      level: 2
    }
  },

  'DESERTTAN': {
    message: 'Firelands border records recovered.',
    action: {
      type: 'regionLevel',
      region: 'desert',
      level: 2
    }
  },
};

const usedCodes = new Set();

function runArchivistAction(action) {
  if (!action) return;

  if (action.type === 'regionLevel') {
    const current = regionState[action.region];

    if (current > action.level) {
      setRegionState(action.region, action.level);
      return true;
    }

    return false;
  }

  return false;
}

function submitArchivistCode() {
  const code = normalizeCode(archivistInput.value);

  if (!code) {
    setArchivistStatus('Enter a code first.');
    return;
  }

  const entry = archivistCodes[code];

  if (!entry) {
    setArchivistStatus(`No archive match found for "${code}".`);
    return;
  }

  if (usedCodes.has(code)) {
    setArchivistStatus(`"${code}" has already been recorded.`);
    return;
  }

  const changed = runArchivistAction(entry.action);

  if (changed) {
    usedCodes.add(code);
    setArchivistStatus(entry.message);
    addArchivistLog(`${code} — ${entry.message}`);
    archivistInput.value = '';
  } else {
    setArchivistStatus(`"${code}" provided no new information.`);
  }
}

const archivistConsole = document.getElementById('archivist-console');
const archivistToggle = document.getElementById('archivist-toggle');
const archivistInput = document.getElementById('archivist-code-input');
archivistInput.addEventListener('input', function () {
  this.value = this.value.toUpperCase();
});
const archivistSubmit = document.getElementById('archivist-submit');
const archivistStatus = document.getElementById('archivist-status');
const archivistLog = document.getElementById('archivist-log');

archivistToggle.addEventListener('click', function () {
  archivistConsole.classList.toggle('collapsed');
  archivistToggle.textContent = archivistConsole.classList.contains('collapsed') ? '+' : '−';
});

function normalizeCode(code) {
  return code.trim().toUpperCase();
}

function setArchivistStatus(message) {
  archivistStatus.textContent = message;
}

function addArchivistLog(message) {
  const li = document.createElement('li');
  li.textContent = message;
  archivistLog.prepend(li);
}

function submitArchivistCode() {
  const code = normalizeCode(archivistInput.value);

  if (!code) {
    setArchivistStatus('Enter a code first.');
    return;
  }

  const entry = archivistCodes[code];

  if (!entry) {
    setArchivistStatus(`No archive match found for "${code}".`);
    return;
  }

  if (usedCodes.has(code)) {
    setArchivistStatus(`"${code}" has already been recorded.`);
    return;
  }

  const changed = runArchivistAction(entry.action);

  if (changed) {
    usedCodes.add(code);
    setArchivistStatus(entry.message);
    addArchivistLog(`${code} — ${entry.message}`);
    archivistInput.value = '';
  } else {
    setArchivistStatus(`"${code}" provided no new information.`);
  }
}

archivistSubmit.addEventListener('click', submitArchivistCode);

archivistInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    submitArchivistCode();
  }
});
