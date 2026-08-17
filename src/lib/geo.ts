const EARTH_RADIUS_M = 6_371_000;

function radians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number) {
  const dLat = radians(bLat - aLat);
  const dLon = radians(bLon - aLon);
  const lat1 = radians(aLat);
  const lat2 = radians(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)));
}
