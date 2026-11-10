// What sits at the top of Ahead, Trip and Tools (and nothing on You) beside the heading, in one chunk loaded after the first screen: the colour mode button
// (theme-button.tsx, the same corner of all three) and, on Trip and Ahead, the line saying what the tab is for (its words, en-subtitles.ts).
import { SUB } from '../core/wording/en-subtitles.ts';
import { tabOf } from './nav.ts';
import type { ScreenName } from './nav.ts';
import { ThemeButton } from './theme-button.tsx';

export function TabTop({ name }: { name: ScreenName }) {
  const tab = tabOf(name);
  return tab === 'you' ? null : (
    <>
      {name === tab ? <ThemeButton /> : null}
      {tab === 'tools' ? null : <p class="tab-sub muted" data-tab-sub={tab}>{SUB[tab]}</p>}
    </>
  );
}
