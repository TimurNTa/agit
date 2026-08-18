const USER_AGENT = "AGIT/1.0 (+https://agit.volochek69.ru)";
const NOMINATIM_URL = process.env.NOMINATIM_URL?.trim() || "https://nominatim.openstreetmap.org";
const DEFAULT_OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const OVERPASS_TIMEOUT_MS = 18_000;
const HOUSE_CACHE_FRESH_MS = 15 * 60_000;
const HOUSE_CACHE_STALE_MS = 24 * 60 * 60_000;
const INSTITUTION_RADIUS_METERS = 18;

const RESIDENTIAL_BUILDINGS = new Set([
  "apartments", "bungalow", "cabin", "detached", "dormitory", "farm", "farmhouse", "ger",
  "house", "houseboat", "residential", "semidetached_house", "static_caravan", "terrace",
]);
const RESIDENTIAL_USES = new Set(["apartments", "dwelling", "housing", "mixed", "mixed_use", "residential"]);
const NON_RESIDENTIAL_BUILDINGS = new Set([
  "allotment_house", "barn", "carport", "cathedral", "chapel", "church", "civic", "college",
  "commercial", "conservatory", "construction", "cowshed", "fire_station", "garage", "garages",
  "government", "grandstand", "greenhouse", "hangar", "hospital", "hotel", "industrial",
  "kindergarten", "kiosk", "mosque", "office", "parking", "pavilion", "police", "prison",
  "public", "religious", "retail", "roof", "ruins", "school", "service", "shed", "shrine",
  "silo", "slurry_tank", "sports_hall", "stable", "stadium", "storage", "storage_tank", "sty",
  "supermarket", "synagogue", "temple", "toilets", "train_station", "transformer_tower",
  "transportation", "university", "warehouse",
]);
const NON_RESIDENTIAL_USES = new Set([
  "civic", "commercial", "education", "government", "healthcare", "hospital", "industrial",
  "institutional", "office", "public", "religious", "retail", "school", "storage", "warehouse",
]);
const NON_RESIDENTIAL_LANDUSES = new Set(["commercial", "education", "industrial", "institutional", "military", "religious", "retail"]);
const INSTITUTION_AMENITIES = [
  "arts_centre", "childcare", "clinic", "college", "community_centre", "courthouse", "dentist",
  "doctors", "fire_station", "hospital", "kindergarten", "library", "nursing_home", "place_of_worship",
  "police", "post_office", "prison", "school", "social_facility", "theatre", "townhall", "university",
].join("|");
const NON_RESIDENTIAL_NAME_PARTS = [
  "школ", "гимназ", "лице", "детский сад", "детсад", "больниц", "поликлиник", "медицинск",
  "клиник", "фельдшер", "администрац", "правительств", "министерств", "ведомств", "муниципальн",
  "государственн", "прокуратур", "полици", "военкомат", "пожарн", "университет", "институт",
  "академи", "колледж", "техникум", "училищ", "музе", "библиотек", "театр", "дом культуры",
  "церков", "храм", "собор", "мечет", "синагог", "стадион", "спорткомплекс", "котельн",
  "подстанц", "склад", "school", "gymnasium", "hospital", "clinic", "government", "administration",
  "university", "college", "courthouse", "police", "fire station", "prison", "library", "museum",
  "theatre", "church", "mosque", "synagogue", "stadium", "warehouse",
];

type CacheEntry<T> = { expiresAt: number; staleUntil?: number; value: T };
export type Bounds = { south: number; west: number; north: number; east: number };
export type DiscoveredHouse = { address: string; lat: number; lon: number; source: "osm"; externalId: string };
export type HouseDiscovery = {
  houses: DiscoveredHouse[];
  excludedAddresses: string[];
  excludedCount: number;
  unresolvedCount: number;
  truncated: boolean;
  stale: boolean;
};
type SearchResult = { label: string; address: string; lat: number; lon: number; type: string };
type OsmElement = {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: unknown;
  tags?: unknown;
  nodes?: unknown;
  members?: unknown;
};

const globalOsm = globalThis as unknown as {
  agitAddressCache?: Map<string, CacheEntry<SearchResult[]>>;
  agitHouseCache?: Map<string, CacheEntry<HouseDiscovery>>;
  agitPreferredOverpassUrl?: string;
  agitNominatimNextAt?: number;
  agitNominatimQueue?: Promise<void>;
};
const addressCache = globalOsm.agitAddressCache ?? new Map();
const houseCache = globalOsm.agitHouseCache ?? new Map();
globalOsm.agitAddressCache = addressCache;
globalOsm.agitHouseCache = houseCache;

export function normalizeBounds(value: unknown): Bounds | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const south = Number(input.south);
  const west = Number(input.west);
  const north = Number(input.north);
  const east = Number(input.east);
  if (![south, west, north, east].every(Number.isFinite)) return null;
  if (south >= north || west >= east || south < -90 || north > 90 || west < -180 || east > 180) return null;
  const midLat = (south + north) / 2;
  const heightKm = (north - south) * 111;
  const widthKm = (east - west) * 111 * Math.cos(midLat * Math.PI / 180);
  if (heightKm * widthKm > 25) return null;
  return { south, west, north, east };
}

function cleanPart(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizedTag(value: unknown) {
  return cleanPart(value).toLocaleLowerCase("ru");
}

function addressKey(value: string) {
  return value.toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/[.]/g, "").replace(/\s+/g, " ").trim();
}

function addressFromTags(tags: Record<string, unknown>, fallbackStreet = "") {
  const street = cleanPart(tags["addr:street"] || tags["addr:place"] || tags["addr:locality"] || fallbackStreet);
  const number = cleanPart(tags["addr:housenumber"]);
  if (!street || !number) return null;
  const unit = cleanPart(tags["addr:block"] || tags["addr:unit"]);
  return `${street}, ${number}${unit ? `, корп. ${unit}` : ""}`;
}

function tagsOf(element: OsmElement) {
  return element.tags && typeof element.tags === "object" ? element.tags as Record<string, unknown> : {};
}

function coordinatesOf(element: OsmElement) {
  const center = element.center && typeof element.center === "object" ? element.center as Record<string, unknown> : {};
  const lat = Number(element.lat ?? center.lat);
  const lon = Number(element.lon ?? center.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function elementKey(element: OsmElement) {
  const type = cleanPart(element.type);
  const id = cleanPart(String(element.id ?? ""));
  return type && id ? `${type}:${id}` : "";
}

function hasCurrentResidentialUse(tags: Record<string, unknown>) {
  const use = normalizedTag(tags["building:use"] || tags["building:use:primary"]);
  const residentialLevels = Number(tags["building:levels:residential"]);
  return RESIDENTIAL_USES.has(use) || (Number.isFinite(residentialLevels) && residentialLevels > 0);
}

function hasResidentialBuildingSignal(tags: Record<string, unknown>) {
  return hasCurrentResidentialUse(tags) || RESIDENTIAL_BUILDINGS.has(normalizedTag(tags.building));
}

function hasWholeWord(text: string, word: string) {
  return new RegExp(`(^|[^а-яёa-z0-9])${word}([^а-яёa-z0-9]|$)`, "iu").test(text);
}

function nonResidentialReason(tags: Record<string, unknown>) {
  const currentUse = normalizedTag(tags["building:use"] || tags["building:use:primary"]);
  if (NON_RESIDENTIAL_USES.has(currentUse)) return "building_use";

  if (!hasCurrentResidentialUse(tags)) {
    for (const key of ["amenity", "healthcare", "government", "military", "office", "shop", "tourism", "craft", "leisure", "public_transport", "railway", "aeroway", "club", "social_facility"]) {
      if (cleanPart(tags[key])) return key;
    }
    const power = normalizedTag(tags.power);
    if (["generator", "plant", "substation"].includes(power)) return "power";
    const manMade = normalizedTag(tags.man_made);
    if (["storage_tank", "tower", "wastewater_plant", "water_works", "works"].includes(manMade)) return "man_made";
    if (NON_RESIDENTIAL_LANDUSES.has(normalizedTag(tags.landuse))) return "landuse";
    if (NON_RESIDENTIAL_BUILDINGS.has(normalizedTag(tags.building))) return "building";

    const label = [tags.name, tags.official_name, tags.short_name, tags.operator, tags.brand, tags.description]
      .map(normalizedTag).filter(Boolean).join(" ");
    if (label && (NON_RESIDENTIAL_NAME_PARTS.some((part) => label.includes(part)) || ["дк", "мвд", "мчс", "суд", "фок"].some((word) => hasWholeWord(label, word)))) {
      return "name";
    }
  }
  return null;
}

export function isLikelyResidentialAddress(tags: Record<string, unknown>) {
  return nonResidentialReason(tags) === null;
}

function overpassUrls() {
  const configured = (process.env.OVERPASS_URLS || "").split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean);
  const legacy = process.env.OVERPASS_URL?.trim();
  const legacyFirst = legacy && legacy !== "https://overpass-api.de/api/interpreter" ? [legacy] : [];
  const candidates = [...configured, ...legacyFirst, ...DEFAULT_OVERPASS_URLS, ...(legacy ? [legacy] : [])];
  const valid = candidates.filter((value) => {
    try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
  });
  const unique = [...new Set(valid)];
  const preferred = globalOsm.agitPreferredOverpassUrl;
  return preferred && unique.includes(preferred) ? [preferred, ...unique.filter((url) => url !== preferred)] : unique;
}

function buildHouseQuery(bbox: string) {
  return `[out:json][timeout:16];
nwr["addr:housenumber"](${bbox})->.addresses;
way(bn.addresses)["building"]->.parentBuildings;
(
  rel(bn.addresses)["type"~"^(associatedStreet|street)$"];
  rel(bw.addresses)["type"~"^(associatedStreet|street)$"];
  rel(br.addresses)["type"~"^(associatedStreet|street)$"];
)->.streetRelations;
way(r.streetRelations:"street")->.streetWays;
(
  nwr["amenity"~"^(${INSTITUTION_AMENITIES})$"](${bbox});
  nwr["office"="government"](${bbox});
  nwr["government"](${bbox});
  nwr["healthcare"](${bbox});
  nwr["military"](${bbox});
)->.institutions;
(
  .addresses;
  .parentBuildings;
  .streetRelations;
  .streetWays;
  .institutions;
);
out body center;`;
}

async function fetchOverpassElements(query: string) {
  const errors: string[] = [];
  for (const url of overpassUrls()) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          referer: "https://agit.volochek69.ru/admin",
          "user-agent": USER_AGENT,
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
      });
      if (!response.ok) {
        errors.push(`${new URL(url).host}:${response.status}`);
        continue;
      }
      const payload = await response.json() as { elements?: unknown; remark?: unknown };
      if (!Array.isArray(payload.elements) || cleanPart(payload.remark)) {
        errors.push(`${new URL(url).host}:invalid_response`);
        continue;
      }
      globalOsm.agitPreferredOverpassUrl = url;
      return payload.elements as OsmElement[];
    } catch (error) {
      errors.push(`${new URL(url).host}:${error instanceof Error ? error.name : "request_failed"}`);
    }
  }
  throw new Error(`overpass_unavailable:${errors.join(",")}`);
}

function distanceApproxMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const midLat = (a.lat + b.lat) * Math.PI / 360;
  const north = (a.lat - b.lat) * 111_320;
  const east = (a.lon - b.lon) * 111_320 * Math.cos(midLat);
  return Math.sqrt(north * north + east * east);
}

function parseHouseElements(elements: OsmElement[]): Omit<HouseDiscovery, "stale"> {
  const elementsByKey = new Map<string, OsmElement>();
  for (const element of elements) {
    const key = elementKey(element);
    if (key) elementsByKey.set(key, element);
  }
  const parentTagsByNode = new Map<string, Record<string, unknown>>();
  for (const element of elements) {
    const tags = tagsOf(element);
    if (cleanPart(element.type) !== "way" || !cleanPart(tags.building) || !Array.isArray(element.nodes)) continue;
    for (const nodeId of element.nodes) parentTagsByNode.set(`node:${String(nodeId)}`, tags);
  }

  const streetByMember = new Map<string, string>();
  for (const element of elements) {
    const tags = tagsOf(element);
    if (cleanPart(element.type) !== "relation" || !["associatedstreet", "street"].includes(normalizedTag(tags.type)) || !Array.isArray(element.members)) continue;
    const members = element.members as Array<Record<string, unknown>>;
    let street = cleanPart(tags["addr:street"] || tags.name);
    if (!street) {
      const streetMember = members.find((member) => normalizedTag(member.role) === "street");
      const target = streetMember ? elementsByKey.get(`${cleanPart(streetMember.type)}:${String(streetMember.ref ?? "")}`) : undefined;
      street = target ? cleanPart(tagsOf(target).name) : "";
    }
    if (!street) continue;
    for (const member of members) {
      if (normalizedTag(member.role) === "street") continue;
      const key = `${cleanPart(member.type)}:${String(member.ref ?? "")}`;
      if (!key.startsWith(":")) streetByMember.set(key, street);
    }
  }

  const institutionAddressKeys = new Set<string>();
  const institutionPoints: Array<{ lat: number; lon: number }> = [];
  for (const element of elements) {
    const tags = tagsOf(element);
    if (!nonResidentialReason(tags)) continue;
    const address = addressFromTags(tags, streetByMember.get(elementKey(element)));
    if (address) institutionAddressKeys.add(addressKey(address));
    const coordinates = coordinatesOf(element);
    if (coordinates && (cleanPart(tags.amenity) || cleanPart(tags.healthcare) || cleanPart(tags.government) || normalizedTag(tags.office) === "government" || cleanPart(tags.military))) {
      institutionPoints.push(coordinates);
    }
  }

  const found = new Map<string, DiscoveredHouse & { score: number }>();
  const excludedAddresses = new Map<string, string>();
  let unresolvedCount = 0;
  for (const element of elements) {
    const directTags = tagsOf(element);
    if (!cleanPart(directTags["addr:housenumber"])) continue;
    const key = elementKey(element);
    const parentTags = parentTagsByNode.get(key) || {};
    const tags = { ...parentTags, ...directTags };
    const address = addressFromTags(tags, streetByMember.get(key));
    const coordinates = coordinatesOf(element);
    const type = cleanPart(element.type);
    if (!address) { unresolvedCount += 1; continue; }
    if (!coordinates || !type || !key) continue;

    const normalizedAddress = addressKey(address);
    const closeToInstitution = !hasResidentialBuildingSignal(tags) && institutionPoints.some((point) => distanceApproxMeters(coordinates, point) <= INSTITUTION_RADIUS_METERS);
    const excluded = Boolean(nonResidentialReason(tags)) || (institutionAddressKeys.has(normalizedAddress) && !hasResidentialBuildingSignal(tags)) || closeToInstitution;
    if (excluded) { excludedAddresses.set(normalizedAddress, address); continue; }

    const score = (hasResidentialBuildingSignal(tags) ? 4 : 0) + (type === "node" ? 0 : 2) + (cleanPart(directTags["addr:street"] || directTags["addr:place"]) ? 1 : 0);
    const previous = found.get(normalizedAddress);
    if (!previous || score > previous.score) {
      found.set(normalizedAddress, { address, lat: coordinates.lat, lon: coordinates.lon, source: "osm", externalId: key, score });
    }
  }

  for (const normalizedAddress of found.keys()) excludedAddresses.delete(normalizedAddress);
  const allHouses = [...found.values()].sort((a, b) => a.address.localeCompare(b.address, "ru"));
  return {
    houses: allHouses.slice(0, 500).map(({ score: _score, ...house }) => house),
    excludedAddresses: [...excludedAddresses.values()].sort((a, b) => a.localeCompare(b, "ru")),
    excludedCount: excludedAddresses.size,
    unresolvedCount,
    truncated: allHouses.length > 500,
  };
}

export async function discoverOsmHouses(bounds: Bounds): Promise<HouseDiscovery> {
  const bbox = [bounds.south, bounds.west, bounds.north, bounds.east].map((value) => value.toFixed(6)).join(",");
  const cached = houseCache.get(bbox);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return { ...cached.value, stale: false };
  try {
    const parsed = parseHouseElements(await fetchOverpassElements(buildHouseQuery(bbox)));
    const result = { ...parsed, stale: false };
    if (houseCache.size > 100) houseCache.clear();
    houseCache.set(bbox, { value: result, expiresAt: now + HOUSE_CACHE_FRESH_MS, staleUntil: now + HOUSE_CACHE_STALE_MS });
    return result;
  } catch (error) {
    if (cached && (cached.staleUntil || 0) > now) {
      console.warn("Using stale OSM house discovery cache", error);
      return { ...cached.value, stale: true };
    }
    throw error;
  }
}

type NominatimItem = { display_name?: string; lat?: string; lon?: string; type?: string; address?: Record<string, string> };

export async function searchAddress(query: string): Promise<SearchResult[]> {
  const cacheKey = query.toLocaleLowerCase("ru").replace(/\s+/g, " ").trim();
  const cached = addressCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const previousQueue = globalOsm.agitNominatimQueue ?? Promise.resolve();
  let releaseQueue!: () => void;
  globalOsm.agitNominatimQueue = new Promise<void>((resolve) => { releaseQueue = resolve; });
  await previousQueue;
  try {
    const waitMs = Math.max(0, (globalOsm.agitNominatimNextAt || 0) - Date.now());
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    globalOsm.agitNominatimNextAt = Date.now() + 1100;
    const params = new URLSearchParams({
      q: `Вышний Волочёк, ${query}`,
      format: "jsonv2",
      addressdetails: "1",
      limit: "7",
      countrycodes: "ru",
      viewbox: "34.35,57.75,34.78,57.40",
      bounded: "0",
    });
    const response = await fetch(`${NOMINATIM_URL}/search?${params}`, {
      headers: { "accept-language": "ru", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`nominatim_${response.status}`);
    const items = await response.json() as NominatimItem[];
    const result = items.flatMap((item) => {
      const lat = Number(item.lat);
      const lon = Number(item.lon);
      const label = cleanPart(item.display_name);
      if (!label || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];
      const address = item.address || {};
      const street = cleanPart(address.road || address.pedestrian || address.residential || address.neighbourhood);
      const houseNumber = cleanPart(address.house_number);
      return [{
        label,
        address: street && houseNumber ? `${street}, ${houseNumber}` : street || label.split(",").slice(0, 2).join(","),
        lat,
        lon,
        type: cleanPart(item.type),
      }];
    });
    if (addressCache.size > 200) addressCache.clear();
    addressCache.set(cacheKey, { value: result, expiresAt: Date.now() + 24 * 60 * 60_000 });
    return result;
  } finally {
    releaseQueue();
  }
}
