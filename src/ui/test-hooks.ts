// The browser tests' door into the page (plan Decision 8): `window.__wf.loadCase(json)` draws a simulator case's screen on Ahead,
// through the very shell the rider's page uses, instead of the store's. Only a --test-hooks build contains this file.
import { aheadShell } from './app.tsx';
import { go } from './nav.ts';
import { caseInputs } from './sim-case.ts';

(window as unknown as { __wf: { loadCase: (json: string) => void } }).__wf = {
  loadCase(json: string) {
    aheadShell.show(caseInputs(json));
    go('ahead');
  },
};
