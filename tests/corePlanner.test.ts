import { describe, expect, it } from "vitest";
import { buildKmzFiles, validateWpmlFiles } from "../client/src/dji/kmzExporter";
import { orientTowardStart, planMission, reverseMission } from "../client/src/domain/gridPlanner";
import { DEFAULT_SETTINGS, type GeoPoint } from "../client/src/domain/models";

function rect(centerLat: number, centerLng: number, widthM: number, heightM: number): GeoPoint[] {
  const latDeg = heightM / 111320 / 2;
  const lonDeg = widthM / (111320 * Math.cos(centerLat * Math.PI / 180)) / 2;
  return [
    { lat: centerLat - latDeg, lng: centerLng - lonDeg },
    { lat: centerLat - latDeg, lng: centerLng + lonDeg },
    { lat: centerLat + latDeg, lng: centerLng + lonDeg },
    { lat: centerLat + latDeg, lng: centerLng - lonDeg },
  ];
}

describe("GridPlanner parity", () => {
  it("gera uma linha em polígono estreito", () => {
    const plan = planMission(rect(-26.1, -48.62, 8, 100), { ...DEFAULT_SETTINGS });
    expect(plan.waypoints.length).toBeGreaterThanOrEqual(2);
    expect(plan.stats.flightLineCount).toBeGreaterThanOrEqual(1);
  });

  it("divide missão densa sem ultrapassar o limite", () => {
    const plan = planMission(rect(-26.1, -48.62, 600, 600), {
      ...DEFAULT_SETTINGS,
      altitudeM: 30,
      frontOverlapPct: 90,
      sideOverlapPct: 90,
    });
    expect(plan.parts.length).toBeGreaterThan(1);
    expect(plan.parts.every((part) => part.length <= 190)).toBe(true);
    expect(plan.parts.slice(1).every((part, index) => {
      const previous = plan.parts[index];
      const first = part[0];
      const lastPrevious = previous[previous.length - 1];
      return Math.abs(first.lat - lastPrevious.lat) < 1e-10 && Math.abs(first.lng - lastPrevious.lng) < 1e-10;
    })).toBe(true);
  });

  it("calcula estatísticas reais da missão", () => {
    const plan = planMission(rect(-26.1, -48.62, 120, 80), { ...DEFAULT_SETTINGS });
    expect(plan.stats.areaM2).toBeGreaterThan(9500);
    expect(plan.stats.areaM2).toBeLessThan(9700);
    expect(plan.stats.photoCount).toBe(plan.waypoints.length);
    expect(plan.stats.routeDistanceM).toBeGreaterThan(0);
    expect(plan.stats.gsdCmPx).toBeGreaterThan(0);
    expect(plan.stats.photoSpacingM).toBeGreaterThan(0);
    expect(plan.stats.lineSpacingM).toBeGreaterThan(0);
  });

  it("cross-hatch adiciona uma segunda direção", () => {
    const normal = planMission(rect(-26.1, -48.62, 120, 80), { ...DEFAULT_SETTINGS });
    const cross = planMission(rect(-26.1, -48.62, 120, 80), { ...DEFAULT_SETTINGS, crossHatch: true });
    expect(cross.stats.flightLineCount).toBeGreaterThan(normal.stats.flightLineCount);
    expect(cross.stats.photoCount).toBeGreaterThan(normal.stats.photoCount);
  });

  it("orienta a missão para o ponto inicial preferido", () => {
    const base = planMission(rect(-26.1, -48.62, 120, 80), { ...DEFAULT_SETTINGS });
    const target = base.waypoints[base.waypoints.length - 1];
    const oriented = orientTowardStart(base, target);
    expect(oriented.waypoints[0].lat).toBeCloseTo(target.lat, 10);
    expect(oriented.waypoints[0].lng).toBeCloseTo(target.lng, 10);
  });

  it("inverte rota e recompõe partes", () => {
    const base = planMission(rect(-26.1, -48.62, 120, 80), { ...DEFAULT_SETTINGS });
    const reversed = reverseMission(base);
    expect(reversed.waypoints[0]).toEqual(base.waypoints[base.waypoints.length - 1]);
    expect(reversed.waypoints[reversed.waypoints.length - 1]).toEqual(base.waypoints[0]);
  });
});

describe("DJI WPML exporter", () => {
  it("gera template.kml e waylines.wpml compatíveis com o formato do APK", () => {
    const plan = planMission(rect(-26.1, -48.62, 120, 80), { ...DEFAULT_SETTINGS });
    const files = buildKmzFiles(plan, 0, "Unit_Test");
    expect(validateWpmlFiles(files, plan.parts[0].length)).toEqual([]);
    expect(files.templateKml).toContain("<wpml:templateType>waypoint</wpml:templateType>");
    expect(files.waylinesWpml).toContain("<wpml:droneEnumValue>68</wpml:droneEnumValue>");
    expect(files.waylinesWpml).toContain("<wpml:finishAction>goHome</wpml:finishAction>");
    expect(files.waylinesWpml).toContain("<wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>");
  });

  it("cria exatamente uma ação takePhoto por waypoint", () => {
    const plan = planMission(rect(-26.1, -48.62, 120, 80), { ...DEFAULT_SETTINGS });
    const files = buildKmzFiles(plan, 0, "Unit_Test");
    const token = "<wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>";
    let count = 0;
    let cursor = 0;
    while (true) {
      const next = files.waylinesWpml.indexOf(token, cursor);
      if (next < 0) break;
      count += 1;
      cursor = next + token.length;
    }
    expect(count).toBe(plan.parts[0].length);
  });
});
