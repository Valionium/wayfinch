// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { lazy } from '../../../src/ui/lazy.tsx';

test('[TB-TOOLS-LAZY] a lazy part with a first part showing while it loads still says so when the chunk cannot load, with a way to try again', async () => {
  let attempts = 0;
  const Part = lazy<object>(
    () => { attempts += 1; return attempts === 1 ? Promise.reject(new Error('gone')) : Promise.resolve(() => <p id="ok">loaded</p>); },
    () => <p id="first">first part</p>,
  );
  const host = document.createElement('div');
  document.body.append(host);
  await act(async () => { render(<Part />, host); });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  expect(host.querySelector('#first')).not.toBeNull();
  expect(host.querySelector('[role="status"]')?.textContent).toContain(W.appLazyFailed);
  const retry = host.querySelector('button');
  expect(retry).not.toBeNull();
  await act(async () => { retry!.click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  expect(host.querySelector('#ok')).not.toBeNull();
  expect(host.querySelector('[role="status"]')).toBeNull();
  render(null, host);
});
