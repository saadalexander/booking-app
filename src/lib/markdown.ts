/**
 * Minimal, safe markdown → HTML for event descriptions (owner-authored, ported from Cal.com).
 * Everything is HTML-escaped first; only bold, italic, links (http/https/mailto) and
 * bullet lists are turned back into markup.
 */
function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function inline(text: string) {
  const links: string[] = [];
  let out = escapeHtml(text).replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const decoded = url.replace(/&amp;/g, "&");
    if (!/^(https?:\/\/|mailto:)/i.test(decoded)) return label;
    links.push(`<a href="${escapeHtml(decoded)}" target="_blank" rel="noopener noreferrer">${label.trim() || escapeHtml(decoded)}</a>`);
    return `\u0000${links.length - 1}\u0000`;
  });
  out = out
    .replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_([^_]+?)_(?=$|[\s.,!?)])/g, "$1<em>$2</em>")
    .replace(/(^|\s)(\S+@\S+\.\w{2,})(?=$|\s|[.,])/g, (m, pre: string, email: string) =>
      email.includes("\u0000") ? m : `${pre}<a href="mailto:${email}">${email}</a>`,
    );
  return out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => links[Number(i)]);
}

export function renderMarkdown(md: string): string {
  const blocks = md.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const html: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) continue;
    if (lines.every((l) => /^\s*[*-]\s+/.test(l))) {
      html.push("<ul>" + lines.map((l) => `<li>${inline(l.replace(/^\s*[*-]\s+/, ""))}</li>`).join("") + "</ul>");
    } else {
      html.push(`<p>${lines.map(inline).join("<br>")}</p>`);
    }
  }
  return html.join("");
}

/** Plain-text preview (first paragraph, no markup) for listings. */
export function previewText(md: string, max = 180) {
  const first = md.replace(/\r\n?/g, "\n").split(/\n{2,}/).find((b) => b.trim()) ?? "";
  const plain = first.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_#>]/g, "").replace(/\s+/g, " ").trim();
  return plain.length > max ? plain.slice(0, max - 1).trimEnd() + "…" : plain;
}
