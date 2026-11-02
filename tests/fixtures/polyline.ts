// An independent decoder for Google's encoded-polyline algorithm on integers, so the encoder is not tested with itself.
export function decodeRows(line: string, columns: number): number[][] {
  const values: number[] = [];
  let i = 0;
  while (i < line.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = line.charCodeAt(i++) - 63;
      result += (byte & 0x1f) * 2 ** shift;
      shift += 5;
    } while (byte >= 0x20);
    values.push(result % 2 === 1 ? -(result + 1) / 2 : result / 2);
  }
  const rows: number[][] = [];
  const last = new Array<number>(columns).fill(0);
  for (let k = 0; k < values.length; k += columns) {
    rows.push(last.map((prev, c) => (last[c] = prev + values[k + c]!)));
  }
  return rows;
}
