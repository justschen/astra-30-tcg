import * as THREE from 'three';
import { canvasTexture, freezeStaticTransforms, random } from './materials.js';
import { CITY_FAR, CITY_GROUND, CITY_STREETS, createCityLayout } from './city-layout.js';
import { CityBatch, citySurfaceTexture, makeFacadeMaterial } from './city-materials.js';
import { createSideParks, createTemplePark, createTokyoTower } from './city-landmarks.js';
import { solarState } from './day-cycle.js';
import { createStreetscape } from './city-streetscape.js';
import { createRoadRibbon } from './city-roads.js';
import { cityIdentity } from './city-life.js';
import { signalState, TRAFFIC_SIGNALS } from './city-traffic.js';
import { createCitySurvey } from './city-survey.js';
import { combineSurveyLayout } from './city-survey-layout.js';
import { applyCityAir } from './city-air.js';
import { createCityInfill, createInfillDetails } from './city-infill.js';
import { weatherEnvelope } from './city-weather.js';
import { createNeonDistrict } from './city-neon.js';
import { authoredBuildingTiers, buildingLocalPoint, buildingMassing, dressBuildingRoofs, massingGeometry, roofFixtureAnchor } from './building-massing.js';
import { RefreshBudget } from './refresh-budget.js';

function makeSky(parent, uniforms) {
  const material = new THREE.ShaderMaterial({
    uniforms: { ...uniforms },
    side: THREE.BackSide, depthWrite: false,
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float cityNight;
      uniform float cityWetness;
      uniform float cityDaylight;
      uniform float citySunset;
      uniform float cityClouds;
      uniform float cityCloudSpeed;
      uniform float cityStorm;
      uniform float cityClock;
      uniform vec3 citySunDirection;
      varying vec3 vDirection;
      float skyHash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float skyNoise(vec2 p) {
        vec2 cell = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(skyHash(cell), skyHash(cell + vec2(1.0,0.0)), f.x),
                   mix(skyHash(cell + vec2(0.0,1.0)), skyHash(cell + vec2(1.0,1.0)), f.x), f.y);
      }
      float cloudNoise(vec2 p) {
        float result = 0.0, weight = 0.5;
        for (int i = 0; i < 5; i++) {
          result += skyNoise(p) * weight;
          p = mat2(1.61, 1.17, -1.17, 1.61) * p + 6.4;
          weight *= 0.5;
        }
        return result;
      }
      void main() {
        vec3 direction = normalize(vDirection);
        float up = smoothstep(-.03,.62,direction.y);
        vec3 dayLow = vec3(0.40, 0.64, 0.79), dayHigh = vec3(0.022, 0.17, 0.38);
        vec3 nightLow = vec3(0.022, 0.045, 0.09), nightHigh = vec3(0.002, 0.007, 0.026);
        vec3 sky = mix(mix(nightLow,nightHigh,up), mix(dayLow,dayHigh,up), cityDaylight);
        float horizon = exp(-pow(abs(direction.y - .012) / .09,1.25));
        float towardSun = max(0.0, dot(normalize(vec3(direction.x,0.0,direction.z)), normalize(vec3(citySunDirection.x,0.0,citySunDirection.z))));
        vec3 twilight=mix(vec3(.008,.038,.082),vec3(.012,.095,.15),cityDaylight);
        sky=mix(sky,twilight,citySunset*smoothstep(.02,.19,direction.y)*.97);
        vec3 peach = mix(vec3(.62,.20,.14),vec3(1.45,.56,.15),pow(towardSun,4.0));
        sky = mix(sky, peach, citySunset * horizon * (.3 + towardSun * .69));
        float sunDot = dot(direction, citySunDirection);
        float halo = exp(-max(0.0,1.0-sunDot) * 55.0) * citySunset * exp(-abs(direction.y)*5.0);
        sky += vec3(.48,.19,.055) * halo;
        float disc = smoothstep(cos(0.009),cos(0.0058),sunDot) * smoothstep(-0.04,0.01,citySunDirection.y);
        sky += mix(vec3(3.0,1.25,0.28),vec3(3.0,2.7,2.2),cityDaylight) * disc * (1.0-cityStorm*.98);
        float moon = smoothstep(cos(0.008),cos(0.006),dot(direction,-citySunDirection)) * cityNight;
        sky += vec3(0.72,0.85,1.0) * moon * (1.0-cityStorm);
        if (cityClouds > 0.001) {
          vec2 plane = direction.xz / max(.08,direction.y + .14);
          vec2 drift = vec2(cityClock * cityCloudSpeed * 0.006, cityClock * cityCloudSpeed * 0.0014);
          vec2 cloudUv=plane*vec2(1.4,3.1)+drift;
          float formation = cloudNoise(cloudUv)*.82+cloudNoise(cloudUv*3.7)*.18;
          float density = smoothstep(.72-cityClouds*.42,.90-cityClouds*.42,formation);
          density *= smoothstep(-0.06,0.13,direction.y);
          density=mix(density,.82+density*.18,cityStorm);
          vec3 litCloud = mix(vec3(0.055,0.073,0.11),vec3(0.78,0.88,0.96),cityDaylight);
          litCloud = mix(litCloud,vec3(.53,.20,.11),citySunset*towardSun*exp(-abs(direction.y)*5.0));
          vec3 underside = mix(vec3(0.012,0.023,0.05),vec3(0.21,0.29,0.38),cityDaylight);
          underside = mix(underside,vec3(.009,.025,.047),citySunset * .93);
          float edgeLight=max(0.0,formation-cloudNoise(cloudUv+normalize(citySunDirection.xz)*.15))*.8;
          litCloud = mix(underside,litCloud,clamp(edgeLight+.16+(1.0-density)*.35,0.0,1.0));
          litCloud *= 0.65 + formation * 0.55;
          litCloud=mix(litCloud,mix(vec3(.026,.040,.057),vec3(.19,.24,.27),cityDaylight)*(0.6+formation*.7),cityStorm*.88);
          sky = mix(sky,litCloud,density * 0.96);
        }
        float star = step(0.9989, skyHash(floor(direction.xz/max(.12,direction.y+.2)*340.0)));
        sky += vec3(star * cityNight * smoothstep(.03,.25,direction.y) * (1.0-cityClouds) * .025);
        sky = mix(sky, mix(vec3(.025,.042,.061),vec3(.22,.28,.33),cityDaylight), cityStorm * .2);
        sky *= mix(.12, 1.0, smoothstep(-.18, .02, direction.y));
        gl_FragColor = vec4(sky, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(CITY_FAR - 50, 32, 24), material);
  mesh.name = 'Dynamic sun, sunset clouds and night sky';
  mesh.renderOrder = -1;
  parent.add(mesh);
  return mesh;
}

function cityMaterials(uniforms, assets) {
  const concrete = citySurfaceTexture('concrete');
  concrete.repeat.set(2, 2);
  const stone = new THREE.MeshStandardMaterial({ color: 0x909a9c, map: concrete, bumpMap: concrete, bumpScale: .018, roughness: .86 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x829195, roughness: .77, metalness: .14 });
  const mechanical = new THREE.MeshStandardMaterial({ color: 0xa3b3b8, map: concrete, roughness: .66, metalness: .22 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x46575e, roughness: .7, metalness: .23 });
  const asphaltMaterial = new THREE.MeshStandardMaterial({
    color: 0x929a9e, map: assets['city-asphalt-color'], normalMap: assets['city-asphalt-normal'],
    normalScale: new THREE.Vector2(.3,.3), roughnessMap: assets['city-asphalt-roughness'], roughness: .86,
    polygonOffset:true,polygonOffsetFactor:0,polygonOffsetUnits:-1,
  });
  asphaltMaterial.onBeforeCompile = shader => {
    shader.uniforms.cityWetness = uniforms.cityWetness;
    shader.uniforms.cityNight = uniforms.cityNight;
    shader.uniforms.cityReflections = uniforms.cityReflections;
    shader.uniforms.cityReflectionCount = uniforms.cityReflectionCount;
    shader.uniforms.cityHeadlights = uniforms.cityHeadlights;
    shader.uniforms.cityHeadlightCount = uniforms.cityHeadlightCount;
    shader.vertexShader = 'varying vec2 roadPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      roadPosition = (modelMatrix * vec4(transformed,1.0)).xz;
      #ifdef USE_MAP
        vMapUv=roadPosition*.4;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv=roadPosition*.4;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv=roadPosition*.4;
      #endif
    `);
    shader.fragmentShader = `
      uniform float cityWetness;
      uniform float cityNight;
      uniform sampler2D cityReflections;
      uniform float cityReflectionCount;
      uniform sampler2D cityHeadlights;
      uniform float cityHeadlightCount;
      varying vec2 roadPosition;
      float roadNoise(vec2 p) {
        vec2 i=floor(p),f=fract(p);
        f=f*f*(3.0-2.0*f);
        float a=fract(sin(dot(i,vec2(127.1,311.7)))*43758.54);
        float b=fract(sin(dot(i+vec2(1.0,0.0),vec2(127.1,311.7)))*43758.54);
        float c=fract(sin(dot(i+vec2(0.0,1.0),vec2(127.1,311.7)))*43758.54);
        float d=fract(sin(dot(i+vec2(1.0),vec2(127.1,311.7)))*43758.54);
        return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float puddle = smoothstep(.28,.68,roadNoise(roadPosition*.6)*.7 + roadNoise(roadPosition*1.8)*.3);
      diffuseColor.rgb *= 1.0 - cityWetness * puddle * .35;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      float dryRoughness = max(.5,roughnessFactor);
      roughnessFactor = mix(dryRoughness,.08 + dryRoughness*.2 + roadNoise(roadPosition*2.0)*.08,cityWetness*puddle);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      vec3 normalDx=dFdx(normal),normalDy=dFdy(normal);
      float normalVariance=dot(normalDx,normalDx)+dot(normalDy,normalDy);
      roughnessFactor=min(1.0,sqrt(roughnessFactor*roughnessFactor+min(.18,normalVariance*.45)));
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      for(int i=0;i<16;i++){
        if(float(i)>=cityHeadlightCount)break;
        float u=(float(i)+.5)/16.0;
        vec4 source=texture2D(cityHeadlights,vec2(u,.25));
        vec3 tint=texture2D(cityHeadlights,vec2(u,.75)).rgb;
        vec2 delta=roadPosition-source.xy;
        float along=dot(delta,source.zw);
        float across=dot(delta,vec2(-source.w,source.z));
        float width=.17+max(0.0,along)*.27;
        float beam=smoothstep(0.0,.3,along)*(1.0-smoothstep(2.3,4.5,along))*exp(-across*across/(width*width));
        totalEmissiveRadiance+=tint*beam*(.08+cityNight*.4);
      }
      if (cityWetness > .25 && cityNight > .15) {
        vec3 reflectedLight=vec3(0.0);
        for(int i=0;i<32;i++){
          if(float(i)>=cityReflectionCount)break;
          float u=(float(i)+.5)/32.0;
          vec4 source=texture2D(cityReflections,vec2(u,1.0/6.0));
          vec4 axis=texture2D(cityReflections,vec2(u,.5));
          vec3 tint=texture2D(cityReflections,vec2(u,5.0/6.0)).rgb;
          vec2 delta=roadPosition-source.xy;
          vec2 local=vec2(dot(delta,vec2(-axis.y,axis.x))/source.z,dot(delta,axis.xy)/source.w);
          reflectedLight+=tint*exp(-dot(local,local)*2.5)*axis.z;
        }
        totalEmissiveRadiance+=reflectedLight*cityWetness*cityNight*(.16+.4*puddle);
      }
    `);
  };
  asphaltMaterial.customProgramCacheKey = () => 'world-space-asphalt-specular-aa-v5';
  const path = new THREE.MeshStandardMaterial({ color: 0x9ba39a, map: concrete, roughness: .96 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x536957, map: concrete, roughness: 1 });
  const tileRoof=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.82,metalness:.08,side:THREE.DoubleSide});
  path.userData.cityGroundSurface = grass.userData.cityGroundSurface = true;
  const streetLamp = new THREE.MeshStandardMaterial({ color: 0xe2d1a9, emissive: 0xffce81, emissiveIntensity: .65, roughness: .45 });
  const marking = new THREE.MeshStandardMaterial({ color: 0xd1cdc0, roughness: .85, polygonOffset:true,polygonOffsetFactor:0,polygonOffsetUnits:-3 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x486a77, roughness: .28, metalness: .35, clearcoat: .4 });
  const facade = Object.fromEntries(['office', 'glass', 'ribbon', 'residential', 'hotel'].map(kind => [kind, makeFacadeMaterial(kind, uniforms, assets)]));
  return { stone, roof, mechanical, dark, asphalt: asphaltMaterial, path, grass, tileRoof, streetLamp, marking, glass, facade };
}

function buildBuildings(root, specs, materials, beacons) {
  const byKind = new Map();
  const details = new CityBatch(root);
  const rng = random(3525);
  const massingCounts={};
  for (const spec of specs) {
    const form=buildingMassing(spec);
    const facadeTiers=form?[]:authoredBuildingTiers(spec);
    const addShell = (center, size, floors, style = spec.style,shape='box') => {
      const key = `${style}-${spec.hero ? 'hero' : 'district'}-${shape}`;
      if (!byKind.has(key)) byKind.set(key, { style, hero: spec.hero,shape, instances: [] });
      byKind.get(key).instances.push({ center, size, floors, spec, seed: rng() * 500 });
    };
    if(form){
      massingCounts[form.kind]=(massingCounts[form.kind]||0)+1;
      for(const part of form.parts){
        addShell(buildingLocalPoint(spec,part.x,part.z,part.bottom+part.height/2),
          [part.width,part.height,part.depth],part.floors,spec.style,part.shape);
      }
    } else {
      for(const tier of facadeTiers)addShell(tier.center,[tier.width,tier.height,tier.depth],tier.floors);
    }
    if(form){
      if(spec.infill&&!spec.distant)details.box(materials.path,[spec.x,CITY_GROUND+.012,spec.z],[spec.width+.5,.024,spec.depth+.5]);
      dressBuildingRoofs(details,spec,materials,form);
      continue;
    }
    if (spec.distant) continue;
    if(spec.infill){
      details.box(materials.path,[spec.x,CITY_GROUND+.012,spec.z],[spec.width+.5,.024,spec.depth+.5]);
      if(spec.pitched){
        details.add('gable-roof',materials.tileRoof,[spec.x,CITY_GROUND+spec.height,spec.z],[spec.width+.2,.55+spec.width*.1,spec.depth+.25],null,
          [0x668a98,0x77886d,0xac7467,0x737c99][Math.floor(rng()*4)],true);
        continue;
      }
    }
    const y = CITY_GROUND + spec.height;
    const c = Math.cos(spec.yaw), s = Math.sin(spec.yaw);
    const topX = spec.stepped ? -3 * spec.width * .028 : 0;
    const topZ = spec.stepped ? 3 * spec.depth * .045 : 0;
    const world = (x, z, h = 0) => [spec.x + topX + x * c + z * s, y + h, spec.z + topZ - x * s + z * c];
    const roofWidth = spec.width * (spec.stepped ? .64 : 1), roofDepth = spec.depth * (spec.stepped ? .64 : 1);
    if (!spec.stepped) {
      const thickness = spec.hero ? .13 : .07;
      details.box(materials.roof, world(0, 0, .045), [roofWidth + .12, .09, roofDepth + .12], spec.yaw, null, spec.hero);
      for (const sign of [-1, 1]) {
        details.box(materials.roof, world(sign * roofWidth / 2, 0, .22), [thickness, .35, roofDepth], spec.yaw);
        details.box(materials.roof, world(0, sign * roofDepth / 2, .22), [roofWidth, .35, thickness], spec.yaw);
      }
      if (spec.z > -160 && spec.width > 3.5 && rng() > .4) {
        const tankX = roofWidth * .23, tankZ = roofDepth * .2;
        const radius = Math.min(.6, roofWidth * .1);
        details.add('cylinder', materials.mechanical, world(tankX, tankZ, .62), [radius, .94, radius]);
        details.add('cylinder', materials.roof, world(tankX, tankZ, 1.1), [radius * 1.07, .045, radius * 1.07]);
        for (const sign of [-1, 1]) {
          details.beam(materials.dark, world(tankX + sign * radius * .55, tankZ, .09), world(tankX + sign * radius * .55, tankZ, .3), .036);
        }
      }
    }
    const roofBoxes = spec.hero ? 5 : 1 + Math.floor(rng() * 2);
    for (let i = 0; i < roofBoxes; i++) {
      const width = Math.min(roofWidth * .25, .5 + rng() * 1.3);
      const depth = Math.min(roofDepth * .36, .6 + rng() * 1.2);
      const height = .25 + rng() * .65;
      const x = (rng() - .5) * roofWidth * .63, z = (rng() - .5) * roofDepth * .6;
      details.box(materials.mechanical, world(x, z, height / 2 + .09), [width, height, depth], spec.yaw, null, spec.hero);
      details.box(materials.dark, world(x, z, height + .1), [width * .83, .025, depth * .77], spec.yaw);
      if (spec.hero) for (let fin = 0; fin < 5; fin++) {
        details.box(materials.roof, world(x - width * .4 + fin * width * .2, z, height + .13), [.026, .034, depth * .82], spec.yaw);
      }
    }
    if (spec.z > -135 && spec.style === 'residential' && spec.width > 2.3) {
      const bays = Math.max(2,Math.min(5,Math.floor(spec.width/.85)));
      for(let floor=1;floor<spec.floors;floor++){
        const fy=CITY_GROUND+floor/spec.floors*spec.height;
        for(let bay=0;bay<bays;bay++){
          const bx=(bay+.5)/bays*spec.width-spec.width/2;
          const bz=spec.depth/2+.12;
          const px=spec.x+bx*c+bz*s,pz=spec.z-bx*s+bz*c;
          details.box(materials.roof,[px,fy,pz],[spec.width/bays*.84,.055,.29],spec.yaw);
          details.box(materials.glass,[px+.12*s,fy+.18,pz+.12*c],[spec.width/bays*.8,.29,.025],spec.yaw);
        }
      }
    }
    if (!spec.hero) continue;
    const stairH = Math.min(2.3, spec.height * .13);
    details.box(materials.stone, world(-roofWidth * .28, -roofDepth * .2, stairH * .5), [roofWidth * .2, stairH, roofDepth * .26], spec.yaw, null, true);
    for (const sign of [-1, 1]) {
      details.beam(materials.dark, world(sign * roofWidth * .37, -roofDepth * .32, .25), world(sign * roofWidth * .37, -roofDepth * .32, 1.1), .025);
    }
    details.beam(materials.mechanical, world(roofWidth * .21, -roofDepth * .3, .2), world(roofWidth * .21, -roofDepth * .3, 2.15), .027);
    details.beam(materials.mechanical, world(roofWidth * .21 - .42, -roofDepth * .3, 1.84), world(roofWidth * .21 + .42, -roofDepth * .3, 1.84), .022);
    if (spec.height > 18) beacons.push(world(roofWidth * .21, -roofDepth * .3, 2.2));
    if (spec.style === 'ribbon' || spec.style === 'residential') {
      for (let floor = 1; floor < spec.floors; floor++) {
        const y = CITY_GROUND + floor / spec.floors * spec.height;
        const tier = spec.stepped ? Math.min(3, Math.floor(floor / spec.floors * 4)) : 0;
        const width = spec.width * (1 - tier * .12), depth = spec.depth * (1 - tier * .12);
        for (const sign of [-1, 1]) {
          details.box(materials.roof, [spec.x - tier * spec.width * .028 + sign * depth / 2 * s, y, spec.z + tier * spec.depth * .045 + sign * depth / 2 * c], [width + .12, .055, .17], spec.yaw);
        }
      }
    }
    if (spec.style === 'glass') {
      for (const {width,depth,height,center} of facadeTiers) {
        const n = Math.min(16, Math.floor(width / .85));
        for (let i = 1; i < n; i++) {
          const x = (i / n - .5) * width, z = depth / 2 + .022;
          details.box(materials.mechanical, [center[0]+x*c+z*s,center[1],center[2]-x*s+z*c],[.03,height,.04],spec.yaw);
        }
      }
    }
    const lobbyHeight = Math.min(spec.height * .16, 1.3);
    details.box(materials.glass, [spec.x, CITY_GROUND + lobbyHeight / 2 + .1, spec.z + spec.depth / 2 + .026],
      [spec.width * .68, lobbyHeight, .035], spec.yaw);
    if (spec.z > -110) {
      const awningY = CITY_GROUND + lobbyHeight + .3;
      details.box(materials.roof, [spec.x, awningY, spec.z + spec.depth / 2 + .22], [spec.width * .76, .085, .65], spec.yaw);
    }
    if(spec.z > -165){
      for(const {width,depth,height,center} of facadeTiers){
        const sections=Math.max(3,Math.min(10,Math.round(width/1.25)));
        for(let i=0;i<=sections;i++){
          const x=(i/sections-.5)*width,z=depth/2+.055;
          details.box(materials.stone,[center[0]+x*c+z*s,center[1],center[2]-x*s+z*c],[.065,height,.10],spec.yaw);
        }
      }
    }
  }
  for (const { style, hero,shape, instances } of byKind.values()) {
    const geometry = massingGeometry(shape);
    const sizes = [], grids = [], lights=[], timing=[];
    for (const instance of instances) {
      const identity=cityIdentity(instance.spec.id);
      sizes.push(...instance.size);
      grids.push(Math.max(2, Math.round(instance.size[0] / (hero ? .53 : .56))),
        Math.max(2, Math.round(instance.size[2] / .55)), instance.floors, instance.seed);
      lights.push(...new THREE.Color(identity.lightColor).toArray());
      timing.push(identity.windowPeriod,identity.windowPhase);
    }
    geometry.setAttribute('citySize', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 3));
    geometry.setAttribute('cityGrid', new THREE.InstancedBufferAttribute(new Float32Array(grids), 4));
    geometry.setAttribute('cityLight',new THREE.InstancedBufferAttribute(new Float32Array(lights),3));
    geometry.setAttribute('cityTiming',new THREE.InstancedBufferAttribute(new Float32Array(timing),2));
    const mesh = new THREE.InstancedMesh(geometry, materials.facade[style], instances.length);
    const dummy = new THREE.Object3D();
    instances.forEach((instance, i) => {
      dummy.position.set(...instance.center); dummy.scale.set(...instance.size);
      dummy.rotation.y = instance.spec.yaw; dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, new THREE.Color(instance.spec.color));
    });
    mesh.castShadow = hero; mesh.receiveShadow = true;
    mesh.name = `Solid ${style} ${shape} city volumes (${instances.length})`;
    mesh.userData.buildings = instances.map(instance => instance.spec.id);
    mesh.userData.cityVolumes = true;
    root.add(mesh);
  }
  details.finish();
  root.userData.massingCounts=massingCounts;
}

export function buildStreets(root, materials) {
  const batch = new CityBatch(root);
  const lampPositions = [];
  const signalLamps=[];
  const signalPositions=[],signalColors=[];
  const curves = [];
  for (const street of CITY_STREETS) {
    const curve = new THREE.CatmullRomCurve3(street.points.map(([x, z]) => new THREE.Vector3(x, CITY_GROUND + .055, z)), false, 'centripetal');
    const ribbon=createRoadRibbon(curve,street.width);
    curves.push({ ...street, curve, ribbon });
    const {positions,uvs,indices}=ribbon;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const road = new THREE.Mesh(geometry, materials.asphalt); road.receiveShadow = true;
    road.name = `Ground-level ${street.id}`; road.userData.cityRoad = true; root.add(road);
    const markings = Math.ceil(curve.getLength() / 2.2);
    for (let i = 0; i <= markings; i++) {
      const point = curve.getPointAt(i / markings), tangent = curve.getTangentAt(i / markings);
      const yaw = Math.atan2(tangent.x, tangent.z);
      batch.box(materials.marking, [point.x, CITY_GROUND + .072, point.z], [.04, .014, .92], yaw);
    }
    const lamps = Math.floor(curve.getLength() / 8);
    for (let i = 1; i < lamps; i++) {
      const point = curve.getPointAt(i / lamps), tangent = curve.getTangentAt(i / lamps);
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
      const sign = i % 2 ? -1 : 1;
      const foot = point.clone().addScaledVector(side, sign * (street.width / 2 + .5));
      batch.beam(materials.dark, [foot.x, CITY_GROUND + .08, foot.z], [foot.x, CITY_GROUND + 2.25, foot.z], .035);
      const top = foot.clone().addScaledVector(side, -sign * .45);
      batch.beam(materials.dark, [foot.x, CITY_GROUND + 2.25, foot.z], [top.x, CITY_GROUND + 2.32, top.z], .035);
      batch.box(materials.streetLamp, [top.x, CITY_GROUND + 2.3, top.z], [.18, .075, .27]);
      lampPositions.push([top.x, CITY_GROUND + 2.32, top.z]);
      batch.add('plane', materials.lightPool, [top.x, CITY_GROUND + .08, top.z], [3.3, 5.61, 1],
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    }
  }
  for (const [index,[x, z]] of TRAFFIC_SIGNALS.entries()) {
    for (const side of [-1, 1]) for (let i = 0; i < 7; i++) {
      batch.box(materials.marking, [x - 1.35 + i * .44, CITY_GROUND + .086, z + side * 2.3], [.22, .015, 1.35]);
    }
    for (const [axis,dx,dz,yaw] of [['north-south',-2.3,-2.8,0],['east-west',2.3,2.8,Math.PI/2]]) {
      batch.beam(materials.dark, [x + dx, CITY_GROUND, z + dz], [x + dx, CITY_GROUND + 2.2, z + dz], .035);
      batch.box(materials.dark, [x + dx, CITY_GROUND + 2.04, z + dz], [.64, .22, .18],yaw);
      for(const [lamp,color]of ['red','amber','green'].entries()){
        const shift=(lamp-1)*.19,position=[x+dx+Math.sin(yaw)*.105+Math.cos(yaw)*shift,CITY_GROUND+2.04,z+dz+Math.cos(yaw)*.105-Math.sin(yaw)*shift];
        const material=new THREE.MeshStandardMaterial({color:0x173133,emissive:0x173133,emissiveIntensity:.05,roughness:.32});
        batch.box(material,position,[.13,.135,.024],yaw);
        signalLamps.push({axis,index,material,color,glow:signalPositions.length/3});
        signalPositions.push(...position);signalColors.push(0,0,0);
      }
    }
  }
  batch.finish();
  const glowMap=canvasTexture(32,32,ctx=>{const radial=ctx.createRadialGradient(16,16,0,16,16,16);radial.addColorStop(0,'#ffffff');radial.addColorStop(.2,'#ffffffc0');radial.addColorStop(1,'#ffffff00');ctx.fillStyle=radial;ctx.fillRect(0,0,32,32)});
  const glowGeometry=new THREE.BufferGeometry();glowGeometry.setAttribute('position',new THREE.Float32BufferAttribute(signalPositions,3));
  glowGeometry.setAttribute('color',new THREE.Float32BufferAttribute(signalColors,3));
  const signalGlow=new THREE.Points(glowGeometry,new THREE.PointsMaterial({map:glowMap,size:.52,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
  signalGlow.name='Visible red amber green traffic signals';root.add(signalGlow);
  return { curves, lampPositions, signalLamps,signalGlow };
}

export async function createSkyline(scene, assets, onProgress, onWarning = () => {}) {
  const root = new THREE.Group(); root.name = 'Reconstructed Shiba district: full 3D geometry';
  scene.add(root);
  const headlightTexture=new THREE.DataTexture(new Float32Array(16*2*4),16,2,THREE.RGBAFormat,THREE.FloatType);
  headlightTexture.name='Moving vehicle headlight beams';headlightTexture.needsUpdate=true;
  const uniforms = {
    cityNight: { value: .65 }, cityWetness: { value: 0 }, cityWindows: { value: 1 }, cityClock: { value: 0 },
    cityDaylight: { value: .5 }, citySunset: { value: 1 }, cityClouds: { value: .6 }, cityCloudSpeed: { value: 1 },cityStorm:{value:0},
    citySunDirection: { value: new THREE.Vector3(-.7,.04,-.71) }, cityAirDensity:{value:.0015},
    cityHeadlights:{value:headlightTexture},cityHeadlightCount:{value:0},
  };
  makeSky(root, uniforms);
  const materials = cityMaterials(uniforms, assets);
  let survey;
  try { survey = await createCitySurvey(root, uniforms, materials.facade, assets, onProgress, onWarning); }
  catch (error) {
    console.warn('Detailed Tokyo data could not be prepared; the authored city and binder remain available.', error);
    onWarning('Detailed Tokyo data is unavailable. The authored city is shown instead; your binder remains usable. Reload the city to retry.');
    survey = { buildings: [], facades: new Map(), meshes: new Map(), bytes: 0, failed: ['manifest'] };
  }
  let environmentGenerator = null, environmentTarget = null;
  const environmentBudget = new RefreshBudget();
  function refreshEnvironment(now = performance.now(), force = false) {
    if (!environmentGenerator || !environmentBudget.pending || !force && !environmentBudget.due(now)) return;
    const previous = environmentTarget, intensity = scene.environmentIntensity;
    scene.environmentIntensity = 0;
    try {
      environmentTarget = environmentGenerator.fromScene(scene, .025, .15, CITY_FAR, {
        size: 128, position: new THREE.Vector3(0, CITY_GROUND + 9, -72),
      });
    } finally { scene.environmentIntensity = intensity; }
    scene.environment = environmentTarget.texture;
    previous?.dispose();
    environmentBudget.complete(now);
    root.userData.environmentCaptures = (root.userData.environmentCaptures || 0) + 1;
  }
  const poolTexture = canvasTexture(64, 64, ctx => {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, '#ffdb946e'); gradient.addColorStop(.4, '#ffcd6923'); gradient.addColorStop(1, '#ffce6e00');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  });
  materials.lightPool = new THREE.MeshBasicMaterial({ map: poolTexture, transparent: true, opacity: .24, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset:true,polygonOffsetFactor:0,polygonOffsetUnits:-2 });
  materials.signal = new THREE.MeshStandardMaterial({ color: 0x67b993, emissive: 0x56dbb3, emissiveIntensity: .85 });
  const roads = buildStreets(root, materials);
  const existing = combineSurveyLayout(createCityLayout(), survey.buildings);
  const infill = createCityInfill(existing,roads.curves);
  const specs = [...existing,...infill.buildings], beacons = [];
  const groundAO=canvasTexture(1024,1024,(ctx,width,height)=>{
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
    ctx.shadowColor='#17212f70';ctx.shadowBlur=5;ctx.fillStyle='#767c82';
    for(const spec of specs){
      const x=(spec.x+210)/420*width,z=(spec.z+260)/300*height;
      const w=spec.width/420*width,d=spec.depth/300*height;
      ctx.fillRect(x-w/2,z-d/2,w,d);
    }
    ctx.shadowBlur=0;ctx.fillStyle='#ffffff';
    ctx.fillRect(0,0,width,3);ctx.fillRect(0,height-3,width,3);ctx.fillRect(0,0,3,height);ctx.fillRect(width-3,0,3,height);
  });
  groundAO.colorSpace=THREE.NoColorSpace;
  const groundMaterial=new THREE.MeshStandardMaterial({
    color:0xa5a69d,roughness:.96,aoMap:groundAO,aoMapIntensity:.58,
    map:assets['city-concrete-color'],normalMap:assets['city-concrete-normal'],normalScale:new THREE.Vector2(.08,.08),
  });
  groundMaterial.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      vec3 groundWorld=(modelMatrix*vec4(transformed,1.0)).xyz;
      vAoMapUv=vec2((groundWorld.x+210.0)/420.0,1.0-(groundWorld.z+260.0)/300.0);
      vMapUv=groundWorld.xz*.23;
      vNormalMapUv=groundWorld.xz*.23;
    `);
  };
  groundMaterial.customProgramCacheKey=()=> 'city-footprint-contact-shading-v2';
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3400, 3400),groundMaterial);
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, CITY_GROUND - .035, 0);
  ground.receiveShadow = true; ground.name = 'Continuous city ground'; root.add(ground);
  buildBuildings(root, specs.filter(spec => !spec.surveyed), materials, beacons);
  for (const spec of specs) if (spec.authoredPlacement && spec.height > 18) beacons.push([spec.x, CITY_GROUND + spec.height + .08, spec.z]);
  const tower = createTokyoTower(root);
  const temple = createTemplePark(root, materials);
  const sideParks=createSideParks(root,materials);
  const neighborhood=createInfillDetails(root,infill,materials);
  const streetscape = createStreetscape(root, specs, roads.curves, uniforms, survey.facades);
  const neon=createNeonDistrict(root,specs,survey.facades,uniforms,survey.meshes);
  streetscape.addLightSources(neon.sources);
  beacons.push(...neon.beaconPositions);
  for(const spec of specs.filter(spec=>!spec.hero&&spec.height>20&&Math.abs(spec.x)<300&&spec.z< -80&&spec.z> -650).filter((_,index)=>index%3===0).slice(0,48)){
    const roof=roofFixtureAnchor(spec);
    beacons.push([roof.x,roof.y+.14,roof.z]);
  }
  beacons.push(tower.beacon);
  const sun = new THREE.DirectionalLight(0xa4c4e3, 1.2);
  const skylight = new THREE.HemisphereLight(0xa9c6e5,0x384147,.7);
  root.add(skylight);
  sun.position.set(-140, 160, -60); sun.target.position.set(0, CITY_GROUND, -230);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.00015; sun.shadow.normalBias = .12;
  Object.assign(sun.shadow.camera, { left: -180, right: 180, top: 220, bottom: -160, near: 1, far: 650 });
  sun.shadow.camera.updateProjectionMatrix();
  root.add(sun, sun.target);
  let hour = 17.75, night = .65, weather = 'clear', towerEnabled = true,cloudCover=.6;
  const emissions = [...temple.emission,...sideParks.emission, [materials.streetLamp, .85], [materials.signal, .85]];
  const groundLights = [[8.7, -52], [11, -109], [12.3, -156], [-69, -155]].map(([x, z]) => {
    const light = new THREE.PointLight(0xffc885, 38, 18, 2);
    light.position.set(x - 1.5, CITY_GROUND + 2.4, z); root.add(light); return light;
  });
  const templeLight = new THREE.PointLight(0xffcf99, 90, 36, 2);
  templeLight.position.set(8, CITY_GROUND + 6, -202); root.add(templeLight);

  function updateLighting() {
    const solar = solarState(hour);
    const envelope=weatherEnvelope(weather,cloudCover);
    night = Math.max(solar.night,solar.sunset*.75);
    uniforms.cityNight.value = night;
    uniforms.cityDaylight.value = solar.daylight;
    uniforms.citySunset.value = solar.sunset*(1-envelope.storm*.85);
    uniforms.cityClouds.value=envelope.clouds;uniforms.cityStorm.value=envelope.storm;
    uniforms.citySunDirection.value.set(...solar.sun);
    uniforms.cityWetness.value = weather === 'rain' ? 1 : weather === 'fog' ? .45 : 0;
    uniforms.cityAirDensity.value=envelope.airDensity+solar.sunset*.0002;
    scene.environmentIntensity = .55 + solar.daylight * .25;
    environmentBudget.request();
    sun.intensity = (.2 + solar.daylight * 2.1) * (1-solar.sunset*.52) * (weather === 'fog' ? .5 : weather === 'rain' ? .28 : 1);
    sun.color.copy(new THREE.Color(0xfff3d6)).lerp(new THREE.Color(0xff9d60),solar.sunset*.9);
    if (night > .95) sun.color.setHex(0x759dc6);
    skylight.color.copy(new THREE.Color(0xa9c6e5)).lerp(new THREE.Color(0xa8b8c8),night);
    skylight.groundColor.copy(new THREE.Color(0x686052)).lerp(new THREE.Color(0x70645a),night);
    skylight.intensity = .82 + solar.daylight*.35 + solar.sunset*.16;
    sun.position.copy(sun.target.position).addScaledVector(uniforms.citySunDirection.value, solar.sun[1] > 0 ? 300 : -300);
    emissions.forEach(([material, strength]) => { material.emissiveIntensity = strength * (.2 + night * 1.2); });
    groundLights.forEach(light => { light.intensity = 38 * night; });
    templeLight.intensity = 90 * night;
    tower.emission.forEach(([material, strength]) => { material.emissiveIntensity = towerEnabled ? strength * Math.pow(night,1.05) : 0; });
    materials.lightPool.opacity = .12 + night * .6;
    materials.asphalt.roughness = weather === 'rain' ? .42 : .86;
    const fogColor = new THREE.Color().lerpColors(new THREE.Color(0x89b7d2), new THREE.Color(0x22364c), night);
    fogColor.lerp(new THREE.Color(0xc88a92), solar.sunset * .4);
    scene.fog.color.copy(fogColor);
    scene.fog.density = weather === 'fog' ? .004 : weather === 'rain' ? .00155 : .0012;
    root.userData.night = night; root.userData.weather = weather; root.userData.hour = hour;
    streetscape.update(uniforms.cityClock.value);
    neon.update(uniforms.cityClock.value);
  }
  updateLighting();
  root.userData.buildingCount = specs.length;
  root.userData.noPhotographicBackdrop = true;
  root.userData.surveyedBuildingCount = survey.buildings.filter(spec=>!spec.referenceBuilding).length;
  root.userData.referenceBuildingCount = survey.buildings.filter(spec=>spec.referenceBuilding).length;
  root.userData.surveyBytes = survey.bytes;
  root.userData.failedCityTiles = survey.failed;
  root.userData.outdoorEnvironment = true;
  root.userData.infillBuildings=infill.buildings.length;
  return {
    root, specs, roads: roads.curves, beaconPositions: beacons, lampPositions: roads.lampPositions,
    tower: tower.root, temple: temple.root, sideParks:sideParks.group, streetscape: streetscape.group, uniforms,
    parking:infill.parking,neighborhood,neon:neon.root,
    prepare(renderer) {
      applyCityAir(scene,uniforms);freezeStaticTransforms(root);scene.matrixAutoUpdate=false;
      environmentGenerator ||= new THREE.PMREMGenerator(renderer);refreshEnvironment(performance.now(),true);
    },
    needsEnvironmentUpdate(now) { return environmentBudget.due(now); },
    updateView(camera, now = performance.now(), force = false, captureEnvironment = true) {
      if(captureEnvironment)refreshEnvironment(now,force);
      streetscape.update(uniforms.cityClock.value,camera.position);
    },
    dispose() { streetscape.dispose(); headlightTexture.dispose(); environmentTarget?.dispose(); environmentGenerator?.dispose(); },
    setWeather(value) { weather = value; updateLighting(); },
    setNight(value) { hour = 17 + THREE.MathUtils.clamp(value, 0, 1) * 5; updateLighting(); },
    setTime(value) { solarState(value); hour = value; updateLighting(); },
    setClouds(value) { cloudCover=THREE.MathUtils.clamp(value,0,1);updateLighting(); },
    setCloudSpeed(value) { uniforms.cityCloudSpeed.value = THREE.MathUtils.clamp(value,0,3); },
    setClock(time) {
      uniforms.cityClock.value = time;
      neon.update(time);
      emissions.forEach(([material,strength],index) => { material.emissiveIntensity = strength * (.2 + night*1.2) * (.94 + Math.sin(time*.35+index*.7)*.06); });
      groundLights.forEach((light,index) => { light.intensity = 38 * night * (.93 + Math.sin(time*.22+index)*.07); });
      roads.signalLamps.forEach(({material,index,axis,color,glow})=>{
        const active=signalState(time,index,axis)===color;
        const value={green:0x20ee96,amber:0xffb124,red:0xff160b}[color];
        material.color.setHex(value).multiplyScalar(active?1:.06);material.emissive.setHex(value);material.emissiveIntensity=active?3.1:.01;
        const rgb=material.emissive,attribute=roads.signalGlow.geometry.attributes.color;
        attribute.setXYZ(glow,active?rgb.r*2:0,active?rgb.g*2:0,active?rgb.b*2:0);
      });
      roads.signalGlow.geometry.attributes.color.needsUpdate=true;
    },
    setWindows(value) { uniforms.cityWindows.value = value ? 1 : 0; environmentBudget.request(); },
    setTower(value) { towerEnabled = value; updateLighting(); },
  };
}
