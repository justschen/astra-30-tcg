import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

export async function checkRoomNooks(browser, origin) {
  const bundle = await build({
    stdin: { resolveDir: fileURLToPath(new URL('../../', import.meta.url)), contents: `
      import * as THREE from 'three';
      import {createInteriorShell,createRoomNooks,interiorWallMaterial,ROOM_INTERIOR} from './binder/src/room-nooks.js';
      import {createHouseplants,loadRoomPlants,HOUSEPLANTS} from './binder/src/room-plants.js';
      import {loadRoomAssets} from './binder/src/materials.js';
      const scene=new THREE.Scene(),assets=await loadRoomAssets(),warnings=[];
      const plants=await loadRoomPlants(message=>warnings.push(message)),wall=interiorWallMaterial(assets);
      const shell=createInteriorShell(scene,wall),nooks=createRoomNooks(scene,assets,wall),foliage=createHouseplants(scene,plants);
      scene.updateMatrixWorld(true);
      const names=['Walnut library and collector shelf','Moss reading chair','Original pocket-game keepsake','Open walnut door','Gaming desk with cable tray','Desktop PC with illuminated cooling fans','Console shelf and physical game library','Continue neon wall sign'];
      const bounds=name=>{const box=new THREE.Box3().setFromObject(scene.getObjectByName(name));return {min:box.min.toArray(),max:box.max.toArray()}};
      const ray=new THREE.Raycaster(),eye=new THREE.Vector3(0,3.05,5.9);
      const target=scene.getObjectByName('Gaming monitor: orbital night race').getWorldPosition(new THREE.Vector3());
      const view=()=>{ray.set(eye,target.clone().sub(eye).normalize());return ray.intersectObject(scene,true)[0]};
      const open=view(),door=scene.getObjectByName('Open walnut door'),angle=door.rotation.y;
      door.rotation.y=0;scene.updateMatrixWorld(true);const closed=view();door.rotation.y=angle;scene.updateMatrixWorld(true);
      ray.set(new THREE.Vector3(0,ROOM_INTERIOR.floor+ROOM_INTERIOR.entryHeight+.7,ROOM_INTERIOR.entryZ),new THREE.Vector3(1,0,0));
      const lintel=ray.intersectObject(scene,true)[0];
      const materials=new Set(),geometries=new Set(),textures=new Set(),lights=[];
      let draws=0,triangles=0;
      scene.traverse(object=>{
        if(object.isLight)lights.push(object);
        if(object.isMesh){
          draws++;geometries.add(object.geometry);materials.add(object.material);
          triangles+=(object.geometry.index?.count||object.geometry.attributes.position.count)/3*(object.isInstancedMesh?object.count:1);
          for(const value of Object.values(object.material))if(value?.isTexture)textures.add(value);
        }
      });
      nooks.setWarm(false);const cool=lights.map(light=>light.intensity);nooks.setWarm(true);
      const leafMaterials=[...materials].filter(material=>material.name.endsWith('_leaves'));
      window.nookChecks={
        named:names.map(name=>Boolean(scene.getObjectByName(name))),details:nooks.root.userData,
        door:bounds('Full-size hinged door leaf'),chair:bounds('Moss reading chair'),
        open:{name:open.object.name,distance:open.distance,x:open.point.x},
        closed:{name:closed.object.name,distance:closed.distance},
        lintel:lintel.object.name,doorAngle:angle,occluders:shell.children.every(mesh=>mesh.userData.cityOccluder),
        draws,triangles,materials:materials.size,plantCount:foliage.userData.plantCount,
        plants:HOUSEPLANTS.map(spec=>{const size=new THREE.Box3().setFromObject(scene.getObjectByName('Houseplant '+spec.id));return {height:size.max.y-size.min.y,wanted:spec.height,floor:size.min.y,wantedFloor:spec.position[1]}}),
        leafMasks:leafMaterials.length===2&&leafMaterials.every(material=>material.alphaTest>0&&material.alphaToCoverage&&!material.transparent&&material.map.image.width>=1024&&material.normalMap&&material.roughnessMap),
        warmLights:lights.every((light,index)=>light.intensity>cool[index]),shadowLights:lights.filter(light=>light.castShadow).length,warnings,
      };
      scene.traverse(object=>{if(object.isInstancedMesh)object.dispose()});
      materials.forEach(material=>material.dispose());geometries.forEach(geometry=>geometry.dispose());
      Object.values(assets).forEach(texture=>textures.add(texture));textures.forEach(texture=>{texture.dispose();texture.image?.close?.()});
      window.checkPlantFailure=async()=>{
        const warnings=[],library=await loadRoomPlants(message=>warnings.push(message));
        const scene=new THREE.Scene(),root=createHouseplants(scene,library);
        const result={warnings,failed:library.failed,models:[...library.templates.keys()],placed:root.userData.plantCount};
        library.dispose();
        root.traverse(object=>{if(object.isMesh&&!object.material.name){object.geometry.dispose();object.material.map?.dispose();object.material.dispose()}});
        return result;
      };
    ` },
    bundle: true, write: false, format: 'esm', target: 'es2022', logLevel: 'silent',
  });
  const context = await browser.newContext(), page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const url = `${origin}/__room_nook_geometry__`;
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Room geometry checks</title>' }));
  try {
    await page.goto(url); await page.addScriptTag({ type: 'module', content: bundle.outputFiles[0].text });
    await page.waitForFunction(() => window.nookChecks, null, { timeout: 60000 });
    const data = await page.evaluate(() => window.nookChecks);
    assert.ok(data.named.every(Boolean), 'The doorway must reveal actual computer, console, game and neon fixtures');
    assert.ok(data.details.entryHeight / data.details.entryWidth > 2 && data.details.entryHeight > 5.5, 'The door must have full human-height proportions, not the previous miniature scale');
    assert.ok(data.doorAngle > Math.PI / 2, 'The real hinged door must be fully open into the hallway');
    assert.equal(data.open.name, 'Gaming monitor: orbital night race');
    assert.ok(data.open.x > 14.9 && data.open.distance > data.closed.distance + 2, 'The opening must reveal actual depth beyond the apartment wall');
    assert.equal(data.closed.name, 'Full-size hinged door leaf', 'Closing the same geometry must occlude the hallway rather than leave a painted portal');
    assert.equal(data.lintel, 'Doorway lintel wall', 'Hall ceiling must not protrude through the apartment lintel as a floating strip');
    assert.equal(data.occluders, true, 'The depth prepass must use the same split shell, not a wall covering the opening');
    assert.ok(data.chair.max[0] < -5.8 && data.chair.min[0] > -8.8, 'Reading furniture must leave the narrowed table and circulation clear');
    assert.equal(data.plantCount, 4); assert.equal(data.leafMasks, true); assert.deepEqual(data.warnings, []);
    assert.ok(data.plants.every(plant => Math.abs(plant.height - plant.wanted) < .012 && Math.abs(plant.floor - plant.wantedFloor) < .012), 'Real plant models must sit on their supporting surfaces at their intended size');
    assert.equal(data.details.gaming.monitors,2);assert.equal(data.details.gaming.consoles,1);assert.equal(data.details.gaming.gameCases,9);
    assert.equal(data.details.gaming.animatedTextures,false,'Decorative displays must not redraw high-resolution canvas textures every frame');
    assert.ok(data.draws < 145 && data.materials < 40 && data.triangles < 275000, `Detailed plants and gaming fixtures exceed the rendering budget: ${data.draws} draws, ${data.materials} materials, ${data.triangles} triangles`);
    assert.equal(data.shadowLights, 0); assert.equal(data.warmLights, true); assert.deepEqual(errors, []);
    await page.route('**/room/plants/potted_plant_02.glb.gz', route => route.fulfill({ status: 503, body: 'Unavailable plant fixture' }));
    const degraded = await page.evaluate(() => window.checkPlantFailure());
    assert.deepEqual(degraded.failed, ['potted_plant_02']); assert.deepEqual(degraded.models, ['potted_plant_01']);
    assert.equal(degraded.placed, 1); assert.equal(degraded.warnings.length, 1);
    assert.ok(degraded.warnings[0].includes('remain usable'), 'Missing optional plant models must report a warning without disabling the room');
    console.log('PASS: the open door reveals real computers, console games and neon; plant placement, shared resources and bounded rendering cost remain verified');
  } finally { await context.close(); }
}
