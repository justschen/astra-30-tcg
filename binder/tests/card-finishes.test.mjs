import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CARDS } from '../src/collection.js';
import { CARD_FINISH_RECIPES, CardFinishLibrary, cardFoilMask, resolveCardFinish } from '../src/card-finishes.js';

const card=(rarity,variant='Holo',category='main')=>({rarity,variant,category});

test('specific rarity and printing treatments are not swallowed by the generic Holo variant',()=>{
  for(const [rarity,key]of [['Common','holo'],['Rare','holo'],['Double Rare','ex'],['Illustration Rare','smooth'],
    ['Special Illustration Rare','etched'],['Classic Collection','confetti'],['Pikachu','fireworks'],['Futuristic Rare','metallic'],['RGB Rare','smooth']]){
    assert.equal(resolveCardFinish(card(rarity)).key,key);
  }
  assert.equal(resolveCardFinish(card('Promo','Cosmos Holo')).key,'cosmos');
  assert.equal(resolveCardFinish(card('Rare','Reverse Holo')).coverage,'reverse');
  assert.equal(resolveCardFinish(card('Rare','Non-holo')).key,'satin');
  assert.equal(resolveCardFinish(card('Energy','Holo','energy')).coverage,'full');
});

test('unknown prints and community-inferred relief cannot be mistaken for verified finish data',()=>{
  for(const rarity of ['RGB Rare','Futuristic Rare']){
    const finish=resolveCardFinish(card(rarity));
    assert.equal(finish.confidence,'unknown');assert.equal(CARD_FINISH_RECIPES[finish.key].relief,undefined);
  }
  const promo=resolveCardFinish(card('Promo','Elite Trainer Box','promos'));
  assert.equal(promo.key,'satin');assert.equal(promo.confidence,'unknown');
  for(const rarity of ['Special Illustration Rare','Classic Collection']){
    const finish=resolveCardFinish(card(rarity));assert.equal(finish.confidence,'inferred');
    assert.equal(finish.exactPatternVerified,false);assert.equal(finish.simulated,true);
  }
  assert.equal(CARD_FINISH_RECIPES[resolveCardFinish(card('Illustration Rare')).key].relief,undefined);
  assert.throws(()=>resolveCardFinish(null),/metadata/);
  for(const source of CARDS){const finish=resolveCardFinish(source);assert.ok(finish.label&&finish.reason);assert.equal(finish.exactPatternVerified,false);}
});

test('standard art and border masks preserve text zones, and reverse coverage excludes the illustration',()=>{
  assert.ok(cardFoilMask('art-border',.5,.68)>.9);
  assert.ok(cardFoilMask('art-border',.025,.5)>.2);
  assert.equal(cardFoilMask('art-border',.5,.3),0);
  assert.equal(cardFoilMask('art',.025,.5),0);
  assert.equal(cardFoilMask('reverse',.5,.68),0);
  assert.ok(cardFoilMask('reverse',.5,.36)>.5);
  assert.ok(cardFoilMask('full',.5,.07)<cardFoilMask('full',.5,.6)*.4);
  assert.equal(cardFoilMask('none',.5,.5),0);
  assert.throws(()=>cardFoilMask('invalid',.5,.5),/coverage/);
});

test('finish maps are shared, mipmapped non-color data and never recolor the original artwork',()=>{
  const library=new CardFinishLibrary(),image=new THREE.Texture();
  const first=new THREE.MeshPhysicalMaterial({map:image,color:0x9dacb8}),second=first.clone(),color=first.color.clone();
  library.apply(first,card('Special Illustration Rare'));library.apply(second,card('Special Illustration Rare'));
  assert.equal(first.iridescenceMap,second.iridescenceMap);assert.equal(first.iridescenceMap,first.iridescenceThicknessMap);
  assert.equal(first.normalMap,second.normalMap);assert.equal(library.maps.size,1);
  assert.equal(first.map,image);assert.ok(first.color.equals(color));
  for(const texture of [first.iridescenceMap,first.roughnessMap,first.normalMap]){
    assert.equal(texture.colorSpace,THREE.NoColorSpace);assert.equal(texture.generateMipmaps,true);
    assert.equal(texture.minFilter,THREE.LinearMipmapLinearFilter);assert.equal(texture.image.width,256);
  }
  const recipe=first.userData.cardFinish;
  assert.equal(recipe.key,'etched');assert.ok(first.iridescence>0&&first.anisotropy>0);
  let disposed=0;first.iridescenceMap.addEventListener('dispose',()=>{disposed++});
  first.dispose();second.dispose();assert.equal(disposed,0,'Releasing one material must not destroy another card’s shared finish');
  library.dispose();assert.equal(disposed,1);assert.equal(library.maps.size,0);
  assert.throws(()=>library.apply(new THREE.MeshPhysicalMaterial(),card('Rare')),/disposed/);
  image.dispose();
});

test('switching rarity clears incompatible relief and optical maps rather than retaining the previous finish',()=>{
  const library=new CardFinishLibrary(),material=new THREE.MeshPhysicalMaterial(),sourceMap=new THREE.Texture();material.map=sourceMap;
  library.apply(material,card('Special Illustration Rare'));assert.ok(material.normalMap);
  library.apply(material,card('Illustration Rare'));assert.equal(material.normalMap,null);assert.equal(material.anisotropy,0);
  library.apply(material,card('Promo','First Partner Series 1','promos'));
  assert.equal(material.iridescence,0);assert.equal(material.iridescenceMap,null);assert.equal(material.roughnessMap,null);assert.equal(material.normalMap,null);
  assert.equal(material.map,sourceMap);
  const shader={fragmentShader:'#include <lights_physical_fragment>'};material.onBeforeCompile(shader);
  assert.ok(shader.fragmentShader.includes('printedInk'));assert.ok(!shader.fragmentShader.includes('time'));
  assert.throws(()=>library.apply(new THREE.MeshBasicMaterial(),card('Rare')),/physical material/);
  material.dispose();sourceMap.dispose();library.dispose();
});
