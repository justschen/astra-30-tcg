import { CITY_GROUND, CITY_UNITS_PER_METRE, HERO_BUILDINGS, PARK, TOWER, inPark } from './city-layout.js';

export const SURVEY_SOURCE = 'https://assets.cms.plateau.reearth.io/assets/c7/ffcc73-1d33-434b-a49a-aa0289160814/13103_minato-ku_pref_2025_citygml_1_op_bldg_3dtiles_13103_minato-ku_lod3/tileset.json';
export const SURVEY_BOUNDS = Object.freeze({ left: -260, right: 290, near: -138, far: -650 });
export const SURVEY_ORIGIN = Object.freeze({ longitude: 139.74543, latitude: 35.65858, bearing: -71, scale: CITY_UNITS_PER_METRE });

const radians = Math.PI / 180;
const lon = SURVEY_ORIGIN.longitude * radians, lat = SURVEY_ORIGIN.latitude * radians;
const bearing = SURVEY_ORIGIN.bearing * radians;
const east = [-Math.sin(lon), Math.cos(lon), 0];
const north = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)];
const up = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function geographicToECEF(longitude, latitude, altitude = 0) {
  const phi = latitude * radians, lambda = longitude * radians;
  const eccentricitySquared = 6.69437999014e-3;
  const radius = 6378137 / Math.sqrt(1 - eccentricitySquared * Math.sin(phi) ** 2);
  return [
    (radius + altitude) * Math.cos(phi) * Math.cos(lambda),
    (radius + altitude) * Math.cos(phi) * Math.sin(lambda),
    (radius * (1 - eccentricitySquared) + altitude) * Math.sin(phi),
  ];
}

const originECEF = geographicToECEF(SURVEY_ORIGIN.longitude, SURVEY_ORIGIN.latitude);

function orient(ecef) {
  const e = dot(east, ecef), n = dot(north, ecef);
  return [
    e * Math.cos(bearing) - n * Math.sin(bearing),
    dot(up, ecef),
    -e * Math.sin(bearing) - n * Math.cos(bearing),
  ];
}

export function surveyPoint(center, point) {
  // 3D Tiles applies glTF's Y-up to Z-up rotation before the ECEF RTC translation.
  const delta = [center[0] + point[0] - originECEF[0], center[1] - point[2] - originECEF[1], center[2] + point[1] - originECEF[2]];
  const local = orient(delta);
  return [TOWER.x + local[0] * SURVEY_ORIGIN.scale, CITY_GROUND + local[1] * SURVEY_ORIGIN.scale, TOWER.z + local[2] * SURVEY_ORIGIN.scale];
}

export function surveyNormal(normal) {
  return orient([normal[0], -normal[2], normal[1]]);
}

export function surveyLocation(longitude, latitude) {
  return surveyPoint(geographicToECEF(longitude, latitude), [0, 0, 0]);
}

export function inSurveyArea(x, z) {
  return x >= SURVEY_BOUNDS.left && x <= SURVEY_BOUNDS.right && z <= SURVEY_BOUNDS.near && z >= SURVEY_BOUNDS.far;
}

export function keepAuthoredBuilding(spec) {
  return spec.hero && (spec.z > SURVEY_BOUNDS.near || inPark(spec.x, spec.z));
}

export function overlapsBuilding(a, b, margin = 0) {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + margin
    && Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 + margin;
}

const park = { x: (PARK.left + PARK.right) / 2, z: (PARK.near + PARK.far) / 2, width: PARK.right - PARK.left, depth: PARK.near - PARK.far };
const retainedLandmarks = HERO_BUILDINGS.filter(keepAuthoredBuilding);

export function surveyBuildingAllowed(spec) {
  const behindTower = spec.z < TOWER.z - 35 && spec.height > 63;
  const towerBearing = TOWER.x / (5.9 - TOWER.z), buildingBearing = spec.x / (5.9 - spec.z);
  const landmarkCorridor = behindTower && Math.abs(buildingBearing - towerBearing) < (spec.width / 2 + 15) / (5.9 - spec.z);
  return inSurveyArea(spec.x, spec.z) && spec.height >= .35
    && !landmarkCorridor
    && !overlapsBuilding(spec, park, 1)
    && !retainedLandmarks.some(other => overlapsBuilding(spec, other, 1));
}

export function combineSurveyLayout(authored, surveyed) {
  if (!surveyed.length) return authored;
  const replacements = new Set(surveyed.filter(spec => spec.authoredPlacement).map(spec => spec.id));
  return [
    ...authored.filter(spec => {
      if (replacements.has(spec.id)) return false;
      if (keepAuthoredBuilding(spec)) return true;
      if (inSurveyArea(spec.x, spec.z)) return false;
      return !surveyed.some(other => overlapsBuilding(spec, other, .7));
    }).map(spec => {
      if (spec.hero || !spec.distant) return spec;
      const height = spec.height * .38;
      return { ...spec, height, floors: Math.max(2, Math.round(height / .88)) };
    }),
    ...surveyed,
  ];
}
