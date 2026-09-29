import assert from 'node:assert/strict';
import sharp from 'sharp';
import { GRAPHICS_KEY } from '../src/render-quality.js';
import { STORAGE_KEY } from '../src/collection.js';

export async function checkGraphicsControls(browser, origin, shots) {
  const context=await browser.newContext({viewport:{width:1440,height:830},deviceScaleFactor:2});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const ready=async()=>{
    await page.goto(origin);await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',null,{timeout:120000});
    await page.locator('#scene-loading').waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.documentElement.dataset.saveState==='saved');
    await page.waitForTimeout(400);
  };
  const size=()=>page.locator('#room-canvas').evaluate(canvas=>({width:canvas.width,height:canvas.height}));
  try{
    await ready();
    const saved=await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY);
    assert.equal(await page.locator('#graphics-quality').inputValue(),'auto');
    const fixed=await size();assert.ok(fixed.width*fixed.height<=1400000);
    await page.locator('#help-open').click();await page.locator('#city-motion-toggle').click();
    await page.locator('[data-close="help-dialog"]').click();await page.waitForTimeout(500);
    await page.evaluate(()=>{
      const canvas=document.querySelector('#room-canvas');
      window.renderSizeChanges=[];
      const observer=new MutationObserver(()=>window.renderSizeChanges.push([canvas.width,canvas.height]));
      observer.observe(canvas,{attributes:true,attributeFilter:['width','height']});
    });
    await page.locator('#hud-toggle').click();
    await page.mouse.move(1110,365);await page.mouse.down();await page.mouse.move(1080,380,{steps:8});
    assert.deepEqual(await size(),fixed,'Dragging must not switch rendering density');
    await page.mouse.up();await page.waitForTimeout(1900);
    assert.deepEqual(await size(),fixed,'Stopping must not silently restore a different density');
    await page.screenshot({path:new URL('graphics-balanced-retina.png',shots).pathname});
    await page.locator('#hud-toggle').click();await page.locator('#binder-view').click();await page.waitForTimeout(1900);
    const before=await page.locator('#room-canvas').screenshot();
    await page.locator('.pocket-hotspot[data-slot="9"]').click();await page.locator('.pocket-hotspot[data-slot="17"]').click();
    await page.waitForFunction(()=>document.documentElement.dataset.saveState==='saved');await page.waitForTimeout(450);
    const after=await page.locator('#room-canvas').screenshot(),metadata=await sharp(before).metadata();
    const area={left:Math.round(metadata.width*.27),top:0,width:Math.round(metadata.width*.5),height:Math.round(metadata.height*.31)};
    const a=await sharp(before).extract(area).removeAlpha().raw().toBuffer(),b=await sharp(after).extract(area).removeAlpha().raw().toBuffer();
    let changed=0;
    for(let i=0;i<a.length;i+=3)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>9)changed++;
    assert.ok(changed/(a.length/3)<.0001,'Placing a card must not re-shade or resample the background');
    assert.deepEqual(await size(),fixed);
    assert.ok((await page.evaluate(()=>window.renderSizeChanges)).every(([width,height])=>width===fixed.width&&height===fixed.height),'Render dimensions must remain fixed across drag, settling and placement');
    await page.locator('#undo-action').click();await page.waitForFunction(()=>document.documentElement.dataset.saveState==='saved');
    await page.locator('#help-open').click();
    await page.locator('#graphics-quality').selectOption('detail');
    await page.waitForTimeout(350);
    assert.deepEqual(await size(),{width:2376,height:1369});
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),GRAPHICS_KEY),'detail');
    await ready();
    assert.equal(await page.locator('#graphics-quality').inputValue(),'detail');
    assert.deepEqual(await size(),{width:2376,height:1369});
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY),saved,'Graphics changes must never mutate the collection');
    await page.locator('#help-open').click();
    await page.evaluate(key=>{
      const set=Storage.prototype.setItem;
      Storage.prototype.setItem=function(name,value){if(name===key)throw new DOMException('Test preference quota','QuotaExceededError');return set.call(this,name,value)};
    },GRAPHICS_KEY);
    await page.locator('#graphics-quality').selectOption('smooth');await page.waitForTimeout(250);
    const smooth=await size();assert.ok(smooth.width*smooth.height<=900000);
    assert.ok((await page.locator('#help-dialog .dialog-notice').textContent()).includes('could not save the preference'));
    assert.equal(await page.locator('html').getAttribute('data-save-state'),'saved');
    await page.setViewportSize({width:390,height:844});
    const control=await page.locator('#graphics-quality').boundingBox();
    assert.ok(control.x>=0&&control.x+control.width<=390&&control.height>=44,'Graphics controls must remain accessible on narrow screens');
    assert.deepEqual(errors,[]);
    console.log('PASS: background shading and resolution stay stable through dragging and placement; graphics modes persist safely and remain accessible');
  } finally {await context.close()}
}
