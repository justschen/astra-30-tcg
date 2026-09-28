import * as THREE from 'three';
import { canvasTexture, random } from './materials.js';
import { WINDOW_FADE_SECONDS } from './city-life.js';

export function citySurfaceTexture(kind) {
  const texture = canvasTexture(256, 256, (ctx, width, height) => {
    const rng = random(kind === 'asphalt' ? 998 : 252);
    ctx.fillStyle = kind === 'asphalt' ? '#596167' : '#a4aaab';
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 25000; i++) {
      ctx.fillStyle = `rgba(${rng() > .5 ? '247,245,231' : '15,26,33'},${rng() * .16})`;
      ctx.fillRect(rng() * width, rng() * height, 1 + rng(), 1);
    }
    if (kind === 'concrete') {
      ctx.strokeStyle = '#72797d66'; ctx.lineWidth = 1;
      for (let y = 0; y < height; y += 64) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function cityWindowTexture(kind) {
  const inset = { office: [.10, .15], glass: [.045, .07], ribbon: [.025, .2], residential: [.16, .16], hotel: [.23, .2] }[kind];
  const texture = canvasTexture(512, 512, ctx => {
    const rng = random(7453 + kind.length * 113);
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 512, 512);
    for (let floor = 0; floor < 64; floor++) {
      const occupiedFloor = rng() > .47, alternateFloor = rng() > .47;
      for (let room = 0; room < 64; room++) {
        const brightness = .28 + rng() * .36;
        const first = occupiedFloor && rng() > .28 ? Math.round(255 * brightness) : 0;
        const second = alternateFloor && rng() > .28 ? Math.round(255 * brightness) : 0;
        ctx.fillStyle = `rgb(${first},${second},0)`;
        ctx.fillRect((room + inset[0]) * 8, (floor + inset[1]) * 8, (1 - inset[0] * 2) * 8, (1 - inset[1] * 2) * 8);
      }
    }
  });
  texture.name = `Prefiltered ${kind} window occupancy`;
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function makeFacadeMaterial(kind, uniforms, assets) {
  const style = { office: 0, glass: 1, ribbon: 2, residential: 3, hotel: 4 }[kind];
  const surface = kind === 'residential' ? 'city-brick' : 'city-concrete';
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: kind === 'glass' ? .34 : .76,
    metalness: kind === 'glass' ? .46 : .045, envMapIntensity: kind === 'glass' ? .48 : .22,
    map: kind === 'glass' ? null : assets[`${surface}-color`],
    normalMap: assets[`${surface}-normal`], normalScale: new THREE.Vector2(kind === 'glass' ? .045 : .22,kind === 'glass' ? .045 : .22),
    roughnessMap: assets[`${surface}-roughness`],
    emissiveMap: cityWindowTexture(kind),
  });
  material.name = `Relightable ${kind} facades`;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `
      attribute vec3 citySize;
      attribute vec4 cityGrid;
      attribute vec3 cityLight;
      attribute vec2 cityTiming;
      varying vec3 vCityLocal;
      varying vec3 vCityFace;
      varying vec3 vCitySize;
      varying vec4 vCityGrid;
      varying vec3 vCityEye;
      varying vec3 vCityLamp;
      varying vec2 vCityTiming;
    ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vCityLocal = position * citySize;
      vCitySize = citySize;
      vCityFace = normal;
      vCityGrid = cityGrid;
      vCityLamp=cityLight;
      vCityTiming=cityTiming;
      vec2 surfaceUv = abs(normal.y) > 0.5 ? vCityLocal.xz : abs(normal.z) > 0.5 ? vCityLocal.xy : vCityLocal.zy;
      #ifdef USE_MAP
        vMapUv = surfaceUv * 0.6;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv = surfaceUv * 0.6;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv = surfaceUv * 0.6;
      #endif
      mat4 cityTransform = modelMatrix;
      #ifdef USE_INSTANCING
        cityTransform *= instanceMatrix;
      #endif
      vec3 cityView = cameraPosition - (cityTransform * vec4(position, 1.0)).xyz;
      vCityEye = vec3(dot(cityView, normalize(cityTransform[0].xyz)),
                     dot(cityView, normalize(cityTransform[1].xyz)),
                     dot(cityView, normalize(cityTransform[2].xyz)));
    `);
    shader.fragmentShader = `
      uniform float cityNight;
      uniform float cityWetness;
      uniform float cityWindows;
      uniform float cityClock;
      varying vec3 vCityLocal;
      varying vec3 vCityFace;
      varying vec3 vCitySize;
      varying vec4 vCityGrid;
      varying vec3 vCityEye;
      varying vec3 vCityLamp;
      varying vec2 vCityTiming;
      float cityHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float cityWindow(vec2 uv, vec2 inset, vec2 edge) {
        vec2 lower = smoothstep(inset, inset + edge, uv);
        vec2 upper = 1.0 - smoothstep(vec2(1.0) - inset - edge, vec2(1.0) - inset, uv);
        return lower.x * lower.y * upper.x * upper.y;
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      bool cityRoof = abs(vCityFace.y) > 0.5;
      bool cityFront = abs(vCityFace.z) > 0.5;
      vec2 facade = vec2(cityFront ? vCityLocal.x : vCityLocal.z, vCityLocal.y);
      vec2 size = vec2(cityFront ? vCitySize.x : vCitySize.z, vCitySize.y);
      vec2 cells = vec2(cityFront ? vCityGrid.x : vCityGrid.y, vCityGrid.z);
      vec2 grid = (facade / size + 0.5) * cells;
      vec2 cellAA=fwidth(grid)*.65+vec2(.001);
      float cellPixels=min(1.0/max(.001,fwidth(grid.x)),1.0/max(.001,fwidth(grid.y)));
      float windowDetail=smoothstep(.8,2.4,cellPixels);
      vec2 cell = floor(grid);
      vec2 within = fract(grid);
      float roomChoice = cityHash(cell + vCityGrid.w);
      float shadedRoom=mix(.5,roomChoice,windowDetail);
      float suite = cityHash(vec2(floor(cell.x / 4.0), floor(cell.y / 2.0)) + vCityGrid.w * 3.1);
      float floorUse = cityHash(vec2(cell.y, floor(vCityGrid.w)));
      float occupied = smoothstep(0.42 - cityNight * 0.22, 0.49 - cityNight * 0.22, suite);
      occupied *= smoothstep(0.11, 0.21, roomChoice);
      occupied *= 0.65 + floorUse * 0.35;
      if (${style < 3 ? 'true' : 'false'}) {
        occupied = smoothstep(.49,.59,floorUse) * (.76+suite*.24);
        occupied *= smoothstep(.22,.32,roomChoice);
      }
      float roomPeriod=vCityTiming.x*(.8+roomChoice*.5);
      float roomPhase=mod(cityClock+vCityTiming.y+suite*roomPeriod,roomPeriod);
      float onDuration=roomPeriod*(.38+floorUse*.35);
      float activity=smoothstep(0.0,${WINDOW_FADE_SECONDS.toFixed(1)},roomPhase)*(1.0-smoothstep(onDuration-${WINDOW_FADE_SECONDS.toFixed(1)},onDuration,roomPhase));
      occupied*=mix(1.0,activity,step(.54,roomChoice));
      vec2 inset = vec2(${style === 1 ? '.045, .07' : style === 2 ? '.025, .2' : style === 3 ? '.16, .16' : style === 4 ? '.23, .2' : '.10, .15'});
      float glassMask = cityRoof ? 0.0 : mix(${style===1?'.78':style===2?'.57':style===3?'.46':style===4?'.324':'.56'},cityWindow(within,inset,cellAA),windowDetail);
      occupied=mix(.35+cityHash(vec2(vCityGrid.w,17.0))*.25,occupied,windowDetail);
      vec3 eye = normalize(vCityEye);
      vec2 parallax = vec2(cityFront ? eye.x : eye.z, eye.y) / max(0.22, abs(cityFront ? eye.z : eye.x));
      vec2 interior = within - parallax * vec2(0.10, 0.15);
      float recess = cityWindow(interior, inset + vec2(0.07,0.10),cellAA);
      float ceiling = smoothstep(0.73, 0.79, interior.y) * (1.0-smoothstep(0.81,0.86,interior.y));
      float desk = (1.0-smoothstep(0.22,0.27,interior.y)) * step(.35,roomChoice);
      float furniture = cityWindow(fract(interior*vec2(2.0,1.0)),vec2(.22,.36),cellAA*vec2(2.0,1.0)) * step(.71,roomChoice);
      float fresnel = pow(1.0 - abs(dot(eye,normalize(vCityFace))), 3.0);
      float skyBand = smoothstep(-.1,.75,eye.y) * .07;
      vec3 glassColor = mix(vec3(0.014,0.038,0.065),vec3(0.055,0.13,0.19),shadedRoom);
      glassColor += vec3(.10,.20,.29) * fresnel + vec3(.015,.05,.09) * skyBand;
      float blindOpen=.5-.5*cos((cityClock+vCityTiming.y+cell.x*5.7)/(roomPeriod*1.43)*6.283185);
      float blindEdge=.17+blindOpen*.82;
      float blinds = step(.48, roomChoice) * smoothstep(blindEdge,blindEdge+.035,within.y);
      blinds=mix(.2,blinds,windowDetail);
      float blindLines = mix(.5,smoothstep(.35,.65,fract(interior.y*15.0)),windowDetail);
      glassColor = mix(glassColor, vec3(.12,.15,.16) * (.75 + blindLines*.25), blinds * .75);
      glassColor *= .88;
      float floorBand = mix(.06,1.0 - smoothstep(0.045, 0.075, within.y),windowDetail);
      float grainDetail=1.0-smoothstep(.2,.8,length(fwidth(facade*29.0)));
      float grout = mix(.0275,cityHash(floor(facade * 29.0)) * 0.055,grainDetail);
      float streakDetail=1.0-smoothstep(.15,.6,abs(fwidth(facade.x*7.0)));
      float streak = mix(.25,cityHash(vec2(floor(facade.x*7.0),vCityGrid.w)) * smoothstep(.06,.55,within.y),streakDetail);
      vec3 wallColor = diffuseColor.rgb * (0.82 + grout - streak * .06);
      wallColor*=.78+.22*smoothstep(0.0,.22,vCityLocal.y/vCitySize.y+.5);
      wallColor*=mix(vec3(1.0),normalize(vCityLamp)*1.5,.035);
      wallColor *= 1.0 - floorBand * ${style === 2 ? '.38' : '.17'};
      if (${style === 3 ? 'true' : 'false'}) {
        wallColor *= 0.77 + smoothstep(0.10, 0.21, within.y) * 0.23;
      }
      diffuseColor.rgb = mix(wallColor, glassColor, glassMask);
      if (cityRoof) {
        float roofVariation = mix(.5,cityHash(floor(vCityLocal.xz * 2.0 + vCityGrid.w)),1.0-smoothstep(.2,.8,length(fwidth(vCityLocal.xz*2.0))));
        diffuseColor.rgb *= 0.76 + roofVariation * 0.08;
      }
      vec3 lampColor=mix(vCityLamp*1.55,vec3(.88,.96,1.0),shadedRoom*.1);
      float interiorLight = mix(.75,max(.08,mix(.43,1.0,recess) + ceiling * .4 - desk * .3 - furniture * .2),windowDetail);
      float litWindow = glassMask * occupied * (1.0 - blinds * 0.55) * interiorLight;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.17 + shadedRoom * .10, glassMask);
      roughnessFactor *= 1.0 - cityWetness * 0.19;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      float officeDimming = 0.91 + 0.09 * sin(cityClock * 0.22 + floor(cell.x / 4.0) * 1.7 + cell.y + vCityGrid.w);
      vec3 resolvedEmission=lampColor*litWindow*(.55+roomChoice*1.55)*officeDimming*.72;
      vec2 patternUv=(grid+vec2(mod(vCityGrid.w,47.0),mod(vCityGrid.w*.37,53.0)))/64.0;
      vec2 filteredRooms=texture2D(emissiveMap,patternUv).rg;
      float slowActivity=.5+.5*sin(cityClock*.018+vCityGrid.w);
      vec3 filteredEmission=vCityLamp*1.55*mix(filteredRooms.r,filteredRooms.g,slowActivity);
      filteredEmission=mix(vCityLamp*.045,filteredEmission,smoothstep(.8,1.5,cellPixels));
      totalEmissiveRadiance += (cityRoof?vec3(0.0):mix(filteredEmission,resolvedEmission,windowDetail))*cityNight*cityWindows;
    `);
  };
  material.customProgramCacheKey = () => `afterhours-city-facade-${kind}-mipmapped-rooms-v7`;
  return material;
}

export class CityBatch {
  constructor(parent) {
    this.parent = parent;
    this.groups = new Map();
    this.dummy = new THREE.Object3D();
  }

  add(shape, material, position, size, quaternion = null, color = null, shadows = false) {
    const key = `${shape}-${material.uuid}-${shadows}`;
    if (!this.groups.has(key)) this.groups.set(key, { shape, material, transforms: [], colors: [], shadows });
    const group = this.groups.get(key);
    this.dummy.position.set(...position);
    this.dummy.scale.set(...size);
    this.dummy.quaternion.copy(quaternion || new THREE.Quaternion());
    this.dummy.updateMatrix();
    group.transforms.push(this.dummy.matrix.clone());
    group.colors.push(color === null ? null : new THREE.Color(color));
  }

  box(material, position, size, yaw = 0, color = null, shadows = false) {
    this.add('box', material, position, size, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), color, shadows);
  }

  beam(material, a, b, radius, shadows = false) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
    const direction = to.clone().sub(from);
    if (direction.lengthSq() < 1e-8) return;
    this.add('cylinder', material, from.add(to).multiplyScalar(.5).toArray(), [radius, direction.length(), radius],
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()), null, shadows);
  }

  finish() {
    for (const { shape, material, transforms, colors, shadows } of this.groups.values()) {
      const geometry = shape === 'box' ? new THREE.BoxGeometry(1, 1, 1)
        : shape === 'plane' ? new THREE.PlaneGeometry(1, 1)
        : shape === 'gable-roof' ? new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([
          -.5,0,-.5, -.5,0,.5, 0,1,.5, -.5,0,-.5, 0,1,.5, 0,1,-.5,
          0,1,-.5, 0,1,.5, .5,0,.5, 0,1,-.5, .5,0,.5, .5,0,-.5,
          -.5,0,.5, .5,0,.5, 0,1,.5, .5,0,-.5, -.5,0,-.5, 0,1,-.5,
        ],3))
        : shape === 'foliage' ? new THREE.IcosahedronGeometry(1, 2)
          : new THREE.CylinderGeometry(1, 1, 1, 7);
      if(shape==='gable-roof')geometry.computeVertexNormals();
      if (shape === 'foliage') {
        const points = geometry.attributes.position;
        for (let i = 0; i < points.count; i++) {
          const x = points.getX(i), y = points.getY(i), z = points.getZ(i);
          const irregularity = .91 + .075 * Math.sin(x * 13.7 + y * 8.1) + .068 * Math.cos(z * 14.5 - x * 3.4);
          points.setXYZ(i, x * irregularity, y * irregularity, z * irregularity);
        }
        geometry.computeVertexNormals();
      }
      const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
      transforms.forEach((matrix, index) => {
        mesh.setMatrixAt(index, matrix);
        if (colors[index]) mesh.setColorAt(index, colors[index]);
      });
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.name = `City ${shape} details (${transforms.length})`;
      mesh.userData.cityGroundSurface = Boolean(material.userData.cityGroundSurface);
      this.parent.add(mesh);
    }
    this.groups.clear();
  }
}
