import type { GeoPoint } from "./models";

const R = 6378137;

export type XY = { x: number; y: number };

export type Projection = {
  toXY: (point: GeoPoint) => XY;
  toLatLng: (point: XY) => GeoPoint;
};

export function projectionFor(points: GeoPoint[]): Projection {
  if (points.length === 0) throw new Error("A projeção exige ao menos um ponto.");
  const lat0 = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const lon0 = points.reduce((sum, p) => sum + p.lng, 0) / points.length;
  const lat0Rad = toRad(lat0);
  const lon0Rad = toRad(lon0);

  return {
    toXY(point) {
      const lat = toRad(point.lat);
      const lon = toRad(point.lng);
      return {
        x: (lon - lon0Rad) * Math.cos(lat0Rad) * R,
        y: (lat - lat0Rad) * R,
      };
    },
    toLatLng(point) {
      const lat = point.y / R + lat0Rad;
      const lon = point.x / (R * Math.cos(lat0Rad)) + lon0Rad;
      return { lat: toDeg(lat), lng: toDeg(lon) };
    },
  };
}

export function polygonAreaM2(points: GeoPoint[]): number {
  if (points.length < 3) return 0;
  const projection = projectionFor(points);
  const xy = points.map(projection.toXY);
  let sum = 0;
  for (let i = 0; i < xy.length; i += 1) {
    const a = xy[i];
    const b = xy[(i + 1) % xy.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function distanceM(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = lat2 - lat1;
  const dLon = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function polylineDistanceM(points: GeoPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distanceM(points[i - 1], points[i]);
  return total;
}

export function bearingDeg(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lng - a.lng);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function normalizeBearing180(value: number): number {
  const normalized = value % 180;
  return normalized < 0 ? normalized + 180 : normalized;
}

function toRad(value: number): number {
  return value * Math.PI / 180;
}

function toDeg(value: number): number {
  return value * 180 / Math.PI;
}
