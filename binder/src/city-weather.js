import * as THREE from 'three';
import { random } from './materials.js';
import { CITY_GROUND } from './city-layout.js';

export function weatherEnvelope(weather,clouds){
  if(!['clear','rain','fog'].includes(weather)||!Number.isFinite(clouds))throw new RangeError('Invalid city weather.');
  const manual=Math.max(0,Math.min(1,clouds));
  return {clouds:weather==='rain'?Math.max(.94,manual):weather==='fog'?Math.max(.8,manual):manual,
    storm:weather==='rain'?1:weather==='fog'?.55:0,airDensity:weather==='rain'?.0035:weather==='fog'?.0048:.00115};
}

export function createVolumeRain(parent,uniforms){
  const count=3000,rng=random(892114),geometry=new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.5,0,0,.5,0,0,-.5,1,0,.5,0,0,.5,1,0,-.5,1,0],3));
  const seeds=new Float32Array(count*4),details=new Float32Array(count*4);
  for(let i=0;i<count;i++){
    const near=i<1400,depth=near?8+rng()*44:48+rng()*380;
    seeds.set([(rng()-.5)*(near?56:450),-depth,rng(),near?8+rng()*5:13+rng()*10],i*4);
    details.set([near?.12+rng()*.32:.4+rng()*.9,near?.015+rng()*.021:.03+rng()*.035,.22+rng()*.31,(rng()-.5)*.14],i*4);
  }
  geometry.setAttribute('rainSeed',new THREE.InstancedBufferAttribute(seeds,4));
  geometry.setAttribute('rainShape',new THREE.InstancedBufferAttribute(details,4));geometry.instanceCount=count;
  const material=new THREE.ShaderMaterial({
    uniforms:{rainTime:{value:0},cityNight:uniforms.cityNight},
    transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:`
      attribute vec4 rainSeed;attribute vec4 rainShape;
      uniform float rainTime;uniform float cityNight;
      varying float rainAlpha;varying vec2 rainUv;varying float lightLevel;
      void main(){
        float height=${CITY_GROUND.toFixed(1)}+fract(rainSeed.z-rainTime*rainSeed.w/80.0)*80.0;
        float gust=sin(rainTime*.18+rainSeed.z*6.0)*.35;
        vec3 center=vec3(rainSeed.x+gust*(height+24.0)*.06,height,rainSeed.y);
        vec4 view=modelViewMatrix*vec4(center,1.0);
        vec3 direction=vec3(-.17+rainShape.w+gust*.09,1.0,.035);
        view+=(modelViewMatrix*vec4(direction*position.y*rainShape.x,0.0));
        view.x+=position.x*rainShape.y;
        gl_Position=projectionMatrix*view;
        rainUv=vec2(position.x+.5,position.y);
        float nearFade=smoothstep(.5,2.5,-view.z);
        rainAlpha=rainShape.z*nearFade*exp(-max(0.0,-view.z)*.0018);
        lightLevel=.67-cityNight*.16;
      }
    `,
    fragmentShader:`
      varying float rainAlpha;varying vec2 rainUv;varying float lightLevel;
      void main(){
        float line=1.0-smoothstep(.08,.5,abs(rainUv.x-.5));
        float taper=sin(rainUv.y*3.14159265);
        gl_FragColor=vec4(vec3(.7,.82,.91)*lightLevel,rainAlpha*line*taper);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const rain=new THREE.Mesh(geometry,material);rain.frustumCulled=false;rain.name='Depth-distributed windblown rain';parent.add(rain);
  rain.userData.rainCount=count;rain.userData.depthRange=[-428,-8];
  return rain;
}
