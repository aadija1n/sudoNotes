/* Phase 8B scenarios. Shared by tests.js (jsdom) and e2e8b.js (real Chromium).
   env = { test, ok, eq, boot, FakeGH }.  boot({mode, gh|files, hash}) returns the async driver (see driver.js). */
module.exports = function define({ test, ok, eq, boot, FakeGH }) {
  const B = {
    "notes/Math/Chapter 00 - Empty/.gitkeep": "",
    "notes/Math/Chapter 01 - Basics/1.1 X.md": "X body",
    "notes/Math/Chapter 01 - Basics/1.2 Y.md": "Y body",
    "notes/Math/Chapter 01 - Basics/1.4 Gap.md": "Gap body",
    "notes/Math/Chapter 01 - Basics/fig.png": "PNG",
    "notes/Math/Chapter 01 - Basics/img/a.png": "IMG",
    "notes/Math/Chapter 01 - Basics/notes.txt": "TXT",
    "notes/Math/Chapter 02 - Same/2.1 Same.md": "first",
    "notes/Math/Chapter 02 - Same/2.2 Same.md": "second",
    "notes/Math/Chapter 03 - Solo/3.1 Only.md": "only body",
    "notes/Math/Chapter 04 - Ten/4.9 Nine.md": "nine",
    "notes/Physics/Chapter 00 - Mech/0.1 F.md": "F body",
  };
  const BAS = "Chapter 01 - Basics";
  const snap = (gh) => Object.fromEntries([...gh.files().entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  const snapMap = (m) => Object.fromEntries([...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  const withChanges = (changes) => { const o = { ...B }; for (const [k, v] of Object.entries(changes)) { if (v === null) delete o[k]; else o[k] = v; } return Object.fromEntries(Object.entries(o).sort((a, b) => (a[0] < b[0] ? -1 : 1))); };
  const waitNote = (app, re) => app.waitFor(async () => re.test(await app.note()));
  const bd = (f) => `notes/Math/${BAS}/${f}`;

  /* the operations of the "everything together" scenario; works in both modes */
  async function mixedOps(app) {
    await app.subjectMenu("Insert new chapter"); await app.submitDialog("Extra");
    await app.addTopic(BAS, "New");               // 1.5 New (empty)
    await app.renameTopic("1.1 X.md", "Xx");      // 1.1 Xx
    await app.topicMenu("1.5 New.md", "Move up"); // New 1.4, Gap 1.5
    await app.deleteTopic("1.2 Y.md");            // New 1.3, Gap 1.4
  }
  const MIXED_EXPECTED = withChanges({
    "notes/Math/Chapter 05 - Extra/.gitkeep": "",
    [bd("1.1 X.md")]: null, [bd("1.1 Xx.md")]: "X body",
    [bd("1.2 Y.md")]: null,
    [bd("1.4 Gap.md")]: "Gap body", // Gap is 1.4 again at the end
    [bd("1.3 New.md")]: "",
  });

  test("8B first topic is N.1 (chapter 00 gives 0.1), file starts empty, opens as an empty note", async () => {
    const gh = new FakeGH(B);
    const app = await boot({ gh, hash: "#/subject/Math" });
    await app.login();
    await app.addTopic("Chapter 00 - Empty", "First");
    eq(await app.call("topicsOf", "Chapter 00 - Empty"), ["0.1 First.md"], "first topic of chapter 00 is 0.1");
    eq(await app.hash(), "#/subject/Math/0.1", "the new topic became the open note");
    await waitNote(app, /This note is empty/);
    ok(true, "empty placeholder shown for a staged-new topic");
    eq(await app.count(), 1, "one staged operation");
    eq(await app.chip(), "1 unsaved change", "dock chip");
    eq(gh.counts.treePost, 0, "nothing written before Save");
    eq(await app.call("openChapter"), "Chapter 00 - Empty", "its chapter is open");
    await app.save();
    const f = snap(gh);
    eq(f["notes/Math/Chapter 00 - Empty/0.1 First.md"], "", "empty file committed");
    eq(f["notes/Math/Chapter 00 - Empty/.gitkeep"], "", "the .gitkeep was not touched");
    eq(gh.counts.commitPost, 1, "one commit");
  });

  test("8B next index = highest + 1: gaps are never reused, 1.10 sorts after 1.9, titles may repeat", async () => {
    const gh = new FakeGH(B);
    const app = await boot({ gh, hash: "#/subject/Math" });
    await app.login();
    await app.addTopic(BAS, "New");
    eq(await app.call("topicsOf", BAS), ["1.1 X.md", "1.2 Y.md", "1.4 Gap.md", "1.5 New.md"], "1.3 (a gap) is not reused");
    await app.addTopic(BAS, "X"); // same title as 1.1
    eq((await app.call("topicsOf", BAS)).slice(-1), ["1.6 X.md"], "repeated title is fine, index 1.6");
    await app.addTopic("Chapter 04 - Ten", "Ten");
    eq(await app.call("topicsOf", "Chapter 04 - Ten"), ["4.9 Nine.md", "4.10 Ten.md"], "no zero padding, numeric order");
    eq(await app.hash(), "#/subject/Math/4.10", "the new topic opened");
    eq(await app.count(), 3, "three staged operations");
  });

  test("8B add + rename + move + delete topics with a chapter edit: ONE commit, expected tree; local mode ends the same", async () => {
    const gh = new FakeGH(B);
    const app = await boot({ gh, hash: "#/subject/Math" });
    await app.login();
    const chips = [];
    await app.subjectMenu("Insert new chapter"); await app.submitDialog("Extra"); chips.push(await app.chip());
    await app.addTopic(BAS, "New"); chips.push(await app.chip());
    await app.renameTopic("1.1 X.md", "Xx"); chips.push(await app.chip());
    await app.topicMenu("1.5 New.md", "Move up"); chips.push(await app.chip());
    await app.deleteTopic("1.2 Y.md"); chips.push(await app.chip());
    eq(chips, ["1 unsaved change", "2 unsaved changes", "3 unsaved changes", "4 unsaved changes", "5 unsaved changes"], "the dock count grows by one per staged operation");
    eq(await app.call("topicsOf", BAS), ["1.1 Xx.md", "1.3 New.md", "1.4 Gap.md"], "virtual tree after all operations");
    eq(gh.counts.commitPost, 0, "nothing committed yet");
    await app.save();
    eq(gh.counts.commitPost, 1, "exactly one commit"); eq(gh.counts.treePost, 1, "exactly one tree"); eq(gh.counts.refPatch, 1, "exactly one ref update");
    ok(gh.messages[0].startsWith("Update notes: 5 changes"), "commit title: " + gh.messages[0].split("\n")[0]);
    ok(/Add topic: New/.test(gh.messages[0]) && /Rename topic: 1\.1 X\.md/.test(gh.messages[0]) && /Move topic up/.test(gh.messages[0]) && /Delete topic: 1\.2 Y\.md/.test(gh.messages[0]), "topic labels listed in the commit body");
    eq(snap(gh), MIXED_EXPECTED, "final tree in GitHub mode");

    const lapp = await boot({ mode: "local", files: B, hash: "#/subject/Math" });
    await lapp.login();
    await mixedOps(lapp);
    eq(await lapp.count(), 0, "local: nothing staged");
    ok(!(await lapp.pending()), "local: never a pending dock");
    eq(snapMap(await lapp.localFiles()), MIXED_EXPECTED, "local mode applied each operation at once and ends in the same tree");
  });

  test("8B Move up/down swaps indexes (equal titles, gaps, edges); the moved text loads before Save", async () => {
    const gh = new FakeGH(B);
    const app = await boot({ gh, hash: "#/subject/Math/2.2" });
    await app.login();
    eq(await app.topicMenuLabels("2.1 Same.md"), ["Rename", "Move down", "Delete"], "first topic: no Move up");
    await app.call("escape");
    eq(await app.topicMenuLabels("2.2 Same.md"), ["Rename", "Move up", "Delete"], "last topic: no Move down");
    await app.call("escape");
    await app.topicMenu("2.2 Same.md", "Move up"); // two topics with the SAME title
    eq(await app.hash(), "#/subject/Math/2.1", "the open topic follows its text to 2.1");
    await waitNote(app, /second/);
    ok(true, "moved topic text loaded from its original blob before Save");
    await app.go("#/subject/Math/2.2"); await waitNote(app, /first/);
    ok(true, "the swapped neighbour reads its own text");
    // gaps: 1.4 swaps with its neighbour 1.2, not with 1.3
    await app.topicMenu("1.4 Gap.md", "Move up");
    eq(await app.call("topicsOf", BAS), ["1.1 X.md", "1.2 Gap.md", "1.4 Y.md"], "swap with the adjacent topic across a gap");
    // refusals inside the plan
    const first = await app.call("run", "moveTopic", { subject: "Math", folder: BAS, file: "1.1 X.md", dir: "up" });
    ok(!first.ok && /first topic/.test(first.message), "plan refuses Move up on the first topic: " + first.message);
    const last = await app.call("run", "moveTopic", { subject: "Math", folder: BAS, file: "1.4 Y.md", dir: "down" });
    ok(!last.ok && /last topic/.test(last.message), "plan refuses Move down on the last topic: " + last.message);
    eq(await app.count(), 2, "refusals staged nothing");
    await app.save();
    const f = snap(gh);
    eq([f["notes/Math/Chapter 02 - Same/2.1 Same.md"], f["notes/Math/Chapter 02 - Same/2.2 Same.md"]], ["second", "first"], "equal titles swapped by index");
    eq([f[bd("1.2 Gap.md")], f[bd("1.4 Y.md")]], ["Gap body", "Y body"], "gap swap kept every text");
    eq(f[bd("1.1 X.md")], "X body", "untouched topic");
  });

  test("8B Delete shifts higher topics down in the same operation; .gitkeep keeps an emptied chapter; other files untouched", async () => {
    const gh = new FakeGH(B);
    const app = await boot({ gh, hash: "#/subject/Math" });
    await app.login();
    await app.deleteTopic("1.2 Y.md");
    eq(await app.call("topicsOf", BAS), ["1.1 X.md", "1.3 Gap.md"], "1.4 moved to 1.3; 1.1 untouched");
    ok((await app.call("text", ".topic.active")) === null, "no topic open");
    await app.deleteTopic("3.1 Only.md");
    eq(await app.folders(), ["Chapter 00 - Empty", BAS, "Chapter 02 - Same", "Chapter 03 - Solo", "Chapter 04 - Ten"], "the emptied chapter is still listed");
    eq(await app.call("topicsOf", "Chapter 03 - Solo"), [], "no topics left");
    await app.deleteTopic("1.1 X.md"); await app.deleteTopic("1.2 Gap.md"); // Gap shifted 1.3 -> 1.2
    eq(await app.call("topicsOf", BAS), [], "Basics has no topics");
    await app.save();
    eq(gh.counts.commitPost, 1, "one commit for all four deletes");
    const f = snap(gh);
    eq(f["notes/Math/Chapter 03 - Solo/.gitkeep"], "", ".gitkeep written in the emptied chapter");
    ok(!("notes/Math/Chapter 01 - Basics/.gitkeep" in f), "no .gitkeep where fig.png still keeps the chapter alive");
    eq([f[bd("fig.png")], f[bd("img/a.png")], f[bd("notes.txt")]], ["PNG", "IMG", "TXT"], "non-topic files untouched");
    ok(!Object.keys(f).some((p) => p.includes("Chapter 01 - Basics/") && /\.md$/.test(p)), "Basics has no topic files left");
    ok(!Object.keys(f).some((p) => p.includes("3.1 Only")), "the deleted Solo topic is gone");
    // shifted names: the gap topic ended as 1.1 then was deleted; check the shift on a fresh run
    const gh2 = new FakeGH(B);
    const a2 = await boot({ gh: gh2, hash: "#/subject/Math" });
    await a2.login();
    await a2.deleteTopic("1.1 X.md");
    await a2.save();
    const g = snap(gh2);
    eq([g[bd("1.1 Y.md")], g[bd("1.3 Gap.md")], bd("1.2 Y.md") in g, bd("1.4 Gap.md") in g], ["Y body", "Gap body", false, false], "delete 1.1: 1.2 -> 1.1, 1.4 -> 1.3");
  });

  test("8B local mode: topic ops apply at once; a removed last topic keeps its chapter (.gitkeep)", async () => {
    const lapp = await boot({ mode: "local", files: B, hash: "#/subject/Math" });
    await lapp.login();
    await lapp.addTopic("Chapter 00 - Empty", "First");
    let f = await lapp.localFiles();
    eq(f.get("notes/Math/Chapter 00 - Empty/0.1 First.md"), "", "local: file exists right after the dialog");
    await lapp.deleteTopic("3.1 Only.md");
    f = await lapp.localFiles();
    eq(f.get("notes/Math/Chapter 03 - Solo/.gitkeep"), "", "local: chapter kept alive by .gitkeep (not pruned)");
    eq(await lapp.folders(), ["Chapter 00 - Empty", BAS, "Chapter 02 - Same", "Chapter 03 - Solo", "Chapter 04 - Ten"], "local: chapter still listed");
    eq(await lapp.count(), 0, "nothing staged");
  });

  test("8B duplicate topic index: warning in write mode, Move/Delete refused, Rename allowed", async () => {
    const D = {
      "notes/Dup/Chapter 01 - C/1.1 A.md": "a", "notes/Dup/Chapter 01 - C/1.2 A.md": "a2",
      "notes/Dup/Chapter 01 - C/1.2 B.md": "b", "notes/Dup/Chapter 01 - C/1.3 C.md": "c",
    };
    const parsed = await (await boot({ gh: new FakeGH(D), hash: "#/subject/Dup" })).call("parse", Object.keys(D));
    eq(parsed.subjects[0].chapters[0].topicDups, [2], "parseTree reports the shared index");
    const gh = new FakeGH(D);
    const app = await boot({ gh, hash: "#/subject/Dup" });
    ok(await app.call("dupBannerWOnly"), "banner is write-mode only (w-only)");
    const banners = await app.call("dupBanners");
    eq(banners.length, 1, "one banner");
    ok(/1\.2 A\.md/.test(banners[0]) && /1\.2 B\.md/.test(banners[0]), "banner names both files: " + banners[0]);
    await app.login();
    await app.topicMenu("1.2 B.md", "Move up");
    ok((await app.toasts()).some((t) => /same number/.test(t)), "Move refused with a message");
    await app.topicMenu("1.3 C.md", "Delete");
    ok(!(await app.call("hasModal")), "Delete refused before any dialog");
    eq(await app.count(), 0, "nothing staged by refusals");
    for (const [type, args] of [["moveTopic", { dir: "down", file: "1.1 A.md" }], ["deleteTopic", { file: "1.3 C.md" }]]) {
      const r = await app.call("run", type, { subject: "Dup", folder: "Chapter 01 - C", ...args });
      ok(!r.ok && r.code === "duplicate", `${type}: the plan itself refuses (${r.code})`);
    }
    await app.renameTopic("1.2 B.md", "Bee");
    eq(await app.call("topicsOf", "Chapter 01 - C"), ["1.1 A.md", "1.2 A.md", "1.2 Bee.md", "1.3 C.md"], "Rename works for a file with a shared index");
    await app.save();
    eq(snap(gh)["notes/Dup/Chapter 01 - C/1.2 Bee.md"], "b", "rename saved with the right text");
  });

  test("8B route and last-opened follow topic id changes; Undo and Discard apply the inverse; deleted open topic goes to the welcome state", async () => {
    const gh = new FakeGH(B);
    const app = await boot({ gh, hash: "#/subject/Math/1.4" });
    await app.login();
    await waitNote(app, /Gap body/);
    await app.topicMenu("1.2 Y.md", "Move down"); // Y <-> Gap : the open Gap becomes 1.2
    eq(await app.hash(), "#/subject/Math/1.2", "open route follows its topic");
    eq(await app.call("lastTopic", "Math"), "1.2", "last-opened followed too");
    eq(await app.call("activeTopic"), "1.2 Gap", "sidebar highlights the moved topic");
    await waitNote(app, /Gap body/);
    await app.undo();
    eq(await app.hash(), "#/subject/Math/1.4", "Undo moved the route back"); eq(await app.call("lastTopic", "Math"), "1.4", "Undo moved last-opened back");
    await app.deleteTopic("1.1 X.md"); // Y 1.2->1.1, Gap 1.4->1.3
    eq(await app.hash(), "#/subject/Math/1.3", "delete shifts the open route"); await waitNote(app, /Gap body/);
    await app.topicMenu("1.1 Y.md", "Move down"); // Y <-> Gap again (1.1 <-> 1.3)
    eq(await app.hash(), "#/subject/Math/1.1", "second move followed");
    await app.discard();
    eq(await app.hash(), "#/subject/Math/1.4", "Discard applied every inverse in order");
    eq(await app.call("lastTopic", "Math"), "1.4", "Discard fixed last-opened");
    eq(await app.call("topicsOf", BAS), ["1.1 X.md", "1.2 Y.md", "1.4 Gap.md"], "tree back to saved state");
    // deleting the open topic
    await app.deleteTopic("1.4 Gap.md");
    eq(await app.hash(), "#/subject/Math", "deleted open topic -> subject welcome state");
    ok(await app.call("emptyState"), "welcome state shown");
    eq(await app.call("lastTopic", "Math"), null, "last-opened cleared");
    // undo of an add while its topic is open
    await app.addTopic("Chapter 02 - Same", "Fresh");
    eq(await app.hash(), "#/subject/Math/2.3", "staged-new topic open");
    await app.undo();
    eq(await app.hash(), "#/subject/Math", "Undo of the add closes the vanished topic");
    eq(await app.call("lastTopic", "Math"), null, "and forgets it");
    eq(gh.counts.commitPost, 0, "nothing committed");
  });

  test("8B staged-new topic: prev/next and breadcrumb use the virtual tree; staged text travels with a later move", async () => {
    const gh = new FakeGH(B);
    const app = await boot({ gh, hash: "#/subject/Math" });
    await app.login();
    await app.addTopic("Chapter 02 - Same", "Fresh");
    const nav = await app.call("navLinks");
    ok(/2\.2 Same/.test(nav.prev) && /3\.1 Only/.test(nav.next), `prev/next from the virtual tree: ${JSON.stringify(nav)}`);
    ok(/Chapter 02 - Same/.test(await app.call("crumbs")), "breadcrumb shows the chapter");
    await app.topicMenu("2.3 Fresh.md", "Move up");
    eq(await app.hash(), "#/subject/Math/2.2", "route follows the staged-new topic");
    await waitNote(app, /This note is empty/);
    await app.save();
    const f = snap(gh);
    eq([f["notes/Math/Chapter 02 - Same/2.2 Fresh.md"], f["notes/Math/Chapter 02 - Same/2.3 Same.md"]], ["", "second"], "staged text and moved blob both landed");
  });

  test("8B chapter operations still work with topics inside (change number, move, delete renumbering)", async () => {
    const gh = new FakeGH(B);
    const app = await boot({ gh, hash: "#/subject/Math" });
    await app.login();
    await app.addTopic("Chapter 04 - Ten", "Ten");           // 4.10
    await app.addTopic(BAS, "New");                           // 1.5
    await app.menuAction(BAS, "Change chapter number"); await app.submitDialog("09");
    eq(await app.call("topicsOf", "Chapter 09 - Basics"), ["9.1 X.md", "9.2 Y.md", "9.4 Gap.md", "9.5 New.md"], "number change renamed the topic files, gap kept");
    await app.menuAction("Chapter 03 - Solo", "Delete chapter"); await app.submitDialog(); // Ten 04 -> 03, Basics 09 -> 08
    eq(await app.call("topicsOf", "Chapter 03 - Ten"), ["3.9 Nine.md", "3.10 Ten.md"], "later chapter shifted down with two-digit topic index");
    eq(await app.call("topicsOf", "Chapter 08 - Basics"), ["8.1 X.md", "8.2 Y.md", "8.4 Gap.md", "8.5 New.md"], "the renumbered chapter shifted too");
    await app.menuAction("Chapter 02 - Same", "Move down");
    eq(await app.call("topicsOf", "Chapter 03 - Same"), ["3.1 Same.md", "3.2 Same.md"], "move swapped the topic files");
    await app.save();
    const f = snap(gh);
    ok(f["notes/Math/Chapter 08 - Basics/8.5 New.md"] === "" && f["notes/Math/Chapter 08 - Basics/fig.png"] === "PNG" && f["notes/Math/Chapter 08 - Basics/img/a.png"] === "IMG", "renumbered chapter kept the new empty topic and the other files");
    eq(f["notes/Math/Chapter 02 - Ten/2.10 Ten.md"], "", "the new topic travelled with its chapter (Ten ended at chapter 02 after the swap)");
    eq(gh.counts.commitPost, 1, "still one commit");
  });

  test("8B menus: topic menu exact items, write mode only, no 'arrives in Phase', a tap on the dots does not open the topic", async () => {
    const gh = new FakeGH(B);
    const app = await boot({ gh, hash: "#/subject/Math/2.1" });
    ok(!(await app.call("bodyWrite")), "read mode");
    ok(await app.call("allDotsWOnly"), "every menu button is w-only in read mode (hidden by CSS)");
    eq(await app.call("topicDotsCount"), 7, "every topic row has a ... button");
    await app.login();
    eq(await app.chapterMenuLabels(BAS), ["Add topic", "Rename chapter", "Change chapter number", "Move up", "Move down", "Delete chapter"], "chapter menu, Add topic first");
    await app.call("escape"); ok(!(await app.call("menuOpen")), "Escape closes the menu");
    eq(await app.topicMenuLabels("1.2 Y.md"), ["Rename", "Move up", "Move down", "Delete"], "topic menu items");
    eq(await app.hash(), "#/subject/Math/2.1", "tapping ... did not open the topic");
    await app.call("clickOutside"); ok(!(await app.call("menuOpen")), "outside click closes the menu");
    for (const label of ["Rename", "Delete"]) { // these open dialogs; cancel them
      await app.topicMenu("1.2 Y.md", label);
      ok(await app.call("hasModal"), `${label} opens a dialog`);
      await app.call("click", "#modal [data-modal-close]"); await app.settle(10);
    }
    await app.topicMenu("1.2 Y.md", "Move down"); // Y <-> Gap
    await app.topicMenu("1.4 Y.md", "Move up");   // and back
    ok(!(await app.toasts()).some((t) => /arrives in Phase/.test(t)), "no preview toasts any more");
    eq(await app.count(), 2, "Move down + Move up staged; Rename and Delete only opened dialogs");
  });

  test("8B title validation, stale screens fail safely with a message and keep the dialog open", async () => {
    const gh = new FakeGH(B);
    const app = await boot({ gh, hash: "#/subject/Math" });
    await app.login();
    await app.menuAction(BAS, "Add topic");
    ok(await app.call("submitDisabled"), "empty title: confirm disabled");
    for (const [v, re] of [["a/b", /cannot contain/], [".hidden", /start with a dot/], ["Ends.", /end with a dot/], ["x".repeat(81), /under 80/]]) {
      await app.call("typeInDialog", v);
      ok(re.test(await app.call("modalError")) && await app.call("submitDisabled"), `"${v.slice(0, 12)}": ${await app.call("modalError")}`);
    }
    await app.call("typeInDialog", "Foo.md"); ok(!(await app.call("submitDisabled")), "a title that ends in .md is fine");
    await app.call("click", "#modal [data-modal-close]"); await app.settle(10);
    const missing = await app.call("run", "renameTopic", { subject: "Math", folder: BAS, file: "9.9 Nope.md", title: "x" });
    ok(!missing.ok && missing.code === "missing", "unknown topic -> missing");
    // stale screen: the file disappears from the repository after the dialog was opened
    await app.topicMenu("1.1 X.md", "Rename");
    gh.external([{ path: bd("1.1 X.md"), remove: true }]);
    await app.call("typeInDialog", "Other");
    await app.call("submit");
    await app.waitFor(async () => (await app.call("modalError")).length > 0);
    ok(/no longer exists/.test(await app.call("modalError")), "friendly message in the dialog: " + await app.call("modalError"));
    ok(await app.call("hasModal"), "dialog stays open");
    eq(await app.call("modalSubmitText"), "Rename", "button is back to its label (not stuck on Working…)");
    eq(await app.count(), 0, "nothing staged");
  });

  test("8B Save on a newer repository: a staged add never reuses an index someone else took; a vanished topic blocks the save", async () => {
    const gh = new FakeGH(B);
    const app = await boot({ gh, hash: "#/subject/Math" });
    await app.login();
    await app.addTopic(BAS, "Mine"); // 1.5
    gh.external([{ path: bd("1.5 Ext.md"), content: "ext" }]);
    await app.clickSave();
    await app.waitFor(async () => !(await app.pending())); await app.settle();
    const f = snap(gh);
    eq([f[bd("1.5 Ext.md")], f[bd("1.6 Mine.md")]], ["ext", ""], "replay put the new topic at 1.6");
    ok((await app.toasts()).some((t) => /merged/.test(t)), "merged message");

    const gh2 = new FakeGH(B);
    const a2 = await boot({ gh: gh2, hash: "#/subject/Math" });
    await a2.login();
    await a2.deleteTopic("1.2 Y.md");
    gh2.external([{ path: bd("1.2 Y.md"), remove: true }]);
    await a2.clickSave();
    await a2.waitFor(async () => /Some changes can't be saved/.test(await a2.call("modalTitle")));
    eq(await a2.count(), 1, "the change is kept");
    eq(gh2.counts.commitPost, 0, "nothing committed");
  });
};
