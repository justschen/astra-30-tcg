import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { pathToFileURL } from 'node:url';
import { STORAGE_KEY } from '../src/collection.js';

export async function checkMobileUX(browser,origin,shots,label='chromium'){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await context.addInitScript(()=>{
    const getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:getContext.call(this,type,...args)};
    const viewport=new EventTarget();
    Object.assign(viewport,{height:innerHeight,offsetTop:0,scale:1});
    Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
    window.testViewport=(height,offsetTop=0,scale=1)=>{Object.assign(viewport,{height,offsetTop,scale});viewport.dispatchEvent(new Event('resize'))};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const rects=()=>page.evaluate(()=>{
    const bag=document.querySelector('#bag-dialog'),close=bag.querySelector('[data-close]'),search=document.querySelector('#card-search');
    return {bag:bag.getBoundingClientRect().toJSON(),close:close.getBoundingClientRect().toJSON(),search:search.getBoundingClientRect().toJSON(),overflow:bag.scrollWidth>bag.clientWidth+1,canvas:[document.querySelector('canvas').width,document.querySelector('canvas').height]};
  });
  try{
    await page.goto(origin);await page.waitForFunction(()=>document.documentElement.dataset.ready);await page.locator('#scene-loading').waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.documentElement.dataset.saveState==='saved');
    const original=await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY);
    assert.ok(!/maximum-scale|user-scalable\s*=\s*(no|0)/i.test(await page.locator('meta[name="viewport"]').getAttribute('content')));
    for(const width of [320,375,390,430,768,844]){
      await page.setViewportSize({width,height:width===844?390:844});await page.evaluate(()=>window.testViewport(innerHeight));await page.mouse.move(3,3);await page.waitForTimeout(50);
      const controls=await page.locator('.room-actions button').evaluateAll(buttons=>buttons.map(button=>{
        const r=button.getBoundingClientRect(),style=getComputedStyle(button);
        return {width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bg:style.backgroundColor,border:style.borderColor,filter:style.backdropFilter};
      }));
      assert.equal(controls.length,5);assert.ok(controls.every(r=>r.width>=44&&Math.abs(r.width-r.height)<.1&&r.left>=0&&r.right<=width));
      assert.ok(controls.every(r=>Math.abs(r.top-controls[0].top)<.1));
      assert.equal(new Set(controls.map(r=>`${r.bg}/${r.border}/${r.filter}`)).size,1,'Eye and room controls must share the same surface');
    }
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.testViewport(innerHeight));await page.locator('#bag-open').tap();
    assert.notEqual(await page.evaluate(()=>document.activeElement.id),'card-search','Opening a bag on touch must not summon the keyboard');
    assert.equal(await page.locator('#card-search').getAttribute('autofocus'),null);
    assert.equal(await page.locator('#bag-filters').getAttribute('open'),null);
    assert.equal((await page.locator('#card-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns)).split(' ').length,2);
    assert.ok((await rects()).bag.bottom<=844);
    const fonts=await page.locator('input[type="search"],select').evaluateAll(elements=>elements.map(element=>parseFloat(getComputedStyle(element).fontSize)));
    assert.ok(fonts.every(size=>size>=16),'Every mobile editable field must meet the iOS no-auto-zoom font threshold');
    await page.locator('#bag-filters summary').tap();await page.locator('#sort-filter').selectOption('name');
    await page.locator('#bag-filters summary').tap();
    await page.screenshot({path:new URL(`mobile-${label}-bag.png`,shots).pathname});
    const dimensions=(await rects()).canvas;
    await page.locator('#card-search').tap();await page.locator('#card-search').fill('Pikachu');
    await page.evaluate(()=>window.testViewport(410,12));await page.waitForFunction(()=>document.documentElement.dataset.keyboardOpen==='true');
    const typing=await rects();
    assert.ok(typing.bag.top>=12&&typing.bag.bottom<=422&&typing.close.bottom<=422&&typing.search.bottom<=422);
    assert.equal(typing.overflow,false);assert.deepEqual(typing.canvas,dimensions,'Keyboard layout changes must not resize the 3D canvas');
    assert.equal(await page.locator('#card-grid').evaluate(el=>getComputedStyle(el).display),'block');
    assert.equal(await page.locator('#search-done').isVisible(),true);
    await page.locator('.card-inspect-button').first().tap();await page.locator('[data-close="inspect-dialog"]').tap();await page.waitForTimeout(70);
    const returned=await page.locator('.card-inspect-button').first().boundingBox(),header=await page.locator('.bag-header').boundingBox();
    assert.ok(returned.y>=header.y+header.height&&returned.y+returned.height<=422,'Returning from inspection must keep the originating card visible even when the keyboard footer is hidden');
    await page.locator('.collection-card').first().tap();
    assert.equal(await page.locator('#hand-cards li').count(),1);
    assert.equal(await page.locator('#card-grid').evaluate(el=>getComputedStyle(el).display),'block','A card tap must not rearrange rows while the keyboard is still visible');
    const selected=await page.locator('#hand-cards li').first().getAttribute('data-hand-id');
    await page.locator('#card-search').tap();await page.evaluate(()=>window.testViewport(410,12));await page.waitForTimeout(40);
    await page.screenshot({path:new URL(`mobile-${label}-keyboard.png`,shots).pathname});
    const place=await page.locator('#bag-place').boundingBox();assert.ok(place.y>=12&&place.y+place.height<=422);
    await page.locator('#bag-dialog').evaluate(el=>el.scrollTop=250);await page.waitForTimeout(60);
    const scrolled=await rects();assert.ok(scrolled.close.top>=12&&scrolled.close.bottom<=422&&scrolled.search.top>=12);
    const beforeZoom=await page.locator('html').evaluate(el=>el.style.getPropertyValue('--dialog-viewport-height'));
    await page.evaluate(()=>window.testViewport(205,20,2));await page.waitForTimeout(60);
    assert.equal(await page.locator('html').evaluate(el=>el.style.getPropertyValue('--dialog-viewport-height')),beforeZoom);
    await page.evaluate(()=>window.testViewport(410,12));await page.locator('#search-done').tap();await page.evaluate(()=>window.testViewport(844));await page.waitForTimeout(80);
    assert.equal(await page.locator('#card-search').inputValue(),'Pikachu');assert.equal(await page.locator('#sort-filter').inputValue(),'name');
    assert.equal(await page.locator('#hand-cards li').first().getAttribute('data-hand-id'),selected);
    const inspect=page.locator('.card-inspect-button').nth(5);await inspect.scrollIntoViewIfNeeded();await inspect.tap();
    assert.equal(await page.locator('#inspect-dialog').isVisible(),true);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.locator('#inspection-card').dispatchEvent('pointermove',{pointerType:'touch',clientX:10,clientY:10});
    assert.equal(await page.locator('#inspection-card').evaluate(el=>el.style.getPropertyValue('--tilt-x')),'');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('#inspect-dialog').evaluate(el=>el.scrollTop=el.scrollHeight/2);
    const inspector=await page.locator('#inspect-dialog').boundingBox(),inspectorClose=await page.locator('[data-close="inspect-dialog"]').boundingBox();
    assert.ok(inspectorClose.y>=inspector.y&&inspectorClose.y+inspectorClose.height<=inspector.y+inspector.height,'Inspection close control must remain reachable after scrolling');
    await page.locator('[data-close="inspect-dialog"]').tap();await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.inspectId),await inspect.getAttribute('data-inspect-id'));
    await page.locator('#card-search').tap();await page.locator('#card-search').fill('no-matching-card-xyz');await page.evaluate(()=>window.testViewport(410));await page.waitForTimeout(70);
    assert.equal(await page.locator('#bag-empty').isVisible(),true);
    await page.locator('#card-search').press('Enter');await page.evaluate(()=>window.testViewport(844));await page.locator('#clear-filters').tap();
    await page.addStyleTag({content:'html{font-size:32px}'});
    await page.locator('#bag-dialog').evaluate(el=>el.scrollTop=0);await page.waitForTimeout(50);
    assert.equal((await rects()).overflow,false,'Larger text must wrap without widening the bag');
    assert.ok(parseFloat(await page.locator('#card-search').evaluate(el=>getComputedStyle(el).fontSize))>=32);
    await page.screenshot({path:new URL(`mobile-${label}-large-text.png`,shots).pathname});
    await page.addStyleTag({content:'html{font-size:16px}'});
    await page.setViewportSize({width:844,height:390});await page.evaluate(()=>window.testViewport(innerHeight));await page.waitForTimeout(70);
    assert.ok((await rects()).bag.bottom<=390);assert.equal((await rects()).overflow,false);
    await page.locator('[data-close="bag-dialog"]').tap();
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY),original,'Searching, keyboard changes and inspecting cannot move saved cards');
    assert.deepEqual(errors,[]);
    console.log(`PASS (${label}): mobile no-zoom input sizing, round matching controls, keyboard bounds, single-scroll bag and preserved search/hand/inspection state`);
  }finally{await context.close()}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  for(const [label,type]of [['chromium',chromium],['webkit',webkit]]){
    const browser=await type.launch({headless:true,...(label==='chromium'?{args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']}: {})});
    try{await checkMobileUX(browser,process.env.BINDER_URL||'http://127.0.0.1:4173',new URL('../../shots/binder/',import.meta.url),label)}finally{await browser.close()}
  }
}
