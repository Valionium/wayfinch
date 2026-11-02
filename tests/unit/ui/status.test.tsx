// @vitest-environment jsdom
import { render } from 'preact';
import { afterEach, expect, test } from 'vitest';
import { Degraded, ListMore } from '../../../src/ui/card.tsx';
import { degradedKinds, isStorageBlocked } from '../../../src/ui/degraded.ts';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { W } from '../../../src/core/wording/en.ts';
import type { Status } from '../../../src/core/types.ts';

const host = document.createElement('div');
document.body.append(host);
afterEach(() => render(null, host));

test('[APP-STATUS-WORDS] each of fine, action, warning, unknown renders its word, not only its colour', () => {
  const words: Record<Status, string> = { fine: 'Fine', action: 'Action needed', warning: 'Warning', unknown: 'Unknown' };
  for (const status of Object.keys(words) as Status[]) {
    render(<StatusBadge status={status} />, host);
    expect(host.textContent).toBe(words[status]);
    expect(host.querySelector(`.badge-${status}`)).not.toBeNull();
  }
  // four different words: a colour cannot be what tells them apart
  expect(new Set(Object.values(words)).size).toBe(4);
});

test('[APP-DEGRADED] with no trip, section 8 names the missing route, blocked storage and no signal in exact words', async () => {
  const text = (kind: Parameters<typeof Degraded>[0]['kind']) => {
    render(<Degraded kind={kind} />, host);
    return host.textContent;
  };
  expect(text('noRoute')).toBe("Add a route to see what's ahead");
  expect(text('storageBlocked')).toBe(W.appStorageBlocked);
  expect(text('noSignalNoTrip')).toBe(W.appNoSignalNoTrip);

  // storage is blocked when the browser will not open a database (stubbed here)
  const blocked = { open: () => { throw new Error('SecurityError'); } } as unknown as IDBFactory;
  expect(await isStorageBlocked(blocked)).toBe(true);
  expect(await isStorageBlocked(undefined)).toBe(true);
  const refusing = { open: () => { const request: { onerror?: () => void } = {}; queueMicrotask(() => request.onerror?.()); return request; } } as unknown as IDBFactory;
  expect(await isStorageBlocked(refusing)).toBe(true);

  // and which of them show with nothing yet: no route; blocked storage first; no signal only while no trip is prepared
  expect(degradedKinds({ hasRoute: false, hasPreparedTrip: false, online: true, storageBlocked: false })).toEqual(['noRoute']);
  expect(degradedKinds({ hasRoute: false, hasPreparedTrip: false, online: false, storageBlocked: true })).toEqual(['storageBlocked', 'noRoute', 'noSignalNoTrip']);
  expect(degradedKinds({ hasRoute: true, hasPreparedTrip: true, online: false, storageBlocked: false })).toEqual([]);
});

test('a list folds after five and shows all on a tap, removing nothing', () => {
  const items = Array.from({ length: 8 }, (_, i) => `shelter ${i + 1}`);
  render(<ListMore items={items} render={(item) => item} />, host);
  expect(host.querySelectorAll('li')).toHaveLength(5);
  const button = host.querySelector('button')!;
  expect(button.textContent).toBe('Show 3 more');
  button.click();
  return Promise.resolve().then(() => Promise.resolve()).then(() => {
    expect(host.querySelectorAll('li')).toHaveLength(8);
    expect(host.querySelector('button')!.textContent).toBe('Show fewer');
  });
});

test('a short list has no fold button', () => {
  render(<ListMore items={['a', 'b']} render={(item) => item} />, host);
  expect(host.querySelector('button')).toBeNull();
});
