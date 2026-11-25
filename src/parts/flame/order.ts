import type { Budget } from "../../core/budget";
/** Stable numeric order in eight byte passes, including negative and fractional finite numbers. */
export function numberOrder<T>(items: T[], key: (item: T) => number, budget?: Budget): T[] {
 if (items.length < 2) return items.slice();
 budget?.charge(items.length, items.length * 2);
 let rows = items.map((item) => {
  const bytes = new Uint8Array(8); const v = key(item);
  new DataView(bytes.buffer).setFloat64(0, v === 0 ? 0 : v, false);
  const neg = (bytes[0] & 128) !== 0;
  for (let j = 0; j < 8; j++) bytes[j] ^= neg ? 255 : j === 0 ? 128 : 0;
  return { item, bytes };
 });
 for (let at = 7; at >= 0; at--) {
  budget?.charge(rows.length * 2, rows.length);
  const buckets: typeof rows[] = Array.from({ length: 256 }, () => []);
  for (const row of rows) buckets[row.bytes[at]].push(row);
  rows = buckets.flat();
 }
 return rows.map((row) => row.item);
}
