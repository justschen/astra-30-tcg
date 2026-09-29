import assert from 'node:assert/strict';
import sharp from 'sharp';
import { STORAGE_KEY } from '../src/collection.js';

export async function checkImmersionUI(browser,origin,shots){
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text().slice(0,1200))});
  let tvRequests=0;
  await page.route('https://www.youtube-nocookie.com/embed/**',route=>{
    tvRequests++;
    return route.fulfill({contentType:'text/html',body:`<!doctype html><html><body style="margin:0;background:#164c59;color:white">
      <p>Supported YouTube player test fixture</p><script>
      window.commands=[];
      addEventListener('message',event=>{let data;try{data=JSON.parse(event.data)}catch{return}
        if(data.func)window.commands.push(data.func);
        if(data.func==='playVideo')parent.postMessage(JSON.stringify({event:'onStateChange',info:1}),'${origin}');
        if(data.func==='pauseVideo')parent.postMessage(JSON.stringify({event:'onStateChange',info:2}),'${origin}');
      });</script></body></html>`});
  });
  const state=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),STORAGE_KEY);
  try{
    await page.goto(origin);await page.waitForFunction(()=>document.documentElement.dataset.ready,null,{timeout:90000});
    assert.equal(await page.locator('html').getAttribute('data-ready'),'true',errors.join('\n'));
    await page.locator('#scene-loading').waitFor({state:'hidden'});const original=await state();
    assert.equal(tvRequests,0,'YouTube must not be contacted before the user activates the TV');
    await page.locator('#bag-open').click();
    const bag=await page.locator('#bag-dialog').boundingBox();
    assert.ok(bag.width>1100&&Math.abs(bag.x+bag.width/2-720)<2,'Bag must be a wide centered collection modal');
    await page.locator('#card-grid img').first().waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('#card-grid img')].slice(0,7).every(image=>image.complete&&image.naturalWidth>0));
    await page.screenshot({path:new URL('immersion-wide-bag.png',shots).pathname});
    await page.locator('.collection-card').nth(0).click();await page.locator('.collection-card').nth(1).click();
    const picked=await page.locator('#hand-cards li').evaluateAll(items=>items.map(item=>item.dataset.handId));
    await page.locator('#bag-place').click();await page.locator('#hand-admire').click();
    await page.waitForTimeout(400);assert.equal(await page.locator('#app').getAttribute('data-admiring'),'true');
    const before=await page.screenshot();
    await page.mouse.move(700,280);await page.mouse.down();await page.mouse.move(1090,580,{steps:20});await page.mouse.up();
    await page.locator('#admire-flip').click();await page.locator('#admire-tilt-up').click();await page.keyboard.press('ArrowUp');
    assert.deepEqual(await state(),original,'Admiring, rotating and flipping must not turn pages or move saved cards');
    const after=await page.screenshot();
    assert.notDeepEqual(await sharp(before).resize(240).raw().toBuffer(),await sharp(after).resize(240).raw().toBuffer());
    await page.locator('#hud-toggle').click();
    assert.equal(await page.locator('#app').getAttribute('data-hud-hidden'),'true');
    assert.equal(await page.locator('#admire-controls').isVisible(),false);
    assert.equal(await page.locator('#hud-toggle').isVisible(),true);
    assert.equal(await page.locator('.room-coordinate').isVisible(),true);
    assert.equal(await page.locator('#hand-tray').isVisible(),true);
    assert.deepEqual(await page.locator('#hand-cards li').evaluateAll(items=>items.map(item=>item.dataset.handId)),picked);
    assert.equal(await page.locator('.topbar').evaluate(element=>element.inert),true);
    assert.equal(await page.locator('.top-actions').evaluate(element=>element.inert),true);
    await page.mouse.move(700,320);await page.mouse.down();await page.mouse.move(1000,400,{steps:10});await page.mouse.up();
    await page.screenshot({path:new URL('immersion-hidden-admired-card.png',shots).pathname});
    await page.keyboard.press('h');await page.locator('#admire-reset').click();
    await page.locator('#admire-done').click();assert.equal(await page.locator('#app').getAttribute('data-admiring'),null);
    assert.equal(await page.locator('#hand-cards li').count(),2);
    await page.locator('#hand-admire').click();
    await page.locator('#help-open').click();await page.keyboard.press('ArrowRight');await page.keyboard.press('Escape');
    assert.equal(await page.locator('#help-dialog').isVisible(),false,'Native modal Escape must take priority over admiration shortcuts');
    assert.equal(await page.locator('#app').getAttribute('data-admiring'),'true');
    await page.keyboard.press('Escape');
    await page.locator('#hand-cards button').nth(1).dblclick();await page.locator('#admire-card').click();
    assert.ok((await page.locator('#admire-name').innerText()).includes('Alolan Exeggutor'));
    await page.keyboard.press('Escape');assert.equal(await page.locator('#hand-cards li').count(),2);
    await page.locator('#help-open').click();await page.locator('#tv-view').click();await page.waitForTimeout(1500);
    await page.locator('#tv-play').click();
    const frame=await(await page.locator('#tv-player iframe').elementHandle()).contentFrame();
    await frame.waitForFunction(()=>Array.isArray(window.commands));
    await page.locator('#help-open').click();await page.locator('#tv-power').click();await page.locator('[data-close="help-dialog"]').click();
    await frame.evaluate(origin=>{
      parent.postMessage(JSON.stringify({event:'onReady'}),origin);
      parent.postMessage(JSON.stringify({event:'onStateChange',info:1}),origin);
    },origin);
    await frame.waitForFunction(()=>window.commands.includes('pauseVideo'));
    assert.equal(await page.locator('#tv-cover').isVisible(),true,'Late iframe readiness must not turn a paused TV back on');
    assert.equal(await page.locator('#tv-power').getAttribute('aria-pressed'),'false');
    await page.locator('#tv-play').click();
    await page.waitForFunction(()=>document.getElementById('tv-cover').hidden);
    assert.equal(tvRequests,1);
    const src=await page.locator('#tv-player iframe').getAttribute('src');
    assert.ok(src.startsWith('https://www.youtube-nocookie.com/embed/kuctuTR_cEM?')&&src.includes('mute=1'));
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
    await frame.evaluate(origin=>{window.commands=[];parent.postMessage(JSON.stringify({event:'onReady'}),origin)},origin);
    await frame.waitForFunction(()=>window.commands.includes('pauseVideo'));
    assert.equal(await frame.evaluate(()=>window.commands.includes('playVideo')),false,'A late player-ready message must never start playback in a hidden tab');
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});
    await page.waitForFunction(()=>document.getElementById('tv-cover').hidden);
    await page.screenshot({path:new URL('immersion-room-tv.png',shots).pathname});
    await page.locator('#help-open').click();await page.locator('#tv-power').click();await page.locator('[data-close="help-dialog"]').click();
    assert.equal(await page.locator('#tv-cover').isVisible(),true);
    await frame.evaluate(origin=>parent.postMessage(JSON.stringify({event:'onError',info:150}),origin),origin);
    await page.waitForFunction(()=>document.getElementById('tv-status').textContent.includes('cannot play'));
    assert.ok((await page.locator('#tv-status').innerText()).includes('cannot play'));
    assert.equal(await page.locator('#tv-retry').isVisible(),true,'Blocked embeds need an explicit recoverable error');
    await page.locator('#room-view').click();await page.waitForTimeout(1400);
    assert.equal(await page.locator('#tv-surface').evaluate(element=>element.inert),true,'The off-screen TV must not retain invisible keyboard-focus targets');
    for(const width of [320,390,768,1100,1232,1280,1440,1920]){
      await page.setViewportSize({width,height:900});await page.mouse.move(4,4);await page.waitForTimeout(130);
      const eye=await page.locator('#hud-toggle').boundingBox();assert.ok(eye.x>=0&&eye.x+eye.width<=width);
      const controls=await page.evaluate(()=>[...document.querySelectorAll('.top-actions button,#time-preset,#hud-toggle')].map(element=>{
        const r=element.getBoundingClientRect();return {id:element.id,top:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button,select')===element};
      }));
      assert.ok(controls.every(control=>control.top),`Header hit targets overlap at ${width}: ${JSON.stringify(controls)}`);
      const buttons=await page.locator('.room-actions button').evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().toJSON()));
      assert.ok(buttons.every(rect=>Math.abs(rect.y-buttons[0].y)<.5&&rect.width===buttons[0].width&&rect.height===buttons[0].height),`All five controls must share a baseline and dimensions at ${width}`);
      assert.ok(buttons.every(rect=>rect.width===rect.height),`Header buttons must be circular rather than squeezed into ovals at ${width}`);
      if(width<=767)assert.ok(buttons.every(rect=>rect.width>=44),`Phone header controls need full touch targets at ${width}`);
      const surfaces=await page.locator('.room-actions button').evaluateAll(elements=>elements.map(element=>{
        const style=getComputedStyle(element);return [style.backgroundColor,style.borderColor,style.backdropFilter].join('/');
      }));
      assert.equal(new Set(surfaces).size,1,`The eye must share the other controls' surface styling at ${width}`);
      const gaps=buttons.slice(1).map((rect,i)=>rect.x-buttons[i].right);
      assert.ok(Math.max(...gaps)-Math.min(...gaps)<.5,`The eye button must use the same spacing at ${width}`);
    }
    await page.setViewportSize({width:390,height:844});await page.locator('#bag-open').click();
    const mobileBag=await page.locator('#bag-dialog').boundingBox();assert.ok(mobileBag.x>=0&&mobileBag.x+mobileBag.width<=390);
    await page.locator('[data-close="bag-dialog"]').click();
    assert.deepEqual(await state(),original);
    assert.deepEqual(errors,[]);
    console.log('PASS: wide bag, upright admire/flip controls, persistent hidden-HUD hand, supported TV playback/error recovery and responsive eye controls');
  }finally{await context.close()}
}
