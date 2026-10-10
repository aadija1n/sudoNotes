/* Phase 10C: Math input suite (contextAt, insertCommand, auto-conversions, shortcuts,
   backslash suggestions, symbol palette, recents & favorites, and Tab template navigation).
   window.NotesMathInput, window.NotesMathPalette */

(function (global) {
  const isMac = /Mac|iPhone|iPad/i.test((navigator && navigator.platform) || "");
  const RECENT_KEY = "notes:math:recent";
  const FAV_KEY = "notes:math:fav";
  let memRecent = ["\\alpha", "\\beta", "\\le", "\\ge", "\\ne", "\\to", "\\infty", "\\sum", "\\int", "\\frac{}{}"];
  let memFav = ["\\alpha", "\\beta", "\\pi", "\\theta", "\\lambda", "\\infty", "\\le", "\\ge", "\\ne", "\\to"];

  function getStored(key, def) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "null");
      return Array.isArray(v) ? v : def;
    } catch {
      return def;
    }
  }
  function setStored(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* in-memory fallback */ }
  }

  function getRecents() { return getStored(RECENT_KEY, memRecent); }
  function getFavorites() { return getStored(FAV_KEY, memFav); }

  function recordRecent(tex) {
    const list = getRecents().filter((x) => x !== tex);
    list.unshift(tex);
    if (list.length > 16) list.pop();
    memRecent = list;
    setStored(RECENT_KEY, list);
  }

  function toggleFavorite(tex) {
    let list = getFavorites();
    if (list.includes(tex)) {
      list = list.filter((x) => x !== tex);
    } else {
      list = [tex, ...list].slice(0, 40);
    }
    memFav = list;
    setStored(FAV_KEY, list);
    return list.includes(tex);
  }

  /* ---------- 1. Math Context Detection ---------- */
  function contextAt(text, pos) {
    if (!text || pos < 0 || pos > text.length) return { inMath: false };

    // 1a. Check code fence ```math
    const fences = [...text.matchAll(/^ {0,3}```math\b/gim)];
    for (const f of fences) {
      const start = f.index + f[0].length;
      const endMatch = text.slice(start).match(/\n {0,3}```(?:\s|$)/);
      const end = endMatch ? start + endMatch.index : text.length;
      if (pos >= start && pos <= end) {
        return { inMath: true, display: true, type: "fence", start, end };
      }
    }

    // 1b. Check $$ ... $$ display math
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("$$", i);
      if (open === -1) break;
      const close = text.indexOf("$$", open + 2);
      if (close === -1) break;
      if (pos >= open + 2 && pos <= close) {
        return { inMath: true, display: true, type: "display", start: open + 2, end: close };
      }
      i = close + 2;
    }

    // 1c. Check $ ... $ inline math (excluding currency like $5 or escaped \$)
    i = 0;
    while (i < text.length) {
      const d = text.indexOf("$", i);
      if (d === -1) break;
      // Skip escaped \$ or double $$
      if ((d > 0 && text[d - 1] === "\\") || text[d + 1] === "$") {
        i = d + 1;
        continue;
      }
      // Opening must not be followed by whitespace
      if (/\s/.test(text[d + 1] || "")) {
        i = d + 1;
        continue;
      }
      // Find closing $
      let close = d + 1;
      let found = -1;
      while (close < text.length) {
        if (text[close] === "\n") break; // inline math does not cross newlines
        if (text[close] === "$" && text[close - 1] !== "\\") {
          // Closer must follow a non-space and not be followed by a digit ($5$10)
          if (!/\s/.test(text[close - 1]) && !/\d/.test(text[close + 1] || "")) {
            found = close;
            break;
          }
        }
        close++;
      }
      if (found !== -1) {
        if (pos >= d + 1 && pos <= found) {
          return { inMath: true, display: false, type: "inline", start: d + 1, end: found };
        }
        i = found + 1;
      } else {
        i = d + 1;
      }
    }

    return { inMath: false };
  }

  /* ---------- 2. Command Insertion & Caret Management ---------- */
  function replaceText(ta, start, end, text) {
    if (global.NotesFormat && global.NotesFormat.replace) {
      global.NotesFormat.replace(ta, start, end, text);
    } else {
      ta.setRangeText(text, start, end, "end");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function insertCommand(ta, tex, opts = {}) {
    if (!ta || ta.readOnly || ta.disabled) return false;
    recordRecent(tex);

    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const ctx = contextAt(ta.value, s);

    let ins = tex;
    // Auto-wrap with inline math $...$ if not already inside math (unless asked not to)
    if (!ctx.inMath && opts.wrap !== false) {
      ins = `$${tex}$`;
    }

    // Trailing space rule: if ends with a letter and next char is letter
    const nextChar = ta.value[e] || "";
    if (/[a-zA-Z]$/.test(ins) && /[a-zA-Z]/.test(nextChar)) {
      ins += " ";
    }

    // Caret placement: if tex contains "{}", put caret inside the first "{}"
    const hole = ins.indexOf("{}");
    if (hole !== -1) {
      const selectedText = s !== e ? ta.value.slice(s, e) : "";
      if (selectedText) {
        // fill selection into the hole
        ins = ins.slice(0, hole + 1) + selectedText + ins.slice(hole + 1);
        replaceText(ta, s, e, ins);
        const p = s + hole + 1 + selectedText.length;
        ta.setSelectionRange(p, p);
      } else {
        replaceText(ta, s, e, ins);
        const p = s + hole + 1;
        ta.setSelectionRange(p, p);
      }
    } else {
      replaceText(ta, s, e, ins);
      const p = s + ins.length;
      ta.setSelectionRange(p, p);
    }
    ta.focus();
    return true;
  }

  /* ---------- 3. Tab Jump Between Template Fields (Phase 10D1) ---------- */
  function handleTabJump(e, ta) {
    if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return false;
    const pos = ta.selectionStart;
    const ctx = contextAt(ta.value, pos);
    if (!ctx.inMath) return false;

    const val = ta.value;
    const forward = !e.shiftKey;

    // Search for empty "{}" or "{placeholder}" within the math boundary
    const startBound = ctx.start;
    const endBound = ctx.end;
    const mathSub = val.slice(startBound, endBound);

    const re = /\{([^}]*)\}/g;
    let match;
    const matches = [];
    while ((match = re.exec(mathSub)) !== null) {
      const fieldStart = startBound + match.index + 1;
      const fieldEnd = fieldStart + match[1].length;
      matches.push({ start: fieldStart, end: fieldEnd });
    }

    if (!matches.length) return false;

    let target = null;
    if (forward) {
      target = matches.find((m) => m.start > pos);
      if (!target && matches.length) target = matches[0];
    } else {
      for (let i = matches.length - 1; i >= 0; i--) {
        if (matches[i].start < pos - 1) {
          target = matches[i];
          break;
        }
      }
      if (!target && matches.length) target = matches[matches.length - 1];
    }

    if (target) {
      e.preventDefault();
      e.stopPropagation();
      ta.setSelectionRange(target.start, target.end);
      return true;
    }
    return false;
  }

  /* ---------- 4. Plain-text Auto-Conversions inside Math ---------- */
  const CONVERSIONS = [
    { from: "->", to: "\\to " },
    { from: "<=", to: "\\le " },
    { from: ">=", to: "\\ge " },
    { from: "!=", to: "\\ne " },
    { from: "...", to: "\\dots " },
    { from: "inf", to: "\\infty " },
    { from: "~=", to: "\\approx " },
    { from: "=>", to: "\\Rightarrow " },
    { from: "<=", to: "\\Leftarrow " },
  ];

  function tryAutoConvert(ta) {
    const pos = ta.selectionStart;
    if (pos !== ta.selectionEnd) return false;
    const ctx = contextAt(ta.value, pos);
    if (!ctx.inMath) return false;

    const sub = ta.value.slice(Math.max(ctx.start, pos - 5), pos);
    for (const c of CONVERSIONS) {
      if (sub.endsWith(c.from)) {
        const replaceStart = pos - c.from.length;
        // ensure not prefixed with backslash already
        if (replaceStart > 0 && ta.value[replaceStart - 1] === "\\") continue;
        // replace with LaTeX command
        replaceText(ta, replaceStart, pos, c.to);
        const p = replaceStart + c.to.length;
        ta.setSelectionRange(p, p);
        return true;
      }
    }
    return false;
  }

  /* ---------- 5. Backslash Suggestions Dropdown (Phase 10C2) ---------- */
  let suggestBox = null;
  let suggestTa = null;
  let suggestIndex = 0;
  let suggestMatches = [];
  let suggestSlashPos = -1;

  function closeSuggestions() {
    if (suggestBox) {
      suggestBox.remove();
      suggestBox = null;
    }
    suggestTa = null;
    suggestMatches = [];
    suggestSlashPos = -1;
  }

  function renderSuggestions() {
    if (!suggestBox) return;
    suggestBox.replaceChildren();
    suggestMatches.forEach((sym, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.tabIndex = -1;
      btn.className = `math-suggest-item ${i === suggestIndex ? "active" : ""}`;
      btn.innerHTML = `<span>${sym.tex}</span><span class="math-suggest-preview">${sym.name}</span>`;
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => {
        applySuggestion(i);
      });
      suggestBox.appendChild(btn);
    });
  }

  function applySuggestion(index) {
    if (!suggestTa || index < 0 || index >= suggestMatches.length) return;
    const sym = suggestMatches[index];
    const pos = suggestTa.selectionStart;
    const start = suggestSlashPos;
    closeSuggestions();
    insertCommand(suggestTa, sym.tex, { wrap: false });
  }

  function checkSuggestions(ta) {
    const pos = ta.selectionStart;
    if (pos !== ta.selectionEnd) { closeSuggestions(); return; }
    const ctx = contextAt(ta.value, pos);
    if (!ctx.inMath) { closeSuggestions(); return; }

    const lineStart = ta.value.lastIndexOf("\n", pos - 1) + 1;
    const textBefore = ta.value.slice(lineStart, pos);
    const m = /\\[a-zA-Z]{1,12}$/.exec(textBefore);

    if (!m) { closeSuggestions(); return; }

    const slashIndex = pos - m[0].length;
    const query = m[0].slice(1).toLowerCase();
    const data = global.NotesMathData ? global.NotesMathData.SYMBOLS : [];

    const matches = data.filter((s) => s.tex.startsWith("\\" + query) || s.name.toLowerCase().startsWith(query)).slice(0, 7);
    if (!matches.length) { closeSuggestions(); return; }

    suggestTa = ta;
    suggestSlashPos = slashIndex;
    suggestMatches = matches;
    suggestIndex = 0;

    if (!suggestBox) {
      suggestBox = document.createElement("div");
      suggestBox.className = "math-suggest";
      suggestBox.setAttribute("data-keep-edit", "true");
      suggestBox.setAttribute("role", "listbox");
      document.body.appendChild(suggestBox);
    }

    const r = ta.getBoundingClientRect();
    suggestBox.style.left = `${Math.min(r.left + 20, window.innerWidth - 250)}px`;
    suggestBox.style.top = `${Math.min(r.bottom + 4, window.innerHeight - 200)}px`;
    renderSuggestions();
  }

  /* ---------- 6. Symbol Palette Popover (Phase 10C3 & 10C4) ---------- */
  let paletteEl = null;
  let paletteTargetTa = null;

  function closePalette() {
    if (paletteEl) {
      paletteEl.remove();
      paletteEl = null;
    }
  }

  function openPalette(ta) {
    closePalette();
    paletteTargetTa = ta || (document.activeElement && document.activeElement.tagName === "TEXTAREA" ? document.activeElement : null);

    const wrap = document.createElement("div");
    wrap.className = "math-palette";
    wrap.setAttribute("data-keep-edit", "true");
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "Math symbols palette");

    wrap.innerHTML = `
      <div class="math-palette-head">
        <input type="search" class="math-palette-search" placeholder="Search math symbols (e.g. alpha, le, sum, matrix)…" aria-label="Search symbols" spellcheck="false" autocomplete="off" />
        <button type="button" class="math-palette-close" aria-label="Close palette">✕</button>
      </div>
      <div class="math-palette-chips">
        <button type="button" class="math-chip active" data-group="All">All</button>
        <button type="button" class="math-chip" data-group="Recents">Recents</button>
        <button type="button" class="math-chip" data-group="Favorites">★ Favorites</button>
        ${(global.NotesMathData ? global.NotesMathData.GROUPS : []).map((g) => `<button type="button" class="math-chip" data-group="${g}">${g}</button>`).join("")}
      </div>
      <div class="math-palette-body"></div>
    `;

    const body = wrap.querySelector(".math-palette-body");
    const searchInput = wrap.querySelector(".math-palette-search");
    const chips = wrap.querySelectorAll(".math-chip");

    let activeGroup = "All";

    function renderGrid() {
      const q = searchInput.value.trim().toLowerCase();
      body.replaceChildren();

      let symbols = global.NotesMathData ? global.NotesMathData.SYMBOLS : [];

      if (activeGroup === "Recents") {
        const rec = getRecents();
        symbols = rec.map((t) => global.NotesMathData ? global.NotesMathData.find(t) || { tex: t, name: t, group: "Recents" } : { tex: t, name: t });
      } else if (activeGroup === "Favorites") {
        const fav = getFavorites();
        symbols = fav.map((t) => global.NotesMathData ? global.NotesMathData.find(t) || { tex: t, name: t, group: "Favorites" } : { tex: t, name: t });
      } else if (activeGroup !== "All") {
        symbols = symbols.filter((s) => s.group === activeGroup);
      }

      if (q) {
        symbols = symbols.filter((s) => s.tex.toLowerCase().includes(q) || (s.name && s.name.toLowerCase().includes(q)) || (s.kw && s.kw.toLowerCase().includes(q)));
      }

      if (!symbols.length) {
        body.innerHTML = `<p style="padding:24px;text-align:center;color:var(--text-muted)">No symbols found.</p>`;
        return;
      }

      const favs = new Set(getFavorites());
      const grid = document.createElement("div");
      grid.className = "math-symbol-grid";

      symbols.forEach((sym) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `math-sym-btn ${favs.has(sym.tex) ? "is-fav" : ""}`;
        b.title = `${sym.tex} (${sym.name})`;
        b.setAttribute("aria-label", sym.name || sym.tex);

        // Render with KaTeX or fallback
        const preview = document.createElement("span");
        preview.className = "math math-inline";
        preview.textContent = sym.tex.replace(/\{\}/g, "");
        b.appendChild(preview);

        const star = document.createElement("button");
        star.type = "button";
        star.className = "star-btn";
        star.textContent = favs.has(sym.tex) ? "★" : "☆";
        star.title = "Toggle favorite (F)";
        star.addEventListener("click", (e) => {
          e.stopPropagation();
          const on = toggleFavorite(sym.tex);
          star.textContent = on ? "★" : "☆";
          b.classList.toggle("is-fav", on);
        });
        b.appendChild(star);

        b.addEventListener("mousedown", (e) => e.preventDefault());
        b.addEventListener("click", (e) => {
          e.preventDefault();
          if (paletteTargetTa) {
            insertCommand(paletteTargetTa, sym.tex);
            paletteTargetTa.focus();
          }
        });
        grid.appendChild(b);
      });

      body.appendChild(grid);
      if (global.NotesMath && global.NotesMath.render) global.NotesMath.render(body);
    }

    searchInput.addEventListener("input", renderGrid);
    chips.forEach((c) => {
      c.addEventListener("click", () => {
        chips.forEach((x) => x.classList.remove("active"));
        c.classList.add("active");
        activeGroup = c.dataset.group;
        renderGrid();
      });
    });

    wrap.querySelector(".math-palette-close").addEventListener("click", closePalette);
    wrap.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closePalette();
      }
    });

    // Position palette smart docked to the side so edited text is ALWAYS visible
    const vpW = window.innerWidth, vpH = window.innerHeight;
    const r = paletteTargetTa ? paletteTargetTa.getBoundingClientRect() : null;
    if (r && vpW > 920) {
      if (r.right + 390 <= vpW - 16) {
        wrap.style.left = `${Math.max(16, r.right + 16)}px`;
        wrap.style.right = "auto";
      } else if (r.left - 390 >= 16) {
        wrap.style.left = `${Math.max(16, r.left - 396)}px`;
        wrap.style.right = "auto";
      } else {
        wrap.style.right = "16px";
        wrap.style.left = "auto";
      }
      wrap.style.top = `${Math.max(64, Math.min(r.top, vpH - 520))}px`;
      wrap.style.bottom = "auto";
      wrap.style.transform = "none";
      wrap.style.width = "380px";
      wrap.style.maxHeight = `${Math.min(560, vpH - 80)}px`;
    } else if (vpW > 720) {
      wrap.style.top = "64px";
      wrap.style.right = "16px";
      wrap.style.left = "auto";
      wrap.style.bottom = "auto";
      wrap.style.transform = "none";
      wrap.style.width = "360px";
      wrap.style.maxHeight = `${vpH - 80}px`;
    } else {
      wrap.style.bottom = "10px";
      wrap.style.left = "10px";
      wrap.style.right = "10px";
      wrap.style.top = "auto";
      wrap.style.transform = "none";
      wrap.style.width = "auto";
      wrap.style.maxHeight = "46vh";
    }

    document.body.appendChild(wrap);
    paletteEl = wrap;
    renderGrid();
    searchInput.focus();
  }

  /* ---------- 7. Formula Editor Popover (Phase 10E) ---------- */
  function openFormulaEditor(initialTex = "", onSave) {
    closePalette();
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.id = "math-popover";
    wrap.innerHTML = `
      <div class="formula-editor-modal" role="dialog" aria-modal="true" aria-labelledby="fe-title" data-keep-edit="true">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h2 id="fe-title" style="margin:0;font-size:18px;">Edit Math Formula</h2>
          <button type="button" class="btn" id="fe-pal-btn">Symbols Palette</button>
        </div>
        <div class="formula-editor-preview"><span class="math math-display" id="fe-preview"></span></div>
        <textarea class="formula-editor-ta" spellcheck="false" placeholder="Type LaTeX formula (e.g. \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a})"></textarea>
        <p class="form-error" id="fe-err" role="alert" style="margin:0;"></p>
        <div class="modal-actions" style="margin:0;">
          <button type="button" class="btn" id="fe-cancel">Cancel</button>
          <button type="button" class="btn primary" id="fe-done">Apply Formula</button>
        </div>
      </div>
    `;

    const ta = wrap.querySelector(".formula-editor-ta");
    const preview = wrap.querySelector("#fe-preview");
    const err = wrap.querySelector("#fe-err");
    ta.value = initialTex;

    function updatePreview() {
      const tex = ta.value.trim();
      preview.textContent = tex || "$$ $$";
      delete preview.dataset.done;
      preview.className = "math math-display";
      err.textContent = "";
      if (global.NotesMath && global.NotesMath.render) {
        global.NotesMath.render(wrap);
      }
    }

    ta.addEventListener("input", updatePreview);
    wrap.querySelector("#fe-pal-btn").addEventListener("click", () => openPalette(ta));
    wrap.querySelector("#fe-cancel").addEventListener("click", () => wrap.remove());
    wrap.querySelector("#fe-done").addEventListener("click", () => {
      const val = ta.value.trim();
      wrap.remove();
      if (onSave) onSave(val);
    });

    document.body.appendChild(wrap);
    updatePreview();
    ta.focus();
  }

  /* ---------- 7b. Variable Length Matrix Dialog (Custom Dimensions & Live Preview) ---------- */
  function openMatrixDialog(target) {
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.id = "matrix-modal";
    wrap.innerHTML = `
      <div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="mat-title" style="max-width:540px;width:94vw;">
        <h2 id="mat-title" style="margin:0 0 4px;font-size:18px;">Insert Matrix</h2>
        <p style="margin:0 0 14px;font-size:12px;color:var(--text-muted);">Choose variable dimensions, bracket style, and edit cell values:</p>

        <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;padding:8px 12px;background:#15151a;border:1px solid var(--border);border-radius:8px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:12px;color:var(--text-muted);">Rows:</span>
            <button type="button" class="btn" id="mat-row-dec" style="padding:2px 8px;min-height:26px;">-</button>
            <input type="number" id="mat-rows" value="3" min="1" max="8" style="width:38px;text-align:center;padding:2px 4px;background:#0a0a0d;border:1px solid var(--border);border-radius:4px;color:var(--text);font:inherit;" />
            <button type="button" class="btn" id="mat-row-inc" style="padding:2px 8px;min-height:26px;">+</button>
          </div>
          <span style="color:var(--text-muted);font-weight:bold;">×</span>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:12px;color:var(--text-muted);">Cols:</span>
            <button type="button" class="btn" id="mat-col-dec" style="padding:2px 8px;min-height:26px;">-</button>
            <input type="number" id="mat-cols" value="3" min="1" max="8" style="width:38px;text-align:center;padding:2px 4px;background:#0a0a0d;border:1px solid var(--border);border-radius:4px;color:var(--text);font:inherit;" />
            <button type="button" class="btn" id="mat-col-inc" style="padding:2px 8px;min-height:26px;">+</button>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:12px;color:var(--text-muted);">Type:</span>
            <select id="mat-type" style="padding:3px 6px;background:#0a0a0d;border:1px solid var(--border);border-radius:4px;color:var(--text);font:inherit;font-size:12px;">
              <option value="pmatrix">Parentheses ( )</option>
              <option value="bmatrix">Brackets [ ]</option>
              <option value="vmatrix">Determinant | |</option>
              <option value="Bmatrix">Braces { }</option>
              <option value="matrix">Plain (no bracket)</option>
            </select>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px;">Matrix Values:</div>
            <div id="mat-cells-grid" style="display:grid;gap:6px;max-height:180px;overflow-y:auto;padding:8px;background:#0d0d11;border:1px solid var(--border);border-radius:8px;"></div>
          </div>
          <div>
            <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px;">KaTeX Live Preview:</div>
            <div id="mat-preview-box" style="padding:12px;background:#15151a;border:1px solid var(--border);border-radius:8px;min-height:50px;text-align:center;overflow-x:auto;">
              <span class="math math-display" id="mat-preview"></span>
            </div>
          </div>
        </div>

        <div class="modal-actions" style="margin-top:16px;">
          <button type="button" class="btn" id="mat-cancel">Cancel</button>
          <button type="button" class="btn primary" id="mat-insert">Insert Matrix</button>
        </div>
      </div>
    `;

    let rows = 3;
    let cols = 3;
    let env = "pmatrix";
    let cellValues = {};

    const grid = wrap.querySelector("#mat-cells-grid");
    const preview = wrap.querySelector("#mat-preview");
    const previewBox = wrap.querySelector("#mat-preview-box");
    const rowIn = wrap.querySelector("#mat-rows");
    const colIn = wrap.querySelector("#mat-cols");
    const typeSelect = wrap.querySelector("#mat-type");

    function generateMatrixTex() {
      const rowStrings = [];
      for (let r = 0; r < rows; r++) {
        const rowCells = [];
        for (let c = 0; c < cols; c++) {
          const key = `${r}_${c}`;
          const val = (cellValues[key] || "").trim() || `${String.fromCharCode(97 + r)}${c + 1}`;
          rowCells.push(val);
        }
        rowStrings.push(rowCells.join(" & "));
      }
      return `$$\n\\begin{${env}}\n${rowStrings.join(" \\\\\n")}\n\\end{${env}}\n$$`;
    }

    function updatePreview() {
      const tex = generateMatrixTex();
      preview.textContent = tex;
      delete preview.dataset.done;
      preview.className = "math math-display";
      if (global.NotesMath && global.NotesMath.render) {
        global.NotesMath.render(previewBox);
      }
    }

    function renderCellsGrid() {
      grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      grid.replaceChildren();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const key = `${r}_${c}`;
          const inp = document.createElement("input");
          inp.type = "text";
          inp.value = cellValues[key] || "";
          inp.placeholder = `${String.fromCharCode(97 + r)}${c + 1}`;
          inp.style.cssText = "width:100%;text-align:center;padding:4px;background:#17171f;border:1px solid var(--border);border-radius:4px;color:var(--text);font:inherit;font-size:13px;";
          inp.addEventListener("input", (e) => {
            cellValues[key] = e.target.value;
            updatePreview();
          });
          grid.appendChild(inp);
        }
      }
      updatePreview();
    }

    wrap.querySelector("#mat-row-inc").addEventListener("click", () => {
      rows = Math.min(8, rows + 1);
      rowIn.value = rows;
      renderCellsGrid();
    });
    wrap.querySelector("#mat-row-dec").addEventListener("click", () => {
      rows = Math.max(1, rows - 1);
      rowIn.value = rows;
      renderCellsGrid();
    });
    wrap.querySelector("#mat-col-inc").addEventListener("click", () => {
      cols = Math.min(8, cols + 1);
      colIn.value = cols;
      renderCellsGrid();
    });
    wrap.querySelector("#mat-col-dec").addEventListener("click", () => {
      cols = Math.max(1, cols - 1);
      colIn.value = cols;
      renderCellsGrid();
    });

    rowIn.addEventListener("change", () => {
      rows = Math.max(1, Math.min(8, parseInt(rowIn.value, 10) || 3));
      renderCellsGrid();
    });
    colIn.addEventListener("change", () => {
      cols = Math.max(1, Math.min(8, parseInt(colIn.value, 10) || 3));
      renderCellsGrid();
    });
    typeSelect.addEventListener("change", () => {
      env = typeSelect.value;
      updatePreview();
    });

    wrap.querySelector("#mat-cancel").addEventListener("click", () => wrap.remove());
    wrap.querySelector("#mat-insert").addEventListener("click", () => {
      const tex = generateMatrixTex();
      wrap.remove();
      if (global.NotesInsert) {
        global.NotesInsert.put(tex, {}, target);
      }
    });

    document.body.appendChild(wrap);
    renderCellsGrid();
  }

  /* ---------- 8. Click on Rendered Math to Edit (Phase 10E) ---------- */
  document.addEventListener("click", (e) => {
    if (!document.body.classList.contains("write")) return;
    const mathEl = e.target.closest && e.target.closest(".math");
    if (!mathEl || mathEl.closest(".formula-editor-modal") || mathEl.closest(".math-palette")) return;

    // Check if inside note
    const noteBody = mathEl.closest("#note-body");
    if (!noteBody) return;

    const rawTex = mathEl.dataset.tex || mathEl.textContent.trim();
    if (rawTex) {
      e.preventDefault();
      e.stopPropagation();
      openFormulaEditor(rawTex, (newTex) => {
        // If note editor is open, update
        if (global.NotesEditor && global.NotesEditor.isOpen()) {
          const ta = document.querySelector(".blk-ta") || document.querySelector(".editor-ta");
          if (ta) insertCommand(ta, newTex);
        } else {
          // Open editor for topic
          const editBtn = document.getElementById("edit-note");
          if (editBtn) editBtn.click();
        }
      });
    }
  });

  /* ---------- 9. Attach Keydown/Input Listeners to Textareas ---------- */
  function attach(ta) {
    if (!ta || ta._mathAttached) return;
    ta._mathAttached = true;

    ta.addEventListener("input", () => {
      tryAutoConvert(ta);
      checkSuggestions(ta);
    });

    ta.addEventListener("keydown", (e) => {
      // Check suggestions navigation first
      if (suggestBox && suggestMatches.length) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          suggestIndex = (suggestIndex + 1) % suggestMatches.length;
          renderSuggestions();
          return;
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          suggestIndex = (suggestIndex - 1 + suggestMatches.length) % suggestMatches.length;
          renderSuggestions();
          return;
        } else if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          applySuggestion(suggestIndex);
          return;
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          closeSuggestions();
          return;
        }
      }

      // Tab jump between template placeholders
      if (handleTabJump(e, ta)) return;

      // Global math shortcuts
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && !e.altKey) {
        if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) {
            // Block math $$ ... $$
            const s = ta.selectionStart, en = ta.selectionEnd;
            const sel = ta.value.slice(s, en);
            const ins = sel ? `$$\n${sel}\n$$` : `$$\n\n$$`;
            replaceText(ta, s, en, ins);
            const p = sel ? s + ins.length : s + 3;
            ta.setSelectionRange(p, p);
          } else {
            // Inline math $...$
            const s = ta.selectionStart, en = ta.selectionEnd;
            const sel = ta.value.slice(s, en);
            const ins = sel ? `$${sel}$` : `$ $`;
            replaceText(ta, s, en, ins);
            const p = sel ? s + ins.length : s + 1;
            ta.setSelectionRange(p, p);
          }
          return;
        }
      } else if (mod && e.altKey && (e.key === "m" || e.key === "M")) {
        // Ctrl+Alt+M: open symbol palette
        e.preventDefault();
        e.stopPropagation();
        openPalette(ta);
      }
    });

    ta.addEventListener("blur", () => {
      setTimeout(() => {
        if (!suggestBox || !suggestBox.contains(document.activeElement)) closeSuggestions();
      }, 150);
    });
  }

  // Delegated capture listener for all editor textareas
  document.addEventListener("focusin", (e) => {
    if (e.target && e.target.tagName === "TEXTAREA") {
      attach(e.target);
    }
  }, true);

  /* ---------- 10. Register into NotesInsert & NotesShortcuts ---------- */
  function regItems() {
    if (!global.NotesInsert) return;

    global.NotesInsert.register({
      id: "math",
      label: "Math formula ($$)",
      hint: "$$",
      group: "Math",
      keywords: ["math", "latex", "formula", "equation"],
      run: (t) => global.NotesInsert.put("$$\n\n$$", { caret: 3 }, t),
    });

    global.NotesInsert.register({
      id: "math-inline",
      label: "Inline formula ($)",
      hint: "$",
      group: "Math",
      keywords: ["math", "inline", "formula"],
      run: (t) => global.NotesInsert.put("$ $", { caret: 1 }, t),
    });

    global.NotesInsert.register({
      id: "math-palette",
      label: "Math symbols palette…",
      hint: "Ctrl+Alt+M",
      group: "Math",
      keywords: ["symbols", "greek", "palette", "latex"],
      run: (t) => openPalette(t && t.ta ? t.ta : null),
    });

    // Fill-in templates (10D1 & 10D2)
    global.NotesInsert.register({
      id: "math-frac",
      label: "Fraction (\\frac)",
      hint: "\\frac{}{}",
      group: "Math Templates",
      keywords: ["fraction", "frac", "divide"],
      run: (t) => global.NotesInsert.put("$\\frac{}{}$", { caret: 7 }, t),
    });

    global.NotesInsert.register({
      id: "math-sqrt",
      label: "Square root (\\sqrt)",
      hint: "\\sqrt{}",
      group: "Math Templates",
      keywords: ["sqrt", "root", "radical"],
      run: (t) => global.NotesInsert.put("$\\sqrt{}$", { caret: 7 }, t),
    });

    global.NotesInsert.register({
      id: "math-sum",
      label: "Summation (\\sum)",
      hint: "\\sum_{i=1}^{n}",
      group: "Math Templates",
      keywords: ["sum", "series", "sigma"],
      run: (t) => global.NotesInsert.put("$\\sum_{i=1}^{n} {}$", { caret: 15 }, t),
    });

    global.NotesInsert.register({
      id: "math-int",
      label: "Integral (\\int)",
      hint: "\\int_{a}^{b}",
      group: "Math Templates",
      keywords: ["integral", "integrate", "calculus"],
      run: (t) => global.NotesInsert.put("$\\int_{a}^{b} {} \\, dx$", { caret: 15 }, t),
    });

    global.NotesInsert.register({
      id: "math-matrix",
      label: "Matrix (Custom / Variable)",
      hint: "pmatrix, bmatrix…",
      group: "Math Templates",
      keywords: ["matrix", "array", "determinant", "linear algebra"],
      run: (t) => openMatrixDialog(t),
    });

    global.NotesInsert.register({
      id: "math-cases",
      label: "Cases / Piecewise",
      hint: "cases",
      group: "Math Templates",
      keywords: ["cases", "piecewise", "system"],
      run: (t) => global.NotesInsert.put("$$\nf(x) = \\begin{cases}\n1, & \\text{if } x \\ge 0 \\\\\n0, & \\text{otherwise}\n\\end{cases}\n$$", { caret: 25 }, t),
    });
  }

  function regShortcuts() {
    if (!global.NotesShortcuts) return;
    global.NotesShortcuts.register("Math", [
      { label: "Inline formula ($)", keys: "Ctrl+M", hint: "$x^2$" },
      { label: "Display formula ($$)", keys: "Ctrl+Shift+M", hint: "$$ ... $$" },
      { label: "Symbol palette", keys: "Ctrl+Alt+M", hint: "Searchable KaTeX symbol picker" },
      { label: "Type-to-convert", keys: "-> <= != inf", hint: "Auto-converts inside math" },
      { label: "Jump between fields", keys: "Tab", hint: "Jumps between {} template slots" },
    ]);
  }

  if (document.readyState === "complete") {
    regItems(); regShortcuts();
  } else {
    document.addEventListener("DOMContentLoaded", () => { regItems(); regShortcuts(); });
  }

  global.NotesMathInput = {
    contextAt,
    insertCommand,
    attach,
    recordRecent,
    getRecents,
    getFavorites,
    toggleFavorite,
    openPalette,
    openFormulaEditor,
  };
  global.NotesMathPalette = {
    open: openPalette,
    close: closePalette,
  };
})(window);
