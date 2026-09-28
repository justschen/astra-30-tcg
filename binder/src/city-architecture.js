import * as THREE from 'three';
import { CITY_GROUND } from './city-layout.js';
import { CityBatch } from './city-materials.js';
import { cityIdentity } from './city-life.js';
import { REFERENCE_BUILDINGS } from './city-reference-buildings.js';
import { drawRoofAssembly } from './building-massing.js';

export function architectureProfile(spec) {
  const identity = cityIdentity(spec.id);
  const reference=REFERENCE_BUILDINGS[spec.id];
  const bay = reference?.bay || { office: .62, glass: .54, ribbon: .59, residential: .76, hotel: .67 }[spec.style];
  if (!bay) throw new Error(`Unknown architectural facade: ${spec.style}`);
  return {
    bay, floor: spec.height / spec.floors, inset: spec.style === 'glass' || spec.style === 'ribbon' ? .07 : .17,
    bottom: spec.style === 'hotel' ? .28 : .21, top: .86,
    seed: identity.windowPhase, lamp: new THREE.Color(reference?.light || identity.lightColor),
    occupancy:reference?.occupancy ?? (spec.style==='residential'?.57:.46),
  };
}

export function createArchitectureMaterial(spec, uniforms, assets, occupancy) {
  const profile = architectureProfile(spec), glass = spec.style === 'glass', residential = spec.style === 'residential';
  const surface = residential ? 'city-brick' : 'city-concrete';
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(REFERENCE_BUILDINGS[spec.id]?.color || spec.color).lerp(new THREE.Color(0xb2b5b1), REFERENCE_BUILDINGS[spec.id] ? .05 : .28),
    map: assets[`${surface}-color`], normalMap: assets[`${surface}-normal`],
    roughnessMap: assets[`${surface}-roughness`], normalScale: new THREE.Vector2(.12, .12),
    roughness: .82, metalness: .08, envMapIntensity: .9, emissiveMap: occupancy,
    clearcoat: .35, clearcoatRoughness: .22,
  });
  material.name = `Rebuilt ${spec.id}: sharp PBR cladding, glazing and recessed rooms`;
  material.userData.architecturalFacade = true;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, {
      architectureOrigin: { value: new THREE.Vector3(spec.x, CITY_GROUND, spec.z) },
      architectureGrid: { value: new THREE.Vector2(profile.bay, profile.floor) },
      architectureSeed: { value: profile.seed }, architectureLamp: { value: profile.lamp },
    });
    shader.vertexShader = `
      uniform vec3 architectureOrigin;
      varying vec3 vArchitecturePoint;
      varying vec3 vArchitectureNormal;
      varying vec3 vArchitectureEye;
    ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <defaultnormal_vertex>', `
      #include <defaultnormal_vertex>
      vArchitectureNormal = inverseTransformDirection(transformedNormal, viewMatrix);
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vec3 architectureWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vArchitecturePoint = architectureWorld - architectureOrigin;
      vArchitectureEye = cameraPosition - architectureWorld;
      vec3 face = normalize(vArchitectureNormal);
      vec2 tangent = normalize(vec2(face.z, -face.x) + vec2(.000001));
      vec2 surfaceUv = abs(face.y) > .5 ? architectureWorld.xz : vec2(dot(architectureWorld.xz, tangent), architectureWorld.y);
      vMapUv = surfaceUv * .7;
      vNormalMapUv = surfaceUv * .7;
      vRoughnessMapUv = surfaceUv * .7;
    `);
    shader.fragmentShader = `
      uniform float cityNight;
      uniform float cityWindows;
      uniform float cityClock;
      uniform float cityWetness;
      uniform vec2 architectureGrid;
      uniform float architectureSeed;
      uniform vec3 architectureLamp;
      varying vec3 vArchitecturePoint;
      varying vec3 vArchitectureNormal;
      varying vec3 vArchitectureEye;
      float architectureHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float architectureRect(vec2 uv, vec2 lower, vec2 upper, vec2 aa) {
        vec2 a = smoothstep(lower - aa, lower + aa, uv);
        vec2 b = 1.0 - smoothstep(upper - aa, upper + aa, uv);
        return a.x * a.y * b.x * b.y;
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec3 architectureFace = normalize(vArchitectureNormal);
      bool architectureRoof = abs(architectureFace.y) > .35;
      vec2 architectureTangent = normalize(vec2(architectureFace.z, -architectureFace.x) + vec2(.000001));
      vec2 grid = vec2(dot(vArchitecturePoint.xz, architectureTangent), vArchitecturePoint.y) / architectureGrid;
      vec2 within = fract(grid), cell = floor(grid), aa = max(fwidth(grid) * .65, vec2(.0001));
      float pixels = min(1.0 / max(.0001, fwidth(grid.x)), 1.0 / max(.0001, fwidth(grid.y)));
      float detail = smoothstep(1.1, 3.5, pixels);
      float pane = architectureRoof ? 0.0 : architectureRect(within, vec2(${profile.inset},${profile.bottom}), vec2(${1 - profile.inset},${profile.top}), aa);
      float coverage = ${(1 - profile.inset * 2) * (profile.top - profile.bottom)};
      float glazing = architectureRoof ? 0.0 : mix(coverage, pane, detail);
      float room = architectureHash(cell + architectureSeed);
      float floorChoice = architectureHash(vec2(floor(cell.y / 2.0), architectureSeed));
      float division = 1.0 - smoothstep(.012, .026, min(within.y, 1.0 - within.y));
      division = mix(.038, division, detail);
      vec3 wall = diffuseColor.rgb * (1.0 - division * .2);
      wall *= 1.0 - cityWetness * .1;
      float grazing = pow(1.0 - max(0.0, dot(normalize(vArchitectureEye), architectureFace)), 3.0);
      vec3 glassColor = mix(vec3(.014,.022,.029), vec3(.035,.055,.070), grazing);
      float blind = step(.67,room) * smoothstep(.39,.47,within.y);
      blind = mix(.12, blind, detail);
      glassColor = mix(glassColor, vec3(.22,.205,.17), blind * .55);
      diffuseColor.rgb = mix(wall, glassColor, glazing);
      if (architectureRoof) {
        diffuseColor.rgb = mix(wall, vec3(.34,.36,.36) * (.68 + wall), .65);
      }
      float eyeDepth = max(.28, dot(vArchitectureEye, architectureFace));
      vec2 interior = within - vec2(dot(vArchitectureEye.xz, architectureTangent), vArchitectureEye.y) / eyeDepth * .06;
      float backWall = architectureRect(interior, vec2(${profile.inset + .045},${profile.bottom + .075}), vec2(${.94 - profile.inset},${profile.top - .035}), aa);
      float ceiling = smoothstep(.65,.69,interior.y) * (1.0 - smoothstep(.73,.76,interior.y));
      float furniture = (1.0 - smoothstep(.33,.4,interior.y)) * step(.43,room);
      float period = 38.0 + room * 70.0;
      float phase = mod(cityClock + architectureSeed + cell.x * 3.7, period);
      float activity = smoothstep(0.0,2.0,phase) * (1.0 - smoothstep(period*.66-2.0,period*.66,phase));
      float occupied = step(${profile.occupancy},floorChoice) * step(.22,room) * mix(1.0,activity,step(.63,room));
      float depthLight = (.2 + backWall * .55 + ceiling * .24 - furniture * .12) * (1.0 - blind * .7);
      vec2 filtered = texture2D(emissiveMap, (grid + architectureSeed) / 64.0).rg;
      float distantLight = mix(filtered.r, filtered.g, .5 + .5*sin(cityClock*.018+architectureSeed));
      distantLight = mix(.037, distantLight, smoothstep(.8,1.5,pixels));
      float roomLight = mix(distantLight, pane * occupied * depthLight * (.5 + room*.65), detail);
    `).replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(max(.65, roughnessFactor), .2 + grazing * .08, glazing);
      roughnessFactor *= 1.0 - cityWetness * .12;
    `).replace('#include <metalnessmap_fragment>', `
      #include <metalnessmap_fragment>
      metalnessFactor = mix(${glass ? '.22' : '.045'}, .22, glazing);
    `).replace('#include <lights_physical_fragment>', `
      #include <lights_physical_fragment>
      material.clearcoat *= glazing;
    `).replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      totalEmissiveRadiance += architectureRoof ? vec3(0.0) : architectureLamp * roomLight * cityNight * cityWindows * 1.65;
    `);
  };
  material.customProgramCacheKey = () => `architecture-${spec.style}-${REFERENCE_BUILDINGS[spec.id]?.shape||'standard'}-v3`;
  return material;
}

function triangleContains(point, triangle) {
  let positive = false, negative = false;
  for (let i = 0; i < 3; i++) {
    const a = triangle[i], b = triangle[(i + 1) % 3];
    const cross = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
    if (cross > .0001) positive = true;
    if (cross < -.0001) negative = true;
  }
  return !(positive && negative);
}

export function facadeSupports(surface, left, right, bottom, top) {
  return [left, (left + right) / 2, right].every(x => [bottom, (bottom + top) / 2, top]
    .every(y => surface.triangles.some(triangle => triangleContains([x, y], triangle))));
}

export function fitFacadeAttachment(surface, { x, y, z, width, height, fixedHeight = false }) {
  const availableWidth = surface.max[0] - surface.min[0] - .12, availableHeight = surface.max[1] - surface.min[1] - .08;
  width = Math.min(width, availableWidth);
  if (!fixedHeight) height = Math.min(height, availableHeight);
  if (width < .4 || height < .45 || height > availableHeight) return null;
  const halfWidth = width / 2, halfHeight = height / 2;
  const horizontal = new THREE.Vector3(x, y, z).dot(surface.tangent);
  const center = [(surface.min[0] + surface.max[0]) / 2, (surface.min[1] + surface.max[1]) / 2];
  const xs = [THREE.MathUtils.clamp(horizontal, surface.min[0] + halfWidth + .06, surface.max[0] - halfWidth - .06), center[0]];
  const ys = fixedHeight ? [y] : [THREE.MathUtils.clamp(y, surface.min[1] + halfHeight + .04, surface.max[1] - halfHeight - .04), center[1]];
  for (const cy of ys) for (const cx of xs) {
    if (!facadeSupports(surface, cx - halfWidth, cx + halfWidth, cy - halfHeight, cy + halfHeight)) continue;
    const point = surface.tangent.clone().multiplyScalar(cx).addScaledVector(surface.normal, surface.offset + .07);
    return { x: point.x, y: cy, z: point.z, width, height, yaw: Math.atan2(surface.normal.x, surface.normal.z) };
  }
  return null;
}

export function architecturalSurfaces(parsed) {
  const { geometry, position, size } = parsed, surfaces = new Map();
  const vertices = [], normals = [];
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    vertices.push(new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, i).multiply(size).add(position));
    normals.push(new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, i).divide(size).normalize());
  }
  for (let i = 0; i < geometry.index.count; i += 3) {
    const indices = [0, 1, 2].map(offset => geometry.index.getX(i + offset)), normal = normals[indices[0]].clone();
    if (Math.abs(normal.y) > .025) continue;
    normal.y = 0; normal.normalize();
    const points = indices.map(index => vertices[index]), offset = points.reduce((sum, point) => sum + point.dot(normal), 0) / 3;
    const key = `${normal.x.toFixed(2)}:${normal.z.toFixed(2)}:${Math.round(offset / .025)}`;
    if (!surfaces.has(key)) surfaces.set(key, { normal, tangent: new THREE.Vector3(normal.z, 0, -normal.x), offset, triangles: [], min: [Infinity, Infinity], max: [-Infinity, -Infinity] });
    const surface = surfaces.get(key), triangle = points.map(point => [point.dot(surface.tangent), point.y]);
    if (Math.abs((triangle[1][0]-triangle[0][0])*(triangle[2][1]-triangle[0][1])-(triangle[1][1]-triangle[0][1])*(triangle[2][0]-triangle[0][0])) < .00001) continue;
    surface.triangles.push(triangle);
    for (const point of triangle) for (let axis = 0; axis < 2; axis++) {
      surface.min[axis] = Math.min(surface.min[axis], point[axis]); surface.max[axis] = Math.max(surface.max[axis], point[axis]);
    }
  }
  return [...surfaces.values()].filter(surface => surface.max[0] - surface.min[0] > .5 && surface.max[1] - surface.min[1] > .5);
}

export function architecturalWindows(surface, spec) {
  const profile = architectureProfile(spec), origin = new THREE.Vector3(spec.x, CITY_GROUND, spec.z).dot(surface.tangent), windows = [];
  const firstBay = Math.floor((surface.min[0] - origin) / profile.bay), lastBay = Math.ceil((surface.max[0] - origin) / profile.bay);
  const firstFloor = Math.floor((surface.min[1] - CITY_GROUND) / profile.floor), lastFloor = Math.ceil((surface.max[1] - CITY_GROUND) / profile.floor);
  for (let floor = firstFloor; floor < lastFloor; floor++) for (let bay = firstBay; bay < lastBay; bay++) {
    const left = origin + (bay + profile.inset) * profile.bay, right = origin + (bay + 1 - profile.inset) * profile.bay;
    const bottom = CITY_GROUND + (floor + profile.bottom) * profile.floor, top = CITY_GROUND + (floor + profile.top) * profile.floor;
    const safe = facadeSupports(surface, left - .025, right + .025, bottom - .025, top + .025);
    if (safe) windows.push({ left, right, bottom, top });
  }
  return windows;
}

export class ArchitectureDetails {
  constructor(parent) {
    this.batch = new CityBatch(parent); this.parent = parent; this.windows = 0; this.buildings = 0;
    this.frame = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .43, metalness: .62 });
    this.sill = new THREE.MeshStandardMaterial({ color: 0x999b96, roughness: .82, metalness: .06 });
    this.vent = new THREE.MeshStandardMaterial({ color: 0x354047, roughness: .69, metalness: .2 });
    this.roofUnits = 0;
    this.roofAssemblies = [];
  }

  add(parsed, spec) {
    const surfaces = architecturalSurfaces(parsed);
    if (spec.z < -150) return surfaces;
    this.buildings++;
    const color = new THREE.Color(spec.style === 'glass' ? 0x596970 : spec.style === 'residential' ? 0xb2ada1 : 0x879396).multiplyScalar(.78 + spec.color % 17 / 55);
    for (const surface of surfaces) {
      const center = surface.tangent.clone().multiplyScalar((surface.min[0] + surface.max[0]) / 2).addScaledVector(surface.normal, surface.offset);
      if (new THREE.Vector3(0, 3.05, 5.9).sub(center).dot(surface.normal) < -2) continue;
      const yaw = Math.atan2(surface.normal.x, surface.normal.z), thickness = .014;
      const point = (horizontal, y, depth) => surface.tangent.clone().multiplyScalar(horizontal).addScaledVector(surface.normal, surface.offset + depth).setY(y).toArray();
      for (const window of architecturalWindows(surface, spec)) {
        const { left, right, bottom, top } = window, width = right - left, height = top - bottom;
        for (const x of [left, right]) this.batch.box(this.frame, point(x, (bottom + top) / 2, .041), [thickness, height + thickness, .055], yaw, color, true);
        for (const y of [bottom, top]) this.batch.box(this.frame, point((left + right) / 2, y, .041), [width, thickness, .055], yaw, color, true);
        this.batch.box(this.frame, point((left + right) / 2, (bottom + top) / 2, .026), [.009, height, .026], yaw, color);
        if (spec.style !== 'glass') this.batch.box(this.sill, point((left + right) / 2, bottom - .018, .061), [width + .04, .025, .105], yaw);
        this.windows++;
      }
    }
    const roof = new THREE.Mesh(parsed.geometry, this.sill);
    roof.position.copy(parsed.position); roof.scale.copy(parsed.size); roof.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(), seed = cityIdentity(spec.id).windowPhase;
    const heightAt = (x, z) => {
      ray.set(new THREE.Vector3(x, CITY_GROUND + spec.height + 2, z), new THREE.Vector3(0, -1, 0));
      return ray.intersectObject(roof, false)[0]?.point.y;
    };
    const roofPlacements=[];
    for (let i = 0; i < 5; i++) {
      const x = spec.x + Math.sin(seed + i * 3.1) * spec.width * .28;
      const z = spec.z + Math.cos(seed * 1.7 + i * 4.7) * spec.depth * .27;
      const y = heightAt(x, z);
      if (!Number.isFinite(y) || y < CITY_GROUND + spec.height * .6) continue;
      if(roofPlacements.some(other=>Math.abs(other.x-x)<.84&&Math.abs(other.z-z)<.72&&Math.abs(other.y-y)<.9))continue;
      if (![-.42,0,.42].every(dx => [-.36,0,.36].every(dz => Math.abs(heightAt(x + dx, z + dz) - y) < .02))) continue;
      const kind=['plant-bank','water-tank','stair-core','plant-screen','vent-rack'][(i+Math.floor(seed))%5];
      const dx=x-spec.x,dz=z-spec.z,c=Math.cos(spec.yaw),s=Math.sin(spec.yaw);
      drawRoofAssembly(this.batch,spec,{kind,x:dx*c-dz*s,z:dx*s+dz*c,y:y-CITY_GROUND,width:.65,depth:.55,
        height:kind==='water-tank'?.7:kind==='stair-core'?.58:.27},
        {stone:this.sill,roof:this.frame,mechanical:this.frame,dark:this.vent},true);
      roofPlacements.push({x,y,z});
      this.roofAssemblies.push({building:spec.id,kind,x,y,z,width:.84,depth:.72,height:.9});
      this.roofUnits++;
    }
    return surfaces;
  }

  finish() {
    this.batch.finish();
    this.parent.userData.architecturalWindows = this.windows;
    this.parent.userData.detailedBuildings = this.buildings;
    this.parent.userData.roofUnits = this.roofUnits;
  }
}
