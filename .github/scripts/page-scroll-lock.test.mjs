import assert from 'node:assert/strict';
import test from 'node:test';

const root = { style: { overflow: '', paddingRight: '' }, clientWidth: 1000 };
globalThis.document = { documentElement: root };
globalThis.window = { innerWidth: 1000 };
const { lockPageScroll } = await import('../../lib/page-scroll-lock.ts');

test('overlapping locks free the page only when the last one is released', () => {
  const closing = lockPageScroll();
  const opening = lockPageScroll();
  assert.equal(root.style.overflow, 'hidden');
  closing();
  assert.equal(root.style.overflow, 'hidden');
  opening();
  assert.equal(root.style.overflow, '');
});

test('releasing twice does not unlock a story still open', () => {
  const first = lockPageScroll();
  const second = lockPageScroll();
  first();
  first();
  assert.equal(root.style.overflow, 'hidden');
  second();
  assert.equal(root.style.overflow, '');
});
