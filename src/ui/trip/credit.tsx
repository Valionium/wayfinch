// The OpenStreetMap credit (spec section 10): wherever OpenStreetMap data, routes or search results show, with a link to the
// copyright page and, when the data has one, its date. Visible without a tap.
import { W } from '../../core/wording/en.ts';

export const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';

export function OsmCredit({ lead, date }: { lead: string; date?: { date: string; fromSource: boolean } | null }) {
  return (
    <p class="muted">
      {lead}<a href={OSM_COPYRIGHT} target="_blank" rel="noopener noreferrer">{W.appTripOsmLink}</a>{date ? `, ${W.appTripMapDate(date.date, date.fromSource)}` : ''}.
    </p>
  );
}
