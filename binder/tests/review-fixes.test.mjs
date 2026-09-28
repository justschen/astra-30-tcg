import test from 'node:test';
import assert from 'node:assert/strict';
import { RefreshBudget } from '../src/refresh-budget.js';
import { PlotIndex } from '../src/city-infill.js';
import { NearestItems } from '../src/nearest-items.js';

test('lighting probes update at most four times a second and never lose the final slider state', () => {
  const budget = new RefreshBudget(), captures = [];
  for (let now = 0; now <= 1200; now += 16) {
    if (now < 900) budget.request();
    if (budget.due(now)) { captures.push(now); budget.complete(now); }
  }
  assert.ok(captures.length <= 5); assert.ok(captures.at(-1) >= 900);
  assert.equal(budget.pending, false);
  budget.request(); assert.equal(budget.due(captures.at(-1) + 249), false); assert.equal(budget.due(captures.at(-1) + 250), true);
});

test('indexed footprint checks match full-list occupancy for the same boundaries and margins', () => {
  const plots = Array.from({ length: 1000 }, (_, i) => ({ x: Math.sin(i * 1.91) * 150, z: -10 - (i % 80) * 3.1, width: 1 + i % 7, depth: 2 + i % 5 }));
  const index = new PlotIndex(plots);
  for (let i = 0; i < 3000; i++) {
    const x = Math.cos(i * 2.21) * 155, z = -i % 260, margin = i % 3 * .13;
    const expected = plots.some(plot => Math.abs(x - plot.x) < plot.width / 2 + margin && Math.abs(z - plot.z) < plot.depth / 2 + margin);
    assert.equal(index.occupied({ x, z, width: 0, depth: 0 }, margin), expected);
  }
});

test('bounded nearest-item selection matches stable full sorting, including ties and density changes', () => {
  const population=Array.from({length:768},(_,id)=>({id,x:Math.sin(id*1.19)*170,z:Math.cos(id*.73)*170}));
  for(const limit of [1,16,32]){
    const selected=new NearestItems(limit),storage=selected.items;
    for(const count of [0,1,12,768,192,576,0])for(let pose=0;pose<12;pose++){
      const distance=item=>(item.x-pose*3)**2+(item.z+pose*7)**2;
      selected.reset();for(let i=0;i<count;i++)selected.offer(population[i],distance(population[i]));
      const expected=population.slice(0,count).sort((a,b)=>distance(a)-distance(b)).slice(0,limit);
      assert.deepEqual(selected.items,expected);assert.equal(selected.items,storage,'The hot path must reuse its result array');
    }
    selected.reset();for(let i=0;i<100;i++)selected.offer(i,1);
    assert.deepEqual(selected.items,Array.from({length:limit},(_,i)=>i),'Equal-distance lights retain their original stable order');
  }
  assert.throws(()=>new NearestItems(0),RangeError);
});
