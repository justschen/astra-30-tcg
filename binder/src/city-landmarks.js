import * as THREE from 'three';
import { buildMainHall } from '../../src/arch/hall.js';
import { CityBatch } from './city-materials.js';
import { CITY_GROUND, PARK, SIDE_PARKS, TEMPLE, TEMPLE_COURT, TOWER, distanceToStreet } from './city-layout.js';
import { canvasTexture, random } from './materials.js';
export { createTokyoTower } from './tokyo-tower.js';

export function createTemplePark(parent, materials) {
  const root = new THREE.Group(); root.name = 'Zojoji temple and the Shiba Park grounds';
  root.userData.landmark = 'zojoji';
  parent.add(root);
  const stone = materials.stone;
  const pavement = materials.path;
  const batch = new CityBatch(root);
  batch.box(materials.grass, [(PARK.left + PARK.right) / 2, CITY_GROUND + .01, (PARK.near + PARK.far) / 2],
    [PARK.right - PARK.left, .02, PARK.near - PARK.far]);
  batch.box(pavement, [8, CITY_GROUND + .02, -202], [29, .04, 39]);
  batch.box(pavement, [-12, CITY_GROUND + .02, -251], [58, .04, 5]);
  batch.box(pavement, [36, CITY_GROUND + .02, -276], [4, .04, 72]);
  for (let z = -187; z > -215; z -= 2.4) {
    batch.box(stone, [8, CITY_GROUND + .042, z], [9, .006, .085]);
  }

  const { group: hall } = buildMainHall({ seed: 1101 });
  hall.name = 'Zojoji main hall: tiled irimoya roof, eaves and columns';
  const clones = new Map();
  hall.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true; object.receiveShadow = true;
    if (!clones.has(object.material)) {
      const clone = object.material.clone();
      if (clone.color.getHex() === 0xb8412c) clone.color.setHex(0x675142);
      if (clone.color.getHex() === 0x5a5f66) clone.color.setHex(0x53616a);
      clone.roughness = Math.max(.65, clone.roughness);
      clones.set(object.material, clone);
    }
    object.material = clones.get(object.material);
  });
  hall.position.set(TEMPLE.x, CITY_GROUND, TEMPLE.z); hall.scale.setScalar(.91);
  root.add(hall);
  const sideHall = hall.clone(true);
  sideHall.traverse(object => { if (object.isMesh) object.castShadow = false; });
  sideHall.position.set(-14, CITY_GROUND, -223); sideHall.scale.set(.57, .5, .54);
  sideHall.name = 'Zojoji side hall'; root.add(sideHall);
  const memorialHall = hall.clone(true);
  memorialHall.position.set(32, CITY_GROUND, -237); memorialHall.scale.setScalar(.3);
  memorialHall.name = 'Temple memorial pavilion'; root.add(memorialHall);
  const timber = new THREE.MeshStandardMaterial({ color: 0x6c3b2b, roughness: .85 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x465561, roughness: .82 });
  const lanternGlow = new THREE.MeshStandardMaterial({ color: 0xcab783, roughness: .7, emissive: 0xffc174, emissiveIntensity: .7 });
  for (const x of [2.5, 13.5]) {
    batch.beam(timber, [x, CITY_GROUND + .2, -186], [x, CITY_GROUND + 5.2, -186], .3, true);
    batch.box(stone, [x, CITY_GROUND + .2, -186], [1.25, .4, 1.25]);
  }
  batch.box(timber, [8, CITY_GROUND + 4.75, -186], [13, .54, 1.1], 0, null, true);
  batch.box(roof, [8, CITY_GROUND + 5.35, -186], [15.4, .35, 3.5], 0, null, true);
  for (const x of [-5, 21]) for (let z = -190; z > -213; z -= 5.7) {
    batch.box(stone, [x, CITY_GROUND + .43, z], [.62, .86, .62]);
    batch.box(lanternGlow, [x, CITY_GROUND + 1.12, z], [.72, .52, .72]);
    batch.box(roof, [x, CITY_GROUND + 1.44, z], [1.04, .13, 1.04]);
  }
  const rng = random(7301);
  const treeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .98 });
  treeMaterial.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 leafPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nleafPosition = position;');
    shader.fragmentShader = 'varying vec3 leafPosition;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float leaves = fract(sin(dot(floor(leafPosition * 49.0), vec3(12.31, 7.91, 53.14))) * 34891.34);
      diffuseColor.rgb *= 0.83 + leaves * 0.3;
    `);
  };
  treeMaterial.customProgramCacheKey = () => 'park-canopy-v1';
  const bark = new THREE.MeshStandardMaterial({ color: 0x545448, roughness: 1 });
  let treeCount = 0;
  for (let i = 0; i < 870; i++) {
    const x = PARK.left + rng() * (PARK.right - PARK.left), z = PARK.far + rng() * (PARK.near - PARK.far);
    if (distanceToStreet(x, z) < 3) continue;
    if (x > TEMPLE_COURT.left - 5 && x < TEMPLE_COURT.right + 8 && z > TEMPLE_COURT.far && z < TEMPLE_COURT.near + 5) continue;
    if (Math.hypot((x - TOWER.x) / 1.2, z - TOWER.z) < 21) continue;
    if (Math.abs(x - 36) < 4 && z < -249 && z > -315) continue;
    if (Math.abs(z + 251) < 4 && x > -44 && x < 19) continue;
    if (Math.hypot(x + 14, z + 223) < 11 || Math.hypot(x - 32, z + 237) < 7) continue;
    if (Math.hypot(x + 27, z + 182) < 9) continue;
    const height = 1.65 + rng() * 2.6, spread = 1.1 + rng() * 1.4;
    const color = new THREE.Color().setHSL(.26 + rng() * .075, .25 + rng() * .16, .044 + rng() * .06);
    batch.beam(bark, [x, CITY_GROUND, z], [x, CITY_GROUND + height, z], .12, false);
    for (let clump = 0; clump < 3; clump++) {
      batch.add('foliage', treeMaterial, [x + (rng() - .5) * spread, CITY_GROUND + height + rng() * .8, z + (rng() - .5) * spread],
        [spread, spread * (.68 + rng() * .4), spread * (.65 + rng() * .4)], null, color.getHex(), false);
    }
    treeCount++;
  }
  root.userData.treeCount = treeCount;
  batch.finish();
  return { root, emission: [[lanternGlow, .7]] };
}

export function createSideParks(parent,materials) {
  const group=new THREE.Group();group.name='Planted neighborhood parks in the side districts';parent.add(group);
  const batch=new CityBatch(group),rng=random(8320);
  const leaves=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.97});
  const bark=new THREE.MeshStandardMaterial({color:0x53483d,roughness:.95});
  const wood=new THREE.MeshStandardMaterial({color:0x82715e,roughness:.87});
  const lamps=new THREE.MeshStandardMaterial({color:0xe7d1a2,emissive:0xffc687,emissiveIntensity:.7,roughness:.7});
  for(const park of SIDE_PARKS){
    batch.box(materials.grass,[park.x,CITY_GROUND+.01,park.z],[park.width,.02,park.depth]);
    batch.box(materials.path,[park.x,CITY_GROUND+.025,park.z],[1.7,.03,park.depth]);
    batch.box(materials.path,[park.x,CITY_GROUND+.025,park.z],[park.width,.03,1.7]);
    for(let i=0;i<37;i++){
      const x=park.x+(rng()-.5)*(park.width-2),z=park.z+(rng()-.5)*(park.depth-2);
      if(Math.abs(x-park.x)<1.5||Math.abs(z-park.z)<1.5||distanceToStreet(x,z)<1)continue;
      const height=1.8+rng()*2.1;
      batch.beam(bark,[x,CITY_GROUND,z],[x,CITY_GROUND+height,z],.095);
      for(let clump=0;clump<3;clump++){
        const radius=.8+rng()*.5;
        batch.add('foliage',leaves,[x+(rng()-.5)*.9,CITY_GROUND+height+rng()*.6,z+(rng()-.5)*.9],[radius,radius*.9,radius],null,
          [0x405f4e,0x58765a,0x78866a][i%3]);
      }
    }
    for(const sign of [-1,1]){
      batch.box(wood,[park.x+sign*3,CITY_GROUND+.45,park.z+2],[1.7,.1,.5]);
      batch.box(wood,[park.x+sign*3,CITY_GROUND+.7,park.z+2.23],[1.7,.5,.08]);
      batch.beam(bark,[park.x+sign*2,CITY_GROUND,park.z-2],[park.x+sign*2,CITY_GROUND+1.5,park.z-2],.045);
      batch.box(lamps,[park.x+sign*2,CITY_GROUND+1.6,park.z-2],[.26,.22,.26]);
    }
  }
  batch.finish();group.userData.sideParkCount=SIDE_PARKS.length;
  return {group,emission:[[lamps,.7]]};
}
