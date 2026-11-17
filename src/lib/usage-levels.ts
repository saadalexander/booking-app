/** Pure helpers for storage warnings (unit-tested). */
export const WARN_LEVELS = [70, 90] as const;

/** Highest warning threshold reached for a usage percentage (0 if below 70%). */
export function warnLevel(percent: number): number {
  return [...WARN_LEVELS].reverse().find((l) => percent >= l) ?? 0;
}

export function formatBytes(n: number) {
  if (n >= 1000 ** 3) return `${(n / 1000 ** 3).toFixed(2)} GB`;
  if (n >= 1000 ** 2) return `${(n / 1000 ** 2).toFixed(1)} MB`;
  return `${Math.ceil(n / 1000)} KB`;
}
