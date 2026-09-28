import * as THREE from 'three';
import { canvasTexture, random } from './materials.js';
import { DEFAULT_TRAFFIC_DENSITY, TrafficSimulation } from './city-traffic.js';
import { CITY_GROUND } from './city-layout.js';
import { markBufferChanged, writeVehicleInstance, writeWheelInstance } from './instance-transforms.js';
import { createVolumeRain } from './city-weather.js';
import { NearestItems } from './nearest-items.js';

export const WEATHER = ['clear', 'rain', 'fog'];
export const wrap = value => ((value % 1) + 1) % 1;
export const advanceCityTime = (time, delta, running) => time + (running ? Math.max(0, Math.min(delta, .1)) : 0);
export const trafficProgress = (time, index, duration = index % 2 ? 64 : 71) => wrap(time / duration + index * .61803398875);
export const beaconGlow = (time, phase = 0) => .18 + Math.pow((Math.sin(time * 1.65 + phase) + 1) / 2, 5) * .82;
export const rainHeight = (start, speed, time) => -1.5 + wrap((start - time * speed) / 10.5) * 10.5;
export function flightPosition(time, index = 0) {
  const progress = wrap(time / (index ? 103 : 78) + (index ? .79 : .28));
  const direction = index ? -1 : 1;
  return {
    x: (progress - .5) * 270 * direction,
    y: (index ? 30 : 21) + Math.sin(progress * Math.PI) * 4,
    z: -170 - Math.sin(progress * Math.PI) * (index ? 80 : 30),
    yaw: Math.atan2(-direction, Math.cos(progress * Math.PI) * .5),
  };
}

function glowTexture() {
  return canvasTexture(64, 64, ctx => {
    const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
    gradient.addColorStop(0, '#ffffffff'); gradient.addColorStop(.16, '#ffffffde');
    gradient.addColorStop(.4, '#ffffff48'); gradient.addColorStop(1, '#ffffff00');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  });
}

function aircraft(parent, glow) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshBasicMaterial({ color: 0x7e94a7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.042, .53, 3, 8), bodyMaterial);
  body.rotation.x = Math.PI / 2; group.add(body);
  const wings = new THREE.BufferGeometry();
  wings.setAttribute('position', new THREE.Float32BufferAttribute([
    -.5, 0, .12, 0, 0, -.14, .5, 0, .12,
    -.5, 0, .12, .5, 0, .12, 0, 0, .035,
    -.19, .03, .32, 0, .03, .2, .19, .03, .32,
    0, .02, .2, 0, .17, .34, 0, .02, .34,
  ], 3));
  wings.computeVertexNormals();
  group.add(new THREE.Mesh(wings, new THREE.MeshBasicMaterial({ color: 0x92a8ba, side: THREE.DoubleSide })));
  const red = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xff776d, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  red.position.set(-.49, 0, .11); red.scale.setScalar(.18); group.add(red);
  const green = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x95d4bb, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  green.position.set(.49, 0, .11); green.scale.setScalar(.14); group.add(green);
  const nose = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffe7b6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  nose.position.z = -.34; nose.scale.setScalar(.14); group.add(nose);
  parent.add(group);
  return { group, red, nose };
}

export class CityAtmosphere {
  constructor(scene, skyline, reducedMotion = false) {
    this.root = new THREE.Group();
    this.root.name = 'Living city: traffic, aircraft, lights, weather';
    scene.add(this.root);
    this.skyline = skyline;
    this.time = 0;
    this.running = !reducedMotion;
    this.weather = 'clear';
    this.glow = glowTexture();
    this.viewPosition=new THREE.Vector3(0,3.05,5.9);
    this.nearestHeadlights=new NearestItems(16);
    this.buildTraffic();
    this.buildParking();
    this.planes = [aircraft(this.root, this.glow), aircraft(this.root, this.glow)];
    this.planes[0].group.scale.setScalar(3.8);
    this.planes[1].group.scale.setScalar(3);
    this.buildBeacons();
    this.buildWeather();
    this.setWeather('clear');
    this.setTrafficDensity(DEFAULT_TRAFFIC_DENSITY);
    this.paint();
  }

  buildTraffic() {
    this.traffic=new TrafficSimulation(this.skyline.roads);
    this.streets = this.traffic.roads;
    this.maxCars = this.traffic.agents.length;
    this.carCount = this.maxCars;
    this.cars = new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: .3, metalness: .28 }), this.maxCars);
    const roofGeometry=new THREE.BoxGeometry(1,1,1),vertices=roofGeometry.attributes.position;
    for(let i=0;i<vertices.count;i++)if(vertices.getY(i)>0){vertices.setZ(i,vertices.getZ(i)*.75);vertices.setX(i,vertices.getX(i)*.87);}
    roofGeometry.computeVertexNormals();
    this.roofs = new THREE.InstancedMesh(roofGeometry, new THREE.MeshStandardMaterial({ color: 0x3a4d59, roughness: .19, metalness: .4 }), this.maxCars);
    this.cars.name = 'Street-level cars around Shiba Park';
    this.cars.frustumCulled = this.roofs.frustumCulled = false;
    for (let i = 0; i < this.maxCars; i++) this.cars.setColorAt(i, new THREE.Color(this.traffic.agents[i].color));
    this.root.add(this.cars, this.roofs);
    this.cars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.roofs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wheels=new THREE.InstancedMesh(new THREE.CylinderGeometry(.085,.085,.045,8),new THREE.MeshStandardMaterial({color:0x18222a,roughness:.88}),this.maxCars*4);
    this.wheels.frustumCulled=false;this.wheels.name='Vehicle tires';this.root.add(this.wheels);
    this.wheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.axleRotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2);
    this.trafficPositions = new Float32Array(this.maxCars * 4 * 3);
    const colors = [];
    for (let i = 0; i < this.maxCars; i++) for (let light = 0; light < 4; light++) colors.push(...new THREE.Color(light < 2 ? 0xffe6b6 : 0xee665b).toArray());
    const lightGeometry = new THREE.BufferGeometry();
    lightGeometry.setAttribute('position', new THREE.BufferAttribute(this.trafficPositions, 3).setUsage(THREE.DynamicDrawUsage));
    lightGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.trafficLights = new THREE.Points(lightGeometry, new THREE.PointsMaterial({
      map: this.glow, size: .43, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.trafficLights.frustumCulled = false; this.trafficLights.renderOrder = 2;
    this.root.add(this.trafficLights);
    const staticGeometry = new THREE.BufferGeometry();
    staticGeometry.setAttribute('position', new THREE.Float32BufferAttribute(this.skyline.lampPositions.flat(), 3));
    this.streetLights = new THREE.Points(staticGeometry, new THREE.PointsMaterial({
      map: this.glow, color: 0xffca7f, size: .45, opacity: .8, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.root.add(this.streetLights);
    this.headlightTexture=this.skyline.uniforms.cityHeadlights.value;
    this.headlightData=this.headlightTexture.image.data;
    const extra=(geometry,material,name)=>{
      const mesh=new THREE.InstancedMesh(geometry,material,this.maxCars);mesh.name=name;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.root.add(mesh);return mesh;
    };
    this.cargo=extra(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xc9cdc6,roughness:.69,metalness:.18}),'Delivery truck cargo bodies');
    this.riders=extra(new THREE.CapsuleGeometry(.073,.17,3,6),new THREE.MeshStandardMaterial({color:0x46575c,roughness:.9}),'Motorcycle riders');
    this.helmets=extra(new THREE.SphereGeometry(.075,8,6),new THREE.MeshStandardMaterial({color:0xf1e9d8,roughness:.36}),'Motorcycle helmets');
    this.taxiSigns=extra(new THREE.BoxGeometry(.16,.07,.09),new THREE.MeshStandardMaterial({color:0xe4dec2,emissive:0xcbd7aa,emissiveIntensity:.45}),'Taxi roof signs');
  }

  buildParking(){
    const parking=this.skyline.parking;
    if(!parking?.length)return;
    const bodies=new THREE.InstancedMesh(this.cars.geometry,this.cars.material,parking.length);
    const roofs=new THREE.InstancedMesh(this.roofs.geometry,this.roofs.material,parking.length);
    const wheels=new THREE.InstancedMesh(this.wheels.geometry,this.wheels.material,parking.length*4);
    bodies.name='Parked cars in neighborhood service courts';
    const matrix=new THREE.Object3D(),color=new THREE.Color(),palette=[0xc7cbc6,0x56626a,0xa4ada7,0x97826d,0x9faeb4,0x4f6269];
    for(const [index,spot]of parking.entries()){
      matrix.rotation.set(0,spot.yaw,0);matrix.scale.set(.42,.17,.92*spot.size);
      matrix.position.set(spot.x,CITY_GROUND+.19,spot.z);matrix.updateMatrix();bodies.setMatrixAt(index,matrix.matrix);
      bodies.setColorAt(index,color.setHex(palette[index%palette.length]));
      matrix.position.y+=.13;matrix.scale.set(.34,.14,.47*spot.size);matrix.updateMatrix();roofs.setMatrixAt(index,matrix.matrix);
      matrix.quaternion.multiply(this.axleRotation);matrix.scale.set(1,1,1);
      const c=Math.cos(spot.yaw),s=Math.sin(spot.yaw);
      for(let wheel=0;wheel<4;wheel++){
        const x=wheel%2?.23:-.23,z=(wheel<2?.31:-.31)*spot.size;
        matrix.position.set(spot.x+x*c+z*s,CITY_GROUND+.105,spot.z-x*s+z*c);matrix.updateMatrix();wheels.setMatrixAt(index*4+wheel,matrix.matrix);
      }
    }
    this.root.add(bodies,roofs,wheels);
    this.parkedCount=parking.length;
  }

  buildBeacons() {
    const locations = this.skyline.beaconPositions;
    const positions = locations.flat();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(locations.length * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.beacons = new THREE.Points(geometry, new THREE.PointsMaterial({
      map: this.glow, size: 1.0, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.beacons.renderOrder = 2; this.root.add(this.beacons);
  }

  buildWeather() {
    this.rain=createVolumeRain(this.root,this.skyline.uniforms);
  }

  setWeather(weather) {
    if (!WEATHER.includes(weather)) throw new Error(`Unknown weather: ${weather}`);
    this.weather = weather;
    this.rain.visible = weather === 'rain';
    this.skyline.setWeather(weather);
  }

  setMotion(running) { this.running = running; }

  setTrafficDensity(value) {
    this.carCount = Math.round(this.maxCars * THREE.MathUtils.clamp(value, 0, 1));
    this.traffic.setCount(this.carCount);
    this.cars.count = this.roofs.count = this.carCount;
    this.wheels.count=this.carCount*4;
    this.trafficLights.geometry.setDrawRange(0, this.carCount * 4);
    this.paint();
  }

  update(delta,viewPosition) {
    if(viewPosition)this.viewPosition.copy(viewPosition);
    const next = advanceCityTime(this.time, delta, this.running);
    if (next === this.time) {this.updateHeadlights();return;}
    this.traffic.step(next-this.time,next);
    this.time = next;
    this.paint();
  }

  updateHeadlights() {
    this.nearestHeadlights.reset();
    for(let i=0;i<this.carCount;i++){
      const agent=this.traffic.agents[i];
      this.nearestHeadlights.offer(agent,agent.pose.point.distanceToSquared(this.viewPosition));
    }
    const closest=this.nearestHeadlights.items;
    for(const [index,agent]of closest.entries()){
      const point=agent.pose.point,forward=agent.pose.forward,data=this.headlightData,at=index*4,light=(16+index)*4;
      data[at]=point.x+forward.x*agent.length/2;data[at+1]=point.z+forward.z*agent.length/2;
      data[at+2]=forward.x;data[at+3]=forward.z;
      data[light]=1;data[light+1]=.8;data[light+2]=.5;data[light+3]=1;
    }
    this.skyline.uniforms.cityHeadlightCount.value=closest.length;
    this.headlightTexture.needsUpdate=true;
  }

  paint() {
    this.skyline.setClock(this.time);
    this.streetLights.material.opacity = .18 + this.skyline.uniforms.cityNight.value * .72;
    const lightColors=this.trafficLights.geometry.attributes.color;
    const bodies=this.cars.instanceMatrix.array,roofs=this.roofs.instanceMatrix.array,wheels=this.wheels.instanceMatrix.array;
    const colorsArray=lightColors.array;
    let cargoCount=0,riderCount=0,taxiCount=0,wheelCount=0;
    for (let i = 0; i < this.carCount; i++) {
      const agent=this.traffic.agents[i];
      const point=agent.pose.point,forward=agent.pose.forward,sideVector=agent.pose.side,y=point.y+.15;
      writeVehicleInstance(bodies,i,point.x,y,point.z,forward.x,forward.z,agent.bodyWidth,agent.height,agent.length);
      const cabOffset=agent.kind==='box-truck'?agent.length*.3:agent.kind==='motorcycle'?-.08:0;
      writeVehicleInstance(roofs,i,point.x+forward.x*cabOffset,y+agent.height*.5+agent.cabHeight*.45,point.z+forward.z*cabOffset,forward.x,forward.z,agent.cabWidth,agent.cabHeight,agent.cabLength);
      if(agent.kind==='box-truck'){
        writeVehicleInstance(this.cargo.instanceMatrix.array,cargoCount++,point.x-forward.x*.2,point.y+.57,point.z-forward.z*.2,forward.x,forward.z,agent.bodyWidth,.65,1.04);
      }else if(agent.kind==='motorcycle'){
        writeVehicleInstance(this.riders.instanceMatrix.array,riderCount,point.x-forward.x*.06,point.y+.47,point.z-forward.z*.06,forward.x,forward.z,1,1,1);
        writeVehicleInstance(this.helmets.instanceMatrix.array,riderCount++,point.x+forward.x*.035,point.y+.67,point.z+forward.z*.035,forward.x,forward.z,1,1,1);
      }else if(agent.kind==='taxi')writeVehicleInstance(this.taxiSigns.instanceMatrix.array,taxiCount++,point.x,point.y+.46,point.z,forward.x,forward.z,1,1,1);
      for (let light = 0; light < 4; light++) {
        const end = (light < 2 ? .505 : -.505) * agent.length, side = (light % 2 ? 1 : -1)*agent.bodyWidth*.33;
        const at = (i * 4 + light) * 3;
        this.trafficPositions[at] = point.x+forward.x*end+sideVector.x*side;
        this.trafficPositions[at+1] = y+.035;
        this.trafficPositions[at+2] = point.z+forward.z*end+sideVector.z*side;
        const brightness=light<2?1.35+this.skyline.uniforms.cityNight.value*1.15:agent.braking?3.8:1.65;
        colorsArray[at]=brightness*(light<2?.87:1);colorsArray[at+1]=brightness*(light<2?.95:.018);colorsArray[at+2]=brightness*(light<2?1:.006);
      }
      const motorcycle=agent.kind==='motorcycle';
      for(let wheel=0;wheel<(motorcycle?2:4);wheel++){
        const across=motorcycle?0:(wheel%2?1:-1)*(agent.bodyWidth/2+.006),along=(wheel<(motorcycle?1:2)?.34:-.34)*agent.length;
        writeWheelInstance(wheels,wheelCount++,point.x+forward.x*along+sideVector.x*across,point.y+.085,
          point.z+forward.z*along+sideVector.z*across,forward.x,forward.z);
      }
    }
    markBufferChanged(this.cars.instanceMatrix,this.carCount*16);markBufferChanged(this.roofs.instanceMatrix,this.carCount*16);
    this.wheels.count=wheelCount;markBufferChanged(this.wheels.instanceMatrix,wheelCount*16);
    markBufferChanged(this.trafficLights.geometry.attributes.position,this.carCount*4*3);markBufferChanged(lightColors,this.carCount*4*3);
    for(const [mesh,count]of [[this.cargo,cargoCount],[this.riders,riderCount],[this.helmets,riderCount],[this.taxiSigns,taxiCount]]){
      mesh.count=count;markBufferChanged(mesh.instanceMatrix,count*16);
    }
    this.planes.forEach((plane, index) => {
      const position = flightPosition(this.time, index);
      plane.group.position.set(position.x, position.y, position.z); plane.group.rotation.y = position.yaw;
      plane.red.material.opacity = .18 + beaconGlow(this.time, index * 2) * .75;
      plane.nose.material.opacity = .5 + beaconGlow(this.time, index * 2 + .5) * .5;
    });
    const colors = this.beacons.geometry.attributes.color;
    for (let i = 0; i < colors.count; i++) {
      const glow = beaconGlow(this.time, i * 1.47);
      colors.setXYZ(i,glow*3.1,glow*.015,glow*.005);
    }
    colors.needsUpdate = true;
    this.rain.material.uniforms.rainTime.value=this.time;
    this.updateHeadlights();
  }
}
