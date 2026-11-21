// Simmer's free tools (site/tools/*). Everything runs in this page: nothing is sent anywhere, stored or tracked.
// Each tool page marks its form with data-tool; the print button on the cheat sheet has data-print.
// The pure parts (finding links, cleaning them, building files) are exported on window.SimmerTools for tests.
(() => {
  "use strict";

  // Query parameters that only say where a click came from. Removing them never changes the page.
  const TRACKING = /^(utm_[a-z_]+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|mc_cid|mc_eid|igshid|_hsenc|_hsmi|mkt_tok|ref_src|spm)$/i;

  const clean = (href) => {
    try {
      const u = new URL(href);
      for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
      return u.toString().replace(/\?$/, "");
    } catch { return href; }
  };

  const site = (href) => { try { return new URL(href).hostname.replace(/^www\./, ""); } catch { return "other"; } };

  // Every http(s) link in the text, in order, with the title after " | " on its line (OneTab's export format)
  // and the group it belongs to (a blank line starts a new group).
  const parse = (text, { dedupe = true, strip = true } = {}) => {
    const out = [], seen = new Set();
    let group = 0, blank = false;
    for (const line of String(text).split(/\r?\n/)) {
      if (!line.trim()) { blank = true; continue; }
      if (blank && out.length) group++;
      blank = false;
      const found = line.match(/https?:\/\/[^\s<>"'`]+/gi) || [];
      const one = found.length === 1 && line.includes(" | ");
      for (let raw of found) {
        raw = raw.replace(/[),.;:!?\]]+$/, "");
        let href;
        try { href = new URL(raw).toString(); } catch { continue; }
        if (strip) href = clean(href);
        if (dedupe) { if (seen.has(href)) continue; seen.add(href); }
        const title = one ? line.slice(line.indexOf(" | ") + 3).trim() : "";
        out.push({ href, title: title || href.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), group });
      }
    }
    return out;
  };

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // Folders in first-seen order: [{ name, links }].
  const folders = (links, sort) => {
    const map = new Map();
    for (const l of links) {
      const key = sort === "site" ? site(l.href) : sort === "groups" ? `Group ${l.group + 1}` : "";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(l);
    }
    return [...map].map(([name, list]) => ({ name, links: list }));
  };

  // The Netscape bookmarks file every browser imports.
  const bookmarksFile = (links, { folder = "Saved tabs", sort = "site", now = Date.now() } = {}) => {
    const t = Math.floor(now / 1000);
    const a = (l, pad) => `${pad}<DT><A HREF="${esc(l.href)}" ADD_DATE="${t}">${esc(l.title)}</A>`;
    const groups = folders(links, sort);
    const inner = groups.length === 1 && !groups[0].name
      ? groups[0].links.map((l) => a(l, "        ")).join("\n")
      : groups.map((g) => `        <DT><H3 ADD_DATE="${t}">${esc(g.name)}</H3>\n        <DL><p>\n${g.links.map((l) => a(l, "            ")).join("\n")}\n        </DL><p>`).join("\n");
    return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- Made by Simmer's free Links to bookmarks tool: https://simmer.addobari.com/tools/links-to-bookmarks/ -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="${t}">${esc(folder || "Saved tabs")}</H3>
    <DL><p>
${inner}
    </DL><p>
</DL><p>
`;
  };

  const md = (s) => String(s).replace(/([\[\]])/g, "\\$1");
  const markdown = (links, { folder = "Saved tabs", sort = "site" } = {}) => {
    const groups = folders(links, sort);
    const list = (ls) => ls.map((l) => `- [${md(l.title)}](${l.href})`).join("\n");
    return `# ${folder || "Saved tabs"}\n\n` + (groups.length === 1 && !groups[0].name
      ? list(groups[0].links)
      : groups.map((g) => `## ${g.name}\n\n${list(g.links)}`).join("\n\n")) + "\n";
  };

  window.SimmerTools = { clean, parse, folders, bookmarksFile, markdown };
  if (typeof document === "undefined") return;

  const $ = (id) => document.getElementById(id);
  const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

  const copy = async (text, status, what) => {
    try { await navigator.clipboard.writeText(text); status.textContent = `Copied ${what}.`; }
    catch { status.textContent = "Couldn't copy. Select the box and copy by hand."; }
  };

  const openLinks = (root) => {
    const input = $("tool-input"), button = $("tool-open"), status = $("tool-status");
    const BATCH = 10;
    let links = [], next = 0;
    const read = () => {
      links = parse(input.value, { dedupe: $("tool-dedupe").checked, strip: $("tool-clean").checked });
      next = 0;
      button.disabled = !links.length;
      button.textContent = links.length > BATCH ? `Open the first ${BATCH}` : `Open ${plural(links.length, "link")}`;
      status.textContent = links.length ? `Found ${plural(links.length, "link")}.` + (links.length > BATCH ? ` They open ${BATCH} at a time.` : "")
        : input.value.trim() ? "No links found. Links start with http:// or https://." : "Paste links to begin.";
    };
    input.addEventListener("input", read);
    root.querySelectorAll("input[type=checkbox]").forEach((c) => c.addEventListener("change", read));
    button.addEventListener("click", () => {
      const batch = links.slice(next, next + BATCH);
      let blocked = 0;
      for (const l of batch) {
        const w = window.open("about:blank", "_blank");
        if (!w) { blocked++; continue; }
        w.opener = null;
        w.location.href = l.href;
      }
      if (blocked) {   // Chrome lets the first tabs through and blocks the rest, so carry on from the first blocked one
        next += batch.length - blocked;
        status.textContent = `Chrome blocked ${plural(blocked, "tab")}. Click the blocked pop-up icon at the end of the address bar, choose to always allow pop-ups from this site, then press Open again.`;
        return;
      }
      next += batch.length;
      const left = links.length - next;
      status.textContent = left ? `Opened ${next} of ${links.length}. Press again for the next ${Math.min(BATCH, left)}.` : `Opened ${plural(links.length, "link")}.`;
      button.textContent = left ? `Open the next ${Math.min(BATCH, left)}` : "Open them again";
      if (!left) next = 0;
    });
    read();
  };

  const linksToBookmarks = (root) => {
    const input = $("tool-input"), status = $("tool-status");
    const buttons = [$("tool-download"), $("tool-markdown"), $("tool-plain")];
    const opts = () => ({ folder: $("tool-folder").value.trim() || "Saved tabs", sort: $("tool-sort").value });
    let links = [];
    const read = () => {
      links = parse(input.value, { dedupe: $("tool-dedupe").checked, strip: $("tool-clean").checked });
      buttons.forEach((b) => (b.disabled = !links.length));
      const n = folders(links, opts().sort).length;
      status.textContent = links.length ? `${plural(links.length, "link")}` + (opts().sort === "none" ? " in one folder." : ` in ${plural(n, "folder")}.`)
        : input.value.trim() ? "No links found. Links start with http:// or https://." : "Paste links to begin.";
    };
    input.addEventListener("input", read);
    root.querySelectorAll("input, select").forEach((c) => c.addEventListener("change", read));
    $("tool-download").addEventListener("click", () => {
      const blob = new Blob([bookmarksFile(links, opts())], { type: "text/html" });
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "bookmarks-simmer.html" });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      status.textContent = "Downloaded bookmarks-simmer.html. Import it from the bookmark manager's ⋮ menu.";
    });
    $("tool-markdown").addEventListener("click", () => copy(markdown(links, opts()), status, "the Markdown"));
    $("tool-plain").addEventListener("click", () => copy(links.map((l) => l.href).join("\n") + "\n", status, plural(links.length, "link")));
    read();
  };

  const start = () => {
    const root = document.querySelector("[data-tool]");
    if (root?.dataset.tool === "open-links") openLinks(root);
    if (root?.dataset.tool === "links-to-bookmarks") linksToBookmarks(root);
    document.querySelectorAll("[data-print]").forEach((b) => b.addEventListener("click", () => window.print()));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
