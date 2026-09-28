import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import sharp from 'sharp';

async function difference(a, b) {
  const first = await sharp(a).removeAlpha().raw().toBuffer(), second = await sharp(b).removeAlpha().raw().toBuffer();
  assert.equal(first.length, second.length);
  let changed = 0;
  for (let i = 0; i < first.length; i += 3) {
    if (Math.abs(first[i] - second[i]) + Math.abs(first[i + 1] - second[i + 1]) + Math.abs(first[i + 2] - second[i + 2]) > 12) changed++;
  }
  return changed;
}

export async function checkCityGeometry(browser, origin, shots) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const result = await build({
    stdin: {
      resolveDir: root,
      contents: `
        import * as THREE from 'three';
        import { createSkyline } from './binder/src/skyline.js';
        import { CityAtmosphere } from './binder/src/city-motion.js';
        import { CityLightPass } from './binder/src/city-light-pass.js';
        import { loadRoomAssets } from './binder/src/materials.js';
        import { makeFacadeMaterial } from './binder/src/city-materials.js';
        import { createArchitectureMaterial } from './binder/src/city-architecture.js';
        import { cityWindowTexture } from './binder/src/city-materials.js';
        import { RoadSurfaceIndex } from './binder/src/city-roads.js';
        import { TOWER_MODEL } from './binder/src/tokyo-tower.js';
        import { CITY_GROUND, CITY_FAR, TOWER } from './binder/src/city-layout.js';
        const renderer = new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true,preserveDrawingBuffer:true});
        renderer.setSize(1440,900);renderer.setPixelRatio(1);
        renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
        renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
        renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
        renderer.autoClear=false;
        const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x253d53,.001);
        const assets=await loadRoomAssets();
        const city=await createSkyline(scene,assets);const atmosphere=new CityAtmosphere(scene,city,false);city.prepare(renderer);
        const optics=new CityLightPass(renderer);optics.setSize(1440,900);
        const camera=new THREE.PerspectiveCamera(43,1440/900,.1,CITY_FAR);
        const setCamera=x=>{camera.position.set(x,3.05,5.9);camera.lookAt(x,-7.3,-68);camera.updateMatrixWorld(true)};
        setCamera(0);await renderer.compileAsync(scene,camera);city.updateView(camera);optics.render(renderer,scene,camera,city.uniforms.cityNight.value);
        const project=p=>new THREE.Vector3(...p).project(camera).toArray();
        const geometryStats=()=>{
          const volumes=[];let triangles=0,imageMaps=0,panoramaMaps=0,shadowCasters=0,surveyed=0,frames=0,roofUnits=0,references=0;
          const closeMaps=[];
          scene.traverse(object=>{
            if(object.userData.cityVolumes)volumes.push(object.count);
            if(object.isMesh&&object.userData.surveyedBuildings)surveyed+=object.userData.surveyedBuildings;
            if(object.isMesh&&object.userData.referenceBuilding)references++;
            frames+=object.userData.architecturalWindows||0;roofUnits+=object.userData.roofUnits||0;
            if(object.geometry)triangles+=(object.geometry.index?object.geometry.index.count:object.geometry.attributes.position.count)/3*(object.isInstancedMesh?object.count:1);
            if(object.castShadow)shadowCasters++;
            for(const material of object.material?(Array.isArray(object.material)?object.material:[object.material]):[]){
              if(material.userData.architecturalFacade)closeMaps.push({url:material.map.image.src,width:material.map.image.width});
              for(const value of Object.values(material))if(value?.isTexture&&value.image instanceof HTMLImageElement){imageMaps++;if(value.image.src.includes('tokyo-night'))panoramaMaps++;}
            }
          });
          return {buildings:city.specs.length,volumes:volumes.reduce((a,b)=>a+b,0)+surveyed+references,surveyed,references,foreground:city.specs.filter(spec=>spec.authoredPlacement).length,frames,roofUnits,closeMaps,triangles,imageMaps,panoramaMaps,shadowCasters,outdoorEnvironment:city.root.userData.outdoorEnvironment,cars:atmosphere.carCount,parked:atmosphere.parkedCount,infill:city.root.userData.infillBuildings,courts:city.neighborhood.userData.serviceCourts,roads:city.roads.length,shops:city.streetscape.userData.shopCount,sakura:city.streetscape.userData.sakuraCount,walkers:city.streetscape.userData.pedestrianCount,sideParks:city.sideParks.userData.sideParkCount,store:city.streetscape.userData.convenienceStore};
        };
        window.cityHarness={
          stats:geometryStats,
          cachedReflectionLighting(){
            const previous=camera.position.clone();
            city.setTime(22);atmosphere.setWeather('rain');city.setClock(0);
            const light=city.neon.children.find(object=>object.isPointLight);
            camera.position.copy(light.position);camera.position.z+=.5;
            city.updateView(camera,performance.now(),true);
            const texture=city.uniforms.cityReflections.value,first=Array.from(texture.image.data),version=texture.version;
            for(let i=0;i<8;i++)city.updateView(camera);
            const stable=texture.version===version&&first.every((value,i)=>value===texture.image.data[i]);
            city.setClock(11);city.updateView(camera);
            const recolored=first.some((value,i)=>i>=32*2*4&&value!==texture.image.data[i]);
            const beforeMove=Array.from(texture.image.data);camera.position.x+=2;city.updateView(camera);
            const moved=beforeMove.some((value,i)=>i<32*2*4&&value!==texture.image.data[i]);
            const count=city.uniforms.cityReflectionCount.value;
            camera.position.copy(previous);
            return {stable,recolored,moved,count};
          },
          steppedFacadeGaps(){
            scene.updateMatrixWorld(true);
            const trim=city.root.children.filter(object=>object.isInstancedMesh&&object.name.startsWith('City box details'));
            const ray=new THREE.Raycaster(),failures=[];let checked=0;
            for(const spec of city.specs.filter(spec=>spec.hero&&spec.stepped&&!spec.surveyed&&spec.z>-165)){
              const normal=new THREE.Vector3(Math.sin(spec.yaw),0,Math.cos(spec.yaw));
              for(const sign of [-1,1]){
                const x=sign*spec.width/2,z=spec.depth/2+.055;
                const point=new THREE.Vector3(spec.x+x*Math.cos(spec.yaw)+z*Math.sin(spec.yaw),CITY_GROUND+spec.height*.9,spec.z-x*Math.sin(spec.yaw)+z*Math.cos(spec.yaw));
                ray.set(point.clone().addScaledVector(normal,.4),normal.clone().negate());ray.far=.48;checked++;
                if(ray.intersectObjects(trim,false).length)failures.push(spec.id);
              }
            }
            return {checked,failures};
          },
          towerProportions(){
            const base=project([TOWER.x,CITY_GROUND,TOWER.z])[1],tip=project([TOWER.x,CITY_GROUND+TOWER.height,TOWER.z])[1];
            const oldTip=project([TOWER.x,CITY_GROUND+95,TOWER.z])[1];
            const main=project([TOWER.x,CITY_GROUND+TOWER.height*TOWER_MODEL.mainDeck/TOWER_MODEL.height,TOWER.z])[1];
            return {relativeHeight:Math.abs((tip-base)/(oldTip-base)),mainDeck:Math.abs((main-base)/(tip-base)),scale:city.tower.scale.y};
          },
          render({night=.65,windows=true,tower=true,weather='clear',x=0,time=0}={}){
            city.setNight(night);city.setWindows(windows);city.setTower(tower);atmosphere.setWeather(weather);
            atmosphere.time=time;atmosphere.paint();setCamera(x);renderer.shadowMap.needsUpdate=true;city.updateView(camera,performance.now(),true);optics.render(renderer,scene,camera,city.uniforms.cityNight.value);
            const front=city.specs.find(s=>s.id==='front-left-cream-office');
            return {near:project([front.x,CITY_GROUND+front.height,front.z]),far:project([TOWER.x,CITY_GROUND+TOWER.height,TOWER.z])};
          },
          roofRay(){
            scene.updateMatrixWorld(true);
            const building=city.specs.find(s=>s.id==='front-left-cream-office');
            const bodies=[];city.root.traverse(o=>{if(o.isMesh&&o.userData.surveyedBuildings)bodies.push(o)});
            const hits=[];
            for(const [x,z]of [[0,0],[-.28,-.28],[.28,-.28],[-.28,.28],[.28,.28]]){
              const ray=new THREE.Raycaster(new THREE.Vector3(building.x+x*building.width,CITY_GROUND+building.height+20,building.z+z*building.depth),new THREE.Vector3(0,-1,0));
              const hit=ray.intersectObjects(bodies,false)[0];if(hit)hits.push(hit.point.y);
            }
            return {height:Math.max(...hits),minimum:CITY_GROUND+building.height*.65,maximum:CITY_GROUND+building.height+.002};
          },
          traffic(){
            const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();
            const samples=[];
            for(let i=0;i<atmosphere.carCount;i++){atmosphere.cars.getMatrixAt(i,matrix);matrix.decompose(position,quaternion,scale);samples.push({y:position.y,up:new THREE.Vector3(0,1,0).applyQuaternion(quaternion).toArray()})}
            return samples;
          },
          trafficBehavior(){
            for(let i=0;i<240;i++)atmosphere.update(.05);
            const agents=atmosphere.traffic.agents.slice(0,atmosphere.traffic.count);
            const braking=agents.filter(agent=>agent.braking);
            const colors=atmosphere.trafficLights.geometry.attributes.color;
            const brightBrakes=braking.filter(agent=>colors.getX(agent.index*4+2)>1.5).length;
            return {moving:agents.filter(agent=>agent.speed>.1).length,braking:braking.length,brightBrakes};
          },
          population(){
            const indices=new RoadSurfaceIndex(city.roads);
            const people=city.streetscape.getObjectByName('People walking along the shopping streets');
            const matrix=new THREE.Matrix4(),point=new THREE.Vector3();
            city.setClock(40);city.updateView(camera);
            let near=0,clear=0;
            for(let i=0;i<people.count;i++){
              people.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);
              if(Math.abs(point.x)<120&&point.z> -190)near++;
              if(indices.clearance(point.x,point.z)>.18)clear++;
            }
            const nearCars=atmosphere.traffic.agents.slice(0,atmosphere.carCount).filter(agent=>Math.abs(agent.pose.point.x)<160&&agent.pose.point.z> -190&&agent.pose.point.z< -12).length;
            atmosphere.setTrafficDensity(1);const maximum=atmosphere.carCount;
            atmosphere.setTrafficDensity(.75);
            return {people:people.count,near,clear,nearCars,maximum};
          },
          immersionDetails(time){
            city.setTime(22);city.setClouds(.1);atmosphere.setWeather('rain');atmosphere.time=time;atmosphere.paint();city.updateView(camera);
            const signals=city.root.getObjectByName('Visible red amber green traffic signals').geometry.attributes.color;
            const beacons=atmosphere.beacons.geometry.attributes.color;
            const screens=city.neon.children.filter(object=>object.isPointLight);
            return {storm:city.uniforms.cityStorm.value,clouds:city.uniforms.cityClouds.value,air:city.uniforms.cityAirDensity.value,
              rain:atmosphere.rain.userData.rainCount,rainDepth:atmosphere.rain.userData.depthRange,
              kinds:[...new Set(atmosphere.traffic.agents.slice(0,atmosphere.carCount).map(agent=>agent.kind))],
              trucks:atmosphere.cargo.count,riders:atmosphere.riders.count,taxis:atmosphere.taxiSigns.count,
              signalRGB:Array.from(signals.array.slice(0,9)),beaconRGB:Array.from(beacons.array.slice(-3)),
              headlights:Array.from(atmosphere.trafficLights.geometry.attributes.color.array.slice(0,12)),
              screenColors:screens.map(light=>light.color.toArray()),screenPower:screens.map(light=>light.intensity),
              district:city.neon.userData};
          },
          clearWeather(){atmosphere.setWeather('clear');return {clouds:city.uniforms.cityClouds.value,storm:city.uniforms.cityStorm.value};},
          towerPortrait(){
            city.setTime(22);city.setTower(true);
            camera.position.set(37,30,-214);camera.lookAt(37,22,-344);camera.fov=44;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
            renderer.shadowMap.needsUpdate=true;city.updateView(camera);optics.render(renderer,scene,camera,city.uniforms.cityNight.value);
          },
          opticalDepth(){
            const background=new THREE.Scene(),foreground=new THREE.Scene();
            const testCamera=new THREE.PerspectiveCamera(50,1440/900,.1,50);
            const geometry=new THREE.BoxGeometry(4,4,1);
            const back=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xff0000,toneMapped:false}));
            back.position.z=-5;background.add(back);
            const front=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0x00ff00,toneMapped:false}));
            front.position.z=-8;foreground.add(front);
            const gl=renderer.getContext(),read=()=>{const p=new Uint8Array(4);gl.readPixels(720,450,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return Array.from(p)};
            optics.render(renderer,background,testCamera,0);renderer.render(foreground,testCamera);const behind=read();
            front.position.z=-2;renderer.render(foreground,testCamera);const nearer=read();
            geometry.dispose();back.material.dispose();front.material.dispose();
            return {behind,nearer};
          },
          screenSelfLighting(){
            city.setNight(1);city.setClock(0);
            const display=city.neon.getObjectByName('Animated street display 1');
            const {width,height}=display.geometry.parameters;
            const probe=new THREE.Scene(),view=new THREE.OrthographicCamera(-width/2,width/2,height/2,-height/2,.1,10);
            view.position.z=3;
            const light=new THREE.PointLight(0xffddaa,0,24,2);light.position.z=1.7;
            probe.add(new THREE.Mesh(display.geometry,display.material),light);
            const target=new THREE.WebGLRenderTarget(256,144),previous=renderer.getRenderTarget();
            const read=()=>{
              renderer.setRenderTarget(target);renderer.clear();renderer.render(probe,view);
              const pixels=new Uint8Array(256*144*4);renderer.readRenderTargetPixels(target,0,0,256,144,pixels);
              return pixels;
            };
            try{
              const dark=read();light.intensity=55;const lit=read();
              let changed=0,lowest=255,highest=0;
              for(let i=0;i<lit.length;i+=4){
                if(Math.abs(lit[i]-dark[i])+Math.abs(lit[i+1]-dark[i+1])+Math.abs(lit[i+2]-dark[i+2])>3)changed++;
                const brightness=(lit[i]+lit[i+1]+lit[i+2])/3;
                lowest=Math.min(lowest,brightness);highest=Math.max(highest,brightness);
              }
              return {changed,contrast:highest-lowest};
            }finally{renderer.setRenderTarget(previous);target.dispose();}
          },
          windowSample(time,subpixel=false,offset=0){
            const windowScene=new THREE.Scene();
            const view=subpixel?new THREE.OrthographicCamera(-4.5,4.5,4.5,-4.5,.1,50):new THREE.PerspectiveCamera(43,1440/900,.1,50);
            view.position.z=12;view.position.x=offset;
            const geometry=new THREE.BoxGeometry(1,1,1);
            geometry.setAttribute('citySize',new THREE.InstancedBufferAttribute(new Float32Array([8,8,2]),3));
            geometry.setAttribute('cityGrid',new THREE.InstancedBufferAttribute(new Float32Array([subpixel?2285:8,2,subpixel?128:8,42]),4));
            geometry.setAttribute('cityLight',new THREE.InstancedBufferAttribute(new Float32Array([.1,.7,1]),3));
            geometry.setAttribute('cityTiming',new THREE.InstancedBufferAttribute(new Float32Array([31,4.2]),2));
            city.uniforms.cityNight.value=1;city.uniforms.cityClock.value=time;city.uniforms.cityWindows.value=1;
            const material=makeFacadeMaterial('office',city.uniforms,assets),mesh=new THREE.InstancedMesh(geometry,material,1);
            mesh.setMatrixAt(0,new THREE.Matrix4().makeScale(8,8,2));windowScene.add(mesh);
            optics.render(renderer,windowScene,view,1);
            geometry.dispose();material.dispose();
          },
          architectureSample(){
            const probe=new THREE.Scene(),view=new THREE.OrthographicCamera(-4.8,4.8,4.8,-4.8,.1,50);
            view.position.set(0,CITY_GROUND+4,12);view.lookAt(0,CITY_GROUND+4,0);
            const pattern=cityWindowTexture('office');
            const material=createArchitectureMaterial({id:'sharpness-probe',x:0,z:0,width:8,depth:2,height:8,floors:10,style:'office',color:0xbdb6a4},city.uniforms,assets,pattern);
            const geometry=new THREE.BoxGeometry(8,8,2),mesh=new THREE.Mesh(geometry,material);
            mesh.position.y=CITY_GROUND+4;probe.add(mesh,new THREE.HemisphereLight(0xffffff,0x777777,1.5));
            const daylight=new THREE.DirectionalLight(0xffffff,3);
            daylight.position.set(2,CITY_GROUND+7,8);daylight.target.position.copy(mesh.position);probe.add(daylight,daylight.target);
            city.uniforms.cityNight.value=0;city.uniforms.cityWindows.value=0;
            optics.render(renderer,probe,view,0);
            const edge=new THREE.Vector3(.62*.17,CITY_GROUND+4.4,1).project(view);
            geometry.dispose();material.dispose();pattern.dispose();
            return {x:Math.round((edge.x*.5+.5)*1440),y:Math.round((.5-edge.y*.5)*900)};
          },
          closeup(hour){
            city.setTime(hour);city.setWindows(true);camera.fov=28;camera.updateProjectionMatrix();
            camera.position.set(0,2.5,-5.85);camera.lookAt(14,-16,-61);camera.updateMatrixWorld(true);
            renderer.shadowMap.needsUpdate=true;city.updateView(camera);optics.render(renderer,scene,camera,city.uniforms.cityNight.value);
          },
          probeShadows(){
            const geometry=new THREE.BoxGeometry(2,2,2),material=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(geometry,material);
            mesh.position.set(0,CITY_GROUND+7,-100);mesh.castShadow=true;let updates=0;mesh.onBeforeShadow=()=>{updates++};city.root.add(mesh);
            city.setTime(8.25);renderer.shadowMap.needsUpdate=true;city.updateView(camera,performance.now(),true);
            const captured=updates;
            optics.render(renderer,scene,camera,city.uniforms.cityNight.value);
            const rendered=updates;
            mesh.removeFromParent();geometry.dispose();material.dispose();
            return {captured,rendered,manual:!renderer.shadowMap.autoUpdate};
          },
          hazeTower(weather,tower){
            city.setTime(17.75);city.setTower(tower);atmosphere.setWeather(weather);
            camera.fov=43;camera.updateProjectionMatrix();setCamera(0);
            renderer.shadowMap.needsUpdate=true;city.updateView(camera,performance.now(),true);optics.render(renderer,scene,camera,city.uniforms.cityNight.value);
            const center=project([TOWER.x,CITY_GROUND+TOWER.height*.5,TOWER.z]);
            return {left:Math.round((center[0]*.5+.5)*1440)-65,top:Math.round((.5-center[1]*.5)*900)-170,width:130,height:340};
          },
          towerPaintSample(hour,weather){
            city.setTime(hour);city.setTower(true);atmosphere.setWeather(weather);
            const exposure=renderer.toneMappingExposure,previousCamera=camera.clone();
            renderer.toneMappingExposure=1.24;
            camera.fov=24;camera.updateProjectionMatrix();
            camera.position.set(TOWER.x,CITY_GROUND+TOWER.height*.52,TOWER.z+205);
            camera.lookAt(TOWER.x,CITY_GROUND+TOWER.height*.5,TOWER.z);camera.updateMatrixWorld(true);
            renderer.shadowMap.needsUpdate=true;city.updateView(camera,performance.now(),true);
            const hidden=[...scene.children.filter(object=>object!==city.root),...city.root.children.filter(object=>object!==city.tower&&!object.isLight)].map(object=>[object,object.visible]);
            hidden.forEach(([object])=>{object.visible=false});
            const maskScene=new THREE.Scene(),mask=city.tower.clone(true);
            const red=new THREE.MeshBasicMaterial({color:0xff0000,toneMapped:false});
            const white=new THREE.MeshBasicMaterial({color:0x00ff00,toneMapped:false});
            const other=new THREE.MeshBasicMaterial({color:0x0000ff,toneMapped:false});
            mask.traverse(object=>{if(object.isMesh)object.material=object.material.name==='Tokyo Tower vermilion paint'?red:object.material.name==='Tokyo Tower white paint'?white:other});
            maskScene.add(mask);
            const target=new THREE.WebGLRenderTarget(1440,900),pixels=new Uint8Array(1440*900*4),ids=new Uint8Array(pixels.length);
            try{
              optics.render(renderer,scene,camera,city.uniforms.cityNight.value);
              const gl=renderer.getContext();gl.readPixels(0,0,1440,900,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
              renderer.setRenderTarget(target);renderer.clear();renderer.render(maskScene,camera);
              renderer.readRenderTargetPixels(target,0,0,1440,900,ids);
              const samples={red:{count:0,redGreen:0,washed:0},white:{count:0,redGreen:0,washed:0}};
              let warmHalo=0;
              const blank=index=>ids[index]===0&&ids[index+1]===0&&ids[index+2]===0;
              for(let i=0;i<ids.length;i+=4){
                if(pixels[i]>28&&pixels[i]>pixels[i+2]+15&&blank(i)&&blank(i-4)&&blank(i+4)&&blank(i-1440*4)&&blank(i+1440*4))warmHalo++;
                const sample=ids[i]>250&&ids[i+1]<5?samples.red:ids[i+1]>250&&ids[i]<5?samples.white:null;
                if(!sample)continue;
                sample.count++;sample.redGreen+=pixels[i]-pixels[i+1];
                if(pixels[i]>235&&pixels[i+1]>210&&pixels[i+2]>155)sample.washed++;
              }
              for(const sample of Object.values(samples))if(sample.count){sample.redGreen/=sample.count;sample.washed/=sample.count}
              return {...samples,warmHalo};
            }finally{
              mask.traverse(object=>{if(object.isInstancedMesh)object.dispose()});
              renderer.setRenderTarget(null);target.dispose();red.dispose();white.dispose();other.dispose();
              hidden.forEach(([object,visible])=>{object.visible=visible});renderer.toneMappingExposure=exposure;
              camera.copy(previousCamera);camera.updateMatrixWorld(true);
            }
          },
          roadOverlapSample(id){
            const probe=new THREE.Scene();
            probe.add(new THREE.HemisphereLight(0xd0ddeb,0x48443d,1.1));
            const road=city.root.getObjectByName('Ground-level '+id);
            probe.add(new THREE.Mesh(road.geometry,road.material));
            const view=new THREE.OrthographicCamera(-.45,.45,.45,-.45,.15,50);
            view.position.set(8.7,CITY_GROUND+10,-52);view.up.set(0,0,-1);view.lookAt(8.7,CITY_GROUND,-52);
            city.uniforms.cityNight.value=0;city.uniforms.cityWetness.value=0;
            city.uniforms.cityHeadlightCount.value=0;city.uniforms.cityReflectionCount.value=0;
            optics.render(renderer,probe,view,0);
          },
          roadSurfaces(){
            scene.updateMatrixWorld(true);
            const surfaces=[];city.root.traverse(object=>{if(object.userData.cityRoad||object.userData.cityGroundSurface)surfaces.push(object)});
            const failures=[];const ray=new THREE.Raycaster();
            for(const road of city.roads)for(let i=0;i<=40;i++){
              const point=road.curve.getPointAt(i/40);
              ray.set(new THREE.Vector3(point.x,CITY_GROUND+2,point.z),new THREE.Vector3(0,-1,0));
              const hit=ray.intersectObjects(surfaces,false)[0];
              if(!hit?.object.userData.cityRoad)failures.push({road:road.id,at:i/40,hit:hit?.object.name});
            }
            return failures;
          }
        };
        window.cityHarnessReady=true;
      `,
    },
    bundle: true, format: 'esm', platform: 'browser', write: false, minify: true, target: 'es2022',
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const url = `${origin}/__city_geometry_check__`;
  await page.route(url, route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body style="margin:0"><canvas></canvas><script>addEventListener("error",e=>{window.cityHarnessError=e.message});addEventListener("unhandledrejection",e=>{window.cityHarnessError=String(e.reason)})</script></body></html>',
  }));
  try {
    await page.goto(url);
    await page.addScriptTag({ type: 'module', content: result.outputFiles[0].text });
    await page.waitForFunction(() => window.cityHarnessReady || window.cityHarnessError, null, { timeout: 120000 });
    assert.equal(await page.evaluate(()=>window.cityHarnessError),undefined,errors.join('\\n'));
    const stats = await page.evaluate(() => window.cityHarness.stats());
    assert.ok(stats.buildings >= 1200 && stats.volumes >= stats.buildings);
    assert.ok(stats.surveyed>=4000&&stats.foreground>=18,'Real survey meshes must replace both the background boxes and the key foreground buildings');
    assert.equal(stats.references,7,'The distinctive reference landmarks must have individually modeled silhouettes');
    const towerProportions=await page.evaluate(()=>window.cityHarness.towerProportions());
    assert.ok(towerProportions.relativeHeight>.72&&towerProportions.relativeHeight<.78,'The rendered tower must be visibly smaller, not just have a changed size label');
    assert.ok(towerProportions.mainDeck>.33&&towerProportions.mainDeck<.38,'The main deck must sit lower in the reference-matched silhouette');
    assert.equal(stats.outdoorEnvironment,true,'City surfaces must reflect the outdoor sky, not the apartment light probe');
    assert.ok(stats.frames>=5000&&stats.roofUnits>=20,'Close survey buildings must have actual window frames and fitted rooftop equipment');
    assert.equal(stats.closeMaps.length,27);
    assert.ok(stats.closeMaps.every(map=>map.width>=1024&&map.url.includes('/room/city-')),'Close facades must use high-resolution tiled PBR surfaces, not enlarged aerial atlases');
    const shadows=await page.evaluate(()=>window.cityHarness.probeShadows());
    assert.equal(shadows.manual,true);
    assert.equal(shadows.captured,1,'The updated sun shadow must be rendered before capturing the city reflection probe');
    assert.equal(shadows.rendered,1,'Reflection capture and the city view must reuse one updated shadow map');
    assert.ok(stats.triangles > 200_000, 'Detailed solids, trees, roofs and lattice must exist');
    assert.equal(stats.panoramaMaps, 0, 'The city must not use a photographic skyline or projection-mapped backdrop');
    assert.ok(stats.imageMaps > 0, 'Surface materials should use the licensed PBR scans');
    assert.ok(stats.shadowCasters > 5);
    assert.equal(stats.cars,576); assert.equal(stats.roads,9);
    assert.equal(stats.walkers,512);assert.equal(stats.sideParks,2);
    assert.ok(stats.infill>=400&&stats.courts>=20&&stats.parked>=60,'Previously empty plots must contain real infill buildings and populated service courts');
    const population=await page.evaluate(()=>window.cityHarness.population());
    assert.equal(population.maximum,768);
    assert.equal(population.clear,population.people);
    assert.ok(population.near>=250&&population.nearCars>=330,'Added people and traffic must populate the visible foreground and side streets');
    assert.equal(stats.store.name,'7-Eleven');
    const firstAtmosphere=await page.evaluate(()=>window.cityHarness.immersionDetails(0));
    const nextAtmosphere=await page.evaluate(()=>window.cityHarness.immersionDetails(30));
    assert.equal(firstAtmosphere.rain,3000);
    assert.ok(firstAtmosphere.rainDepth[0]<-400&&firstAtmosphere.rainDepth[1]>-9);
    assert.equal(firstAtmosphere.kinds.length,6);assert.ok(firstAtmosphere.trucks>35&&firstAtmosphere.riders>20&&firstAtmosphere.taxis>35);
    assert.ok(firstAtmosphere.clouds>=.94&&firstAtmosphere.storm===1&&firstAtmosphere.air>.003);
    assert.ok(firstAtmosphere.signalRGB[7]>firstAtmosphere.signalRGB[6]*2,'The real green signal bulb must illuminate in its green phase');
    assert.ok(nextAtmosphere.signalRGB[0]>nextAtmosphere.signalRGB[1]*20,'The real red signal bulb must replace green on the red phase');
    assert.ok(nextAtmosphere.beaconRGB[0]>nextAtmosphere.beaconRGB[1]*50,'Rooftop beacons must be red, not orange');
    assert.ok(firstAtmosphere.district.neonBuildings>=15&&firstAtmosphere.district.animatedScreens===2&&firstAtmosphere.district.cranes===2);
    assert.notDeepEqual(firstAtmosphere.screenColors,nextAtmosphere.screenColors);
    assert.ok(firstAtmosphere.screenPower.every(power=>power>20),'Animated screens must cast real colored light into the street');
    assert.deepEqual(await page.evaluate(()=>window.cityHarness.clearWeather()),{clouds:.1,storm:0},'Leaving rain must restore the saved manual cloud level');
    assert.deepEqual(await page.evaluate(()=>window.cityHarness.cachedReflectionLighting()),{stable:true,recolored:true,moved:true,count:32},'Cached wet-street lighting must skip unchanged uploads, preserve ad-color changes and rebuild for camera movement');
    const display=await page.evaluate(()=>window.cityHarness.screenSelfLighting());
    assert.equal(display.changed,0,'A display must not illuminate its own pixels with the point light intended for the street');
    assert.ok(display.contrast>70,'Display lettering must remain distinct from its colored background');
    assert.ok(stats.shops >= 80 && stats.sakura >= 40 && stats.walkers >= 50, 'The city should contain the modeled shop, sakura and pedestrian districts');
    const setbacks=await page.evaluate(()=>window.cityHarness.steppedFacadeGaps());
    assert.ok(setbacks.checked>=4);assert.deepEqual(setbacks.failures,[],'Stepped facades must not leave full-height trim floating outside their upper tiers');
    const opticalDepth = await page.evaluate(() => window.cityHarness.opticalDepth());
    assert.ok(opticalDepth.behind[0] > opticalDepth.behind[1] + 100, 'A farther object must remain occluded after HDR city compositing');
    assert.ok(opticalDepth.nearer[1] > opticalDepth.nearer[0] + 100, 'Foreground geometry must remain visible over the composited city');
    const hazeRect=await page.evaluate(()=>window.cityHarness.hazeTower('fog',true));
    const glowing=await sharp(await page.screenshot({path:new URL('tower-glow-through-haze.png',shots).pathname})).extract(hazeRect).removeAlpha().raw().toBuffer();
    await page.evaluate(()=>window.cityHarness.hazeTower('fog',false));
    const darkTower=await sharp(await page.screenshot()).extract(hazeRect).removeAlpha().raw().toBuffer();
    let warmGlow=0;
    for(let i=0;i<glowing.length;i+=3)if(glowing[i]>darkTower[i]+18&&glowing[i]>glowing[i+2]+12)warmGlow++;
    assert.ok(warmGlow>100,`Haze must retain a distinct warm Tokyo Tower and halo (${warmGlow} warm luminous pixels)`);
    for(const [hour,weather]of [[22,'clear'],[22,'fog'],[17.75,'clear'],[17.75,'fog'],[12,'clear']]){
      const paint=await page.evaluate(([hour,weather])=>window.cityHarness.towerPaintSample(hour,weather),[hour,weather]);
      if(hour===22)await page.screenshot({path:new URL('tower-paint-'+weather+'.png',shots).pathname,clip:{x:470,y:15,width:500,height:870}});
      assert.ok(paint.red.count>100&&paint.white.count>100,'Paint comparisons must sample both real tower materials');
      assert.ok(paint.red.redGreen-paint.white.redGreen>18,`Red steel and white bands must remain distinct at ${hour}/${weather}: ${JSON.stringify(paint)}`);
      assert.ok(paint.red.washed<.12,`Red paint must not turn into a near-white highlight at ${hour}/${weather}: ${JSON.stringify(paint)}`);
      if(hour===22)assert.ok(paint.warmHalo>(weather==='fog'?20:80),`Balanced tower lighting must retain a soft warm halo at ${weather}: ${JSON.stringify(paint)}`);
    }
    await page.evaluate(()=>window.cityHarness.roadOverlapSample('daimon-avenue'));
    const firstRoad=await page.screenshot();
    await page.evaluate(()=>window.cityHarness.roadOverlapSample('south-cross-street'));
    const secondRoad=await page.screenshot();
    assert.ok(await difference(firstRoad,secondRoad)<250,'Overlapping asphalt must shade identically instead of fighting between different UV patterns');
    assert.deepEqual(await page.evaluate(() => window.cityHarness.roadSurfaces()), [], 'Park terrain must not cover asphalt road surfaces');
    const roof = await page.evaluate(() => window.cityHarness.roofRay());
    assert.ok(roof.height>=roof.minimum&&roof.height<=roof.maximum,'A top-down ray must intersect the real elevated survey roof, including its setbacks');
    const base = await page.evaluate(() => window.cityHarness.render({ x: 0 }));
    await page.screenshot({ path: new URL('reconstructed-city.png', shots).pathname });
    const shifted = await page.evaluate(() => window.cityHarness.render({ x: 3 }));
    const nearParallax = Math.abs(shifted.near[0] - base.near[0]);
    const farParallax = Math.abs(shifted.far[0] - base.far[0]);
    assert.ok(nearParallax > farParallax * 4, 'Near buildings must move more than the distant tower under a camera translation');
    await page.screenshot({ path: new URL('reconstructed-city-parallax.png', shots).pathname });

    await page.evaluate(() => window.cityHarness.render({ night: 1 }));
    const lit = await page.screenshot();
    await page.evaluate(() => window.cityHarness.render({ night: 1, windows: false }));
    const unlit = await page.screenshot();
    assert.ok(await difference(lit, unlit) > 5000, 'Window lighting must be independent of the building surface');
    await page.evaluate(() => window.cityHarness.render({ night: 1, tower: false }));
    const towerOff = await page.screenshot();
    assert.ok(await difference(lit, towerOff) > 40, 'Tokyo Tower illumination must be independently controllable');
    await page.evaluate(() => window.cityHarness.render({ night: 0 }));
    const dusk = await page.screenshot();
    assert.ok(await difference(lit, dusk) > 20_000, 'Sky, surfaces and city lighting must relight between dusk and night');
    await page.evaluate(() => window.cityHarness.windowSample(0));
    const firstWindows=await page.screenshot();
    await page.evaluate(() => window.cityHarness.windowSample(19));
    const changedWindows=await page.screenshot();
    assert.ok(await difference(firstWindows,changedWindows)>1000,'Individual window lights and blinds must change over time on an otherwise static building');
    await page.evaluate(()=>window.cityHarness.windowSample(0,true,0));
    const subpixelBefore=await sharp(await page.screenshot()).extract({left:600,top:350,width:120,height:100}).png().toBuffer();
    await page.evaluate(()=>window.cityHarness.windowSample(0,true,.25*9/1440));
    const subpixelAfter=await sharp(await page.screenshot()).extract({left:600,top:350,width:120,height:100}).png().toBuffer();
    assert.ok(await difference(subpixelBefore,subpixelAfter)<20,'Unresolved windows must not shimmer during a quarter-pixel camera movement');
    const edge=await page.evaluate(()=>window.cityHarness.architectureSample());
    const closeFacade=await page.screenshot({path:new URL('facade-sharpness-probe.png',shots).pathname});
    const strip=await sharp(closeFacade).extract({left:edge.x-8,top:edge.y,width:17,height:1}).removeAlpha().raw().toBuffer();
    const luminance=Array.from({length:17},(_,i)=>(strip[i*3]+strip[i*3+1]+strip[i*3+2])/3);
    const wall=luminance.slice(0,4).reduce((a,b)=>a+b,0)/4,glass=luminance.slice(-4).reduce((a,b)=>a+b,0)/4;
    assert.ok(Math.abs(wall-glass)>18,`Zoomed glazing must remain distinguishable from its cladding: ${JSON.stringify({edge,wall,glass,luminance})}`);
    const transition=luminance.filter(value=>{const t=(value-glass)/(wall-glass);return t>.2&&t<.8}).length;
    assert.ok(transition<=3,`Close window edges must stay sharp instead of smeared (${transition}px transition)`);
    for(const [hour,name]of [[12,'city-maxzoom-day.png'],[22,'city-maxzoom-night.png']]){
      await page.evaluate(hour=>window.cityHarness.closeup(hour),hour);
      await page.screenshot({path:new URL(name,shots).pathname});
    }
    await page.evaluate(()=>window.cityHarness.towerPortrait());
    await page.screenshot({path:new URL('tokyo-tower-refined-decks.png',shots).pathname});

    const vehicles = await page.evaluate(() => { window.cityHarness.render({ time: 25 }); return window.cityHarness.traffic(); });
    for (const car of vehicles) {
      assert.ok(Math.abs(car.y - (-24 + .055 + .15)) < .0001);
      assert.ok(car.up[1] > .999, 'Cars must stand upright on real ground, not cling to a vertical photograph');
    }
    const behavior=await page.evaluate(()=>window.cityHarness.trafficBehavior());
    assert.ok(behavior.moving>20&&behavior.braking>0);
    assert.equal(behavior.brightBrakes,behavior.braking,'Braking decisions must affect actual rendered rear-light colors');
    assert.deepEqual(errors, []);
    console.log(`PASS: ${stats.buildings} buildings, ${stats.shops} shops, ${stats.sakura} sakura and ${stats.walkers} pedestrians; HDR depth preserved; ${Math.round(nearParallax / farParallax)}x parallax and ${stats.cars} grounded vehicles`);
  } finally {
    await context.close();
  }
}
