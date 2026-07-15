// ============================================
// Tests — cooking timeline builder
// ============================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline } from '../../src/services/nisse/engine/timeline.js';

const step = (id, dur, deps = [], branch = 'base', active = null) => ({
  id, text: `Steg ${id} text`, voiceCue: `Steg ${id} röst`,
  durationMin: dur, dependsOn: deps, branch,
  ...(active != null && { activeMin: active }),
});

test('steps are scheduled after their dependencies', () => {
  const tl = buildTimeline([step('s1', 5), step('s2', 5, ['s1']), step('s3', 5, ['s2'])]);
  const byId = Object.fromEntries(tl.steps.map((s) => [s.id, s]));
  assert.equal(byId.s1.startMin, 0);
  assert.equal(byId.s2.startMin, 5);
  assert.equal(byId.s3.startMin, 10);
  assert.equal(tl.totalMin, 15);
});

test('independent passive steps run in parallel: total < sum of durations', () => {
  // Rice (18 min) + prep (5) → fry (5) can overlap the rice
  const tl = buildTimeline([
    step('s1', 18, [], 'base', 3), // rice, mostly passive
    step('s2', 5, []),
    step('s3', 5, ['s2']),
    step('s4', 2, ['s1', 's3']),
  ]);
  const sum = 18 + 5 + 5 + 2;
  assert.ok(tl.totalMin < sum, `total ${tl.totalMin} should be < ${sum}`);
  assert.equal(tl.totalMin, 20); // max(18, 10) + 2
});

test('child and adult lanes finish at the same time', () => {
  const steps = [
    step('s1', 10), // shared base
    step('s2', 2, ['s1'], 'child'),
    step('s3', 2, ['s1', 's2'], 'adult'),
    step('s4', 6, ['s3'], 'adult'), // adult lane much longer
    step('s5', 2, ['s2'], 'child'),
  ];
  const tl = buildTimeline(steps, { branch: 'split' });
  const laneEnd = (lane) =>
    Math.max(...tl.steps.filter((s) => s.lane === lane).map((s) => s.endMin));
  assert.equal(laneEnd('child'), laneEnd('adult'));
  assert.deepEqual([...tl.lanes].sort(), ['adult', 'base', 'child']);
});

test('base mode excludes branch steps', () => {
  const steps = [step('s1', 5), step('s2', 3, ['s1'], 'child'), step('s3', 3, ['s1'], 'adult')];
  const tl = buildTimeline(steps, { branch: 'base' });
  assert.equal(tl.steps.length, 1);
  assert.deepEqual(tl.lanes, ['base']);
});

test('dependency cycle throws', () => {
  const steps = [step('s1', 5, ['s2']), step('s2', 5, ['s1'])];
  assert.throws(() => buildTimeline(steps), /cycle/i);
});

test('unknown dependency throws', () => {
  assert.throws(() => buildTimeline([step('s1', 5, ['s99'])]), /unknown/i);
});

test('activeMin is used for active time when present', () => {
  const tl = buildTimeline([step('s1', 18, [], 'base', 3), step('s2', 5, [])]);
  assert.equal(tl.activeMin, 8); // 3 + 5
});
