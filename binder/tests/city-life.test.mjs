import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CITY_GROUND, CITY_STREETS, createCityLayout } from '../src/city-layout.js';
import { cityIdentity, WINDOW_FADE_SECONDS } from '../src/city-life.js';
import { createRoadRibbon, createSidewalkPaths, RoadSurfaceIndex } from '../src/city-roads.js';
import { CARS_PER_ROAD, DEFAULT_TRAFFIC_DENSITY, signalState, TrafficSimulation, vehicleOverlap } from '../src/city-traffic.js';

const roads = () => CITY_STREETS.map(street=>{
  const curve=new THREE.CatmullRomCurve3(street.points.map(([x,z])=>new THREE.Vector3(x,CITY_GROUND+.055,z)),false,'centripetal');
  return {...street,curve,ribbon:createRoadRibbon(curve,street.width)};
});

test('the closest visible city area is filled with a low-rise neighborhood', () => {
  const buildings=createCityLayout(),infill=buildings.filter(spec=>spec.infill);
  assert.ok(infill.length>=80);
  assert.ok(infill.filter(spec=>spec.z>-34).length>=40);
  assert.ok(infill.some(spec=>spec.pitched));
  assert.ok(infill.every(spec=>spec.height<7));
  for(const side of [-1,1])assert.ok(infill.some(spec=>spec.x*side>10&&spec.z>-25));
});

test('buildings have stable and distinctly different lighting families and activity timings', () => {
  const identities=createCityLayout().slice(0,100).map(spec=>cityIdentity(spec.id));
  assert.ok(new Set(identities.map(identity=>identity.lightColor)).size>=6);
  assert.ok(new Set(identities.map(identity=>identity.windowPeriod)).size>50);
  assert.ok(identities.every(identity=>identity.windowPeriod>=24&&identity.windowPeriod<73));
  assert.deepEqual(cityIdentity('shiba-park-office'),cityIdentity('shiba-park-office'));
  assert.ok(WINDOW_FADE_SECONDS>=1, 'Window transitions should not strobe');
});

test('walking paths avoid the union of curved road surfaces, including the temple fork', () => {
  const streetData=roads(),index=new RoadSurfaceIndex(streetData),paths=createSidewalkPaths(streetData,index);
  assert.ok(paths.length>=6);
  assert.ok(index.clearance(13.8,-160.3)<0, 'The former pedestrian conflict lies on asphalt');
  for(const path of paths)for(let step=0;step<=120;step++){
    const point=path.curve.getPointAt(step/120);
    assert.ok(index.clearance(point.x,point.z)>.10,`${path.street} at ${step/120} must keep people off vehicle lanes`);
  }
});

test('traffic signals never give intersecting axes green at the same time', () => {
  for(let time=0;time<120;time+=.1)for(let index=0;index<6;index++){
    assert.ok(!(signalState(time,index,'north-south')==='green'&&signalState(time,index,'east-west')==='green'));
  }
});

test('autonomous cars stop for red and resume on green', () => {
  const simulation=new TrafficSimulation(roads());
  simulation.setCount(1);
  const car=simulation.agents[0],road=simulation.roads[car.road];
  const stop=road.stops.find(item=>item.index===0);
  assert.ok(stop);
  const line=stop.at-stop.offset;
  car.distance=line-4;car.speed=0;simulation.sample(car,car.distance,car.pose);
  for(let i=0;i<140;i++)simulation.step(.05,30+i*.05);
  assert.ok(car.distance<=line+.001);
  assert.ok(car.speed<.05&&car.braking);
  for(let i=0;i<180;i++)simulation.step(.05,i*.05);
  assert.ok(car.distance>line+1);
});

test('car following and intersection yielding avoid body overlaps at changing densities', () => {
  const simulation=new TrafficSimulation(roads());
  assert.equal(simulation.count,576);
  assert.equal(simulation.count,Math.round(simulation.agents.length*DEFAULT_TRAFFIC_DENSITY));
  assert.equal(simulation.agents.length,simulation.roads.length*CARS_PER_ROAD);
  let braking=0;
  for(let step=0;step<800;step++){
    if(step===300)simulation.setCount(simulation.agents.length);
    if(step===600)simulation.setCount(90);
    simulation.step(.05,step*.05);
    braking+=simulation.agents.slice(0,simulation.count).filter(agent=>agent.braking).length;
    if(step%40!==0)continue;
    for(let i=0;i<simulation.count;i++)for(let j=i+1;j<simulation.count;j++){
      assert.equal(vehicleOverlap(simulation.agents[i],simulation.agents[j],0),false,`Vehicles ${i}/${j} overlap at ${step*.05}s`);
    }
  }
  assert.ok(braking>0);
  assert.ok(simulation.lastCollisionChecks<simulation.count*8,'Traffic broad-phase checks should stay local rather than testing every pair');
});

test('the curved west junction controls both routes and keeps traffic moving across signal cycles', () => {
  const simulation=new TrafficSimulation(roads());
  for(const id of ['shiba-park-west','north-cross-street']){
    const road=simulation.roads.find(item=>item.id===id);
    assert.ok(road.stops.some(stop=>stop.index===3), `${id} must obey the west-junction signal`);
  }
  let checkpoint;
  for(let step=0;step<4480;step++){
    simulation.step(.05,step*.05);
    if(step===2239)checkpoint=simulation.agents.slice(0,simulation.count).map(agent=>agent.travelled);
  }
  simulation.agents.slice(0,simulation.count).forEach((agent,index)=>{
    assert.ok(agent.travelled-checkpoint[index]>.5, `Car ${index} must not remain stuck for two entire signal cycles`);
  });
});
