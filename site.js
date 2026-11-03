// Motion for the Simmer website. Everything here is extra: without it (no scripts, or reduced motion)
// the page reads complete. html.arrive is set in the head only when motion is allowed.
const moving = document.documentElement.classList.contains("arrive");
const wait = ms => new Promise(done => setTimeout(done, ms));

// ---------- the opening ----------
// The headline arrives in two beats: "Every open tab", a breath, then the rest. The panel's tabs arrive
// in a mess on the first beat and sort themselves into the panel on the second.
const BEAT_TWO = 1900;   // "Every open tab" holds on its own for about a second before the rest arrives

// Each beat rises as one piece from behind its own edge, so the line reads as two thoughts, not typing.
function splitHeadline() {
  const h1 = document.getElementById("title");
  h1.classList.add("split");
  h1.setAttribute("aria-label", h1.textContent.replace(/\s+/g, " ").trim());
  for (const [b, beat] of [...h1.querySelectorAll(".beat")].entries()) {
    beat.setAttribute("aria-hidden", "true");
    beat.innerHTML = `<span style="--at:${b ? BEAT_TWO : 150}ms">${beat.textContent}</span>`;
  }
}

// The morph: the panel starts hidden, and its own tabs tumble in where it will be, in a mess. On the
// second beat each tab glides to the very row it has in the real panel, the task names fade in above
// them, and the panel fades up underneath, so the mess becomes the list. Rows are measured from the
// panel itself (same origin), so the tabs land exactly. Side by side only, where the panel is in view.
const live = document.getElementById("live");
const frame = document.querySelector(".live-frame");
const hero = document.getElementById("hero");
const morphs = moving && innerWidth >= 1100 && frame.getBoundingClientRect().top < innerHeight * .6;
if (morphs) hero.classList.add("morph");

// Tumbled positions, as fractions of the panel: [x, y, tilt]. Some spill out to the left.
const MESS = [[.05, .08, -9], [.42, .03, 7], [-.16, .2, 5], [.3, .22, -12], [.6, .14, 10], [-.08, .38, -6],
  [.38, .4, 4], [.08, .55, 11], [.55, .5, -8], [-.18, .62, 7], [.28, .7, -5], [.5, .8, 9], [-.05, .85, -10]];
const sleep = (ms, ...p) => new Promise(done => setTimeout(done, ms, ...p));

// What to aim at: every tab row and task name visible in the panel, in page coordinates.
async function measure() {
  for (let i = 0; i < 45 && !live.contentDocument?.querySelector(".tb-task .tb-row"); i++) await sleep(100);
  const doc = live.contentDocument;
  // Rows are measured where they come to rest: the panel's own arrival slides them in, so for one
  // instant its animations are switched off.
  const still = doc.createElement("style");
  still.textContent = "*, *::before, *::after { animation: none !important; transition: none !important; }";
  doc.head.append(still);
  // In the panel's own coordinates: the tabs ride in a layer pinned to the panel, so if the page shifts
  // (the headline's font arriving, say) they shift with it.
  const scroll = doc.querySelector(".tb-app-scroll").getBoundingClientRect();
  const page = r => ({ x: r.left, y: r.top, w: r.width, h: r.height });
  const seen = r => r.top >= scroll.top && r.bottom <= scroll.bottom;
  const rows = [], heads = [];
  for (const task of doc.querySelectorAll(".tb-task:not(.is-away)")) {
    const name = task.querySelector(".tb-task-name");
    if (seen(name.getBoundingClientRect())) heads.push({ text: name.textContent, at: page(name.getBoundingClientRect()), style: getComputedStyle(name) });
    for (const row of task.querySelectorAll(".tb-row")) {
      const fav = row.querySelector(".fav"), title = row.querySelector(".tb-title");
      if (!fav || !title || !seen(row.getBoundingClientRect())) continue;
      const f = fav.getBoundingClientRect(), t = title.getBoundingClientRect();
      rows.push({ text: title.textContent, icon: fav.getAttribute("src"), fav: page(f), title: page(t), style: getComputedStyle(title) });
    }
  }
  still.remove();
  return { rows, heads };
}

// The panel's first rows, in order: [title, favicon]. The mess is made of these at once, before the panel
// has loaded; once it has been measured, each tab finds its row by its title.
const FIRST = [
  ["Sony a7C II review: the best compact full frame?", "www.dpreview.com"], ["Fujifilm X-T5 vs Sony a7C II", "www.youtube.com"],
  ["best mirrorless camera for travel 2026", "www.google.com"], ["Kyoto in November: autumn leaves forecast", "www.japan-guide.com"],
  ["Hotels in Kyoto, Nov 20-23", "www.booking.com"], ["東海道新幹線 時刻表", "jr-central.co.jp"], ["Tofuku-ji Temple opening hours", "tofukuji.jp"],
  ["useEffect runs twice in development", "stackoverflow.com"], ["You Might Not Need an Effect", "react.dev"],
  ["Pull request #482: Fix double fetch", "github.com"],
];

async function morph() {
  const measured = Promise.race([measure(), sleep(5000, null)]).catch(() => null);
  const layer = document.createElement("div");
  layer.className = "mess";
  layer.setAttribute("aria-hidden", "true");
  const figure = document.getElementById("live-figure");
  const at = live.getBoundingClientRect(), fig = figure.getBoundingClientRect();
  layer.style.left = `${at.left - fig.left}px`;
  layer.style.top = `${at.top - fig.top}px`;
  figure.append(layer);

  // In: each tab drops into the mess, one after another, while "Every open tab" holds.
  const chips = FIRST.map(([text, host], i) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `<img src="app/favicons/${host}.png" alt="" width="16" height="16"><span></span>`;
    chip.querySelector("span").textContent = text;
    const [mx, my, tilt] = MESS[i % MESS.length];
    Object.assign(chip, { text, tilt, x: mx * at.width, y: my * at.height });
    Object.assign(chip.style, { left: `${chip.x}px`, top: `${chip.y}px` });
    layer.append(chip);
    chip.animate([
      { transform: `rotate(${tilt}deg) scale(.3)`, opacity: 0 },
      { transform: `rotate(${tilt}deg) scale(1.06)`, opacity: 1, offset: .7 },
      { transform: `rotate(${tilt}deg) scale(1)`, opacity: 1 },
    ], { duration: 520, delay: 200 + i * 70, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" });
    return chip;
  });

  const [target] = await Promise.all([measured, sleep(BEAT_TWO + 250)]);
  // Sorted: each tab glides to its row, task by task, losing its tilt and its card on the way. A tab
  // whose row is out of sight sinks into the panel instead.
  layer.classList.add("sorting");
  const moves = chips.map((chip, i) => {
    const row = target?.rows.find(r => r.text === chip.text);
    chip.getAnimations().forEach(a => a.cancel());
    const timing = { duration: 950, delay: i * 45, easing: "cubic-bezier(.65,0,.25,1)", fill: "both" };
    if (!row) return chip.animate([
      { transform: `rotate(${chip.tilt}deg)`, opacity: 1 },
      { transform: `translate(${at.width / 2 - chip.x}px, ${at.height * .8 - chip.y}px) scale(.4)`, opacity: 0 },
    ], timing).finished;
    const pad = 10, x = row.fav.x - pad, y = row.title.y + row.title.h / 2 - 17;
    Object.assign(chip.style, { left: `${x}px`, top: `${y}px`, maxWidth: `${row.title.x + row.title.w - row.fav.x + pad + 12}px` });
    chip.style.setProperty("--gap", `${row.title.x - (row.fav.x + row.fav.w)}px`);
    chip.style.setProperty("--fs", row.style.fontSize);
    chip.style.setProperty("--ink", row.style.color);
    const dx = chip.x - x, dy = chip.y - y;
    return chip.animate([
      { transform: `translate(${dx}px, ${dy}px) rotate(${chip.tilt}deg)`, opacity: 1 },
      { transform: `translate(${dx * .75}px, ${dy * .75 - 6}px) rotate(0deg)`, opacity: 1, offset: .25 },
      { transform: "none", opacity: 1 },
    ], timing).finished;
  });
  for (const head of target?.heads || []) {
    const ghost = document.createElement("div");
    ghost.className = "ghost-head";
    ghost.textContent = head.text;
    Object.assign(ghost.style, { left: `${head.at.x}px`, top: `${head.at.y}px`, height: `${head.at.h}px`, font: head.style.font, color: head.style.color });
    layer.append(ghost);
  }
  await sleep(500);
  layer.classList.add("named");
  await Promise.all(moves);
  land(layer);
}

// The panel fades up under the sorted tabs, which then go, and it starts to play.
async function land(layer) {
  hero.classList.add("landed");
  await sleep(380);
  layer.classList.add("gone");
  await sleep(700);
  layer.remove();
  held = false;
  if (inView) live.contentWindow?.postMessage({ simmer: "play" }, "*");
}

// ---------- how it works ----------
// Each step is a short video of the real extension. Wide screens: a stage beside the steps shows the
// step nearest the middle of the window, and its video starts from the top. Narrow screens: each step's
// own video plays while it's on screen. With reduced motion nothing plays by itself; each has controls.
const wide = matchMedia("(min-width: 1025px)");
const darkMode = matchMedia("(prefers-color-scheme: dark)");
const play = video => { video.muted = true; video.preload = "auto"; video.play().catch(() => {}); };

function posters() {
  for (const video of document.querySelectorAll("video.clip")) {
    video.dataset.lightPoster ||= video.getAttribute("poster");
    video.poster = darkMode.matches ? video.dataset.darkPoster : video.dataset.lightPoster;
    if (!moving) video.controls = true;
  }
}

function walk() {
  const steps = [...document.querySelectorAll(".step")];
  const stage = document.getElementById("stage");
  const scenes = steps.map(step => {
    const scene = step.querySelector(".scene").cloneNode(true);
    stage.append(scene);
    return scene;
  });
  posters();
  darkMode.addEventListener("change", posters);
  let current = -1, inView = false;
  const stageVideo = i => scenes[i]?.querySelector("video");
  const show = i => {
    if (i === current) return;
    current = i;
    scenes.forEach((scene, n) => scene.classList.toggle("on", n === i));
    steps.forEach((step, n) => step.classList.toggle("on", n === i));
    stage.parentElement.style.setProperty("--progress", (i + 1) / steps.length);
    if (!moving || !wide.matches) return;
    scenes.forEach((scene, n) => { if (n !== i) scene.querySelector("video").pause(); });
    const video = stageVideo(i);
    video.currentTime = 0;
    if (inView) play(video);
  };
  const seen = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) show(steps.indexOf(entry.target));
  }, { rootMargin: "-45% 0px -45% 0px" });
  steps.forEach(step => seen.observe(step));
  show(0);
  if (!moving) return;
  // The page dims while the walk holds the middle of the window, so the steps and videos stand out.
  new IntersectionObserver(([entry]) => document.body.classList.toggle("dim", entry.isIntersecting), { rootMargin: "-35% 0px -35% 0px" })
    .observe(stage.parentElement.parentElement);
  // The stage plays only while the walk is on screen.
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (!wide.matches) return;
    inView ? play(stageVideo(current)) : stageVideo(current).pause();
  }).observe(stage.parentElement);
  // Narrow screens: each step's video plays while most of it is in view.
  const own = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (wide.matches) continue;
      entry.isIntersecting ? play(entry.target) : entry.target.pause();
    }
  }, { threshold: .2 });
  steps.forEach(step => own.observe(step.querySelector("video")));
  wide.addEventListener("change", () => document.querySelectorAll("video.clip").forEach(v => v.pause()));
}

// ---------- reveals ----------
function reveals() {
  const io = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add("in"); io.unobserve(entry.target); }
  }, { rootMargin: "0px 0px -12% 0px" });
  document.querySelectorAll(".reveal, .step").forEach(node => io.observe(node));
}

// The pull quote warms word by word as it scrolls through the window.
function pull() {
  const p = document.getElementById("pull");
  const words = p.textContent.split(" ");
  p.setAttribute("aria-label", p.textContent);
  p.innerHTML = words.map((w, i) => `<span aria-hidden="true" style="--i:${i}">${w}</span>`).join(" ");
  const spans = [...p.children];
  const photo = document.querySelector(".pull-photo");
  const tick = () => {
    const box = p.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (innerHeight * .85 - box.top) / (innerHeight * .55)));
    spans.forEach((span, i) => span.classList.toggle("warm", t * spans.length > i + .3));
    // The photo behind eases in a little as the quote warms, like leaning over the pot.
    photo.style.setProperty("--zoom", (1.12 - t * .08).toFixed(4));
  };
  addEventListener("scroll", tick, { passive: true });
  tick();
}

// ---------- the footer: a pot of bubbles under the wordmark ----------
// Bubbles rise from the bottom of the word. Moving over it adds a few; a click stirs the pot.
function stove() {
  const holder = document.getElementById("pot-word"), canvas = document.getElementById("bubbles");
  const ctx = canvas.getContext("2d");
  const bubbles = [];
  let w = 0, h = 0, running = false, on = false;
  const size = () => {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    w = holder.clientWidth; h = holder.clientHeight;
    canvas.width = w * ratio; canvas.height = h * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  // One lit bubble, drawn once and scaled for every bubble: light from the top left, a deeper butter
  // towards the rim, a bright highlight and a soft glint where light comes through the far side.
  const sprite = document.createElement("canvas");
  {
    const S = 128, c = sprite.getContext("2d"), m = S / 2, r = m - 2;
    sprite.width = sprite.height = S;
    const body = c.createRadialGradient(m - r * .35, m - r * .4, r * .05, m, m, r);
    body.addColorStop(0, "#fff8d9");
    body.addColorStop(.35, "#f8e29a");
    body.addColorStop(.75, "#f0cd62");
    body.addColorStop(1, "#c99a1a");
    c.fillStyle = body;
    c.beginPath(); c.arc(m, m, r, 0, Math.PI * 2); c.fill();
    const glint = c.createRadialGradient(m + r * .45, m + r * .5, 0, m + r * .45, m + r * .5, r * .55);
    glint.addColorStop(0, "rgba(255, 246, 210, .55)");
    glint.addColorStop(1, "rgba(255, 246, 210, 0)");
    c.fillStyle = glint;
    c.beginPath(); c.arc(m, m, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = "rgba(255, 255, 255, .9)";
    c.beginPath(); c.ellipse(m - r * .38, m - r * .42, r * .2, r * .12, -Math.PI / 4, 0, Math.PI * 2); c.fill();
    c.fillStyle = "rgba(255, 255, 255, .7)";
    c.beginPath(); c.arc(m - r * .12, m - r * .62, r * .05, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "rgba(138, 106, 16, .45)"; c.lineWidth = 2;
    c.beginPath(); c.arc(m, m, r - 1, 0, Math.PI * 2); c.stroke();
  }
  // z: how near the bubble is (.35 far, 1 near). Near ones are bigger, quicker, brighter and drawn last.
  const add = (x = Math.random() * w, y = h + 10, big = 1) => {
    const z = .35 + Math.random() * .65;
    const b = { x, y, z, r: (6 + Math.random() * 16) * big * z, vy: (.35 + Math.random() * .9) * (.5 + z * .7), sway: Math.random() * Math.PI * 2, wob: Math.random() * Math.PI * 2, life: 1 };
    const at = bubbles.findIndex(o => o.z > z);
    bubbles.splice(at < 0 ? bubbles.length : at, 0, b);
  };
  const frame = () => {
    if (!on) { running = false; return; }
    ctx.clearRect(0, 0, w, h);
    if (bubbles.length < 60 && Math.random() < .35) add();
    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i];
      b.y -= b.vy; b.sway += .03; b.wob += .09; b.x += Math.sin(b.sway) * .4 * b.z;
      if (b.y < h * .25) b.life -= .02;
      if (b.life <= 0 || b.y < -40) { bubbles.splice(i--, 1); continue; }
      // A soft squash as it rises, so it reads as a liquid bubble rather than a ball.
      const sx = 1 + Math.sin(b.wob) * .06, sy = 1 - Math.sin(b.wob) * .06;
      ctx.globalAlpha = Math.max(0, b.life) * (.45 + b.z * .55);
      ctx.drawImage(sprite, b.x - b.r * sx, b.y - b.r * sy, b.r * 2 * sx, b.r * 2 * sy);
    }
    requestAnimationFrame(frame);
  };
  const start = () => { if (!running && on) { running = true; requestAnimationFrame(frame); } };
  new ResizeObserver(size).observe(holder);
  new IntersectionObserver(([e]) => { on = e.isIntersecting; start(); }).observe(holder);
  holder.addEventListener("pointermove", event => {
    if (Math.random() < .3) { const r = canvas.getBoundingClientRect(); add(event.clientX - r.left, event.clientY - r.top + 20, .7); }
  });
  document.getElementById("stir").addEventListener("click", () => {
    for (let i = 0; i < 40; i++) add(Math.random() * w, h + Math.random() * 40, 1.4);
    holder.classList.remove("stirred"); void holder.offsetWidth; holder.classList.add("stirred");
  });
}

// ---------- always ----------
// The live panel plays only while it's on screen, and not until the morph has landed.
let held = morphs, inView = true;
new IntersectionObserver(([entry]) => {
  inView = entry.isIntersecting;
  if (!held) live.contentWindow?.postMessage({ simmer: inView ? "play" : "pause" }, "*");
}).observe(live);
// Paused as soon as it can hear, whether or not it has finished loading.
const hold = () => { if (held) live.contentWindow?.postMessage({ simmer: "pause" }, "*"); };
if (morphs) { hold(); live.addEventListener("load", hold); setTimeout(hold, 300); }

walk();
// The opening waits until the page is actually on screen: a tab opened in the background would otherwise
// run its timers while its animations stand still, and the two would come apart.
function opening() {
  document.documentElement.classList.add("go");
  if (morphs) morph();
  // The simmer behind the headline settles after 8 seconds, as in the side panel.
  setTimeout(() => document.getElementById("headline").classList.add("settled"), 8000 + BEAT_TWO);
}
if (moving) {
  splitHeadline();
  if (document.visibilityState === "visible") opening();
  else document.addEventListener("visibilitychange", function shown() {
    if (document.visibilityState !== "visible") return;
    document.removeEventListener("visibilitychange", shown);
    opening();
  });
  reveals();
  pull();
  stove();
}
