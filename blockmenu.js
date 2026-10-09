/* Phase 9D: block menu for the block editor (write mode, Blocks view).
   Every rendered block gets a "⋮" handle (decorate, called by blocks.js). A click on a handle opens a small menu:
   Move up, Move down, Duplicate, Delete. Delete shows an "Undo" notice for about 8 seconds.
   All data changes go through the NotesBlocks handle (moveBlock, duplicateBlock, deleteBlock, restoreBlock, blockIndex, count).
   NotesBlockMenu.decorate(wrap) / bind(root, api) / unbind(root). Alt+Up/Down is handled in blocks.js. */

(function (global) {
  let menu = null;
  let menuBtn = null;
  let undoEl = null;
  let undoTimer = 0;
  let bound = null; // { root, api, onClick }

  function decorate(wrap) {
    if (!wrap || wrap.classList.contains("editing")) return;
    wrap.querySelectorAll(":scope > .blk-handle").forEach((n) => n.remove());
    const b = document.createElement("button");
    b.type = "button";
    b.className = "blk-handle";
    b.textContent = "\u22EE";
    b.title = "Block menu";
    b.setAttribute("aria-label", "Block menu");
    b.setAttribute("aria-haspopup", "menu");
    b.setAttribute("aria-expanded", "false");
    wrap.appendChild(b);
  }

  /* ---------- menu ---------- */
  function closeMenu(refocus) {
    if (!menu) return;
    menu.remove();
    menu = null;
    if (menuBtn) {
      menuBtn.setAttribute("aria-expanded", "false");
      if (refocus && menuBtn.isConnected) menuBtn.focus({ preventScroll: true });
    }
    menuBtn = null;
  }

  function place(btn) {
    const r = btn.getBoundingClientRect();
    const m = 8;
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = `${Math.min(Math.max(m, r.left), Math.max(m, window.innerWidth - w - m))}px`;
    const below = r.bottom + 4;
    menu.style.top = `${below + h + m > window.innerHeight && r.top - h - 4 > m ? r.top - h - 4 : below}px`;
  }

  function openMenu(btn) {
    const { api } = bound;
    closeMenu();
    const wrap = btn.closest(".blk");
    const i = api.blockIndex(wrap); // commits an open block first
    if (i < 0) return;
    const n = api.count();
    const items = [];
    if (i > 0) items.push(["up", "Move up"]);
    if (i < n - 1) items.push(["down", "Move down"]);
    items.push(["dup", "Duplicate"], ["del", "Delete"]);

    menu = document.createElement("div");
    menu.className = "menu blk-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Block actions");
    menu.style.position = "fixed";
    menu.innerHTML = items.map(([act, label]) => `<button type="button" role="menuitem" data-act="${act}">${label}</button>`).join("");
    document.body.appendChild(menu);
    menuBtn = btn;
    btn.setAttribute("aria-expanded", "true");
    place(btn);
    menu.querySelector("button").focus();

    menu.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      closeMenu(false);
      run(act, wrap);
    });
    menu.addEventListener("keydown", (e) => {
      const list = [...menu.querySelectorAll("button")];
      const k = list.indexOf(document.activeElement);
      let to = null;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(true); return; }
      if (e.key === "ArrowDown") to = list[(k + 1) % list.length];
      else if (e.key === "ArrowUp") to = list[(k - 1 + list.length) % list.length];
      else if (e.key === "Home") to = list[0];
      else if (e.key === "End") to = list[list.length - 1];
      else if (e.key === "Tab") to = e.shiftKey ? list[(k - 1 + list.length) % list.length] : list[(k + 1) % list.length];
      if (to) { e.preventDefault(); to.focus(); }
    });
  }

  function run(act, wrap) {
    if (!bound) return;
    const { api } = bound;
    const i = api.blockIndex(wrap);
    if (i < 0) return;
    if (act === "up") api.moveBlock(i, -1);
    else if (act === "down") api.moveBlock(i, 1);
    else if (act === "dup") api.duplicateBlock(i);
    else if (act === "del") {
      const rec = api.deleteBlock(i);
      if (rec) showUndo(rec);
    }
  }

  /* ---------- undo notice ---------- */
  function hideUndo() {
    clearTimeout(undoTimer);
    if (undoEl) { undoEl.remove(); undoEl = null; }
  }

  function showUndo(rec) {
    hideUndo();
    const el = document.createElement("div");
    el.className = "blk-undo";
    const msg = document.createElement("span");
    msg.textContent = "Block deleted";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Undo";
    btn.addEventListener("click", () => {
      const api = bound && bound.api;
      hideUndo();
      if (api) api.restoreBlock(rec);
    });
    el.append(msg, btn);
    // same corner and stack as the app's toasts (bottom right); fall back to the page if that container is missing
    (document.getElementById("toasts") || document.body).appendChild(el);
    undoEl = el;
    undoTimer = setTimeout(hideUndo, 8000);
  }

  /* ---------- wiring ---------- */
  function bind(root, api) {
    unbind();
    const onClick = (e) => {
      const btn = e.target.closest && e.target.closest(".blk-handle");
      if (!btn) return;
      e.preventDefault();
      if (menu && menuBtn === btn) { closeMenu(true); return; }
      openMenu(btn);
    };
    root.addEventListener("click", onClick);
    bound = { root, api, onClick };
  }

  function unbind(root) {
    if (!bound || (root && bound.root !== root)) return;
    bound.root.removeEventListener("click", bound.onClick);
    bound = null;
    closeMenu(false);
    hideUndo();
  }

  document.addEventListener("pointerdown", (e) => {
    if (menu && !menu.contains(e.target) && !(e.target.closest && e.target.closest(".blk-handle"))) closeMenu(false);
  }, true);
  window.addEventListener("resize", () => closeMenu(false));
  window.addEventListener("scroll", () => closeMenu(false), true);

  global.NotesBlockMenu = { decorate, bind, unbind };
})(window);
