/* Phase 8B test helpers that run INSIDE the page (jsdom window or real Chromium).
   Both runners inject this file as text; tests call them through driver.js, so one scenario file works in both. */
window.__t = (() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const click = (el) => { if (!el) throw new Error("click: nothing to click"); el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); };
  const chapterEl = (f) => $$(".chapter").find((c) => c.dataset.folder === f);
  const topicByFile = (file) => $$(".topic").find((t) => t.dataset.file === file);
  const set = (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };
  return {
    exists: (s) => !!$(s),
    count: (s) => $$(s).length,
    text: (s) => (($(s) || {}).textContent || null),
    click: (s) => click($(s)),
    folders: () => $$(".chapter").map((c) => c.dataset.folder),
    topics: () => $$(".topic").map((t) => t.textContent),
    topicFiles: () => $$(".topic").map((t) => t.dataset.file),
    topicsOf: (folder) => [...chapterEl(folder).querySelectorAll(".topic")].map((t) => t.dataset.file),
    hash: () => location.hash,
    note: () => (($("#note-body") || {}).textContent || ""),
    activeTopic: () => (($(".topic.active") || {}).textContent || null),
    openChapter: () => (($(".chapter.open") || { dataset: {} }).dataset.folder || null),
    toasts: () => $$(".toast").map((t) => t.textContent),
    pending: () => !!$(".dock.has-pending"),
    chip: () => { const c = $(".dock.has-pending .dock-chip"); return c ? c.textContent : null; },
    stageCount: () => NotesStage.count(),
    bodyWrite: () => document.body.classList.contains("write"),
    allDotsWOnly: () => $$(".dots").every((b) => b.classList.contains("w-only")),
    topicDotsCount: () => $$(".topic").filter((t) => t.closest("li").querySelector(".dots")).length,
    lastTopic: (subject) => localStorage.getItem("notes:lastTopic:" + subject),
    setLastTopic: (subject, id) => localStorage.setItem("notes:lastTopic:" + subject, id),
    dupBanners: () => $$(".dup-warning.topic-dup").map((e) => e.textContent),
    dupBannerWOnly: () => $$(".dup-warning.topic-dup").every((e) => e.classList.contains("w-only")),
    navLinks: () => ({ prev: ($(".note-nav .prev") || {}).textContent || null, next: ($(".note-nav .next") || {}).textContent || null }),
    crumbs: () => (($(".crumbs") || {}).textContent || ""),
    emptyState: () => !!$(".empty-state"),
    loginOpen: () => click($('.mode-btn[data-mode="w"]')),
    loginSubmit: () => {
      const f = $("#modal form");
      f.elements.username.value = "u"; f.elements.password.value = "p";
      f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    },
    hasModal: () => !!$("#modal"),
    hasLoginForm: () => !!$('#modal input[name="username"]'),
    modalError: () => (($("#modal .form-error") || {}).textContent || ""),
    modalTitle: () => (($("#modal h2") || {}).textContent || ""),
    modalText: () => (($("#modal") || {}).textContent || ""),
    modalSubmitText: () => (($('#modal [type="submit"]') || {}).textContent || ""),
    submit: (value) => {
      const f = $("#modal form");
      if (value !== undefined) set(f.elements.value, value);
      f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    },
    typeInDialog: (value) => set($("#modal form").elements.value, value),
    dialogValue: () => $("#modal form").elements.value.value,
    submitDisabled: () => $('#modal [type="submit"]').disabled,
    openChapterMenu: (folder) => click(chapterEl(folder).querySelector(".dots")),
    openTopicMenu: (file) => click(topicByFile(file).closest("li").querySelector(".dots")),
    openSubjectMenu: () => click($(".index-head .dots")),
    menuOpen: () => !!$(".menu"),
    menuLabels: () => $$(".menu button").map((b) => b.textContent),
    clickMenu: (label) => { const b = $$(".menu button").find((x) => x.textContent === label); if (!b) throw new Error(`menu item "${label}" not found; have ${$$(".menu button").map((x) => x.textContent)}`); click(b); },
    clickTopicLink: (file) => click(topicByFile(file)),
    run: async (type, args) => { try { const r = await NotesWrite.run(type, args); return { ok: true, r: JSON.parse(JSON.stringify(r)) }; } catch (e) { return { ok: false, code: e.code, message: e.message }; } },
    parse: (paths) => JSON.parse(JSON.stringify(NotesData.parseTree(paths, "notes"))),
    setHash: (h) => { location.hash = h; },
    escape: () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    clickOutside: () => click($("#note-scroll") || document.body),
  };
})();
