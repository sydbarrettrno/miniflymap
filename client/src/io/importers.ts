import JSZip from "jszip";
import type { GeoPoint } from "../domain/models";

export type DxfCrs = "LAT_LON" | "SIRGAS_2000_UTM_22S" | "SIRGAS_2000_UTM_23S";

export type DxfPolyline = {
  name: string;
  layer: string;
  points: Array<{ x: number; y: number }>;
  closed: boolean;
};

export async function importBoundaryFile(file: File, dxfCrs: DxfCrs = "SIRGAS_2000_UTM_22S"): Promise<GeoPoint[]> {
  const name = file.name.toLocaleLowerCase();
  if (name.endsWith(".dxf")) {
    const text = await file.text();
    const polylines = readDxfPolylines(text);
    if (polylines.length === 0) throw new Error("DXF sem POLYLINE/LWPOLYLINE utilizável.");
    const preferred = polylines.find((item) => item.closed) ?? polylines[0];
    return dxfPolylineToLatLng(preferred, dxfCrs);
  }
  if (name.endsWith(".kmz")) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const candidates = Object.values(zip.files)
      .filter((entry) => !entry.dir && (entry.name.toLocaleLowerCase().endsWith(".kml") || entry.name.toLocaleLowerCase().endsWith(".wpml")))
      .sort((a, b) => scoreKmlEntry(a.name) - scoreKmlEntry(b.name));
    if (candidates.length === 0) throw new Error("KMZ sem arquivo KML/WPML.");
    for (const entry of candidates) {
      const text = await entry.async("string");
      try {
        const points = parseKmlBoundary(text);
        if (points.length >= 3) return points;
      } catch {
        // tenta o próximo KML/WPML no pacote
      }
    }
    throw new Error("Não encontrei um polígono utilizável no KMZ.");
  }
  return parseKmlBoundary(await file.text());
}

export function parseKmlBoundary(text: string): GeoPoint[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("KML/XML inválido.");

  const polygon = firstElementByLocalName(doc, "Polygon");
  if (polygon) {
    const coordinates = firstDescendantByLocalName(polygon, "coordinates");
    if (coordinates?.textContent) {
      const points = parseCoordinateText(coordinates.textContent);
      if (points.length >= 3) return stripDuplicateClosingPoint(points);
    }
  }

  const allCoordinates = elementsByLocalName(doc, "coordinates");
  for (const element of allCoordinates) {
    const points = parseCoordinateText(element.textContent ?? "");
    if (points.length >= 3) return stripDuplicateClosingPoint(points);
  }
  throw new Error("Nenhum polígono encontrado no arquivo.");
}

export function readDxfPolylines(text: string): DxfPolyline[] {
  if (text.startsWith("AutoCAD Binary DXF")) {
    throw new Error("DXF binário não é suportado. Salve como DXF ASCII.");
  }
  const rawLines = normalizeLines(text);
  if (rawLines.length < 4) throw new Error("Arquivo DXF vazio ou inválido.");

  type PairCode = { code: number; value: string };
  const pairs: PairCode[] = [];
  for (let i = 0; i + 1 < rawLines.length; i += 2) {
    const code = Number.parseInt(rawLines[i].trim(), 10);
    if (Number.isFinite(code)) pairs.push({ code, value: rawLines[i + 1].trim() });
  }

  const result: DxfPolyline[] = [];
  let index = 0;
  let lwCount = 0;
  let polyCount = 0;

  while (index < pairs.length) {
    const pair = pairs[index];
    if (pair.code === 0 && pair.value.toLocaleUpperCase() === "LWPOLYLINE") {
      const end = findNextEntity(pairs, index + 1);
      const entity = pairs.slice(index + 1, end);
      const layer = entity.find((item) => item.code === 8)?.value || "0";
      const flags = Number.parseInt(entity.find((item) => item.code === 70)?.value ?? "0", 10) || 0;
      const points: Array<{ x: number; y: number }> = [];
      let pendingX: number | null = null;
      for (const item of entity) {
        if (item.code === 10) pendingX = toFiniteNumber(item.value);
        if (item.code === 20 && pendingX !== null) {
          const y = toFiniteNumber(item.value);
          if (y !== null) points.push({ x: pendingX, y });
          pendingX = null;
        }
      }
      const cleaned = cleanDxfPoints(points);
      if (cleaned.length >= 3) {
        lwCount += 1;
        result.push({
          name: `LWPOLYLINE ${lwCount}`,
          layer,
          points: cleaned,
          closed: (flags & 1) === 1 || isClosed(points),
        });
      }
      index = end;
      continue;
    }

    if (pair.code === 0 && pair.value.toLocaleUpperCase() === "POLYLINE") {
      const headerEnd = findNextEntity(pairs, index + 1);
      const header = pairs.slice(index + 1, headerEnd);
      const layer = header.find((item) => item.code === 8)?.value || "0";
      const flags = Number.parseInt(header.find((item) => item.code === 70)?.value ?? "0", 10) || 0;
      const points: Array<{ x: number; y: number }> = [];
      let cursor = headerEnd;

      while (cursor < pairs.length) {
        const entity = pairs[cursor];
        if (entity.code !== 0) {
          cursor += 1;
          continue;
        }
        const entityType = entity.value.toLocaleUpperCase();
        if (entityType === "SEQEND") {
          cursor = findNextEntity(pairs, cursor + 1);
          break;
        }
        if (entityType !== "VERTEX") break;
        const vertexEnd = findNextEntity(pairs, cursor + 1);
        const vertex = pairs.slice(cursor + 1, vertexEnd);
        const x = toFiniteNumber(vertex.find((item) => item.code === 10)?.value);
        const y = toFiniteNumber(vertex.find((item) => item.code === 20)?.value);
        if (x !== null && y !== null) points.push({ x, y });
        cursor = vertexEnd;
      }

      const cleaned = cleanDxfPoints(points);
      if (cleaned.length >= 3) {
        polyCount += 1;
        result.push({
          name: `POLYLINE ${polyCount}`,
          layer,
          points: cleaned,
          closed: (flags & 1) === 1 || isClosed(points),
        });
      }
      index = cursor;
      continue;
    }
    index += 1;
  }

  return result.sort((a, b) => {
    if (a.closed !== b.closed) return a.closed ? -1 : 1;
    const layer = a.layer.localeCompare(b.layer, undefined, { sensitivity: "base" });
    return layer !== 0 ? layer : a.name.localeCompare(b.name);
  });
}

export function dxfPolylineToLatLng(polyline: DxfPolyline, crs: DxfCrs): GeoPoint[] {
  const converted = polyline.points.map((point) => {
    if (crs === "LAT_LON") {
      if (point.y < -90 || point.y > 90 || point.x < -180 || point.x > 180) {
        throw new Error("As coordenadas não parecem estar em latitude/longitude.");
      }
      return { lat: point.y, lng: point.x };
    }
    const zone = crs === "SIRGAS_2000_UTM_22S" ? 22 : 23;
    return utmToLatLng(point.x, point.y, zone, true);
  });
  if (converted.length < 3) throw new Error("A polilinha selecionada não possui vértices suficientes.");
  return stripDuplicateClosingPoint(converted);
}

export function utmToLatLng(easting: number, northing: number, zone: number, southernHemisphere: boolean): GeoPoint {
  if (zone < 1 || zone > 60) throw new Error("Fuso UTM inválido.");
  if (easting < 100000 || easting > 900000) throw new Error("Coordenada Este UTM fora do intervalo esperado.");
  if (northing < 0 || northing > 10000000) throw new Error("Coordenada Norte UTM fora do intervalo esperado.");

  const a = 6378137;
  const inverseFlattening = 298.257222101;
  const f = 1 / inverseFlattening;
  const e2 = f * (2 - f);
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const k0 = 0.9996;
  const x = easting - 500000;
  let y = northing;
  if (southernHemisphere) y -= 10000000;
  const m = y / k0;
  const mu = m / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const j1 = 3 * e1 / 2 - 27 * e1 ** 3 / 32;
  const j2 = 21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32;
  const j3 = 151 * e1 ** 3 / 96;
  const j4 = 1097 * e1 ** 4 / 512;
  const fp = mu + j1 * Math.sin(2 * mu) + j2 * Math.sin(4 * mu) + j3 * Math.sin(6 * mu) + j4 * Math.sin(8 * mu);
  const ePrime2 = e2 / (1 - e2);
  const sinFp = Math.sin(fp);
  const cosFp = Math.cos(fp);
  const tanFp = Math.tan(fp);
  const c1 = ePrime2 * cosFp ** 2;
  const t1 = tanFp ** 2;
  const n1 = a / Math.sqrt(1 - e2 * sinFp ** 2);
  const r1 = a * (1 - e2) / (1 - e2 * sinFp ** 2) ** 1.5;
  const d = x / (n1 * k0);
  const latRad = fp - (n1 * tanFp / r1) * (
    d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ePrime2) * d ** 4 / 24 +
    (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ePrime2 - 3 * c1 ** 2) * d ** 6 / 720
  );
  const lonOriginDeg = (zone - 1) * 6 - 180 + 3;
  const lonRad = (
    d - (1 + 2 * t1 + c1) * d ** 3 / 6 +
    (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ePrime2 + 24 * t1 ** 2) * d ** 5 / 120
  ) / cosFp;
  const lat = latRad * 180 / Math.PI;
  const lng = lonOriginDeg + lonRad * 180 / Math.PI;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error("Falha ao converter coordenadas UTM.");
  return { lat, lng };
}

function parseCoordinateText(text: string): GeoPoint[] {
  return text
    .replaceAll("\r", " ")
    .replaceAll("\n", " ")
    .replaceAll("\t", " ")
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const parts = token.split(",");
      if (parts.length < 2) return null;
      const lng = Number(parts[0]);
      const lat = Number(parts[1]);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    })
    .filter((point): point is GeoPoint => point !== null);
}

function firstElementByLocalName(doc: Document, name: string): Element | null {
  const elements = Array.from(doc.getElementsByTagName("*"));
  return elements.find((item) => item.localName.toLocaleLowerCase() === name.toLocaleLowerCase()) ?? null;
}

function firstDescendantByLocalName(element: Element, name: string): Element | null {
  return Array.from(element.getElementsByTagName("*")).find((item) => item.localName.toLocaleLowerCase() === name.toLocaleLowerCase()) ?? null;
}

function elementsByLocalName(doc: Document, name: string): Element[] {
  return Array.from(doc.getElementsByTagName("*")).filter((item) => item.localName.toLocaleLowerCase() === name.toLocaleLowerCase());
}

function stripDuplicateClosingPoint(points: GeoPoint[]): GeoPoint[] {
  if (points.length <= 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.abs(first.lat - last.lat) < 1e-9 && Math.abs(first.lng - last.lng) < 1e-9) return points.slice(0, -1);
  return points;
}

function scoreKmlEntry(name: string): number {
  const lower = name.toLocaleLowerCase();
  if (lower.endsWith("wpmz/template.kml")) return 0;
  if (lower.endsWith("template.kml")) return 1;
  if (lower.endsWith(".kml")) return 2;
  return 3;
}

function normalizeLines(text: string): string[] {
  return text.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
}

function findNextEntity(pairs: Array<{ code: number; value: string }>, start: number): number {
  for (let i = start; i < pairs.length; i += 1) if (pairs[i].code === 0) return i;
  return pairs.length;
}

function cleanDxfPoints(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const output: Array<{ x: number; y: number }> = [];
  for (const point of points) {
    const last = output[output.length - 1];
    if (!last || !samePoint(last, point)) output.push(point);
  }
  if (output.length > 1 && samePoint(output[0], output[output.length - 1])) output.pop();
  return output;
}

function isClosed(points: Array<{ x: number; y: number }>): boolean {
  return points.length > 2 && samePoint(points[0], points[points.length - 1]);
}

function samePoint(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < 1e-7 && Math.abs(a.y - b.y) < 1e-7;
}

function toFiniteNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
