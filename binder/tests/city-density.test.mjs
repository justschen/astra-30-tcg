import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { CITY_GROUND, CITY_STREETS, SIDE_PARKS, createCityLayout } from '../src/city-layout.js';
import { combineSurveyLayout, overlapsBuilding } from '../src/city-survey-layout.js';
import { buildingFootprint, createCityInfill } from '../src/city-infill.js';
import { createRoadRibbon, RoadSurfaceIndex, createSidewalkPaths } from '../src/city-roads.js';
import { createPedestrianAgents, PEDESTRIAN_COUNT, samplePedestrian } from '../src/city-crowds.js';
import { TrafficSimulation, vehicleOverlap } from '../src/city-traffic.js';

const manifest=JSON.parse(await fs.readFile(new URL('../public/city/manifest.json',import.meta.url),'utf8'));
const original=combineSurveyLayout(createCityLayout(),manifest.buildings);
const roads=CITY_STREETS.map(street=>{
  const curve=new THREE.CatmullRomCurve3(street.points.map(([x,z])=>new THREE.Vector3(x,CITY_GROUND+.055,z)),false,'centripetal');
  return {...street,curve,ribbon:createRoadRibbon(curve,street.width)};
});
const infill=createCityInfill(original,roads),buildings=[...original,...infill.buildings],surfaces=new RoadSurfaceIndex(roads);
const footprints=buildings.map(buildingFootprint);

test('urban infill substantially occupies the previously empty near-city plots without moving existing buildings',()=>{
  assert.ok(infill.buildings.length>=400);
  assert.ok(infill.buildings.reduce((sum,spec)=>sum+spec.width*spec.depth,0)>4800);
  assert.ok(infill.yards.length>=20&&infill.parking.length>=60);
  assert.deepEqual(createCityInfill(original,roads),infill,'Block filling must be deterministic');
  const placed=[];
  for(const spec of [...infill.buildings,...infill.yards]){
    assert.ok(!surfaces.intersectsPlot(spec,1.05),`${spec.id} must leave vehicle lanes and sidewalks open`);
    assert.ok(!original.some(other=>overlapsBuilding(spec,buildingFootprint(other),.3)),`${spec.id} must not collide with the existing skyline`);
    assert.ok(!SIDE_PARKS.some(park=>overlapsBuilding(spec,park,.3)));
    assert.ok(!placed.some(other=>overlapsBuilding(spec,other,.3)));
    placed.push(spec);
  }
  for(const side of [-1,1])assert.ok(infill.buildings.filter(spec=>spec.x*side>30).length>100);
});

test('parked cars remain entirely in service courts instead of being decorative traffic on sidewalks',()=>{
  for(const car of infill.parking){
    const plot={x:car.x,z:car.z,width:.5,depth:1.18};
    assert.ok(!surfaces.intersectsPlot(plot,.25));
    assert.ok(!footprints.some(spec=>overlapsBuilding(plot,spec,.08)));
    assert.ok(infill.yards.some(yard=>Math.abs(car.x-yard.x)+plot.width/2<yard.width/2&&Math.abs(car.z-yard.z)+plot.depth/2<yard.depth/2));
  }
});

test('more than five times as many people use safe foreground, side-street and temple routes',()=>{
  const blocked=(x,z)=>footprints.some(spec=>Math.abs(spec.x-x)<spec.width/2+.25&&Math.abs(spec.z-z)<spec.depth/2+.25);
  const routes=createSidewalkPaths(roads,surfaces,blocked),agents=createPedestrianAgents(routes);
  assert.equal(agents.length,PEDESTRIAN_COUNT);assert.ok(agents.length>=480);
  assert.ok(new Set(agents.map(agent=>agent.path.street)).size>=8);
  const point=new THREE.Vector3(),tangent=new THREE.Vector3();
  let near=0;
  for(const agent of agents)for(const time of [0,24,88,160]){
    samplePedestrian(agent,time,point,tangent);
    assert.ok(surfaces.clearance(point.x,point.z)>.18,'Walking lanes must not spill onto vehicle asphalt');
    assert.ok(!footprints.some(spec=>Math.abs(spec.x-point.x)<spec.width/2+.1&&Math.abs(spec.z-point.z)<spec.depth/2+.1),'Walking figures must stay outside buildings');
    assert.ok(Math.abs(tangent.length()-1)<1e-7);
    if(time===0&&Math.abs(point.x)<120&&point.z> -190)near++;
  }
  assert.ok(near>=260,'The increase must be concentrated in the visible district, not only distant paths');
  assert.throws(()=>createPedestrianAgents([]),/safe routes/);
});

test('visible street traffic triples and maximum density keeps intersections clear across complete cycles',()=>{
  const simulation=new TrafficSimulation(roads);
  assert.equal(simulation.count,576);
  const close=simulation.agents.slice(0,simulation.count).filter(agent=>Math.abs(agent.pose.point.x)<160&&agent.pose.point.z> -190&&agent.pose.point.z< -12);
  assert.ok(close.length>=330,'Visible street population must rise well beyond the old 135 nearby cars');
  simulation.setCount(simulation.agents.length);assert.equal(simulation.count,768);
  for(const agent of simulation.agents){
    const road=simulation.roads[agent.road],at=agent.direction>0?agent.distance:road.length-agent.distance;
    assert.ok(road.stops.every(stop=>!stop.junction||Math.abs(at-stop.at)>=stop.offset+agent.length/2),'Vehicles must not spawn inside a junction');
  }
  let checkpoint;
  for(let step=0;step<4480;step++){
    simulation.step(.05,step*.05);
    if(step===2239)checkpoint=simulation.agents.map(agent=>agent.travelled);
    if(step%448===0)for(let i=0;i<simulation.count;i++)for(let j=i+1;j<simulation.count;j++){
      assert.equal(vehicleOverlap(simulation.agents[i],simulation.agents[j],0),false,`Dense vehicles ${i}/${j} overlap at ${step*.05}s`);
    }
  }
  simulation.agents.forEach((agent,index)=>assert.ok(agent.travelled-checkpoint[index]>.5,`Car ${index} must not deadlock at maximum density`));
  assert.ok(simulation.lastCollisionChecks<simulation.count*12);
});
