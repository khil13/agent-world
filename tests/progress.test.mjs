import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typicalMs, progressBasis, progressAt, progressLabel } from '../src/progress.mjs';

const MIN = 60e3;
const T0 = Date.parse('2026-10-02T12:00:00Z');
const at = minutesAgo => new Date(T0 - minutesAgo * MIN).toISOString();
const ok = (minutes, over = {}) => ({ status: 'completed', concl: 'success', date: at(60), ms: minutes * MIN, ...over });
const failed = (minutes, over = {}) => ({ status: 'completed', concl: 'failure', date: at(60), ms: minutes * MIN, ...over });
const going = (startedMinutesAgo, over = {}) => ({ status: 'in_progress', concl: null, date: at(startedMinutesAgo), ...over });

test('the usual time of a task is the median of its last ten successful runs, ignoring runs that did not succeed or have no duration', () => {
  assert.equal(typicalMs([ok(4), ok(8), ok(6)]), 6 * MIN, 'odd count: the middle one');
  assert.equal(typicalMs([ok(4), ok(8)]), 6 * MIN, 'even count: between the two middle ones');
  assert.equal(typicalMs([ok(5), failed(500), { status: 'completed', concl: 'cancelled', ms: 900 * MIN }, ok(7, { ms: undefined }), ok(5, { ms: 0 })]), 5 * MIN, 'only successful runs with a duration count');
  const many = [...Array.from({ length: 10 }, () => ok(6)), ...Array.from({ length: 10 }, () => ok(60))];
  assert.equal(typicalMs(many), 6 * MIN, 'only the newest ten (the list is newest first)');
  assert.equal(typicalMs([]), null);
  assert.equal(typicalMs([failed(3)]), null);
  assert.equal(typicalMs(undefined), null);
});

test('a running task with its steps reported has an exact figure: steps done out of all steps, never 100 until the run ends', () => {
  const p = at => progressAt(progressBasis(going(3, { steps: { done: 3, total: 8 } }), []), at);
  assert.deepEqual(p(T0), { value: 37, exact: true });
  assert.deepEqual(progressAt(progressBasis(going(3, { steps: { done: 0, total: 8 } }), []), T0), { value: 0, exact: true });
  assert.deepEqual(progressAt(progressBasis(going(3, { steps: { done: 8, total: 8 } }), []), T0), { value: 99, exact: true }, 'the last step is still running');
});

test('without steps a running task is estimated from how long it usually takes, marked as an estimate and held at 95', () => {
  const basis = progressBasis(going(3), [ok(6), ok(6), ok(6)]);
  assert.deepEqual(progressAt(basis, T0), { value: 50, exact: false });
  assert.deepEqual(progressAt(basis, T0 + 3 * MIN), { value: 95, exact: false }, 'twice its usual time is still only 95');
  assert.equal(progressAt(basis, T0 + 600 * MIN).value, 95);
  assert.equal(progressAt(basis, T0 - 10 * MIN).value, 0, 'a clock a little behind the run never gives a negative figure');
});

test('with fewer than three finished runs it still estimates from what there is, and with none it shows no figure', () => {
  assert.deepEqual(progressAt(progressBasis(going(3), [ok(6)]), T0), { value: 50, exact: false });
  assert.equal(progressAt(progressBasis(going(3), []), T0), null, 'never finished a run and no steps: nothing to base it on');
  assert.equal(progressAt(progressBasis(going(3), [failed(6)]), T0), null, 'only failed runs say nothing about the usual time');
});

test('exact steps win over the estimate, and steps that make no sense are ignored', () => {
  const history = [ok(6), ok(6)];
  assert.deepEqual(progressAt(progressBasis(going(3, { steps: { done: 6, total: 8 } }), history), T0), { value: 75, exact: true });
  for (const steps of [{ done: 3, total: 0 }, { done: 9, total: 8 }, { done: -1, total: 8 }, { done: 1.5, total: 8 }, { done: '3', total: 8 }, null, {}]) {
    assert.deepEqual(progressAt(progressBasis(going(3, { steps }), history), T0), { value: 50, exact: false }, JSON.stringify(steps));
  }
});

test('a queued run has no figure yet', () => {
  assert.equal(progressAt(progressBasis({ status: 'queued', concl: null, date: at(1) }, [ok(6)]), T0), null);
});

test('a run that succeeded is complete', () => {
  assert.deepEqual(progressAt(progressBasis(ok(6), [ok(6)]), T0), { value: 100, exact: true });
});

test('a run that stopped early freezes where it stopped: by its steps when it reported them, else by how long it ran', () => {
  assert.deepEqual(progressAt(progressBasis(failed(2, { steps: { done: 4, total: 9 } }), [ok(6)]), T0), { value: 44, exact: true });
  assert.deepEqual(progressAt(progressBasis(failed(3), [ok(6), ok(6)]), T0), { value: 50, exact: false });
  assert.deepEqual(progressAt(progressBasis({ status: 'completed', concl: 'cancelled', date: at(60), ms: 3 * MIN }, [ok(6)]), T0), { value: 50, exact: false });
  assert.equal(progressAt(progressBasis(failed(30), [ok(6)]), T0).value, 95, 'it ran far longer than usual before failing');
  assert.equal(progressAt(progressBasis(failed(3), []), T0), null, 'no steps and nothing to compare with');
  assert.equal(progressAt(progressBasis({ status: 'completed', concl: 'failure', date: at(60) }, [ok(6)]), T0), null, 'no duration recorded');
});

test('the frozen figure does not move with the clock', () => {
  const basis = progressBasis(failed(3), [ok(6)]);
  assert.deepEqual(progressAt(basis, T0), progressAt(basis, T0 + 1000 * MIN));
});

test('nothing to show for a task that has never run, or for rubbish', () => {
  for (const latest of [null, undefined, {}, { name: 'x' }]) {
    assert.equal(progressBasis(latest, []), null);
    assert.equal(progressAt(progressBasis(latest, []), T0), null);
  }
  assert.equal(progressAt(null, T0), null);
  assert.equal(progressAt(progressBasis(going(3), [ok(6)]), NaN) , null, 'an unreadable clock gives no figure rather than a wrong one');
});

test('the label says it is an estimate with a ≈', () => {
  assert.equal(progressLabel({ value: 37, exact: true }), '37%');
  assert.equal(progressLabel({ value: 50, exact: false }), '≈50%');
  assert.equal(progressLabel(null), '');
});
