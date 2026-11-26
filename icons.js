import Search01Icon from "https://esm.sh/@hugeicons/core-free-icons@1.0.0/Search01Icon";
import SearchMinusIcon from "https://esm.sh/@hugeicons/core-free-icons@1.0.0/SearchMinusIcon";
import LayoutGridIcon from "https://esm.sh/@hugeicons/core-free-icons@1.0.0/LayoutGridIcon";
import GameController01Icon from "https://esm.sh/@hugeicons/core-free-icons@1.0.0/GameController01Icon";
import DropletIcon from "https://esm.sh/@hugeicons/core-free-icons@1.0.0/DropletIcon";
import Airplane01Icon from "https://esm.sh/@hugeicons/core-free-icons@1.0.0/Airplane01Icon";
import Car01Icon from "https://esm.sh/@hugeicons/core-free-icons@1.0.0/Car01Icon";
import Tick02Icon from "https://esm.sh/@hugeicons/core-free-icons@1.0.0/Tick02Icon";
import Clock01Icon from "https://esm.sh/@hugeicons/core-free-icons@1.0.0/Clock01Icon";
import MapsIcon from "https://esm.sh/@hugeicons/core-free-icons@1.0.0/MapsIcon";
import LinkSquare02Icon from "https://esm.sh/@hugeicons/core-free-icons@1.0.0/LinkSquare02Icon";
import Invoice01Icon from "https://esm.sh/@hugeicons/core-free-icons@1.0.0/Invoice01Icon";
import ArrowDown01Icon from "https://esm.sh/@hugeicons/core-free-icons@1.0.0/ArrowDown01Icon";
import ShoppingBag01Icon from "https://esm.sh/@hugeicons/core-free-icons@1.0.0/ShoppingBag01Icon";
import Home01Icon from "https://esm.sh/@hugeicons/core-free-icons@1.0.0/Home01Icon";
import Location01Icon from "https://esm.sh/@hugeicons/core-free-icons@1.0.0/Location01Icon";
import ListViewIcon from "https://esm.sh/@hugeicons/core-free-icons@1.0.0/ListViewIcon";

const REGISTRY = {
  search: Search01Icon,
  "search-empty": SearchMinusIcon,
  grid: LayoutGridIcon,
  gamepad: GameController01Icon,
  droplet: DropletIcon,
  plane: Airplane01Icon,
  car: Car01Icon,
  check: Tick02Icon,
  clock: Clock01Icon,
  map: MapsIcon,
  "external-link": LinkSquare02Icon,
  receipt: Invoice01Icon,
  "chevron-down": ArrowDown01Icon,
  "shopping-bag": ShoppingBag01Icon,
  home: Home01Icon,
  location: Location01Icon,
  list: ListViewIcon,
};

const CAT_ICON = {
  all: "grid",
  tamagotchi: "gamepad",
  skincare: "droplet",
  basics: "plane",
  juguetes: "car",
};

function attrsToString(attrs) {
  return Object.entries(attrs)
    .filter(([k]) => k !== "key")
    .map(([k, v]) => {
      const name = k === "fillRule" ? "fill-rule" : k === "clipRule" ? "clip-rule" : k;
      return `${name}="${String(v).replace(/"/g, "&quot;")}"`;
    })
    .join(" ");
}

export function icon(name, size = 16, className = "shrink-0 opacity-90") {
  const data = REGISTRY[name];
  if (!data) return "";
  const inner = data
    .map(([tag, attrs]) => `<${tag} ${attrsToString(attrs)} />`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" class="${className}" aria-hidden="true">${inner}</svg>`;
}

export function categoryIcon(categoryId) {
  return icon(CAT_ICON[categoryId] || "grid", 16);
}