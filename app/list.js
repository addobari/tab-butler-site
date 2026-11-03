// The main screen: what you're in the middle of (docs/SIMMER-V1.md, section 5). Everything older lives
// in sidepanel.html, reached from Settings → Advanced or the ⋯ menu here.

import { h, ago, appEmpty, askLine, brandHead, button, foot, iconButton, label, menu, popoverOpen, recentLine, recentSheet, row, searchField, simmer, skeleton, stayOpen, taskRow, toast, fav } from "./ui.js";
import { clearAsk, dayLabel, thingsLine } from "./lib.js";

const send = async msg => {
  const reply = await chrome.runtime.sendMessage(msg);
  if (reply?.error) throw new Error(reply.error);
  return reply;
};
const root = document.getElementById("root");
// Focus returns to a row after a repaint only for someone using the keyboard, so a click draws no ring.
let usingKeys = false;
addEventListener("keydown", () => { usingKeys = true; }, true);
addEventListener("pointerdown", () => { usingKeys = false; }, true);
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
  loaded: false, tasks: [], stay: [], burner: [], activity: [],
  // busy: id → the words for what's happening ("Putting away…").
  // history: the Recently view is over the list.
  open: new Set(), renaming: null, busy: new Map(), history: false, stayOpen: false, scrolled: false,
  query: "", results: null, ask: null, searching: 0, clear: null, opening: null, progress: null,
  // id → when it folded out. Chrome can report a closed tab for a moment after the close, so a task
  // that just left stays hidden until a refresh no longer lists it (or 5 seconds pass).
  left: new Map(),
};
let searchNode;

// Errors say what failed and what's true now; the detail goes to the console, not the toast.
const fail = (what, error) => {
  console.warn("Simmer:", what, error);
  toast(what, { error: true, ms: 6000 });
};

// ---------- reading ----------

async function refresh({ similar } = {}) {
  const [data, { activity = [] }, pending, { settings } = {}] = await Promise.all([
    send({ cmd: "tasks", similar }), send({ cmd: "activity" }),
    send({ cmd: "clearPreview" }).catch(() => null), chrome.storage.sync.get("settings").catch(() => ({})),
  ]);
  const clear = clearAsk(pending, settings?.clearIdleHours);
  const listed = new Set([...data.tasks, ...data.burner].map(task => task.id));
  for (const [id, at] of state.left) if (!listed.has(id) || Date.now() - at > 5000) state.left.delete(id);
  Object.assign(state, { loaded: true, loadError: null, tasks: data.tasks, stay: data.stay, burner: data.burner, activity, clear });
  paint();
}

// Asks without the model first, so the list shows at once, then again with it.
async function firstLoad() {
  paint();
  try {
    await refresh({ similar: false });
    await refresh();
  } catch (error) {
    console.warn("Simmer: couldn't read the tabs", error);
    state.loaded = true;
    state.loadError = true;
    paint();
  }
}

let timer;
const soon = () => { clearTimeout(timer); timer = setTimeout(() => refresh().catch(() => {}), 400); };
// Only changes the list shows: a page loading or a sound starting doesn't redraw it.
const shown = ["title", "url", "favIconUrl", "groupId", "pinned", "discarded"];
chrome.tabs?.onUpdated?.addListener?.((id, change) => { if (shown.some(key => key in change)) soon(); });
for (const event of [chrome.tabs?.onCreated, chrome.tabs?.onRemoved, chrome.tabGroups?.onUpdated]) event?.addListener?.(soon);
chrome.storage?.onChanged?.addListener?.((changes, area) => { if (area === "local" && (changes.activity || changes.archive || changes.clearPending)) soon(); });
// A redraw held back while a menu was open happens once it closes.
addEventListener("tb-popover-closed", () => { if (held) setTimeout(() => paint(), 0); });

// ---------- acting ----------

// Runs work for one row, showing what's happening on it. leave(result): true when the work took the
// row away (put away, brought back), so it folds out first rather than vanishing in one frame. A task
// whose tabs were in use stays, so it doesn't fold.
async function act(id, work, { doing = "Working…", failed = "That didn't work. Nothing changed.", leave = null } = {}) {
  state.busy.set(id, doing);
  paint();
  let ok = false, result;
  try { result = await work(); ok = true; } catch (error) { fail(failed, error); } finally {
    if (ok && leave && leave(result)) { await foldOut(id); state.left.set(id, Date.now()); }
    state.busy.delete(id);
    await refresh().catch(() => {});
  }
}

// Closes a row's height to nothing over --dur-slow, then the repaint drops it.
function foldOut(id) {
  const node = root.querySelector(`[data-task="${CSS.escape(String(id))}"]`);
  if (!node || still()) return Promise.resolve();
  node.style.height = `${node.offsetHeight}px`;
  node.getBoundingClientRect();
  node.classList.add("is-leaving");
  return new Promise(done => {
    node.addEventListener("transitionend", event => { if (event.propertyName === "height") done(); });
    setTimeout(done, 400);
  });
}

const undoer = activityId => activityId ? async () => { await send({ cmd: "undo", id: activityId }); await refresh(); } : undefined;

async function ensureSetup() {
  const { setupDone } = await chrome.storage.local.get("setupDone");
  if (!setupDone) await send({ cmd: "finishSetup", draft: FIRST_RUN_DRAFT });
}
const FIRST_RUN_DRAFT = { autoGroup: false, autoArchive: false, rules: "", sleepMinutes: 30 };

const putAway = task => act(task.id, async () => {
  await ensureSetup();
  const done = await send({ cmd: "taskPutAway", id: task.id });
  toast(done.text, { undo: undoer(done.activityId) });
  return done;
}, { doing: "Putting away…", failed: `Couldn't put ${task.name} away. Its tabs are still open.`, leave: done => done?.count > 0 && !done.kept });

const bringBack = task => act(task.id, async () => {
  const done = await send({ cmd: "taskBringBack", id: task.id });
  toast(done.text, { undo: undoer(done.activityId) });
  return done;
}, { doing: "Bringing back…", failed: `Couldn't bring ${task.name} back. It's still on the back burner.`, leave: done => !!done?.activityId });

async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  const live = await chrome.tabs.get(tab.id);
  await chrome.windows.update(live.windowId, { focused: true }).catch(() => {});
}
const goTo = tab => focusTab(tab).catch(error => fail("Couldn't switch to that tab. It may have just closed.", error));
const openTask = task => goTo(task.tabs[0]);

// Each task in turn, saying how far it's got, so a long run never looks hung.
async function putAllAway() {
  const ids = [];
  let count = 0;
  const tasks = [...state.tasks];
  state.progress = { done: 0, total: tasks.length };
  await act("all", async () => {
    await ensureSetup();
    for (const task of tasks) {
      state.busy.set(task.id, "Putting away…");
      paint();
      const done = await send({ cmd: "taskPutAway", id: task.id });
      count += done.count;
      if (done.activityId) ids.push(done.activityId);
      state.busy.delete(task.id);
      state.progress.done++;
      paint();
    }
    toast(`Put ${count} ${count === 1 ? "tab" : "tabs"} away. They're on the back burner.`, { undo: async () => { for (const id of [...ids].reverse()) await send({ cmd: "undo", id }); await refresh(); } });
  }, { failed: "Couldn't put everything away. What's still listed is still open." });
  for (const task of tasks) state.busy.delete(task.id);
  state.progress = null;
  paint();
}

// The first automatic clear asks first (background/clear.js). Each answer removes the question.
const clearYes = () => act("clear", async () => {
  const done = await send({ cmd: "clearConfirm" });
  state.clear = null;
  toast(done.text, { undo: undoer(done.activityId) });
}, { failed: "Couldn't clear those. Nothing was put away." });
const clearLater = () => act("clear", async () => {
  await send({ cmd: "clearNotNow" });
  state.clear = null;
  toast("Okay. Simmer will ask again tomorrow.");
});
const clearStop = () => act("clear", async () => {
  await send({ cmd: "clearOff" });
  state.clear = null;
  toast("Turned off. You can turn it back on in Settings.");
});

function moveMenu(anchor, tab, from) {
  const others = state.tasks.filter(task => task.id !== from.id);
  menu(anchor, [
    { heading: "Move to" },
    ...others.slice(0, 8).map(task => ({ label: task.name, onClick: () => moveTab(tab, { toId: task.id }) })),
    ...(others.length ? ["-"] : []),
    { icon: "folder-move", label: "New thing", onClick: () => moveTab(tab, {}) },
  ]);
}
const moveTab = (tab, where) => act(tab.id, async () => {
  const done = await send({ cmd: "taskMove", tabId: tab.id, ...where });
  toast("Moved. Simmer will remember.", { undo: undoer(done.activityId) });
}, { doing: "Moving…", failed: "Couldn't move that tab. It's where it was." });

async function saveName(task, value) {
  state.renaming = null;
  const name = value.trim();
  if (!name || name === task.name) return paint();
  await act(task.id, async () => {
    const done = await send({ cmd: "taskRename", id: task.id, name });
    toast(`Renamed to ${done.name}.`, { undo: undoer(done.activityId) });
  }, { doing: "Renaming…", failed: `Couldn't rename ${task.name}. It keeps its old name.` });
}

async function undoLatest() {
  const last = state.activity.find(entry => entry.undo && !entry.undone);
  if (!last) return toast("Nothing to undo.");
  try {
    await send({ cmd: "undo", id: last.id });
    toast(`Undid: ${last.text}.`);
  } catch (error) { fail("Couldn't undo that. It's still listed in Recently.", error); }
  await refresh().catch(() => {});
}

// ---------- search ----------

let searchTimer;
function search(text) {
  state.query = text;
  clearTimeout(searchTimer);
  if (!text.trim()) { state.results = null; return paint(); }
  const seq = ++state.searching;
  searchTimer = setTimeout(async () => {
    const { results = [] } = await send({ cmd: "search", text }).catch(() => ({ results: [] }));
    if (seq !== state.searching) return;
    state.results = results;
    paint();
  }, 80);
}

// Things whose name matches, open ones first: the search the list itself can answer.
function matchingThings() {
  const q = state.query.trim().toLowerCase();
  if (!q) return [];
  const hit = task => task.name.toLowerCase().includes(q);
  return [...state.tasks.filter(hit).map(task => ({ task })), ...state.burner.filter(hit).map(task => ({ task, away: true }))];
}

async function openResult(item) {
  if (item.content?.startsWith("tab:")) return goTo({ id: Number(item.content.slice(4)) });
  await chrome.tabs.create({ url: item.url });
}

function resultsView(things) {
  const thingRows = things.length ? [label("Things", things.length), ...things.map(({ task, away }) => {
    const first = away ? { url: task.urls[0], favIconUrl: task.favIconUrls[0] } : task.tabs[0];
    const n = away ? task.urls.length : task.tabs.length;
    return row({ density: "m", lead: fav(first.url, first.favIconUrl), title: task.name, meta: away ? `On the back burner, ${n} ${n === 1 ? "tab" : "tabs"}` : `${n} ${n === 1 ? "tab" : "tabs"}`,
      onOpen: () => (away ? bringBack(task) : openTask(task)) });
  })] : [];
  if (!state.results) return [...thingRows, h("div", { class: "tb-app-search-wait" }, skeleton(1))];
  if (!state.results.length && !things.length) return [appEmpty({ title: `Nothing matches “${state.query}”`, text: "Searched your things, tabs, the back burner, the archive and your bookmarks." })];
  const kinds = [["Tab", "Open tabs"], ["Group", "Groups"], ["Archived", "In the archive"], ["Bookmark", "Bookmarks"], ["Note", "Notes"]];
  return [...thingRows, ...kinds.flatMap(([kind, name]) => {
    const found = state.results.filter(item => item.kind === kind);
    if (!found.length) return [];
    return [label(name, found.length), ...found.map(item => row({ density: "m", lead: item.url ? fav(item.url) : null, title: item.title || item.url, onOpen: () => openResult(item) }))];
  })];
}

// ---------- drawing ----------

function moreMenu(event) {
  menu(event.currentTarget, [
    { icon: "archive", label: "Archive", onClick: () => openManage("archive") },
    { icon: "bookmark", label: "Bookmarks", onClick: () => openManage("bookmarks") },
    { icon: "sliders", label: "Settings", onClick: () => openManage("settings") },
    { icon: "history", label: "Recently", onClick: showHistory },
    "-",
    { icon: "dots", label: "All tools", onClick: () => { location.href = "sidepanel.html"; } },
  ]);
}
const openManage = section => chrome.tabs.create({ url: `manage.html#${section}` });

// Opens or closes a task, Recently or Stay open. Only the one just opened animates.
function toggle(id, isOpen, set) {
  state.opening = isOpen ? null : id;
  set(!isOpen);
  paint();
}
const toggleTask = task => toggle(task.id, state.open.has(task.id), on => (on ? state.open.add(task.id) : state.open.delete(task.id)));

function taskNode(task) {
  return taskRow({
    name: task.name, tabs: task.tabs, open: state.open.has(task.id), opening: state.opening === task.id, renaming: state.renaming === task.id, busy: state.busy.get(task.id) || false,
    onToggle: () => toggleTask(task),
    onOpenAll: () => openTask(task),
    onPutAway: () => putAway(task),
    onRename: () => { state.renaming = task.id; paint(); },
    onSaveName: value => saveName(task, value),
    onCancelName: () => { state.renaming = null; paint(); },
    onOpenTab: goTo,
    onMoveTab: (anchor, tab) => moveMenu(anchor, tab, task),
    dataId: task.id,
  });
}

function burnerNode(task) {
  const tabs = task.urls.map((url, i) => ({ url, title: task.titles[i], favIconUrl: task.favIconUrls[i] }));
  return taskRow({ name: task.name, tabs, away: true, open: state.open.has(task.id), opening: state.opening === task.id, busy: state.busy.get(task.id) || false, onBringBack: () => bringBack(task),
    onToggle: () => toggleTask(task), dataId: task.id });
}

const recentEntries = list => list.map(entry => ({ id: entry.id, text: entry.text, when: ago(entry.at), day: dayLabel(entry.at), undone: entry.undone, undo: !!entry.undo, onUndo: entry.undo ? async () => {
  try { await send({ cmd: "undo", id: entry.id }); } catch (error) { fail("Couldn't undo that. It's still listed in Recently.", error); }
  await refresh();
} : null }));

// The Recently line is fresh when its action wasn't the one shown last time.
let lastRecent = null;
function recentNode() {
  const latest = state.activity[0];
  if (!latest) return null;
  const fresh = lastRecent != null && lastRecent !== latest.id;
  lastRecent = latest.id;
  return recentLine({ entries: recentEntries([latest]), fresh, onAll: showHistory });
}

function showHistory() {
  state.history = true;
  state.opening = "history";
  paint();
}
function hideHistory() {
  state.history = false;
  paint();
  root.querySelector(".tb-recent .tb-ib")?.focus();
}

// Opening the panel: the first paint with the list rises in, row after row, once. A paint that comes
// during it (the second read, with the model) carries on from where the first was.
let arrivedAt = 0, lastTitle = "", lastCount = "";
// The header's simmer: one for the life of the panel, stirred on arrival and when the headline changes.
const art = simmer();
function arrival() {
  if (!state.loaded || state.loadError || still()) return null;
  if (!arrivedAt) arrivedAt = performance.now();
  const since = Math.round(performance.now() - arrivedAt);
  return since < 600 ? { since } : null;
}

// Scrolling the list folds the headline down to one small line and gives the search box an edge;
// back at the top it opens out again. Only when there's enough to scroll that the header's room
// can't run out, or it would flicker between the two.
function compact(app, scroll) {
  const on = app.classList.contains("is-scrolled") ? scroll.scrollTop > 0 : scroll.scrollTop > 24 && scroll.scrollHeight - scroll.clientHeight > 96;
  state.scrolled = on;
  app.classList.toggle("is-scrolled", on);
}

// A redraw rebuilds the whole list, so it waits while you're typing a name or a menu is open:
// either would be lost. It happens as soon as they're done.
let held = false;
function paint() {
  if (popoverOpen() || (state.renaming && root.querySelector(".tb-name-edit"))) { held = true; return; }
  held = false;
  const keep = document.activeElement;
  const hadSearch = keep === searchNode?.input;
  const focusKey = keep?.dataset?.nav;
  const focusId = keep?.closest?.("[data-task]")?.dataset.task;
  const scroller = root.querySelector(".tb-app-scroll");
  const top = scroller?.scrollTop || 0;
  const sheetTop = root.querySelector(".tb-sheet-scroll")?.scrollTop || 0;

  if (!searchNode) {
    searchNode = searchField({ placeholder: "Find a tab", shortcut: "/", onInput: search });
    searchNode.input.addEventListener("keydown", event => { if (event.key === "Escape") { searchNode.input.value = ""; search(""); searchNode.input.blur(); } });
  }
  const searchBox = h("div", { class: "tb-app-search" }, searchNode);
  const more = iconButton({ icon: "dots", label: "More", onClick: moreMenu, size: "sm" });
  more.classList.add("tools");
  const live = state.tasks.filter(task => !state.left.has(task.id));
  const tabCount = live.reduce((sum, task) => sum + task.tabs.length, 0);
  const searching = !!state.query.trim();
  const things = searching ? matchingThings() : [];
  let head = thingsLine({ loaded: state.loaded, things: live.length, tabs: tabCount, stay: state.stay.length, burner: state.burner.length });
  // While searching, the head counts what was found, so it never contradicts the list beneath.
  if (searching && state.results) {
    const n = things.length + state.results.length;
    head = { title: n ? `${n} ${n === 1 ? "match" : "matches"}` : "No matches", sub: `For “${state.query.trim()}”.` };
  }
  // The headline rolls in when it changes, as when a count goes down; the first paint of the list
  // rolls it in with everything else.
  const arriving = arrival();
  const changed = !!lastTitle && lastTitle !== head.title;
  lastTitle = head.title;
  const brand = brandHead({ title: head.title, sub: head.sub, tools: more, changed: changed && !arriving, art: art.node });
  // Stirred when the list's own count changes (and so on arrival), not by search.
  if (state.loaded && !searching && lastCount !== head.title) { lastCount = head.title; art.stir(); }

  let body, footer = null;
  if (state.loadError) body = [appEmpty({ title: "Simmer couldn't read your tabs", text: "Your tabs are untouched. Try again; if it keeps happening, reload Simmer from chrome://extensions.",
    action: button({ label: "Try again", size: "sm", onClick: () => { state.loadError = null; state.loaded = false; firstLoad(); } }) })];
  else if (!state.loaded) { body = [skeleton()]; footer = foot("Put all away", { disabled: true }); }
  else if (searching) body = resultsView(things);
  else {
    const here = task => !state.left.has(task.id);
    const tasks = state.tasks.filter(here), burner = state.burner.filter(here);
    const empty = !tasks.length;
    body = [
      recentNode(),
      state.clear ? askLine(state.clear, "Put away", { onYes: clearYes, onNot: clearLater, onOff: clearStop, busy: state.busy.has("clear") }) : null,
      state.ask ? askLine(state.ask.text) : null,
      empty && burner.length ? appEmpty({ title: "Your window is clear", text: "Bring anything back below, or just start browsing." }) : null,
      empty && !burner.length ? appEmpty({ title: "Browse as you do now", text: "As tabs add up, Simmer gathers them here by what they're for, ready to put away." }) : null,
      ...tasks.map(taskNode),
      burner.length ? label("On the back burner", burner.length) : null,
      ...burner.map(burnerNode),
      state.stay.length ? stayOpen(state.stay, state.stayOpen, {
        opening: state.opening === "stay",
        onToggle: () => toggle("stay", state.stayOpen, on => { state.stayOpen = on; }),
        onOpenTab: goTo,
        onPutAway: tab => act(tab.id, async () => { await ensureSetup(); const done = await send({ cmd: "archiveIds", ids: [tab.id] }); toast(done.text ? `${done.text}.` : "Put away.", { undo: undoLatest }); },
          { doing: "Putting away…", failed: "Couldn't put that tab away. It's still open." }),
      }) : null,
    ];
    // The question is the one decision on screen while it's asked, so the footer steps aside.
    const p = state.progress;
    if (state.tasks.length && !state.clear) footer = foot(p ? `Putting away ${Math.min(p.done + 1, p.total)} of ${p.total}…` : `Put all ${state.tasks.length} away`, { onClick: putAllAway, disabled: state.busy.has("all") });
  }

  const scroll = h("div", { class: "tb-app-scroll" }, body);
  const app = h("section", { class: ["tb-app", arriving && "is-arriving", state.scrolled && "is-scrolled"], "aria-label": "Simmer" }, brand, searchBox, scroll, footer);
  if (arriving) {
    app.style.setProperty("--since", `${arriving.since}ms`);
    [...scroll.children].forEach((node, i) => node.style.setProperty("--i", Math.min(i, 6)));
  }
  const sheet = state.history && state.activity.length ? recentSheet({ entries: recentEntries(state.activity), more: state.activity.length >= 150, opening: state.opening === "history", onBack: hideHistory }) : null;
  if (sheet) for (const node of app.children) node.inert = true;
  if (sheet) app.append(sheet);
  else state.history = false;
  root.replaceChildren(app);
  document.body.classList.toggle("has-foot", !!footer && !sheet);
  const opened = state.opening === "history";
  state.opening = null;

  scroll.scrollTop = top;
  compact(app, scroll);
  scroll.addEventListener("scroll", () => compact(app, scroll), { passive: true });
  if (sheet) {
    sheet.querySelector(".tb-sheet-scroll").scrollTop = sheetTop;
    if (opened) sheet.querySelector(".tb-ib").focus();
  }
  else if (hadSearch) searchNode.input.focus();
  else if (usingKeys && (focusKey || focusId)) (navTargets().find(node => node.dataset.nav === focusKey) || root.querySelector(`[data-task="${CSS.escape(focusId || "")}"] .tb-title`))?.focus();
  root.querySelector(".tb-name-edit")?.select();
}

// ---------- keyboard ----------

// ↑↓ walk every row the list can act on: task names, their tabs, "N more", Stay open.
const NAV = ".tb-task-name, .tb-task .tb-row .tb-title, .tb-task-more, .tb-stay-head, .tb-stay .tb-row .tb-title";
function navTargets() {
  const nodes = [...root.querySelectorAll(NAV)];
  nodes.forEach((node, i) => { node.dataset.nav = `${node.closest("[data-task]")?.dataset.task || node.className}:${i}`; });
  return nodes;
}
const currentRow = () => document.activeElement?.closest?.("[data-task]");
const taskOf = node => state.tasks.find(task => task.id === node?.dataset.task);
const burnerOf = node => state.burner.find(task => task.id === node?.dataset.task);

document.addEventListener("keydown", event => {
  // Recently is over the list: Escape goes back, and the list's keys wait.
  if (state.history) {
    if (event.key === "Escape" && !popoverOpen()) root.querySelector(".tb-sheet")?.back();
    return;
  }
  const typing = event.target.matches?.("input, textarea, select");
  if (event.key === "/" && !typing) { event.preventDefault(); searchNode.input.focus(); return; }
  if ((event.metaKey || event.ctrlKey) && event.key === "z" && !typing) { event.preventDefault(); undoLatest(); return; }
  if (typing || event.metaKey || event.ctrlKey || event.altKey || popoverOpen()) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const all = navTargets();
    const at = all.indexOf(document.activeElement);
    const next = all[event.key === "ArrowDown" ? Math.min(at + 1, all.length - 1) : Math.max(at - 1, 0)];
    next?.focus();
    next?.scrollIntoView({ block: "nearest" });
    return;
  }
  const here = currentRow();
  const task = taskOf(here), away = burnerOf(here);
  if (event.key === "ArrowRight" && (task || away) && !state.open.has((task || away).id) && here.querySelector(".tb-task-more")) toggleTask(task || away);
  else if (event.key === "ArrowLeft" && (task || away) && state.open.has((task || away).id)) toggleTask(task || away);
  else if (event.key === "o" && task) openTask(task);
  else if (event.key === "e" && task) putAway(task);
  else if (event.key === "e" && away) bringBack(away);
  else if (event.key === "r" && task) { event.preventDefault(); state.renaming = task.id; paint(); }
});

firstLoad();
if (new URLSearchParams(location.search).has("focus")) searchNode.input.focus();
