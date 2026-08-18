const USER_AGENT = "AGIT/1.0 (+https://agit.volochek69.ru)";
const OVERPASS_URL = process.env.OVERPASS_URL?.trim() || "https://overpass-api.de/api/interpreter";
const NOMINATIM_URL = process.env.NOMINATIM_URL?.trim() || "https://nominatim.openstreetmap.org";

type CacheEntry<T> = { expiresAt: number; value: T };
export type Bounds = { south: number; west: number; north: number; east: number };
export type DiscoveredHouse = { address: string; lat: number; lon: number; source: "osm"; externalId: string };
type SearchResult = { label: string; address: string; lat: number; lon: number; type: string };

const globalOsm = globalThis as unknown as {
  agitAddressCache?: Map<string, CacheEntry<SearchResult[]>>;
  agitHouseCache?: Map<string, CacheEntry<DiscoveredHouse[]>>;
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

function addressFromTags(tags: Record<string, unknown>) {
  const street = cleanPart(tags["addr:street"] || tags["addr:place"]);
  const number = cleanPart(tags["addr:housenumber"]);
  if (!street || !number) return null;
  const unit = cleanPart(tags["addr:unit"] || tags["addr:block"]);
  return `${street}, ${number}${unit ? `, корп. ${unit}` : ""}`;
}

export async function discoverOsmHouses(bounds: Bounds): Promise<DiscoveredHouse[]> {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  const cached = houseCache.get(bbox);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const query = `[out:json][timeout:25];(nwr["addr:housenumber"](${bbox}););out center tags;`;
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "user-agent": USER_AGENT },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`overpass_${response.status}`);
  const payload = await response.json() as { elements?: Array<Record<string, unknown>> };
  const found = new Map<string, DiscoveredHouse & { elementType: string }>();
  for (const element of payload.elements || []) {
    const tags = element.tags && typeof element.tags === "object" ? element.tags as Record<string, unknown> : {};
    const center = element.center && typeof element.center === "object" ? element.center as Record<string, unknown> : {};
    const address = addressFromTags(tags);
    const lat = Number(element.lat ?? center.lat);
    const lon = Number(element.lon ?? center.lon);
    const type = cleanPart(element.type);
    const id = String(element.id || "");
    if (!address || !type || !id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const key = address.toLocaleLowerCase("ru");
    const previous = found.get(key);
    if (!previous || (previous.elementType === "node" && type !== "node")) {
      found.set(key, { address, lat, lon, source: "osm", externalId: `${type}:${id}`, elementType: type });
    }
  }
  const result = [...found.values()]
    .map(({ elementType: _elementType, ...house }) => house)
    .sort((a, b) => a.address.localeCompare(b.address, "ru"))
    .slice(0, 500);
  if (houseCache.size > 100) houseCache.clear();
  houseCache.set(bbox, { value: result, expiresAt: Date.now() + 10 * 60_000 });
  return result;
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
