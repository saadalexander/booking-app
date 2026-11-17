import { describe, expect, it } from "vitest";
import { warnLevel } from "./usage-levels";

describe("warnLevel", () => {
  it("maps usage to warning thresholds", () => {
    expect(warnLevel(0)).toBe(0);
    expect(warnLevel(69.9)).toBe(0);
    expect(warnLevel(70)).toBe(70);
    expect(warnLevel(89)).toBe(70);
    expect(warnLevel(90)).toBe(90);
    expect(warnLevel(120)).toBe(90);
  });
});
