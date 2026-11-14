// The Bike finder's answers (design of 14 November 2026): one copilot:* key on this phone, as the tyre tool keeps its answers in
// copilot:tyre:v1. Nothing stored, unreadable, another version or a value not in its question's list reads as that question unanswered, so
// old data loads unchanged. Delete co-pilot data removes it with every copilot:* key. Never a loadcheck:* key.
import { ORDER, QUESTIONS } from '../../core/finder/rank.ts';
import type { Answers } from '../../core/finder/rank.ts';

export const FINDER_KEY = 'copilot:bikeFinder:v1';

/** The answers kept on this phone; none when there are none to read. */
export function readAnswers(): Answers {
  try {
    const raw = JSON.parse(localStorage.getItem(FINDER_KEY) ?? 'null') as { v?: unknown; answers?: Record<string, unknown> } | null;
    const given = raw?.v === 1 ? raw.answers : null;
    const out: Record<string, unknown> = {};
    // a value not in its question's list (or not a string at all) is no answer
    for (const q of ORDER) if ((QUESTIONS[q] as readonly unknown[]).includes(given?.[q])) out[q] = given![q];
    return out as Answers;
  } catch {
    return {};
  }
}

/** Keeps the answers; false when the browser refused (they stay for this visit). */
export function writeAnswers(a: Answers): boolean {
  try {
    localStorage.setItem(FINDER_KEY, JSON.stringify({ v: 1, answers: a }));
    return true;
  } catch {
    return false;
  }
}

/** Start again: the key goes. */
export function clearAnswers(): void {
  try { localStorage.removeItem(FINDER_KEY); } catch { /* storage refused: nothing kept to remove */ }
}
