import { beforeEach } from 'vitest';
import { resetTurn } from '../src/store/turn.ts';

// The window's one write queue is module state (src/store/turn.ts): each test starts with it empty, so a turn one test left hanging
// (a write not awaited when the next test replaced the store) never holds the next test's writes (review of PR 175, m-5).
beforeEach(() => resetTurn());
