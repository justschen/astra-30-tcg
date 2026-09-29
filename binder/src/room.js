import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { Binder } from './binder3d.js';
import { createSkyline } from './skyline.js';
import { CityAtmosphere } from './city-motion.js';
import { CardTextures, beam, box, canvasTexture, contactShadow, fabricTexture, freezeStaticTransforms, loadRoomAssets, random, roundedBox, textTexture, upholsteredCushion } from './materials.js';
import { PILES } from './collection.js';
import { selectedFromHand } from './hand.js';
import { lookDelta } from './look-controls.js';
import { createPaperLantern, createRoomDecor } from './room-decor.js';
import { CITY_FAR } from './city-layout.js';
import { CityLightPass } from './city-light-pass.js';
import { BALCONY_CAMERA, createCoffeeSteam, createRoomExtras } from './room-extras.js';
import { createRoomTV } from './room-tv.js';
import { CardAdmiration } from './card-admiration.js';
import { createInteriorShell, createRoomNooks, interiorWallMaterial } from './room-nooks.js';
import { createHouseplants, loadRoomPlants } from './room-plants.js';
import { CityBatch } from './city-materials.js';
import { RoomRenderCache } from './room-render-cache.js';
import { GRAPHICS_PRESETS, renderSizing } from './render-quality.js';

const mat = (color, roughness = .7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const luminous = color => new THREE.MeshBasicMaterial({ color, toneMapped: false });
const PILE_POSITIONS = { unsorted: [3.04, .59, 1.18], favorites: [3.18, .59, -.17], trades: [2.97, .59, -1.52] };
const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));

function createApartment(scene, assets, plants) {
  const occluder = mesh => { mesh.userData.cityOccluder = true; return mesh; };
  const charcoal = mat(0x202831, .93);
  const plaster = interiorWallMaterial(assets);
  const blackMetal = mat(0x242e34, .3, .78);
  const walnut = new THREE.MeshPhysicalMaterial({
    map: assets['oak-color'], normalMap: assets['oak-normal'], normalScale: new THREE.Vector2(.13, .13),
    roughnessMap: assets['oak-roughness'], color: 0x8195a1, roughness: .93, clearcoat: .035, clearcoatRoughness: .7,
  });
  occluder(box(scene, [20, .22, 26], [0, -1.63, 5.5], new THREE.MeshStandardMaterial({
    color: 0x49483d, roughness: .96,
  })));
  const floorBoards = new CityBatch(scene), floorWood = new THREE.MeshStandardMaterial({
    map: assets['oak-color'], color: 0x77868b, normalMap: assets['oak-normal'], normalScale: new THREE.Vector2(.10,.10), roughness: .96,
  });
  for(let column=0;column<22;column++){
    const width=20/22,x=-10+(column+.5)*width;
    for(let z=-7.5-(column%3)*1.38;z<18.5;z+=4.15){
      const from=Math.max(-7.5,z),to=Math.min(18.5,z+4.15);
      if(to-from<.01)continue;
      floorBoards.box(floorWood,[x,-1.5155,(from+to)/2],[width-.007,.009,to-from-.009],0,new THREE.Color().setScalar(.90+((column*3+Math.round(z*10))%7+7)%7*.016));
    }
  }
  floorBoards.finish();
  occluder(box(scene, [3.1, 10, .26], [-8.3, 2.2, -7.2], charcoal));
  occluder(box(scene, [1.4, 10, .25], [9.4, 2.2, -7.2], charcoal));
  createInteriorShell(scene,plaster);
  for (const x of [-6.7, -2.6, 2, 6.6, 8.65]) {
    box(scene, [.095, 8.4, .17], [x, 2.55, -7.05], blackMetal);
    box(scene, [.02, 7.3, .025], [x + .045, 2.25, -6.945], mat(0x87979e, .28, .9));
  }
  for (const y of [-1.45, 5.9]) box(scene, [15.4, .11, .22], [.98, y, -7.05], blackMetal);
  box(scene, [15.4, .06, .07], [.98, -1.38, -6.85], luminous(0x729fac));
  box(scene, [.022, 6.5, .026], [8.53, 1.9, -6.86], luminous(0x84c4ce));
  box(scene, [.022, 6.5, .026], [-6.58, 1.9, -6.86], luminous(0xbb7b9d));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(15.3, 7.2), new THREE.MeshPhysicalMaterial({
    color: 0xadc1c8, transparent: true, opacity: .026, roughness: .08, metalness: .2, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false,
  }));
  glass.position.set(.98, 2.2, -7.04); scene.add(glass);
  const glazing=[glass];
  box(scene, [16, .2, 2.5], [1, -1.66, -8.5], mat(0x444c51));
  for (let x = -6.7; x <= 8.8; x += 1.55) box(scene, [.035, 1.58, .04], [x, -.8, -9.38], blackMetal);
  beam(scene, [-6.8, .015, -9.38], [8.9, .015, -9.38], .032, blackMetal);
  beam(scene, [-6.8, -.96, -9.38], [8.9, -.96, -9.38], .019, blackMetal);
  const railingGlass = new THREE.Mesh(new THREE.PlaneGeometry(15.7, 1.35), new THREE.MeshPhysicalMaterial({
    color: 0xa8c4ce, transparent: true, opacity: .055, roughness: .08, metalness: .2, side: THREE.DoubleSide, depthWrite: false,
  }));
  railingGlass.position.set(1.05, -.7, -9.4); scene.add(railingGlass);
  glazing.push(railingGlass);
  for(const x of [-6.8,8.9]){
    for(const z of [-9.38,-8.33,-7.28])box(scene,[.04,1.58,.04],[x,-.8,z],blackMetal);
    for(const y of [.015,-.96])beam(scene,[x,y,-9.38],[x,y,-7.2],y>0?.032:.019,blackMetal);
    const side=new THREE.Mesh(new THREE.PlaneGeometry(2.18,1.35),railingGlass.material);
    side.rotation.y=Math.PI/2;side.position.set(x,-.7,-8.29);side.name='Balcony side glass railing';scene.add(side);
    glazing.push(side);
  }
  const rugTexture = fabricTexture('#666a71');
  const rug = roundedBox(scene, [12.5, .025, 10], [0, -1.49, -.4], new THREE.MeshStandardMaterial({
    map: rugTexture, color: 0x737577, roughness: 1, normalMap: assets['upholstery-normal'], normalScale: new THREE.Vector2(.5, .5),
  }), .12);
  rug.castShadow = false;
  const sofa = new THREE.Group(); sofa.position.set(-4.6, -1.46, -4.7); sofa.rotation.y = .12;
  sofa.scale.set(1.18,1.18,1.15);
  const velvet = new THREE.MeshPhysicalMaterial({
    color: 0x5b6265, roughness: .97, normalMap: assets['upholstery-normal'], normalScale: new THREE.Vector2(.32, .32),
    roughnessMap: assets['upholstery-roughness'], sheen: .28, sheenColor: new THREE.Color(0x737c7c), sheenRoughness: .88,
  });
  const pinkCushion = velvet.clone(); pinkCushion.color.setHex(0x92706c);
  const greenCushion = velvet.clone(); greenCushion.color.setHex(0x74806b);
  upholsteredCushion(sofa, [4.3, .48, 1.72], [0, .5, 0], velvet, .18);
  upholsteredCushion(sofa, [4.3, 1.27, .4], [0, 1.18, -.71], velvet, .14);
  for (const x of [-2, 2]) upholsteredCushion(sofa, [.35, 1, 1.65], [x, .95, 0], velvet, .14);
  for (const x of [-1.27, 0, 1.27]) {
    upholsteredCushion(sofa, [1.22, .29, 1.27], [x, .86, .05], velvet, .14);
    upholsteredCushion(sofa, [1.19, .77, .29], [x, 1.35, -.47], velvet, .14).rotation.x = -.12;
    contactShadow(sofa, [1.3, 1.48], [x, .725, .03], .48);
  }
  const pillow = upholsteredCushion(sofa, [.72, .72, .27], [-1.29, 1.25, -.05], pinkCushion, .2); pillow.rotation.z = -.23; pillow.rotation.x = -.22;
  const pillow2 = upholsteredCushion(sofa, [.65, .62, .28], [1.36, 1.23, -.03], greenCushion, .16); pillow2.rotation.z = .21;
  const blanketMaterial = velvet.clone(); blanketMaterial.color.setHex(0xb49e8a); blanketMaterial.side = THREE.DoubleSide;
  const blanketGeometry = new THREE.PlaneGeometry(.86, 1.65, 18, 36);
  const blanketPoints = blanketGeometry.attributes.position, blanketUV = blanketGeometry.attributes.uv;
  for (let i = 0; i < blanketPoints.count; i++) {
    const u = blanketUV.getX(i), v = blanketUV.getY(i);
    blanketPoints.setXYZ(i, (u - .5) * .86, 1.03 - Math.max(0, .35 - v) * 1.7 + Math.sin(u * 22) * .026, (v - .5) * 1.65 + .27);
  }
  blanketGeometry.computeVertexNormals();
  const throwBlanket = new THREE.Mesh(blanketGeometry, blanketMaterial);
  throwBlanket.position.x = .95; throwBlanket.rotation.y = -.14; throwBlanket.castShadow = true; throwBlanket.receiveShadow = true; sofa.add(throwBlanket);
  contactShadow(sofa, [5.4, 2.65], [0, .008, 0], .7);
  scene.add(sofa);
  box(scene, [4.05, .025, .08], [-4.57, -1.12, -5.63], luminous(0xc174a5));

  const lamp = new THREE.Group(); lamp.position.set(-4.08, -1.49, -2.25);
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(.36, .4, .09, 32), blackMetal); lampBase.position.y = .055; lamp.add(lampBase);
  beam(lamp, [0, .08, 0], [0, 4.4, 0], .035, blackMetal);
  const floorPaper = createPaperLantern(lamp, [0, 4.25, 0], .63, .82, assets);
  scene.add(lamp);
  const lampLight = new THREE.PointLight(0xffcf99, 9, 13, 2); lampLight.position.set(-4.08, 2.53, -2.25);
  lampLight.castShadow = true; lampLight.shadow.mapSize.set(512, 512); lampLight.shadow.normalBias = .035;
  scene.add(lampLight);
  const decor = createRoomDecor(scene, assets);

  occluder(roundedBox(scene, [8.6, .20, 6.8], [0, .47, 1.25], walnut, .12));
  for (const x of [-3.65, 3.65]) for (const z of [-1.45, 3.95]) box(scene, [.15, 1.95, .17], [x, -.6, z], blackMetal);
  contactShadow(scene, [6.7, 4.95], [0, .574, .7], .32);
  const deskMat = roundedBox(scene, [5.38, .017, 3.89], [0, .583, .7], new THREE.MeshPhysicalMaterial({
    color: 0x334149, roughness: .93, normalMap: assets['upholstery-normal'], normalScale: new THREE.Vector2(.3, .3),
    sheen: .35, sheenColor: new THREE.Color(0x859194), sheenRoughness: .9,
  }), .15);
  deskMat.castShadow = false;
  const matLogo = new THREE.Mesh(new THREE.PlaneGeometry(.83, .16), new THREE.MeshBasicMaterial({
    map: textTexture('AFTERHOURS', { color: '#99a4ad', size: 24 }), transparent: true, depthWrite: false,
  }));
  matLogo.rotation.x = -Math.PI / 2; matLogo.position.set(-1.95, .596, 2.49); scene.add(matLogo);
  const binderShadow = contactShadow(scene, [5.4, 3.9], [0, .597, .7], .65);
  createMug(scene);
  contactShadow(scene, [1.08, 1.37], [-3.43, .578, -.36], .55);
  const sleeveBox = roundedBox(scene, [.8, .14, 1.1], [-3.43, .65, -.36], mat(0xc7c3b6, .6), .045);
  sleeveBox.rotation.y = -.19;
  const sleeveLabel = new THREE.Mesh(new THREE.PlaneGeometry(.65, .88), new THREE.MeshBasicMaterial({
    map: textTexture('SOFT SLEEVES\nFOR THE KEEPERS', { width: 280, height: 380, size: 26, color: '#797056', background: '#d0cbbb' }),
  }));
  sleeveLabel.rotation.x = -Math.PI / 2; sleeveLabel.position.y = .072; sleeveBox.add(sleeveLabel);
  const extras=createRoomExtras(scene,assets);
  const nooks=createRoomNooks(scene,assets,plaster);
  createHouseplants(scene,plants);
  return { lampLight, floorPaper, decor, binderShadow,nooks,glazing,...extras };
}

function createMug(scene) {
  const group = new THREE.Group(); group.position.set(-3.45, .577, 1.76); group.rotation.y = -.32;
  const glaze = canvasTexture(512, 512, (ctx, width, height) => {
    const rng = random(851);
    ctx.fillStyle = '#b0bcae'; ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 4400; i++) {
      ctx.fillStyle = `rgba(38,56,42,${.04 + rng() * .18})`;
      ctx.beginPath(); ctx.arc(rng() * width, rng() * height, .25 + rng() * .75, 0, Math.PI * 2); ctx.fill();
    }
  });
  const ceramic = new THREE.MeshPhysicalMaterial({ map: glaze, color: 0xc3d0c2, roughness: .29, clearcoat: .85, clearcoatRoughness: .15, bumpMap: glaze, bumpScale: .002 });
  const profile = [
    new THREE.Vector2(.02, 0), new THREE.Vector2(.27, 0), new THREE.Vector2(.315, .035),
    new THREE.Vector2(.345, .57), new THREE.Vector2(.334, .59), new THREE.Vector2(.309, .572),
    new THREE.Vector2(.28, .055), new THREE.Vector2(.02, .055),
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), ceramic); body.castShadow = true; group.add(body);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.205, .054, 12, 32), ceramic);
  handle.position.set(.354, .31, 0); handle.scale.x = .8; group.add(handle);
  const tea = new THREE.Mesh(new THREE.CircleGeometry(.3, 40), new THREE.MeshPhysicalMaterial({ color: 0x312619, roughness: .12, metalness: .22 }));
  tea.rotation.x = -Math.PI / 2; tea.position.y = .52; group.add(tea);
  const meniscus = new THREE.Mesh(new THREE.TorusGeometry(.296, .006, 8, 48), new THREE.MeshPhysicalMaterial({
    color: 0x756444, roughness: .13, metalness: .3,
  }));
  meniscus.rotation.x = -Math.PI / 2; meniscus.position.y = .52; group.add(meniscus);
  const coaster = new THREE.Mesh(new THREE.CylinderGeometry(.445, .445, .025, 48), mat(0x494d4b, .9));
  coaster.position.y = -.006; group.add(coaster);
  contactShadow(group, [1.3, 1.3], [0, -.011, 0], .65);
  scene.add(group);
}

export async function createRoom(canvas, { state, onError, onLayout, onTurn, onProgress, onCityWarning = onError, reducedMotion, graphicsQuality = 'auto' }) {
  if(!Object.hasOwn(GRAPHICS_PRESETS,graphicsQuality))throw new RangeError('Unknown graphics setting.');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  let renderDirty=true,cityDirty=true,roomDirty=true,renderedFrames=0,cityFrames=0,modalOccluded=false;
  const invalidate=(city=false,interior=true)=>{renderDirty=true;cityDirty||=city;roomDirty||=interior;};
  onProgress?.('Preparing room materials and plants...');
  const [materialResult,plantResult] = await Promise.allSettled([loadRoomAssets(),loadRoomPlants(onError)]);
  if(materialResult.status==='rejected'||plantResult.status==='rejected'){
    if(materialResult.status==='fulfilled')Object.values(materialResult.value).forEach(texture=>texture.dispose());
    if(plantResult.status==='fulfilled')plantResult.value.dispose();
    renderer.dispose();throw materialResult.status==='rejected'?materialResult.reason:plantResult.reason;
  }
  const assets=materialResult.value,plants=plantResult.value;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.autoClear = false;
  renderer.info.autoReset = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.13;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x142331, .003);
  const cityScene = new THREE.Scene();
  cityScene.fog = new THREE.FogExp2(0x253d53, .001);
  let cityShadowsDirty = true;
  let roomShadowsDirty = true;
  const environmentScene = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(environmentScene, .04);
  scene.environment = environment.texture; scene.environmentIntensity = .35;
  environmentScene.dispose(); pmrem.dispose();
  await yieldToBrowser();
  scene.add(new THREE.HemisphereLight(0xa7c4da, 0x786c5c, .42));
  RectAreaLightUniformsLib.init();
  const windowLight = new THREE.RectAreaLight(0x97b7d2, .65, 9, 4.8);
  windowLight.position.set(1.2, 3.6, -6.7); windowLight.lookAt(0, .6, 2); scene.add(windowLight);
  const ceilingLight = new THREE.RectAreaLight(0xffead4, .9, 5, 3);
  ceilingLight.position.set(-.7, 6.7, 1.8); ceilingLight.lookAt(0, .5, .8); scene.add(ceilingLight);
  const key = new THREE.SpotLight(0xffdcb8, 20, 24, .9, 1, 2);
  key.position.set(-2.1, 6.5, 3.9); key.target.position.set(0, .5, .8); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.00008; key.shadow.normalBias = .014; key.shadow.radius = 3;
  scene.add(key, key.target);
  const cyan = new THREE.PointLight(0x6eafc9, 12, 17, 2); cyan.position.set(5.7, 2.8, -4.8); scene.add(cyan);
  const pink = new THREE.PointLight(0xc188a5, 8, 14, 2); pink.position.set(-5.4, .5, -4.3); scene.add(pink);
  let skyline;
  try { skyline = await createSkyline(cityScene, assets, onProgress, onCityWarning); }
  catch (error) {
    Object.values(assets).forEach(texture => texture.dispose());
    plants.dispose(); environment.dispose(); renderer.dispose(); throw error;
  }
  const cityLightPass = new CityLightPass(renderer,onError);
  const roomCache = new RoomRenderCache(renderer);
  const atmosphere = new CityAtmosphere(cityScene, skyline, reducedMotion);
  renderer.shadowMap.needsUpdate = true;
  skyline.prepare(renderer);
  cityShadowsDirty = false;
  const apartmentRoot=new THREE.Group();apartmentRoot.name='Static apartment geometry';scene.add(apartmentRoot);
  const apartment = createApartment(apartmentRoot, assets, plants);
  freezeStaticTransforms(apartmentRoot);scene.matrixAutoUpdate=false;
  const cityOccluders = new THREE.Scene();
  // Keep copied occluder depth just behind the normally shaded, MSAA-resolved surface.
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  apartmentRoot.traverse(source => {
    if (!source.userData.cityOccluder) return;
    const mesh = new THREE.Mesh(source.geometry, depthOnly);
    mesh.matrix.copy(source.matrixWorld); mesh.matrixAutoUpdate = false; cityOccluders.add(mesh);
  });
  const television=createRoomTV(canvas.parentElement,apartment.tvScreen,scene,onError);
  onProgress?.('Opening your binder...');
  await yieldToBrowser();
  const textures = new CardTextures(onError,()=>invalidate());
  const steamScene=new THREE.Scene(),coffeeSteam=createCoffeeSteam(steamScene);
  let warmRoom = false;
  function updateWindowDaylight() {
    const day = skyline.uniforms.cityDaylight.value, sunset = skyline.uniforms.citySunset.value;
    windowLight.color.setHex(warmRoom ? 0xaebcc5 : 0x9db8cd).lerp(new THREE.Color(0xffc6a1), sunset * .2);
    windowLight.intensity = .4 + day * .55;
    scene.environmentIntensity = .29 + day * .11;
    invalidate();
  }
  updateWindowDaylight();
  const binder = new Binder(scene, textures, assets);
  binder.sync(state);
  const camera = new THREE.PerspectiveCamera(42, 1, .15, CITY_FAR);
  const admiration=new CardAdmiration(scene,()=>invalidate(),onError,textures.finishes);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let currentState = state;
  let handIds = [];
  let activeHandId = null;
  let handSet = new Set();
  let pileGroup = new THREE.Group(); scene.add(pileGroup);
  let pileTargets = [];
  let mode = 'binder';
  let disposed = false;
  let dirtyLayout = true;
  let frame = 0;
  let lastTime = performance.now();
  const desired = { yaw: 0, pitch: .36, fov: 49, position: new THREE.Vector3(0, 3.7, 6.1) };
  const actual = { yaw: desired.yaw, pitch: desired.pitch, fov: desired.fov, position: desired.position.clone() };
  let width = 1, height = 1;
  let sizing=null;
  const corners = [new THREE.Vector3(-.322, 0, -.442), new THREE.Vector3(.322, 0, -.442), new THREE.Vector3(.322, 0, .442), new THREE.Vector3(-.322, 0, .442)];
  const screenVector = new THREE.Vector3();
  const drawingBufferSize = new THREE.Vector2();

  function cleanPiles() {
    pileGroup.traverse(object => {
      object.geometry?.dispose();
      if (object.material?.userData.cardId) textures.release(object.material);
      else if (object.material) { object.material.map?.dispose(); object.material.dispose(); }
    });
    pileGroup.removeFromParent();
    pileGroup = new THREE.Group(); scene.add(pileGroup); pileTargets = [];
  }

  function syncPiles() {
    cleanPiles();
    for (const [pile, position] of Object.entries(PILE_POSITIONS)) {
      const ids = currentState.piles[pile].filter(id => !handSet.has(id));
      const group = new THREE.Group(); group.position.set(...position);
      group.rotation.y = pile === 'unsorted' ? -.16 : pile === 'favorites' ? .13 : -.11;
      pileGroup.add(group);
      contactShadow(group, [1.03, 1.32], [0, .008, 0], .6);
      const pad = roundedBox(group, [.84, .012, 1.13], [0, .005, 0], mat(0x3e4b51, .9), .055);
      pad.userData = { kind: 'pile', pile }; pileTargets.push(pad);
      const layers = Math.min(ids.length, 7);
      for (let i = layers - 1; i >= 0; i--) {
        const y = .025 + (layers - i) * .008;
        roundedBox(group, [.626, .007, .881], [(i % 3 - 1) * .018, y, (i % 2) * .016], mat(0xdad3bf, .72), .02);
        if (i > 2) continue;
        const face = new THREE.Mesh(new THREE.PlaneGeometry(.616, .861), textures.material(ids[i]));
        face.rotation.x = -Math.PI / 2;
        face.position.set((i % 3 - 1) * .018, y + .0045, (i % 2) * .016);
        face.userData = { kind: 'card', id: ids[i], pile, cardId: ids[i] };
        group.add(face); pileTargets.push(face);
      }
    }
    pileGroup.updateMatrixWorld(true);
    freezeStaticTransforms(pileGroup);
    textures.trim();
  }
  syncPiles();

  function resizeRenderTargets(){
    const next=renderSizing(graphicsQuality,width,height,window.devicePixelRatio||1);
    if(sizing&&next.width===sizing.width&&next.height===sizing.height&&next.cityWidth===sizing.cityWidth&&next.cityHeight===sizing.cityHeight)return;
    renderer.setPixelRatio(next.ratio);renderer.setSize(width,height,false);
    renderer.getDrawingBufferSize(drawingBufferSize);
    roomCache.setSize(drawingBufferSize.x,drawingBufferSize.y);
    cityLightPass.setSize(next.cityWidth,next.cityHeight);
    sizing=next;invalidate(true);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width; height = rect.height;
    resizeRenderTargets();
    camera.aspect = width / height;
    if (mode === 'binder') {
      desired.position.set(0, width < 768 ? 6.2 : 3.7, width < 768 ? 7.25 : 6.1);
      desired.pitch = width < 768 ? .704 : .36;
      desired.fov = width < 768 ? 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(39 / 2)) / camera.aspect) * 180 / Math.PI : 49;
    } else if (mode === 'held') {
      const portrait = camera.aspect < 1;
      desired.position.set(0, portrait ? 3.95 : 3.65, portrait ? 8.6 : 6.3);
      desired.pitch = portrait ? .30 : .37;
      const horizontalFov = portrait ? 48 : 70;
      const base = Math.max(47, 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(horizontalFov / 2)) / camera.aspect) * 180 / Math.PI);
      desired.fov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base / 2)) * (portrait ? 1.04 : height / Math.max(380, height - 90))) * 180 / Math.PI;
    }
    if (reducedMotion) { actual.position.copy(desired.position); actual.fov = desired.fov; }
    camera.updateProjectionMatrix(); dirtyLayout = true;
    television.resize(width,height);
    invalidate(true);
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();
  actual.position.copy(desired.position); actual.fov = desired.fov;
  camera.position.copy(actual.position);
  camera.fov = actual.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(0, actual.position.y - Math.sin(actual.pitch), actual.position.z - Math.cos(actual.pitch));
  await Promise.race([textures.ready(), new Promise(resolve => setTimeout(resolve, 7000))]);
  const uploadTextures = new Set(Object.values(assets));
  for (const layer of [scene, cityScene]) {
    layer.traverse(object => {
      for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) {
        for (const value of Object.values(material)) if (value?.isTexture) uploadTextures.add(value);
      }
    });
  }
  let uploadSliceStarted=performance.now();
  for (const texture of uploadTextures) {
    renderer.initTexture(texture);
    if(performance.now()-uploadSliceStarted>=6){await yieldToBrowser();uploadSliceStarted=performance.now();}
  }
  onProgress?.('Finishing the lighting...');
  await roomCache.prepare(renderer, scene, camera);
  await renderer.compileAsync(steamScene,camera);
  await cityLightPass.prepare(renderer,cityScene,camera);

  function project(point) {
    screenVector.copy(point).project(camera);
    return { x: (screenVector.x * .5 + .5) * width, y: (-screenVector.y * .5 + .5) * height, z: screenVector.z };
  }

  function updateLayout() {
    scene.updateMatrixWorld(true);
    const slots = binder.turn ? [] : binder.pockets.map(pocket => {
      const projected = corners.map(corner => project(pocket.cell.localToWorld(corner.clone().setY(.035))));
      return { index: pocket.index, corners: projected };
    });
    const piles = Object.entries(PILE_POSITIONS).map(([pile, position]) => ({
      pile, ...project(new THREE.Vector3(position[0], position[1] + .07, position[2] + .56)),
    }));
    onLayout({ slots, piles, turning: Boolean(binder.turn), mode });
    dirtyLayout = false;
  }

  function loop(now) {
    if (disposed) return;
    const delta = Math.min((now - lastTime) / 1000, .05); lastTime = now;
    const factor = reducedMotion ? 1 : 1 - Math.exp(-delta * 11);
    const distance = Math.abs(actual.yaw - desired.yaw) + Math.abs(actual.pitch - desired.pitch) + Math.abs(actual.fov - desired.fov) + actual.position.distanceTo(desired.position);
    const cameraMoving=distance>.00005;
    if (cameraMoving) {
      actual.yaw = THREE.MathUtils.lerp(actual.yaw, desired.yaw, factor);
      actual.pitch = THREE.MathUtils.lerp(actual.pitch, desired.pitch, factor);
      actual.fov = THREE.MathUtils.lerp(actual.fov, desired.fov, factor);
      actual.position.lerp(desired.position, factor);
      dirtyLayout = true;
      invalidate(true);
    }
    camera.position.copy(actual.position); camera.fov = actual.fov; camera.updateProjectionMatrix();
    camera.lookAt(actual.position.x + Math.sin(actual.yaw) * Math.cos(actual.pitch), actual.position.y - Math.sin(actual.pitch), actual.position.z - Math.cos(actual.yaw) * Math.cos(actual.pitch));
    admiration.update(camera);
    const wasTurning=Boolean(binder.turn);
    const turnResult = binder.update(now);
    if (turnResult) onTurn(turnResult);
    if (binder.updatePose(delta, reducedMotion)) {
      dirtyLayout = true; roomShadowsDirty = true;
      apartment.binderShadow.material.opacity = .65 * (1 - binder.lift);
    }
    if (binder.turn||wasTurning) { dirtyLayout = true; roomShadowsDirty = true; }
    if(document.hidden){
      frame=requestAnimationFrame(loop);
      return;
    }
    const moving=atmosphere.running&&!modalOccluded;
    const environmentDue = !modalOccluded && skyline.needsEnvironmentUpdate(now);
    // A probe and its pending sun shadows must share one refresh deadline.
    const shadowDue = cityShadowsDirty && environmentDue;
    if(!moving&&!renderDirty&&!dirtyLayout&&!environmentDue&&!shadowDue&&!roomShadowsDirty){
      frame=requestAnimationFrame(loop);
      return;
    }
    const refreshCity=moving||cityDirty||shadowDue||environmentDue;
    if(refreshCity)atmosphere.update(modalOccluded?0:delta,camera.position);
    coffeeSteam.update(atmosphere.time,height*renderer.getPixelRatio());
    renderer.shadowMap.needsUpdate = shadowDue;
    if(refreshCity)skyline.updateView(camera,now,false,environmentDue);
    renderer.info.reset();
    // Separate light lists, shared camera and depth buffer: the room still occludes the city.
    cityLightPass.render(renderer,cityScene,camera,skyline.uniforms.cityNight.value,refreshCity,mode === 'city' ? null : cityOccluders);
    if(shadowDue)cityShadowsDirty = false;
    renderer.shadowMap.needsUpdate = roomShadowsDirty;
    roomCache.render(renderer,scene,camera,roomDirty||dirtyLayout||roomShadowsDirty,apartment.glazing);
    renderer.shadowMap.needsUpdate = false;
    renderer.render(steamScene,camera);
    television.update(camera,renderDirty||dirtyLayout||wasTurning);
    roomShadowsDirty = false;
    renderedFrames++;if(refreshCity||!cityLightPass.enabled)cityFrames++;
    renderDirty=cityDirty=roomDirty=false;
    if (dirtyLayout) updateLayout();
    frame = requestAnimationFrame(loop);
  }
  frame = requestAnimationFrame(loop);
  const onContextLost = event => { event.preventDefault(); cancelAnimationFrame(frame); onError('The graphics context was lost. Your collection is safe; use Pocket view or reload the room.', true); };
  canvas.addEventListener('webglcontextlost', onContextLost);
  const onVisibility=()=>{if(!document.hidden)invalidate(true);};
  document.addEventListener('visibilitychange',onVisibility);

  return {
    sync(state, ids = handIds, selectedId = activeHandId) {
      currentState = state; handIds = [...ids]; handSet = new Set(ids);
      activeHandId = selectedFromHand(ids, selectedId);
      if(admiration.id&&!ids.includes(admiration.id))admiration.hide();
      binder.setHand(ids, activeHandId); binder.sync(state); syncPiles();
      roomShadowsDirty = true; dirtyLayout = true;
    },
    setHand(ids, selectedId = activeHandId) {
      handIds = [...ids]; handSet = new Set(ids);
      activeHandId = selectedFromHand(ids, selectedId);
      if(admiration.id&&!ids.includes(admiration.id))admiration.hide();
      binder.setHand(ids, activeHandId); syncPiles(); dirtyLayout = true;
      roomShadowsDirty = true;
    },
    setWeather(weather) { atmosphere.setWeather(weather); cityShadowsDirty = true;invalidate(true,false); },
    setCityNight(value) { skyline.setNight(value); updateWindowDaylight();cityShadowsDirty = true;invalidate(true); },
    setCityTime(value) { skyline.setTime(value); updateWindowDaylight();cityShadowsDirty = true;invalidate(true); },
    setCityClouds(value) { skyline.setClouds(value);invalidate(true,false); },
    setCloudSpeed(value) { skyline.setCloudSpeed(value);invalidate(true,false); },
    setTrafficDensity(value) { atmosphere.setTrafficDensity(value);invalidate(true,false); },
    setCityWindows(value) { skyline.setWindows(value);invalidate(true,false); },
    setCityTower(value) { skyline.setTower(value);invalidate(true,false); },
    setMotion(running) { atmosphere.setMotion(running);invalidate(true,false); },
    setReducedMotion(value) { reducedMotion = value;invalidate(true); },
    setGraphicsQuality(value){
      if(!Object.hasOwn(GRAPHICS_PRESETS,value))throw new RangeError('Unknown graphics setting.');
      graphicsQuality=value;resizeRenderTargets();invalidate(true);
    },
    setModalOccluded(value) { if (modalOccluded !== value) { modalOccluded = value; invalidate(true,false); } },
    pick(x, y, dropping = false) {
      if (binder.turn) return null;
      const rect = canvas.getBoundingClientRect();
      pointer.set((x - rect.left) / rect.width * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const targets = dropping ? binder.targets.filter(target => target.userData.kind === 'slot') : binder.targets;
      return raycaster.intersectObjects([...targets, ...pileTargets], false)[0]?.object.userData || null;
    },
    highlight(index) { binder.highlight(index);invalidate(); },
    admire(id){return admiration.show(id);},
    stopAdmiring(){admiration.hide();},
    rotateAdmired(dx,dy){admiration.rotate(dx,dy);},
    flipAdmired(){admiration.flip();},
    resetAdmired(){admiration.reset();},
    get admiredCard(){return admiration.id;},
    dragLook(dx, dy) {
      const delta = lookDelta(dx, dy);
      desired.yaw = THREE.MathUtils.clamp(desired.yaw + delta.yaw, -1.15, 1.15);
      desired.pitch = THREE.MathUtils.clamp(desired.pitch + delta.pitch, -.13, 1.23);
    },
    zoom(delta) {
      desired.fov = THREE.MathUtils.clamp(desired.fov + delta * .018, width < 768 ? 48 : 28, mode === 'held' ? 110 : width < 768 ? 105 : 60);
    },
    view(next) {
      mode = next; desired.yaw = 0;
      binder.setLifted(next === 'held');
      if (next === 'city') { desired.pitch = .17; desired.position.set(...BALCONY_CAMERA); desired.fov = width < 768 ? 78 : 53; }
      else if (next === 'room') { desired.pitch = .24; desired.position.set(0, 3.05, 5.9); desired.fov = width < 768 ? 85 : 58; }
      else resize();
      dirtyLayout = true;
      invalidate(true);
    },
    lighting(warm) {
      warmRoom = warm;
      cyan.color.setHex(warm ? 0xdcb37d : 0x619eb8);
      pink.color.setHex(warm ? 0xe0a885 : 0xcc83b0);
      cyan.intensity = warm ? 10 : 12; pink.intensity = warm ? 7 : 8;
      windowLight.color.setHex(warm ? 0xb1c1c4 : 0x97b7d2);
      apartment.lampLight.intensity = warm ? 15 : 9;
      apartment.floorPaper.emissiveIntensity = warm ? .29 : .2;
      apartment.decor.setWarm(warm);
      apartment.nooks.setWarm(warm);
      renderer.toneMappingExposure = warm ? 1.24 : 1.13;
      updateWindowDaylight();
      invalidate();
    },
    televisionView(){mode='room';desired.position.set(0,3.05,5.9);desired.yaw=.9;desired.pitch=.08;desired.fov=54;binder.setLifted(false);invalidate(true);dirtyLayout=true;},
    startTurn(direction, drag = false) {
      if (!binder.beginTurn(direction)) return false;
      dirtyLayout = true;
      if (!drag) binder.settleTurn(true, performance.now(), reducedMotion);
      return true;
    },
    turnProgress(progress) { binder.setTurnProgress(progress); dirtyLayout = true; },
    finishTurn(complete) { binder.settleTurn(complete, performance.now(), reducedMotion); },
    get turning() { return Boolean(binder.turn); },
    info() { return { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, view: mode,renderedFrames,cityFrames,
      cameraPosition:camera.position.toArray(),admiredCard:admiration.id,admiredRotation:admiration.card.quaternion.toArray(),
      environmentCaptures:skyline.root.userData.environmentCaptures,roomCaptures:roomCache.captures,graphicsQuality,renderSize:[sizing.width,sizing.height],cityRenderSize:[sizing.cityWidth,sizing.cityHeight],modalOccluded }; },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); resizeObserver.disconnect(); canvas.removeEventListener('webglcontextlost', onContextLost);
      document.removeEventListener('visibilitychange',onVisibility);
      television.dispose();
      admiration.dispose();
      depthOnly.dispose();
      cleanPiles(); binder.dispose(); textures.dispose();
      const materials = new Set(), geometries = new Set(), maps = new Set();
      for (const layer of [scene, cityScene, steamScene]) {
        layer.traverse(object => {
          if (object.geometry) geometries.add(object.geometry);
          object.shadow?.dispose();
          for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) {
            materials.add(material);
            for (const value of Object.values(material)) if (value?.isTexture) maps.add(value);
          }
        });
      }
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
      Object.values(assets).forEach(texture => maps.add(texture));
      maps.forEach(texture => { texture.dispose(); texture.image?.close?.(); });
      skyline.dispose(); cityLightPass.dispose(); roomCache.dispose(); environment.dispose(); renderer.dispose();
    },
  };
}
