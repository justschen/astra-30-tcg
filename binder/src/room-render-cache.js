import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export class RoomRenderCache {
  constructor(renderer) {
    this.enabled = renderer.extensions.has('EXT_color_buffer_float');
    this.hasFrame = false; this.captures = 0;
    if (!this.enabled) return;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, samples: 4,
      depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
    });
    this.target.texture.name = 'Cached room color and coverage';
    this.target.depthTexture.name = 'Cached room surface depth';
    this.surfaceHooks=new WeakMap();
    this.exposure={value:renderer.toneMappingExposure};
    this.material = new THREE.ShaderMaterial({
      name: 'Depth-correct cached room composite',
      uniforms: { roomColor: { value: this.target.texture }, roomDepth: { value: this.target.depthTexture } },
      transparent: true, premultipliedAlpha: true, depthTest: true, depthWrite: true, toneMapped:false,
      vertexShader: `
        varying vec2 roomUv;
        void main() { roomUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }
      `,
      fragmentShader: `
        uniform sampler2D roomColor; uniform sampler2D roomDepth;
        varying vec2 roomUv;
        void main() {
          vec4 color=texture2D(roomColor,roomUv);
          if(color.a<.00001) discard;
          gl_FragDepth=texture2D(roomDepth,roomUv).r;
          gl_FragColor=vec4(color.rgb/max(color.a,.00001),color.a);
          #include <colorspace_fragment>
          #include <premultiplied_alpha_fragment>
        }
      `,
    });
    this.quad = new FullScreenQuad(this.material);
    this.clearColor = new THREE.Color();
  }

  setSize(width, height) {
    if (!this.enabled) return;
    this.target.setSize(width, height); this.hasFrame = false;
  }

  prepareSurfaces(scene){
    const exposure=this.exposure;
    scene.traverse(object=>{
      for(const material of object.material?(Array.isArray(object.material)?object.material:[object.material]):[]){
        if(!material.toneMapped||this.surfaceHooks.get(material)===material.onBeforeCompile)continue;
        const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
        material.onBeforeCompile=function(shader,renderer){
          compile.call(this,shader,renderer);shader.uniforms.cachedRoomExposure=exposure;
          shader.fragmentShader='#ifndef TONE_MAPPING\n'+THREE.ShaderChunk.tonemapping_pars_fragment.replaceAll('toneMappingExposure','cachedRoomExposure')+'\n#endif\n'+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>',`
            #ifdef TONE_MAPPING
              #include <tonemapping_fragment>
            #else
              gl_FragColor.rgb=ACESFilmicToneMapping(gl_FragColor.rgb);
            #endif
          `);
        };
        material.customProgramCacheKey=()=>key+'-cached-display-linear-v1';
        this.surfaceHooks.set(material,material.onBeforeCompile);material.needsUpdate=true;
      }
    });
  }

  async prepare(renderer, scene, camera) {
    const previous = renderer.getRenderTarget();
    let geometry;
    try {
      if (this.enabled) {this.prepareSurfaces(scene);renderer.setRenderTarget(this.target);}
      await renderer.compileAsync(scene, camera);
      if(this.enabled){
        renderer.setRenderTarget(null);
        geometry=new THREE.PlaneGeometry(2,2);
        const composite=new THREE.Scene();composite.add(new THREE.Mesh(geometry,this.material));
        await renderer.compileAsync(composite,new THREE.OrthographicCamera(-1,1,1,-1,0,1));
      }
    } finally { renderer.setRenderTarget(previous);geometry?.dispose(); }
  }

  render(renderer, scene, camera, refresh, glazing) {
    if (!this.enabled) { renderer.render(scene, camera); this.captures++; return; }
    if (refresh || !this.hasFrame) {
      this.prepareSurfaces(scene);this.exposure.value=renderer.toneMappingExposure;
      const previous = renderer.getRenderTarget(), clearAlpha = renderer.getClearAlpha();
      renderer.getClearColor(this.clearColor);
      const materials = [...new Set(glazing.map(mesh => mesh.material))];
      const depthWrites = materials.map(material => material.depthWrite);
      try {
        // Glazing coverage must carry its own depth when composited over the live city.
        materials.forEach(material => { material.depthWrite = true; });
        renderer.setRenderTarget(this.target); renderer.setClearColor(0x000000, 0); renderer.clear();
        renderer.render(scene, camera);
      } finally {
        materials.forEach((material, i) => { material.depthWrite = depthWrites[i]; });
        renderer.setRenderTarget(previous); renderer.setClearColor(this.clearColor, clearAlpha);
      }
      this.hasFrame = true; this.captures++;
    }
    this.quad.render(renderer);
  }

  dispose() {
    if (!this.enabled) return;
    this.target.dispose(); this.target.depthTexture.dispose(); this.material.dispose(); this.quad.dispose();
  }
}
