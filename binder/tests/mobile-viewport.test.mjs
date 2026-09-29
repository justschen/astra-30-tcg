import test from 'node:test';
import assert from 'node:assert/strict';
import { dialogViewport, installMobileViewport } from '../src/mobile-viewport.js';

test('dialog bounds follow the visible keyboard viewport without magnifying or exceeding the layout',()=>{
  assert.deepEqual(dialogViewport(844,410,18,1,true),{height:410,top:18,keyboard:true});
  assert.deepEqual(dialogViewport(844,844,0,1,true),{height:844,top:0,keyboard:false});
  assert.deepEqual(dialogViewport(844,2100,0,1,false),{height:844,top:0,keyboard:false});
  assert.deepEqual(dialogViewport(844,410,0,1,false),{height:410,top:0,keyboard:false});
  assert.deepEqual(dialogViewport(844,410,0,1,false,true),{height:410,top:0,keyboard:true},'Blur during a card tap must not rearrange the results before the keyboard actually closes');
  assert.equal(dialogViewport(844,422,0,2,true),null,'User-controlled pinch zoom must not cause a compensating layout resize');
  assert.equal(dialogViewport(844,828,0,1.02,true),null);
  assert.throws(()=>dialogViewport(0,410,0,1,true),RangeError);
});

test('viewport updates coalesce, preserve zoom and remove their listeners on cleanup',()=>{
  const viewport=new EventTarget();Object.assign(viewport,{height:844,offsetTop:0,scale:1});
  const win=new EventTarget(),doc=new EventTarget(),jobs=new Map(),values=new Map();let next=0,editing=false;
  Object.assign(win,{innerHeight:844,visualViewport:viewport,requestAnimationFrame:callback=>{jobs.set(++next,callback);return next},cancelAnimationFrame:id=>jobs.delete(id)});
  doc.documentElement={style:{setProperty:(key,value)=>values.set(key,value)},dataset:{}};
  doc.activeElement={matches:()=>editing};
  const flush=()=>{for(const [id,callback]of [...jobs]){jobs.delete(id);callback()}};
  const dispose=installMobileViewport(win,doc);
  assert.equal(values.get('--dialog-viewport-height'),'844px');
  editing=true;viewport.height=390;doc.dispatchEvent(new Event('focusin'));viewport.dispatchEvent(new Event('resize'));viewport.dispatchEvent(new Event('scroll'));
  assert.equal(jobs.size,1);flush();
  assert.equal(values.get('--dialog-viewport-height'),'390px');assert.equal(doc.documentElement.dataset.keyboardOpen,'true');
  viewport.scale=2;viewport.height=195;viewport.dispatchEvent(new Event('resize'));flush();
  assert.equal(values.get('--dialog-viewport-height'),'390px');
  viewport.scale=1;editing=false;viewport.height=844;doc.dispatchEvent(new Event('focusout'));flush();
  assert.equal(doc.documentElement.dataset.keyboardOpen,'false');
  viewport.dispatchEvent(new Event('resize'));dispose();assert.equal(jobs.size,0);
  viewport.dispatchEvent(new Event('resize'));doc.dispatchEvent(new Event('focusin'));assert.equal(jobs.size,0);
});
