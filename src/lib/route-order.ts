type Point = { id: string; lat: number; lon: number };

function squaredDistance(a: Pick<Point, "lat" | "lon">, b: Pick<Point, "lat" | "lon">) {
  const latScale = 111_000;
  const lonScale = 111_000 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return ((a.lat - b.lat) * latScale) ** 2 + ((a.lon - b.lon) * lonScale) ** 2;
}

/** Lightweight nearest-neighbour order. Navigation remains in Yandex Maps. */
export function buildRouteOrder(points: Point[], start?: { lat: number; lon: number }) {
  if (points.length <= 1) return points.map((point) => point.id);
  const remaining = [...points];
  const center = start || {
    lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
    lon: points.reduce((sum, point) => sum + point.lon, 0) / points.length,
  };
  let current = remaining.reduce((best, point) => squaredDistance(center, point) < squaredDistance(center, best) ? point : best);
  const ordered = [current.id];
  remaining.splice(remaining.findIndex((point) => point.id === current.id), 1);
  while (remaining.length) {
    const next = remaining.reduce((best, point) => squaredDistance(current, point) < squaredDistance(current, best) ? point : best);
    ordered.push(next.id);
    remaining.splice(remaining.findIndex((point) => point.id === next.id), 1);
    current = next;
  }
  return ordered;
}
