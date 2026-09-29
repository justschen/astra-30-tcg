import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export class CityLightPass {
  constructor(renderer, onWarning = () => {}) {
    this.hasFrame=false;
    this.enabled = renderer.extensions.has('EXT_color_buffer_float');
    if (!this.enabled) {
      console.warn('HDR city lighting is unavailable; using standard city rendering.');
      onWarning('This device uses standard city lighting because HDR rendering is unavailable.');
      return;
    }
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
      samples: 4,
    });
    this.target.texture.name = 'HDR city color';
    this.target.depthTexture.name = 'City geometry depth';
    this.bloom = new UnrealBloomPass(new THREE.Vector2(64,64), .34, .28, .82);
    this.bloom.compositeMaterial.uniforms.bloomFactors.value=[1,.72,.38,.14,.05];
    this.bloomQuad = new FullScreenQuad(this.bloom.materialHighPassFilter);
    this.material = new THREE.ShaderMaterial({
      name: 'Tone-mapped city with original geometry depth',
      uniforms: {
        cityColor: { value: this.target.texture }, cityDepth: { value: this.target.depthTexture },
        cityBloom: { value: this.bloom.renderTargetsHorizontal[0].texture },
        cityProjectionInverse: { value: new THREE.Matrix4() }, cityViewport: { value: new THREE.Vector2(1, 1) },
      },
      depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth, blending: THREE.NoBlending,
      vertexShader: `
        varying vec2 cityUv;
        void main() { cityUv = uv; gl_Position = vec4(position.xy,0.0,1.0); }
      `,
      fragmentShader: `
        uniform sampler2D cityColor;
        uniform sampler2D cityDepth;
        uniform sampler2D cityBloom;
        uniform mat4 cityProjectionInverse;
        uniform vec2 cityViewport;
        varying vec2 cityUv;
        vec3 cityViewPosition(vec2 uv, float depth) {
          vec4 view = cityProjectionInverse * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
          return view.xyz / view.w;
        }
        float cityContact(vec3 position, vec3 normal) {
          float radius = .9;
          float pixelRadius = clamp(radius * cityViewport.y / max(1.0, -position.z), 2.0, 24.0);
          float occlusion = 0.0;
          for (int i = 0; i < 12; i++) {
            float angle = float(i) * 2.399963;
            float distance = sqrt((float(i) + .5) / 12.0);
            vec2 sampleUv = cityUv + vec2(cos(angle), sin(angle)) * pixelRadius * distance / cityViewport;
            float depth = texture2D(cityDepth, sampleUv).r;
            vec3 delta = cityViewPosition(sampleUv, depth) - position;
            float deltaLength = max(.0001, length(delta));
            float hemisphere = max(0.0, dot(normal, delta / deltaLength) - .075);
            occlusion += hemisphere * (1.0 - smoothstep(radius * .25, radius, deltaLength));
          }
          return 1.0 - clamp(occlusion / 12.0 * 1.7, 0.0, .34);
        }
        void main() {
          vec4 surface=texture2D(cityColor,cityUv);
          float depth = texture2D(cityDepth,cityUv).r;
          // The full-resolution room supplies its own depth, not the scaled exterior mask.
          if(surface.a<.001 && depth<.999999) {
            gl_FragColor=vec4(0.0,0.0,0.0,1.0);gl_FragDepth=1.0;return;
          }
          vec3 hdr=surface.rgb+texture2D(cityBloom,cityUv).rgb;
          vec3 position = cityViewPosition(cityUv,depth);
          vec3 dx = dFdx(position), dy = dFdy(position);
          vec3 normal = normalize(cross(dx,dy));
          if (depth < .999999 && max(length(dx),length(dy)) < .85) {
            float contact = cityContact(position,normal);
            hdr *= mix(contact,1.0,smoothstep(.6,2.0,max(max(hdr.r,hdr.g),hdr.b)));
          }
          gl_FragColor = vec4(hdr,1.0);
          gl_FragDepth = surface.a<.999 ? 1.0 : depth;
          #include <tonemapping_fragment>
          float sourcePeak=max(max(hdr.r,hdr.g),hdr.b);
          float mappedPeak=max(max(gl_FragColor.r,gl_FragColor.g),gl_FragColor.b);
          vec3 chromatic=hdr/max(.00001,sourcePeak)*mappedPeak;
          gl_FragColor.rgb=mix(gl_FragColor.rgb,chromatic,smoothstep(.6,2.0,sourcePeak)*.24);
          #include <colorspace_fragment>
        }
      `,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setSize(width, height) {
    if (!this.enabled) return;
    this.hasFrame=false;
    this.target.setSize(width,height);
    this.material.uniforms.cityViewport.value.set(width,height);
    const scale = Math.min(1,1024 / width);
    this.bloom.setSize(Math.round(width*scale),Math.round(height*scale));
  }

  async prepare(renderer,scene,camera) {
    if(!this.enabled){await renderer.compileAsync(scene,camera);return;}
    const previous=renderer.getRenderTarget();
    const geometry=new THREE.PlaneGeometry(2,2),view=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    try {
      renderer.setRenderTarget(this.target);
      await renderer.compileAsync(scene,camera);
      const filters=new THREE.Scene();
      for(const material of [this.bloom.materialHighPassFilter,...this.bloom.separableBlurMaterials,this.bloom.compositeMaterial]){
        filters.add(new THREE.Mesh(geometry,material));
      }
      await renderer.compileAsync(filters,view);
      renderer.setRenderTarget(null);
      const output=new THREE.Scene();output.add(new THREE.Mesh(geometry,this.material));
      await renderer.compileAsync(output,view);
    } finally {
      renderer.setRenderTarget(previous);
      geometry.dispose();
    }
  }

  renderBloom(renderer) {
    const bloom=this.bloom,quad=this.bloomQuad;
    bloom.highPassUniforms.tDiffuse.value=this.target.texture;
    bloom.highPassUniforms.luminosityThreshold.value=bloom.threshold;
    quad.material=bloom.materialHighPassFilter;
    renderer.setRenderTarget(bloom.renderTargetBright);quad.render(renderer);
    let input=bloom.renderTargetBright;
    for(let i=0;i<bloom.nMips;i++){
      const material=bloom.separableBlurMaterials[i];quad.material=material;
      material.uniforms.colorTexture.value=input.texture;
      material.uniforms.direction.value=UnrealBloomPass.BlurDirectionX;
      renderer.setRenderTarget(bloom.renderTargetsHorizontal[i]);quad.render(renderer);
      material.uniforms.colorTexture.value=bloom.renderTargetsHorizontal[i].texture;
      material.uniforms.direction.value=UnrealBloomPass.BlurDirectionY;
      renderer.setRenderTarget(bloom.renderTargetsVertical[i]);quad.render(renderer);
      input=bloom.renderTargetsVertical[i];
    }
    quad.material=bloom.compositeMaterial;
    bloom.compositeMaterial.uniforms.bloomStrength.value=bloom.strength;
    bloom.compositeMaterial.uniforms.bloomRadius.value=bloom.radius;
    renderer.setRenderTarget(bloom.renderTargetsHorizontal[0]);quad.render(renderer);
  }

  render(renderer, scene, camera, night, refresh=true, occluders=null) {
    if (!this.enabled) {
      renderer.clear();
      renderer.render(scene,camera);
      return;
    }
    const autoClear = renderer.autoClear;
    this.material.uniforms.cityProjectionInverse.value.copy(camera.projectionMatrixInverse);
    renderer.autoClear = false;
    if(refresh||!this.hasFrame){
      renderer.setRenderTarget(this.target);
      const clearAlpha=renderer.getClearAlpha();
      renderer.setClearAlpha(0);
      renderer.clear();
      if (occluders) {
        const shadows = renderer.shadowMap.needsUpdate;
        renderer.render(occluders, camera);
        renderer.shadowMap.needsUpdate = shadows;
      }
      renderer.render(scene,camera);
      renderer.setClearAlpha(clearAlpha);
      this.bloom.strength = .18 + night * .25;
      // Blend in the final composite instead of writing back into the MSAA target.
      this.renderBloom(renderer);
      this.hasFrame=true;
    }
    renderer.setRenderTarget(null);
    renderer.clear();
    // Restore the city's depth, not just its color, before drawing the foreground room.
    this.quad.render(renderer);
    renderer.autoClear = autoClear;
  }

  dispose() {
    if (!this.enabled) return;
    this.target.dispose();
    this.target.depthTexture.dispose();
    this.bloom.dispose();
    this.bloomQuad.dispose();
    this.bloom.materialHighPassFilter.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
