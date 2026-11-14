// More colours (wish 4, design of 14 Nov 2026): our own picker's 65 named colours and its keyboard model, in place of the browser's
// colour input.
import { expect, test } from 'vitest';
import { hexToOklab, SWATCHES } from '../../../../src/core/bike/colour.ts';
import { findMoreColour, MORE_COLOURS, MORE_COLUMNS, moveInGrid } from '../../../../src/core/bike/more-colours.ts';
import { bannedHits } from '../../../fixtures/banned.ts';

const distance = (a: string, b: string): number => {
  const [p, q] = [hexToOklab(a), hexToOklab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

test('[LC-COLOURS-PALETTE] 13 rows of 5 named colours, each "#rrggbb" in lower case, no name or colour twice, no two alike', () => {
  expect(MORE_COLUMNS).toBe(5);
  expect(MORE_COLOURS).toHaveLength(65);
  for (const c of MORE_COLOURS) {
    expect(c.hex, c.name).toMatch(/^#[0-9a-f]{6}$/);
    expect(c.name.trim(), c.hex).toBe(c.name);
    expect(c.name.length, c.hex).toBeGreaterThan(2);
    expect(bannedHits(c.name), c.name).toEqual([]);
  }
  expect(new Set(MORE_COLOURS.map((c) => c.name.toLowerCase())).size).toBe(65);
  expect(new Set(MORE_COLOURS.map((c) => c.hex)).size).toBe(65);
  // every cell looks different from every other: at least 0.04 apart in OKLab
  for (let i = 0; i < MORE_COLOURS.length; i += 1) {
    for (let j = i + 1; j < MORE_COLOURS.length; j += 1) {
      expect(distance(MORE_COLOURS[i]!.hex, MORE_COLOURS[j]!.hex), `${MORE_COLOURS[i]!.name} / ${MORE_COLOURS[j]!.name}`).toBeGreaterThanOrEqual(0.04);
    }
  }
});

test('[LC-COLOURS-PALETTE] the 16 swatches are in the grid with their own names and colours, unchanged; real frame colours are there too', () => {
  for (const s of SWATCHES) expect(MORE_COLOURS.find((c) => c.hex === s.hex)?.name, s.name).toBe(s.name);
  for (const name of ['Burgundy', 'Raw aluminium', 'Titanium', 'Copper', 'Mint', 'Forest green', 'Lime', 'Turquoise', 'Lavender', 'Cream', 'Mustard']) {
    expect(MORE_COLOURS.some((c) => c.name === name), name).toBe(true);
  }
});

test('[LC-COLOURS-PALETTE] each family row goes from light to dark, its middle the swatch', () => {
  // rows 3 to 12 are one family each (row 1 the greys, 2 the metals, 13 the bright ones)
  for (let row = 0; row < 13; row += 1) {
    const cells = MORE_COLOURS.slice(row * 5, row * 5 + 5);
    if (row === 1 || row === 12) continue;
    const light = cells.map((c) => hexToOklab(c.hex)[0]);
    for (let i = 1; i < 5; i += 1) expect(light[i]!, `${cells[i - 1]!.name} before ${cells[i]!.name}`).toBeLessThan(light[i - 1]!);
    if (row >= 3) expect(SWATCHES.some((s) => s.hex === cells[2]!.hex), cells[2]!.name).toBe(true);
  }
});

test('[LC-COLOURS-PALETTE] findMoreColour: the cell of a stored colour in any case; -1 for a colour outside the grid or no colour', () => {
  expect(findMoreColour('#6b1d2a')).toBe(MORE_COLOURS.findIndex((c) => c.name === 'Burgundy'));
  expect(findMoreColour('#6B1D2A')).toBe(MORE_COLOURS.findIndex((c) => c.name === 'Burgundy'));
  expect(findMoreColour('#2563b8')).toBe(MORE_COLOURS.findIndex((c) => c.name === 'Blue'));
  expect(findMoreColour('#123456')).toBe(-1);
  expect(findMoreColour(null)).toBe(-1);
  expect(findMoreColour('blue')).toBe(-1);
});

test('[LC-COLOURS-KEYS] arrows: Left and Right in reading order, Up and Down a row in the same column, stopping at the edges', () => {
  const at = (row: number, col: number) => row * 5 + col;
  expect(moveInGrid(at(0, 0), 'ArrowRight')).toBe(at(0, 1));
  expect(moveInGrid(at(0, 4), 'ArrowRight')).toBe(at(1, 0));   // on to the next row
  expect(moveInGrid(at(1, 0), 'ArrowLeft')).toBe(at(0, 4));    // back to the row before
  expect(moveInGrid(at(0, 0), 'ArrowLeft')).toBe(at(0, 0));    // the first stays
  expect(moveInGrid(at(12, 4), 'ArrowRight')).toBe(at(12, 4)); // the last stays
  expect(moveInGrid(at(3, 2), 'ArrowDown')).toBe(at(4, 2));
  expect(moveInGrid(at(3, 2), 'ArrowUp')).toBe(at(2, 2));
  expect(moveInGrid(at(0, 3), 'ArrowUp')).toBe(at(0, 3));
  expect(moveInGrid(at(12, 1), 'ArrowDown')).toBe(at(12, 1));
});

test('[LC-COLOURS-KEYS] Home and End to the row\'s ends, Page Up and Page Down to the column\'s ends; any other key moves nothing', () => {
  const at = (row: number, col: number) => row * 5 + col;
  expect(moveInGrid(at(6, 3), 'Home')).toBe(at(6, 0));
  expect(moveInGrid(at(6, 1), 'End')).toBe(at(6, 4));
  expect(moveInGrid(at(6, 3), 'PageUp')).toBe(at(0, 3));
  expect(moveInGrid(at(6, 3), 'PageDown')).toBe(at(12, 3));
  for (const key of ['Enter', ' ', 'Tab', 'a', 'Escape']) expect(moveInGrid(at(6, 3), key), key).toBeNull();
  // from no cell (a colour outside the grid), the first key lands on the first cell
  expect(moveInGrid(-1, 'ArrowRight')).toBe(0);
  expect(moveInGrid(-1, 'ArrowDown')).toBe(0);
});
