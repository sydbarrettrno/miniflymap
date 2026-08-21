import type { GeoPoint, MissionPlan, MissionSettings } from "../domain/models";

export const WPML_NAMESPACE = "http://www.uav.com/wpmz/1.0.2";

export type KmzFiles = {
  templateKml: string;
  waylinesWpml: string;
  fileName: string;
};

export function buildKmzFiles(plan: MissionPlan, partIndex: number, missionName = "NV_Mapping"): KmzFiles {
  if (partIndex < 0 || partIndex >= plan.parts.length) throw new Error("Parte de missão inválida.");
  const points = plan.parts[partIndex];
  if (points.length < 2) throw new Error("A parte selecionada possui menos de dois waypoints.");
  const name = plan.parts.length > 1
    ? `${missionName}_part_${partIndex + 1}_of_${plan.parts.length}`
    : missionName;
  const timestamp = Date.now();
  return {
    templateKml: templateKml(plan, name, timestamp),
    waylinesWpml: waylinesWpml(plan, points),
    fileName: `${name}.kmz`,
  };
}

export function buildPreviewKml(plan: MissionPlan): string {
  const boundary = [...plan.boundary, plan.boundary[0]]
    .map((p) => `${fixed(p.lng, 8)},${fixed(p.lat, 8)},0`)
    .join(" ");
  const route = plan.waypoints
    .map((p) => `${fixed(p.lng, 8)},${fixed(p.lat, 8)},${n(plan.settings.altitudeM)}`)
    .join(" ");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n  <name>NV Drone Mapping - Preview</name>\n  <Placemark><name>Área</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${boundary}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>\n  <Placemark><name>Rota</name><LineString><altitudeMode>relativeToGround</altitudeMode><coordinates>${route}</coordinates></LineString></Placemark>\n</Document>\n</kml>\n`;
}

export function validateWpmlFiles(files: KmzFiles, expectedWaypointCount: number): string[] {
  const errors: string[] = [];
  if (!files.templateKml.includes(`xmlns:wpml="${WPML_NAMESPACE}"`)) errors.push("Namespace WPML ausente em template.kml.");
  if (!files.waylinesWpml.includes(`xmlns:wpml="${WPML_NAMESPACE}"`)) errors.push("Namespace WPML ausente em waylines.wpml.");
  if (!files.templateKml.includes("<wpml:templateType>waypoint</wpml:templateType>")) errors.push("template.kml sem templateType waypoint.");
  const waypointCount = countOccurrences(files.waylinesWpml, "<wpml:index>");
  const photoCount = countOccurrences(files.waylinesWpml, "<wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>");
  if (waypointCount !== expectedWaypointCount) errors.push(`WPML contém ${waypointCount} waypoints; esperado ${expectedWaypointCount}.`);
  if (photoCount !== expectedWaypointCount) errors.push(`WPML contém ${photoCount} ações de foto; esperado ${expectedWaypointCount}.`);
  if (!files.waylinesWpml.includes("toPointAndStopWithDiscontinuityCurvature")) errors.push("Modo de curva esperado não encontrado.");
  return errors;
}

function templateKml(plan: MissionPlan, missionName: string, timestamp: number): string {
  const s = plan.settings;
  const config = missionConfig(s);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="${WPML_NAMESPACE}">\n<Document>\n  <wpml:author>${escapeXml(missionName)}</wpml:author>\n  <wpml:createTime>${timestamp}</wpml:createTime>\n  <wpml:updateTime>${timestamp}</wpml:updateTime>\n${config}\n  <Folder>\n    <wpml:templateType>waypoint</wpml:templateType>\n    <wpml:templateId>0</wpml:templateId>\n    <wpml:waylineCoordinateSysParam>\n      <wpml:coordinateMode>WGS84</wpml:coordinateMode>\n      <wpml:heightMode>relativeToStartPoint</wpml:heightMode>\n      <wpml:positioningType>GPS</wpml:positioningType>\n    </wpml:waylineCoordinateSysParam>\n    <wpml:autoFlightSpeed>${n(s.speedMs)}</wpml:autoFlightSpeed>\n    <wpml:globalHeight>${n(s.altitudeM)}</wpml:globalHeight>\n    <wpml:caliFlightEnable>0</wpml:caliFlightEnable>\n    <wpml:gimbalPitchMode>usePointSetting</wpml:gimbalPitchMode>\n  </Folder>\n</Document>\n</kml>\n`;
}

function waylinesWpml(plan: MissionPlan, points: GeoPoint[]): string {
  const s = plan.settings;
  const config = missionConfig(s);
  let groupId = 1;
  const placemarks = points.map((point, index) => {
    let actions = "";
    if (index === 0) actions += gimbalAction(groupId++, index, s.gimbalPitchDeg);
    actions += takePhotoAction(groupId++, index);
    return placemark(index, point, s.altitudeM, s.speedMs, s.gimbalPitchDeg, actions);
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="${WPML_NAMESPACE}">\n<Document>\n${config}\n  <Folder>\n    <wpml:templateId>0</wpml:templateId>\n    <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>\n    <wpml:waylineId>0</wpml:waylineId>\n    <wpml:distance>0</wpml:distance>\n    <wpml:duration>0</wpml:duration>\n    <wpml:autoFlightSpeed>${n(s.speedMs)}</wpml:autoFlightSpeed>\n${placemarks}\n  </Folder>\n</Document>\n</kml>\n`;
}

function missionConfig(settings: MissionSettings): string {
  const exitOnLost = settings.rcLostAction === "goContinue" ? "goContinue" : "executeLostAction";
  const executeLost = settings.rcLostAction === "goContinue" ? "goBack" : settings.rcLostAction;
  const transitional = Math.min(settings.speedMs, 5);
  return `  <wpml:missionConfig>\n    <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>\n    <wpml:finishAction>${settings.finishAction}</wpml:finishAction>\n    <wpml:exitOnRCLost>${exitOnLost}</wpml:exitOnRCLost>\n    <wpml:executeRCLostAction>${executeLost}</wpml:executeRCLostAction>\n    <wpml:globalTransitionalSpeed>${n(transitional)}</wpml:globalTransitionalSpeed>\n    <wpml:droneInfo>\n      <wpml:droneEnumValue>${settings.droneEnumValue}</wpml:droneEnumValue>\n      <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>\n    </wpml:droneInfo>\n  </wpml:missionConfig>`;
}

function placemark(index: number, point: GeoPoint, altitude: number, speed: number, pitch: number, actions: string): string {
  return `    <Placemark>\n      <Point><coordinates>${fixed(point.lng, 8)},${fixed(point.lat, 8)}</coordinates></Point>\n      <wpml:index>${index}</wpml:index>\n      <wpml:executeHeight>${n(altitude)}</wpml:executeHeight>\n      <wpml:waypointSpeed>${n(speed)}</wpml:waypointSpeed>\n      <wpml:waypointHeadingParam>\n        <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>\n        <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>\n        <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>\n        <wpml:waypointHeadingAngleEnable>0</wpml:waypointHeadingAngleEnable>\n        <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>\n        <wpml:waypointHeadingPoiIndex>0</wpml:waypointHeadingPoiIndex>\n      </wpml:waypointHeadingParam>\n      <wpml:waypointTurnParam>\n        <wpml:waypointTurnMode>toPointAndStopWithDiscontinuityCurvature</wpml:waypointTurnMode>\n        <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>\n      </wpml:waypointTurnParam>\n      <wpml:useStraightLine>1</wpml:useStraightLine>\n${actions}      <wpml:waypointGimbalHeadingParam>\n        <wpml:waypointGimbalPitchAngle>${n(pitch)}</wpml:waypointGimbalPitchAngle>\n        <wpml:waypointGimbalYawAngle>0</wpml:waypointGimbalYawAngle>\n      </wpml:waypointGimbalHeadingParam>\n    </Placemark>`;
}

function takePhotoAction(groupId: number, index: number): string {
  return `      <wpml:actionGroup>\n        <wpml:actionGroupId>${groupId}</wpml:actionGroupId>\n        <wpml:actionGroupStartIndex>${index}</wpml:actionGroupStartIndex>\n        <wpml:actionGroupEndIndex>${index}</wpml:actionGroupEndIndex>\n        <wpml:actionGroupMode>parallel</wpml:actionGroupMode>\n        <wpml:actionTrigger><wpml:actionTriggerType>reachPoint</wpml:actionTriggerType></wpml:actionTrigger>\n        <wpml:action>\n          <wpml:actionId>${groupId}</wpml:actionId>\n          <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>\n          <wpml:actionActuatorFuncParam><wpml:payloadPositionIndex>0</wpml:payloadPositionIndex></wpml:actionActuatorFuncParam>\n        </wpml:action>\n      </wpml:actionGroup>\n`;
}

function gimbalAction(groupId: number, index: number, pitch: number): string {
  return `      <wpml:actionGroup>\n        <wpml:actionGroupId>${groupId}</wpml:actionGroupId>\n        <wpml:actionGroupStartIndex>${index}</wpml:actionGroupStartIndex>\n        <wpml:actionGroupEndIndex>${index}</wpml:actionGroupEndIndex>\n        <wpml:actionGroupMode>parallel</wpml:actionGroupMode>\n        <wpml:actionTrigger><wpml:actionTriggerType>reachPoint</wpml:actionTriggerType></wpml:actionTrigger>\n        <wpml:action>\n          <wpml:actionId>${groupId}</wpml:actionId>\n          <wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>\n          <wpml:actionActuatorFuncParam>\n            <wpml:gimbalHeadingYawBase>aircraft</wpml:gimbalHeadingYawBase>\n            <wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>\n            <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>\n            <wpml:gimbalPitchRotateAngle>${n(pitch)}</wpml:gimbalPitchRotateAngle>\n            <wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable>\n            <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>\n            <wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable>\n            <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>\n            <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>\n            <wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>\n            <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>\n          </wpml:actionActuatorFuncParam>\n        </wpml:action>\n      </wpml:actionGroup>\n`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function n(value: number): string {
  return value.toFixed(1);
}

function fixed(value: number, digits: number): string {
  return value.toFixed(digits);
}

function countOccurrences(text: string, token: string): number {
  let count = 0;
  let index = 0;
  while (true) {
    const next = text.indexOf(token, index);
    if (next < 0) return count;
    count += 1;
    index = next + token.length;
  }
}
