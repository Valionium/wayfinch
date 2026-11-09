// The line under Trip's and En route's heading saying what the tab is for. Its words load after the first screen (en-subtitles.ts).
import { SUB } from '../core/wording/en-subtitles.ts';

export function TabSubtitle({ tab }: { tab: 'trip' | 'ahead' }) {
  return <p class="tab-sub muted" data-tab-sub={tab}>{SUB[tab]}</p>;
}
