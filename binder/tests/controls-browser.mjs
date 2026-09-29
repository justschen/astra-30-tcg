import assert from 'node:assert/strict';
import sharp from 'sharp';
import { STORAGE_KEY } from '../src/collection.js';
const LEGACY_PREFERENCES_KEY='afterhours.preferences.v1';

const ready = async (page, origin) => {
  await page.goto(origin);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', null, { timeout: 60000 });
  await page.locator('#scene-loading').waitFor({ state: 'hidden' });
};
const idle = page => page.locator('#app').getAttribute('data-ui-idle');
const layout = async page => {
  await page.waitForFunction(() => document.documentElement.dataset.saveState !== 'saving');
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
};

export async function checkRoomControls(browser, origin, shots) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date() });
  try {
    await ready(page, origin);
    const originalLayout = await layout(page);
    const center = () => page.locator('.pocket-hotspot[data-slot="9"]').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    assert.equal(await page.locator('#time-preset').isVisible(),true);
    assert.deepEqual(await page.locator('#time-preset option:not(:disabled)').allTextContents(),['Dawn','Day','Dusk','After dark']);
    assert.equal(await page.locator('#time-preset').inputValue(),'after-dark');
    assert.equal(await page.locator('#city-time').inputValue(),'22');
    assert.equal(await page.locator('#city-time-label').textContent(),'22:00');
    assert.equal(await page.locator('html').getAttribute('data-weather'),'clear');
    assert.equal(await page.locator('#weather-toggle').getAttribute('aria-label'),'Weather: Clear. Switch to rain.');
    await page.locator('#city-view').click();await page.waitForTimeout(1200);
    await page.locator('#help-open').click();
    await page.locator('#city-motion-toggle').click();
    await page.locator('[data-close="help-dialog"]').click();
    let dayBrightness,nightBrightness;
    for(const [preset,hour,label] of [['dawn','6.25','06:15'],['day','12','12:00'],['dusk','17.75','17:45'],['after-dark','22','22:00']]){
      await page.locator('#time-preset').selectOption(preset);
      assert.equal(await page.locator('#help-dialog').isVisible(),false,'Main time controls must work without opening Settings');
      assert.equal(await page.locator('#city-time').inputValue(),hour);
      assert.equal(await page.locator('#city-time-label').textContent(),label);
      assert.equal(await page.locator(`.time-presets [data-time="${hour}"]`).getAttribute('aria-pressed'),'true');
      if(preset==='day'||preset==='after-dark'){
        await page.waitForTimeout(450);
        const stats=await sharp(await page.screenshot()).extract({left:0,top:170,width:1440,height:480}).stats();
        const brightness=stats.channels.slice(0,3).reduce((sum,channel)=>sum+channel.mean,0)/3;
        if(preset==='day')dayBrightness=brightness;else nightBrightness=brightness;
      }
    }
    assert.ok(dayBrightness>nightBrightness+10,'The main-view presets must visibly relight the world, not just change labels');
    await page.locator('#time-preset').focus();await page.keyboard.type('day');await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#time-preset').inputValue(),'day');
    assert.deepEqual(await layout(page),originalLayout,'Using the native selector must not turn pages or change the collection');
    await page.locator('#help-open').click();
    await page.locator('#city-time').fill('13.5');
    assert.equal(await page.locator('#time-preset').inputValue(),'custom');
    assert.equal(await page.locator('#time-preset option:checked').textContent(),'13:30');
    await page.locator('.time-presets [data-time="17.75"]').click();
    assert.equal(await page.locator('#time-preset').inputValue(),'dusk');
    await page.locator('#city-motion-toggle').click();
    await page.locator('[data-close="help-dialog"]').click();
    for(const width of [320,390,768,1024,1100,1280,1281,1440]){
      await page.setViewportSize({width,height:900});await page.mouse.move(4+width%7,8);
      await page.waitForTimeout(120);
      const header=await page.evaluate(()=>{
        const time=document.getElementById('time-preset'),rect=time.getBoundingClientRect();
        const onTop=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)?.closest('#time-preset')===time;
        const controls=[document.querySelector('.time-picker'),document.querySelector('.view-nav'),document.querySelector('.top-actions')].map(element=>element.getBoundingClientRect());
        const overlaps=controls.some((a,i)=>controls.slice(i+1).some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top));
        return {onTop,overlaps,inside:rect.left>=0&&rect.right<=innerWidth};
      });
      assert.equal(header.onTop,true,`Time selector must be clickable at ${width}px`);
      assert.equal(header.overlaps,false,`Header controls must not overlap at ${width}px`);
      assert.equal(header.inside,true);
    }
    await page.screenshot({path:new URL('main-time-controls.png',shots).pathname});
    await page.locator('#binder-view').click();await page.waitForTimeout(1200);
    console.log('PASS: visible main-view time presets relight the city, support keyboard control, stay synchronized and fit phones/tablets/desktops');
    await page.locator('#help-open').click();
    assert.equal(await page.locator('#invert-drag').count(),0);
    await page.locator('[data-close="help-dialog"]').click();
    for(const legacy of ['{"version":1,"invertDrag":false}','{"version":1,"invertDrag":true}','obsolete invalid preferences']){
      await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key:LEGACY_PREFERENCES_KEY,value:legacy});
      await ready(page,origin);
      for(const dy of [35,-35]){
        await page.locator('#binder-view').click();await page.waitForTimeout(1000);
        const before=await center();
        await page.mouse.move(720,190);await page.mouse.down();
        await page.mouse.move(720,190+dy,{steps:10});await page.mouse.up();await page.waitForTimeout(1000);
        const after=await center();
        assert.ok(dy>0?after.y-before.y>15:after.y-before.y<-15,'Vertical dragging must follow the fixed requested direction');
      }
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),LEGACY_PREFERENCES_KEY),legacy);
    }
    for (const dx of [55, -55]) {
      await page.locator('#binder-view').click();
      await page.waitForTimeout(1300);
      const before = await center();
      await page.mouse.move(720, 120); await page.mouse.down();
      await page.mouse.move(720 + dx, 120, { steps: 10 }); await page.mouse.up();
      await page.waitForTimeout(1100);
      const after = await center();
      assert.ok(dx > 0 ? after.x-before.x > 30 : after.x-before.x < -30, 'Horizontal scene movement must follow the pointer');
    }
    assert.deepEqual(await layout(page), originalLayout);
    await page.locator('#binder-view').click();await page.waitForTimeout(1100);
    console.log('PASS: horizontal scene movement follows dragging, vertical look is unchanged, and obsolete invert preferences are ignored');

    for (const index of [9, 10]) await page.locator(`.pocket-hotspot[data-slot="${index}"]`).click();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.mouse.move(720, 125);
    await page.clock.fastForward(9999);
    assert.equal(await idle(page), 'false', 'HUD must not hide before ten seconds');
    await page.clock.runFor(1);
    assert.equal(await idle(page), 'true');
    await page.clock.runFor(400); await page.waitForTimeout(350);
    for (const selector of ['.topbar', '.top-actions', '.collection-summary', '#save-status']) {
      assert.equal(await page.locator(selector).evaluate(element => getComputedStyle(element).opacity), '0', `${selector} must fade out`);
    }
    assert.equal(await page.locator('#weather-toggle').evaluate(element => {
      const rect=element.getBoundingClientRect();
      return document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)?.closest('button')===element;
    }), false, 'Faded room controls must not retain invisible pointer targets');
    assert.equal(await page.locator('#hud-toggle').evaluate(element => getComputedStyle(element).opacity), '1');
    assert.equal(await page.locator('.table-controls').evaluate(element => getComputedStyle(element).opacity), '1');
    assert.equal(await page.locator('#hand-tray').isVisible(), true);
    assert.equal(await page.locator('#hand-cards li').count(), 2);
    await page.screenshot({ path: new URL('idle-with-hand.png', shots).pathname });
    await page.keyboard.press('Shift');
    assert.equal(await idle(page), 'false', 'Keyboard activity wakes the HUD');
    await page.clock.fastForward(10000);
    assert.equal(await idle(page), 'true');
    await page.mouse.move(722, 125);
    assert.equal(await idle(page), 'false', 'Pointer movement wakes the HUD');
    await page.clock.fastForward(7000);
    await page.mouse.wheel(0, 1);
    await page.clock.fastForward(9999);
    assert.equal(await idle(page), 'false', 'Wheel input restarts the entire timeout');
    await page.clock.runFor(1);
    assert.equal(await idle(page), 'true');
    console.log('PASS: exact ten-second idle deadline, requested fade targets, input reset and persistent hand/toolbar');

    await page.keyboard.press('Tab');
    await page.locator('#help-open').focus();
    assert.equal(await page.locator('#help-open').evaluate(element => element.matches(':focus-visible')), true);
    await page.clock.fastForward(20000);
    assert.equal(await idle(page), 'false', 'A keyboard-focused HUD control must remain visible');
    await page.keyboard.press('Enter');
    await page.clock.fastForward(20000);
    assert.equal(await page.locator('#help-dialog').isVisible(), true);
    assert.equal(await idle(page), 'false', 'Settings must not fade while the dialog is open');
    await page.locator('[data-close="help-dialog"]').click();
    await page.mouse.click(720, 125);
    await page.clock.fastForward(10000);
    assert.equal(await idle(page), 'true');
    assert.deepEqual(errors, []);
    console.log('PASS: keyboard focus and open settings stay accessible during inactivity');
  } finally {
    await context.close();
  }

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const mobile = await mobileContext.newPage();
  await mobile.clock.install({ time: new Date() });
  try {
    await ready(mobile, origin);
    const before = await layout(mobile);
    await mobile.clock.pauseAt(new Date(Date.now() + 1000));
    await mobile.touchscreen.tap(190, 145);
    await mobile.clock.fastForward(10000);
    assert.equal(await idle(mobile), 'true');
    assert.equal(await mobile.locator('.topbar').evaluate(element => getComputedStyle(element).opacity), '0');
    await mobile.touchscreen.tap(190, 145);
    assert.equal(await idle(mobile), 'false');
    assert.deepEqual(await layout(mobile), before);
    console.log('PASS: touch wake-up and reduced-motion idle behavior preserve the collection');
  } finally {
    await mobileContext.close();
  }

}
