// The OpenStreetMap credit (spec section 10): wherever OpenStreetMap data, routes or search results show, with a link to the
// copyright page and, when the data has one, its date. Visible without a tap.
import { W } from '../../core/wording/en.ts';
import { TF } from '../../core/wording/en-trip-fields.ts';

export const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';

export function OsmCredit({ lead, date }: { lead: string; date?: { date: string; fromSource: boolean } | null }) {
  return (
    <p class="muted">
      {lead}<a href={OSM_COPYRIGHT} target="_blank" rel="noopener noreferrer">{TF.appTripOsmLink}</a>{date ? `, ${W.appTripMapDate(date.date, date.fromSource)}` : ''}.
    </p>
  );
}

export const GEONAMES = 'https://www.geonames.org/';

/** The credit for place names from Open-Meteo's geocoding, which come from GeoNames under CC BY 4.0. */
export function GeoNamesCredit() {
  return (
    <p class="muted">
      {W.appTripOsmSearch}<a href={GEONAMES} target="_blank" rel="noopener noreferrer">{TF.appTripGeoNamesLink}</a>{TF.appTripGeoNamesLicence}.
    </p>
  );
}
