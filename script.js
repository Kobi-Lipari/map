const mapWidth = 8192;
const mapHeight = 5966;

const rows = 7;
const cols = 7;
const pieceWidth = mapWidth / cols;
const pieceHeight = mapHeight / rows;
const overlap = 1;
const usedCodes = new Set();
const SAVE_KEY = '_save_v1';

const imageUrls = [
  /*G1*/ 'tiles/image_part_043.png',
  /*G2*/ 'tiles/image_part_044.png',
  /*G3*/ 'tiles/image_part_045.png',
  /*G4*/ 'tiles/image_part_046.png',
  /*G5*/ 'tiles/image_part_047.png',
  /*G6*/ 'tiles/image_part_048.png',
  /*G7*/ 'tiles/image_part_049.png',

  /*F1*/ 'tiles/image_part_036.png',
  /*F2*/ 'tiles/image_part_037.png',
  /*F3*/ 'tiles/image_part_038.png',
  /*F4*/ 'tiles/image_part_039.png',
  /*F5*/ 'tiles/image_part_040.png',
  /*F6*/ 'tiles/image_part_041.png',
  /*F7*/ 'tiles/image_part_042.png',

  /*E1*/ 'tiles/image_part_029.png',
  /*E2*/ 'tiles/image_part_030.png',
  /*E3*/ 'tiles/image_part_031.png',
  /*E4*/ 'tiles/image_part_032.png',
  /*E5*/ 'tiles/image_part_033.png',
  /*E6*/ 'tiles/image_part_034.png',
  /*E7*/ 'tiles/image_part_035.png',

  /*D1*/ 'tiles/image_part_022.png',
  /*D2*/ 'tiles/image_part_023.png',
  /*D3*/ 'tiles/image_part_024.png',
  /*D4*/ 'tiles/image_part_025.png',
  /*D5*/ 'tiles/image_part_026.png',
  /*D6*/ 'tiles/image_part_027.png',
  /*D7*/ 'tiles/image_part_028.png',

  /*C1*/ 'tiles/image_part_015.png',
  /*C2*/ 'tiles/image_part_016.png',
  /*C3*/ 'tiles/image_part_017.png',
  /*C4*/ 'tiles/image_part_018.png',
  /*C5*/ 'tiles/image_part_019.png',
  /*C6*/ 'tiles/image_part_020.png',
  /*C7*/ 'tiles/image_part_021.png',

  /*B1*/ 'tiles/image_part_008.png',
  /*B2*/ 'tiles/image_part_009.png',
  /*B3*/ 'tiles/image_part_010.png',
  /*B4*/ 'tiles/image_part_011.png',
  /*B5*/ 'tiles/image_part_012.png',
  /*B6*/ 'tiles/image_part_013.png',
  /*B7*/ 'tiles/image_part_014.png',

  /*A1*/ 'tiles/image_part_001.png',
  /*A2*/ 'tiles/image_part_002.png',
  /*A3*/ 'tiles/image_part_003.png',
  /*A4*/ 'tiles/image_part_004.png',
  /*A5*/ 'tiles/image_part_005.png',
  /*A6*/ 'tiles/image_part_006.png',
  /*A7*/ 'tiles/image_part_007.png'
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
  iconUrl: 'icons/vista-marker.png',
  iconSize: [36, 44],
  iconAnchor: [18, 44],
  popupAnchor: [0, -36]
});

const lockedSceneState = {};

const lockedSceneIcon = L.icon({
  iconUrl: 'icons/vista-marker-red.jpg',
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

  // Bind once
  marker.bindPopup(buildScenePopup(scene));

  // Single click = regular popup
  marker.on('click', function (e) {
    L.DomEvent.stopPropagation(e);
    marker.setPopupContent(buildScenePopup(scene));
    marker.openPopup();
  });

  // Double click = variants popup
  marker.on('dblclick', function (e) {
    L.DomEvent.stopPropagation(e);
    marker.setPopupContent(buildVariantPopup(scene));
    marker.openPopup();
  });
}

function buildScenePopup(scene) {
  const isLocked = !!lockedSceneState[scene.id];
  const hintText = scene.lockHint
    ? `<p style="margin:0 0 10px 0; color:#d66;"><em>${scene.lockHint}</em></p>`
    : '';

  const linkHtml = isLocked
    ? `<span style="
        display:inline-block;
        padding:8px 10px;
        background:#3a1f1f;
        color:#f1c0c0;
        border:1px solid rgba(255,120,120,0.35);
        border-radius:6px;
        cursor:not-allowed;
        opacity:0.85;
      ">Locked</span>`
    : `<a href="${scene.url}" target="_blank" style="
        display:inline-block;
        padding:8px 10px;
        background:#2a241a;
        color:#f3ead5;
        border:1px solid rgba(232,220,192,0.2);
        border-radius:6px;
        text-decoration:none;
      ">Open scene</a>`;

  return `
    <div style="min-width:240px;">
      <h3 style="margin:0 0 8px 0;">${scene.name}</h3>
      <p style="margin:0 0 10px 0;">${scene.description}</p>
      ${isLocked ? hintText : ''}
      ${linkHtml}
    </div>
  `;
}

function buildVariantPopup(scene) {
  const isLocked = !!lockedSceneState[scene.id];

  if (isLocked) {
    return `
      <div style="min-width:240px;">
        <h3 style="margin:0 0 8px 0;">${scene.name}</h3>
        <p style="margin:0 0 10px 0;">This scene is still locked.</p>
        ${
          scene.lockHint
            ? `<p style="margin:0 0 10px 0; color:#d66;"><em>${scene.lockHint}</em></p>`
            : ''
        }
        <span style="
          display:inline-block;
          padding:8px 10px;
          background:#3a1f1f;
          color:#f1c0c0;
          border:1px solid rgba(255,120,120,0.35);
          border-radius:6px;
          cursor:not-allowed;
          opacity:0.85;
        ">Variants locked</span>
      </div>
    `;
  }

  const variants = scene.variants || { Default: scene.url };

  const links = Object.entries(variants)
    .map(([label, url]) => {
      return `
        <div style="margin:8px 0;">
          <a href="${url}" target="_blank" style="
            display:block;
            padding:8px 10px;
            background:#2a241a;
            color:#f3ead5;
            text-decoration:none;
            border-radius:6px;
            border:1px solid rgba(232,220,192,0.2);
          ">${label}</a>
        </div>
      `;
    })
    .join('');

  return `
    <div style="min-width:240px;">
      <h3 style="margin:0 0 8px 0;">${scene.name} Variants</h3>
      <p style="margin:0 0 10px 0;">Choose a scene version:</p>
      ${links}
    </div>
  `;
}

function setSceneVisibility(sceneId, visible) {
  const marker = sceneMarkers[sceneId];
  if (!marker) return;

  if (!visible) {
    marker.setOpacity(0);
    marker.closePopup();
    return;
  }

  marker.setOpacity(1);
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
  saveMapState();
}

function unlockScene(sceneId) {
  if (!(sceneId in lockedSceneState)) return false;
  if (lockedSceneState[sceneId] === false) return false;

  lockedSceneState[sceneId] = false;
  sceneMarkers[sceneId].setIcon(sceneIcon);
  
  for (const regionName in regionScenes) {
    if (regionScenes[regionName].includes(sceneId)) {
      if (regionState[regionName] === 1) {
        setSceneVisibility(sceneId, true);
      }
      break;
    }
  }

  saveMapState();
  return true;
}

function cycleRegionState(regionName) {
  const current = regionState[regionName];
  const next = current === 3 ? 2 : current === 2 ? 1 : 3;
  setRegionState(regionName, next);
}

function saveMapState() {
  const saveData = {
    regionState,
    lockedSceneState,
    usedCodes: Array.from(usedCodes)
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
}

function loadMapState() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse save data:', err);
    return null;
  }
}

function applyLoadedState(saveData) {
  if (!saveData) return;

  if (saveData.lockedSceneState) {
    for (const sceneId in saveData.lockedSceneState) {
      if (sceneId in lockedSceneState) {
        lockedSceneState[sceneId] = saveData.lockedSceneState[sceneId];
      }
    }
  }

  if (Array.isArray(saveData.usedCodes)) {
    saveData.usedCodes.forEach(code => usedCodes.add(code));
  }

  if (saveData.regionState) {
    for (const regionName in saveData.regionState) {
      if (regionName in regions) {
        setRegionState(regionName, saveData.regionState[regionName]);
      }
    }
  }
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
  lockHint: 'The old woman in Bridge Town mentioned that the path opens for those who know the hut’s true name.',
  url: 'https://example.com/bridge-town',
  passwordLocked: true,
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
  url: 'scenes/CityMarketplace_Original_Day_Crowd.jpeg',
  passwordLocked: false,
  variants: {
    Default: 'scenes/CityMarketplace_Original_Day_Crowd.jpeg',
    Rain: 'scenes/CityMarketplace_Rain.jpeg',
    Snow: 'scenes/CityMarketplace_Winter.jpeg',
    Fog: 'scenes/CityMarketplace_Fog.jpeg',
    Massacre: 'scenes/CityMarketplace_Massacre.jpeg',
    DayEmpty: 'scenes/CityMarketplace_Original_Day_Empty.jpeg',
    Sunset: 'scenes/CityMarketplace_Sunset_Crowd.jpeg',
    SunsetEmpty: 'scenes/CityMarketplace_Sunset_Empty.jpeg',
    Night: 'scenes/CityMarketplace_Original_Night.jpeg'
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

  'WITCHHUTRED': {
  message: "Hidden Witch's Hut unlocked.",
  action: {
    type: 'sceneUnlock',
    sceneId: 'bridge_town'
  }
}
};

const loadedSave = loadMapState();
applyLoadedState(loadedSave);

function runArchivistAction(action) {
  if (!action) return false;
  if (action.type === 'regionLevel') {
    const current = regionState[action.region];
    if (current > action.level) {
      setRegionState(action.region, action.level);
      return true;
    }
    return false;
  }
  if (action.type === 'sceneUnlock') {
    return unlockScene(action.sceneId);
  }
  if (action.type === 'multi') {
    let changed = false;
    action.actions.forEach(subAction => {
      if (runArchivistAction(subAction)) {
        changed = true;
      }
    });
    return changed;
  }
  return false;
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
    saveMapState();
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
