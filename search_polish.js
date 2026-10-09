/* Phase 15: Global note search modal (Ctrl+P / Ctrl+K), LaTeX cheat sheet dialog, and polish tools.
   window.NotesSearch */

(function (global) {
  const isMac = /Mac|iPhone|iPad/i.test((navigator && navigator.platform) || "");

  /* ---------- Global Note Search (Ctrl+P / Ctrl+K) ---------- */
  let searchWrap = null;

  function closeSearch() {
    if (searchWrap) {
      searchWrap.remove();
      searchWrap = null;
    }
  }

  function openSearch() {
    closeSearch();
    if (!global.NotesData) return;

    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.id = "search-modal";
    wrap.innerHTML = `
      <div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="srch-title" style="padding:16px;">
        <input type="search" id="global-search-input" placeholder="Search topics and subjects… (press Esc to close)" style="width:100%;min-height:42px;padding:10px 14px;background:#0a0a0d;border:1px solid var(--border);border-radius:8px;color:var(--text);font:inherit;font-size:15px;" spellcheck="false" autocomplete="off" />
        <div id="global-search-results" style="max-height:360px;overflow-y:auto;margin-top:12px;display:flex;flex-direction:column;gap:4px;"></div>
      </div>
    `;

    const input = wrap.querySelector("#global-search-input");
    const results = wrap.querySelector("#global-search-results");

    async function doSearch() {
      const q = input.value.trim().toLowerCase();
      results.replaceChildren();

      let data = null;
      try {
        data = await global.NotesData.loadData();
      } catch {
        results.innerHTML = `<p style="padding:12px;color:var(--text-muted);text-align:center;">Could not load topics list.</p>`;
        return;
      }

      if (!data || !data.subjects) return;

      const items = [];
      data.subjects.forEach((s) => {
        s.chapters.forEach((ch) => {
          ch.topics.forEach((t) => {
            const full = `${s.name} ${ch.name} ${t.id} ${t.title}`.toLowerCase();
            if (!q || full.includes(q)) {
              items.push({
                subject: s.name,
                chapter: ch.name,
                chNum: ch.num,
                id: t.id,
                title: t.title,
                path: t.path,
              });
            }
          });
        });
      });

      if (!items.length) {
        results.innerHTML = `<p style="padding:16px;color:var(--text-muted);text-align:center;">No topics found.</p>`;
        return;
      }

      items.slice(0, 25).forEach((item, idx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `btn ${idx === 0 ? "active" : ""}`;
        btn.style.textAlign = "left";
        btn.style.padding = "10px 14px";
        btn.style.display = "flex";
        btn.style.justifyContent = "space-between";
        btn.style.alignItems = "center";
        btn.innerHTML = `
          <div>
            <b>${item.id} ${item.title}</b>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${item.subject} · Chapter ${String(item.chNum).padStart(2, "0")} - ${item.chapter}</div>
          </div>
          <span style="font-size:12px;color:var(--accent);">Open →</span>
        `;
        btn.addEventListener("click", () => {
          closeSearch();
          location.hash = `#/subject/${encodeURIComponent(item.subject)}/${item.id}`;
        });
        results.appendChild(btn);
      });
    }

    input.addEventListener("input", doSearch);
    wrap.addEventListener("mousedown", (e) => {
      if (e.target === wrap) closeSearch();
    });
    wrap.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSearch();
      }
    });

    document.body.appendChild(wrap);
    searchWrap = wrap;
    input.focus();
    doSearch();
  }

  /* ---------- LaTeX Cheat Sheet (Phase 10F) ---------- */
  function openLatexCheatSheet() {
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.id = "latex-modal";
    wrap.innerHTML = `
      <div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="lcs-title" style="max-height:85vh;display:flex;flex-direction:column;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h2 id="lcs-title" style="margin:0;font-size:20px;">LaTeX Math Cheat Sheet</h2>
          <button type="button" class="btn" id="lcs-close">Close</button>
        </div>
        <input type="search" id="lcs-search" placeholder="Search LaTeX commands (e.g. fraction, matrix, alpha, integral)…" style="width:100%;min-height:38px;padding:8px 12px;background:#0a0a0d;border:1px solid var(--border);border-radius:8px;color:var(--text);font:inherit;" spellcheck="false" autocomplete="off" />
        <div id="lcs-body" style="flex:1;overflow-y:auto;margin-top:14px;padding-right:4px;"></div>
      </div>
    `;

    const body = wrap.querySelector("#lcs-body");
    const searchInput = wrap.querySelector("#lcs-search");

    function renderList() {
      const q = searchInput.value.trim().toLowerCase();
      body.replaceChildren();

      const groups = global.NotesMathData ? global.NotesMathData.GROUPS : [];
      groups.forEach((g) => {
        let syms = global.NotesMathData ? global.NotesMathData.byGroup(g) : [];
        if (q) {
          syms = syms.filter((s) => s.tex.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || (s.kw && s.kw.toLowerCase().includes(q)));
        }
        if (!syms.length) return;

        const sec = document.createElement("div");
        sec.style.marginBottom = "14px";
        sec.innerHTML = `<h3 style="margin:0 0 6px;font-size:12px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.05em;">${g}</h3>`;

        const grid = document.createElement("div");
        grid.style.display = "grid";
        grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(130px, 1fr))";
        grid.style.gap = "6px";

        syms.forEach((s) => {
          const item = document.createElement("div");
          item.style.padding = "6px 8px";
          item.style.background = "#0a0a0d";
          item.style.border = "1px solid var(--border)";
          item.style.borderRadius = "6px";
          item.style.fontSize = "13px";
          item.style.display = "flex";
          item.style.justifyContent = "space-between";
          item.style.alignItems = "center";
          item.innerHTML = `
            <span class="math math-inline">${s.tex.replace(/\{\}/g, "")}</span>
            <code style="font-size:11px;color:var(--text-muted);">${s.tex}</code>
          `;
          grid.appendChild(item);
        });

        sec.appendChild(grid);
        body.appendChild(sec);
      });

      if (global.NotesMath && global.NotesMath.render) global.NotesMath.render(body);
    }

    searchInput.addEventListener("input", renderList);
    wrap.querySelector("#lcs-close").addEventListener("click", () => wrap.remove());
    wrap.addEventListener("keydown", (e) => {
      if (e.key === "Escape") wrap.remove();
    });

    document.body.appendChild(wrap);
    renderList();
    searchInput.focus();
  }

  /* ---------- Global Keyboard Shortcuts for Search ---------- */
  document.addEventListener("keydown", (e) => {
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && (e.key === "p" || e.key === "P" || e.key === "k" || e.key === "K") && !e.shiftKey && !e.altKey) {
      // Don't override if inside other modals
      const openModal = document.getElementById("modal") || document.getElementById("search-modal");
      if (openModal && openModal.id === "search-modal") {
        e.preventDefault();
        closeSearch();
        return;
      }
      e.preventDefault();
      openSearch();
    }
  });

  /* Register with NotesShortcuts and NotesInsert */
  function init() {
    if (global.NotesShortcuts) {
      global.NotesShortcuts.register("Search & Reference", [
        { label: "Quick topic search", keys: "Mod+P or Mod+K", hint: "Search all subjects and topics" },
        { label: "LaTeX cheat sheet", keys: "Open from math", hint: "Comprehensive LaTeX math commands" },
      ]);
    }

    if (global.NotesInsert) {
      global.NotesInsert.register({
        id: "math-cheatsheet",
        label: "LaTeX cheat sheet…",
        hint: "\\tex",
        group: "Math",
        keywords: ["latex", "cheat", "sheet", "math", "help"],
        run: () => openLatexCheatSheet(),
      });
    }
  }

  if (document.readyState === "complete") init();
  else document.addEventListener("DOMContentLoaded", init);

  global.NotesSearch = {
    open: openSearch,
    close: closeSearch,
    openLatexCheatSheet,
  };
})(window);
