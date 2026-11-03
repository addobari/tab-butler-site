// A fake `chrome` with demo data, injected into the real pages by render.mjs so the store
// screenshots show Simmer's actual UI without a real profile. ?shot=<name> on the page URL
// picks the state. Nothing here ships in the extension.
(() => {
  const shot = new URLSearchParams(location.search).get("shot") || "";
  const now = Date.now(), min = 60e3, hour = 60 * min, day = 24 * hour;
  const ev = () => ({ addListener() {}, removeListener() {}, hasListener: () => false });
  const handlers = {};   // commands that answer from state (?shot=play) instead of a fixed reply

  const G = { code: 1, design: 2, docs: 3, reading: 4, mail: 5 };
  const groups = [
    { id: G.mail, windowId: 1, title: "Mail", color: "red", collapsed: false },
    { id: G.code, windowId: 1, title: "Code", color: "blue", collapsed: false },
    { id: G.design, windowId: 1, title: "Design", color: "pink", collapsed: false },
    { id: G.docs, windowId: 1, title: "Docs", color: "yellow", collapsed: false },
    { id: G.reading, windowId: 1, title: "Reading", color: "green", collapsed: true },
  ];
  let id = 100;
  // ?shot=play is the live panel on the website, where favicons are saved files (site.mjs fetches them).
  const play = shot === "play";
  const icon = url => play ? `favicons/${new URL(url).hostname}.png` : `${location.origin}/_favicon/?pageUrl=${encodeURIComponent(url)}`;
  const T = (groupId, url, title, extra = {}) => ({ id: id++, windowId: 1, index: id - 100, groupId, url, title, favIconUrl: icon(url), status: "complete", lastAccessed: now - (id % 7) * 9 * min, ...extra });
  const tabs = [
    T(G.mail, "https://mail.google.com/mail/u/0/#inbox", "Inbox (3)"),
    T(G.mail, "https://calendar.google.com/calendar/u/0/r/week", "Calendar: week of 27 October"),
    T(G.code, "https://github.com/acme/web/pull/412", "Add offline mode to the editor · Pull request #412", { active: true }),
    T(G.code, "https://github.com/acme/web/issues/398", "Sync stalls on slow networks · Issue #398"),
    T(G.code, "https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API", "Service Worker API | MDN"),
    T(G.code, "https://stackoverflow.com/questions/4910/retry-fetch", "Retry a failed fetch with backoff", { discarded: true }),
    T(G.design, "https://www.figma.com/design/onboarding-v3", "Onboarding v3 – Figma"),
    T(G.design, "https://mobbin.com/browse/ios/flows", "Onboarding flows · Mobbin"),
    T(G.design, "https://dribbble.com/tags/empty-state", "Empty state designs", { discarded: true }),
    T(G.docs, "https://docs.google.com/document/d/q4-plan", "Q4 plan – Google Docs"),
    T(G.docs, "https://www.notion.so/acme/Launch-checklist", "Launch checklist"),
    T(G.reading, "https://stratechery.com/2026/browsers-and-agents", "Browsers and agents", { discarded: true }),
    T(G.reading, "https://arxiv.org/abs/2610.01234", "Attention to tabs: a field study", { discarded: true }),
    T(G.reading, "https://www.theverge.com/tech/browser-ai", "The browser is becoming an agent"),
  ];

  const A = (kind, text, ago, extra = {}) => ({ id: `${kind}-${ago}`, at: now - ago, kind, text, auto: false, undone: false, undo: { type: "demo" }, ...extra });
  const activity = [
    A("group", "Grouped 4 tabs into Code and Design", 2 * min, { auto: true }),
    A("archive", "Archived 9 idle tabs from Research, bookmarked in Research", 47 * min, { auto: true }),
    A("rule", "Tabs from linear.app will go to Code from now on", 3 * hour),
    A("dedupe", "Closed 3 duplicate tabs", 5 * hour),
    A("snooze", "Snoozed 2 tabs until Fri 9:00", day + 2 * hour),
    A("bookmark", "Bookmarked 4 tabs in Design / Onboarding", day + 6 * hour),
    { id: "setup", at: now - 3 * day, kind: "setup", text: "At your service. Everything I do is listed here, and can be undone.", auto: false, undone: false, undo: null },
  ];

  const R = (url, title, group, groupColor, ago, folder, summary) => ({ id: `a-${ago}`, url, title, favIconUrl: "", group, groupColor, archivedAt: now - ago, folder, summary });
  const archive = [
    R("https://arxiv.org/abs/2609.11873", "Long-context retrieval without the long context", "Research", "cyan", 47 * min, "Research", "A method that retrieves passages first, then reads only those."),
    R("https://www.semanticscholar.org/paper/tab-overload", "When the tab comes due: browser tab usage", "Research", "cyan", 47 * min, "Research", "Why people keep tabs open, and what it costs them."),
    R("https://web.dev/articles/offline-cookbook", "The offline cookbook", "Code", "blue", 5 * hour, "Code / Offline", "Patterns for caching and serving pages offline with a service worker."),
    R("https://www.figma.com/community/file/ios-onboarding", "iOS onboarding kit (Community)", "Design", "pink", day, "Design / Onboarding", ""),
    R("https://www.nngroup.com/articles/empty-state-interface-design/", "Designing empty states in complex applications", "Design", "pink", day, "Design", "Empty states should teach, not just fill space."),
    R("https://www.booking.com/hotel/jp/kyoto-machiya.html", "Kyoto machiya stay – Booking.com", "Travel", "cyan", 2 * day, "Travel / Kyoto", ""),
    R("https://www.japan-guide.com/e/e3900.html", "Kyoto travel guide", "Travel", "cyan", 2 * day, "Travel / Kyoto", "Districts, seasons and how to get around."),
    R("https://www.seriouseats.com/the-food-lab-ramen", "The Food Lab: homemade ramen", "Food", "orange", 4 * day, "Food", ""),
    R("https://news.ycombinator.com/item?id=41234567", "Show HN: A tab manager that never loses anything", "Communities", "orange", 6 * day, "Reading", ""),
  ];

  const rule = shot === "learns" ? [{ host: "linear.app", group: "Code", count: 2 }] : [];
  const replies = {
    activity: { activity },
    stats: { asleep: 4, dupes: 0, sleepable: 0 },
    notes: { notes: {} },
    agentTabs: { tabs: {}, groups: {} },
    soon: { tabs: [] }, triage: { items: [] }, agentLeftovers: { groups: [], tabs: 0 },
    rediscover: { card: null },
    ruleSuggestions: { suggestions: rule },
    workspaces: { workspaces: [] }, snoozed: { snoozed: [] },
    aiStatus: { provider: "off" }, agentStatus: { access: "off" },
    setupPreview: {
      group: { tabs: 11, groups: ["Code", "Design", "Docs", "Mail"] },
      sleep: 6,
      archive: [
        { title: "Kyoto travel guide", url: "https://www.japan-guide.com/e/e3900.html", lastAccessed: now - 4 * day },
        { title: "The Food Lab: homemade ramen", url: "https://www.seriouseats.com/", lastAccessed: now - 5 * day },
        { title: "Long-context retrieval without the long context", url: "https://arxiv.org/", lastAccessed: now - 6 * day },
      ],
      folders: [{ name: "Travel", count: 1 }, { name: "Food", count: 1 }, { name: "Research", count: 1, isNew: true }],
    },
  };

  // P20: the preview, with the importer already filled in. Settings runs in Manage's frame, so
  // look at the page that holds it too: /welcome.html?shot=p20 and /manage.html?shot=p20#settings.
  let holder = "";
  try { holder = new URLSearchParams(window.top.location.search).get("shot") || ""; } catch {}
  if (shot === "p20" || holder === "p20") {
    Object.assign(replies, {
      importPreview: {
        source: "onetab", label: "OneTab", tabs: 1204, groups: 37, skipped: { duplicates: 12, unsafe: 3, other: 0 },
        sample: [
          { title: "Kyoto travel guide", url: "https://www.japan-guide.com/e/e3900.html", group: "OneTab 1" },
          { title: "The offline cookbook", url: "https://web.dev/articles/offline-cookbook", group: "OneTab 1" },
          { title: "The Food Lab: homemade ramen", url: "https://www.seriouseats.com/the-food-lab-ramen", group: "OneTab 2" },
        ],
      },
      importTabs: { added: 1204, groups: 37, skipped: { duplicates: 12, unsafe: 3, other: 0 }, bookmarked: 0, activityId: "import-demo", text: "Added 1,204 tabs from OneTab to your archive" },
    });
    addEventListener("load", () => setTimeout(() => {
      const field = document.querySelector(".tb-import-text");
      if (!field) return;
      field.value = "https://www.japan-guide.com/e/e3900.html | Kyoto travel guide\nhttps://web.dev/articles/offline-cookbook | The offline cookbook";
      field.dispatchEvent(new Event("input", { bubbles: true }));
      setTimeout(() => field.scrollIntoView({ block: "start" }), 450);
    }, 100));
  }
  // ?shot=p21: the "will be archived" notice. ?shot=p21-next: What's next, opened from that notice.
  // ?shot=p21-why: a tab's detail. Words as lib.js tabFate and whatsNext write them.
  if (shot.startsWith("p21")) {
    const archiveWhy = "Archives after 3 days unused.", sleepWhy = "Sleeps after 30 minutes unused.";
    const item = (tab, next, at, why, extra = {}) => ({ id: tab.id, title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl, windowId: 1, groupId: tab.groupId, next, at, due: false, why, ...extra });
    replies.soon = { tabs: [{ id: tabs[11].id, title: tabs[11].title }, { id: tabs[12].id, title: tabs[12].title }] };
    replies.whatsNext = { paused: null, tabs: [
      item(tabs[7], "sleep", now + 12 * min, sleepWhy),
      item(tabs[10], "sleep", now + 21 * min, sleepWhy),
      item(tabs[11], "archive", now + 40 * min, "Archives with its group, after 3 days unused."),
      item(tabs[12], "archive", now + 40 * min, "Archives with its group, after 3 days unused."),
      item(tabs[5], "archive", now + 2 * day, "You kept it, so this waits until the day is up."),
      item(tabs[8], "archive", now + 3 * day, archiveWhy),
    ] };
    replies.tabFate = {
      group: { code: "rule", rule: "Design", why: "figma.com is in your Design rule." },
      sleep: { at: now + 12 * min, code: "waiting", due: false, why: sleepWhy },
      archive: { at: now + 3 * day, code: "waiting", due: false, why: "Archives with its group, after 3 days unused." },
      paused: null,
    };
    replies.keepTabs = { ok: true };
    const click = find => setTimeout(() => find()?.click(), 500);
    if (shot === "p21-next") addEventListener("load", () => click(() => [...document.querySelectorAll(".tb-notice .tb-btn")].find(b => b.textContent.includes("See them"))));
    if (shot === "p21-why") addEventListener("load", () => click(() => document.querySelector(`.tabs-list li[data-id="${tabs[6].id}"] [aria-label^="Why"]`)));
  }
  // ?shot=p19 the wipe notice, the safety row and the Backup setting; p19-ok, p19-failed, p19-unknown: the other states.
  const samples = archive.slice(0, 5).map(a => ({ id: a.id, title: a.title, url: a.url, favIconUrl: "" }));
  const backupOn = { on: true, every: "daily", since: now - 30 * day, lastAt: now - 2 * hour, lastError: "", permission: true };
  if (shot === "p19") replies.safetyStatus = {
    state: "wiped", archive: 0, backup: { on: false, every: "daily", permission: false }, newest: { name: "backup-friday.json", at: now - day }, samples,
    wipe: { count: 1204, lastSeen: now - day, booked: 860, backupAt: now - day },
    row: "Backup is off · 0 tabs archived",
    notice: { kind: "wiped", text: "1,204 tabs to restore", detail: "Simmer's data on this computer is empty, but this Chrome profile had 1,204 archived tabs here, last seen yesterday. 860 tabs are safe as bookmarks. The last backup was yesterday." },
  };
  if (shot === "p19-ok") replies.safetyStatus = { state: "ok", archive: 1204, backup: backupOn, samples, row: "Backed up 2 hours ago · 1,204 tabs recoverable", notice: null };
  if (shot === "p19-failed") replies.safetyStatus = {
    state: "ok", archive: 1204, backup: { ...backupOn, lastError: "Chrome couldn't write the file (FILE_NO_SPACE)." }, samples, row: "Last backup failed · 1,204 tabs archived",
    notice: { kind: "failed", text: "The last backup failed", detail: "Chrome couldn't write the file (FILE_NO_SPACE). Your data here is untouched. Simmer tries again within the hour." },
  };
  if (shot === "p19-unknown") replies.safetyStatus = {
    state: "unknown", archive: 0, question: "Was Simmer used on this computer before?", backup: { on: false, every: "daily", permission: false }, newest: null, samples: [], row: "Backup is off · 0 tabs archived",
    notice: { kind: "unknown", text: "Was Simmer used on this computer before?", detail: "If it was, you can restore a backup file. Nothing here changes unless you pick one." },
  };
  // ?shot=r2 the shrunk-archive notice; r2-paused: a backup that timed out; r2-setup: setup unfinished; r2-waiting: Backup on, the question unanswered.
  if (shot === "r2") replies.safetyStatus = {
    state: "ok", archive: 3, backup: { ...backupOn, goodCount: 1204 }, samples: samples.slice(0, 3), row: "Backup paused · 3 tabs archived", setupNotice: null,
    notice: { kind: "shrunk", text: "Backups are paused", detail: "It went from 1,204 tabs to 3, so your backup files are left as they are. If you meant this, back up anyway. If not, restore from the newest file in Downloads/Simmer." },
  };
  if (shot === "r2-paused") replies.safetyStatus = {
    state: "ok", archive: 1204, backup: { ...backupOn, pausedAt: now - hour, lastError: "The file didn't finish writing in time." }, samples, row: "Backup paused · 1,204 tabs archived", setupNotice: null,
    notice: { kind: "paused", text: "Backups are paused", detail: "The last one didn't finish in time. Chrome may be set to ask where to save each download, and an automatic backup can't answer that. Turn off \"Ask where to save each file\" in Chrome's download settings, then choose Back up now." },
  };
  if (shot === "r2-setup") {
    replies.safetyStatus = {
      state: "ok", archive: 0, backup: { on: false, every: "daily", permission: false }, samples: [], row: "Backup is off · 0 tabs archived", notice: null,
      setupNotice: { kind: "setup", text: "Finish setup", detail: "Nothing automatic runs until you do. Your tabs and data are untouched." },
    };
    replies.openWelcome = { ok: true };
  }
  if (shot === "r2-waiting") replies.safetyStatus = {
    state: "unknown", archive: 0, question: "Was Simmer used on this computer before?", backup: { ...backupOn, lastAt: 0 }, newest: null, samples: [], row: "Backup waits for your answer · 0 tabs archived", setupNotice: null,
    notice: { kind: "unknown", text: "Was Simmer used on this computer before?", detail: "If it was, you can restore a backup file. Nothing here changes unless you pick one." },
  };
  // ?shot=p24 the time picker; p24-preview: the preview for "Before Claude in Chrome started"; p24-done: the result toast.
  if (shot.startsWith("p24")) {
    const point = (at, label, kind, count, windows = 1) => ({ at: now - at, label, kind, when: at < hour ? `${Math.round(at / min)} minutes ago` : `${Math.round(at / hour)} hour${at < 2 * hour ? "" : "s"} ago`, count, windows });
    const row = (tab, extra = {}) => ({ id: tab.id, url: tab.url, title: tab.title, favIconUrl: tab.favIconUrl, windowId: 1, group: "", ...extra });
    replies.rewindPoints = { points: [
      point(4 * min, "4 minutes ago", "time", 31),
      point(10 * min, "Before Claude in Chrome started", "agent", 22),
      point(25 * min, "Before Claude Code acted", "agent", 22),
      point(40 * min, "Before an Ask action", "ask", 24),
      point(2 * hour, "Before a sweep archived tabs", "sweep", 29, 2),
      point(5 * hour, "5 hours ago", "time", 27, 2),
      point(26 * hour, "26 hours ago", "time", 25, 2),
    ] };
    const reopen = tabs.slice(0, 6).map(tab => row(tab, { group: "Code" }));
    const regroup = tabs.slice(6, 9).map(tab => row(tab, { from: "Claude", to: "Reading" }));
    const extra = tabs.slice(9, 12).map(tab => row(tab, { group: "Claude" }));
    replies.rewindPreview = {
      at: now - 10 * min, counts: { reopen: reopen.length, regroup: regroup.length, extra: extra.length, newWindows: 0 }, reopen, regroup, extra,
      warnings: [{ text: "Claude in Chrome is still working in Claude. It may change things again after this." }],
      text: `Reopens ${reopen.length} tabs, regroups ${regroup.length}. ${extra.length} tabs opened since stay open.`,
    };
    replies.rewind = { activityId: "demo", reopened: reopen.length, regrouped: regroup.length, closed: 0, newWindows: 0, failed: 0, kept: extra.length, text: `Reopened ${reopen.length} tabs, regrouped ${regroup.length}` };
    const step = (ms, find) => setTimeout(() => find()?.click(), ms);
    addEventListener("load", () => {
      step(500, () => document.getElementById("rewindOpen"));
      if (shot !== "p24") step(800, () => document.querySelectorAll("#reviewBox .tb-row .tb-title")[1]);
      if (shot === "p24-done") step(1100, () => document.querySelector("#reviewBox .tb-confirm-foot .primary"));
    });
  }

  // P25, on /sidepanel.html. ?shot=p25: verbs, a shortcut hint and results for "archive".
  // p25-group: a verb with ⌥⇧G and a group's row. p25-frequent: Down arrow in the empty box.
  // p25-ask: text that matches nothing, offered to Ask. p25-done: the toast with Undo after a verb.
  if (shot.startsWith("p25")) {
    const verb = (id, title, hint, extra = {}) => ({ kind: "Verb", verb: id, title, hint, ...extra });
    const tabRow = t => ({ kind: "Tab", title: t.title, url: t.url, content: `tab:${t.id}` });
    const saved = r => ({ kind: "Archived", title: r.title, url: r.url, content: r.url, ...(r.summary ? { summary: r.summary } : {}) });
    const archiveRows = [
      verb("archive-site", "Archive this site", "github.com"),
      verb("archive-tab", "Archive this tab", "Closes it and keeps it in the archive", { shortcut: "⌥⇧A" }),
      verb("open-archive", "Open archive", "Everything Simmer has put away"),
      saved({ title: "Archive of past launches", url: "https://www.notion.so/acme/launch-archive", summary: "Launch notes from the last two years." }),
      tabRow({ id: 900, title: "How we archive old projects", url: "https://docs.google.com/document/d/old-projects" }),
    ];
    const lists = {
      p25: archiveRows,
      "p25-done": archiveRows,
      "p25-group": [
        verb("group-tabs", "Group tabs", "This window, by your rules and sites", { shortcut: "⌥⇧G" }),
        verb("group-topic", "Group by topic", "This window, with your AI or your rules"),
        verb("show-groups", "Show all groups", "Opens every group again"),
        { kind: "Group", title: "Design", content: `tab:${tabs[6].id}`, hint: "3 tabs" },
      ],
      "p25-frequent": [tabRow(tabs[2]), verb("tidy", "Tidy this window", "Groups loose tabs and sleeps idle ones"), tabRow(tabs[9]), saved(archive[2]), verb("group-tabs", "Group tabs", "This window, by your rules and sites", { shortcut: "⌥⇧G" })],
      "p25-ask": [],
    };
    replies.commandSearch = { results: lists[shot] || archiveRows };
    if (shot === "p25-ask") replies.aiStatus = { provider: "device" };
    if (shot === "p25-done") { replies.closeSite = { count: 3 }; activity.unshift(A("archive", "Closed 3 tabs from github.com", -hour)); }
    const typed = { "p25-group": "group", "p25-ask": "the pricing page from last week", "p25-frequent": "" }[shot] ?? "archive";
    addEventListener("load", () => setTimeout(() => {
      const box = document.querySelector("#q");
      const key = name => box.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
      if (shot === "p25-frequent") return key("ArrowDown");
      box.value = typed;
      box.dispatchEvent(new Event("input", { bubbles: true }));
      if (shot === "p25-done") setTimeout(() => key("Enter"), 300);
    }, 150));
  }

  const local = { archive, setupDone: true };
  const sync = { settings: { idleHours: 72, setupDone: true } };
  // P23, on /sidepanel.html. ?shot=p23: the list. p23-confirm: the totals. p23-done: the toast.
  // p23-morning: the pick-up notice. p23-notice: the end-of-day notice. p23-week: the line in Recently.
  // Settings: /manage.html?shot=p23#settings. Words as lib.js writes them.
  if (shot.startsWith("p23") || holder === "p23") {
    sync.settings.dayEnd = true;
    const item = (key, kind, title, color, url, count, usedAgo, choice) => ({ key, kind, title, color, url, favIconUrl: "", ids: [], count, lastUsed: now - usedAgo, active: choice === "keep", choice });
    replies.dayPreview = {
      items: [
        item("group:1", "group", "Code", "blue", tabs[2].url, 4, 2 * min, "keep"),
        item("thread:9", "thread", "camera reviews", "", "https://www.dpreview.com/reviews", 2, 40 * min, "tomorrow"),
        item("group:2", "group", "Design", "pink", tabs[6].url, 3, 3 * hour, "tomorrow"),
        item("group:3", "group", "Docs", "yellow", tabs[9].url, 2, 5 * hour, "tomorrow"),
        item("site:arxiv.org", "site", "arxiv.org", "", "https://arxiv.org/abs/2610.01234", 2, 2 * day, "done"),
        item("group:4", "group", "Reading", "green", tabs[11].url, 3, 4 * day, "done"),
      ],
      kept: [
        { id: tabs[0].id, title: tabs[0].title, url: tabs[0].url, code: "never" },
        { id: tabs[1].id, title: tabs[1].title, url: tabs[1].url, code: "never" },
        { id: 901, title: "Lofi radio", url: "https://www.youtube.com/watch?v=radio", code: "audible" },
      ],
    };
    replies.putAway = { activityId: "demo", count: 12, tomorrow: 7, kept: [], failed: [], text: "Put away 12 tabs." };
    replies.weekNote = { count: 74, text: "Put away 74 tabs this week" };
    if (shot === "p23-morning") replies.pickUpList = {
      total: 7, later: false, text: "3 from yesterday",
      items: [
        { key: "camera reviews", title: "camera reviews", url: "https://www.dpreview.com/reviews", favIconUrl: "", carry: "", ids: ["a"], count: 2 },
        { key: "Design", title: "Design", url: tabs[6].url, favIconUrl: "", carry: "", ids: ["b"], count: 3 },
        { key: "Docs", title: "Docs", url: tabs[9].url, favIconUrl: "", carry: "", ids: ["c"], count: 2 },
      ],
    };
    if (shot === "p23-notice") replies.dayNotice = { notice: { text: "Ready to put today away?", count: 6 } };
    const step = (ms, find) => setTimeout(() => find()?.click(), ms);
    addEventListener("load", () => {
      if (holder === "p23") setTimeout(() => document.querySelector("#dayEnd")?.scrollIntoView({ block: "center" }), 500);
      if (shot === "p23-week") { const box = document.getElementById("activity"); if (box) box.open = true; }
      if (["p23", "p23-confirm", "p23-done"].includes(shot)) step(500, () => document.getElementById("dayOpen"));
      if (shot === "p23-confirm" || shot === "p23-done") step(800, () => document.querySelector("#reviewBox .tb-confirm-foot .primary"));
      if (shot === "p23-done") step(1100, () => document.querySelector("#reviewBox .tb-confirm-foot .primary"));
    });
  }

  // ?shot=p22 the setting (Settings runs in Manage's frame, so also /manage.html?shot=p22#settings)
  // and, in the panel, a thread's group. ?shot=p22-why: the Why popover of a tab in that group.
  if (shot.startsWith("p22") || holder === "p22") {
    sync.settings.groupMode = "thread";
    groups.unshift({ id: 6, windowId: 1, title: "camera reviews", color: "cyan", collapsed: false });
    const thread = [
      T(6, "https://www.google.com/search?q=camera+reviews", "camera reviews - Google Search"),
      T(6, "https://www.dpreview.com/reviews", "Camera reviews: Digital Photography Review"),
      T(6, "https://www.rtings.com/camera/reviews", "The 6 best cameras of 2026 - RTINGS.com"),
    ];
    tabs.unshift(...thread);
    replies.tabFate = {
      group: { code: "thread", why: "Opened from a tab in camera reviews, as part of the same task." },
      sleep: { at: now + 12 * min, code: "waiting", due: false, why: "Sleeps after 30 minutes unused." },
      archive: { at: now + 3 * day, code: "waiting", due: false, why: "Archives with its group, after 3 days unused." },
      paused: null,
    };
    addEventListener("load", () => setTimeout(() => {
      document.querySelector("#groupMode")?.scrollIntoView({ block: "center" });
      if (shot === "p22-why") document.querySelector(`.tabs-list li[data-id="${thread[1].id}"] [aria-label^="Why"]`)?.click();
    }, 500));
  }
  // The Simmer screens: ?shot=list | away | recent | first | morning (list.html, welcome.html, morning.html).
  {
    const task = (key, name, rows, source = "thread") => ({ id: key, name, source, tabIds: [], tabs: rows.map(([title, url], i) => ({ id: 5000 + key.length * 10 + i, title, url, favIconUrl: icon(url) })) });
    const camera = task("camera", "Choosing a camera", [["Sony a7C II review: the best compact full frame?", "https://www.dpreview.com/"], ["Fujifilm X-T5 vs Sony a7C II", "https://www.youtube.com/"], ["best mirrorless camera for travel 2026", "https://www.google.com/search?q=camera"], ["FE 40mm F2.5 G 価格", "https://www.mapcamera.com/"], ["r/SonyAlpha: a7C II or a7 IV for street?", "https://www.reddit.com/"]]);
    const kyoto = task("kyoto", "Kyoto trip", [["Kyoto in November: autumn leaves forecast", "https://www.japan-guide.com/"], ["Hotels in Kyoto, Nov 20-23", "https://www.booking.com/"], ["東海道新幹線 時刻表", "https://jr-central.co.jp/"], ["Tofuku-ji Temple opening hours", "https://tofukuji.jp/"]]);
    const bug = task("bugfix", "Double fetch bug", [["useEffect runs twice in development", "https://stackoverflow.com/"], ["You Might Not Need an Effect", "https://react.dev/"], ["Pull request #482: Fix double fetch", "https://github.com/"]]);
    const flat = task("flat", "目黒の部屋探し", [["目黒区 1LDK 賃貸 20万円以下", "https://suumo.jp/"], ["Tokyo rent by neighbourhood 2026", "https://www.homes.co.jp/"]]);
    const kettle = task("kettle", "How to descale a kettle", [["How to descale a kettle", "https://www.wikihow.com/"]], "single");
    const stay = [["Gmail", "https://mail.google.com/"], ["Slack", "https://slack.com/"], ["Calendar", "https://calendar.google.com/"], ["LINE", "https://line.me/"], ["Linear", "https://linear.app/"]].map(([title, url], i) => ({ id: 6000 + i, title, url, favIconUrl: icon(url), reason: "app" }));
    const burn = (t, at) => ({ id: t.id, name: t.name, ids: t.tabs.map((_, i) => `${t.id}${i}`), urls: t.tabs.map(row => row.url), titles: t.tabs.map(row => row.title), favIconUrls: t.tabs.map(row => row.favIconUrl), at });
    const log = [
      { id: "a1", text: "Put Tax return away, 3 tabs", at: now - 2 * min, undo: { type: "batch" } },
      { id: "a2", text: "Moved 1 tab to Kyoto trip, and learned they go together", at: now - 12 * min, undo: { type: "taskMemory" } },
      { id: "a3", text: "Renamed to Choosing a camera", at: now - hour, undo: { type: "taskMemory" }, undone: true },
      { id: "a4", text: "Put 2 tabs to sleep", at: now - 3 * hour, undo: { type: "wake" }, auto: true },
    ];
    const tax = task("tax", "Tax return", [["Freelancer final tax return guide", "https://www.nta.go.jp/"], ["Blue return deduction", "https://www.freee.co.jp/"], ["Invoice system for freelancers", "https://biz.moneyforward.com/"]]);
    const yesterday = now - day;
    if (shot === "morning") {
      replies.tasks = { tasks: [], stay, burner: [burn(camera, yesterday), burn(kyoto, yesterday), burn(flat, yesterday), burn(tax, now - 4 * day)], model: "on" };
      handlers.taskBringBack = ({ id }) => {
        const t = [camera, kyoto, flat, tax].find(x => x.id === id);
        return { text: `Opened ${t.name}, ${t.tabs.length} tabs.`, activityId: `open-${id}` };
      };
    }
    else if (shot === "away") replies.tasks = { tasks: [camera, flat], stay, burner: [burn(kyoto, now - 5 * min), burn(tax, now - 3 * hour)], model: "on" };
    else if (["list", "recent", "first"].includes(shot)) replies.tasks = { tasks: [camera, kyoto, bug, flat, kettle], stay, burner: shot === "first" ? [] : [burn(tax, now - 2 * min)], model: "on" };
    if (play) playPanel({ tasks: [camera, kyoto, bug, flat], stay, burner: [burn(tax, now - 2 * min)], log, burn });
    if (["list", "away", "recent", "first", "morning"].includes(shot)) {
      replies.activity = { activity: log };
      addEventListener("load", () => setTimeout(() => {
        // Recently opens from the clock on its line, as a view over the list.
        // A pointer click shows no focus ring; a scripted one would, so it lets go of focus afterwards.
        // The still shows it settled, not sliding in.
        if (shot === "recent") { document.querySelector(".tb-recent .tb-ib")?.click(); document.querySelector(".tb-sheet")?.classList.remove("is-opening"); document.activeElement?.blur(); }
      }, 500));
    }
  }

  // ?shot=play: the panel keeps real state, so putting away, bringing back and undo move tasks as they
  // do in the extension. A pointer then plays through them on a loop, until a person touches the panel.
  // With reduced motion it doesn't play; the panel just waits to be tried.
  function playPanel({ tasks, stay, burner, log, burn }) {
    const live = { tasks: [...tasks], burner: [...burner], log: [...log] };
    const undos = new Map();
    let n = 0;
    const record = (text, undo) => {
      const entry = { id: `play-${++n}`, text, at: Date.now(), undo: { type: "batch" } };
      live.log.unshift(entry);
      undos.set(entry.id, undo);
      return entry.id;
    };
    const tabs = count => `${count} ${count === 1 ? "tab" : "tabs"}`;
    const wait = ms => new Promise(done => setTimeout(done, ms));
    const putAway = task => {
      const at = live.tasks.indexOf(task);
      live.tasks.splice(at, 1);
      const away = burn(task, Date.now());
      live.burner.unshift(away);
      return { at, away };
    };
    const bringBack = (away, at = 0) => {
      live.burner.splice(live.burner.indexOf(away), 1);
      const task = tasks.find(t => t.id === away.id);
      live.tasks.splice(Math.min(at, live.tasks.length), 0, task);
    };
    Object.assign(handlers, {
      tasks: () => ({ tasks: live.tasks, stay, burner: live.burner, model: "on" }),
      activity: () => ({ activity: live.log }),
      finishSetup: () => ({}),
      taskPutAway: async ({ id }) => {
        await wait(450);
        const task = live.tasks.find(t => t.id === id);
        const { at, away } = putAway(task);
        const text = `Put ${task.name} away, ${tabs(task.tabs.length)}.`;
        return { count: task.tabs.length, text, activityId: record(text.slice(0, -1), () => bringBack(away, at)) };
      },
      taskBringBack: async ({ id }) => {
        await wait(450);
        const away = live.burner.find(t => t.id === id);
        bringBack(away);
        const task = live.tasks.find(t => t.id === id);
        const text = `Brought back ${task.name}, ${tabs(task.tabs.length)}.`;
        return { text, activityId: record(text.slice(0, -1), () => putAway(task)) };
      },
      undo: ({ id }) => {
        undos.get(id)?.();
        const entry = live.log.find(e => e.id === id);
        if (entry) entry.undone = true;
        return { ok: true };
      },
    });
    // &script: a recording drives the page itself (store/art/video.mjs), so nothing plays on its own.
    if (new URLSearchParams(location.search).has("script") || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // The pointer: an arrow that glides to a control, presses it, and moves on.
    let stopped = false, paused = false;
    const stop = event => { if (event.isTrusted) { stopped = true; pointer?.remove(); } };
    addEventListener("pointerdown", stop, true);
    addEventListener("keydown", stop, true);
    addEventListener("wheel", stop, { capture: true, passive: true });
    addEventListener("message", event => { if (event.data?.simmer) paused = event.data.simmer === "pause"; });
    let pointer;
    const ready = async () => { while (paused && !stopped) await wait(300); return !stopped; };
    const point = async (find, { press = true } = {}) => {
      if (!await ready()) return false;
      const target = find();
      if (!target) return true;
      const row = target.closest(".tb-task");
      // Scrolls the panel's own list only: scrollIntoView would also move the website around the panel.
      const list = row?.closest(".tb-app-scroll");
      if (list) {
        const r = row.getBoundingClientRect(), l = list.getBoundingClientRect();
        if (r.top < l.top || r.bottom > l.bottom) list.scrollBy({ top: r.top - l.top - 12, behavior: "smooth" });
      }
      await wait(350);
      const box = target.getBoundingClientRect();
      pointer.style.transform = `translate(${box.left + box.width / 2}px, ${box.top + box.height / 2}px)`;
      await wait(750);
      if (!await ready()) return false;
      row?.classList.add("is-hover");
      await wait(500);
      if (press) {
        pointer.classList.add("is-down");
        await wait(140);
        pointer.classList.remove("is-down");
        find()?.click();
        find()?.blur();
      }
      return true;
    };
    const act = (id, label) => () => document.querySelector(`[data-task="${id}"] .tb-task-acts [aria-label="${label}"]`);
    addEventListener("load", async () => {
      pointer = document.createElement("div");
      pointer.setAttribute("aria-hidden", "true");
      // Ink with a butter outline, the same in light and dark.
      pointer.innerHTML = `<svg viewBox="0 0 24 24" width="34" height="34" style="filter: drop-shadow(0 3px 5px rgba(36,33,28,.35))"><path d="M5 3l14 8-6.2 1.6L9.5 19z" fill="#24211c" stroke="#f5d97e" stroke-width="2.2" stroke-linejoin="round"/></svg>`;
      Object.assign(pointer.style, { position: "fixed", left: "-7px", top: "-4px", zIndex: 99, pointerEvents: "none", transition: "transform .7s cubic-bezier(.2,.8,.2,1)", transform: "translate(70vw, 105vh)" });
      document.head.append(Object.assign(document.createElement("style"), { textContent: ".is-down svg { transform: scale(.82); transition: transform .12s }" }));
      document.body.append(pointer);
      await wait(2200);
      const steps = [
        [act("kyoto", "Put away"), 2600],
        [act("bugfix", "Put away"), 2600],
        [act("kyoto", "Bring back"), 2600],
        [act("bugfix", "Bring back"), 3200],
      ];
      while (!stopped) for (const [find, after] of steps) {
        if (!await point(find)) return;
        pointer.style.transform = "translate(78vw, 92vh)";
        await wait(after);
      }
    });
  }

  const pick = (store, keys) => {
    if (keys == null) return { ...store };
    const list = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys);
    return Object.fromEntries(list.filter(k => k in store).map(k => [k, store[k]]));
  };
  if (shot === "undo") try { localStorage.setItem("tb.activityOpen", "true"); } catch {}
  else try { localStorage.setItem("tb.activityOpen", "false"); } catch {}

  window.chrome = {
    runtime: {
      id: "demo", lastError: undefined,
      getURL: p => {
        if (play && p.startsWith("/_favicon/")) try { return icon(new URL(p, location.origin).searchParams.get("pageUrl")); } catch {}
        return location.origin + (p.startsWith("/") ? p : `/${p}`);
      },
      sendMessage: async m => structuredClone(handlers[m?.cmd] ? await handlers[m.cmd](m) : replies[m?.cmd] ?? {}),
      onMessage: ev(), getManifest: () => ({ version: "4.0.0" }),
      connect: () => ({ onMessage: ev(), onDisconnect: ev(), postMessage() {}, disconnect() {} }),
    },
    storage: {
      local: { get: async k => pick(local, k), set: async o => Object.assign(local, o) },
      sync: { get: async k => pick(sync, k), set: async o => Object.assign(sync, o) },
      session: { get: async () => ({}), set: async () => {} },
      onChanged: ev(),
    },
    tabs: {
      query: async o => tabs.filter(t => (o?.windowId == null || t.windowId === o.windowId) && (o?.active == null || !!t.active === o.active)),
      get: async i => tabs.find(t => t.id === i), update: async () => ({}), create: async () => ({}), group: async () => 1,
      onUpdated: ev(), onRemoved: ev(), onCreated: ev(), onActivated: ev(), onMoved: ev(), onAttached: ev(), onDetached: ev(),
      getCurrent: async () => tabs[2],
    },
    tabGroups: { query: async () => groups, update: async () => ({}), onUpdated: ev(), onCreated: ev(), onRemoved: ev(), onMoved: ev() },
    windows: { getCurrent: async () => ({ id: 1 }), getLastFocused: async () => ({ id: 1 }), update: async () => ({}), onFocusChanged: ev() },
    bookmarks: { getTree: async () => [{ id: "0", children: [{ id: "1", title: "Bookmarks bar", children: [] }, { id: "2", title: "Other bookmarks", children: [] }] }], search: async () => [], onCreated: ev(), onRemoved: ev(), onMoved: ev(), onChanged: ev() },
    permissions: { contains: async () => false, request: async () => false, onAdded: ev(), onRemoved: ev() },
    i18n: { getUILanguage: () => "en-US", getMessage: () => "" },
    commands: { getAll: async () => [] },
    sidePanel: {}, action: {}, sessions: { getRecentlyClosed: async () => [] }, readingList: {},
  };
})();
