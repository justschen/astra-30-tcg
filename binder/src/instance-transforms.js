export function writeUprightInstance(buffer,index,x,y,z,forwardX,forwardZ,scale=1,depthScale=1){
  const offset=index*16;
  buffer[offset]=forwardZ*scale;buffer[offset+1]=0;buffer[offset+2]=-forwardX*scale;buffer[offset+3]=0;
  buffer[offset+4]=0;buffer[offset+5]=scale;buffer[offset+6]=0;buffer[offset+7]=0;
  buffer[offset+8]=forwardX*scale*depthScale;buffer[offset+9]=0;buffer[offset+10]=forwardZ*scale*depthScale;buffer[offset+11]=0;
  buffer[offset+12]=x;buffer[offset+13]=y;buffer[offset+14]=z;buffer[offset+15]=1;
}

export function writeWheelInstance(buffer,index,x,y,z,forwardX,forwardZ){
  const offset=index*16;
  buffer[offset]=0;buffer[offset+1]=1;buffer[offset+2]=0;buffer[offset+3]=0;
  buffer[offset+4]=-forwardZ;buffer[offset+5]=0;buffer[offset+6]=forwardX;buffer[offset+7]=0;
  buffer[offset+8]=forwardX;buffer[offset+9]=0;buffer[offset+10]=forwardZ;buffer[offset+11]=0;
  buffer[offset+12]=x;buffer[offset+13]=y;buffer[offset+14]=z;buffer[offset+15]=1;
}

export function writeVehicleInstance(buffer,index,x,y,z,forwardX,forwardZ,width,height,length){
  const offset=index*16;
  buffer[offset]=forwardZ*width;buffer[offset+1]=0;buffer[offset+2]=-forwardX*width;buffer[offset+3]=0;
  buffer[offset+4]=0;buffer[offset+5]=height;buffer[offset+6]=0;buffer[offset+7]=0;
  buffer[offset+8]=forwardX*length;buffer[offset+9]=0;buffer[offset+10]=forwardZ*length;buffer[offset+11]=0;
  buffer[offset+12]=x;buffer[offset+13]=y;buffer[offset+14]=z;buffer[offset+15]=1;
}
export function markBufferChanged(attribute,count){
  attribute.clearUpdateRanges();
  if(!count)return;
  attribute.addUpdateRange(0,count);
  attribute.needsUpdate=true;
}
