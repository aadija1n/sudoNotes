/* One driver API (all async) over two backends: jsdom (harness.js) and real Chromium (e2e8b.js). */
module.exports = function makeDriver({ call, sleep, localFiles, extra = {} }) {
  const api = {
    call, sleep, localFiles,
    async settle(ms = 40) { for (let i = 0; i < 3; i++) await sleep(ms); },
    async waitFor(fn, ms = 5000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* keep waiting */ } await sleep(15); }
      throw new Error("waitFor timed out: " + fn.toString());
    },
    /* waits until the screen stops changing (an operation that is still staging or re-drawing has finished) */
    async quiet(polls = 4, gap = 40) {
      let last = null, same = 0;
      for (let i = 0; i < 100 && same < polls; i++) {
        const sig = JSON.stringify(await Promise.all([call("hash"), call("stageCount"), call("topicFiles"), call("count", ".toast"), call("hasModal"), call("note")]));
        same = sig === last ? same + 1 : 0;
        last = sig;
        await sleep(gap);
      }
    },
    async login() {
      await call("loginOpen");
      await api.waitFor(() => call("hasLoginForm"));
      await call("loginSubmit");
      await api.waitFor(() => call("bodyWrite"));
      await api.settle();
    },
    async submitDialog(value) {
      await call("submit", value);
      await api.waitFor(async () => !(await call("hasModal")) || (await call("modalError")));
      await api.settle(20);
    },
    async subjectMenu(label) { await call("openSubjectMenu"); await sleep(5); await call("clickMenu", label); await api.quiet(); },
    async menuAction(folder, label) { await call("openChapterMenu", folder); await sleep(5); await call("clickMenu", label); await api.quiet(); },
    async chapterMenuLabels(folder) { await call("openChapterMenu", folder); await sleep(5); const l = await call("menuLabels"); return l; },
    async topicMenuLabels(file) { await call("openTopicMenu", file); await sleep(5); return call("menuLabels"); },
    async topicMenu(file, label) { await call("openTopicMenu", file); await sleep(5); await call("clickMenu", label); await api.quiet(); },
    async addTopic(folder, title) { await api.menuAction(folder, "Add topic"); await api.submitDialog(title); },
    async renameTopic(file, title) { await api.topicMenu(file, "Rename"); await api.submitDialog(title); },
    async deleteTopic(file) { await api.topicMenu(file, "Delete"); await api.submitDialog(); },
    async clickSave() { await call("click", "#sb-save"); },
    async save() { await call("click", "#sb-save"); await api.waitFor(async () => !(await call("pending"))); await api.settle(); },
    async undo() { await call("click", "#sb-undo"); await api.quiet(); },
    async discard() { await call("click", "#sb-discard"); await api.settle(20); await api.submitDialog(); await api.waitFor(async () => !(await call("pending"))); await api.settle(); },
    async go(hash) { await call("setHash", hash); await api.quiet(); },
    folders: () => call("folders"),
    topics: () => call("topics"),
    topicFiles: () => call("topicFiles"),
    hash: () => call("hash"),
    note: () => call("note"),
    toasts: () => call("toasts"),
    count: () => call("stageCount"),
    chip: () => call("chip"),
    pending: () => call("pending"),
    ...extra,
  };
  return api;
};
