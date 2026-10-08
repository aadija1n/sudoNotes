/* Phase 9A: raw Markdown editor for one topic note (write mode only).
   Pure UI + dirty tracking. It never stages anything itself: the app passes onDone(text), which stages the change.
   One session at a time. The elements live in the session, so the app can move the editor into a rebuilt page
   (remount) without losing the text, the cursor or the scroll position. */

(function (global) {
  let s = null; // { id, path, start, root, ta, err, done, cancel, opts, busy }
  let unloadOn = false;

  const onUnload = (e) => { e.preventDefault(); e.returnValue = ""; return ""; };
  const isDirty = () => !!s && s.ta.value !== s.start;

  /* The browser's own prompt exists only while there is unsaved text in the editor. */
  function syncUnload() {
    const want = isDirty();
    if (want && !unloadOn) { window.addEventListener("beforeunload", onUnload); unloadOn = true; }
    else if (!want && unloadOn) { window.removeEventListener("beforeunload", onUnload); unloadOn = false; }
  }

  function grow() {
    if (!s) return;
    const ta = s.ta;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight + 2}px`;
  }

  const dirOf = () => (s.path || "").slice(0, (s.path || "").lastIndexOf("/"));

  /* Blocks view needs the exact text; false (and a notice) when it cannot split it safely. */
  function showBlocks(notice) {
    const text = s.ta.value;
    let ok = false;
    if (global.NotesBlocks) {
      if (s.blocks) ok = s.blocks.setText(text);
      else {
        s.blocks = global.NotesBlocks.mount(s.host, {
          text, dir: dirOf,
          onChange: (t) => { s.ta.value = t; syncUnload(); }, // the textarea always holds the document text
        });
        ok = !!s.blocks;
      }
    }
    if (!ok) { s.notice.textContent = notice; return false; }
    s.notice.textContent = "";
    s.view = "blocks";
    s.ta.hidden = true;
    s.host.hidden = false;
    s.toggle.textContent = "Source";
    return true;
  }

  function showSource() {
    if (s.blocks) s.blocks.commit();
    s.view = "source";
    s.host.hidden = true;
    s.ta.hidden = false;
    s.toggle.textContent = "Blocks";
    grow();
    s.ta.focus();
  }

  function toggleView() {
    if (!s || s.busy) return;
    if (s.view === "blocks") showSource();
    else showBlocks("This note uses syntax the block editor cannot split safely, so it stays as plain text.");
  }

  function setBusy(on) {
    s.busy = on;
    s.toggle.disabled = on;
    if (s.blocks) s.blocks.setLocked(on);
    s.ta.readOnly = on;
    s.done.disabled = on;
    s.cancel.disabled = on;
    s.done.textContent = on ? "Working…" : "Done";
  }

  /* Removes the editor from the page and forgets the session (no callbacks). */
  function teardown() {
    if (!s) return;
    if (s.blocks) s.blocks.destroy();
    const note = s.root.closest(".note");
    if (note) note.classList.remove("editing");
    s.root.remove();
    s = null;
    syncUnload();
  }

  function finish() {
    const after = s && s.opts.onClosed;
    teardown();
    if (after) after();
  }

  async function done() {
    if (!s || s.busy) return;
    if (s.view === "blocks" && s.blocks) s.blocks.commit(); // an open block is applied first
    const content = s.ta.value;
    if (content === s.start) { finish(); return; } // nothing changed: stage nothing
    setBusy(true);
    s.err.textContent = "";
    try {
      await s.opts.onDone(content);
    } catch (e) {
      if (s) { s.err.textContent = (e && e.message) || "Could not apply the edit. Your text is still here."; setBusy(false); }
      return;
    }
    if (s) finish();
  }

  function cancel() {
    if (!s || s.busy) return;
    if (s.view === "blocks" && s.blocks) s.blocks.commit();
    if (isDirty()) s.opts.confirmDiscard(() => { if (s) finish(); });
    else finish();
  }

  function mount(container) {
    container.replaceChildren(s.root);
    const note = container.closest(".note");
    if (note) note.classList.add("editing");
    requestAnimationFrame(grow);
  }

  /* open(container, { id, path, text, onDone(text) -> Promise, onClosed(), confirmDiscard(proceed) }) */
  function open(container, opts) {
    if (s) return false;
    const root = document.createElement("div");
    root.className = "editor";
    root.innerHTML = `
      <p class="editor-notice"></p>
      <div class="blocks-host"></div>
      <textarea class="editor-ta" spellcheck="false" autocapitalize="off" aria-label="Note text (Markdown)"></textarea>
      <p class="editor-error" role="alert"></p>
      <div class="editor-actions">
        <button type="button" class="btn primary" data-ed="done">Done</button>
        <button type="button" class="btn" data-ed="cancel">Cancel</button>
        <button type="button" class="btn ed-toggle" data-ed="mode">Source</button>
      </div>`;
    const ta = root.querySelector("textarea");
    ta.value = typeof opts.text === "string" ? opts.text : "";
    s = {
      id: opts.id, path: opts.path, start: ta.value, root, ta, opts, busy: false,
      err: root.querySelector(".editor-error"),
      done: root.querySelector('[data-ed="done"]'),
      cancel: root.querySelector('[data-ed="cancel"]'),
      toggle: root.querySelector('[data-ed="mode"]'),
      host: root.querySelector(".blocks-host"),
      notice: root.querySelector(".editor-notice"),
      blocks: null, view: "source",
    };
    ta.addEventListener("input", () => { grow(); syncUnload(); });
    ta.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation(); // the app's global Escape handler must not close the confirm dialog we are about to open
      cancel();
    });
    s.done.addEventListener("click", done);
    s.cancel.addEventListener("click", cancel);
    s.toggle.addEventListener("click", toggleView);
    mount(container);
    if (showBlocks("This note uses syntax the block editor cannot split safely, so it opened as plain text.")) ta.hidden = true;
    else { s.host.hidden = true; s.toggle.hidden = true; ta.focus(); } // no block view for this note
    return true;
  }

  global.NotesEditor = {
    open,
    isOpen: () => !!s,
    isDirty,
    id: () => (s ? s.id : null),
    path: () => (s ? s.path : null),
    setPath(p) { if (s) s.path = p; },
    /* moves the live editor into a rebuilt page */
    remount(container) { if (s) mount(container); },
    /* drops the editor without asking and without callbacks (the caller decided already) */
    close() { teardown(); },
  };
})(window);
