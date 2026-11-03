// Into the bag planner's Bike details (spec sections 3.7 and 7.1): the one place a bike is edited. The co-pilot only builds the address.

/** The screen the bag planner goes back to. Anything else means You (section 7.1). */
export type BackScreen = 'trip' | 'tools' | 'you' | 'tyre';
const BACKS: readonly BackScreen[] = ['trip', 'tools', 'you', 'tyre'];

/** `/tools/bags/#bike-details=<bikeId>&back=<screen>&section=look`, or `bike-details=new` for a rider with no bike. */
export function bikeDetailsHref(bikeId: string, back: BackScreen, section?: 'look'): string {
  const screen = BACKS.includes(back) ? back : 'you';
  return `/tools/bags/#bike-details=${encodeURIComponent(bikeId)}&back=${screen}${section ? `&section=${section}` : ''}`;
}

/** Opens Bike details: Make it yours and a tap on the drawing open it at Look; Edit opens it at the top. */
export function openBikeDetails(bikeId: string, back: BackScreen, section?: 'look', go: (href: string) => void = (href) => location.assign(href)): void {
  go(bikeDetailsHref(bikeId, back, section));
}
