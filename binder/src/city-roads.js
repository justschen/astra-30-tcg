import * as THREE from 'three';
import { CITY_GROUND } from './city-layout.js';

function edgeDistance(x, z, a, b) {
  const dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
  const t=length?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/length)):0;
  return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
}

export function createRoadRibbon(curve, width) {
  const steps=Math.ceil(curve.getLength()/1.5),positions=[],uvs=[],indices=[],quads=[];
  const sides=[];
  for(let i=0;i<=steps;i++){
    const point=curve.getPointAt(i/steps),tangent=curve.getTangentAt(i/steps);
    const side=new THREE.Vector3(-tangent.z,0,tangent.x);
    const pair=[];
    for(const sign of [-1,1]){
      const edge=point.clone().addScaledVector(side,sign*width/2);
      positions.push(edge.x,edge.y,edge.z);uvs.push(sign===-1?0:1,i/14);
      pair.push([edge.x,edge.z]);
    }
    sides.push(pair);
    if(i>0){
      const previous=sides[i-1],points=[previous[0],previous[1],pair[1],pair[0]];
      quads.push({points,minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minZ:Math.min(...points.map(p=>p[1])),maxZ:Math.max(...points.map(p=>p[1]))});
    }
    if(i<steps){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  return {positions,uvs,indices,quads};
}

export class RoadSurfaceIndex {
  constructor(roads) {
    this.cells=new Map();
    this.size=16;
    for(const road of roads){
      const ribbon=road.ribbon||createRoadRibbon(road.curve,road.width);
      for(const quad of ribbon.quads){
        for(let x=Math.floor((quad.minX-1)/this.size);x<=Math.floor((quad.maxX+1)/this.size);x++){
          for(let z=Math.floor((quad.minZ-1)/this.size);z<=Math.floor((quad.maxZ+1)/this.size);z++){
            const key=`${x}:${z}`;
            if(!this.cells.has(key))this.cells.set(key,[]);
            this.cells.get(key).push(quad);
          }
        }
      }
    }
  }

  clearance(x,z) {
    const nearby=this.cells.get(`${Math.floor(x/this.size)}:${Math.floor(z/this.size)}`)||[];
    let nearest=Infinity;
    for(const {points} of nearby){
      let positive=false,negative=false,distance=Infinity;
      for(let i=0;i<4;i++){
        const a=points[i],b=points[(i+1)%4];
        const cross=(b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]);
        if(cross>1e-8)positive=true;
        if(cross<-1e-8)negative=true;
        distance=Math.min(distance,edgeDistance(x,z,a,b));
      }
      if(!(positive&&negative))return -distance;
      nearest=Math.min(nearest,distance);
    }
    return nearest;
  }

  intersectsPlot(plot,margin=0){
    const left=plot.x-plot.width/2-margin,right=plot.x+plot.width/2+margin;
    const far=plot.z-plot.depth/2-margin,near=plot.z+plot.depth/2+margin;
    for(let x=Math.floor(left/this.size);x<=Math.floor(right/this.size);x++)for(let z=Math.floor(far/this.size);z<=Math.floor(near/this.size);z++){
      for(const road of this.cells.get(`${x}:${z}`)||[]){
        if(left<road.maxX&&right>road.minX&&far<road.maxZ&&near>road.minZ)return true;
      }
    }
    return false;
  }
}

export function createSidewalkPaths(roads, surfaces, blocked = () => false) {
  const paths=[];
  for(const road of roads){
    const samples=Math.ceil(road.curve.getLength()/.42);
    for(const sign of [-1,1]){
      let points=[];
      const finish=()=>{
        if(points.length>10){
          const curve=new THREE.CurvePath();
          for(let i=1;i<points.length;i++)curve.add(new THREE.LineCurve3(points[i-1],points[i]));
          if(curve.getLength()>4)paths.push({curve,street:road.id});
        }
        points=[];
      };
      for(let i=0;i<=samples;i++){
        const point=road.curve.getPointAt(i/samples),tangent=road.curve.getTangentAt(i/samples);
        point.addScaledVector(new THREE.Vector3(-tangent.z,0,tangent.x),sign*(road.width/2+.63));
        if(Math.abs(point.x)>180||point.z> -12||point.z< -265||surfaces.clearance(point.x,point.z)<.48||blocked(point.x,point.z))finish();
        else points.push(point);
      }
      finish();
    }
  }
  for(const [index,ends]of [
    [[8,-187],[8,-201]], [[-2,-194],[18,-194]], [[-4,-200],[-4,-187]],
  ].entries()){
    const points=[],from=new THREE.Vector3(ends[0][0],CITY_GROUND+.055,ends[0][1]),to=new THREE.Vector3(ends[1][0],CITY_GROUND+.055,ends[1][1]);
    const steps=Math.ceil(from.distanceTo(to)/.35);
    for(let i=0;i<=steps;i++){
      const point=from.clone().lerp(to,i/steps);
      if(surfaces.clearance(point.x,point.z)<.48||blocked(point.x,point.z)){points.length=0;break;}
      points.push(point);
    }
    if(points.length>10)paths.push({curve:new THREE.LineCurve3(points[0],points[points.length-1]),street:`temple-court-${index}`});
  }
  if(!paths.length)throw new Error('No safe sidewalk segments could be generated.');
  return paths;
}
