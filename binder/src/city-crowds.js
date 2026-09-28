export const PEDESTRIAN_COUNT = 512;

export function createPedestrianAgents(routes,count=PEDESTRIAN_COUNT){
  if(!routes.length||!Number.isInteger(count)||count<0)throw new RangeError('Pedestrians require safe routes and a valid count.');
  const paths=routes.map(route=>{
    const length=route.curve.getLength();
    if(!Number.isFinite(length)||length<=0)throw new RangeError('Pedestrian routes must have positive length.');
    const steps=Math.max(8,Math.ceil(length/.35));
    return {...route,length,points:Array.from({length:steps+1},(_,i)=>route.curve.getPointAt(i/steps)),
      tangents:Array.from({length:steps+1},(_,i)=>route.curve.getTangentAt(i/steps))};
  });
  const total=paths.reduce((sum,path)=>sum+path.length,0);
  const agents=[];
  for(let index=0;index<count;index++){
    let at=(index+.5)/count*total,path=paths[0];
    for(const candidate of paths){path=candidate;if(at<=candidate.length)break;at-=candidate.length;}
    agents.push({index,path,offset:((index*.61803398875)%1)*path.length*2,
      speed:.22+(index*17%31)/180,scale:.9+(index%13)/65});
  }
  return agents;
}

export function samplePedestrian(agent,time,point,tangent){
  const {path}=agent;
  const phase=((agent.offset+time*agent.speed)%(path.length*2)+path.length*2)%(path.length*2);
  const direction=phase<path.length?1:-1,progress=direction>0?phase/path.length:2-phase/path.length;
  const at=progress*(path.points.length-1),index=Math.min(path.points.length-2,Math.floor(at)),blend=at-index;
  point.lerpVectors(path.points[index],path.points[index+1],blend);
  tangent.lerpVectors(path.tangents[index],path.tangents[index+1],blend).normalize();
  point.x-=tangent.z*direction*.105;point.z+=tangent.x*direction*.105;
  tangent.multiplyScalar(direction);
  return point;
}
