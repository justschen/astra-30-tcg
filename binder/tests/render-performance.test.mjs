import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { markBufferChanged, writeUprightInstance, writeWheelInstance } from '../src/instance-transforms.js';
import { freezeStaticTransforms } from '../src/materials.js';

test('direct instance writes preserve the original vehicle, pedestrian and wheel transforms',()=>{
  const body=new Float32Array(16*3),wheel=new Float32Array(16*3),dummy=new THREE.Object3D();
  body.fill(97);wheel.fill(83);
  for(let i=0;i<100;i++){
    const angle=i*Math.PI/37,fx=Math.sin(angle),fz=Math.cos(angle),scale=.8+i%7*.04,depth=.88+i%4*.1;
    const x=i*3.12-140,y=-24+.16,z=-12-i*7.19;
    dummy.position.set(x,y,z);dummy.rotation.set(0,angle,0);dummy.scale.set(scale,scale,scale*depth);dummy.updateMatrix();
    writeUprightInstance(body,1,x,y,z,fx,fz,scale,depth);
    const expected=new Float32Array(dummy.matrix.elements);
    expected.forEach((value,index)=>assert.ok(Math.abs(body[16+index]-value)<.000002,`Upright transform ${i}/${index}`));
    dummy.scale.set(1,1,1);dummy.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2));dummy.updateMatrix();
    writeWheelInstance(wheel,1,x,y,z,fx,fz);
    new Float32Array(dummy.matrix.elements).forEach((value,index)=>assert.ok(Math.abs(wheel[16+index]-value)<.000002,`Wheel transform ${i}/${index}`));
  }
  assert.ok(body.slice(0,16).every(value=>value===97)&&body.slice(32).every(value=>value===97));
  assert.ok(wheel.slice(0,16).every(value=>value===83)&&wheel.slice(32).every(value=>value===83));
});

test('GPU buffer uploads cover only active components and do not accumulate dirty ranges',()=>{
  const attribute=new THREE.BufferAttribute(new Float32Array(768*16),16);
  markBufferChanged(attribute,576*16);assert.deepEqual(attribute.updateRanges,[{start:0,count:576*16}]);
  markBufferChanged(attribute,768*16);assert.deepEqual(attribute.updateRanges,[{start:0,count:768*16}]);
  const version=attribute.version;markBufferChanged(attribute,0);
  assert.equal(attribute.version,version);assert.deepEqual(attribute.updateRanges,[]);
});

test('freezing static local transforms preserves geometry and still allows moving lights',()=>{
  const root=new THREE.Group(),child=new THREE.Group(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial();
  root.position.set(2,-24,-70);child.rotation.y=.32;
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(4,8,-3);child.add(mesh);root.add(child);
  const light=new THREE.PointLight();light.position.set(1,4,2);root.add(light);
  root.updateMatrixWorld(true);const before=mesh.matrixWorld.clone();
  freezeStaticTransforms(root);
  assert.equal(root.matrixAutoUpdate,false);assert.equal(child.matrixAutoUpdate,false);assert.equal(mesh.matrixAutoUpdate,false);
  assert.equal(light.matrixAutoUpdate,true);assert.deepEqual(mesh.matrixWorld.elements,before.elements);
  light.position.y+=5;root.updateMatrixWorld();
  assert.equal(new THREE.Vector3().setFromMatrixPosition(light.matrixWorld).y,-15);
  assert.deepEqual(mesh.matrixWorld.elements,before.elements);
  geometry.dispose();material.dispose();
});
