import { icon } from "./icons.js";

const data = () => window.SARA_LIST;

export function getBrand(id) {
  if (!id) return null;
  return data().brands?.[id] || null;
}

const BRAND_RULES = [
  { id: "daiso", re: /daiso/i },
  { id: "hakuhinkan", re: /hakuhinkan/i },
  { id: "bic-camera", re: /bic camera|bic contact/i },
  { id: "donki", re: /don quijote|donki/i },
  { id: "fancl", re: /fancl|ファンケル/i },
  { id: "jins", re: /\bjins\b/i },
  { id: "muji", re: /\bmuji\b/i },
  { id: "uniqlo", re: /\buniqlo\b/i },
  { id: "loft", re: /\bloft\b/i },
  { id: "hands", re: /hands|ハンズ|tokyu.hands/i },
  { id: "matsumoto-kiyoshi", re: /matsumoto kiyoshi|マツモトキヨシ/i },
  { id: "kitamura", re: /kitamura|キタムラ/i },
  { id: "tomica", re: /tomica|character street/i },
  { id: "tamagotchi", re: /tamagotchi factory|lab tama/i },
  { id: "wonder-photo", re: /wonder photo/i },
  { id: "yodobashi", re: /yodobashi/i },
  { id: "farmacia", re: /farmacia/i },
  { id: "pokemon", re: /pokémon center|pokemon center/i },
];

export function brandIdFromText(text) {
  if (!text) return null;
  const hit = BRAND_RULES.find((r) => r.re.test(text));
  return hit ? hit.id : null;
}

export function initialsBadge(brand, px = 20) {
  const color = brand.color || "#71717a";
  const initials = brand.initials || "?";
  const fs = Math.max(9, Math.round(px * 0.4));
  return `<span class="inline-flex shrink-0 items-center justify-center rounded-md font-semibold text-white" style="width:${px}px;height:${px}px;background:${color};font-size:${fs}px;line-height:1" aria-hidden="true">${initials}</span>`;
}

export function brandMark(brandId, px = 20, extraClass = "") {
  const brand = getBrand(brandId);
  if (!brand) return "";
  if (brand.logo) {
    const cls = `store-logo shrink-0 rounded-md border border-border bg-white object-contain ${extraClass}`.trim();
    return `<img src="${brand.logo}" width="${px}" height="${px}" alt="" class="${cls}" style="width:${px}px;height:${px}px;padding:2px" loading="lazy" decoding="async" />`;
  }
  return initialsBadge(brand, px);
}

export function brandIdForLocation(loc) {
  return loc?.brand || brandIdFromText(loc?.title);
}

export function brandIdForShop(shop) {
  return shop?.brand || brandIdFromText(shop?.title);
}

export function markerRingColor(status) {
  if (status === "done") return "#16a34a";
  if (status === "pending") return "#18181b";
  return "#a1a1aa";
}

export function storeMarkerHtml(brandId, status) {
  const size = 40;
  const ring = markerRingColor(status);
  const brand = getBrand(brandId);
  let inner = "";
  if (brand?.logo) {
    inner = `<img src="${brand.logo}" alt="" style="width:100%;height:100%;object-fit:contain;display:block;border-radius:6px" />`;
  } else if (brand) {
    inner = `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:${brand.color};color:#fff;font-size:10px;font-weight:700;border-radius:8px">${brand.initials}</span>`;
  }
  return `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:#fff;border:3px solid ${ring};box-shadow:0 2px 10px rgba(0,0,0,.12);padding:5px;box-sizing:border-box">${inner}</div>`;
}

export function homeMarkerHtml() {
  const size = 44;
  const ring = "#3b82f6";
  const homeSvg = icon("home", 22, "text-[#2563eb]");
  return `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:#fff;border:3px solid ${ring};box-shadow:0 2px 12px rgba(37,99,235,.25);padding:7px;box-sizing:border-box;display:flex;align-items:center;justify-content:center">${homeSvg}</div>`;
}

export function sheetBrandMark(loc, homeId) {
  if (loc?.id === homeId) {
    return `<span class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-blue-500 bg-white">${icon("home", 22, "text-[#2563eb]")}</span>`;
  }
  const brandId = brandIdForLocation(loc);
  return brandId ? brandMark(brandId, 36) : "";
}