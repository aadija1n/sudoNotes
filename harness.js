/* Test harness: fake GitHub (Git Data API subset), fake folder (File System Access API subset), jsdom app loader. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const PROJ = "/home/claude/proj";
const sha1 = (s) => crypto.createHash("sha1").update(String(s)).digest("hex");

/* ---------------- fake GitHub ---------------- */
class FakeGH {
  constructor(files) {
    this.blobs = new Map();
    this.trees = new Map();
    this.commits = new Map();
    this.messages = [];
    this.counts = { treePost: 0, commitPost: 0, refPatch: 0, refGet: 0 };
    this.beforePatch = null;
    this.failPatch = 0; // number of PATCH calls to reject with 422
    const m = new Map();
    for (const [p, c] of Object.entries(files)) m.set(p, { sha: this.blob(c), mode: "100644" });
    const tsha = this.tree(m);
    this.head = this.commit(tsha, [], "initial");
    this.headLog = [this.head];
  }
  blob(c) { const s = sha1("b:" + c); this.blobs.set(s, c); return s; }
  tree(m) {
    const s = sha1("t:" + JSON.stringify([...m.entries()].sort()));
    this.trees.set(s, new Map(m));
    return s;
  }
  commit(tree, parents, message) {
    const s = sha1("c:" + tree + parents.join(",") + message + this.commits.size);
    this.commits.set(s, { tree, parents, message });
    return s;
  }
  files(at = this.head) {
    const out = new Map();
    for (const [p, e] of this.trees.get(this.commits.get(at).tree)) out.set(p, this.blobs.get(e.sha));
    return out;
  }
  /* a push from somewhere else: changes = [{path, content}|{path, remove:true}] */
  external(changes, message = "external push") {
    const m = new Map(this.trees.get(this.commits.get(this.head).tree));
    for (const c of changes) {
      if (c.remove) m.delete(c.path);
      else m.set(c.path, { sha: this.blob(c.content), mode: "100644" });
    }
    const t = this.tree(m);
    this.head = this.commit(t, [this.head], message);
    this.headLog.push(this.head);
    return this.head;
  }
  res(status, body, raw) {
    return {
      ok: status >= 200 && status < 300, status,
      headers: { get: () => null },
      json: async () => (typeof body === "string" ? JSON.parse(body) : body),
      text: async () => (raw !== undefined ? raw : JSON.stringify(body)),
    };
  }
  async fetch(url, opts = {}) {
    const method = (opts.method || "GET").toUpperCase();
    const body = opts.body ? JSON.parse(opts.body) : null;
    const u = new URL(url);
    if (u.host === "raw.githubusercontent.com") {
      const p = decodeURIComponent(u.pathname.split("/").slice(4).join("/"));
      const f = this.files().get(p);
      return f === undefined ? this.res(404, {}) : this.res(200, {}, f);
    }
    const m = u.pathname.match(/^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/);
    if (!m) return this.res(404, { message: "no" });
    const rest = m[3] || "";
    if (rest === "") return this.res(200, { default_branch: "main", full_name: `${m[1]}/${m[2]}`, private: false });
    if (rest === "/git/blobs" && method === "POST") return this.res(201, { sha: this.blob(body.content) });
    let mm;
    if ((mm = rest.match(/^\/git\/ref\/heads\/(.+)$/))) { this.counts.refGet++; return this.res(200, { object: { sha: this.head } }); }
    if ((mm = rest.match(/^\/git\/commits\/(.+)$/)) && method === "GET") {
      const c = this.commits.get(mm[1]);
      return c ? this.res(200, { tree: { sha: c.tree } }) : this.res(404, { message: "Not Found" });
    }
    if ((mm = rest.match(/^\/git\/trees\/([^?]+)/)) && method === "GET") {
      let ts = mm[1];
      if (ts === "main" || ts === "HEAD") ts = this.commits.get(this.head).tree;
      const t = this.trees.get(ts);
      if (!t) return this.res(404, { message: "Not Found" });
      return this.res(200, { truncated: false, tree: [...t.entries()].map(([p, e]) => ({ path: p, mode: e.mode, type: "blob", sha: e.sha })) });
    }
    if (rest === "/git/trees" && method === "POST") {
      this.counts.treePost++;
      const m2 = new Map(this.trees.get(body.base_tree));
      const seen = new Set();
      for (const it of body.tree) {
        if (seen.has(it.path)) return this.res(422, { message: "duplicate path in tree: " + it.path });
        seen.add(it.path);
        if (it.sha === null) m2.delete(it.path);
        else if (it.content !== undefined) m2.set(it.path, { sha: this.blob(it.content), mode: it.mode });
        else if (this.blobs.has(it.sha)) m2.set(it.path, { sha: it.sha, mode: it.mode });
        else return this.res(422, { message: "unknown blob " + it.sha });
      }
      return this.res(201, { sha: this.tree(m2) });
    }
    if (rest === "/git/commits" && method === "POST") {
      this.counts.commitPost++;
      const s = this.commit(body.tree, body.parents, body.message);
      this.messages.push(body.message);
      return this.res(201, { sha: s });
    }
    if ((mm = rest.match(/^\/git\/refs\/heads\/(.+)$/)) && method === "PATCH") {
      this.counts.refPatch++;
      if (this.beforePatch) { const f = this.beforePatch; this.beforePatch = null; f(this); }
      if (this.failPatch > 0) { this.failPatch--; this.external([{ path: `notes/_race${this.counts.refPatch}.txt`, content: "x" }], "race"); }
      const c = this.commits.get(body.sha);
      if (!c || c.parents[0] !== this.head) return this.res(422, { message: "Update is not a fast forward" });
      this.head = body.sha;
      this.headLog.push(this.head);
      return this.res(200, {});
    }
    if ((mm = rest.match(/^\/git\/blobs\/(.+)$/)) && method === "GET") {
      const b = this.blobs.get(mm[1]);
      return b === undefined ? this.res(404, {}) : this.res(200, {}, b);
    }
    if ((mm = rest.match(/^\/contents\/(.+)$/)) && method === "GET") {
      const f = this.files().get(decodeURIComponent(mm[1]));
      return f === undefined ? this.res(404, {}) : this.res(200, {}, f);
    }
    return this.res(404, { message: "unhandled " + method + " " + rest });
  }
}

/* ---------------- fake folder (File System Access API subset) ---------------- */
class FakeFile {
  constructor(data) { this.data = data; }
}
class FakeDir {
  constructor(name) { this.name = name; this.kind = "directory"; this.map = new Map(); }
  async getDirectoryHandle(n, o = {}) {
    const e = this.map.get(n);
    if (e && e.kind === "directory") return e;
    if (o.create) { const d = new FakeDir(n); this.map.set(n, d); return d; }
    const err = new Error("nf"); err.name = "NotFoundError"; throw err;
  }
  async getFileHandle(n, o = {}) {
    let e = this.map.get(n);
    if (!e && o.create) { e = new FakeFileHandle(n); this.map.set(n, e); }
    if (!e || e.kind !== "file") { const err = new Error("nf"); err.name = "NotFoundError"; throw err; }
    return e;
  }
  async removeEntry(n) {
    if (!this.map.has(n)) { const err = new Error("nf"); err.name = "NotFoundError"; throw err; }
    this.map.delete(n);
  }
  async *entries() { for (const [k, v] of this.map) yield [k, v]; }
  async *keys() { for (const k of this.map.keys()) yield k; }
}
class FakeFileHandle {
  constructor(name) { this.name = name; this.kind = "file"; this.data = ""; }
  async getFile() {
    const d = this.data;
    return { text: async () => (typeof d === "string" ? d : Buffer.from(d).toString("utf8")), arrayBuffer: async () => { if (typeof d !== "string") return d; const b = Buffer.from(d); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } };
  }
  async createWritable() {
    const h = this;
    return { write: async (x) => { h.data = typeof x === "string" ? x : Buffer.from(x).toString("utf8"); }, close: async () => {} };
  }
}
function makeFolder(files) {
  const root = new FakeDir("project");
  const put = async (p, c) => {
    const segs = p.split("/");
    const name = segs.pop();
    let d = root;
    for (const s of segs) d = await d.getDirectoryHandle(s, { create: true });
    const h = await d.getFileHandle(name, { create: true });
    h.data = c;
  };
  return { root, put, init: async () => { for (const [p, c] of Object.entries(files)) await put(p, c); } };
}
async function folderFiles(root) {
  const out = new Map();
  async function walk(d, prefix) {
    for await (const [n, h] of d.entries()) {
      if (h.kind === "directory") await walk(h, prefix + n + "/");
      else out.set(prefix + n, typeof h.data === "string" ? h.data : Buffer.from(h.data).toString("utf8"));
    }
  }
  await walk(await root.getDirectoryHandle("notes"), "notes/");
  return out;
}

/* ---------------- app loader ---------------- */
const read = (f) => fs.readFileSync(path.join(PROJ, f), "utf8");

async function boot({ mode = "github", gh, folder, hash = "#/", session = {}, local = {} }) {
  const url = mode === "github" ? "https://tester.github.io/site/" : "http://localhost:8000/";
  const dom = new JSDOM(`<!DOCTYPE html><html><body><main id="app"></main><div id="toasts"></div></body></html>`, {
    url: url + hash, runScripts: "outside-only", pretendToBeVisual: true,
  });
  const w = dom.window;
  for (const [k, v] of Object.entries(session)) w.sessionStorage.setItem(k, v);
  w.fetch = gh ? (u, o) => gh.fetch(u, o) : async () => ({ ok: false, status: 404, headers: { get: () => null }, json: async () => ({}), text: async () => "" });
  w.CSS = w.CSS || {};
  w.CSS.escape = w.CSS.escape || ((s) => String(s).replace(/[^\w-]/g, "\\$&"));
  w.Element.prototype.scrollIntoView = function () {};
  w.scrollTo = () => {};
  if (mode === "local") {
    w.showDirectoryPicker = async () => folder.root;
  }
  const evalFile = (f) => w.eval(read(f) + `\n//# sourceURL=${f}`);
  evalFile("config.js");
  evalFile("data.js");
  // render.js needs marked/DOMPurify (not bundled here): a tiny stand-in that shows the raw text
  w.eval(`window.NotesRender = { toElement(text) { const d = document.createElement("div"); d.className = "md"; d.textContent = text; return d; } };`);
  // auth.js is not under test (unchanged): a stand-in with the same public surface
  w.eval(`(() => { let tok = null; window.Auth = {
      loadRecord: async () => ({}), unlock: async () => { tok = "test-token"; return tok; },
      checkWriteAccess: async () => ({ ok: true }), getToken: () => tok, isUnlocked: () => !!tok,
      lock: () => { tok = null; }, setRecordLoader() {} }; })();`);
  evalFile("local.js");
  if (mode === "local") {
    let saved = folder.root;
    saved.queryPermission = async () => "granted";
    saved.requestPermission = async () => "granted";
    w.NotesLocal.useStore({ get: async () => saved, set: async () => {} });
  }
  evalFile("github.js");
  evalFile("stage.js");
  evalFile("app.js");
  const api = makeApi(dom, w);
  await api.settle();
  return api;
}

function makeApi(dom, w) {
  const d = w.document;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const api = {
    dom, w, d,
    sleep,
    async settle(ms = 40) { for (let i = 0; i < 4; i++) await sleep(ms); },
    async waitFor(fn, ms = 4000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch { /* keep waiting */ } await sleep(15); }
      throw new Error("waitFor timed out: " + fn.toString());
    },
    q: (sel) => d.querySelector(sel),
    qa: (sel) => [...d.querySelectorAll(sel)],
    click(el) { (typeof el === "string" ? d.querySelector(el) : el).dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); },
    toasts: () => [...d.querySelectorAll(".toast")].map((t) => t.textContent),
    hash: () => w.location.hash,
    count: () => w.NotesStage.count(),
    note: () => (d.querySelector("#note-body") || {}).textContent || "",
    async login() {
      api.click('.mode-btn[data-mode="w"]');
      await api.waitFor(() => d.querySelector('#modal input[name="username"]'));
      const f = d.querySelector("#modal form");
      f.elements.username.value = "u"; f.elements.password.value = "p";
      f.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
      await api.waitFor(() => d.body.classList.contains("write"));
      await api.settle();
    },
    chapterEl: (folder) => api.qa(".chapter").find((c) => c.dataset.folder === folder),
    folders: () => api.qa(".chapter").map((c) => c.dataset.folder),
    topics: () => api.qa(".topic").map((t) => t.textContent),
    async openMenu(folder) {
      const el = api.chapterEl(folder);
      api.click(el.querySelector(".dots"));
      await api.settle(5);
    },
    menuLabels: () => api.qa(".menu button").map((b) => b.textContent),
    async menuAction(folder, label) {
      await api.openMenu(folder);
      const b = api.qa(".menu button").find((x) => x.textContent === label);
      if (!b) throw new Error(`menu item "${label}" not found; have ${api.menuLabels()}`);
      api.click(b);
      await api.settle(10);
    },
    async subjectMenu(label) {
      api.click('.index-head .dots');
      await api.settle(5);
      api.click(api.qa(".menu button").find((x) => x.textContent === label));
      await api.settle(10);
    },
    async submitDialog(value) {
      const f = d.querySelector("#modal form");
      if (value !== undefined) { f.elements.value.value = value; f.elements.value.dispatchEvent(new w.Event("input", { bubbles: true })); }
      f.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
      await api.waitFor(() => !d.getElementById("modal") || d.querySelector("#modal .form-error").textContent);
      await api.settle(20);
    },
    modalError: () => (d.querySelector("#modal .form-error") || {}).textContent || "",
    beforeUnloadPrevented() {
      const ev = new w.Event("beforeunload", { cancelable: true });
      w.dispatchEvent(ev);
      return ev.defaultPrevented;
    },
    savebar: () => d.getElementById("savebar"),
    sbText: () => (d.getElementById("savebar") ? d.getElementById("savebar").textContent.replace(/\s+/g, " ").trim() : null),
    async go(hash) { w.location.hash = hash; await api.settle(30); },
  };
  return api;
}

module.exports = { FakeGH, makeFolder, folderFiles, boot, sha1 };
