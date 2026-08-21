import { distanceM, normalizeBearing180, polygonAreaM2, polylineDistanceM, projectionFor } from "./geoMath";
import { CAMERA_MINI_5_PRO, type CameraModel, type GeoPoint, type MissionPlan, type MissionSettings } from "./models";

type UV = { u: number; v: number };
type GridResult = { waypoints: GeoPoint[]; lineCount: number };

export function planMission(
  boundary: GeoPoint[],
  settings: MissionSettings,
  camera: CameraModel = CAMERA_MINI_5_PRO,
): MissionPlan {
  validateBoundary(boundary);
  validateSettings(settings);

  const [groundWidthM, groundHeightM] = cameraFootprint(settings.altitudeM, camera);
  const photoSpacingM = Math.max(1, groundHeightM * (1 - settings.frontOverlapPct / 100));
  const lineSpacingM = Math.max(1, groundWidthM * (1 - settings.sideOverlapPct / 100));
  const bearing = settings.autoBearing ? findBestBearing(boundary, lineSpacingM) : normalizeBearing180(settings.bearingDeg);

  const primary = generateGrid(boundary, bearing, lineSpacingM, photoSpacingM, true);
  const secondary = settings.crossHatch
    ? generateGrid(boundary, normalizeBearing180(bearing + 90), lineSpacingM, photoSpacingM, true)
    : null;

  const waypoints = [...primary.waypoints, ...(secondary?.waypoints ?? [])];
  if (waypoints.length < 2) throw new Error("Não foi possível gerar uma rota dentro da área.");

  const parts = splitMission(waypoints, clamp(settings.maxWaypointsPerMission, 20, 200));
  const routeDistanceM = polylineDistanceM(waypoints);
  const estimatedFlightSeconds = routeDistanceM / settings.speedMs + waypoints.length * 1.5;
  const gsdCmPx = groundWidthM / camera.imageWidthPx * 100;

  return {
    boundary: boundary.map(copyPoint),
    waypoints,
    parts,
    settings: { ...settings, bearingDeg: bearing },
    stats: {
      areaM2: polygonAreaM2(boundary),
      gsdCmPx,
      groundWidthM,
      groundHeightM,
      lineSpacingM,
      photoSpacingM,
      routeDistanceM,
      estimatedFlightSeconds,
      photoCount: waypoints.length,
      flightLineCount: primary.lineCount + (secondary?.lineCount ?? 0),
      partCount: parts.length,
      effectiveBearingDeg: bearing,
    },
  };
}

export function orientTowardStart(plan: MissionPlan, preferredStart: GeoPoint | null): MissionPlan {
  if (!preferredStart || plan.waypoints.length < 2) return plan;
  const firstDistance = distanceM(preferredStart, plan.waypoints[0]);
  const lastDistance = distanceM(preferredStart, plan.waypoints[plan.waypoints.length - 1]);
  if (firstDistance <= lastDistance) return plan;
  return reverseMission(plan);
}

export function reverseMission(plan: MissionPlan): MissionPlan {
  const waypoints = [...plan.waypoints].reverse();
  const parts = splitMission(waypoints, clamp(plan.settings.maxWaypointsPerMission, 20, 200));
  return {
    ...plan,
    waypoints,
    parts,
    stats: { ...plan.stats, partCount: parts.length },
  };
}

export function validateSettings(settings: MissionSettings): void {
  if (!Number.isFinite(settings.altitudeM) || settings.altitudeM < 10 || settings.altitudeM > 500) {
    throw new Error("Altura fora do intervalo aceito (10 a 500 m).");
  }
  if (!Number.isFinite(settings.speedMs) || settings.speedMs < 0.5 || settings.speedMs > 15) {
    throw new Error("Velocidade fora do intervalo aceito (0,5 a 15 m/s).");
  }
  if (!Number.isFinite(settings.frontOverlapPct) || settings.frontOverlapPct < 10 || settings.frontOverlapPct > 95) {
    throw new Error("Sobreposição frontal inválida (10% a 95%).");
  }
  if (!Number.isFinite(settings.sideOverlapPct) || settings.sideOverlapPct < 10 || settings.sideOverlapPct > 95) {
    throw new Error("Sobreposição lateral inválida (10% a 95%).");
  }
  if (!Number.isFinite(settings.gimbalPitchDeg) || settings.gimbalPitchDeg < -135 || settings.gimbalPitchDeg > 80) {
    throw new Error("Gimbal fora do intervalo -135° a 80°.");
  }
  if (!Number.isInteger(settings.maxWaypointsPerMission) || settings.maxWaypointsPerMission < 20 || settings.maxWaypointsPerMission > 200) {
    throw new Error("Máximo de waypoints deve ficar entre 20 e 200.");
  }
  if (!Number.isInteger(settings.droneEnumValue) || settings.droneEnumValue <= 0) {
    throw new Error("Código DJI inválido.");
  }
}

export function cameraFootprint(altitudeM: number, camera: CameraModel = CAMERA_MINI_5_PRO): [number, number] {
  const diagTan = Math.tan(toRad(camera.diagonalFovDeg / 2));
  const diag = Math.hypot(camera.aspectWidth, camera.aspectHeight);
  const hTan = diagTan * camera.aspectWidth / diag;
  const vTan = diagTan * camera.aspectHeight / diag;
  return [2 * altitudeM * hTan, 2 * altitudeM * vTan];
}

function findBestBearing(boundary: GeoPoint[], lineSpacingM: number): number {
  let bestBearing = 0;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let bearing = 0; bearing < 180; bearing += 5) {
    const result = generateGrid(boundary, bearing, lineSpacingM, Math.max(4, lineSpacingM / 2), false);
    if (result.waypoints.length < 2) continue;
    const cost = polylineDistanceM(result.waypoints) + result.lineCount * 8;
    if (cost < bestCost) {
      bestCost = cost;
      bestBearing = bearing;
    }
  }
  return bestBearing;
}

function generateGrid(
  boundary: GeoPoint[],
  bearingDeg: number,
  lineSpacingM: number,
  photoSpacingM: number,
  photos: boolean,
): GridResult {
  const projection = projectionFor(boundary);
  const xy = boundary.map(projection.toXY);
  const br = toRad(bearingDeg);
  const dX = Math.sin(br);
  const dY = Math.cos(br);
  const nX = Math.cos(br);
  const nY = -Math.sin(br);
  const uv: UV[] = xy.map((p) => ({ u: p.x * dX + p.y * dY, v: p.x * nX + p.y * nY }));
  const minV = Math.min(...uv.map((p) => p.v));
  const maxV = Math.max(...uv.map((p) => p.v));
  const span = maxV - minV;
  const lineSlots = Math.max(1, Math.ceil(span / lineSpacingM));
  const actualSpacing = span > 0.01 ? span / lineSlots : lineSpacingM;
  const route: GeoPoint[] = [];
  let lineCount = 0;
  let reverse = false;

  for (let i = 0; i < lineSlots; i += 1) {
    const v = span > 0.01 ? minV + (i + 0.5) * actualSpacing : minV;
    const intersections: number[] = [];
    for (let j = 0; j < uv.length; j += 1) {
      const a = uv[j];
      const b = uv[(j + 1) % uv.length];
      const crosses = (a.v <= v && b.v > v) || (b.v <= v && a.v > v);
      if (crosses) {
        const t = (v - a.v) / (b.v - a.v);
        intersections.push(a.u + t * (b.u - a.u));
      }
    }
    intersections.sort((a, b) => a - b);
    if (intersections.length < 2) continue;

    const segments: Array<[number, number]> = [];
    for (let k = 0; k + 1 < intersections.length; k += 2) {
      const u1 = intersections[k];
      const u2 = intersections[k + 1];
      if (u2 - u1 > 0.5) segments.push([u1, u2]);
    }
    if (segments.length === 0) continue;
    const orderedSegments = reverse ? [...segments].reverse() : segments;

    for (const [u1, u2] of orderedSegments) {
      const startU = reverse ? u2 : u1;
      const endU = reverse ? u1 : u2;
      const delta = endU - startU;
      const length = Math.abs(delta);
      if (length < 0.5) continue;
      const photoCount = photos ? Math.max(2, Math.ceil(length / photoSpacingM) + 1) : 2;
      for (let index = 0; index < photoCount; index += 1) {
        const t = photoCount <= 1 ? 0 : index / (photoCount - 1);
        const u = startU + delta * t;
        const x = u * dX + v * nX;
        const y = u * dY + v * nY;
        const point = projection.toLatLng({ x, y });
        const last = route[route.length - 1];
        if (!last || distanceM(last, point) >= 0.2) route.push(point);
      }
      lineCount += 1;
    }
    reverse = !reverse;
  }

  return { waypoints: route, lineCount };
}

function splitMission(points: GeoPoint[], maxPerPart: number): GeoPoint[][] {
  if (points.length <= maxPerPart) return [points.map(copyPoint)];
  const parts: GeoPoint[][] = [];
  let start = 0;
  while (start < points.length - 1) {
    const endExclusive = Math.min(points.length, start + maxPerPart);
    parts.push(points.slice(start, endExclusive).map(copyPoint));
    if (endExclusive >= points.length) break;
    start = endExclusive - 1;
  }
  return parts;
}

function validateBoundary(boundary: GeoPoint[]): void {
  if (boundary.length < 3) throw new Error("Desenhe pelo menos 3 vértices.");
  for (const point of boundary) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || point.lat < -90 || point.lat > 90 || point.lng < -180 || point.lng > 180) {
      throw new Error("O quadro de voo possui coordenadas inválidas.");
    }
  }
  if (polygonAreaM2(boundary) < 1) throw new Error("A área desenhada é pequena ou degenerada demais para gerar uma missão.");
}

function copyPoint(point: GeoPoint): GeoPoint {
  return { lat: point.lat, lng: point.lng };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toRad(value: number): number {
  return value * Math.PI / 180;
}
