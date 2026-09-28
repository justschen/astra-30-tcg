import * as THREE from 'three';
import { vehicleProfile } from './vehicle-profile.js';

export const TRAFFIC_SIGNALS = [[8.7,-52],[11,-109],[12.3,-156],[-69,-155],[50,-164],[8,-22]];
export const CARS_PER_ROAD = 96;
export const DEFAULT_TRAFFIC_DENSITY = .75;
export const SIGNAL_ROADS = [
  ['daimon-avenue','south-cross-street'],
  ['daimon-avenue'],
  ['daimon-avenue','north-cross-street'],
  ['shiba-park-west','north-cross-street'],
  ['park-east-street','north-cross-street'],
  ['daimon-avenue','near-neighborhood-street'],
];
const wrap = (value,length) => ((value%length)+length)%length;
const UP = new THREE.Vector3(0,1,0);

export function signalState(time,index,axis) {
  const phase=wrap(time+index*7,56);
  if(axis==='north-south')return phase<20?'green':phase<25?'amber':'red';
  return phase>=28&&phase<48?'green':phase>=48&&phase<53?'amber':'red';
}

export function vehicleOverlap(a,b,margin=.04) {
  const dx=b.pose.point.x-a.pose.point.x,dz=b.pose.point.z-a.pose.point.z;
  for(const axis of [a.pose.forward,a.pose.side,b.pose.forward,b.pose.side]){
    const distance=Math.abs(dx*axis.x+dz*axis.z);
    const radiusA=Math.abs(axis.dot(a.pose.forward))*a.length/2+Math.abs(axis.dot(a.pose.side))*(a.width??.5)/2;
    const radiusB=Math.abs(axis.dot(b.pose.forward))*b.length/2+Math.abs(axis.dot(b.pose.side))*(b.width??.5)/2;
    if(distance>=radiusA+radiusB+margin)return false;
  }
  return true;
}

const pose = () => ({point:new THREE.Vector3(),forward:new THREE.Vector3(),side:new THREE.Vector3()});

function crossing(first,second,expected) {
  let result=null;
  for(let i=0;i<first.samples.length-1;i++){
    const a=first.samples[i],b=first.samples[i+1],rx=b.x-a.x,rz=b.z-a.z;
    for(let j=0;j<second.samples.length-1;j++){
      const c=second.samples[j],d=second.samples[j+1],sx=d.x-c.x,sz=d.z-c.z,denominator=rx*sz-rz*sx;
      if(Math.abs(denominator)<1e-10)continue;
      const dx=c.x-a.x,dz=c.z-a.z,t=(dx*sz-dz*sx)/denominator,u=(dx*rz-dz*rx)/denominator;
      if(t<0||t>1||u<0||u>1)continue;
      const x=a.x+t*rx,z=a.z+t*rz,distance=Math.hypot(x-expected[0],z-expected[1]);
      if(!result||distance<result.distance)result={distance,first:(i+t)/(first.samples.length-1)*first.length,second:(j+u)/(second.samples.length-1)*second.length};
    }
  }
  return result;
}

export class TrafficSimulation {
  constructor(roads) {
    this.roads=roads.filter(road=>road.traffic!==false).map(road=>{
      const length=road.curve.getLength(),start=road.curve.getPointAt(0),end=road.curve.getPointAt(1);
      const axis=Math.abs(end.x-start.x)>Math.abs(end.z-start.z)?'east-west':'north-south';
      const count=Math.max(40,Math.ceil(length/.6));
      const samples=Array.from({length:count+1},(_,i)=>road.curve.getPointAt(i/count));
      const tangents=Array.from({length:count+1},(_,i)=>road.curve.getTangentAt(i/count));
      return {...road,length,axis,stops:[],samples,tangents};
    });
    for(const [index,ids]of SIGNAL_ROADS.entries()){
      const first=this.roads.find(road=>road.id===ids[0]),second=this.roads.find(road=>road.id===ids[1]);
      if(!first)throw new Error(`Missing route for traffic signal ${index}.`);
      if(second){
        const point=crossing(first,second,TRAFFIC_SIGNALS[index]);
        if(!point)throw new Error(`Signal ${index} does not have a real road junction.`);
        first.stops.push({index,at:point.first,offset:Math.max(3,second.width/2+1.4),junction:true});
        second.stops.push({index,at:point.second,offset:Math.max(3,first.width/2+1.4),junction:true});
      }else{
        const [x,z]=TRAFFIC_SIGNALS[index];
        let nearest=Infinity,at=0;
        for(const [i,point]of first.samples.entries()){
          const distance=Math.hypot(point.x-x,point.z-z);
          if(distance<nearest){nearest=distance;at=i/(first.samples.length-1)*first.length;}
        }
        first.stops.push({index,at,offset:3});
      }
    }
    this.agents=Array.from({length:this.roads.length*CARS_PER_ROAD},(_,index)=>{
      const road=index%this.roads.length;
      const profile=vehicleProfile(index);
      return {...profile,index,road,direction:Math.floor(index/this.roads.length)%2?-1:1,size:profile.length/.92,
        distance:0,travelled:0,speed:0,desired:this.roads[road].speed*profile.speedFactor,braking:false,pose:pose()};
    });
    this.count=0;
    this.candidate={length:1,pose:pose()};
    this.lanes=Array.from({length:this.roads.length*2},()=>[]);
    this.leaders=new Int16Array(this.agents.length);
    this.spatial=new Map();
    this.lastCollisionChecks=0;
    this.setCount(Math.round(this.agents.length*DEFAULT_TRAFFIC_DENSITY));
  }

  sample(agent,distance,result) {
    const road=this.roads[agent.road],progress=wrap(distance,road.length)/road.length;
    const t=agent.direction>0?progress:1-progress;
    const sample=t*(road.samples.length-1),index=Math.min(road.samples.length-2,Math.floor(sample)),blend=sample-index;
    result.point.lerpVectors(road.samples[index],road.samples[index+1],blend);
    result.forward.lerpVectors(road.tangents[index],road.tangents[index+1],blend).normalize().multiplyScalar(agent.direction);
    result.side.crossVectors(UP,result.forward).normalize();
    result.point.addScaledVector(result.side,road.width*.24+agent.laneOffset+Math.sin(distance*.034+agent.seed*6.28)*.022);
  }

  spawn(agent) {
    const road=this.roads[agent.road];
    const lane=this.agents.slice(0,this.count).filter(other=>other.road===agent.road&&other.direction===agent.direction)
      .map(other=>other.distance).sort((a,b)=>a-b);
    const gaps=lane.length?lane.map((at,index)=>({at,size:wrap((lane[(index+1)%lane.length]-at),road.length)||road.length})):
      [{at:road.length*((agent.index*.6180339)%1),size:road.length}];
    gaps.sort((a,b)=>b.size-a.size);
    for(const gap of gaps)for(const fraction of [.32+agent.seed*.36,.5,.35,.65,.22,.78]){
      if(gap.size<agent.length+1.1)continue;
      const distance=wrap(gap.at+gap.size*fraction,road.length);
      const along=agent.direction>0?distance:road.length-distance;
      if(road.stops.some(stop=>stop.junction&&Math.abs(along-stop.at)<stop.offset+agent.length/2+.2))continue;
      this.sample(agent,distance,agent.pose);
      if(this.agents.slice(0,this.count).some(other=>vehicleOverlap(agent,other,.12)))continue;
      agent.distance=distance;agent.speed=0;agent.braking=false;
      return;
    }
    throw new Error(`No safe vehicle spawn space on ${road.id}.`);
  }

  setCount(count) {
    if(!Number.isInteger(count)||count<0||count>this.agents.length)throw new RangeError('Traffic count exceeds the road capacity.');
    if(count<this.count){this.count=count;return;}
    while(this.count<count){this.spawn(this.agents[this.count]);this.count++;}
  }

  cell(x,z) {
    let column=this.spatial.get(x);
    if(!column){column=new Map();this.spatial.set(x,column);}
    let cell=column.get(z);
    if(!cell){cell=[];column.set(z,cell);}
    return cell;
  }

  step(delta,time) {
    const dt=Math.min(.1,Math.max(0,delta));
    if(!dt||!this.count)return;
    for(const lane of this.lanes)lane.length=0;
    this.leaders.fill(-1);this.lastCollisionChecks=0;
    for(const column of this.spatial.values())for(const cell of column.values())cell.length=0;
    for(let index=0;index<this.count;index++){
      const agent=this.agents[index];
      this.lanes[agent.road*2+(agent.direction>0?0:1)].push(agent);
      agent.gridX=Math.floor(agent.pose.point.x/4);agent.gridZ=Math.floor(agent.pose.point.z/4);
      this.cell(agent.gridX,agent.gridZ).push(agent);
    }
    for(const lane of this.lanes){
      if(lane.length<2)continue;
      lane.sort((a,b)=>a.distance-b.distance);
      for(let i=0;i<lane.length;i++)this.leaders[lane[i].index]=lane[(i+1)%lane.length].index;
    }
    for(let index=0;index<this.count;index++){
      const agent=this.agents[index],road=this.roads[agent.road];
      let room=Infinity,leaderSpeed=Infinity;
      const leader=this.leaders[index];
      if(leader>=0){
        const other=this.agents[leader];
        room=wrap(other.distance-agent.distance,road.length)-(agent.length+other.length)/2-agent.followGap;
        leaderSpeed=other.speed;
      }
      let stopDistance=Infinity;
      for(const stop of road.stops){
        const at=(agent.direction>0?stop.at:road.length-stop.at)-stop.offset;
        const remaining=wrap(at-agent.distance,road.length);
        const toLine=remaining>road.length-.05?0:remaining;
        const exitBlocked=stop.junction&&toLine<12&&room<toLine+stop.offset*2+.6;
        if(signalState(time,stop.index,road.axis)!=='green'||exitBlocked)stopDistance=Math.min(stopDistance,toLine);
      }
      const allowed=Math.max(0,Math.min(room,stopDistance));
      const desired=Math.min(agent.desired,Math.sqrt(2.5*allowed),leaderSpeed+Math.max(0,room-1.2));
      let speed=agent.speed+Math.max(-2.4*dt,Math.min(.7*dt,desired-agent.speed));
      speed=Math.max(0,Math.min(speed,allowed/dt));
      const distance=wrap(agent.distance+speed*dt,road.length);
      this.candidate.length=agent.length;
      this.candidate.width=agent.width;
      this.sample(agent,distance,this.candidate.pose);
      let blocked=false;
      const cellX=Math.floor(this.candidate.pose.point.x/4),cellZ=Math.floor(this.candidate.pose.point.z/4);
      for(let x=cellX-1;x<=cellX+1&&!blocked;x++){
        const column=this.spatial.get(x);
        if(!column)continue;
        for(let z=cellZ-1;z<=cellZ+1&&!blocked;z++){
          const nearby=column.get(z);
          if(!nearby)continue;
          for(const other of nearby){
            if(other===agent||other.road===agent.road)continue;
            this.lastCollisionChecks++;
            if(vehicleOverlap(this.candidate,other,.045)){blocked=true;break;}
          }
        }
      }
      agent.braking=blocked||speed<agent.speed-.005||(stopDistance<8&&speed<agent.desired*.8)||(room<2&&speed<agent.desired*.8);
      agent.speed=blocked?0:speed;
      if(!blocked){
        agent.travelled+=speed*dt;
        agent.distance=distance;
        agent.pose.point.copy(this.candidate.pose.point);agent.pose.forward.copy(this.candidate.pose.forward);agent.pose.side.copy(this.candidate.pose.side);
        if(cellX!==agent.gridX||cellZ!==agent.gridZ){
          const previous=this.cell(agent.gridX,agent.gridZ);
          previous.splice(previous.indexOf(agent),1);
          this.cell(cellX,cellZ).push(agent);agent.gridX=cellX;agent.gridZ=cellZ;
        }
      }
    }
  }
}
