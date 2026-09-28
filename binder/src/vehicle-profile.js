export const VEHICLE_KINDS=['sedan','compact','taxi','van','box-truck','motorcycle'];
export function vehicleProfile(index){
  let seed=(Math.imul(index+19,1103515245)+12345)>>>0;
  const unit=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const choice=unit(),kind=choice<.32?'sedan':choice<.54?'compact':choice<.65?'taxi':choice<.82?'van':choice<.94?'box-truck':'motorcycle';
  const dimensions={
    sedan:[.43,.17,.96,.35,.15,.48],
    compact:[.40,.19,.77,.33,.17,.43],
    taxi:[.44,.19,1.04,.36,.17,.55],
    van:[.47,.23,1.2,.41,.3,.84],
    'box-truck':[.52,.21,1.69,.45,.3,.52],
    motorcycle:[.16,.15,.66,.14,.10,.25],
  }[kind];
  const palette=[0xe7e7de,0x25333c,0xc0c8c7,0x676f76,0x35515c,0x862f2f,0xadb4a6,0xd3bd82];
  return {kind,width:dimensions[0]+.06,bodyWidth:dimensions[0],height:dimensions[1],length:dimensions[2],cabWidth:dimensions[3],cabHeight:dimensions[4],cabLength:dimensions[5],
    color:kind==='taxi'?0xd9b954:palette[Math.floor(unit()*palette.length)],seed:unit(),
    speedFactor:.69+unit()*.51,followGap:.22+unit()*.33,laneOffset:(unit()-.5)*.14};
}
