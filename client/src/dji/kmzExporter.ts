import type { GeoPoint, MissionPlan, MissionSettings } from "../domain/models";

/**
 * Independent WPML writer.
 *
 * This module is intentionally implemented from DJI's published WPML field
 * definitions plus independently observed DJI Fly mission metadata. It does
 * not depend on, import, or reproduce third-party WPML writer source code.
 * See docs/WPML_PROVENANCE.md.
 */

export const DJI_STANDARD_WPML_NAMESPACE = "http://www.dji.com/wpmz/1.0.2";
export const DJI_FLY_CONSUMER_WPML_NAMESPACE = "http://www.uav.com/wpmz/1.0.2";

export type WpmlProfile = "dji-fly-consumer" | "dji-standard";

export type KmzFiles = {
  templateKml: string;
  waylinesWpml: string;
  fileName: string;
  profile: WpmlProfile;
  namespace: string;
};

export type BuildKmzOptions = {
  profile?: WpmlProfile;
  createdAtMs?: number;
};

type XmlNode = {
  tag: string;
  value?: string | number;
  children?: XmlNode[];
};

const TURN_MODE = "toPointAndStopWithDiscontinuityCurvature";

export function buildKmzFiles(
  plan: MissionPlan,
  partIndex: number,
  missionName = "NV_Mapping",
  options: BuildKmzOptions = {},
): KmzFiles {
  if (!Number.isInteger(partIndex) || partIndex < 0 || partIndex >= plan.parts.length) {
    throw new Error("Parte de missão inválida.");
  }

  const points = plan.parts[partIndex];
  if (points.length < 2) throw new Error("A parte selecionada possui menos de dois waypoints.");

  const profile = options.profile ?? "dji-fly-consumer";
  const namespace = namespaceFor(profile);
  const timestamp = options.createdAtMs ?? Date.now();
  const safeName = sanitizeMissionName(
    plan.parts.length > 1
      ? `${missionName}_part_${partIndex + 1}_of_${plan.parts.length}`
      : missionName,
  );

  return {
    templateKml: buildTemplateDocument(plan.settings, safeName, timestamp, namespace),
    waylinesWpml: buildWaylinesDocument(plan.settings, points, safeName, namespace),
    fileName: `${safeName}.kmz`,
    profile,
    namespace,
  };
}

export function buildPreviewKml(plan: MissionPlan): string {
  const boundary = [...plan.boundary, plan.boundary[0]]
    .map((p) => `${decimal(p.lng, 8)},${decimal(p.lat, 8)},0`)
    .join(" ");
  const route = plan.waypoints
    .map((p) => `${decimal(p.lng, 8)},${decimal(p.lat, 8)},${decimal(plan.settings.altitudeM, 1)}`)
    .join(" ");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    "<Document>",
    "  <name>NV Drone Mapping - Preview</name>",
    `  <Placemark><name>Área</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${boundary}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`,
    `  <Placemark><name>Rota</name><LineString><altitudeMode>relativeToGround</altitudeMode><coordinates>${route}</coordinates></LineString></Placemark>`,
    "</Document>",
    "</kml>",
    "",
  ].join("\n");
}

export function validateWpmlFiles(files: KmzFiles, expectedWaypointCount: number): string[] {
  const errors: string[] = [];
  const namespaceMarker = `xmlns:wpml="${files.namespace}"`;

  if (!files.templateKml.includes(namespaceMarker)) errors.push("Namespace WPML ausente em template.kml.");
  if (!files.waylinesWpml.includes(namespaceMarker)) errors.push("Namespace WPML ausente em waylines.wpml.");
  if (!files.templateKml.includes("<wpml:templateType>waypoint</wpml:templateType>")) {
    errors.push("template.kml sem templateType waypoint.");
  }

  const waypointCount = countOccurrences(files.waylinesWpml, "<wpml:index>");
  const photoCount = countOccurrences(files.waylinesWpml, "<wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>");

  if (waypointCount !== expectedWaypointCount) {
    errors.push(`WPML contém ${waypointCount} waypoints; esperado ${expectedWaypointCount}.`);
  }
  if (photoCount !== expectedWaypointCount) {
    errors.push(`WPML contém ${photoCount} ações de foto; esperado ${expectedWaypointCount}.`);
  }
  if (!files.waylinesWpml.includes(`<wpml:waypointTurnMode>${TURN_MODE}</wpml:waypointTurnMode>`)) {
    errors.push("Modo de curva esperado não encontrado.");
  }
  if (!files.waylinesWpml.includes("<wpml:actionGroupMode>sequence</wpml:actionGroupMode>")) {
    errors.push("Grupos de ação não usam execução sequencial.");
  }
  if (files.waylinesWpml.includes("<wpml:actionGroupMode>parallel</wpml:actionGroupMode>")) {
    errors.push("Modo de ação parallel não é emitido por este exportador.");
  }
  if (!files.waylinesWpml.includes("<wpml:useStraightLine>1</wpml:useStraightLine>")) {
    errors.push("Configuração de segmento reto ausente.");
  }

  return errors;
}

function namespaceFor(profile: WpmlProfile): string {
  return profile === "dji-standard" ? DJI_STANDARD_WPML_NAMESPACE : DJI_FLY_CONSUMER_WPML_NAMESPACE;
}

function buildTemplateDocument(
  settings: MissionSettings,
  missionName: string,
  timestamp: number,
  namespace: string,
): string {
  const folder: XmlNode = {
    tag: "Folder",
    children: [
      node("wpml:templateType", "waypoint"),
      node("wpml:templateId", 0),
      {
        tag: "wpml:waylineCoordinateSysParam",
        children: [
          node("wpml:coordinateMode", "WGS84"),
          node("wpml:heightMode", "relativeToStartPoint"),
          node("wpml:positioningType", "GPS"),
        ],
      },
      node("wpml:autoFlightSpeed", decimal(settings.speedMs, 1)),
      node("wpml:globalHeight", decimal(settings.altitudeM, 1)),
      {
        tag: "wpml:globalWaypointHeadingParam",
        children: [
          node("wpml:waypointHeadingMode", "followWayline"),
          node("wpml:waypointHeadingPathMode", "followBadArc"),
        ],
      },
      node("wpml:globalWaypointTurnMode", TURN_MODE),
      node("wpml:globalUseStraightLine", 1),
    ],
  };

  return kmlDocument(namespace, [
    node("name", missionName),
    node("wpml:author", "NV Drone Mapping"),
    node("wpml:createTime", timestamp),
    node("wpml:updateTime", timestamp),
    missionConfigNode(settings),
    folder,
  ]);
}

function buildWaylinesDocument(
  settings: MissionSettings,
  points: GeoPoint[],
  missionName: string,
  namespace: string,
): string {
  const placemarks = points.map((point, index) => waypointNode(point, index, settings));

  return kmlDocument(namespace, [
    node("name", missionName),
    missionConfigNode(settings),
    {
      tag: "Folder",
      children: [
        node("wpml:templateId", 0),
        node("wpml:executeHeightMode", "relativeToStartPoint"),
        node("wpml:waylineId", 0),
        node("wpml:autoFlightSpeed", decimal(settings.speedMs, 1)),
        ...placemarks,
      ],
    },
  ]);
}

function missionConfigNode(settings: MissionSettings): XmlNode {
  const continuing = settings.rcLostAction === "goContinue";
  const exitOnLost = continuing ? "goContinue" : "executeLostAction";
  const executeLost = continuing ? "goBack" : settings.rcLostAction;

  return {
    tag: "wpml:missionConfig",
    children: [
      node("wpml:flyToWaylineMode", "safely"),
      node("wpml:finishAction", settings.finishAction),
      node("wpml:exitOnRCLost", exitOnLost),
      node("wpml:executeRCLostAction", executeLost),
      node("wpml:globalTransitionalSpeed", decimal(settings.speedMs, 1)),
      {
        tag: "wpml:droneInfo",
        children: [
          node("wpml:droneEnumValue", settings.droneEnumValue),
          node("wpml:droneSubEnumValue", 0),
        ],
      },
    ],
  };
}

function waypointNode(point: GeoPoint, index: number, settings: MissionSettings): XmlNode {
  return {
    tag: "Placemark",
    children: [
      {
        tag: "Point",
        children: [node("coordinates", `${decimal(point.lng, 8)},${decimal(point.lat, 8)}`)],
      },
      node("wpml:index", index),
      node("wpml:executeHeight", decimal(settings.altitudeM, 1)),
      node("wpml:waypointSpeed", decimal(settings.speedMs, 1)),
      {
        tag: "wpml:waypointHeadingParam",
        children: [
          node("wpml:waypointHeadingMode", "followWayline"),
          node("wpml:waypointHeadingPathMode", "followBadArc"),
        ],
      },
      {
        tag: "wpml:waypointTurnParam",
        children: [
          node("wpml:waypointTurnMode", TURN_MODE),
          node("wpml:waypointTurnDampingDist", 0),
        ],
      },
      node("wpml:useStraightLine", 1),
      actionGroupNode(index, settings.gimbalPitchDeg, index === 0),
    ],
  };
}

function actionGroupNode(index: number, pitchDeg: number, includeGimbal: boolean): XmlNode {
  const actions: XmlNode[] = [];
  let actionId = 0;

  if (includeGimbal) {
    actions.push(gimbalRotateAction(actionId++, pitchDeg));
  }
  actions.push(takePhotoAction(actionId));

  return {
    tag: "wpml:actionGroup",
    children: [
      node("wpml:actionGroupId", index),
      node("wpml:actionGroupStartIndex", index),
      node("wpml:actionGroupEndIndex", index),
      node("wpml:actionGroupMode", "sequence"),
      {
        tag: "wpml:actionTrigger",
        children: [node("wpml:actionTriggerType", "reachPoint")],
      },
      ...actions,
    ],
  };
}

function gimbalRotateAction(actionId: number, pitchDeg: number): XmlNode {
  return {
    tag: "wpml:action",
    children: [
      node("wpml:actionId", actionId),
      node("wpml:actionActuatorFunc", "gimbalRotate"),
      {
        tag: "wpml:actionActuatorFuncParam",
        children: [
          node("wpml:payloadPositionIndex", 0),
          node("wpml:gimbalHeadingYawBase", "north"),
          node("wpml:gimbalRotateMode", "absoluteAngle"),
          node("wpml:gimbalPitchRotateEnable", 1),
          node("wpml:gimbalPitchRotateAngle", decimal(pitchDeg, 1)),
          node("wpml:gimbalRollRotateEnable", 0),
          node("wpml:gimbalRollRotateAngle", 0),
          node("wpml:gimbalYawRotateEnable", 0),
          node("wpml:gimbalYawRotateAngle", 0),
          node("wpml:gimbalRotateTimeEnable", 0),
          node("wpml:gimbalRotateTime", 0),
        ],
      },
    ],
  };
}

function takePhotoAction(actionId: number): XmlNode {
  return {
    tag: "wpml:action",
    children: [
      node("wpml:actionId", actionId),
      node("wpml:actionActuatorFunc", "takePhoto"),
      {
        tag: "wpml:actionActuatorFuncParam",
        children: [node("wpml:payloadPositionIndex", 0)],
      },
    ],
  };
}

function kmlDocument(namespace: string, documentChildren: XmlNode[]): string {
  const body = renderNode({ tag: "Document", children: documentChildren }, 1);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="${escapeXml(namespace)}">`,
    body,
    "</kml>",
    "",
  ].join("\n");
}

function node(tag: string, value: string | number): XmlNode {
  return { tag, value };
}

function renderNode(xmlNode: XmlNode, depth: number): string {
  const indent = "  ".repeat(depth);
  if (xmlNode.children?.length) {
    const children = xmlNode.children.map((child) => renderNode(child, depth + 1)).join("\n");
    return `${indent}<${xmlNode.tag}>\n${children}\n${indent}</${xmlNode.tag}>`;
  }
  return `${indent}<${xmlNode.tag}>${escapeXml(String(xmlNode.value ?? ""))}</${xmlNode.tag}>`;
}

function sanitizeMissionName(value: string): string {
  const trimmed = value.trim() || "NV_Mapping";
  return trimmed.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 96);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function decimal(value: number, digits: number): string {
  if (!Number.isFinite(value)) throw new Error("Valor numérico inválido no WPML.");
  return value.toFixed(digits);
}

function countOccurrences(text: string, token: string): number {
  let count = 0;
  let cursor = 0;
  while (cursor < text.length) {
    const found = text.indexOf(token, cursor);
    if (found < 0) break;
    count += 1;
    cursor = found + token.length;
  }
  return count;
}
