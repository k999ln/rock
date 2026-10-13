import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFitnessPlan } from '../lib/sky-fitness-output.ts';

void test('Fitness plugin accepts only bounded typed Agent output', () => {
  const plan = {
    schema: 'sky.fitness.plan/1',
    title: '今週の運動案',
    sessions: [{ label: 'Day 1', durationMinutes: 30, activities: ['ウォーキング'] }],
    notes: ['自分の体調に合わせて調整する'],
  };
  assert.deepEqual(parseFitnessPlan(JSON.stringify(plan)), plan);
  assert.equal(parseFitnessPlan('ウォーキングをしましょう'), null);
  assert.equal(parseFitnessPlan(JSON.stringify({ ...plan, schema: 'sky.fitness.plan/2' })), null);
  assert.equal(parseFitnessPlan(JSON.stringify({ ...plan, sessions: [{ ...plan.sessions[0], durationMinutes: -1 }] })), null);
  assert.equal(parseFitnessPlan(JSON.stringify({ ...plan, sessions: Array(8).fill(plan.sessions[0]) })), null);
});
