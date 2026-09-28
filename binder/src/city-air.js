import { CITY_GROUND } from './city-layout.js';

export function airOpticalDepth(distance, eyeHeight, targetHeight, density, falloff = 82) {
  if (![distance, eyeHeight, targetHeight, density, falloff].every(Number.isFinite) || distance < 0 || density < 0 || falloff <= 0) throw new RangeError('Invalid atmospheric path.');
  const a = Math.max(0, eyeHeight) / falloff, b = Math.max(0, targetHeight) / falloff, delta = b - a;
  const mean = Math.abs(delta) < .001 ? Math.exp(-(a + b) / 2) : (Math.exp(-a) - Math.exp(-b)) / delta;
  return distance * density * (.32 + mean * .68);
}

export function applyCityAir(scene, uniforms) {
  const seen = new Set();
  scene.traverse(object => {
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of materials) {
      if (seen.has(material) || material.isShaderMaterial || !material.fog || material.userData.cityAir) continue;
      seen.add(material);
      const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
      material.onBeforeCompile = function(shader, renderer) {
        compile.call(this,shader,renderer);
        Object.assign(shader.uniforms, {
          cityAirDensity:uniforms.cityAirDensity, cityDaylight:uniforms.cityDaylight,
          cityNight:uniforms.cityNight, citySunset:uniforms.citySunset, citySunDirection:uniforms.citySunDirection,
        });
        shader.vertexShader='varying vec3 vCityAirPoint;\n'+shader.vertexShader;
        if(material.isSpriteMaterial){
          shader.vertexShader=shader.vertexShader.replace('void main() {','void main() {\n vCityAirPoint=modelMatrix[3].xyz;');
        }else shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
          vec4 airPoint=vec4(transformed,1.0);
          #ifdef USE_INSTANCING
            airPoint=instanceMatrix*airPoint;
          #endif
          vCityAirPoint=(modelMatrix*airPoint).xyz;
          #include <project_vertex>
        `);
        const declarations=[
          ['float','cityAirDensity'],['float','cityDaylight'],['float','cityNight'],['float','citySunset'],['vec3','citySunDirection'],
        ].filter(([,name])=>!new RegExp('uniform\\s+\\w+\\s+'+name+'\\s*;').test(shader.fragmentShader));
        shader.fragmentShader=declarations.map(([type,name])=>`uniform ${type} ${name};`).join('\n')+'\nvarying vec3 vCityAirPoint;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>','').replace('#include <tonemapping_fragment>',`
          #ifdef USE_FOG
            vec3 airRay=vCityAirPoint-cameraPosition;
            float airDistance=length(airRay);
            float airEye=max(0.0,cameraPosition.y - (${CITY_GROUND.toFixed(1)}))/82.0;
            float airTarget=max(0.0,vCityAirPoint.y - (${CITY_GROUND.toFixed(1)}))/82.0;
            float airDelta=airTarget-airEye;
            float airMean=abs(airDelta)<.001?exp(-(airEye+airTarget)*.5):(exp(-airEye)-exp(-airTarget))/airDelta;
            float opticalDepth=airDistance*cityAirDensity*(.32+airMean*.68);
            vec3 transmission=exp(-opticalDepth*vec3(.83,1.0,1.24));
            vec3 airDirection=airRay/max(.0001,airDistance);
            float sunCos=dot(airDirection,citySunDirection);
            float forwardScatter=.51/pow(max(.08,1.49-1.4*sunCos),1.5);
            vec3 ambientAir=mix(vec3(.018,.033,.055),vec3(.14,.235,.32),cityDaylight);
            float horizonScatter=exp(-abs(airDirection.y)*7.0);
            ambientAir+=vec3(.11,.053,.022)*citySunset*horizonScatter*min(2.0,forwardScatter);
            ambientAir+=vec3(.012,.009,.005)*cityNight*airMean;
            gl_FragColor.rgb=gl_FragColor.rgb*transmission+ambientAir*(vec3(1.0)-transmission);
          #endif
          #include <tonemapping_fragment>
        `);
      };
      material.customProgramCacheKey=()=>`${key}-height-air-v2`;
      material.userData.cityAir=true;
      material.needsUpdate=true;
    }
  });
}
