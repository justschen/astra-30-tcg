import * as THREE from 'three';
import { CARD_BY_ID, cardImage } from './collection.js';
import { canvasTexture } from './materials.js';
import { CardFinishLibrary } from './card-finishes.js';

export const ADMIRE_ROTATION_SPEED=.008;
export const ADMIRE_PITCH_LIMIT=Math.PI/3;

export class CardAdmiration {
  constructor(scene,invalidate,onError,finishes=null){
    this.root=new THREE.Group();this.root.name='Card held up for upright inspection';this.root.visible=false;scene.add(this.root);
    this.card=new THREE.Group();this.root.add(this.card);this.id=null;this.serial=0;this.disposed=false;this.invalidate=invalidate;this.onError=onError;
    this.euler=new THREE.Euler(0,0,0,'YXZ');
    this.finishes=finishes||new CardFinishLibrary();this.ownsFinishes=!finishes;
    const width=1.25,height=width*88/63;
    const edge=new THREE.Mesh(new THREE.BoxGeometry(width,height,.012),new THREE.MeshStandardMaterial({color:0xd9d4bd,roughness:.74}));
    this.card.add(edge);
    this.front=new THREE.Mesh(new THREE.PlaneGeometry(width*.994,height*.994),new THREE.MeshPhysicalMaterial({
      color:0xffffff,roughness:.58,metalness:.015,clearcoat:.15,clearcoatRoughness:.32,specularIntensity:.42,
    }));this.front.position.z=.007;this.card.add(this.front);
    const reverse=canvasTexture(512,716,(ctx,w,h)=>{
      ctx.fillStyle='#1d3039';ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='#bda97c';ctx.lineWidth=3;ctx.strokeRect(27,27,w-54,h-54);ctx.lineWidth=1;ctx.strokeRect(36,36,w-72,h-72);
      ctx.fillStyle='#d9c498';ctx.textAlign='center';ctx.font='600 35px Manrope,sans-serif';ctx.fillText('afterhours.',w/2,h*.48);
      ctx.font='14px Manrope,sans-serif';ctx.fillText('ARCHIVE SLEEVE',w/2,h*.54);ctx.fillText('YOUR COLLECTION. YOUR CORNER.',w/2,h*.85);
    });
    const back=new THREE.Mesh(this.front.geometry,new THREE.MeshStandardMaterial({map:reverse,roughness:.71,metalness:.04}));
    back.position.z=-.007;back.rotation.y=Math.PI;this.card.add(back);
    this.light=new THREE.PointLight(0xfff3db,2.2,7,2);this.light.position.set(-.7,1.4,1.4);this.root.add(this.light);
    this.map=null;
  }
  show(id){
    const card=CARD_BY_ID.get(id);
    if(!card)throw new RangeError('The admired card is not in the collection.');
    const sequence=++this.serial;this.id=id;this.root.visible=true;
    const finish=this.finishes.apply(this.front.material,card);
    this.map?.dispose();this.map=null;this.front.material.map=null;this.front.material.needsUpdate=true;this.reset();
    if(!card.image){this.onError('This card has no artwork available to admire.');return finish;}
    new THREE.TextureLoader().load(cardImage(card,true),texture=>{
      if(this.disposed||sequence!==this.serial){texture.dispose();return;}
      texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;this.map=texture;
      this.front.material.map=texture;this.front.material.needsUpdate=true;this.invalidate();
    },undefined,()=>{
      if(sequence===this.serial&&!this.disposed)this.onError(`Artwork for ${card.name} could not load for admiration.`);
    });
    return finish;
  }
  rotate(dx,dy){
    if(!this.id)return;
    if(!Number.isFinite(dx)||!Number.isFinite(dy))throw new RangeError('Admire rotation deltas must be finite numbers.');
    const yaw=THREE.MathUtils.euclideanModulo(this.euler.y+dx*ADMIRE_ROTATION_SPEED+Math.PI,Math.PI*2)-Math.PI;
    const pitch=THREE.MathUtils.clamp(this.euler.x+dy*ADMIRE_ROTATION_SPEED,-ADMIRE_PITCH_LIMIT,ADMIRE_PITCH_LIMIT);
    // YXZ with zero roll keeps camera-relative up.y = cos(pitch), regardless of yaw.
    this.euler.set(pitch,yaw,0,'YXZ');
    this.card.quaternion.setFromEuler(this.euler);this.invalidate();
  }
  flip(){this.rotate(Math.PI/ADMIRE_ROTATION_SPEED,0);}
  reset(){this.euler.set(0,0,0,'YXZ');this.card.quaternion.identity();this.invalidate();}
  hide(){this.id=null;this.serial++;this.root.visible=false;this.map?.dispose();this.map=null;this.front.material.map=null;this.front.material.needsUpdate=true;this.invalidate();}
  update(camera){
    if(!this.id)return;
    const distance=Math.max(3,1.08/(Math.tan(camera.fov*Math.PI/360)*Math.min(1,camera.aspect)));
    this.root.position.set(0,.24,-distance).applyQuaternion(camera.quaternion).add(camera.position);
    this.root.quaternion.copy(camera.quaternion);
  }
  dispose(){
    this.disposed=true;this.hide();
    const geometries=new Set(),materials=new Set();
    this.root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)materials.add(object.material)});
    geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>{material.map?.dispose();material.dispose()});
    if(this.ownsFinishes)this.finishes.dispose();
    this.root.removeFromParent();
  }
}
