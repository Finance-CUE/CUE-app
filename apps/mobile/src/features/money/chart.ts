/** SVG `points` for a line. Nulls are skipped (their x slot stays); a flat series sits mid-height. */
export function countPoints(values: (number | null)[]): number {
  return values.filter((v) => v !== null).length;
}

/** `zeroBaseline`: an all-zero series sits on the bottom edge instead of mid-height. */
export function linePoints(
  values: (number | null)[],
  width: number,
  height: number,
  opts: { zeroBaseline?: boolean } = {},
): string {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return '';
  const min = Math.min(...nums);
  const range = Math.max(...nums) - min;
  const last = values.length - 1;
  const pts: string[] = [];
  values.forEach((v, i) => {
    if (v === null) return;
    const x = last === 0 ? width / 2 : (i / last) * width;
    const y = range === 0 ? (opts.zeroBaseline && min === 0 ? height : height / 2) : height - ((v - min) / range) * height;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  return pts.join(' ');
}
