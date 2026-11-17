import { describe, expect, it } from "vitest";
import { previewText, renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders bold, italic, links and lists", () => {
    const html = renderMarkdown("**Step 1:** [Guide](https://example.com/a_b)\n\n_note_\n\n* one\n* two");
    expect(html).toContain("<strong>Step 1:</strong>");
    expect(html).toContain('<a href="https://example.com/a_b" target="_blank" rel="noopener noreferrer">Guide</a>');
    expect(html).toContain("<em>note</em>");
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
  });
  it("escapes HTML and refuses script links", () => {
    const html = renderMarkdown('<script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror=alert(1)>');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
  });
  it("handles Windows line breaks like normal ones", () => {
    expect(renderMarkdown("a\r\n\r\nb")).toBe(renderMarkdown("a\n\nb"));
  });
});

describe("previewText", () => {
  it("uses only the first paragraph, with either line-break style", () => {
    expect(previewText("First para.\n\nSecond.")).toBe("First para.");
    expect(previewText("First para.\r\n\r\nSecond.")).toBe("First para.");
  });
});
