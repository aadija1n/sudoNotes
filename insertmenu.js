/* Phase 9C: the "+" insert menu for the block editor (write mode, editor open, Blocks view).
   The bar itself (#add-content) is rendered by app.js; this file takes over its click (capture phase, so app.js'
   placeholder handler never runs), shows the menu, asks for link / code-language details, and inserts through the
   NotesBlocks handle: handle.insertAfterActive(text, { edit, caret }).
   editor.js calls NotesInsert.attach(getHandle) / refresh() / detach(); getHandle() returns the handle in Blocks view, else null. */

(function (global) {
  let getHandle = null;
  let menu = null;
  let dlg = null;

  const body = document.body;
  const bar = () => document.getElementById("add-content");
  const hint = () => { try { if (typeof toast === "function") toast("Switch to Blocks to insert"); } catch { /* no toast */ } };
  const focusBar = () => { const b = bar(); if (b) b.focus(); };

  const LANGS = [["plain text", ""], ["javascript"], ["python"], ["c"], ["cpp"], ["java"], ["bash"], ["sql"], ["html"], ["css"], ["json"], ["markdown"], ["mermaid"]];

  const item = (act, label, sample) =>
    `<button type="button" role="menuitem" class="ins-item" data-act="${act}"><span>${label}</span>${sample ? `<span class="ins-hint">${sample}</span>` : ""}</button>`;

  const MENU_HTML = `
    <div class="ins-label" role="presentation">Text</div>
    ${item("p", "Paragraph", "")}
    <div class="ins-chips" role="group" aria-label="Headings">
      ${[1, 2, 3, 4, 5, 6].map((n) => `<button type="button" role="menuitem" class="ins-chip" data-act="h${n}" aria-label="Heading ${n}" title="Heading ${n}">H${n}</button>`).join("")}
    </div>
    <div class="ins-label" role="presentation">Lists</div>
    ${item("ul", "Bulleted list", "-")}
    ${item("ol", "Numbered list", "1.")}
    ${item("task", "Task list", "- [ ]")}
    <div class="ins-label" role="presentation">Blocks</div>
    ${item("quote", "Quote", "&gt;")}
    ${item("code", "Code block", "```")}
    ${item("hr", "Horizontal rule", "---")}
    ${item("html", "Raw HTML", "&lt;div&gt;")}
    <div class="ins-label" role="presentation">Link</div>
    ${item("link", "Link…", "[text](url)")}`;

  /* ---------- inserting ---------- */
  function insert(text, o) {
    const h = getHandle && getHandle();
    if (!h) { hint(); return false; }
    return h.insertAfterActive(text, o);
  }

  function run(act) {
    const h = /^h([1-6])$/.exec(act);
    if (h) { insert("#".repeat(+h[1]) + " "); return; }
    switch (act) {
      case "p": insert(""); break;
      case "ul": insert("- "); break;
      case "ol": insert("1. "); break;
      case "task": insert("- [ ] "); break;
      case "quote": insert("> "); break;
      case "hr": insert("---", { edit: false }); break;
      case "html": insert("<div>\n\n</div>", { caret: 6 }); break;
      case "code": codeDialog(); break;
      case "link": linkDialog(); break;
    }
  }

  /* ---------- the menu ---------- */
  function closeMenu() {
    if (menu) { menu.remove(); menu = null; }
  }

  function placeMenu(btn) {
    const r = btn.getBoundingClientRect();
    const m = 8;
    menu.style.maxHeight = `${Math.max(140, r.top - m * 2)}px`;
    const w = menu.offsetWidth;
    menu.style.left = `${Math.min(Math.max(m, r.left + r.width / 2 - w / 2), Math.max(m, window.innerWidth - w - m))}px`;
    menu.style.top = "auto";
    menu.style.bottom = `${window.innerHeight - r.top + 6}px`; // opens upward from the bar
  }

  function openMenu(btn) {
    closeMenu();
    menu = document.createElement("div");
    menu.className = "menu ins-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Insert a block");
    menu.innerHTML = MENU_HTML;
    document.body.appendChild(menu);
    placeMenu(btn);
    const first = menu.querySelector("button");
    if (first) first.focus();

    menu.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      closeMenu();
      run(act);
    });
    menu.addEventListener("keydown", (e) => {
      const items = [...menu.querySelectorAll("button")];
      const i = items.indexOf(document.activeElement);
      let to = null;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(); focusBar(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") to = items[(i + 1) % items.length];
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") to = items[(i - 1 + items.length) % items.length];
      else if (e.key === "Home") to = items[0];
      else if (e.key === "End") to = items[items.length - 1];
      else if (e.key === "Tab") to = e.shiftKey ? items[(i - 1 + items.length) % items.length] : items[(i + 1) % items.length]; // keep focus in the menu
      if (to) { e.preventDefault(); to.focus(); }
    });
  }

  /* ---------- small dialogs (existing modal look; own element so app.js' Escape/closeModal leave it alone) ---------- */
  function closeDialog() {
    if (dlg) { dlg.remove(); dlg = null; }
  }

  function openDialog(html) {
    closeDialog();
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.id = "ins-modal";
    wrap.innerHTML = html;
    const cancel = () => { closeDialog(); focusBar(); };
    wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) cancel(); });
    wrap.addEventListener("click", (e) => { if (e.target.closest("[data-ins-cancel]")) cancel(); });
    wrap.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); return; }
      if (e.key !== "Tab") return;
      const f = [...wrap.querySelectorAll("button, input")].filter((x) => !x.disabled);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      const to = e.shiftKey ? f[(i - 1 + f.length) % f.length] : f[(i + 1) % f.length];
      e.preventDefault();
      to.focus();
    });
    document.body.appendChild(wrap);
    dlg = wrap;
    return wrap;
  }

  /* Accepts http(s)://, mailto: or a relative path; every other scheme (javascript:, data:, ...) is refused. */
  function cleanUrl(raw) {
    const u = String(raw || "").trim();
    if (!u || /[\s\u0000-\u001f\u007f<>"`\\]/.test(u)) return null;
    let ok;
    if (/^https?:\/\/[^/?#]/i.test(u) || /^mailto:[^\s]+$/i.test(u)) ok = true;
    else if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith("//")) ok = false;
    else ok = true; // relative path, "#/..." route or "/..."
    return ok ? u.replace(/\(/g, "%28").replace(/\)/g, "%29") : null;
  }

  function linkDialog() {
    const wrap = openDialog(`
      <form class="modal" role="dialog" aria-modal="true" aria-labelledby="ins-title" autocomplete="off" novalidate>
        <h2 id="ins-title">Insert link</h2>
        <label class="field"><span>Text</span><input name="text" spellcheck="false" /></label>
        <label class="field"><span>URL</span><input name="url" inputmode="url" spellcheck="false" autocapitalize="off" placeholder="https://… or a relative path" /></label>
        <p class="form-error" role="alert"></p>
        <div class="modal-actions">
          <button type="button" class="btn" data-ins-cancel>Cancel</button>
          <button type="submit" class="btn primary">Insert</button>
        </div>
      </form>`);
    const form = wrap.querySelector("form");
    const err = wrap.querySelector(".form-error");
    form.elements.text.focus();
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = form.elements.text.value.replace(/\s+/g, " ").trim();
      const url = cleanUrl(form.elements.url.value);
      if (!text) { err.textContent = "Enter the link text."; form.elements.text.focus(); return; }
      if (!url) { err.textContent = "The URL must start with http://, https:// or mailto:, or be a relative path (no spaces)."; form.elements.url.focus(); return; }
      closeDialog();
      insert(`[${text.replace(/[[\]\\]/g, "\\$&")}](${url})`);
    });
  }

  function insertCode(lang) {
    insert("```" + lang + "\n\n```", { caret: 3 + lang.length + 1 }); // caret on the empty middle line
  }

  function codeDialog() {
    const wrap = openDialog(`
      <form class="modal" role="dialog" aria-modal="true" aria-labelledby="ins-title" autocomplete="off" novalidate>
        <h2 id="ins-title">Code block language</h2>
        <div class="ins-langs" role="group" aria-label="Common languages">
          ${LANGS.map(([label, v]) => `<button type="button" class="ins-lang" data-lang="${v === undefined ? label : v}">${label}</button>`).join("")}
        </div>
        <label class="field"><span>Or type your own</span><input name="lang" spellcheck="false" autocapitalize="off" placeholder="e.g. rust, yaml" /></label>
        <p class="form-error" role="alert"></p>
        <div class="modal-actions">
          <button type="button" class="btn" data-ins-cancel>Cancel</button>
          <button type="submit" class="btn primary">Insert</button>
        </div>
      </form>`);
    const form = wrap.querySelector("form");
    const err = wrap.querySelector(".form-error");
    wrap.querySelector(".ins-lang").focus();
    wrap.querySelector(".ins-langs").addEventListener("click", (e) => {
      const b = e.target.closest(".ins-lang");
      if (!b) return;
      closeDialog();
      insertCode(b.dataset.lang);
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = form.elements.lang.value.trim();
      if (!v) { err.textContent = "Pick a language above or type one."; form.elements.lang.focus(); return; }
      if (!/^[A-Za-z0-9_+#.-]{1,30}$/.test(v)) { err.textContent = "Use letters, digits and + # . - _ only (no spaces)."; form.elements.lang.focus(); return; }
      closeDialog();
      insertCode(v);
    });
  }

  /* ---------- wiring ---------- */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest("#add-content");
    if (!btn || !body.classList.contains("ed-open")) return;
    e.stopPropagation(); // app.js' placeholder handler must not run
    e.preventDefault();
    if (menu) { closeMenu(); return; }
    if (!getHandle || !getHandle()) { hint(); return; }
    openMenu(btn);
  }, true);

  document.addEventListener("pointerdown", (e) => {
    if (menu && !menu.contains(e.target) && !(e.target.closest && e.target.closest("#add-content"))) closeMenu();
  }, true);

  window.addEventListener("resize", closeMenu);

  global.NotesInsert = {
    attach(getter) {
      getHandle = getter;
      body.classList.add("ed-open");
      this.refresh();
    },
    detach() {
      closeMenu();
      closeDialog();
      getHandle = null;
      body.classList.remove("ed-open");
      delete body.dataset.ins;
      const b = bar();
      if (b) { b.removeAttribute("aria-disabled"); b.title = "Add content"; }
    },
    /* the bar is disabled (with a hint) in Source view */
    refresh() {
      if (!getHandle) return;
      const on = !!getHandle();
      body.dataset.ins = on ? "blocks" : "source";
      const b = bar();
      if (b) { b.setAttribute("aria-disabled", String(!on)); b.title = on ? "Insert a block" : "Switch to Blocks to insert"; }
      if (!on) closeMenu();
    },
  };
})(window);
