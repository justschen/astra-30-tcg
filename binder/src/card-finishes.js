import * as THREE from 'three';

const recipes={
  satin:{label:'Satin coating',roughness:.67,metalness:0,iridescence:0,clearcoat:.12,pattern:'none'},
  holo:{label:'Smooth holo',roughness:.4,metalness:.46,iridescence:.68,clearcoat:.14,pattern:'bands'},
  reverse:{label:'Reverse holo',roughness:.4,metalness:.44,iridescence:.64,clearcoat:.16,pattern:'bands'},
  cosmos:{label:'Cosmos holo',roughness:.39,metalness:.5,iridescence:.7,clearcoat:.15,pattern:'cosmos'},
  ex:{label:'Star-layer holo',roughness:.4,metalness:.48,iridescence:.65,clearcoat:.16,pattern:'stars'},
  smooth:{label:'Full-art foil',roughness:.42,metalness:.44,iridescence:.56,clearcoat:.16,pattern:'bands'},
  etched:{label:'Textured foil',roughness:.44,metalness:.5,iridescence:.49,clearcoat:.16,pattern:'etched',relief:.09,anisotropy:.32},
  confetti:{label:'Confetti foil',roughness:.42,metalness:.5,iridescence:.57,clearcoat:.16,pattern:'confetti',relief:.07},
  fireworks:{label:'Starburst foil',roughness:.4,metalness:.46,iridescence:.65,clearcoat:.16,pattern:'fireworks'},
  metallic:{label:'Metallic foil preview',roughness:.39,metalness:.46,iridescence:.12,clearcoat:.18,pattern:'bands'},
};

export const CARD_FINISH_RECIPES=Object.freeze(Object.fromEntries(Object.entries(recipes).map(([key,recipe])=>[key,Object.freeze(recipe)])));

export function resolveCardFinish(card){
  if(!card||typeof card.rarity!=='string'||typeof card.variant!=='string')throw new TypeError('A card finish requires rarity and printing metadata.');
  const variant=card.variant.toLowerCase(),rarity=card.rarity;
  const result=(key,coverage,confidence,reason)=>Object.freeze({
    key,coverage,confidence,reason,label:CARD_FINISH_RECIPES[key].label,
    simulated:true,exactPatternVerified:false,
  });
  if(/\b(non[- ]?holo|non[- ]?foil|plain|normal)\b/.test(variant))return result('satin','none','printing','Explicit non-foil printing.');
  if(/reverse[- ]?holo/.test(variant))return result('reverse','reverse','printing','The printing identifies reverse holo; the coverage mask is approximate.');
  if(/cosmos holo/.test(variant))return result('cosmos','art','printing','The printing identifies Cosmos Holo; this is an original simulated pattern.');
  if(rarity==='Classic Collection')return result('confetti','full','inferred','Community descriptions support confetti foil; this is not a scan of its embossing.');
  if(rarity==='Special Illustration Rare')return result('etched','full','inferred','A subtle textured-foil approximation, not a verified art-specific relief map.');
  if(rarity==='Illustration Rare')return result('smooth','full','inferred','Smooth full-art foil; no raised texture is assumed.');
  if(rarity==='Futuristic Rare')return result('metallic','full','unknown','The exact physical foil and relief are unverified; no raised texture is assumed.');
  if(rarity==='RGB Rare')return result('smooth','full','unknown','The exact physical finish is unverified; no raised texture is assumed.');
  if(rarity==='Pikachu')return result('fireworks','art-border','inferred','Community-described starburst foil, simulated without raised texture.');
  if(rarity==='Double Rare')return result('ex','art-border','inferred','Modern ex-style sheen and star-layer approximation; not an embossing claim.');
  if(variant==='holo')return result(card.category==='energy'?'smooth':'holo',card.category==='energy'?'full':'art-border','printing','The catalog identifies a holo printing; pattern and borders are an approximation for this collection.');
  return result('satin','none','unknown','Rarity or product packaging alone does not identify this printing’s foil treatment.');
}

const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=(low,high,value)=>{const t=clamp((value-low)/(high-low));return t*t*(3-2*t);};
const fract=value=>value-Math.floor(value);
const hash=(x,y)=>fract(Math.sin(x*127.1+y*311.7)*43758.5453);
const rectangle=(u,v,left,bottom,right,top,edge)=>smooth(left,left+edge,u)*(1-smooth(right-edge,right,u))*smooth(bottom,bottom+edge,v)*(1-smooth(top-edge,top,v));

export function cardFoilMask(coverage,u,v){
  const face=rectangle(u,v,.012,.012,.988,.988,.012);
  const art=rectangle(u,v,.075,.445,.925,.835,.017);
  const border=face*(1-rectangle(u,v,.055,.04,.945,.961,.012));
  if(coverage==='none')return 0;
  if(coverage==='art')return art;
  if(coverage==='art-border')return Math.max(art,border*.8);
  if(coverage==='reverse')return face*(1-art)*(.2+.8*smooth(.12,.4,v));
  if(coverage==='full')return face*(.25+.75*smooth(.13,.48,v))*(1-smooth(.86,.96,v)*.42);
  throw new RangeError('Unknown card foil coverage.');
}

function patternAt(pattern,u,v){
  if(pattern==='bands')return .5+.5*Math.sin(u*16+v*9+Math.sin(v*7)*.6);
  if(pattern==='etched')return .5+.5*Math.sin((u*73+Math.sin(v*15)*.9+Math.sin(u*8+v*6)*1.4)*Math.PI*2);
  const cells=pattern==='confetti'?[42,57]:pattern==='cosmos'?[13,19]:[25,35];
  const x=u*cells[0],y=v*cells[1],cx=Math.floor(x),cy=Math.floor(y),seed=hash(cx,cy);
  const dx=fract(x)-.5,dy=fract(y)-.5;
  if(pattern==='confetti')return seed*(.32+.68*rectangle(fract(x),fract(y),.1,.1,.9,.9,.06));
  if(pattern==='cosmos'){
    const r=.12+seed*.25;
    return seed>.37?(1-smooth(r*.6,r,Math.hypot(dx,dy))):0;
  }
  if(pattern==='stars')return seed>.7?Math.max(0,1-Math.abs(dx)*8-Math.abs(dy)*1.8,1-Math.abs(dy)*8-Math.abs(dx)*1.8):0;
  if(pattern==='fireworks'){
    const radius=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
    return seed>.45?(1-smooth(.15,.46,radius))*Math.pow(Math.abs(Math.cos(angle*5)),9):0;
  }
  return .5;
}

function dataTexture(bytes,size,name){
  const texture=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);
  texture.name=name;texture.colorSpace=THREE.NoColorSpace;
  texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.anisotropy=4;texture.needsUpdate=true;
  return texture;
}

function makeFinishMaps(finish){
  const size=256,recipe=CARD_FINISH_RECIPES[finish.key],foil=new Uint8Array(size*size*4),rough=new Uint8Array(size*size*4);
  const normals=recipe.relief?new Uint8Array(size*size*4):null;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=(x+.5)/size,v=(y+.5)/size,at=(y*size+x)*4;
    const mask=cardFoilMask(finish.coverage,u,v),pattern=patternAt(recipe.pattern,u,v);
    foil[at]=Math.round(mask*(.62+pattern*.38)*255);
    foil[at+1]=Math.round((.14+pattern*.72)*255);foil[at+2]=0;foil[at+3]=255;
    rough[at]=rough[at+2]=rough[at+3]=255;
    rough[at+1]=Math.round((1-mask*(.12+pattern*.21))*255);
    if(normals){
      const dx=(patternAt(recipe.pattern,u+1/size,v)-patternAt(recipe.pattern,u-1/size,v))*mask;
      const dy=(patternAt(recipe.pattern,u,v+1/size)-patternAt(recipe.pattern,u,v-1/size))*mask;
      const length=Math.hypot(dx,dy,1);
      normals[at]=Math.round((.5-dx/length*.5)*255);normals[at+1]=Math.round((.5-dy/length*.5)*255);
      normals[at+2]=Math.round((.5+1/length*.5)*255);normals[at+3]=255;
    }
  }
  return {foil:dataTexture(foil,size,`${finish.key} foil mask and thickness`),roughness:dataTexture(rough,size,`${finish.key} microfacet roughness`),
    normal:normals?dataTexture(normals,size,`${finish.key} simulated relief`):null};
}

export class CardFinishLibrary {
  constructor(){this.maps=new Map();this.disposed=false;}
  apply(material,card){
    if(this.disposed)throw new Error('The card finish library has been disposed.');
    if(!material?.isMeshPhysicalMaterial)throw new TypeError('Card finishes require a physical material.');
    const finish=resolveCardFinish(card),recipe=CARD_FINISH_RECIPES[finish.key],key=`${finish.key}:${finish.coverage}`;
    if(finish.coverage!=='none'&&!this.maps.has(key))this.maps.set(key,makeFinishMaps(finish));
    const maps=this.maps.get(key);
    material.roughness=recipe.roughness;material.metalness=recipe.metalness;
    material.clearcoat=recipe.clearcoat;material.clearcoatRoughness=.36;material.specularIntensity=.46;
    material.iridescence=recipe.iridescence;material.iridescenceIOR=1.5;material.iridescenceThicknessRange=[180,540];
    material.iridescenceMap=maps?.foil||null;material.iridescenceThicknessMap=maps?.foil||null;
    material.roughnessMap=maps?.roughness||null;material.normalMap=maps?.normal||null;
    material.normalScale.setScalar(recipe.relief||0);
    material.anisotropy=recipe.anisotropy||0;material.anisotropyRotation=Math.PI/5;
    material.userData.cardFinish=finish;
    material.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',`
        #include <metalnessmap_fragment>
        #ifdef USE_IRIDESCENCEMAP
          float inkLuminance=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
          float foilCoverage=texture2D(iridescenceMap,vIridescenceMapUv).r*smoothstep(.018,.16,inkLuminance);
          metalnessFactor=mix(.015,metalnessFactor,foilCoverage);
        #endif
      `);
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',`
        #include <lights_physical_fragment>
        #ifdef USE_IRIDESCENCE
          float printedInk=smoothstep(.018,.16,dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)));
          material.iridescence*=mix(.16,1.0,printedInk);
        #endif
      `);
    };
    material.customProgramCacheKey=()=> 'afterhours-card-print-finish-v2';
    material.needsUpdate=true;
    return finish;
  }
  dispose(){
    for(const maps of this.maps.values())for(const texture of Object.values(maps))texture?.dispose();
    this.maps.clear();this.disposed=true;
  }
}
