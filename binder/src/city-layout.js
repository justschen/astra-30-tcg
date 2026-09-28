export const CITY_GROUND = -24;
// Imported geometry keeps its baked scale when a landmark's appearance is adjusted.
export const CITY_UNITS_PER_METRE = 95 / 333;
export const CITY_FAR = 1800;
export const CITY_OUTER_RADIUS = 1550;
export const CITY_REFERENCE = Object.freeze({ eye: [0, 3.05, 5.9], planeZ: -68, width: 96, height: 54, centerY: -7.3 });

// Reference anchors calibrate complete building volumes, not projected image textures.
export function referenceGround(u, v) {
  const eye = CITY_REFERENCE.eye;
  const y = (.5 - v) * CITY_REFERENCE.height + CITY_REFERENCE.centerY;
  if (y >= eye[1]) throw new RangeError('A ground anchor must be below the reference horizon.');
  const scale = (CITY_GROUND - eye[1]) / (y - eye[1]);
  return { x: (u - .5) * CITY_REFERENCE.width * scale, z: eye[2] + (CITY_REFERENCE.planeZ - eye[2]) * scale, scale };
}

export function referenceBuilding(id, u, base, top, width, depth, style, floors, extra = {}) {
  const anchor = referenceGround(u, base);
  return {
    id, x: anchor.x, z: anchor.z, width: width * CITY_REFERENCE.width * anchor.scale,
    depth, height: (base - top) * CITY_REFERENCE.height * anchor.scale,
    style, floors, yaw: 0, hero: true, ...extra,
  };
}

export const TOWER = Object.freeze({ x: 37, z: -344, height: 72, width: 72 * 80 / 333 });
export const TEMPLE = Object.freeze({ x: 8, z: -216, width: 20, depth: 20 });
export const PARK = Object.freeze({ left: -100, right: 94, near: -169, far: -391 });
export const TEMPLE_COURT = Object.freeze({ left: -8, right: 23, near: -188, far: -245 });
export const SIDE_PARKS = [
  { id:'west-neighborhood-garden',x:-96,z:-51,width:20,depth:17 },
  { id:'east-neighborhood-garden',x:90,z:-48,width:18,depth:17 },
];

export function inSidePark(x,z,width=0,depth=0) {
  return SIDE_PARKS.some(park=>Math.abs(x-park.x)<(park.width+width)/2+1&&Math.abs(z-park.z)<(park.depth+depth)/2+1);
}

export const HERO_BUILDINGS = [
  referenceBuilding('shiba-park-office', .351, .668, .496, .215, 9, 'ribbon', 14, { color: 0x655b50 }),
  referenceBuilding('park-slim-hotel', .39, .505, .322, .043, 6.8, 'hotel', 25, { color: 0xbec8c7 }),
  referenceBuilding('left-charcoal-tower', .108, .607, .253, .059, 11, 'ribbon', 31, { color: 0x6a747c }),
  referenceBuilding('front-left-cream-office', .138, 1.09, .717, .19, 7.8, 'office', 16, { color: 0xbcbcac }),
  referenceBuilding('front-center-glass', .286, 1.09, .827, .056, 4, 'glass', 11, { color: 0x789793 }),
  referenceBuilding('front-narrow-silver', .411, 1.055, .836, .035, 2.8, 'residential', 10, { color: 0xc7c8c1 }),
  referenceBuilding('street-brown-slab', .5, 1.045, .799, .036, 3.2, 'residential', 12, { color: 0xb1a99a }),
  referenceBuilding('street-dark-pencil', .557, 1.012, .661, .042, 4.2, 'ribbon', 18, { color: 0x53666e }),
  referenceBuilding('street-left-white', .468, .86, .635, .045, 4.4, 'office', 12, { color: 0xc0c4c0 }),
  referenceBuilding('street-left-mid', .52, .825, .645, .042, 3.2, 'residential', 10, { color: 0xb3b8b4 }),
  referenceBuilding('daimon-corner', .68, .834, .586, .057, 6.5, 'office', 16, { color: 0xb6c0c0 }),
  referenceBuilding('daimon-white-podium', .69, .94, .773, .036, 3.3, 'residential', 9, { color: 0xd4d1c4, z: -61 }),
  referenceBuilding('daimon-black-corner', .714, 1.013, .784, .043, 3.8, 'ribbon', 11, { color: 0x8c918b }),
  referenceBuilding('east-banded-office', .776, .901, .668, .064, 5.8, 'ribbon', 13, { color: 0xaebdc1 }),
  referenceBuilding('east-dark-glass', .866, 1.08, .75, .055, 6.7, 'glass', 17, { color: 0x72868f }),
  referenceBuilding('east-silver-twin', .944, 1.08, .729, .063, 7.2, 'ribbon', 20, { color: 0x99a7ac }),
  referenceBuilding('east-slab', 1.018, .897, .58, .05, 5.3, 'office', 17, { color: 0xb0babb }),
  referenceBuilding('park-east-hotel', .672, .479, .405, .096, 11, 'hotel', 9, { color: 0xc2bdaa }),
  referenceBuilding('right-terraced-tower', .907, .579, .245, .091, 13, 'glass', 40, { color: 0x96b4b9, stepped: true, yaw: -.1 }),
  referenceBuilding('right-rounded-tower', .78, .458, .242, .051, 10, 'ribbon', 33, { color: 0xa3b1b4, stepped: true }),
  referenceBuilding('horizon-silver-tower', .534, .382, .231, .037, 12, 'glass', 28, { color: 0xa1bcc4 }),
  referenceBuilding('horizon-lean-tower', .67, .408, .239, .036, 8, 'glass', 30, { color: 0x94a9b0, stepped: true }),
  referenceBuilding('north-east-black-tower', .826, .48, .293, .047, 10, 'ribbon', 26, { color: 0x78818c }),
  referenceBuilding('west-back-grid', .213, .443, .315, .055, 10, 'office', 19, { color: 0xc1c8c4 }),
  referenceBuilding('west-back-charcoal', .337, .439, .309, .025, 8, 'glass', 20, { color: 0x597582 }),
  referenceBuilding('west-horizon-twin', .038, .44, .279, .045, 12, 'office', 24, { color: 0x879caa }),
  referenceBuilding('west-horizon-step', -.035, .602, .477, .05, 8, 'residential', 17, { color: 0xc6cac1 }),
  referenceBuilding('near-east-sign-building', .735, .727, .615, .044, 5.5, 'office', 8, { color: 0xc4cdce }),
  referenceBuilding('near-west-blue-roof', .067, .79, .663, .093, 6.3, 'office', 9, { color: 0xbdcbd0 }),
  referenceBuilding('near-center-courtyard', .351, .82, .708, .05, 4.6, 'residential', 8, { color: 0xb2c0c0 }),
];

export const CITY_STREETS = [
  { id: 'daimon-avenue', width: 3.4, points: [[8,-14], [8, -34], [8.7, -52], [9.6, -72], [11.1, -110], [12.3, -156], [17, -178]], speed: 1.3 },
  { id: 'south-cross-street', width: 3, points: [[-55, -52], [-18, -52], [8.7, -52], [39, -52], [72, -50]], speed: 1.15 },
  { id: 'shiba-park-west', width: 3.8, points: [[-98, -105], [-73, -124], [-69, -158], [-68, -208], [-66, -260], [-77, -332], [-85, -422]], speed: 2.4 },
  { id: 'temple-approach', width: 2.5, points: [[12.3, -156], [11, -172], [9.6, -180]], speed: .85, traffic: false },
  { id: 'park-east-street', width: 3.1, points: [[40, -67], [46, -114], [50, -164], [65, -206], [82, -278], [105, -409]], speed: 1.8 },
  { id: 'north-cross-street', width: 2.7, points: [[-139, -153], [-92, -155], [-68, -157], [-22, -158], [12, -156], [50, -164], [127, -160]], speed: 1.55 },
  { id: 'east-crosstown', width: 3.8, points: [[74, -78], [135, -95], [250, -88], [450, -140], [700, -195]], speed: 2.6 },
  { id: 'west-crosstown', width: 3.8, points: [[-80, -76], [-140, -90], [-230, -69], [-450, -110], [-650, -190]], speed: 2.4 },
  { id: 'near-neighborhood-street', width: 2.8, points: [[-61,-22],[-25,-22],[8,-22],[34,-22],[61,-23]], speed: .95 },
];

function distanceToSegment(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

export function distanceToStreet(x, z) {
  return Math.min(...CITY_STREETS.map(street => Math.min(...street.points.slice(1).map((point, i) =>
    distanceToSegment(x, z, street.points[i], point))) - street.width / 2));
}

export function inPark(x, z) {
  return x > PARK.left && x < PARK.right && z < PARK.near && z > PARK.far;
}

function generator(seed) {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

export function createCityLayout() {
  const rng = generator(3257);
  const buildings = HERO_BUILDINGS.map(spec => ({ ...spec }));
  const styles = ['office', 'residential', 'ribbon', 'glass', 'hotel'];
  const colors = [0xa3afb4, 0xb8b8ae, 0x8f9b9d, 0xc3c9c6, 0x758995, 0xa2acaa, 0xb2afa5, 0xb8aaa0, 0x9caaa0, 0x91abb6];
  const occupied = (x, z, w, d) => buildings.some(spec =>
    Math.abs(spec.x - x) < (spec.width + w) / 2 + .7 && Math.abs(spec.z - z) < (spec.depth + d) / 2 + .7);
  for (let row = 0; row < 33; row++) {
    const zBase = -34 - row * 7.1;
    const spread = 65 + row * 4.5;
    for (let xBase = -spread; xBase < spread; xBase += 3.9) {
      const width = 1.5 + rng() * 2.1, depth = 2.6 + rng() * 3.8;
      const x = xBase + (rng() - .5) * 1.2, z = zBase + (rng() - .5) * 2.1;
      if (inPark(x, z) || distanceToStreet(x, z) < Math.max(width, depth) * .72 + .7 || occupied(x, z, width, depth)) continue;
      const height = 1.8 + Math.pow(rng(), 2.05) * (row < 6 ? 8 : 12);
      buildings.push({ id: `district-${row}-${Math.round(xBase)}`, x, z, width, depth, height,
        style: styles[Math.floor(rng() * styles.length)], floors: Math.max(2, Math.round(height / .78)),
        color: colors[Math.floor(rng() * colors.length)], yaw: (rng() - .5) * .055, hero: false });
    }
  }
  for (let row = 0; row < 16; row++) {
    const zBase = -265 - row * 42;
    const spread = 175 + row * 45;
    for (let xBase = -spread; xBase <= spread; xBase += 16 + row * 1.7) {
      const x = xBase + (rng() - .5) * 6, z = zBase + (rng() - .5) * 16;
      const width = 6 + rng() * 10, depth = 8 + rng() * 14;
      if (inPark(x, z) || distanceToStreet(x, z) < Math.max(width, depth) * .72 + .7 || occupied(x, z, width, depth)) continue;
      const height = 4 + Math.pow(rng(), 2.3) * (28 + row * 3);
      buildings.push({ id: `horizon-${row}-${Math.round(xBase)}`, x, z, width, depth, height,
        style: styles[Math.floor(rng() * styles.length)], floors: Math.max(4, Math.round(height / 1.1)),
        color: colors[Math.floor(rng() * colors.length)], yaw: (rng() - .5) * .09, hero: false, distant: true });
    }
  }
  let ring = 0;
  for (let radius = 58; radius <= CITY_OUTER_RADIUS; radius += 12 + radius * .07) {
    const spacing = 8 + radius * .035;
    const cells = Math.ceil(Math.PI * 2 * radius / spacing);
    for (let cell = 0; cell < cells; cell++) {
      const angle = (cell + (ring % 2) * .5 + (rng() - .5) * .24) / cells * Math.PI * 2;
      const x = Math.sin(angle) * radius, z = -Math.cos(angle) * radius;
      const width = spacing * (.44 + rng() * .24);
      const depth = (12 + radius * .07) * (.48 + rng() * .26);
      if (inPark(x, z) || distanceToStreet(x, z) < Math.max(width, depth) * .75 + .8 || occupied(x, z, width, depth)) continue;
      const height = 3 + Math.pow(rng(), 1.8) * (radius < 180 ? 17 : radius < 500 ? 38 : 85);
      buildings.push({
        id: `surround-${ring}-${cell}`, x, z, width, depth, height,
        style: styles[Math.floor(rng() * styles.length)], floors: Math.max(3, Math.round(height / 1.1)),
        color: colors[Math.floor(rng() * colors.length)], yaw: 0,
        hero: false, distant: radius > 180, surrounding: true,
      });
    }
    ring++;
  }
  const nearRandom=generator(772913);
  const infillColors=[0xc8b399,0xa2b9ad,0xb79490,0x91b5c0,0xc4c9c0,0x9fa3ba];
  for(let row=0;row<17;row++){
    const z=-12-row*4.4;
    for(let column=0;column<35;column++){
      const x=-63+column*3.7+(nearRandom()-.5)*.45;
      const width=1.8+nearRandom()*1.1,depth=2.5+nearRandom()*1.2;
      if(distanceToStreet(x,z)<Math.max(width,depth)*.76+.85||occupied(x,z,width,depth))continue;
      const height=z>-33?2.2+nearRandom()*3.9:1.4+nearRandom()*2.1;
      buildings.push({
        id:`foreground-${row}-${column}`,x,z,width,depth,height,
        floors:Math.max(2,Math.round(height/.8)),style:nearRandom()>.42?'residential':'office',
        color:infillColors[Math.floor(nearRandom()*infillColors.length)],yaw:0,hero:false,
        infill:true,pitched:nearRandom()>.43,
      });
    }
  }
  for(let i=buildings.length-1;i>=HERO_BUILDINGS.length;i--){
    const spec=buildings[i];
    if(inSidePark(spec.x,spec.z,spec.width,spec.depth))buildings.splice(i,1);
  }
  for(const [index,anchor]of [[-112,-106],[-138,-144],[117,-103],[143,-131]].entries()){
    let placed=false;
    for(const radius of [0,8,16,24,32]){
      for(const dx of radius?[-radius,0,radius]:[0]){
        for(const dz of radius?[-radius,0,radius]:[0]){
          const x=anchor[0]+dx,z=anchor[1]+dz,width=7+index*.7,depth=8+index*.5;
          if(placed||inPark(x,z)||inSidePark(x,z,width,depth)||distanceToStreet(x,z)<Math.max(width,depth)*.76+.85||occupied(x,z,width,depth))continue;
          buildings.push({id:`side-landmark-${index}`,x,z,width,depth,height:27+index*4.5,floors:28+index*4,style:index%2?'ribbon':'glass',
            color:[0xa4b5b9,0x909b9e,0xc0c8c4,0x99acb9][index],yaw:0,hero:true,sideDistrict:true,stepped:index%2===0});
          placed=true;
        }
      }
      if(placed)break;
    }
  }
  const sideRandom=generator(42077);
  for(let row=0;row<32;row++)for(let column=0;column<22;column++)for(const sign of [-1,1]){
    const x=sign*(68+column*5.8+(sideRandom()-.5)*1.2),z=-28-row*6.1;
    const width=3+sideRandom()*2.3,depth=3.7+sideRandom()*2.5;
    if(inPark(x,z)||inSidePark(x,z,width,depth)||distanceToStreet(x,z)<Math.max(width,depth)*.76+.85||occupied(x,z,width,depth))continue;
    const height=4+Math.pow(sideRandom(),1.5)*16;
    buildings.push({id:`side-infill-${sign}-${row}-${column}`,x,z,width,depth,height,floors:Math.max(3,Math.round(height/.85)),
      style:styles[Math.floor(sideRandom()*styles.length)],color:colors[Math.floor(sideRandom()*colors.length)],yaw:0,hero:false,sideDistrict:true});
  }
  return buildings;
}
