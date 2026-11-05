// @vitest-environment jsdom
// The one-time card for riders who come from Load Check (spec section 9.5 step two). The browser path is in tests/e2e/launch.spec.ts.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { M } from '../../../src/core/wording/en-moved.ts';
import { MOVED_CARD_KEY, MovedCard, returningLoadCheckRider } from '../../../src/ui/moved-card.tsx';

const host = document.createElement('div');
document.body.append(host);
beforeEach(() => localStorage.clear());
afterEach(() => render(null, host));

const show = () => act(() => { render(<MovedCard />, host); });

test('[SW-MOVED-CARD] a rider with a saved draft or saved setups is a returning Load Check rider; nothing else counts', () => {
  expect(returningLoadCheckRider()).toBe(false);
  localStorage.setItem('loadcheck:bikeProfiles', '[]');
  localStorage.setItem('loadcheck:summary:v1', '{}');
  expect(returningLoadCheckRider()).toBe(false);
  localStorage.setItem('loadcheck:draft', '{"v":1}');
  expect(returningLoadCheckRider()).toBe(true);
  localStorage.removeItem('loadcheck:draft');
  localStorage.setItem('loadcheck:setups', '[]');
  expect(returningLoadCheckRider()).toBe(true);
});

test('[SW-MOVED-CARD] the card says where Load Check went, links to the bag planner in the same window, and once dismissed is gone for good', async () => {
  localStorage.setItem('loadcheck:setups', '[{"name":"Alps"}]');
  const before = localStorage.getItem('loadcheck:setups');
  await show();
  const card = host.querySelector('.moved-card');
  expect(card).not.toBeNull();
  expect(card!.querySelector('h2')!.textContent).toBe('Load Check is now part of Wayfinch');
  expect(card!.textContent).toContain('under Tools');
  const link = card!.querySelector('a')!;
  expect(link.getAttribute('href')).toBe('/tools/bags/');
  expect(link.hasAttribute('target')).toBe(false);
  expect(link.textContent).toBe(M.movedOpen);
  const dismiss = card!.querySelector('button')!;
  expect(dismiss.textContent).toBe(M.movedDismiss);
  await act(() => { dismiss.click(); });
  expect(host.querySelector('.moved-card')).toBeNull();
  expect(localStorage.getItem(MOVED_CARD_KEY)).not.toBeNull();
  // a later start: still gone
  render(null, host);
  await show();
  expect(host.querySelector('.moved-card')).toBeNull();
  // the bag planner's own keys were only read
  expect(localStorage.getItem('loadcheck:setups')).toBe(before);
  expect(Object.keys(localStorage).filter((k) => k.startsWith('loadcheck:'))).toEqual(['loadcheck:setups']);
});

test('[SW-MOVED-CARD] following the link counts as seen: the card does not come back', async () => {
  localStorage.setItem('loadcheck:draft', '{"v":1}');
  await show();
  const link = host.querySelector<HTMLAnchorElement>('.moved-card a')!;
  // jsdom does not navigate; the click's own handler is what matters
  link.addEventListener('click', (e) => e.preventDefault());
  await act(() => { link.click(); });
  expect(localStorage.getItem(MOVED_CARD_KEY)).not.toBeNull();
  render(null, host);
  await show();
  expect(host.querySelector('.moved-card')).toBeNull();
});

test('[SW-MOVED-CARD] a new rider never sees it; a browser that keeps nothing shows it but never throws', async () => {
  await show();
  expect(host.querySelector('.moved-card')).toBeNull();
  localStorage.setItem('loadcheck:draft', '{"v":1}');
  const realSet = Storage.prototype.setItem;
  Storage.prototype.setItem = () => { throw new Error('quota'); };
  try {
    render(null, host);
    await show();
    const dismiss = host.querySelector<HTMLButtonElement>('.moved-card button')!;
    await act(() => { dismiss.click(); });
    // dismissed for this visit at least
    expect(host.querySelector('.moved-card')).toBeNull();
  } finally {
    Storage.prototype.setItem = realSet;
  }
});
