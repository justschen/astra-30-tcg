import * as THREE from 'three';
import { beam, box, roundedBox } from './materials.js';

export const TV = Object.freeze({position:[9.56,1.83,-2.45],width:4.0,height:2.25,yaw:-Math.PI/2});
export const BALCONY_CAMERA = Object.freeze([1,2.5,-8.72]);

export function createRoomExtras(parent,assets){
  const group=new THREE.Group();group.name='Guitar, hi-fi speakers and wall television';parent.add(group);
  const walnut=new THREE.MeshStandardMaterial({map:assets['oak-color'],normalMap:assets['oak-normal'],normalScale:new THREE.Vector2(.1,.1),color:0x83918e,roughness:.88});
  const black=new THREE.MeshStandardMaterial({color:0x172027,roughness:.43,metalness:.2});
  const brass=new THREE.MeshStandardMaterial({color:0xb7a06f,roughness:.36,metalness:.76});
  const guitar=new THREE.Group();guitar.name='Acoustic guitar on a floor stand';
  guitar.position.set(-8.65,-1.35,-3.2);guitar.rotation.set(-.09,.48,-.13);group.add(guitar);
  const outline=new THREE.Shape();
  outline.moveTo(0,0);
  outline.bezierCurveTo(-.65,-.05,-.64,.56,-.38,.78);
  outline.bezierCurveTo(-.15,.96,-.49,1.12,-.28,1.35);
  outline.bezierCurveTo(-.17,1.48,.17,1.48,.28,1.35);
  outline.bezierCurveTo(.49,1.12,.15,.96,.38,.78);
  outline.bezierCurveTo(.64,.56,.65,-.05,0,0);
  const body=new THREE.Mesh(new THREE.ExtrudeGeometry(outline,{depth:.23,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.022,bevelThickness:.025,curveSegments:22}),walnut);
  body.castShadow=true;guitar.add(body);
  const soundhole=new THREE.Mesh(new THREE.CircleGeometry(.145,32),black);soundhole.position.set(0,1.02,.257);guitar.add(soundhole);
  const rosette=new THREE.Mesh(new THREE.RingGeometry(.154,.171,40),brass);rosette.position.copy(soundhole.position).z+=.002;guitar.add(rosette);
  roundedBox(guitar,[.155,1.1,.08],[0,1.86,.16],black,.015);
  roundedBox(guitar,[.23,.34,.09],[0,2.54,.145],walnut,.036);
  box(guitar,[.31,.07,.048],[0,.5,.265],black);
  for(let fret=0;fret<16;fret++)box(guitar,[.158,.009,.006],[0,1.36+fret*.063,.207],brass);
  for(let string=0;string<6;string++){
    const x=(string-2.5)*.02;
    beam(guitar,[x,.48,.292],[x,2.65,.207],.0014,brass,4);
    if(string<3)for(const sign of [-1,1]){
      beam(guitar,[sign*.1,2.44+string*.095,.14],[sign*.17,2.44+string*.095,.14],.012,brass);
      box(guitar,[.04,.045,.035],[sign*.17,2.44+string*.095,.14],brass);
    }
  }
  for(const sign of [-1,1])beam(guitar,[0,.1,-.14],[sign*.45,-.1,.38],.028,black);
  beam(guitar,[0,-.1,-.15],[0,1.38,-.15],.024,black);

  const tvGroup=new THREE.Group();tvGroup.position.set(...TV.position);tvGroup.rotation.y=TV.yaw;group.add(tvGroup);
  roundedBox(tvGroup,[TV.width+.13,TV.height+.13,.17],[0,0,-.025],black,.055);
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(TV.width,TV.height),new THREE.MeshStandardMaterial({
    color:0x0d2028,roughness:.25,metalness:.1,emissive:0x204455,emissiveIntensity:.22,
  }));
  screen.position.z=.071;screen.name='Television display surface';tvGroup.add(screen);
  const status=new THREE.Mesh(new THREE.SphereGeometry(.014,8,6),new THREE.MeshBasicMaterial({color:0x67b7be}));
  status.position.set(TV.width*.43,-TV.height/2-.04,.066);tvGroup.add(status);
  const cabinet=new THREE.Group();cabinet.position.set(8.98,-.79,TV.position[2]);cabinet.rotation.y=TV.yaw;group.add(cabinet);
  roundedBox(cabinet,[5.6,1.34,.85],[0,0,0],walnut,.045);
  for(const x of [-1.84,0,1.84]){
    box(cabinet,[1.73,1.17,.045],[x,0,.448],walnut);
    beam(cabinet,[x-.28,.27,.48],[x+.28,.27,.48],.012,brass);
  }
  for(const sign of [-1,1]){
    const speaker=new THREE.Group();speaker.position.set(9.05,-.22,TV.position[2]+sign*3.20);speaker.rotation.y=TV.yaw;
    speaker.name='Walnut floor-standing speaker';group.add(speaker);
    roundedBox(speaker,[.73,2.6,.64],[0,0,0],walnut,.038);
    box(speaker,[.66,2.5,.02],[0,0,.334],black);
    for(const [y,radius]of [[.83,.105],[.28,.23],[-.45,.23],[-1,.09]]){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.018,8,32),black);ring.position.set(0,y,.36);speaker.add(ring);
      const driver=new THREE.Mesh(new THREE.ConeGeometry(radius*.9,.065,32),new THREE.MeshStandardMaterial({color:0x42494a,roughness:.73,metalness:.14}));
      driver.rotation.x=Math.PI/2;driver.position.set(0,y,.354);speaker.add(driver);
      const dome=new THREE.Mesh(new THREE.SphereGeometry(radius*.29,12,8),black);
      dome.scale.z=.28;dome.position.set(0,y,.397);speaker.add(dome);
    }
    box(speaker,[.8,.045,.76],[0,-1.32,0],black);
  }
  const sideTable=new THREE.Group();sideTable.position.set(-7.9,-.52,.15);group.add(sideTable);
  roundedBox(sideTable,[1.5,.07,1.15],[0,0,0],walnut,.12);
  for(const x of [-.5,.5])for(const z of [-.35,.35])beam(sideTable,[x,-.97,z],[x,0,z],.035,black);
  for(let i=0;i<4;i++)roundedBox(sideTable,[.77,.095,.53],[.06,.085+i*.09,0],i%2?walnut:black,.009).rotation.y=.1-i*.035;
  const records=new THREE.Group();records.name='Framed vinyl record gallery';records.position.set(-9.73,2.25,2.8);records.rotation.y=Math.PI/2;group.add(records);
  for(const [i,x]of [-1.24,0,1.24].entries()){
    roundedBox(records,[1.12,1.3,.075],[x,.1,0],walnut,.025);
    box(records,[1.02,1.2,.015],[x,.1,.047],new THREE.MeshStandardMaterial({color:[0xbaa588,0x859da0,0xb1a59d][i],roughness:.9}));
    const disc=new THREE.Mesh(new THREE.CircleGeometry(.425,48),black);disc.position.set(x,.13,.06);records.add(disc);
    const label=new THREE.Mesh(new THREE.CircleGeometry(.135,24),new THREE.MeshStandardMaterial({color:[0xe0bf77,0x92bbb0,0xc094a5][i],roughness:.73}));
    label.position.set(x,.13,.065);records.add(label);
    for(const radius of [.28,.34,.39]){
      const groove=new THREE.Mesh(new THREE.RingGeometry(radius,radius+.002,48),brass);groove.position.set(x,.13,.067);records.add(groove);
    }
  }
  roundedBox(records,[3.8,.07,.52],[0,-.8,.12],walnut,.012);
  const galleryLight=new THREE.SpotLight(0xffe3bd,5.5,7,.85,.8,2);
  galleryLight.position.set(-8.8,4.25,3.2);galleryLight.target.position.set(-9.72,2.1,3.2);group.add(galleryLight,galleryLight.target);
  return {group,tvScreen:screen};
}

export function createCoffeeSteam(parent){
  const count=40,geometry=new THREE.BufferGeometry(),seed=new Float32Array(count*3);
  for(let i=0;i<count;i++){seed[i*3]=(i*.6180339)%1;seed[i*3+1]=(i*.4142135)%1;seed[i*3+2]=(i*.7320508)%1;}
  geometry.setAttribute('position',new THREE.BufferAttribute(seed,3));
  const material=new THREE.ShaderMaterial({
    uniforms:{steamTime:{value:0},steamViewport:{value:900}},
    transparent:true,depthWrite:false,
    vertexShader:`
      uniform float steamTime;uniform float steamViewport;
      varying float alpha;varying float phase;
      void main(){
        float age=fract(position.x+steamTime*(.105+position.z*.035));
        float sway=sin(age*7.0+position.y*6.283+steamTime*.38);
        vec3 point=vec3((position.y-.5)*.21+sway*age*.15,age*1.02,(position.z-.5)*.18+cos(age*6.0+steamTime*.24)*age*.12);
        vec4 view=modelViewMatrix*vec4(point,1.0);
        gl_Position=projectionMatrix*view;
        gl_PointSize=clamp(steamViewport*(.035+age*.12)/max(1.0,-view.z),1.0,60.0);
        alpha=sin(age*3.14159)*.12;phase=position.y;
      }
    `,
    fragmentShader:`
      varying float alpha;varying float phase;
      void main(){vec2 p=gl_PointCoord-.5;float falloff=exp(-dot(p,p)*18.0);
        float wisps=.78+.22*sin(p.y*12.0+phase*12.0);
        gl_FragColor=vec4(.79,.85,.85,alpha*falloff*wisps);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const steam=new THREE.Points(geometry,material);steam.name='Rising coffee steam';
  steam.position.set(-3.45,1.12,1.76);steam.frustumCulled=false;parent.add(steam);
  return {update(time,height){material.uniforms.steamTime.value=time;material.uniforms.steamViewport.value=height;},root:steam};
}
