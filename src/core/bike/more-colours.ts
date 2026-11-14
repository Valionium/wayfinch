// More colours (wish 4, design of 14 Nov 2026): our own picker's grid in place of the browser's colour input. 13 rows of 5, each row
// one family from light to dark; the 16 swatches sit in it at their own place, with their own names. The other shades are made in
// OKLab from the swatches (same hue, lighter or darker, clipped to sRGB), no two closer than 0.04. Served in /tools/bags/colours.js
// only, loaded on the first tap of More colours: the first screen never carries it.

export type MoreColour = { name: string; hex: string };

export const MORE_COLUMNS = 5;

const ROWS: readonly (readonly [string, string])[][] = [
  [['White', '#f4f4f2'], ['Silver', '#b9bdc1'], ['Grey', '#898d91'], ['Graphite', '#4b4f54'], ['Black', '#1d1d1f']],
  [['Raw aluminium', '#d3d8da'], ['Titanium', '#9f978c'], ['Gold', '#c7a250'], ['Bronze', '#86653d'], ['Copper', '#b86838']],
  [['Cream', '#f1e6d6'], ['Sand', '#cbb68e'], ['Tan', '#a58660'], ['Brown', '#7b5434'], ['Dark brown', '#503726']],
  [['Rose', '#ffa89d'], ['Coral', '#ed7c70'], ['Red', '#c62f2a'], ['Deep red', '#9e141e'], ['Burgundy', '#6b1d2a']],
  [['Peach', '#febd9e'], ['Light orange', '#fa9c6d'], ['Orange', '#e46b1f'], ['Rust', '#ad4a00'], ['Dark rust', '#783818']],
  [['Pale yellow', '#fbe9b0'], ['Light yellow', '#f6d377'], ['Yellow', '#f1c232'], ['Mustard', '#b58f07'], ['Dark mustard', '#7a5f03']],
  [['Sage', '#bec9ad'], ['Light olive', '#9eaa78'], ['Olive', '#6d7a37'], ['Army green', '#4f5a1c'], ['Dark olive', '#323a0d']],
  [['Mint', '#9ce4bd'], ['Light green', '#77ae89'], ['Green', '#2f7d4f'], ['Deep green', '#125d35'], ['Forest green', '#043d20']],
  [['Pale teal', '#94cfcf'], ['Light teal', '#71aeaf'], ['Teal', '#1f7f80'], ['Deep teal', '#025e5f'], ['Dark teal', '#023d3e']],
  [['Pale blue', '#9ac0f8'], ['Light blue', '#6e9ddf'], ['Blue', '#2563b8'], ['Deep blue', '#0b4691'], ['Navy', '#1f2f55']],
  [['Lavender', '#c5adec'], ['Light purple', '#a183cf'], ['Purple', '#6b3fa0'], ['Deep purple', '#50277d'], ['Aubergine', '#341555']],
  [['Pale pink', '#feb3d4'], ['Light pink', '#f095be'], ['Pink', '#d6619b'], ['Raspberry', '#a53e73'], ['Plum', '#71254c']],
  [['Neon yellow', '#eeef08'], ['Lime', '#a0da3e'], ['Turquoise', '#2ac3bb'], ['Electric blue', '#007df2'], ['Magenta', '#ca25a4']],
];

/** The 65 colours in reading order: row by row, light to dark. */
export const MORE_COLOURS: readonly MoreColour[] = ROWS.flat().map(([name, hex]) => ({ name, hex }));

/** The cell of a stored colour, in any case; -1 for anything outside the grid. */
export function findMoreColour(hex: unknown): number {
  if (typeof hex !== 'string') return -1;
  const lower = hex.toLowerCase();
  return MORE_COLOURS.findIndex((c) => c.hex === lower);
}

/**
 * The keyboard model: the cell a key moves to from `index`, or null for a key that moves nothing (the browser keeps it: Tab, Space).
 * Left and Right go in reading order across rows; Up and Down a row in the same column; Home and End to the row's ends; Page Up and
 * Page Down to the column's ends; nothing moves past the grid's edges. From no cell (-1), any move lands on the first.
 */
export function moveInGrid(index: number, key: string, count = MORE_COLOURS.length, columns = MORE_COLUMNS): number | null {
  const moves = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'PageUp', 'PageDown'];
  if (!moves.includes(key)) return null;
  if (index < 0 || index >= count) return 0;
  const row = Math.floor(index / columns);
  const col = index % columns;
  const lastRow = Math.floor((count - 1) / columns);
  const clamp = (i: number): number => Math.max(0, Math.min(count - 1, i));
  switch (key) {
    case 'ArrowRight': return clamp(index + 1);
    case 'ArrowLeft': return clamp(index - 1);
    case 'ArrowDown': return index + columns < count ? index + columns : index;
    case 'ArrowUp': return index - columns >= 0 ? index - columns : index;
    case 'Home': return row * columns;
    case 'End': return clamp(row * columns + columns - 1);
    case 'PageUp': return col;
    default: {
      // Page Down: the column's last cell (a short last row ends the column a row higher)
      const last = lastRow * columns + col;
      return last < count ? last : last - columns;
    }
  }
}
