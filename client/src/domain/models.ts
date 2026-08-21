export type GeoPoint = { lat: number; lng: number };

export type MissionSettings = {
  altitudeM: number;
  speedMs: number;
  frontOverlapPct: number;
  sideOverlapPct: number;
  bearingDeg: number;
  autoBearing: boolean;
  crossHatch: boolean;
  gimbalPitchDeg: number;
  maxWaypointsPerMission: number;
  droneEnumValue: number;
  finishAction: "goHome" | "noAction" | "autoLand" | "gotoFirstWaypoint";
  rcLostAction: "goBack" | "landing" | "hover" | "goContinue";
};

export type CameraModel = {
  name: string;
  diagonalFovDeg: number;
  imageWidthPx: number;
  imageHeightPx: number;
  aspectWidth: number;
  aspectHeight: number;
};

export type MissionStats = {
  areaM2: number;
  gsdCmPx: number;
  groundWidthM: number;
  groundHeightM: number;
  lineSpacingM: number;
  photoSpacingM: number;
  routeDistanceM: number;
  estimatedFlightSeconds: number;
  photoCount: number;
  flightLineCount: number;
  partCount: number;
  effectiveBearingDeg: number;
};

export type MissionPlan = {
  boundary: GeoPoint[];
  waypoints: GeoPoint[];
  parts: GeoPoint[][];
  settings: MissionSettings;
  stats: MissionStats;
};

export type SavedProject = {
  name: string;
  boundary: GeoPoint[];
  settings: MissionSettings;
  savedAtMs: number;
  referenceBoundary: GeoPoint[];
  preferredStart: GeoPoint | null;
  plan: MissionPlan | null;
};

export const DEFAULT_SETTINGS: MissionSettings = {
  altitudeM: 60,
  speedMs: 5,
  frontOverlapPct: 80,
  sideOverlapPct: 70,
  bearingDeg: 0,
  autoBearing: true,
  crossHatch: false,
  gimbalPitchDeg: -90,
  maxWaypointsPerMission: 190,
  droneEnumValue: 68,
  finishAction: "goHome",
  rcLostAction: "goBack",
};

export const CAMERA_MINI_5_PRO: CameraModel = {
  name: "DJI Mini 5 Pro - câmera principal",
  diagonalFovDeg: 84,
  imageWidthPx: 8192,
  imageHeightPx: 6144,
  aspectWidth: 4,
  aspectHeight: 3,
};
