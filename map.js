import { icon } from "./icons.js";
import {
  brandIdForLocation,
  homeMarkerHtml,
  sheetBrandMark,
  storeMarkerHtml,
} from "./brands.js";

let map = null;
let storeLayer = null;
let homeLayer = null;
let userLayer = null;
let areaFilter = "all";
let selectedId = null;
let api = null;

/** Solo proveedores sin API key (no Stadia, Mapbox, Thunderforest, MapTiler). */
const KEYLESS_TILE_PROVIDERS = [
  {
    id: "osm",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    },
  },
  {
    id: "carto-light",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    options: {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
    },
  },
];

let tileLayer = null;
let tileProviderIndex = 0;
let tileErrorCount = 0;
let tileLoadCount = 0;
let tileHealthTimer = null;

function itemsForStore(loc) {
  return (loc.itemIds || [])
    .map((id) => api.getItemById(id))
    .filter(Boolean);
}

function storeStatus(loc) {
  const items = itemsForStore(loc);
  if (!items.length) return "empty";
  const done = items.every((i) => api.isDone(i.id));
  return done ? "done" : "pending";
}

function leafletDivIcon(html, size) {
  return L.divIcon({
    className: "map-pin-custom",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function filteredLocations() {
  const locs = api.getLocations();
  if (areaFilter === "all") return locs;
  return locs.filter((l) => l.area === areaFilter);
}

function directionsUrl(loc) {
  return `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
}

function renderSheet(loc) {
  const el = document.getElementById("map-sheet");
  if (!el || !loc) {
    if (el) el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  const items = itemsForStore(loc);
  const list = items.length
    ? items
        .map((item) => {
          const done = api.isDone(item.id);
          return `<label class="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border bg-background px-3 py-2">
            <input type="checkbox" class="map-done-check h-5 w-5 shrink-0 rounded border-input" data-id="${api.escape(item.id)}" ${done ? "checked" : ""} />
            <span class="text-sm ${done ? "text-muted-foreground line-through" : "text-foreground"}">${api.escape(item.text.slice(0, 120))}${item.text.length > 120 ? "…" : ""}</span>
          </label>`;
        })
        .join("")
    : `<p class="text-sm text-muted-foreground">Sin artículos asignados en la lista.</p>`;

  const homeId = api.getHome()?.id;
  const brandVisual = sheetBrandMark(loc, homeId);
  el.innerHTML = `
    <div class="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
      <div class="flex min-w-0 gap-3">
        ${brandVisual}
        <div class="min-w-0">
        <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">${api.escape(api.areaLabel(loc.area))}</p>
        <h2 class="text-base font-semibold text-foreground">${api.escape(loc.title)}</h2>
        <p class="mt-1 text-xs text-muted-foreground">${api.escape(loc.hours)}</p>
        </div>
      </div>
      <button type="button" id="map-sheet-close" class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground" aria-label="Cerrar">×</button>
    </div>
    <div class="max-h-40 space-y-2 overflow-y-auto px-4 py-3">${list}</div>
    <div class="border-t border-border px-4 py-3">
      <a href="${directionsUrl(loc)}" target="_blank" rel="noreferrer"
        class="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground">
        ${icon("map", 16, "text-primary-foreground")} Cómo llegar
      </a>
    </div>`;

  el.querySelector("#map-sheet-close")?.addEventListener("click", () => {
    selectedId = null;
    renderSheet(null);
  });
  el.querySelectorAll(".map-done-check").forEach((input) => {
    input.addEventListener("change", () => {
      const id = input.getAttribute("data-id");
      if (id) api.toggleDone(id, input.checked);
      refreshMarkers();
      renderSheet(loc);
    });
  });
}

function bindMarker(marker, loc) {
  marker.on("click", () => {
    selectedId = loc.id;
    renderSheet(loc);
    map.panTo([loc.lat, loc.lng], { animate: true });
  });
}

function refreshMarkers() {
  if (!map || !storeLayer) return;
  storeLayer.clearLayers();
  filteredLocations().forEach((loc) => {
    const status = storeStatus(loc);
    const brandId = brandIdForLocation(loc);
    const m = L.marker([loc.lat, loc.lng], {
      icon: leafletDivIcon(storeMarkerHtml(brandId, status), 40),
      zIndexOffset: 0,
    });
    bindMarker(m, loc);
    storeLayer.addLayer(m);
  });
  if (homeLayer && api.getHome()) {
    const h = api.getHome();
    homeLayer.clearLayers();
    const hm = L.marker([h.lat, h.lng], {
      icon: leafletDivIcon(homeMarkerHtml(), 44),
      zIndexOffset: 1000,
    });
    hm.bindTooltip(api.escape(h.label), { permanent: false, direction: "top", offset: [0, -14] });
    hm.on("click", () => {
      selectedId = h.id;
      renderSheet({
        id: h.id,
        title: h.label,
        area: h.area,
        hours: h.note || "—",
        lat: h.lat,
        lng: h.lng,
        itemIds: [],
      });
    });
    homeLayer.addLayer(hm);
  }
}

function tryNextTileProvider(reason) {
  if (tileProviderIndex >= KEYLESS_TILE_PROVIDERS.length - 1) return;
  tileProviderIndex += 1;
  tileErrorCount = 0;
  tileLoadCount = 0;
  if (typeof console !== "undefined" && console.info) {
    console.info(`[map] Cambio de teselas (${reason}) → ${KEYLESS_TILE_PROVIDERS[tileProviderIndex].id}`);
  }
  mountKeylessTileLayer();
}

function onTileLayerError() {
  tileErrorCount += 1;
  if (tileErrorCount >= 3) tryNextTileProvider("tileerror");
}

function onTileLayerLoad(ev) {
  tileLoadCount += 1;
  const img = ev?.tile;
  if (img?.naturalWidth > 0 && img.naturalWidth <= 64 && img.naturalHeight <= 64) {
    tryNextTileProvider("placeholder");
  }
  if (tileHealthTimer) clearTimeout(tileHealthTimer);
  tileHealthTimer = setTimeout(() => {
    if (tileLoadCount === 0 && tileErrorCount > 0) tryNextTileProvider("health");
  }, 4000);
}

function mountKeylessTileLayer() {
  if (!map) return;
  if (tileLayer) {
    tileLayer.off();
    map.removeLayer(tileLayer);
    tileLayer = null;
  }
  const provider = KEYLESS_TILE_PROVIDERS[tileProviderIndex];
  tileLayer = L.tileLayer(provider.url, {
    ...provider.options,
    crossOrigin: true,
  });
  tileLayer.on("tileerror", onTileLayerError);
  tileLayer.on("tileload", onTileLayerLoad);
  tileLayer.addTo(map);
}

function fitToFilter() {
  if (!map) return;
  const pts = [];
  const locs = filteredLocations();
  locs.forEach((l) => pts.push([l.lat, l.lng]));
  if (api.getHome()) {
    const h = api.getHome();
    pts.push([h.lat, h.lng]);
  }
  if (!pts.length) return;
  if (pts.length === 1) {
    map.setView(pts[0], 15);
    return;
  }
  map.fitBounds(pts, { padding: [48, 48], maxZoom: 15 });
}

export function initMap(hooks) {
  api = hooks;
  const container = document.getElementById("leaflet-map");
  if (!container || typeof L === "undefined") return;

  if (map) {
    map.remove();
    map = null;
  }
  tileProviderIndex = 0;
  tileErrorCount = 0;
  tileLoadCount = 0;
  tileLayer = null;
  if (tileHealthTimer) {
    clearTimeout(tileHealthTimer);
    tileHealthTimer = null;
  }

  map = L.map(container, {
    zoomControl: false,
    attributionControl: true,
  }).setView([35.6719, 139.7653], 14);

  L.control.zoom({ position: "topright" }).addTo(map);

  mountKeylessTileLayer();

  storeLayer = L.layerGroup().addTo(map);
  homeLayer = L.layerGroup().addTo(map);

  refreshMarkers();
  fitToFilter();

  setTimeout(() => map.invalidateSize(), 120);
}

export function setMapAreaFilter(area) {
  areaFilter = area;
  refreshMarkers();
  fitToFilter();
  if (selectedId) {
    const loc = api.getLocations().find((l) => l.id === selectedId);
    if (loc && (area === "all" || loc.area === area)) renderSheet(loc);
    else {
      selectedId = null;
      renderSheet(null);
    }
  }
}

export function locateUser() {
  if (!map || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      if (!userLayer) userLayer = L.layerGroup().addTo(map);
      userLayer.clearLayers();
      const um = L.circleMarker([latitude, longitude], {
        radius: 8,
        color: "#2563eb",
        fillColor: "#3b82f6",
        fillOpacity: 0.85,
        weight: 2,
      });
      userLayer.addLayer(um);
      map.setView([latitude, longitude], 15);
    },
    () => {
      /* ignore */
    },
    { enableHighAccuracy: true, timeout: 12000 }
  );
}

export function invalidateMapSize() {
  map?.invalidateSize();
}

export function getMapAreaFilter() {
  return areaFilter;
}

export function refreshMapMarkers() {
  refreshMarkers();
  if (selectedId) {
    const loc = api?.getLocations().find((l) => l.id === selectedId);
    if (loc) renderSheet(loc);
    else if (selectedId === api?.getHome()?.id) renderSheet({ ...api.getHome(), title: api.getHome().label, hours: "—", itemIds: [] });
  }
}