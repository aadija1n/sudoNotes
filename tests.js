const { FakeGH, makeFolder, folderFiles, boot } = require("./harness");

let passed = 0, failed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++; else { failed++; failures.push(msg); console.log("  FAIL:", msg); }
}
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}\n      got:      ${JSON.stringify(a)}\n      expected: ${JSON.stringify(b)}`);
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const BASE = {
  "notes/Math/Chapter 00 - Intro/0.1 A.md": "A body",
  "notes/Math/Chapter 00 - Intro/0.2 B.md": "B body",
  "notes/Math/Chapter 01 - Basics/1.1 X.md": "X body",
  "notes/Math/Chapter 01 - Basics/1.2 Y.md": "Y body",
  "notes/Math/Chapter 01 - Basics/fig.png": "PNG",
  "notes/Math/Chapter 02 - Middle/2.1 M.md": "M body",
  "notes/Math/Chapter 03 - Last/3.1 L.md": "L body",
  "notes/Math/Chapter 03 - Last/3.2 L2.md": "L2 body",
  "notes/Physics/Chapter 00 - Mech/0.1 F.md": "F body",
};
const sorted = (m) => [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
const mapOf = (m) => JSON.stringify(sorted(m));
const chainMessages = (gh) => { const out = []; let c = gh.head; while (c) { out.push(gh.commits.get(c).message); c = gh.commits.get(c).parents[0]; } return out; };
const ourCommits = (gh) => chainMessages(gh).filter((m) => m.startsWith("Update notes"));

/* the scenario used in several tests */
async function scenario(app) {
  await app.subjectMenu("Insert new chapter"); await app.submitDialog("Extra");
  await app.menuAction("Chapter 01 - Basics", "Rename chapter"); await app.submitDialog("Core");
  await app.menuAction("Chapter 01 - Core", "Move up");
  await app.menuAction("Chapter 02 - Middle", "Delete chapter"); await app.submitDialog();
}
const EXPECTED_MATH = {
  "notes/Math/Chapter 00 - Core/0.1 X.md": "X body",
  "notes/Math/Chapter 00 - Core/0.2 Y.md": "Y body",
  "notes/Math/Chapter 00 - Core/fig.png": "PNG",
  "notes/Math/Chapter 01 - Intro/1.1 A.md": "A body",
  "notes/Math/Chapter 01 - Intro/1.2 B.md": "B body",
  "notes/Math/Chapter 02 - Last/2.1 L.md": "L body",
  "notes/Math/Chapter 02 - Last/2.2 L2.md": "L2 body",
  "notes/Math/Chapter 03 - Extra/.gitkeep": "",
  "notes/Physics/Chapter 00 - Mech/0.1 F.md": "F body",
};

test("read mode shows nothing; write mode needs login", async () => {
  const gh = new FakeGH(BASE);
  const app = await boot({ gh, hash: "#/subject/Math" });
  ok(!app.d.body.classList.contains("write"), "read mode: body.write absent");
  ok(!app.pending(), "read mode: no save bar");
  eq(app.folders().length, 4, "4 chapters shown");
  ok(!app.beforeUnloadPrevented(), "read mode: beforeunload not registered");
  ok(app.qa(".dots").every((b) => b.classList.contains("w-only")), "all menus are w-only (hidden in read mode by CSS)");
  ok(gh.counts.treePost === 0, "no writes in read mode");
});

test("many edits then ONE save = exactly one commit; local mode gives the same tree", async () => {
  const gh = new FakeGH(BASE);
  const app = await boot({ gh, hash: "#/subject/Math" });
  await app.login();
  ok(!app.beforeUnloadPrevented(), "no pending: beforeunload not registered");
  await scenario(app);
  eq(app.count(), 4, "4 pending operations");
  eq(gh.counts.commitPost, 0, "no commit before Save");
  eq(gh.counts.treePost, 0, "no tree before Save");
  ok(/4 unsaved changes/.test(app.sbText()), "save bar says 4 unsaved changes: " + app.sbText());
  ok(app.beforeUnloadPrevented(), "beforeunload registered while pending");
  eq(app.folders(), ["Chapter 00 - Core", "Chapter 01 - Intro", "Chapter 02 - Last", "Chapter 03 - Extra"], "index shows the virtual tree instantly");
  app.click("#sb-save");
  await app.waitFor(() => !app.pending());
  await app.settle();
  eq(gh.counts.commitPost, 1, "exactly one commit");
  eq(gh.counts.treePost, 1, "exactly one tree");
  eq(gh.counts.refPatch, 1, "exactly one ref update");
  eq(ourCommits(gh).length, 1, "one 'Update notes' commit on the branch");
  ok(gh.messages[0].startsWith("Update notes: 4 changes"), "commit message title: " + gh.messages[0].split("\n")[0]);
  ok(/Add chapter: Extra/.test(gh.messages[0]) && /Delete chapter/.test(gh.messages[0]) && /Move chapter up/.test(gh.messages[0]), "labels listed in the body");
  const final = gh.files();
  eq([...final.keys()].sort(), Object.keys(EXPECTED_MATH).sort(), "final tree paths");
  for (const [p, c] of Object.entries(EXPECTED_MATH)) eq(final.get(p), c, "content kept: " + p);
  ok(!app.pending(), "save bar gone after save");
  ok(!app.beforeUnloadPrevented(), "beforeunload removed after save");
  ok(app.toasts().includes("Saved"), "toast Saved: " + app.toasts());
  ok(Object.keys(EXPECTED_MATH).every((p) => final.has(p)), "ok");

  // the same operations in local mode (immediate) end in the same tree
  const folder = makeFolder(BASE); await folder.init();
  const lapp = await boot({ mode: "local", folder, hash: "#/subject/Math" });
  await lapp.login();
  await lapp.subjectMenu("Insert new chapter"); await lapp.submitDialog("Extra");
  const afterFirst = await folderFiles(folder.root);
  ok(afterFirst.has("notes/Math/Chapter 04 - Extra/.gitkeep"), "local: first change written immediately");
  ok(!lapp.pending(), "local: no save bar");
  await lapp.menuAction("Chapter 01 - Basics", "Rename chapter"); await lapp.submitDialog("Core");
  await lapp.menuAction("Chapter 01 - Core", "Move up");
  await lapp.menuAction("Chapter 02 - Middle", "Delete chapter"); await lapp.submitDialog();
  eq(lapp.count(), 0, "local: nothing staged");
  ok(!lapp.pending(), "local: still no save bar");
  eq(mapOf(await folderFiles(folder.root)), mapOf(new Map(Object.entries(EXPECTED_MATH))), "local mode final tree == github mode final tree");
});

test("Undo last and Discard", async () => {
  const gh = new FakeGH(BASE);
  const app = await boot({ gh, hash: "#/subject/Math" });
  await app.login();
  await scenario(app);
  app.click("#sb-undo"); await app.settle(30);
  eq(app.count(), 3, "undo pops one");
  eq(app.folders(), ["Chapter 00 - Core", "Chapter 01 - Intro", "Chapter 02 - Middle", "Chapter 03 - Last", "Chapter 04 - Extra"], "view after undoing the delete");
  app.click("#sb-undo"); await app.settle(30);
  app.click("#sb-undo"); await app.settle(30);
  eq(app.folders(), ["Chapter 00 - Intro", "Chapter 01 - Basics", "Chapter 02 - Middle", "Chapter 03 - Last", "Chapter 04 - Extra"], "after undoing move and rename");
  app.click("#sb-discard"); await app.settle(20);
  ok(app.q("#modal"), "discard asks for confirmation");
  eq(app.count(), 1, "nothing discarded yet");
  app.click("#modal [data-modal-close]"); await app.settle(10);
  eq(app.count(), 1, "cancel keeps the change");
  app.click("#sb-discard"); await app.settle(20);
  await app.submitDialog();
  await app.waitFor(() => !app.pending());
  eq(app.count(), 0, "discard clears everything");
  eq(app.folders(), ["Chapter 00 - Intro", "Chapter 01 - Basics", "Chapter 02 - Middle", "Chapter 03 - Last"], "view back to saved state");
  ok(!app.beforeUnloadPrevented(), "beforeunload removed after discard");
  eq(gh.counts.commitPost, 0, "nothing was ever committed");
});

test("save with unchanged head takes the fast path (no replay, no merge message)", async () => {
  const gh = new FakeGH(BASE);
  const app = await boot({ gh, hash: "#/subject/Math" });
  await app.login();
  await app.subjectMenu("Insert new chapter"); await app.submitDialog("Extra");
  app.click("#sb-save");
  await app.waitFor(() => !app.pending()); await app.settle();
  ok(app.toasts().includes("Saved"), "plain 'Saved' toast");
  ok(!app.toasts().some((t) => /merged/.test(t)), "no merge message");
  ok(gh.files().has("notes/Math/Chapter 04 - Extra/.gitkeep"), "chapter committed");
});

test("save after the head changed: replay applies, commit lands on top, merged message", async () => {
  const gh = new FakeGH(BASE);
  const app = await boot({ gh, hash: "#/subject/Math" });
  await app.login();
  await app.subjectMenu("Insert new chapter"); await app.submitDialog("Extra");
  const ext = gh.external([{ path: "notes/Physics/Chapter 01 - Waves/1.1 W.md", content: "W body" }]);
  app.click("#sb-save");
  await app.waitFor(() => !app.pending()); await app.settle();
  ok(app.toasts().some((t) => /merged with newer changes/.test(t)), "merged toast: " + app.toasts());
  const final = gh.files();
  ok(final.has("notes/Physics/Chapter 01 - Waves/1.1 W.md"), "external change kept");
  ok(final.has("notes/Math/Chapter 04 - Extra/.gitkeep"), "our change added");
  eq(gh.commits.get(gh.head).parents[0], ext, "our commit sits directly on top of the external one");
  eq(ourCommits(gh).length, 1, "one commit of ours");
  ok(app.folders().includes("Chapter 04 - Extra"), "screen shows the merged result");
});

test("replay with a failing operation commits nothing and says why", async () => {
  const gh = new FakeGH(BASE);
  const app = await boot({ gh, hash: "#/subject/Math" });
  await app.login();
  await app.subjectMenu("Insert new chapter"); await app.submitDialog("Extra");
  await app.menuAction("Chapter 01 - Basics", "Rename chapter"); await app.submitDialog("Core");
  gh.external(Object.keys(BASE).filter((p) => p.includes("Chapter 01 - Basics")).map((p) => ({ path: p, remove: true })));
  app.click("#sb-save");
  await app.waitFor(() => app.q("#modal .fail-list"));
  const txt = app.q("#modal").textContent;
  ok(/Rename chapter: Chapter 01 - Basics/.test(txt), "names the failed operation: " + txt);
  ok(/no longer exists/.test(txt), "plain-language reason");
  ok(!/Add chapter: Extra/.test(txt), "the operation that still applies is not listed as failed");
  eq(ourCommits(gh).length, 0, "nothing committed");
  eq(gh.counts.commitPost, 0, "no commit object created either");
  eq(app.count(), 2, "pending list kept");
  app.click("#modal [data-modal-close]"); await app.settle(10);
  ok(app.pending(), "save bar still there after Cancel");
  app.click("#sb-save");
  await app.waitFor(() => app.q("#rf-discard"));
  app.click("#rf-discard"); await app.settle(60);
  eq(app.count(), 0, "Discard all and reload clears the list");
  ok(!app.folders().includes("Chapter 01 - Basics"), "screen reloaded with the newer repository");
  eq(gh.counts.commitPost, 0, "still nothing committed");
});

test("branch moves between replay and ref update: retried automatically; gives up after 3", async () => {
  const gh = new FakeGH(BASE);
  const app = await boot({ gh, hash: "#/subject/Math" });
  await app.login();
  await app.subjectMenu("Insert new chapter"); await app.submitDialog("Extra");
  gh.failPatch = 1;
  app.click("#sb-save");
  await app.waitFor(() => !app.pending()); await app.settle();
  eq(gh.counts.refPatch, 2, "ref update tried twice");
  eq(ourCommits(gh).length, 1, "one commit of ours on the branch");
  ok(gh.files().has("notes/_race1.txt") && gh.files().has("notes/Math/Chapter 04 - Extra/.gitkeep"), "race change kept and ours added");
  ok(app.toasts().some((t) => /merged/.test(t)), "merged message");

  const gh2 = new FakeGH(BASE);
  const app2 = await boot({ gh: gh2, hash: "#/subject/Math" });
  await app2.login();
  await app2.subjectMenu("Insert new chapter"); await app2.submitDialog("Extra");
  gh2.failPatch = 3;
  app2.click("#sb-save");
  await app2.waitFor(() => /busy/.test(app2.q(".dock .dock-msg").textContent));
  eq(gh2.counts.refPatch, 3, "gave up after 3 attempts");
  eq(ourCommits(gh2).length, 0, "no commit of ours");
  eq(app2.count(), 1, "change still pending (never lost)");
  ok(/Save/.test(app2.sbText()), "dock still offers Save");
  app2.click("#sb-save"); // head is stable now: works
  await app2.waitFor(() => !app2.pending());
  eq(ourCommits(gh2).length, 1, "second try succeeds");
});

test("move up/down swaps numbers and topic files (equal names, gaps, edges)", async () => {
  const eqFiles = {
    "notes/Eq/Chapter 00 - Same/0.1 a.md": "a",
    "notes/Eq/Chapter 01 - Same/1.1 b.md": "b",
    "notes/Eq/Chapter 01 - Same/1.2 c.md": "c",
    "notes/Eq/Chapter 01 - Same/pic.png": "P",
    "notes/Eq/Chapter 05 - Gap/5.1 g.md": "g",
  };
  const gh = new FakeGH(eqFiles);
  const app = await boot({ gh, hash: "#/subject/Eq" });
  await app.login();
  await app.openMenu("Chapter 00 - Same");
  ok(!app.menuLabels().includes("Move up") && app.menuLabels().includes("Move down"), "first chapter: no Move up: " + app.menuLabels());
  await app.openMenu("Chapter 05 - Gap");
  ok(app.menuLabels().includes("Move up") && !app.menuLabels().includes("Move down"), "last chapter: no Move down");
  app.click("body"); await app.settle(5);
  await app.menuAction("Chapter 01 - Same", "Move up");
  const virtualTopics = app.topics();
  ok(virtualTopics.includes("0.1 b") && virtualTopics.includes("0.2 c") && virtualTopics.includes("1.1 a"), "virtual topics swapped: " + virtualTopics);
  await app.menuAction("Chapter 05 - Gap", "Move up"); // swaps with the adjacent chapter (01), not number 04
  eq(app.count(), 2, "two operations pending");
  app.click("#sb-save"); await app.waitFor(() => !app.pending()); await app.settle();
  eq(ourCommits(gh).length, 1, "single commit");
  eq([...gh.files().entries()].sort(), [
    ["notes/Eq/Chapter 00 - Same/0.1 b.md", "b"],
    ["notes/Eq/Chapter 00 - Same/0.2 c.md", "c"],
    ["notes/Eq/Chapter 00 - Same/pic.png", "P"],
    ["notes/Eq/Chapter 01 - Gap/1.1 g.md", "g"],
    ["notes/Eq/Chapter 05 - Same/5.1 a.md", "a"],
  ], "final tree: numbers swapped, names stay, topic files renamed, other files moved unchanged");
  // refusals at the edges come from the plan too
  let err = null;
  try { await app.w.NotesWrite.run("moveChapter", { subject: "Eq", folder: "Chapter 00 - Same", dir: "up" }); } catch (e) { err = e; }
  ok(err && /first chapter/.test(err.message), "plan refuses Move up on the first chapter");
});

test("delete a middle chapter renumbers later chapters and their topic files, one commit; route follows", async () => {
  const gh = new FakeGH(BASE);
  const app = await boot({ gh, hash: "#/subject/Math/3.1" });
  await app.waitFor(() => app.note() === "L body");
  await app.login();
  await app.menuAction("Chapter 02 - Middle", "Delete chapter");
  ok(/renumbered/.test(app.q("#modal").textContent), "dialog says later chapters will be renumbered: " + app.q("#modal .modal-sub").textContent);
  await app.submitDialog();
  eq(app.hash(), "#/subject/Math/2.1", "address followed 3.1 -> 2.1");
  await app.waitFor(() => app.note() === "L body");
  ok(app.q(".topic.active") && app.q(".topic.active").textContent === "2.1 L", "active topic highlighted");
  eq(app.d.defaultView.localStorage.getItem("notes:lastTopic:Math"), "2.1", "last-opened record followed");
  eq(gh.counts.commitPost, 0, "still nothing committed");
  app.click("#sb-save"); await app.waitFor(() => !app.pending()); await app.settle();
  eq(ourCommits(gh).length, 1, "single commit");
  eq([...gh.files().keys()].filter((p) => p.startsWith("notes/Math/")).sort(), [
    "notes/Math/Chapter 00 - Intro/0.1 A.md", "notes/Math/Chapter 00 - Intro/0.2 B.md",
    "notes/Math/Chapter 01 - Basics/1.1 X.md", "notes/Math/Chapter 01 - Basics/1.2 Y.md", "notes/Math/Chapter 01 - Basics/fig.png",
    "notes/Math/Chapter 02 - Last/2.1 L.md", "notes/Math/Chapter 02 - Last/2.2 L2.md"], "00, 01, 03 became 00, 01, 02 with topic files renamed");
  // deleting the chapter that is open goes to the welcome state
  const gh2 = new FakeGH(BASE);
  const app2 = await boot({ gh: gh2, hash: "#/subject/Math/2.1" });
  await app2.waitFor(() => app2.note() === "M body");
  await app2.login();
  await app2.menuAction("Chapter 02 - Middle", "Delete chapter"); await app2.submitDialog();
  eq(app2.hash(), "#/subject/Math", "deleted chapter's topic -> welcome state");
  ok(app2.q(".empty-state"), "welcome state shown");
});

test("open topic route follows a move; topic text of a moved topic loads before Save", async () => {
  const gh = new FakeGH(BASE);
  const app = await boot({ gh, hash: "#/subject/Math/1.1" });
  await app.waitFor(() => app.note() === "X body");
  await app.login();
  await app.menuAction("Chapter 01 - Basics", "Move up");
  eq(app.hash(), "#/subject/Math/0.1", "route followed 1.1 -> 0.1");
  await app.waitFor(() => app.note() === "X body");
  ok(app.note() === "X body", "text of the moved topic loaded from its original blob before Save");
  eq(app.d.defaultView.localStorage.getItem("notes:lastTopic:Math"), "0.1", "last-opened followed");
  await app.go("#/subject/Math/1.2");
  await app.waitFor(() => app.note() === "B body");
  ok(true, "the swapped neighbour's topic (now 1.2) reads its own text");
  // staged-new text must travel with later moves
  await app.w.eval(`NotesWrite._internal.OPS.writeNote = { label: () => "Write note", plan: (e, a) => [{ path: a.path, mode: "100644", type: "blob", content: a.text }] }`);
  await app.w.NotesWrite.run("writeNote", { path: "notes/Math/Chapter 02 - Middle/2.2 New.md", text: "NEW TEXT" });
  await app.w.NotesWrite.run("moveChapter", { subject: "Math", folder: "Chapter 02 - Middle", dir: "down" });
  const moved = await app.w.NotesData.loadNote("notes/Math/Chapter 03 - Middle/3.2 New.md");
  eq(moved, "NEW TEXT", "staged text readable at its new virtual path before Save");
  const res = await app.w.NotesStage.save();
  ok(res.commitSha, "saved");
  eq(gh.files().get("notes/Math/Chapter 03 - Middle/3.2 New.md"), "NEW TEXT", "staged text committed at the final path with its content");
  eq(gh.files().get("notes/Math/Chapter 00 - Basics/0.1 X.md"), "X body", "moved blob keeps its content");
  eq(ourCommits(gh).length, 1, "one commit");
});

test("duplicate chapter number: warning in write mode, refusals, read mode unaffected", async () => {
  const gh = new FakeGH({
    "notes/Dup/Chapter 1 - A/1.1 a.md": "a",
    "notes/Dup/Chapter 01 - B/1.1 b.md": "b",
    "notes/Dup/Chapter 02 - C/2.1 c.md": "c",
  });
  const app = await boot({ gh, hash: "#/subject/Dup" });
  const w0 = app.q(".dup-warning");
  ok(w0 && w0.classList.contains("w-only") && !app.d.body.classList.contains("write"), "read mode: warning exists only as a write-only element (CSS hides it)");
  await app.login();
  const warn = app.q(".dup-warning").textContent;
  ok(/Chapter 1 - A/.test(warn) && /Chapter 01 - B/.test(warn), "warning names both folders: " + warn);
  const first = app.folders()[0];
  await app.menuAction(first, "Move down");
  ok(app.toasts().some((t) => /share the same number/.test(t)), "move refused with a message");
  await app.menuAction(first, "Delete chapter");
  ok(!app.q("#modal"), "delete refused (no dialog)");
  await app.menuAction(first, "Change chapter number");
  ok(!app.q("#modal"), "change number refused (no dialog)");
  eq(app.count(), 0, "nothing staged");
  let err = null;
  try { await app.w.NotesWrite.run("deleteChapter", { subject: "Dup", folder: first }); } catch (e) { err = e; }
  ok(err && err.code === "duplicate", "the plans refuse as well (stale screens)");
  eq(app.count(), 0, "still nothing staged");
  await app.menuAction(first, "Rename chapter");
  ok(app.q("#modal"), "renaming stays possible");
});

test("in-app exit dialog: back to R (Cancel / Discard / Save) and Change notes repository", async () => {
  const gh = new FakeGH(BASE);
  const app = await boot({ gh, hash: "#/subject/Math" });
  await app.login();
  await app.subjectMenu("Insert new chapter"); await app.submitDialog("Extra");
  app.click('.mode-btn[data-mode="r"]'); await app.settle(10);
  ok(/unsaved changes/.test(app.q("#modal").textContent), "dialog shown on R");
  app.click('[data-lv="cancel"]'); await app.settle(10);
  ok(app.d.body.classList.contains("write") && app.count() === 1, "Cancel keeps write mode and the change");
  app.click('.mode-btn[data-mode="r"]'); await app.settle(10);
  app.click('[data-lv="discard"]'); await app.waitFor(() => !app.d.body.classList.contains("write"));
  eq(app.count(), 0, "Discard clears the list");
  ok(!app.pending() && !app.beforeUnloadPrevented(), "bar and beforeunload gone");
  eq(gh.counts.commitPost, 0, "nothing committed by Discard");
  // Save choice
  await app.login();
  await app.subjectMenu("Insert new chapter"); await app.submitDialog("Extra2");
  app.click('.mode-btn[data-mode="r"]'); await app.settle(10);
  app.click('[data-lv="save"]'); await app.waitFor(() => !app.d.body.classList.contains("write")); await app.settle();
  eq(ourCommits(gh).length, 1, "Save choice commits once, then leaves write mode");
  ok(gh.files().has("notes/Math/Chapter 04 - Extra2/.gitkeep"), "committed");
  // Change notes repository (home page)
  await app.go("#/"); await app.login();
  await app.w.NotesWrite.run("addSubject", { name: "Chem" });
  await app.settle(10);
  ok(app.pending(), "save bar also on the home page");
  app.click("#set-repo"); await app.settle(10);
  ok(/unsaved changes/.test((app.q("#modal") || {}).textContent || ""), "dialog shown before changing the notes repository");
  ok(!app.q('#modal input[name="repo"]'), "repository form not opened yet");
  app.click('[data-lv="cancel"]'); await app.settle(10);
  eq(app.count(), 1, "cancel keeps pending");
});

test("lock keeps descriptors in sessionStorage; restore after login (and after a refresh)", async () => {
  const gh = new FakeGH(BASE);
  const app = await boot({ gh, hash: "#/subject/Math" });
  await app.login();
  await app.subjectMenu("Insert new chapter"); await app.submitDialog("Extra");
  await app.menuAction("Chapter 02 - Middle", "Delete chapter"); await app.submitDialog();
  const raw = app.w.sessionStorage.getItem("notes:pending");
  ok(raw && !/token/i.test(raw), "descriptors stored, no token in them");
  app.w.setMode("r"); await app.settle(30); // what the 30-minute idle lock does
  eq(app.count(), 0, "memory cleared on lock");
  ok(!app.pending(), "no save bar in read mode");
  ok(app.w.sessionStorage.getItem("notes:pending"), "descriptors kept for restore");
  await app.login();
  await app.waitFor(() => /Restore unsaved changes/.test((app.q("#modal") || {}).textContent || ""));
  app.click('[data-rs="restore"]');
  await app.waitFor(() => app.count() === 2);
  await app.settle(30);
  eq(app.folders(), ["Chapter 00 - Intro", "Chapter 01 - Basics", "Chapter 02 - Last", "Chapter 03 - Extra"], "restored view");
  // a brand new page (refresh) with the same sessionStorage
  const app2 = await boot({ gh, hash: "#/subject/Math", session: { "notes:pending": app.w.sessionStorage.getItem("notes:pending") } });
  await app2.login();
  await app2.waitFor(() => /Restore unsaved changes/.test((app2.q("#modal") || {}).textContent || ""));
  app2.click('[data-rs="restore"]'); await app2.waitFor(() => app2.count() === 2);
  app2.click("#sb-save"); await app2.waitFor(() => !app2.pending()); await app2.settle();
  eq(ourCommits(gh).length, 1, "restored list saved as one commit");
});

test("Phase 6 behaviour through staging", async () => {
  const gh = new FakeGH({
    "notes/Empty/.gitkeep": "",
    "notes/Num/Chapter 00 - A/0.1 a.md": "a",
    "notes/Num/Chapter 01 - B/1.1 b.md": "b",
    "notes/Num/Chapter 01 - B/1.2 b2.md": "b2",
    "notes/Num/Chapter 02 - C/2.1 c.md": "c",
    "notes/Solo/Chapter 00 - Only/0.1 o.md": "o",
  });
  const app = await boot({ gh, hash: "#/" });
  await app.login();
  const run = (t, a) => app.w.NotesWrite.run(t, a);
  const err = async (t, a) => { try { await run(t, a); return null; } catch (e) { return e; } };
  let r = await run("addChapter", { subject: "Empty", name: "One" });
  eq([r.num, r.folder], [0, "Chapter 00 - One"], "first chapter is 00");
  r = await run("addChapter", { subject: "Empty", name: "Two" });
  eq(r.num, 1, "then highest + 1");
  r = await run("addChapter", { subject: "Num", name: "D" });
  eq(r.num, 3, "highest + 1 in a subject with chapters");
  let e = await err("addChapter", { subject: "Num", name: "bad/name" });
  ok(e && e.code === "invalid", "invalid name rejected");
  e = await err("changeChapterNumber", { subject: "Num", folder: "Chapter 01 - B", newNum: 2 });
  ok(e && /already exists/.test(e.message), "used number rejected");
  e = await err("renameChapter", { subject: "Nope", folder: "x", name: "y" });
  ok(e && e.code === "missing", "stale subject fails safely");
  const before = app.count();
  r = await run("changeChapterNumber", { subject: "Num", folder: "Chapter 01 - B", newNum: 7 });
  eq([r.oldNum, r.num, r.folder], [1, 7, "Chapter 07 - B"], "change number result");
  r = await run("renameChapter", { subject: "Num", folder: "Chapter 02 - C", name: "Cee" });
  eq([r.num, r.folder], [2, "Chapter 02 - Cee"], "rename keeps number");
  // delete the highest chapter, then add reuses its number
  await run("deleteChapter", { subject: "Num", folder: "Chapter 07 - B" });
  r = await run("addChapter", { subject: "Num", name: "Again" });
  eq(r.num, 4, "after deleting highest (07), next add is highest + 1 = 04 (03 exists)");
  // deleting the only chapter keeps the subject alive
  await run("deleteChapter", { subject: "Solo", folder: "Chapter 00 - Only" });
  ok(app.count() > before, "operations staged");
  eq(app.w.NotesStage.count(), app.count(), "count consistent");
  const res = await app.w.NotesStage.save();
  ok(res.commitSha, "saved");
  eq(ourCommits(gh).length, 1, "all of it in one commit");
  const f = gh.files();
  ok(f.has("notes/Solo/.gitkeep") && ![...f.keys()].some((p) => p.includes("Only")), "subject kept alive with .gitkeep");
  ok(f.has("notes/Empty/Chapter 00 - One/.gitkeep") && f.has("notes/Empty/Chapter 01 - Two/.gitkeep"), "chapters added");
  eq([...f.keys()].filter((p) => p.startsWith("notes/Num/")).sort(), [
    "notes/Num/Chapter 00 - A/0.1 a.md",
    "notes/Num/Chapter 02 - Cee/2.1 c.md",
    "notes/Num/Chapter 03 - D/.gitkeep",
    "notes/Num/Chapter 04 - Again/.gitkeep"], "Num subject: B (07) deleted, nothing above it to shift");
});

test("number change: 1 vs 01 do not clash, case-only clash refused; undo to empty drops the base", async () => {
  const gh = new FakeGH({
    "notes/S/Chapter 01 - A/1.1 x.md": "1",
    "notes/S/Chapter 01 - A/1.01 x.md": "2",
  });
  const app = await boot({ gh, hash: "#/subject/S" });
  await app.login();
  let err = null;
  try { await app.w.NotesWrite.run("changeChapterNumber", { subject: "S", folder: "Chapter 01 - A", newNum: 5 }); } catch (e) { err = e; }
  eq(err, null, "different names (1 vs 01) do not clash");
  eq(app.count(), 1, "staged");
  app.click("#sb-undo"); await app.settle(20);
  eq(app.count(), 0, "undo back to empty: base dropped");
  eq(gh.counts.commitPost, 0, "no commits");
});

test("case-only topic clash on number change is refused and stages nothing", async () => {
  const gh = new FakeGH({ "notes/S/Chapter 01 - A/1.1 x.md": "1", "notes/S/Chapter 01 - A/1.1 X.md": "2" });
  const app = await boot({ gh, hash: "#/subject/S" });
  await app.login();
  let err = null;
  try { await app.w.NotesWrite.run("changeChapterNumber", { subject: "S", folder: "Chapter 01 - A", newNum: 5 }); } catch (e) { err = e; }
  ok(err && /same file name/.test(err.message), "clash refused: " + (err && err.message));
  eq(app.count(), 0, "nothing staged");
  ok(!app.pending(), "no save bar");
});


/* ================= Phase 8A: sidebar mode dock ================= */
const oldBarGone = (app) => !app.q("#savebar") && !app.q(".savebar") && !app.d.body.classList.contains("has-savebar");
const chipText = (app) => ((app.q(".dock-chip") || {}).textContent || "").trim();
const rowsInert = (app) => app.q(".dock-pending").hasAttribute("inert");

test("8A dock: idle shows only R/W (subject page, read and write mode), old bar is gone", async () => {
  const gh = new FakeGH(BASE);
  const app = await boot({ gh, hash: "#/subject/Math" });
  ok(app.q("#index .dock"), "dock lives at the bottom of the index bar");
  eq(app.qa(".dock .mode-btn").map((b) => b.dataset.mode), ["r", "w"], "R and W in the dock");
  ok(!app.pending(), "read mode: no pending rows");
  ok(rowsInert(app) && app.q(".dock-chip").hidden, "read mode: rows inert, chip hidden");
  ok(oldBarGone(app), "read mode: #savebar, .savebar and body.has-savebar are gone");
  ok(app.q("#index .dock").compareDocumentPosition(app.q(".chapters")) & app.w.Node.DOCUMENT_POSITION_PRECEDING, "dock comes after the chapter list");
  await app.login();
  ok(!app.pending() && rowsInert(app), "write mode idle: still only R/W");
  ok(app.qa(".mode-btn").every((b) => !b.classList.contains("w-only")), "R/W are never hidden by the write-only rule");
  ok(oldBarGone(app), "write mode idle: old bar still absent");
  ok(app.q("#mb-pending").hidden, "mobile indicator hidden while nothing is pending");
});

test("8A dock: pending rows, count, Undo last, Discard (confirm), Save through the dock", async () => {
  const gh = new FakeGH(BASE);
  const app = await boot({ gh, hash: "#/subject/Math" });
  await app.login();
  await app.subjectMenu("Insert new chapter"); await app.submitDialog("Extra");
  ok(app.pending(), "rows open after the first change");
  eq(chipText(app), "1 unsaved change", "chip: singular");
  ok(!rowsInert(app), "rows are interactive");
  await app.menuAction("Chapter 01 - Basics", "Rename chapter"); await app.submitDialog("Core");
  eq(chipText(app), "2 unsaved changes", "chip: plural");
  ok(/Save/.test(app.sbText()) && /Undo last/.test(app.sbText()) && /Discard/.test(app.sbText()), "Save, Undo last and Discard are in the dock");
  eq(app.q(".dock-chip").parentElement.getAttribute("aria-live"), "polite", "count region is aria-live polite");
  ok(oldBarGone(app), "no old bar while pending");
  ok(app.beforeUnloadPrevented(), "beforeunload registered while pending");
  eq(app.q("#mb-pending").hidden, false, "mobile top-bar indicator shown while pending");
  ok(/2 unsaved/.test(app.q("#mb-pending").textContent), "indicator shows the count");
  app.click("#sb-undo"); await app.settle(30);
  eq(chipText(app), "1 unsaved change", "Undo last lowers the count");
  app.click("#sb-discard"); await app.settle(20);
  ok(app.q("#modal"), "Discard asks for confirmation");
  app.click("#modal [data-modal-close]"); await app.settle(10);
  eq(app.count(), 1, "Cancel keeps the change");
  app.click("#sb-discard"); await app.settle(20);
  await app.submitDialog();
  await app.waitFor(() => !app.pending());
  ok(rowsInert(app) && app.q("#mb-pending").hidden, "Discard: dock back to R/W only, indicator hidden");
  ok(!app.beforeUnloadPrevented(), "beforeunload removed");
  await app.subjectMenu("Insert new chapter"); await app.submitDialog("Kept");
  app.click("#sb-save");
  await app.waitFor(() => !app.pending()); await app.settle();
  eq(ourCommits(gh).length, 1, "Save through the dock makes exactly one commit");
  ok(gh.files().has("notes/Math/Chapter 04 - Kept/.gitkeep"), "committed");
  ok(rowsInert(app), "rows closed after Save");
});

test("8A dock: Saving state disables the buttons, a failed Save shows the error line", async () => {
  const gh = new FakeGH(BASE);
  const app = await boot({ gh, hash: "#/subject/Math" });
  await app.login();
  await app.subjectMenu("Insert new chapter"); await app.submitDialog("Slow");
  let release;
  gh.beforePatch = null;
  const gate = new Promise((r) => { release = r; });
  const realFetch = app.w.fetch;
  app.w.fetch = async (u, o) => { if (o && o.method === "PATCH") await gate; return realFetch(u, o); };
  app.click("#sb-save");
  await app.waitFor(() => app.w.NotesStage.isSaving());
  await app.settle(20);
  const btns = ["#sb-save", "#sb-undo", "#sb-discard"].map((s) => app.q(s));
  ok(btns.every((b) => b.disabled), "all three buttons disabled while saving");
  eq(app.q("#sb-save").textContent, "Saving…", "Save button says Saving…");
  eq(chipText(app), "Saving…", "chip says Saving…");
  ok(app.q(".dock").classList.contains("saving"), "dock has the saving class");
  release();
  await app.waitFor(() => !app.pending()); await app.settle();
  app.w.fetch = realFetch;

  const gh2 = new FakeGH(BASE);
  const app2 = await boot({ gh: gh2, hash: "#/subject/Math" });
  await app2.login();
  await app2.subjectMenu("Insert new chapter"); await app2.submitDialog("Extra");
  gh2.failPatch = 3;
  app2.click("#sb-save");
  await app2.waitFor(() => /busy/.test(app2.q(".dock .dock-msg").textContent));
  ok(app2.q(".dock .dock-msg").getAttribute("role") === "alert", "error line is an alert");
  eq(app2.count(), 1, "change kept");
  ok(!app2.q("#sb-save").disabled && app2.q("#sb-save").textContent === "Save", "Save usable again after the error");
  app2.click("#sb-save"); await app2.waitFor(() => !app2.pending()); await app2.settle();
  eq(app2.q(".dock .dock-msg").textContent, "", "error cleared after a good Save");
});

test("8A dock: home page shows the same dock and pending rows", async () => {
  const gh = new FakeGH(BASE);
  const app = await boot({ gh, hash: "#/" });
  ok(app.q(".dock.home-dock"), "home dock present");
  ok(!app.q(".mode-switch.home-mode"), "old home-mode class unused");
  ok(!app.pending() && rowsInert(app), "home idle: R/W only");
  await app.login();
  app.click("#add-subject"); await app.waitFor(() => app.q("#modal input[name=value]"));
  await app.submitDialog("History");
  await app.settle(30);
  await app.go("#/"); await app.settle(30);
  ok(app.q(".dock.home-dock.has-pending"), "adding a subject opens the pending rows on the home page");
  eq(chipText(app), "1 unsaved change", "home chip count");
  ok(!rowsInert(app), "home rows interactive");
  ok(oldBarGone(app), "no old bar on home");
  app.click("#sb-undo"); await app.settle(40);
  ok(!app.pending(), "home: Undo last closes the rows");
  await app.w.NotesWrite.run("addSubject", { name: "Chem" }); await app.settle(20);
  app.click("#sb-discard"); await app.settle(20);
  await app.submitDialog(); await app.waitFor(() => !app.pending());
  eq(app.count(), 0, "home: Discard through the dock");
  await app.w.NotesWrite.run("addSubject", { name: "Bio" }); await app.settle(20);
  app.click("#sb-save"); await app.waitFor(() => !app.pending()); await app.settle();
  ok(gh.files().has("notes/Bio/.gitkeep"), "home: Save through the dock commits");
});

test("8A dock: lock hides the rows, restore after lock brings them back, local mode never shows them", async () => {
  const gh = new FakeGH(BASE);
  const app = await boot({ gh, hash: "#/subject/Math" });
  await app.login();
  await app.subjectMenu("Insert new chapter"); await app.submitDialog("Extra");
  app.w.setMode("r"); await app.settle(30);
  ok(!app.pending() && rowsInert(app) && app.q("#mb-pending").hidden, "read mode after lock: no pending rows, no indicator");
  ok(!app.beforeUnloadPrevented(), "no beforeunload after lock");
  await app.login();
  await app.waitFor(() => /Restore unsaved changes/.test((app.q("#modal") || {}).textContent || ""));
  app.click('[data-rs="restore"]');
  await app.waitFor(() => app.count() === 1); await app.settle(30);
  ok(app.pending(), "restored: the dock shows the change");
  eq(chipText(app), "1 unsaved change", "restored count");

  const folder = makeFolder(BASE); await folder.init();
  const lapp = await boot({ mode: "local", folder, hash: "#/subject/Math" });
  await lapp.login();
  await lapp.subjectMenu("Insert new chapter"); await lapp.submitDialog("Extra");
  ok(!lapp.pending() && rowsInert(lapp), "local: change applied at once, never pending rows");
  ok(lapp.q(".dock") && lapp.qa(".dock .mode-btn").length === 2, "local: dock is only R/W");
  ok(oldBarGone(lapp), "local: no old bar");
});

test("8A dock: no Save bar left in the stylesheets or the page", async () => {
  const fsx = require("fs"), px = require("path");
  for (const f of ["stage.css", "subject.css", "auth.css", "dock.css", "style.css", "notes.css"]) {
    const css = fsx.readFileSync(px.join(__dirname, "..", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    ok(!/savebar|has-savebar|sb-count|sb-actions|sb-msg/.test(css), `${f}: no old bar CSS`);
  }
  const js = fsx.readFileSync(px.join(__dirname, "..", "app.js"), "utf8");
  ok(!/savebar|renderSaveBar|has-savebar/.test(js), "app.js: no old bar code");
  const html = fsx.readFileSync(px.join(__dirname, "..", "index.html"), "utf8");
  ok(/dock\.css/.test(html), "index.html loads dock.css");
  const subject = fsx.readFileSync(px.join(__dirname, "..", "subject.css"), "utf8");
  ok(/clamp\(320px, 26vw, 380px\)/.test(subject), "sidebar is the wider clamp()");
});

(async () => {
  for (const [name, fn] of tests) {
    const before = failed;
    process.stdout.write(`- ${name}\n`);
    try { await fn(); } catch (e) { failed++; failures.push(`${name}: THREW ${e.stack || e}`); console.log("  THREW:", e.stack || e); }
    console.log(failed === before ? "  ok" : "  FAILED");
  }
  console.log(`\n${passed} checks passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
