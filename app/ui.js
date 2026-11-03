// Simmer components. Pages build their interface from these blocks; style.css draws them
// (every class they use starts with tb-, except the older shared ones: .list, .seg, .tag, .fav).
// No chrome.* here except the favicon URL, so the gallery (docs/design-system) can run anywhere.
// Catalogue and rules: docs/DESIGN-SYSTEM.md.

import { ICONS } from "./icons.js";

const SVG = "http://www.w3.org/2000/svg";

// ---------- element builder ----------

// h("button", { class: "tb-btn", onclick, "aria-label": "Close", dataset: { id } }, child, [more])
// Children may be nodes, strings, numbers, arrays, or null/false (skipped).
export function h(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = Array.isArray(value) ? value.filter(Boolean).join(" ") : value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "style" && typeof value === "object") {
      for (const [prop, v] of Object.entries(value)) prop.startsWith("--") ? node.style.setProperty(prop, v) : (node.style[prop] = v);
    }
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (key in node && !key.includes("-")) node[key] = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  append(node, kids);
  return node;
}
function append(node, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === "") continue;
    node.append(kid instanceof Node ? kid : String(kid));
  }
}
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
export { plural };

// ---------- icons ----------

// Puts the symbol sprite in the page once. icon() calls it, so pages never need their own sprite.
export function ensureIcons(doc = document) {
  if (doc.getElementById("tb-icons")) return;
  const sprite = doc.createElementNS(SVG, "svg");
  sprite.id = "tb-icons";
  sprite.setAttribute("aria-hidden", "true");
  sprite.setAttribute("style", "position:absolute;width:0;height:0;overflow:hidden");
  sprite.innerHTML = Object.entries(ICONS)
    .filter(([name]) => !doc.getElementById(`i-${name}`))
    .map(([name, body]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${body}</symbol>`).join("");
  doc.body.prepend(sprite);
}

// size: "sm" (12px), "md" (16px, default), "lg" (20px)
export function icon(name, size = "md") {
  ensureIcons();
  const node = document.createElementNS(SVG, "svg");
  node.setAttribute("class", `tb-i ${size}`);
  node.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG, "use");
  use.setAttribute("href", `#i-${name}`);
  node.append(use);
  return node;
}

// ---------- small pieces ----------

export const kbd = text => h("kbd", {}, text);

// tone: "" (muted) or "strong" (ink); "new" marks something a plan would create.
export const tag = (text, tone = "") => h("span", { class: ["tag", tone && `tag-${tone}`] }, text);

// A site's favicon: Chrome's _favicon service inside the extension, a letter tile elsewhere or on error.
export function favicon(url, favIconUrl = "") {
  const tile = () => {
    const { letter, hue } = letterOf(url);
    return h("span", { class: "fav letter", style: { background: `hsl(${hue} 42% 38%)` }, "aria-hidden": "true" }, letter);
  };
  let src = "";
  if (/^(https?:|data:image)/.test(favIconUrl)) src = favIconUrl;
  else if (globalThis.chrome?.runtime?.id && /^https?:/.test(url || "")) {
    src = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`);
  }
  if (!src) return tile();
  const img = h("img", { class: "fav", src, alt: "", loading: "lazy" });
  img.addEventListener("error", () => img.replaceWith(tile()), { once: true });
  return img;
}
function letterOf(url) {
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\d?\./, ""); } catch { /* not a URL */ }
  const letter = [...(host || "?")][0].toUpperCase();
  let hue = 0;
  for (const c of host) hue = (hue * 31 + c.charCodeAt(0)) % 360;
  return { letter, hue };
}

// Wraps the parts of text that match query in <mark>. Plain text when there's no query.
export function highlight(text, query) {
  const out = h("span");
  const words = [...new Set((query || "").toLowerCase().split(/\s+/).filter(Boolean))];
  if (!words.length) { out.textContent = text; return out; }
  const hay = text.toLowerCase();
  const marks = [];
  for (const w of words) for (let i = hay.indexOf(w); i !== -1; i = hay.indexOf(w, i + w.length)) marks.push([i, i + w.length]);
  marks.sort((a, b) => a[0] - b[0]);
  let at = 0;
  for (const [start, end] of marks) {
    if (start < at) continue;
    out.append(text.slice(at, start), h("mark", {}, text.slice(start, end)));
    at = end;
  }
  out.append(text.slice(at));
  return out;
}

// ---------- buttons ----------

// variant: "default" | "primary" | "quiet" | "link" | "danger"; size: "md" (32px) | "sm" (28px)
export function button({ label, icon: name, variant = "default", size = "md", kbd: key, title, onClick, disabled, type = "button" } = {}) {
  return h("button", {
    type, title, disabled,
    class: ["tb-btn", size === "sm" && "sm", variant !== "default" && variant, variant === "primary" && "primary", variant === "danger" && "danger", variant === "link" && "link"],
    onclick: onClick,
  }, name ? icon(name, "sm") : null, label ? h("span", {}, label) : null, key ? kbd(key) : null);
}

// A square icon-only button. label is required: it is the accessible name and the tooltip.
// tone: "" or "warn" (turns red on hover, for things that close or remove).
export function iconButton({ icon: name, label, onClick, size = "md", tone = "", pressed } = {}) {
  return h("button", {
    type: "button", class: ["tb-ib", size === "sm" && "sm", tone], "aria-label": label, title: label,
    "aria-pressed": pressed == null ? null : String(!!pressed), onclick: onClick,
  }, icon(name));
}

// One of a few, as small buttons inside a row. options: [{ value, label, title }]. The row takes the
// keys, so these stay out of the tab order. Returns the control with .set(value).
export function choice({ options, value, onChange, label = "Choose" }) {
  const box = h("span", { class: "tb-choice", role: "radiogroup", "aria-label": label });
  const buttons = options.map(option => h("button", {
    type: "button", role: "radio", tabindex: "-1", title: option.title, dataset: { value: option.value },
    onclick: event => { event.stopPropagation(); box.set(option.value); onChange?.(option.value); },
  }, option.label));
  box.append(...buttons);
  box.set = next => { for (const b of buttons) b.setAttribute("aria-checked", String(b.dataset.value === next)); };
  box.set(value);
  return box;
}

// ---------- fields ----------

export function searchField({ placeholder = "Search", value = "", onInput, label, shortcut } = {}) {
  const input = h("input", { type: "search", placeholder, value, "aria-label": label || placeholder, autocomplete: "off", spellcheck: false });
  if (onInput) input.addEventListener("input", () => onInput(input.value));
  const clear = h("button", { type: "button", class: "tb-search-clear", "aria-label": "Clear search", title: "Clear search", tabindex: "-1",
    onclick: event => { event.preventDefault(); input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true })); input.focus(); } }, icon("x"));
  const wrap = h("label", { class: "tb-search" }, icon("search"), input, shortcut ? kbd(shortcut) : null, clear);
  const mark = () => wrap.classList.toggle("has-text", !!input.value);
  input.addEventListener("input", mark);
  mark();
  wrap.input = input;
  return wrap;
}

// options: [{ value, label, count }]. Returns the control with .set(value) and .count(value, n).
export function segmented({ options, value, onChange, label = "View" }) {
  const seg = h("div", { class: "seg", role: "tablist", "aria-label": label, style: { "--n": options.length } });
  const buttons = options.map(option => h("button", {
    type: "button", role: "tab", dataset: { value: option.value },
    onclick: () => { seg.set(option.value); onChange?.(option.value); },
  }, option.label, h("span", { class: "n" }, option.count ?? "")));
  seg.append(...buttons);
  seg.set = next => {
    const i = Math.max(0, options.findIndex(o => o.value === next));
    seg.style.setProperty("--i", i);
    buttons.forEach((b, j) => b.setAttribute("aria-selected", String(i === j)));
  };
  seg.count = (which, n) => { const b = buttons.find(x => x.dataset.value === which); if (b) b.lastChild.textContent = n ? String(n) : ""; };
  seg.set(value ?? options[0].value);
  return seg;
}

// ---------- rows and lists ----------

// The one row used everywhere: a 16px lead, a title with optional meta line, a side value, and
// actions that appear on hover (and replace the side value while shown).
//   lead:       a node (icon("folder"), favicon(url)) shown in the 16px slot
//   title:      string or node; href makes it a link, onOpen makes it a button
//   meta:       string or node under the title
//   side:       string or node at the end, muted (a count, an age, an impact)
//   actions:    [nodes] shown on hover / focus (iconButton, button size "sm")
//   check:      { checked, label, onChange(checked, event) } turns the lead into a checkbox on hover
//   density:    "s" (30px, trees and menus), "m" (36px, side panel), "l" (40px+, Manage pages)
//   note:       a third line of help text under the meta (an archived page's summary); up to 2 lines
//   wrap:       let title and meta wrap (suggestions); current, muted: states
export function row({ lead, title, href, onOpen, meta, note, side, actions = [], check, density = "m", wrap, current, muted, attrs = {} } = {}) {
  const titleNode = href
    ? h("a", { class: "tb-title", href, target: "_blank", rel: "noreferrer" }, title)
    : onOpen ? h("button", { type: "button", class: "tb-title", onclick: onOpen }, title)
      : h("span", { class: "tb-title" }, title);
  let box = null;
  if (check) {
    box = h("input", { type: "checkbox", checked: !!check.checked, "aria-label": check.label || "Select" });
    box.addEventListener("click", event => check.onChange?.(box.checked, event));
  }
  const node = h("div", {
    role: "listitem", ...attrs,
    class: ["tb-row", density, wrap && "wrap", current && "is-current", muted && "is-muted", check?.checked && "is-checked"],
  },
    h("span", { class: ["tb-lead", check && "can-check"] }, lead, box),
    h("span", { class: "tb-main" }, titleNode, meta != null && meta !== "" ? h("span", { class: "tb-meta" }, meta) : null,
      note ? h("span", { class: "tb-note", title: typeof note === "string" ? note : null }, note) : null),
    h("span", { class: "tb-side" },
      side != null && side !== "" ? h("span", { class: "tb-count" }, side) : null,
      actions.length ? h("span", { class: "tb-acts" }, actions) : null),
  );
  node.checkbox = box;
  return node;
}

// A list of rows. boxed: the bordered group of hairline rows used on Manage pages.
// selecting: once anything is checked, every row shows its checkbox.
export function list(rows, { boxed = false, selecting = false, label } = {}) {
  return h("div", { role: "list", "aria-label": label, class: ["tb-list", boxed && "boxed", selecting && "is-selecting"] }, rows);
}

// The small heading above a list: label on the left, a count on the right.
export const listHead = (label, count) => h("div", { class: "tb-list-head" }, h("span", {}, label), count != null ? h("span", { class: "n" }, count) : null);

// ---------- tree ----------

// items: flat, in display order: [{ id, label, level (1-based), count, hasChildren, expanded, flag }]
// selected: id. onToggle(id), onOpen(id). Keyboard: ↑↓ move, → expand / first child,
// ← collapse / parent, Enter or Space open, Home/End. Focus survives re-renders via tree.focusId.
export function tree({ items, selected, onToggle, onOpen, label = "Folders", query = "" }) {
  const root = h("div", { class: "tb-tree", role: "tree", "aria-label": label });
  const rows = items.map(item => {
    const twist = h("button", {
      type: "button", class: ["tb-twist", !item.hasChildren && "leaf"], tabindex: "-1",
      "aria-label": item.expanded ? `Collapse ${item.label}` : `Expand ${item.label}`,
      onclick: event => { event.stopPropagation(); if (item.hasChildren) onToggle?.(item.id); },
    }, icon("chev", "sm"));
    const node = h("div", {
      role: "treeitem", tabindex: item.id === selected ? "0" : "-1",
      class: ["tb-row", "s", item.id === selected && "is-current"],
      "aria-level": item.level, "aria-selected": String(item.id === selected),
      "aria-expanded": item.hasChildren ? String(!!item.expanded) : null,
      dataset: { id: item.id }, style: { "--lvl": item.level - 1 },
      onclick: () => onOpen?.(item.id),
    },
      twist,
      h("span", { class: "tb-main" }, h("span", { class: "tb-title" }, highlight(item.label, query))),
      h("span", { class: "tb-side" }, item.flag ? h("i", { class: "tb-flag", title: item.flag }) : null, item.count != null ? h("span", { class: "tb-count" }, item.count) : null),
    );
    return node;
  });
  root.append(...rows);
  if (!rows.some(r => r.tabIndex === 0) && rows[0]) rows[0].tabIndex = 0;
  const byId = new Map(items.map((item, i) => [String(item.id), i]));
  root.addEventListener("keydown", event => {
    const at = rows.indexOf(document.activeElement);
    if (at < 0) return;
    const item = items[at];
    const go = i => { const r = rows[Math.max(0, Math.min(rows.length - 1, i))]; rows.forEach(x => (x.tabIndex = -1)); r.tabIndex = 0; r.focus(); root.focusId = r.dataset.id; };
    const parentIndex = () => { for (let i = at - 1; i >= 0; i--) if (items[i].level < item.level) return i; return at; };
    if (event.key === "ArrowDown") go(at + 1);
    else if (event.key === "ArrowUp") go(at - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(rows.length - 1);
    else if (event.key === "ArrowRight") { if (item.hasChildren && !item.expanded) { root.focusId = item.id; onToggle?.(item.id); } else if (item.hasChildren) go(at + 1); else return; }
    else if (event.key === "ArrowLeft") { if (item.hasChildren && item.expanded) { root.focusId = item.id; onToggle?.(item.id); } else go(parentIndex()); }
    else if (event.key === "Enter" || event.key === " ") { root.focusId = item.id; onOpen?.(item.id); }
    else return;
    event.preventDefault();
  });
  // Put focus back on the same folder after the caller re-renders: tree.restoreFocus(previousTree)
  root.restoreFocus = previous => {
    const id = previous?.focusId;
    if (id == null || !previous.contains(document.activeElement) && document.activeElement !== document.body) return;
    const i = byId.get(String(id));
    if (i == null) return;
    rows.forEach(x => (x.tabIndex = -1));
    rows[i].tabIndex = 0;
    rows[i].focus({ preventScroll: true });
    root.focusId = id;
  };
  return root;
}

// ---------- breadcrumb title ----------

// parts: [{ label, onClick }] for the ancestors; current: the folder's name.
// onRename(newName) makes the current part editable (click, or Enter while focused).
export function crumbs({ parts = [], current, onRename, actions = [] }) {
  const here = h("button", { type: "button", class: "tb-here", title: onRename ? "Rename" : null, disabled: !onRename }, current);
  if (onRename) here.addEventListener("click", () => {
    const input = h("input", { type: "text", value: current, class: "tb-here-edit", "aria-label": "Folder name", maxlength: 80 });
    here.replaceWith(input);
    input.focus(); input.select();
    let done = false;
    const finish = save => {
      if (done) return; done = true;
      const name = input.value.trim();
      if (save && name && name !== current) onRename(name);
      else input.replaceWith(here);
    };
    input.addEventListener("keydown", e => { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); });
    input.addEventListener("blur", () => finish(true));
  });
  return h("div", { class: "tb-crumbs" },
    h("ol", {}, parts.map(p => h("li", {}, h("button", { type: "button", class: "tb-crumb", onclick: p.onClick }, p.label))), h("li", {}, here)),
    actions.length ? h("div", { class: "tb-crumbs-acts" }, actions) : null);
}

// ---------- notices ----------

// One line above the content: an icon, a sentence, one action.
//   expandable: body (a node) opens under it when the line is clicked; expanded: start open.
export function notice({ icon: name = "info", text, action, onAction, body, expanded = false, muted = false } = {}) {
  const chev = body ? icon("chev", "sm") : null;
  const line = h("div", { class: ["tb-notice", body && "is-toggle", muted && "is-muted"], role: body ? "button" : null, tabindex: body ? "0" : null, "aria-expanded": body ? String(expanded) : null },
    icon(name), h("span", { class: "tb-notice-text" }, text), chev,
    action ? button({ label: action, variant: "quiet", size: "sm", onClick: event => { event.stopPropagation(); onAction?.(event); } }) : null);
  const wrap = h("div", { class: "tb-notice-wrap" }, line);
  if (body) {
    const holder = h("div", { class: "tb-notice-body tb-reveal", hidden: !expanded }, body);
    const toggle = () => { const open = line.getAttribute("aria-expanded") !== "true"; line.setAttribute("aria-expanded", String(open)); holder.hidden = !open; };
    line.addEventListener("click", toggle);
    line.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    wrap.append(holder);
  }
  return wrap;
}

// Shows at most `max` notices (already in priority order); the rest fold into one "N more" line
// that opens them. specs: notice() options, falsy entries skipped.
export function noticeStack(specs, { max = 2 } = {}) {
  const shown = specs.filter(Boolean);
  if (!shown.length) return null;
  const first = shown.slice(0, max).map(notice);
  const rest = shown.slice(max);
  if (!rest.length) return h("div", { class: "tb-notices" }, first);
  const names = rest.map(s => s.short || s.text).join(", ");
  const more = notice({ icon: "dots", text: `${rest.length} more: ${names}`, muted: true, body: h("div", { class: "tb-notices" }, rest.map(notice)) });
  more.classList.add("is-more");
  return h("div", { class: "tb-notices" }, first, more);
}

// ---------- floating: popover, menu, selection bar, toast ----------

let openPop = null;
// A floating panel under (or above) anchor, on dense glass so what's beneath never shows through. Closes on Esc, outside click, or close().
export function popover(anchor, content, { width, align = "start", onClose } = {}) {
  closePopover();
  const pop = h("div", { class: "tb-pop", role: "dialog" }, content);
  if (width) pop.style.width = `${width}px`;
  document.body.append(pop);
  const place = () => {
    const a = anchor.getBoundingClientRect(), p = pop.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    // start-aligned unless that would run off the right edge; then end-aligned to the anchor
    let left = align === "end" || a.left + p.width > vw - 8 ? a.right - p.width : a.left;
    left = Math.max(8, Math.min(left, vw - p.width - 8));
    let top = a.bottom + 6;
    if (top + p.height > vh - 8) top = Math.max(8, a.top - p.height - 6);
    Object.assign(pop.style, { left: `${left}px`, top: `${top}px` });
  };
  place();
  const away = event => { if (!pop.contains(event.target) && !anchor.contains(event.target)) closePopover(); };
  const esc = event => { if (event.key === "Escape") { event.preventDefault(); closePopover(); anchor.focus(); } };
  setTimeout(() => document.addEventListener("mousedown", away), 0);
  document.addEventListener("keydown", esc, true);
  openPop = { pop, close: () => {
    document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc, true);
    pop.classList.add("is-closing");
    setTimeout(() => pop.remove(), still() ? 0 : 140);
    onClose?.();
    dispatchEvent(new Event("tb-popover-closed"));
  } };
  pop.place = place;
  return pop;
}
export function closePopover() { const p = openPop; openPop = null; p?.close(); }
export const popoverOpen = () => !!openPop;

// items: [{ icon, label, kbd, onClick, danger }] or "-" for a separator, or { heading }.
// ↑↓ moves, Enter runs, Esc closes.
export function menu(anchor, items, options = {}) {
  const buttons = [];
  const content = h("div", { class: "tb-menu", role: "menu" }, items.map(item => {
    if (item === "-") return h("hr", { class: "tb-menu-sep" });
    if (item.heading) return h("div", { class: "tb-menu-label" }, item.heading);
    const b = h("button", { type: "button", role: "menuitem", class: ["tb-menu-item", item.danger && "danger"], onclick: () => { closePopover(); item.onClick?.(); } },
      item.icon ? icon(item.icon) : null, h("span", {}, item.label), item.kbd ? kbd(item.kbd) : null);
    buttons.push(b);
    return b;
  }));
  const byKey = new Map(items.filter(item => item?.kbd && item.onClick).map(item => [item.kbd.toLowerCase(), item]));
  content.addEventListener("keydown", event => {
    const at = buttons.indexOf(document.activeElement);
    const hit = !event.metaKey && !event.ctrlKey && !event.altKey && byKey.get(event.key.toLowerCase());
    if (hit) { event.preventDefault(); event.stopPropagation(); closePopover(); hit.onClick(); return; }
    if (event.key === "ArrowDown") buttons[(at + 1) % buttons.length].focus();
    else if (event.key === "ArrowUp") buttons[(at - 1 + buttons.length) % buttons.length].focus();
    else return;
    event.preventDefault();
  });
  const pop = popover(anchor, content, { width: options.width || 240, align: options.align || "end" });
  buttons[0]?.focus();
  return pop;
}

// The floating capsule shown while things are selected. actions: [{ icon, label, onClick }].
// Returns the bar with .update(count); count 0 hides it.
export function selectionBar({ actions, onClear, noun = "selected" }) {
  const n = h("b", {}, "0");
  const bar = h("div", { class: "tb-selbar glass", role: "toolbar", "aria-label": "Selection", hidden: true },
    h("span", { class: "tb-selbar-count" }, n, noun),
    h("span", { class: "tb-selbar-div" }),
    actions.map(a => h("button", { type: "button", class: "tb-selbar-act", onclick: a.onClick }, icon(a.icon, "sm"), h("span", {}, a.label))),
    iconButton({ icon: "x", label: "Clear selection", onClick: onClear, size: "sm" }));
  bar.update = count => { n.textContent = String(count); bar.hidden = !count; };
  return bar;
}

// One toast per page. undo: async () => void shows an Undo button; error: red.
let toastTimer;
export function toast(text, { undo, error = false, ms } = {}) {
  let node = document.getElementById("tb-toast");
  if (!node) { node = h("div", { id: "tb-toast", class: "tb-toast", role: "status", "aria-live": "polite" }); document.body.append(node); }
  const btn = undo ? h("button", { type: "button", onclick: async () => { btn.disabled = true; try { await undo(); toast("Undone."); } catch (e) { toast(`Couldn't undo: ${e.message || e}`, { error: true }); } } }, "Undo") : null;
  node.replaceChildren(...[h("span", {}, text), btn].filter(Boolean));
  node.classList.toggle("err", !!error);
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), ms || (undo ? 6000 : 3200));
}

// ---------- states and feedback ----------

export function empty({ title, text, action } = {}) {
  return h("div", { class: "empty-box" }, title ? h("strong", {}, title) : null, text ? h("p", {}, text) : null, action || null);
}
export function callout({ text, action } = {}) {
  return h("div", { class: "callout" }, h("span", {}, text), action || null);
}
// value 0..1
export function progress(value, label = "Progress") {
  const fill = h("i", { style: { width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` } });
  const bar = h("div", { class: "tb-progress", role: "progressbar", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(value * 100) }, fill);
  bar.set = v => { fill.style.width = `${Math.round(v * 100)}%`; bar.setAttribute("aria-valuenow", Math.round(v * 100)); };
  return bar;
}

// A small button that names a folder (path in the tooltip). Used for "file here" suggestions.
export function folderChip({ name, path = "", onClick }) {
  return h("button", { type: "button", class: "tb-chip", title: path || name, onclick: onClick }, icon("folder", "sm"), h("span", {}, name));
}

// A command or config snippet to paste somewhere else, with a Copy button.
//   text: the snippet; label: what it is (the Copy button's name says "Copy <label>")
export function codeBlock({ text, label = "command" }) {
  const copy = iconButton({ icon: "copy", label: `Copy ${label}`, size: "sm", onClick: async () => {
    try { await navigator.clipboard.writeText(text); toast("Copied."); }
    catch { toast("Couldn't reach the clipboard. Select the text and copy it.", { error: true }); }
  } });
  return h("div", { class: "tb-code" }, h("pre", {}, h("code", {}, text)), copy);
}

// "Do this to these?" before anything runs: a question, the items it will touch, and the primary
// named for the result. Nothing happens until the primary is pressed; Esc or Cancel drops it.
//   items:     [{ id, lead, title, meta }]; pickable shows a checkbox per item (all ticked)
//   confirm:   n => primary label for n ticked items ("Archive 6 tabs"); disabled at 0
//   body:      an optional node between the question and the items (a rule line, say)
//   onConfirm(ids), onCancel(); note: a muted line under the items ("2 pinned tabs stay")
export function confirmBox({ title, items = [], pickable = false, confirm, body, note, onConfirm, onCancel }) {
  const picked = new Set(items.map(item => item.id));
  const primary = button({ label: confirm(picked.size), variant: "primary", size: "sm", onClick: async () => {
    primary.disabled = cancel.disabled = true;
    try { await onConfirm?.([...picked]); } finally { primary.disabled = !picked.size; cancel.disabled = false; }
  } });
  const cancel = button({ label: "Cancel", variant: "quiet", size: "sm", onClick: () => onCancel?.() });
  const sync = () => { primary.querySelector("span").textContent = confirm(picked.size); primary.disabled = !picked.size; };
  const rows = items.map(item => row({
    density: "s", lead: item.lead, title: item.title, meta: item.meta,
    check: pickable ? { checked: true, label: `Include ${item.title}`, onChange: on => { on ? picked.add(item.id) : picked.delete(item.id); sync(); } } : null,
  }));
  const box = h("div", { class: "tb-confirm tb-reveal", role: "group", "aria-label": title },
    h("p", { class: "tb-confirm-title" }, title),
    body || null,
    rows.length ? list(rows, { selecting: pickable, label: "Included" }) : null,
    note ? h("p", { class: "tb-confirm-note" }, note) : null,
    h("div", { class: "tb-confirm-foot" }, primary, cancel));
  box.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel?.(); } });
  box.focusPrimary = () => primary.focus();
  return box;
}

// ---------- importer: bring tabs in from another tab manager ----------

// Paste or drop an export. The worker works out the format and previews it (importPreview); nothing
// changes until the button is pressed (importTabs). send is chrome.runtime.sendMessage.
// primary: false where the page already has its one primary (the welcome).
const IMPORT_MAX_BYTES = 32 * 1024 * 1024;   // Chrome's messages stop at 64 MB
export function importer({ send, primary = true, onDone } = {}) {
  let text = "", run = 0, timer;
  const count = n => n.toLocaleString("en-US");
  const counted = (n, word) => `${count(n)} ${word}${n === 1 ? "" : "s"}`;
  const field = h("textarea", { class: "tb-import-text", rows: 4, spellcheck: false, "aria-label": "Your export", placeholder: "Paste your export here, or drop a file" });
  const picker = h("input", { type: "file", hidden: true, accept: ".txt,.json,text/plain,application/json" });
  const status = h("p", { class: "tb-import-status", role: "status" });
  const preview = h("div", { class: "tb-import-preview" });
  const say = (message, error = false) => { status.textContent = message; status.classList.toggle("err", error); };
  const clear = () => {
    run++; text = ""; field.value = ""; picker.value = "";
    field.placeholder = "Paste your export here, or drop a file";
    preview.replaceChildren();
  };

  function show(found) {
    const parts = [found.skipped.duplicates && `${count(found.skipped.duplicates)} already in your archive`, found.skipped.unsafe && `${count(found.skipped.unsafe)} that aren't web pages`, found.skipped.other && `${count(found.skipped.other)} that couldn't be used`].filter(Boolean);
    const skippedLine = parts.length ? `Skipping ${parts.join(", ")}.` : "";
    if (!found.tabs) return preview.replaceChildren(h("p", { class: "tb-import-head" }, "Nothing new to add."), h("p", { class: "tb-import-status" }, skippedLine), button({ label: "Clear", variant: "quiet", size: "sm", onClick: clear }));
    const summary = `${counted(found.tabs, "tab")}${found.source === "list" ? "" : ` in ${counted(found.groups, "group")}`} from ${found.label}`;
    const marks = h("input", { type: "checkbox" });
    const add = button({ label: `Add ${counted(found.tabs, "tab")} to your archive`, variant: primary ? "primary" : "default", size: "sm", onClick: async () => {
      add.disabled = cancel.disabled = true;
      const mine = ++run;
      say("Adding…");
      let reply;
      try { reply = await send({ cmd: "importTabs", text, bookmarks: marks.checked }); } catch (e) { reply = { error: e.message }; }
      if (mine !== run) return;
      if (!reply || reply.error) {
        add.disabled = cancel.disabled = false;
        return say(`Couldn't import: ${reply?.error || "Simmer didn't answer"}. Nothing was changed.`, true);
      }
      clear();
      say(reply.bookmarkError || "");
      toast(`${reply.text || "Nothing new to add"}.`, reply.activityId ? { undo: async () => {
        const undone = await send({ cmd: "undo", id: reply.activityId });
        if (undone?.error) throw new Error(undone.error);
      } } : {});
      onDone?.(reply);
    } });
    const cancel = button({ label: "Cancel", variant: "quiet", size: "sm", onClick: () => { clear(); say(""); } });
    preview.replaceChildren(
      h("p", { class: "tb-import-head" }, summary),
      skippedLine ? h("p", { class: "tb-import-status" }, skippedLine) : null,
      list(found.sample.map(tab => row({ density: "s", lead: favicon(tab.url), title: tab.title, meta: tab.group }))),
      found.tabs > found.sample.length ? h("p", { class: "tb-import-status" }, `and ${count(found.tabs - found.sample.length)} more`) : null,
      h("label", { class: "tb-import-opt" }, marks, h("span", {}, "Also save as bookmarks")),
      h("p", { class: "tb-import-status" }, "No tabs open. They wait in your archive, searchable, and Undo takes them all out again."),
      h("div", { class: "tb-import-foot" }, add, cancel));
  }

  async function check() {
    const mine = ++run;
    preview.replaceChildren();
    if (!text.trim()) return say("");
    say("Checking…");
    let found;
    try { found = await send({ cmd: "importPreview", text }); } catch (e) { found = { error: e.message }; }
    if (mine !== run) return;
    if (!found || found.error) return say(found?.error || "Simmer didn't answer. Nothing was imported.", true);
    say("");
    show(found);
  }

  async function take(file) {
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) return say("That file is over 32 MB, too big to read here. Nothing was imported.", true);
    try { text = await file.text(); } catch { return say("That file couldn't be read. Nothing was imported.", true); }
    field.value = "";
    field.placeholder = file.name;
    check();
  }

  field.addEventListener("input", () => {
    text = field.value;
    clearTimeout(timer);
    timer = setTimeout(check, 300);
  });
  picker.addEventListener("change", () => take(picker.files?.[0]));
  const box = h("div", {
    class: "tb-import",
    ondragover: event => { event.preventDefault(); box.classList.add("is-over"); },
    ondragleave: () => box.classList.remove("is-over"),
    ondrop: event => { event.preventDefault(); box.classList.remove("is-over"); take(event.dataTransfer?.files?.[0]); },
  },
    field,
    h("div", { class: "tb-import-foot" }, button({ label: "Choose a file", size: "sm", onClick: () => picker.click() }), picker),
    status, preview);
  return box;
}

// "3 hours ago" style, for meta lines. ts in ms.
export function ago(ts, now = Date.now()) {
  if (!ts) return "";
  const m = Math.round((now - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const hrs = Math.round(m / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const d = Math.round(hrs / 24);
  return d === 1 ? "yesterday" : d < 60 ? `${d} days ago` : `${Math.round(d / 30)} months ago`;
}

// ---------- Simmer: the list, first run, morning page ----------

// Where a favicon comes from. The product uses Chrome's _favicon service (favicon above does that
// inside the extension). A page outside the extension, like the gallery, sets this.
let iconFor = () => "";
export const setIconSource = fn => { iconFor = fn; };
export const fav = (url, favIconUrl = "") => favicon(url, iconFor(url) || favIconUrl);

const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

// The simmer behind a header: a butter glow with bubbles rising through it. stir() sets it going (the
// panel opening, a count changing); after settleAfter each bubble finishes its round and it rests,
// leaving the glow. It moves by script, not CSS, so a redraw that rebuilds the header carries on
// instead of starting over. Reduced motion: only the glow.
const BUBBLES = Array.from({ length: 12 }, (_, i) => {
  const at = (n, a, b) => a + ((n * 7919) % 97) / 97 * (b - a);
  return { size: Math.round(at(i + 1, 7, 22)), right: Math.round(at(i + 3, 12, 130)), ms: Math.round(at(i + 5, 4500, 7500)), sway: Math.round(at(i + 9, -14, 14)), wait: Math.round(at(i + 2, 0, 3200)) };
});
export function simmer({ settleAfter = 8000 } = {}) {
  const heat = h("i", { class: "heat" });
  const bubbles = BUBBLES.map(b => h("i", { class: "bub", style: { width: `${b.size}px`, height: `${b.size}px`, right: `${b.right}px` } }));
  const node = h("div", { class: "tb-simmer", "aria-hidden": "true" }, heat, bubbles);
  const start = [
    () => heat.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(1.08)", opacity: .8 }], { duration: 2500, iterations: Infinity, direction: "alternate", easing: "ease-in-out" }),
    ...bubbles.map((bubble, i) => () => bubble.animate([
      { opacity: 0, transform: "translateY(0) scale(.5)" },
      { opacity: .95, offset: .18 },
      { opacity: .75, offset: .7 },
      { opacity: 0, transform: `translate(${BUBBLES[i].sway}px, -96px) scale(1)` },
    ], { duration: BUBBLES[i].ms, delay: BUBBLES[i].wait, iterations: Infinity, easing: "cubic-bezier(.35, 0, .5, 1)" })),
  ];
  let moving = [], timer;
  const settle = () => {
    moving.forEach((move, i) => {
      const round = move.effect.getComputedTiming().currentIteration;
      // Still waiting to start: it never appeared, so it simply doesn't. Otherwise it finishes this round;
      // the glow goes back and forth, so it stops on a way back, where it's at rest.
      if (round == null) move.cancel();
      else move.effect.updateTiming({ iterations: round + (i === 0 && round % 2 === 0 ? 2 : 1) });
    });
  };
  const stir = () => {
    if (still() || !node.animate) return;
    clearTimeout(timer);
    // One still in its last round carries on; one that has stopped starts again from the bottom.
    moving = start.map((begin, i) => {
      const move = moving[i];
      if (move?.playState === "running") { move.effect.updateTiming({ iterations: Infinity }); return move; }
      return begin();
    });
    timer = setTimeout(settle, settleAfter);
  };
  return { node, stir };
}

// changed: the headline just changed (a count went down), so it rolls in rather than swapping.
// art: a simmer().node to sit behind it.
export function brandHead({ title, sub, large = false, lang, tools, changed = false, art }) {
  return h("header", { class: ["tb-brand", large && "is-large"] },
    art || null,
    tools || null,
    h("div", { class: "mark" }, "Simmer"),
    title ? h("h1", { lang, class: changed && "is-changed" }, title) : null,
    sub ? h("div", { class: ["sub", changed && "is-changed"] }, h("p", {}, sub)) : null);
}

// Each site's favicon, then the tab's title when there's one tab and it says more than the name.
export function faces(tabs, name = "") {
  const hosts = [...new Set(tabs.map(tab => hostOf(tab.url)))];
  const first = new Map(tabs.map(tab => [hostOf(tab.url), tab]).reverse());
  const shown = hosts.slice(0, 7);
  const extra = hosts.length - shown.length;
  const title = tabs.length === 1 ? tabs[0].title : "";
  const same = title && title.toLowerCase().startsWith(name.replace(/…$/, "").toLowerCase());
  const label = extra > 0 ? `+${extra}` : hosts.length === 1 && tabs.length === 1 && !same ? title : hosts.length === 1 && tabs.length > 1 ? hosts[0] : "";
  return h("span", { class: "tb-faces" }, shown.map(host => fav(first.get(host).url, first.get(host).favIconUrl)), label ? h("span", { class: "only" }, label) : null);
}

// Anything in the list that opens: a head that is one button, and a fold beneath it. Opening and
// closing ease the fold's height; closing waits for that before onToggle repaints.
const still = () => !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
function closeThen(node, onToggle) {
  const fold = node.querySelector(":scope > .tb-fold");
  if (!fold || still()) return onToggle?.();
  node.classList.add("is-closing");
  let done = false;
  const go = () => { if (!done) { done = true; onToggle?.(); } };
  fold.addEventListener("animationend", go, { once: true });
  setTimeout(go, 400);
}
const fold = (id, label, kids) => h("div", { class: "tb-fold", id, role: "group", "aria-label": label }, h("div", { class: "tb-fold-inner" }, kids));
let foldIds = 0;

// A task: its name and how many tabs, then its first tabs, with the rest a click away. The name goes
// back to the task; on the back burner it only names it. Actions show on hover and keyboard focus, in
// place of the count. State: open (showing every tab), opening (open, just now), away, renaming, busy
// (true, or the words for what's happening: "Putting away…").
const FEW = 3;
export function taskRow({ name, tabs, open = false, opening = false, away = false, renaming = false, busy = false, rowClass = "", tabRowClass = "", query, dataId, bringLabel = "Bring back",
  onToggle, onOpenAll, onPutAway, onBringBack, onRename, onSaveName, onCancelName, onOpenTab, onMoveTab } = {}) {
  const shown = query ? tabs.filter(tab => tab.title.toLowerCase().includes(query.toLowerCase())) : tabs;
  // Four tabs show as four: "1 more" would hide less than it costs.
  const cut = !query && shown.length > FEW + 1;
  const rest = cut ? shown.slice(FEW) : [];
  const expanded = open && cut;
  const foldId = `tb-fold-${++foldIds}`;
  const node = h("div", { class: ["tb-task", "tb-disc", away && "is-away", expanded && "is-open", expanded && opening && "is-opening", busy && "is-busy", rowClass], dataset: dataId ? { task: dataId } : undefined, "aria-busy": busy ? "true" : null });
  const doing = typeof busy === "string" ? busy : busy ? "Working…" : "";

  let title;
  if (renaming) {
    // Enter saves, Escape cancels, clicking away saves: a rename always ends.
    title = h("input", { class: "tb-name-edit", type: "text", value: name, "aria-label": "Name" });
    let settled = false;
    const end = keep => { if (settled) return; settled = true; keep ? onSaveName?.(title.value) : onCancelName?.(); };
    title.addEventListener("keydown", event => {
      event.stopPropagation();
      if (event.key === "Enter") end(true);
      if (event.key === "Escape") end(false);
    });
    title.addEventListener("blur", () => end(true));
  } else title = away
    ? h("span", { class: "tb-task-name tb-title", tabindex: "0" }, name)
    : h("button", { type: "button", class: "tb-task-name tb-title", onclick: onOpenAll, disabled: busy }, name);
  // Small icon buttons in a fixed slot at the end, where the count is at rest: they never cover the name.
  const actions = away
    ? [iconButton({ icon: "restore", label: bringLabel, size: "sm", onClick: onBringBack })]
    : [iconButton({ icon: "archive", label: "Put away", size: "sm", onClick: onPutAway }),
      iconButton({ icon: "dots", label: `More for ${name}`, size: "sm", onClick: event => menu(event.currentTarget, [
        { icon: "tabs", label: "Switch to", kbd: "O", onClick: onOpenAll },
        { icon: "archive", label: "Put away", kbd: "E", onClick: onPutAway },
        { icon: "pencil", label: "Rename", kbd: "R", onClick: onRename },
      ]) })];
  for (const action of actions) action.disabled = !!busy;
  node.append(h("div", { class: "tb-task-head" }, title,
    h("span", { class: "tb-task-end" }, doing
      ? h("span", { class: "tb-task-doing", role: "status" }, doing)
      : [h("span", { class: "tb-task-count" }, `${tabs.length} ${tabs.length === 1 ? "tab" : "tabs"}`), renaming ? null : h("span", { class: "tb-task-acts" }, actions)])));

  const line = (tab, i) => {
    const r = row({
      density: "m", lead: fav(tab.url, tab.favIconUrl), title: tab.title, muted: away,
      ...(away ? {} : onOpenTab ? { onOpen: () => onOpenTab(tab) } : { href: "#" }), side: "",
      actions: away ? [] : [iconButton({ icon: "folder-move", label: "Move to…", size: "sm", onClick: event => onMoveTab?.(event.currentTarget, tab) })],
    });
    if (i === 0 && tabRowClass) r.classList.add(tabRowClass);
    return r;
  };
  node.append(h("div", { class: "tb-task-lines" }, (cut ? shown.slice(0, FEW) : shown).map(line)));
  if (!cut) return node;
  const toggle = () => (expanded ? closeThen(node, onToggle) : onToggle?.());
  const more = h("button", { type: "button", class: "tb-task-more", "aria-expanded": String(expanded), "aria-controls": expanded ? foldId : null, onclick: toggle },
    expanded ? "Show fewer" : [h("span", { class: "tb-faces" }, [...new Map(rest.map(tab => [hostOf(tab.url), tab])).values()].slice(0, 5).map(tab => fav(tab.url, tab.favIconUrl))), `${rest.length} more`]);
  if (expanded) node.append(fold(foldId, `${name}, more tabs`, rest.map((tab, i) => line(tab, i + FEW))));
  node.append(more);
  return node;
}

// The last thing Simmer did, with its Undo in plain view, and a button to everything else it did.
// fresh: it only just happened, so it rises in.
export function recentLine({ entries, fresh = false, onAll }) {
  return h("div", { class: ["tb-recent", fresh && "is-fresh"], role: "group", "aria-label": "Last action" },
    logEntry(entries[0]),
    onAll ? iconButton({ icon: "history", label: "Everything Simmer did", size: "sm", onClick: onAll }) : null);
}

// One action: what happened, and when (or that it was undone) beneath, with its Undo at the end.
const logEntry = entry => h("div", { class: ["tb-log", entry.undone && "is-undone"] },
  h("span", { class: "what" }, h("span", { class: "text" }, entry.text), h("span", { class: "tb-when" }, entry.undone ? `Undone, ${entry.when}` : entry.when)),
  entry.undone || entry.undo === false ? null : button({ label: "Undo", size: "sm", onClick: entry.onUndo }));

// Everything Simmer did, newest first, by day. It slides over the list, and Back slides it away.
// entries: [{ text, when, day, undone, undo, onUndo }]; more: older actions exist that aren't kept here.
export function recentSheet({ entries, more = false, opening = false, onBack }) {
  const days = [];
  for (const entry of entries) {
    if (days.at(-1)?.day !== entry.day) days.push({ day: entry.day, list: [] });
    days.at(-1).list.push(entry);
  }
  const node = h("section", { class: ["tb-sheet", opening && "is-opening"], "aria-label": "Recently" });
  const back = () => {
    if (still()) return onBack?.();
    node.classList.add("is-closing");
    let done = false;
    const go = () => { if (!done) { done = true; onBack?.(); } };
    node.addEventListener("animationend", go, { once: true });
    setTimeout(go, 400);
  };
  node.append(
    h("div", { class: "tb-sheet-head" }, iconButton({ icon: "back", label: "Back to the list", onClick: back }), h("h2", {}, "Recently"), h("span", { class: "tb-when" }, `${entries.length}${more ? "+" : ""} actions`)),
    h("div", { class: "tb-sheet-scroll" },
      days.map(({ day, list }) => [label(day), h("div", { class: "tb-sheet-list" }, list.map(logEntry))]).flat(),
      more ? h("p", { class: "tb-sheet-end" }, `Showing the latest ${entries.length} actions. Tabs from older ones are still in the Archive.`) : null));
  node.back = back;
  return node;
}

// onOff adds a third answer, "Turn off", as a quiet link. The answers sit on their own line under the text.
export function askLine(text, yes = "Always", { onYes, onNot, onOff, busy = false } = {}) {
  return h("div", { class: "tb-ask", role: "group", "aria-label": "Question" }, h("span", { class: "text" }, text),
    h("span", { class: "acts" },
      onOff ? button({ label: "Turn off", size: "sm", variant: "link", onClick: onOff, disabled: busy }) : null,
      h("span", { class: "grow" }),
      button({ label: "Not now", size: "sm", variant: "quiet", onClick: onNot, disabled: busy }),
      button({ label: yes, size: "sm", variant: "primary", onClick: onYes, disabled: busy })));
}

export function stayOpen(apps, open = false, { onToggle, onOpenTab, onPutAway, opening = false } = {}) {
  const foldId = `tb-fold-${++foldIds}`;
  const node = h("div", { class: ["tb-stay", "tb-disc", open && "is-open", open && opening && "is-opening"] });
  node.append(h("button", { type: "button", class: "tb-app-label tb-stay-head", "aria-expanded": String(open), "aria-controls": open ? foldId : null, onclick: () => (open ? closeThen(node, onToggle) : onToggle?.()) },
    h("span", { class: "grow" }, "Stay open"), h("span", { class: "tb-faces" }, apps.slice(0, 9).map(app => fav(app.url, app.favIconUrl)))));
  if (!open) return node;
  node.append(fold(foldId, "Stay open", apps.map(app => row({ density: "m", lead: fav(app.url, app.favIconUrl), title: app.title, ...(onOpenTab ? { onOpen: () => onOpenTab(app) } : { href: "#" }), actions: [iconButton({ icon: "archive", label: "Put away", size: "sm", onClick: () => onPutAway?.(app) })] }))));
  return node;
}

export const label = (text, count) => h("div", { class: "tb-app-label" }, h("span", {}, text), count != null ? h("span", { class: "tb-when" }, String(count)) : null);

export const skeleton = (n = 3) => h("div", { "aria-label": "Reading your tabs", role: "status" }, Array.from({ length: n }, (_, i) =>
  h("div", { class: "tb-skel-task" }, h("span", { class: "tb-skel name", style: { width: `${[46, 58, 38][i % 3]}%` } }),
    [72, 56, 64].slice(0, 3 - (i % 2)).map(w => h("span", { class: "tb-skel-line" }, h("span", { class: "tb-skel dot" }), h("span", { class: "tb-skel", style: { width: `${w}%` } }))))));

export const appEmpty = ({ title, text, action }) => h("div", { class: "tb-app-empty" }, h("strong", {}, title), text ? h("p", {}, text) : null, action || null);

export function foot(text, { disabled, onClick } = {}) {
  return h("div", { class: "tb-app-foot" }, button({ label: text, variant: "primary", disabled, onClick }));
}
