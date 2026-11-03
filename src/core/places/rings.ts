// Whether a point is inside rings, by counting crossings, so holes come out right by themselves. Rings are [lon, lat].
export type Ring = [number, number][];                       // [lon, lat], closed or not

export function pointInRings(rings: Ring[], lon: number, lat: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[i]!;
      const [bx, by] = ring[j]!;
      if ((ay > lat) !== (by > lat) && lon < ax + ((lat - ay) * (bx - ax)) / (by - ay)) inside = !inside;
    }
  }
  return inside;
}
