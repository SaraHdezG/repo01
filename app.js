import { icon } from "./icons.js";
import {
  brandIdFromText,
  brandIdForShop,
  brandIdForLocation,
  brandMark,
} from "./brands.js";
import {
  initMap,
  setMapAreaFilter,
  locateUser,
  invalidateMapSize,
  getMapAreaFilter,
  refreshMapMarkers,
} from "./map.js";

const STORAGE_KEY = "sara-shopping-v1";

const data = window.SARA_LIST;
let storeFilter = "all";
let statusFilter = "all";
let searchQuery = "";
let taxFreeOpen = false;
let viewMode = "list";
let mapAreaFilter = "all";
let pendingStoreScroll = null;
let doneMap = loadDoneMap();

const SHOP_GROUP_RULES = [
  {
    label: "Ginza",
    test: (t) =>
      /ginza|銀座|marronnier|honkan|jins|central contact|fancl|muji|教文館|loft|hands|ハンズ/i.test(
        t
      ),
  },
  {
    label: "Yurakucho y Tokio",
    test: (t) => /yurakucho|kitamura|yaesu|bic camera|bic contact/i.test(t),
  },
  {
    label: "Harajuku",
    test: (t) => /harajuku|harakado|wonder photo|tamagotchi factory/i.test(t),
  },
];

function loadDoneMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {
    /* ignore */
  }
  const seed = {};
  (data.seedDone || []).forEach((id) => {
    seed[id] = true;
  });
  return seed;
}

function saveDoneMap() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(doneMap));
}

function isDone(id) {
  return Boolean(doneMap[id]);
}

function setDone(id, value, { fromMap = false } = {}) {
  doneMap[id] = value;
  saveDoneMap();
  if (fromMap && viewMode === "map") {
    refreshMapMarkers();
    return;
  }
  render({ preserveScroll: true });
}

function getItemById(id) {
  return data.items.find((i) => i.id === id);
}

function areaLabel(area) {
  const f = data.map?.areaFilters?.find((a) => a.id === area);
  return f ? f.label : area;
}

function mapHooks() {
  return {
    getLocations: () => data.map.locations,
    getHome: () => data.map.home,
    getItemById,
    isDone,
    toggleDone: (id, value) => setDone(id, value, { fromMap: true }),
    escape: escapeHtml,
    areaLabel,
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isPricePart(part, index) {
  if (/[€¥]/.test(part) && part.length < 48) return true;
  if (index === 0 && /^(Gratis|Por concretar|Precio por mirar)$/.test(part))
    return true;
  return false;
}

function splitMeta(meta) {
  const parts = meta.split(" · ");
  const prices = [];
  const others = [];
  parts.forEach((part, index) => {
    if (isPricePart(part, index) && prices.length < 2) prices.push(part);
    else others.push(part);
  });
  return { prices, others };
}

function parsePriceDisplay(meta) {
  const { prices, others } = splitMeta(meta);
  let primary = null;
  let secondary = null;
  for (const p of prices) {
    if (p.includes("€") && !primary) primary = p;
    else if (p.includes("¥")) secondary = p;
    else if (!primary) primary = p;
  }
  if (!secondary && prices.length > 1) {
    secondary = prices.find((p) => p.includes("¥")) || prices[1];
  }
  const shop = others.length ? others[others.length - 1] : null;
  const notes = others.length > 1 ? others.slice(0, -1).join(" · ") : null;
  return { primary, secondary, shop, notes };
}

function parseItemYen(meta) {
  if (!meta || (meta.includes("–") && meta.includes("¥"))) return null;
  const parts = meta.split(" · ");
  for (const p of parts) {
    if (!p.includes("¥") || /\/|caja/i.test(p)) continue;
    const m = p.match(/([\d.]+)\s*¥/);
    if (m) return Number(m[1].replace(/\./g, ""));
  }
  return null;
}

function formatYenAmount(amount) {
  return `${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} ¥`;
}

function formatEuroFromYen(yen) {
  const eur = yen / (data.euroYen || 177);
  return `${eur.toFixed(2).replace(".", ",")} €`;
}

function shopForLocation(loc) {
  if (!loc?.brand) return null;
  return data.shops.find((s) => s.brand === loc.brand) || null;
}

function buildItemStoreIndex() {
  const index = new Map();
  (data.map?.locations || []).forEach((loc) => {
    (loc.itemIds || []).forEach((id) => {
      if (!index.has(id)) index.set(id, []);
      index.get(id).push(loc);
    });
  });
  return index;
}

function storeSectionsForItems(items) {
  const index = buildItemStoreIndex();
  const buckets = new Map();

  items.forEach((item) => {
    const locs = index.get(item.id);
    if (!locs?.length) {
      if (!buckets.has("__unassigned__")) {
        buckets.set("__unassigned__", { loc: null, items: [] });
      }
      buckets.get("__unassigned__").items.push(item);
      return;
    }
    locs.forEach((loc) => {
      if (!buckets.has(loc.id)) buckets.set(loc.id, { loc, items: [] });
      buckets.get(loc.id).items.push(item);
    });
  });

  const sections = [];
  (data.map?.locations || []).forEach((loc) => {
    const bucket = buckets.get(loc.id);
    if (bucket?.items.length) sections.push(bucket);
  });
  const unassigned = buckets.get("__unassigned__");
  if (unassigned?.items.length) sections.push(unassigned);
  return sections;
}

function storeSubtotal(items, loc) {
  let yen = 0;
  let priced = 0;
  let skipped = 0;
  items.forEach((item) => {
    const y = parseItemYen(item.meta);
    if (y == null) {
      skipped += 1;
      return;
    }
    yen += y;
    priced += 1;
  });
  const fullStoreList =
    loc &&
    storeFilter === "all" &&
    statusFilter === "all" &&
    items.length === (loc.itemIds || []).length &&
    (loc.itemIds || []).every((id) => items.some((i) => i.id === id));
  if (loc?.subtotalYen && fullStoreList) {
    yen = loc.subtotalYen;
  }
  return { yen, priced, skipped };
}

function itemBelongsToStore(itemId, storeId) {
  if (storeId === "all") return true;
  if (storeId === "__unassigned__") {
    return !buildItemStoreIndex().has(itemId);
  }
  const loc = (data.map?.locations || []).find((l) => l.id === storeId);
  return Boolean(loc?.itemIds?.includes(itemId));
}

function passesStatusAndSearch(item) {
  const done = isDone(item.id);
  if (statusFilter === "pending" && done) return false;
  if (statusFilter === "bought" && !done) return false;
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    const hay = `${item.text} ${item.meta} ${item.alt || ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function passesFilters(item) {
  if (!itemBelongsToStore(item.id, storeFilter)) return false;
  const done = isDone(item.id);
  if (statusFilter === "pending" && done) return false;
  if (statusFilter === "bought" && !done) return false;
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    const hay = `${item.text} ${item.meta} ${item.alt || ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function filteredItems() {
  return data.items.filter(passesFilters);
}

function counts() {
  const scope = data.items.filter(passesFilters);
  const total = scope.length;
  const bought = scope.filter((i) => isDone(i.id)).length;
  return { total, bought, pending: total - bought };
}

function storeFilterCount(storeId) {
  return data.items.filter(
    (item) => itemBelongsToStore(item.id, storeId) && passesStatusAndSearch(item)
  ).length;
}

function storeSectionDomId(storeId) {
  if (storeId === "__unassigned__") return "store-section-unassigned";
  if (storeId === "all") return "store-list-start";
  return `store-section-${storeId}`;
}

function scrollToStoreSection(storeId) {
  const id = storeSectionDomId(storeId);
  const el = document.getElementById(id);
  if (!el) return;
  const header = document.querySelector("#app > header");
  const filters = document.getElementById("list-filters");
  const margin =
    (header?.getBoundingClientRect().height || 140) +
    (filters?.getBoundingClientRect().height || 168) +
    12;
  el.style.scrollMarginTop = `${margin}px`;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  try {
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  } catch (_) {
    el.scrollIntoView(true);
  }
}

function storeChipLabel(loc) {
  if (!loc) return "Sin tienda";
  const brand = brandIdForLocation(loc);
  if (brand === "uniqlo") return "UNIQLO";
  if (brand === "donki") return "Don Quijote";
  if (brand === "bic-camera") return "Bic Camera";
  const short = loc.title.split("(")[0].trim();
  return short.length > 22 ? `${short.slice(0, 20)}…` : short;
}

function progressRing(bought, total) {
  const pct = total === 0 ? 0 : bought / total;
  const r = 17;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  return `
    <svg class="h-11 w-11 -rotate-90 text-muted" viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r="${r}" fill="none" stroke="currentColor" stroke-opacity="0.35" stroke-width="3" />
      <circle cx="22" cy="22" r="${r}" fill="none" stroke="hsl(var(--primary))" stroke-width="3"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}"
        style="transition: stroke-dashoffset 0.45s cubic-bezier(0.4, 0, 0.2, 1)" />
    </svg>`;
}

function mapsUrl(title) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title + ", Tokyo, Japan")}`;
}

function priceBlock(meta, { hideShopTag = false } = {}) {
  const { primary, secondary, shop, notes } = parsePriceDisplay(meta);
  const euro =
    primary &&
    `<span class="text-2xl font-semibold tracking-tight text-foreground">${escapeHtml(primary)}</span>`;
  const yen =
    secondary &&
    `<span class="text-sm font-medium text-muted-foreground">${escapeHtml(secondary)}</span>`;
  const shopBrand = shop ? brandIdFromText(shop) : null;
  const shopTag =
    !hideShopTag &&
    shop &&
    `<span class="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-secondary px-2 py-0.5 pr-2.5 text-xs font-medium text-secondary-foreground">${shopBrand ? brandMark(shopBrand, 18) : ""}<span class="min-w-0">${escapeHtml(shop)}</span></span>`;
  const notesEl =
    notes &&
    `<p class="mt-2 text-xs leading-relaxed text-muted-foreground">${escapeHtml(notes)}</p>`;
  return { euro, yen, shopTag, notesEl };
}

function productCard(item, { done, hideShopTag = false }) {
  const { euro, yen, shopTag, notesEl } = priceBlock(item.meta, { hideShopTag });
  const imageBlock =
    item.image && item.alt
      ? `<div class="relative aspect-[5/4] w-full overflow-hidden border-b border-border bg-muted/40">
          <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.alt)}"
            class="h-full w-full object-contain p-5 transition duration-300 ${done ? "opacity-60 saturate-75" : ""}"
            loading="lazy" decoding="async" />
        </div>`
      : `<div class="flex aspect-[5/4] items-center justify-center border-b border-border bg-muted/40 text-muted-foreground">
          ${icon("shopping-bag", 32, "opacity-40")}
        </div>`;

  return `<article class="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-opacity ${done ? "opacity-90" : ""}">
      ${imageBlock}
      <div class="p-4">
        <div class="flex gap-3">
          <label class="check-hit shrink-0 self-start" title="${done ? "Marcar pendiente" : "Marcar comprado"}">
            <input type="checkbox" class="done-check peer" data-id="${escapeHtml(item.id)}" ${done ? "checked" : ""}
              aria-label="Marcar como comprado: ${escapeHtml(item.text.slice(0, 80))}" />
            <span class="check-ui flex h-11 w-11 items-center justify-center rounded-md border shadow-sm ${done ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-transparent"}">
              ${icon("check", 20, done ? "" : "opacity-0")}
            </span>
          </label>
          <div class="min-w-0 flex-1">
            <h3 class="text-sm font-semibold leading-snug text-foreground ${done ? "text-muted-foreground line-through decoration-border" : ""}">${escapeHtml(item.text)}</h3>
            <div class="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0">${euro || ""} ${yen || ""}</div>
            ${shopTag || ""}
            ${notesEl || ""}
          </div>
        </div>
      </div>
    </article>`;
}

function sectionTitle(title, subtitle) {
  return `<div class="mb-3 px-0.5">
      <h2 class="text-lg font-semibold tracking-tight text-foreground">${escapeHtml(title)}</h2>
      ${subtitle ? `<p class="mt-1 text-xs text-muted-foreground">${escapeHtml(subtitle)}</p>` : ""}
    </div>`;
}

function storeHeader(loc, items) {
  const isUnassigned = !loc;
  const title = isUnassigned ? "Sin tienda asignada" : loc.title;
  const brandId = isUnassigned ? null : brandIdForLocation(loc);
  const shop = isUnassigned ? null : shopForLocation(loc);
  const hours = loc?.hours || shop?.hours || "";
  const address = loc?.address || "";
  const { yen, priced, skipped } = storeSubtotal(items, loc);
  const subtotalLine =
    yen > 0
      ? `<p class="mt-2 text-sm font-semibold tabular-nums text-foreground">${formatYenAmount(yen)} <span class="font-medium text-muted-foreground">(${formatEuroFromYen(yen)})</span></p>`
      : "";
  const subNote =
    skipped > 0
      ? `<p class="mt-1 text-[11px] text-muted-foreground">${skipped} artículo${skipped === 1 ? "" : "s"} sin precio fijo en la lista</p>`
      : priced === 0 && items.length
        ? `<p class="mt-1 text-[11px] text-muted-foreground">Sin precios numéricos en esta selección</p>`
        : "";

  const mapHref =
    loc && mapsUrl(loc.title || title);

  return `<div class="mb-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
    <div class="flex gap-3">
      ${isUnassigned ? `<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">${icon("shopping-bag", 22, "opacity-70")}</span>` : brandMark(brandId, 44)}
      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <h2 class="text-base font-semibold leading-snug text-foreground">${escapeHtml(title)}</h2>
          ${
            mapHref && !isUnassigned
              ? `<a href="${escapeHtml(mapHref)}" target="_blank" rel="noreferrer" class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-background shadow-sm" aria-label="Mapa">${icon("map", 16)}</a>`
              : ""
          }
        </div>
        ${
          address || hours
            ? `<p class="mt-1 text-xs leading-relaxed text-muted-foreground">${address ? `<span class="block">${escapeHtml(address)}</span>` : ""}${hours ? `<span class="mt-0.5 inline-flex items-center gap-1">${icon("clock", 12)} ${escapeHtml(hours)}</span>` : ""}</p>`
            : ""
        }
        ${subtotalLine}
        ${subNote}
        <p class="mt-1 text-[11px] text-muted-foreground">${items.length} artículo${items.length === 1 ? "" : "s"} en esta tienda</p>
      </div>
    </div>
  </div>`;
}

function renderStoreGroups(items, { doneOnly }) {
  const pool = items.filter((i) => isDone(i.id) === doneOnly);
  if (!pool.length) return "";

  const sections = storeSectionsForItems(pool);

  const blocks = sections.map(({ loc, items: list }) => {
    const sid = loc?.id || "__unassigned__";
    const anchorId = storeSectionDomId(sid);
    return `<section class="mb-8 store-section" data-store-section="${escapeHtml(sid)}">
      <span id="${anchorId}" class="store-section-anchor" tabindex="-1" aria-hidden="true"></span>
      ${storeHeader(loc, list)}
      <div class="flex flex-col gap-3">${list.map((item) => productCard(item, { done: doneOnly, hideShopTag: Boolean(loc) })).join("")}</div>
    </section>`;
  });

  return blocks.join("");
}

function groupShops() {
  const groups = new Map();
  SHOP_GROUP_RULES.forEach((r) => groups.set(r.label, []));
  groups.set("Otros", []);
  data.shops.forEach((shop) => {
    const rule = SHOP_GROUP_RULES.find((r) => r.test(shop.title));
    const key = rule ? rule.label : "Otros";
    groups.get(key).push(shop);
  });
  return [...groups.entries()].filter(([, list]) => list.length);
}

function shopCard(shop) {
  const mapHref = mapsUrl(shop.title);
  const shopBrand = brandIdForShop(shop);
  return `<article class="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
      <div class="mb-2 flex items-start justify-between gap-2">
        <div class="min-w-0 flex flex-1 gap-2.5">
          ${shopBrand ? brandMark(shopBrand, 28) : ""}
          <div class="min-w-0">
          <h3 class="text-sm font-semibold leading-snug text-foreground">${escapeHtml(shop.title)}</h3>
          <span class="mt-1 inline-flex items-center gap-1 rounded-md border border-transparent bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            ${icon("clock", 14)} ${escapeHtml(shop.hours)}
          </span>
          </div>
        </div>
        <a href="${escapeHtml(mapHref)}" target="_blank" rel="noreferrer"
          class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-input bg-background shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label="Abrir ${escapeHtml(shop.title)} en mapa">
          ${icon("map", 18)}
        </a>
      </div>
      <p class="text-sm leading-relaxed text-muted-foreground">${escapeHtml(shop.detail)}</p>
    </article>`;
}

function linkRow(link) {
  return `<a href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer"
      class="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-card-foreground shadow-sm no-underline transition-colors hover:bg-accent/50">
      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
        ${icon("external-link", 16)}
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium text-foreground">${escapeHtml(link.title)}</span>
        <span class="block truncate text-xs text-muted-foreground">${escapeHtml(link.site)}</span>
      </span>
    </a>`;
}

function toggleBtn(active, extraClass, inner) {
  const base =
    "inline-flex shrink-0 snap-start items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const on = `${base} bg-background text-foreground shadow-sm ${extraClass}`;
  const off = `${base} text-muted-foreground hover:bg-background/60 hover:text-foreground ${extraClass}`;
  return `<button type="button" class="${active ? on : off}">${inner}</button>`;
}

function renderStoreFilters() {
  const options = [
    { id: "all", label: "Todas", brand: null, iconName: "grid" },
    ...(data.map?.locations || []).map((loc) => ({
      id: loc.id,
      label: storeChipLabel(loc),
      brand: brandIdForLocation(loc),
      iconName: null,
    })),
    { id: "__unassigned__", label: "Sin tienda", brand: null, iconName: "shopping-bag" },
  ];
  return options
    .map((opt) => {
      const count = storeFilterCount(opt.id);
      if (opt.id !== "all" && count === 0 && storeFilter !== opt.id) return "";
      const active = storeFilter === opt.id;
      const mark = opt.brand
        ? brandMark(opt.brand, 20)
        : icon(opt.iconName || "shopping-bag", 16);
      return toggleBtn(
        active,
        "filter-pill store-pill min-h-10 max-w-[11rem] gap-1.5 px-2.5",
        `<span class="inline-flex shrink-0 items-center justify-center">${mark}</span><span class="truncate">${escapeHtml(opt.label)}</span> <span class="tabular-nums text-xs opacity-70">${count}</span>`
      ).replace("<button", `<button data-store="${escapeHtml(opt.id)}"`);
    })
    .filter(Boolean)
    .join("");
}

function renderViewTabs() {
  const mk = (id, label, ic) => {
    const active = viewMode === id;
    const cls = active
      ? "bg-background text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground";
    return `<button type="button" role="tab" aria-selected="${active}" data-view="${id}"
      class="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-all ${cls}">
      ${icon(ic, 16)} ${label}
    </button>`;
  };
  return `<div class="grid h-10 w-full grid-cols-2 items-center rounded-lg bg-muted p-1 text-muted-foreground" role="tablist">
    ${mk("list", "Lista", "list")}
    ${mk("map", "Mapa", "map")}
  </div>`;
}

function renderMapAreaFilters() {
  return (data.map?.areaFilters || [])
    .map((a) => {
      const active = mapAreaFilter === a.id;
      const cls = active
        ? "bg-background text-foreground shadow-sm"
        : "text-muted-foreground";
      return `<button type="button" data-map-area="${escapeHtml(a.id)}"
        class="map-area-pill shrink-0 snap-start rounded-md px-3 py-1.5 text-xs font-medium ${cls}">${escapeHtml(a.label)}</button>`;
    })
    .join("");
}

function renderStatusFilters() {
  const opts = [
    { id: "all", label: "Todos" },
    { id: "pending", label: "Pendientes" },
    { id: "bought", label: "Comprado" },
  ];
  return opts
    .map((o) => {
      const active = statusFilter === o.id;
      return toggleBtn(active, "status-pill min-h-8 text-xs", escapeHtml(o.label)).replace(
        "<button",
        `<button data-status="${o.id}"`
      );
    })
    .join("");
}

function render(options = {}) {
  const root = document.getElementById("app");
  if (!root) return;
  const scrollY = options.preserveScroll ? window.scrollY : 0;

  const { total, bought } = counts();
  const items = filteredItems();
  const pendingItems = items.filter((i) => !isDone(i.id));
  const boughtItems = items.filter((i) => isDone(i.id));
  const pct = total ? Math.round((bought / total) * 100) : 0;

  const emptyState =
    !items.length &&
    `<div class="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
      ${icon("search-empty", 28, "text-muted-foreground")}
      <p class="text-base font-medium text-foreground">Nada coincide</p>
      <p class="text-sm text-muted-foreground">Prueba otra búsqueda o quita filtros.</p>
    </div>`;

  root.innerHTML = `
    <header class="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      style="padding-top: max(8px, var(--safe-top))">
      <div class="flex items-center gap-3 px-4 pb-3 pt-2">
        <div class="min-w-0 flex-1">
          <p class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Tokio · Ginza</p>
          <h1 class="text-lg font-semibold tracking-tight text-foreground">Lista de compras</h1>
        </div>
        <div class="relative flex h-11 w-11 items-center justify-center" aria-hidden="true">
          ${progressRing(bought, total)}
        </div>
        <div class="text-right text-xs leading-tight">
          <span class="block text-lg font-bold tabular-nums text-foreground">${bought}<span class="font-medium text-muted-foreground">/${total}</span></span>
          <span class="text-muted-foreground">comprado</span>
        </div>
      </div>
      <div class="px-4 pb-2">
        <div class="relative h-2 w-full overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
          <div class="h-full bg-primary transition-all duration-500 ease-out" style="width:${pct}%"></div>
        </div>
      </div>
      <div class="px-4 pb-3">${renderViewTabs()}</div>
    </header>

    ${
      viewMode === "list"
        ? `<div id="list-filters" class="sticky z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      style="top: calc(var(--header-stack) + var(--safe-top))">
      <div class="space-y-3 px-4 py-3">
        <div class="relative">
          <span class="sr-only">Buscar en la lista</span>
          <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">${icon("search", 16)}</span>
          <input id="search-input" type="search" enterkeyhint="search" autocomplete="off"
            value="${escapeHtml(searchQuery)}"
            placeholder="Buscar producto o tienda…"
            class="flex h-11 w-full rounded-md border border-input bg-transparent pl-10 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
        </div>
        <div class="chip-scroll flex w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground" role="toolbar" aria-label="Estado">
          ${renderStatusFilters()}
        </div>
        <div id="filters" class="chip-scroll flex gap-1 overflow-x-auto rounded-lg bg-muted p-1 pb-1" role="toolbar" aria-label="Filtrar por tienda">
          ${renderStoreFilters()}
        </div>
      </div>
    </div>`
        : ""
    }

    <div id="list-panel" class="${viewMode === "list" ? "" : "hidden"}">
    <p class="px-4 pb-2 pt-4 text-xs text-muted-foreground">${escapeHtml(data.trip)}</p>

    <details class="tax-panel mx-4 mb-5 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm" ${taxFreeOpen ? "open" : ""}>
      <summary class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span class="inline-flex items-center gap-2 text-sm font-medium text-foreground">
          ${icon("receipt", 16)} Tax-Free · cómo funciona
        </span>
        <span class="tax-chevron text-muted-foreground">${icon("chevron-down", 18)}</span>
      </summary>
      <div class="border-t border-border px-4 py-3">
        <p class="text-sm leading-relaxed text-muted-foreground">${escapeHtml(data.taxFree)}</p>
        <p class="mt-2 text-xs text-muted-foreground">Mínimo 5.000 ¥ (28,25 €) · misma tienda y día.</p>
      </div>
    </details>

    <div class="px-4" style="padding-bottom: max(32px, var(--safe-bottom))">
      <span id="store-list-start" class="store-section-anchor" tabindex="-1" aria-hidden="true"></span>
      ${statusFilter !== "bought" ? renderStoreGroups(pendingItems, { doneOnly: false }) : ""}
      ${
        statusFilter !== "pending" && boughtItems.length
          ? `<section class="mb-6 mt-2">${sectionTitle("Comprado", `${boughtItems.length} artículo${boughtItems.length === 1 ? "" : "s"}`)}${renderStoreGroups(boughtItems, { doneOnly: true })}</section>`
          : ""
      }
      ${emptyState || ""}

      <section class="mb-8 mt-10 border-t border-border pt-8">
        ${sectionTitle("Fichas de tienda", "Horarios y notas extra")}
        ${groupShops()
          .map(
            ([label, shops]) => `
          <div class="mb-5">
            <h3 class="mb-2 px-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">${escapeHtml(label)}</h3>
            <div class="flex flex-col gap-3">${shops.map(shopCard).join("")}</div>
          </div>`
          )
          .join("")}
      </section>

      <section class="mb-6">
        ${sectionTitle("Enlaces útiles", null)}
        <div class="flex flex-col gap-2">${data.links.map(linkRow).join("")}</div>
      </section>

      <p class="pb-6 text-center text-[11px] leading-relaxed text-muted-foreground">${escapeHtml(data.footer)}</p>
    </div>
    </div>

    <div id="map-panel" class="${viewMode === "map" ? "flex flex-col" : "hidden"}" style="height: calc(100dvh - var(--app-chrome) - var(--safe-top)); padding-bottom: max(0px, var(--safe-bottom))">
      <div class="flex items-center gap-2 px-4 py-2">
        <div class="chip-scroll flex flex-1 gap-1 overflow-x-auto rounded-lg bg-muted p-1">${renderMapAreaFilters()}</div>
        <button type="button" id="map-locate" class="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm">
          ${icon("location", 16)} <span class="hidden sm:inline">Mi ubicación</span>
        </button>
      </div>
      <div id="leaflet-map" class="min-h-0 w-full flex-1 border-y border-border bg-background"></div>
    </div>
    <div id="map-sheet" class="map-sheet hidden" aria-live="polite"></div>
  `;

  root.querySelectorAll(".store-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.getAttribute("data-store") || "all";
      if (next === storeFilter) {
        scrollToStoreSection(next);
        return;
      }
      pendingStoreScroll = next;
      storeFilter = next;
      render();
    });
  });

  root.querySelectorAll(".status-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      statusFilter = btn.getAttribute("data-status") || "all";
      render({ preserveScroll: true });
    });
  });

  root.querySelectorAll(".done-check").forEach((input) => {
    input.addEventListener("change", () => {
      const id = input.getAttribute("data-id");
      if (id) setDone(id, input.checked);
    });
  });

  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      render({ preserveScroll: true });
      const next = document.getElementById("search-input");
      if (next) {
        next.focus();
        next.setSelectionRange(next.value.length, next.value.length);
      }
    });
  }

  const taxDetails = root.querySelector(".tax-panel");
  if (taxDetails) {
    taxDetails.addEventListener("toggle", () => {
      taxFreeOpen = taxDetails.open;
    });
  }

  root.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      viewMode = btn.getAttribute("data-view") || "list";
      render();
    });
  });

  root.querySelectorAll(".map-area-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      mapAreaFilter = btn.getAttribute("data-map-area") || "all";
      setMapAreaFilter(mapAreaFilter);
      root.querySelectorAll(".map-area-pill").forEach((b) => {
        const on = b.getAttribute("data-map-area") === mapAreaFilter;
        b.classList.toggle("bg-background", on);
        b.classList.toggle("text-foreground", on);
        b.classList.toggle("shadow-sm", on);
        b.classList.toggle("text-muted-foreground", !on);
      });
    });
  });

  document.getElementById("map-locate")?.addEventListener("click", () => locateUser());

  if (viewMode === "map") {
    document.body.classList.add("map-active");
    root.classList.add("map-active-root");
    initMap(mapHooks());
    setMapAreaFilter(mapAreaFilter);
    requestAnimationFrame(() => invalidateMapSize());
  } else {
    document.body.classList.remove("map-active");
    root.classList.remove("map-active-root");
  }

  if (pendingStoreScroll != null && viewMode === "list") {
    const target = pendingStoreScroll;
    pendingStoreScroll = null;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToStoreSection(target));
    });
  } else if (options.preserveScroll && viewMode === "list") {
    window.scrollTo(0, scrollY);
  }
}

document.addEventListener("DOMContentLoaded", () => render());