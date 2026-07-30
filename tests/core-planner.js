const assert = require('assert');
const Core = require('../src/shared/core');

assert.equal(Core.parseCredit('国家级 2.0学分'), 2);
assert.equal(Core.parseCredit('自治区级公需课5分'), 5);
assert.equal(Core.detectCategory('继续医学教育公需课'), 'public');
assert.equal(Core.detectSource('继续医学教育公需课'), '继续教育公需课');
assert.equal(Core.detectSource('全员专项 高血压管理'), '全员专项');

const records = [
  { id: 'public-old', name: '公需进行课', year: 2025, credit: 2, category: 'public', status: 'in_progress', url: '/course?p=1' },
  { id: 'other-earned', name: '已获专业课', year: 2025, credit: 5, category: 'other', status: 'applied' },
  { id: 'other-running', name: '进行中专业课', year: 2025, credit: 3, category: 'other', status: 'in_progress', url: '/course?o=1' }
];
const catalog = [
  { id: 'public-3', name: '公需3分', year: 2025, credit: 3, category: 'public', durationMinutes: 180, status: 'not_started', url: '/catalog?p=3' },
  { id: 'public-5', name: '公需5分', year: 2025, credit: 5, category: 'public', durationMinutes: 300, status: 'not_started', url: '/catalog?p=5' },
  { id: 'other-2', name: '专项2分', year: 2025, credit: 2, category: 'other', source: '全员专项', durationMinutes: 100, status: 'not_started', url: '/catalog?o=2' },
  { id: 'other-4', name: '继教4分', year: 2025, credit: 4, category: 'other', source: '继续教育', durationMinutes: 220, status: 'not_started', url: '/catalog?o=4' },
  { id: 'other-6', name: '专项6分', year: 2025, credit: 6, category: 'other', source: '全员专项', durationMinutes: 260, status: 'not_started', url: '/catalog?o=6' },
  { id: 'other-7', name: '继教7分', year: 2025, credit: 7, category: 'other', source: '继续教育', durationMinutes: 360, status: 'not_started', url: '/catalog?o=7' }
];

const plan = Core.buildAnnualPlan(records, catalog, { year: 2025, publicTarget: 5, otherTarget: 20 });
assert.equal(plan.summary.publicProjected, 2);
assert.equal(plan.summary.otherProjected, 8);
assert.deepEqual(plan.publicSelection.selected.map(item => item.id), ['public-3']);
assert.equal(plan.otherSelection.credit, 12);
assert.equal(plan.projectedPublic, 5);
assert.equal(plan.projectedOther, 20);
assert.equal(plan.satisfied, true);
assert.equal(plan.tasks[0].type, 'resume');
assert(plan.tasks.some(task => task.record.source === '全员专项'));
assert(plan.tasks.some(task => task.record.source === '继续教育'));

const shortage = Core.buildAnnualPlan([], [
  { id: 'only-public', year: 2025, credit: 3, category: 'public', status: 'not_started', url: '/p' }
], { year: 2025, publicTarget: 5, otherTarget: 20 });
assert.equal(shortage.shortages.public, 2);
assert.equal(shortage.shortages.other, 20);
assert.equal(shortage.satisfied, false);

const fastest = Core.chooseOptimalSubset([
  { id: 'slow', credit: 5, durationMinutes: 500, url: '/slow' },
  { id: 'fast-a', credit: 2, durationMinutes: 80, url: '/fast-a' },
  { id: 'fast-b', credit: 3, durationMinutes: 90, url: '/fast-b' }
], 5);
assert.deepEqual(fastest.selected.map(item => item.id), ['fast-a', 'fast-b']);

console.log('共享年度学分规划核心测试通过');
