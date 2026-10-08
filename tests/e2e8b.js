/* Phase 8B: runs the topic scenarios (topic-scenarios.js) in real Chromium via Playwright, plus checks that need
   real CSS, real clicks and a touch screen. Fake GitHub = FakeGH (harness.js) behind request interception; fake folder =
   an in-page copy of the File System Access API subset. Needs: npm i playwright (and its Chromium).  Run: node tests/e2e8b.js */
const fs = require("fs");
const path = require("path");
let pw;
try { pw = require("playwright"); } catch { pw = require(process.env.PLAYWRIGHT_PATH || "/home/claude/.npm-global/lib/node_modules/playwright"); }
const { FakeGH } = require("./harness");
const makeDriver = require("./driver");
const defineTopics = require("./topic-scenarios");

const ROOT = path.join(__dirname, "..");
const HELPERS = fs.readFileSync(path.join(__dirname, "domhelpers.js"), "utf8");
const CSS = ["style.css", "subject.css", "notes.css", "auth.css", "stage.css", "dock.css"];
const MIME = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json" };

let passed = 0, failed = 0;
const failures = [];
function ok(cond, msg) { if (cond) passed++; else { failed++; failures.push(msg); console.log("  FAIL:", msg); } }
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}\n      got:      ${JSON.stringify(a)}\n      expected: ${JSON.stringify(b)}`);
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const STUB_RENDER = `window.NotesRender = { toElement(text) { const d = document.createElement("div"); d.className = "md"; d.textContent = text; return d; } };`;
const STUB_AUTH = `(() => { let tok = null; window.Auth = { loadRecord: async () => ({}), unlock: async () => { tok = "test-token"; return tok; },
  checkWriteAccess: async () => ({ ok: true }), getToken: () => tok, isUnlocked: () => !!tok, lock: () => { tok = null; }, setRecordLoader() {} }; })();`;
const STUB_LOCAL = `(() => { const r = window.__root; r.queryPermission = async () => "granted"; r.requestPermission = async () => "granted";
  window.NotesLocal.useStore({ get: async () => r, set: async () => {} }); })();`;
const FAKE_FOLDER = (files) => `(() => {
  const nf = () => { const e = new Error("nf"); e.name = "NotFoundError"; return e; };
  class FH { constructor(n) { this.name = n; this.kind = "file"; this.data = ""; }
    async getFile() { const d = this.data; return { text: async () => (typeof d === "string" ? d : new TextDecoder().decode(d)), arrayBuffer: async () => (typeof d === "string" ? new TextEncoder().encode(d).buffer : d) }; }
    async createWritable() { const h = this; return { write: async (x) => { h.data = typeof x === "string" ? x : new TextDecoder().decode(x); }, close: async () => {} }; } }
  class FD { constructor(n) { this.name = n; this.kind = "directory"; this.map = new Map(); }
    async getDirectoryHandle(n, o = {}) { const e = this.map.get(n); if (e && e.kind === "directory") return e; if (o.create) { const d = new FD(n); this.map.set(n, d); return d; } throw nf(); }
    async getFileHandle(n, o = {}) { let e = this.map.get(n); if (!e && o.create) { e = new FH(n); this.map.set(n, e); } if (!e || e.kind !== "file") throw nf(); return e; }
    async removeEntry(n) { if (!this.map.has(n)) throw nf(); this.map.delete(n); }
    async *entries() { for (const [k, v] of this.map) yield [k, v]; }
    async *keys() { for (const k of this.map.keys()) yield k; } }
  const root = new FD("project");
  const put = (p, c) => { const s = p.split("/"); const name = s.pop(); let d = root; for (const x of s) { let n = d.map.get(x); if (!n) { n = new FD(x); d.map.set(x, n); } d = n; } const h = new FH(name); h.data = c; d.map.set(name, h); };
  for (const [p, c] of Object.entries(${JSON.stringify(files || {})})) put(p, c);
  window.__root = root;
  window.showDirectoryPicker = async () => root;
  window.__dump = async () => { const out = []; const walk = async (d, pre) => { for await (const [n, h] of d.entries()) { if (h.kind === "directory") await walk(h, pre + n + "/"); else out.push([pre + n, typeof h.data === "string" ? h.data : new TextDecoder().decode(h.data)]); } }; await walk(root.map.get("notes"), "notes/"); return out; };
})();`;

const shell = (local) => `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${CSS.map((f) => `<link rel="stylesheet" href="${f}">`).join("")}</head>
<body><main id="app"></main><div id="toasts" class="toasts"></div>
${["config.js", "data.js", "render.js", "auth.js", "local.js", ...(local ? ["local-setup.js"] : []), "github.js", "stage.js", "app.js"].map((f) => `<script src="${f}"></script>`).join("")}</body></html>`;

let browser;
const open = [];
const pageErrors = [];

async function boot({ mode = "github", gh, files, hash = "#/", viewport, touch } = {}) {
  const context = await browser.newContext({ viewport: viewport || { width: 1280, height: 800 }, hasTouch: !!touch, isMobile: !!touch });
  open.push(context);
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(String(e.stack || e)));
  const local = mode === "local";
  const origin = local ? "http://localhost:8000" : "https://tester.github.io";
  const base = local ? "/" : "/site/";
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
  await context.addInitScript({ content: HELPERS });
  if (local) await context.addInitScript({ content: FAKE_FOLDER(files) });
  await context.route("**/*", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.hostname === "api.github.com" || u.hostname === "raw.githubusercontent.com") {
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      if (!gh) return route.fulfill({ status: 404, headers: cors, body: "{}" });
      const res = await gh.fetch(req.url(), { method: req.method(), body: req.postData() || undefined });
      return route.fulfill({ status: res.status, headers: { ...cors, "content-type": "application/json" }, body: await res.text() });
    }
    if (u.origin !== origin) return route.abort();
    const name = u.pathname.slice(base.length);
    if (name === "" || name === "index.html") return route.fulfill({ status: 200, contentType: "text/html", body: shell(local) });
    if (name === "render.js") return route.fulfill({ status: 200, contentType: "text/javascript", body: STUB_RENDER });
    if (name === "auth.js") return route.fulfill({ status: 200, contentType: "text/javascript", body: STUB_AUTH });
    if (name === "local-setup.js") return route.fulfill({ status: 200, contentType: "text/javascript", body: STUB_LOCAL });
    const file = path.join(ROOT, name);
    if (!name.includes("..") && fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({ status: 200, contentType: MIME[path.extname(file)] || "text/plain", body: fs.readFileSync(file) });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto(origin + base + hash);
  const app = makeDriver({
    call: (name, ...args) => page.evaluate(({ n, a }) => window.__t[n](...a), { n: name, a: args }),
    sleep: (ms) => page.waitForTimeout(ms),
    localFiles: async () => new Map(await page.evaluate(() => window.__dump())),
    extra: { page, context },
  });
  await app.settle();
  return app;
}

defineTopics({ test, ok, eq, boot, FakeGH });

/* ---------------- checks that need real CSS / real input ---------------- */
const BASEF = {
  "notes/Math/Chapter 01 - Basics/1.1 X.md": "X body",
  "notes/Math/Chapter 01 - Basics/1.2 Y.md": "Y body",
  "notes/Math/Chapter 01 - Basics/1.3 Z.md": "Z body",
  "notes/Dup/Chapter 01 - C/1.2 A.md": "a", "notes/Dup/Chapter 01 - C/1.2 B.md": "b",
};

test("8B real CSS: topic menu buttons and the duplicate banner exist only in write mode", async () => {
  const app = await boot({ gh: new FakeGH(BASEF), hash: "#/subject/Math/1.1" });
  const dots = app.page.locator('.topic[data-file="1.2 Y.md"]').locator("xpath=..").locator(".dots");
  ok(!(await dots.isVisible()), "read mode: the topic's ... is not visible");
  await app.login();
  ok(await dots.isVisible(), "write mode: the topic's ... is visible");
  const app2 = await boot({ gh: new FakeGH(BASEF), hash: "#/subject/Dup" });
  const banner = app2.page.locator(".dup-warning.topic-dup");
  ok(!(await banner.isVisible()), "read mode: duplicate topic banner hidden");
  await app2.login();
  ok(await banner.isVisible(), "write mode: duplicate topic banner shown");
});

test("8B real mouse: ... opens the menu without opening the topic; Rename dialog; Escape and outside click close", async () => {
  const app = await boot({ gh: new FakeGH(BASEF), hash: "#/subject/Math/1.1" });
  await app.login();
  await app.page.locator('.topic[data-file="1.3 Z.md"]').locator("xpath=..").locator(".dots").click();
  ok(await app.page.locator(".menu").isVisible(), "menu visible");
  eq(await app.hash(), "#/subject/Math/1.1", "a real click on ... did not open the topic");
  eq(await app.call("menuLabels"), ["Rename", "Move up", "Delete"], "last topic: no Move down");
  await app.page.keyboard.press("Escape");
  ok(!(await app.page.locator(".menu").isVisible()), "Escape closes");
  await app.page.locator('.topic[data-file="1.3 Z.md"]').locator("xpath=..").locator(".dots").click();
  await app.page.mouse.click(700, 400);
  ok(!(await app.page.locator(".menu").isVisible()), "outside click closes");
  await app.page.locator('.topic[data-file="1.2 Y.md"]').locator("xpath=..").locator(".dots").click();
  await app.page.locator(".menu button", { hasText: "Rename" }).click();
  ok(await app.page.locator("#modal").isVisible(), "Rename opens the dialog");
  eq(await app.call("dialogValue"), "Y", "prefilled with the current title");
});

test("8B touch screen + mobile drawer: tap ... inside the drawer, menu on top, tap Move down stages it, chip shows in the drawer", async () => {
  const gh = new FakeGH(BASEF);
  const app = await boot({ gh, hash: "#/subject/Math/1.1", viewport: { width: 390, height: 800 }, touch: true });
  await app.login();
  await app.page.locator("#open-index").tap();
  await app.waitFor(async () => (await app.page.locator("#index.open").count()) === 1);
  await app.page.waitForTimeout(350); // slide-in
  const dots = app.page.locator('.topic[data-file="1.2 Y.md"]').locator("xpath=..").locator(".dots");
  await dots.tap();
  ok(await app.page.locator(".menu").isVisible(), "menu opened by a tap");
  eq(await app.hash(), "#/subject/Math/1.1", "the tap did not open the topic");
  const onTop = await app.page.evaluate(() => { const m = document.querySelector(".menu").getBoundingClientRect(); const el = document.elementFromPoint(m.left + m.width / 2, m.top + 12); return !!(el && el.closest(".menu")); });
  ok(onTop, "the menu is above the drawer");
  await app.page.locator(".menu button", { hasText: "Move down" }).tap();
  await app.settle(60);
  eq(await app.count(), 1, "staged by a tap");
  eq(await app.call("topicsOf", "Chapter 01 - Basics"), ["1.1 X.md", "1.2 Z.md", "1.3 Y.md"], "swapped");
  ok(await app.page.locator("#index .dock-chip").isVisible(), "the dock chip is visible inside the open drawer");
  eq(await app.chip(), "1 unsaved change", "chip text");
});


/* The approved Phase 6/7 chapter scenario from tests.js, replayed through the real UI: topic changes must not disturb it. */
test("8B regression: approved chapter scenario (add, rename, move, delete+renumber, one Save) still gives the same tree", async () => {
  const BASE = {
    "notes/Math/Chapter 00 - Intro/0.1 A.md": "A body", "notes/Math/Chapter 00 - Intro/0.2 B.md": "B body",
    "notes/Math/Chapter 01 - Basics/1.1 X.md": "X body", "notes/Math/Chapter 01 - Basics/1.2 Y.md": "Y body", "notes/Math/Chapter 01 - Basics/fig.png": "PNG",
    "notes/Math/Chapter 02 - Middle/2.1 M.md": "M body",
    "notes/Math/Chapter 03 - Last/3.1 L.md": "L body", "notes/Math/Chapter 03 - Last/3.2 L2.md": "L2 body",
    "notes/Physics/Chapter 00 - Mech/0.1 F.md": "F body",
  };
  const EXPECTED = {
    "notes/Math/Chapter 00 - Core/0.1 X.md": "X body", "notes/Math/Chapter 00 - Core/0.2 Y.md": "Y body", "notes/Math/Chapter 00 - Core/fig.png": "PNG",
    "notes/Math/Chapter 01 - Intro/1.1 A.md": "A body", "notes/Math/Chapter 01 - Intro/1.2 B.md": "B body",
    "notes/Math/Chapter 02 - Last/2.1 L.md": "L body", "notes/Math/Chapter 02 - Last/2.2 L2.md": "L2 body",
    "notes/Math/Chapter 03 - Extra/.gitkeep": "", "notes/Physics/Chapter 00 - Mech/0.1 F.md": "F body",
  };
  const gh = new FakeGH(BASE);
  const app = await boot({ gh, hash: "#/subject/Math" });
  await app.login();
  await app.subjectMenu("Insert new chapter"); await app.submitDialog("Extra");
  await app.menuAction("Chapter 01 - Basics", "Rename chapter"); await app.submitDialog("Core");
  await app.menuAction("Chapter 01 - Core", "Move up");
  await app.menuAction("Chapter 02 - Middle", "Delete chapter"); await app.submitDialog();
  eq(await app.count(), 4, "4 staged chapter operations");
  await app.save();
  eq(gh.counts.commitPost, 1, "one commit");
  eq(Object.fromEntries([...gh.files().entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))), EXPECTED, "same final tree as the approved Phase 7 test");
});

(async () => {
  browser = await pw.chromium.launch();
  for (const [name, fn] of tests) {
    const before = failed;
    const errBefore = pageErrors.length;
    process.stdout.write(`- ${name}\n`);
    try { await fn(); } catch (e) { failed++; failures.push(`${name}: THREW ${e.stack || e}`); console.log("  THREW:", e.stack || e); }
    if (pageErrors.length > errBefore) { failed++; failures.push(`${name}: page errors ${pageErrors.slice(errBefore).join(" | ")}`); console.log("  PAGE ERROR:", pageErrors.slice(errBefore)[0]); }
    while (open.length) await open.pop().close();
    console.log(failed === before ? "  ok" : "  FAILED");
  }
  await browser.close();
  console.log(`\n${passed} checks passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
