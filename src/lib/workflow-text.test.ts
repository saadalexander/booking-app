import { describe as suite, expect, it } from "vitest";
import { describe, render, sampleVariables, TEMPLATES, VARIABLES } from "./workflow-text";

suite("automation text", () => {
  it("fills known placeholders and leaves unknown ones visible", () => {
    expect(render("Hi {first_name}, see you {date} {oops}", { first_name: "Ann", date: "Monday" })).toBe("Hi Ann, see you Monday {oops}");
  });
  it("describes timing in plain words", () => {
    expect(describe({ trigger: "before_start", offsetMinutes: 1440, recipient: "client" })).toBe("1 day before the call starts · to the client");
    expect(describe({ trigger: "after_end", offsetMinutes: 90, recipient: "owner" })).toBe("90 minutes after the call ends · to you");
    expect(describe({ trigger: "booking_cancelled", offsetMinutes: 0, recipient: "client" })).toBe("When a booking is cancelled · to the client");
  });
  it("templates only use placeholders that exist", () => {
    const keys = new Set(VARIABLES.map((v) => v.key));
    for (const t of TEMPLATES) {
      for (const m of `${t.subject} ${t.body}`.matchAll(/\{([a-z_]+)\}/g)) expect(keys.has(m[1]), `${t.key}: {${m[1]}}`).toBe(true);
    }
    const filled = render(TEMPLATES[0].body, sampleVariables());
    expect(filled).not.toMatch(/\{[a-z_]+\}/);
  });
});
