// A status as colour plus its word: colour is never the only signal (spec section 3.6).
import { W } from '../core/wording/en.ts';
import type { Status } from '../core/types.ts';

export const STATUS_WORD: Record<Status, string> = {
  fine: W.appStatusFine,
  action: W.appStatusAction,
  warning: W.appStatusWarning,
  unknown: W.appStatusUnknown,
};

export function StatusBadge({ status }: { status: Status }) {
  return <span class={`badge badge-${status}`}>{STATUS_WORD[status]}</span>;
}
