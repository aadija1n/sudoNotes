/* Phase 11: Interactive Table tools (grid picker, Google Docs style live table editor, row/column tools).
   window.NotesTable */

(function (global) {
  /* ---------- Markdown Table Helpers ---------- */
  function generateTable(rows, cols, align = "left") {
    const alignStr = align === "center" ? ":---:" : align === "right" ? "---:" : ":---";
    const headRow = "| " + Array.from({ length: cols }, (_, i) => `Header ${i + 1}`).join(" | ") + " |";
    const sepRow = "| " + Array.from({ length: cols }, () => alignStr).join(" | ") + " |";
    const dataRows = Array.from({ length: Math.max(1, rows - 1) }, (_, r) => {
      return "| " + Array.from({ length: cols }, (_, c) => `Cell ${r + 1}.${c + 1}`).join(" | ") + " |";
    });
    return [headRow, sepRow, ...dataRows].join("\n");
  }

  function parseTable(text) {
    if (!text || typeof text !== "string") return null;
    const lines = text.trim().split("\n");
    if (lines.length < 2) return null;
    // Must have a separator row with dashes and pipes
    if (!/^\s*\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?\s*$/.test(lines[1])) return null;

    const splitRow = (l) =>
      l
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());

    const headers = splitRow(lines[0]);
    if (!headers.length) return null;

    const sepCells = splitRow(lines[1]);
    const align = headers.map((_, i) => {
      const a = sepCells[i] || "";
      if (a.startsWith(":") && a.endsWith(":")) return "center";
      if (a.endsWith(":")) return "right";
      return "left";
    });

    const rows = lines.slice(2).map((l) => {
      const cells = splitRow(l);
      return Array.from({ length: headers.length }, (_, i) => cells[i] || "");
    });

    return { headers, align, rows };
  }

  function formatTable({ headers, align, rows }) {
    const cols = Math.max(1, headers.length);
    const sep = align.map((a) => (a === "center" ? ":---:" : a === "right" ? "---:" : ":---"));
    const h = "| " + headers.map((c) => c || " ").join(" | ") + " |";
    const s = "| " + sep.join(" | ") + " |";
    const r = rows.map((row) => {
      const cells = Array.from({ length: cols }, (_, i) => row[i] || "");
      return "| " + cells.map((c) => c || " ").join(" | ") + " |";
    });
    return [h, s, ...r].join("\n");
  }

  /* ---------- Visual Grid Picker Dialog with Dimension Lock ---------- */
  function openTableDialog(target) {
    if (!global.NotesInsert) return;

    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.id = "table-modal";
    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="tbl-title" style="width:360px;">
        <h2 id="tbl-title">Insert Table</h2>
        <p class="modal-sub">Click cell to lock dimensions, or use steppers:</p>
        
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin:12px 0 8px;">
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="font-size:12px;color:var(--text-muted);">Rows:</span>
            <button type="button" class="btn" id="tbl-row-dec" style="padding:2px 8px;min-height:26px;">-</button>
            <input type="number" id="tbl-row-val" value="3" min="1" max="12" style="width:40px;text-align:center;padding:2px 4px;background:#0a0a0d;border:1px solid var(--border);border-radius:4px;color:var(--text);font:inherit;" />
            <button type="button" class="btn" id="tbl-row-inc" style="padding:2px 8px;min-height:26px;">+</button>
          </div>
          <span style="color:var(--text-muted);font-weight:bold;">×</span>
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="font-size:12px;color:var(--text-muted);">Cols:</span>
            <button type="button" class="btn" id="tbl-col-dec" style="padding:2px 8px;min-height:26px;">-</button>
            <input type="number" id="tbl-col-val" value="3" min="1" max="12" style="width:40px;text-align:center;padding:2px 4px;background:#0a0a0d;border:1px solid var(--border);border-radius:4px;color:var(--text);font:inherit;" />
            <button type="button" class="btn" id="tbl-col-inc" style="padding:2px 8px;min-height:26px;">+</button>
          </div>
        </div>

        <div id="tbl-grid" style="display:grid;grid-template-columns:repeat(8, 24px);gap:4px;justify-content:center;margin:14px 0;cursor:pointer;"></div>
        <p id="tbl-label" style="text-align:center;font-weight:600;margin:0 0 16px;color:var(--accent);">3 × 3 Table</p>
        
        <div class="modal-actions">
          <button type="button" class="btn" id="tbl-cancel">Cancel</button>
          <button type="button" class="btn" id="tbl-visual-edit" title="Open Google Docs style visual table spreadsheet">Interactive Editor…</button>
          <button type="button" class="btn primary" id="tbl-insert">Insert Table</button>
        </div>
      </div>
    `;

    const grid = wrap.querySelector("#tbl-grid");
    const label = wrap.querySelector("#tbl-label");
    const rowInput = wrap.querySelector("#tbl-row-val");
    const colInput = wrap.querySelector("#tbl-col-val");

    let selRows = 3;
    let selCols = 3;
    let isLocked = false;

    for (let r = 1; r <= 8; r++) {
      for (let c = 1; c <= 8; c++) {
        const cell = document.createElement("div");
        cell.className = "tbl-cell";
        cell.dataset.r = r;
        cell.dataset.c = c;
        cell.style.width = "24px";
        cell.style.height = "24px";
        cell.style.border = "1px solid var(--border)";
        cell.style.borderRadius = "4px";
        cell.style.background = "#0a0a0d";
        grid.appendChild(cell);
      }
    }

    function renderSelection() {
      rowInput.value = selRows;
      colInput.value = selCols;
      label.innerHTML = `${selRows} × ${selCols} Table ${isLocked ? '<span style="color:#69db7c;font-size:12px;margin-left:6px;">🔒 Locked</span>' : '<span style="color:var(--text-muted);font-size:12px;margin-left:6px;">(Click cell to lock)</span>'}`;
      grid.querySelectorAll(".tbl-cell").forEach((el) => {
        const row = +el.dataset.r;
        const col = +el.dataset.c;
        const active = row <= selRows && col <= selCols;
        el.style.background = active ? (isLocked ? "rgba(105, 219, 124, 0.35)" : "rgba(138, 180, 255, 0.35)") : "#0a0a0d";
        el.style.borderColor = active ? (isLocked ? "#69db7c" : "var(--accent)") : "var(--border)";
      });
    }

    grid.addEventListener("mouseover", (e) => {
      if (isLocked) return; // Do not resize if locked by click!
      const cell = e.target.closest(".tbl-cell");
      if (cell) {
        selRows = +cell.dataset.r;
        selCols = +cell.dataset.c;
        renderSelection();
      }
    });

    grid.addEventListener("click", (e) => {
      const cell = e.target.closest(".tbl-cell");
      if (cell) {
        selRows = +cell.dataset.r;
        selCols = +cell.dataset.c;
        isLocked = true; // Mouse click locks dimension
        renderSelection();
      }
    });

    wrap.querySelector("#tbl-row-inc").addEventListener("click", () => {
      selRows = Math.min(12, selRows + 1);
      isLocked = true;
      renderSelection();
    });
    wrap.querySelector("#tbl-row-dec").addEventListener("click", () => {
      selRows = Math.max(1, selRows - 1);
      isLocked = true;
      renderSelection();
    });
    wrap.querySelector("#tbl-col-inc").addEventListener("click", () => {
      selCols = Math.min(12, selCols + 1);
      isLocked = true;
      renderSelection();
    });
    wrap.querySelector("#tbl-col-dec").addEventListener("click", () => {
      selCols = Math.max(1, selCols - 1);
      isLocked = true;
      renderSelection();
    });

    rowInput.addEventListener("change", () => {
      selRows = Math.max(1, Math.min(12, parseInt(rowInput.value, 10) || 3));
      isLocked = true;
      renderSelection();
    });
    colInput.addEventListener("change", () => {
      selCols = Math.max(1, Math.min(12, parseInt(colInput.value, 10) || 3));
      isLocked = true;
      renderSelection();
    });

    wrap.querySelector("#tbl-cancel").addEventListener("click", () => wrap.remove());

    wrap.querySelector("#tbl-visual-edit").addEventListener("click", () => {
      wrap.remove();
      const initialMd = generateTable(Math.max(2, selRows), Math.max(1, selCols));
      openTableEditorDialog(initialMd, (newMd) => {
        global.NotesInsert.put(newMd, {}, target);
      });
    });

    wrap.querySelector("#tbl-insert").addEventListener("click", () => {
      wrap.remove();
      const markdown = generateTable(Math.max(2, selRows), Math.max(1, selCols));
      global.NotesInsert.put(markdown, {}, target);
    });

    renderSelection();
    document.body.appendChild(wrap);
  }

  /* ---------- Google Docs-Style Interactive Live Table Editor Dialog ---------- */
  function openTableEditorDialog(initialMarkdown, onSave) {
    let parsed = parseTable(initialMarkdown);
    if (!parsed) {
      parsed = {
        headers: ["Header 1", "Header 2", "Header 3"],
        align: ["left", "left", "left"],
        rows: [
          ["Cell 1.1", "Cell 1.2", "Cell 1.3"],
          ["Cell 2.1", "Cell 2.2", "Cell 2.3"],
        ],
      };
    }

    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.id = "table-editor-modal";
    wrap.innerHTML = `
      <div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="te-title" style="max-width:760px;width:95vw;max-height:88vh;display:flex;flex-direction:column;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div>
            <h2 id="te-title" style="margin:0 0 4px;font-size:18px;">Visual Table Editor</h2>
            <p style="margin:0;font-size:12px;color:var(--text-muted);">Edit cells directly like Google Docs without writing Markdown</p>
          </div>
          <button type="button" class="btn" id="te-close-btn" style="padding:4px 10px;">✕</button>
        </div>

        <!-- Google Docs Toolbar -->
        <div class="te-toolbar" style="display:flex;flex-wrap:wrap;gap:6px;padding:8px;background:#15151a;border:1px solid var(--border);border-radius:8px;margin-bottom:12px;">
          <button type="button" class="btn" id="te-add-row" title="Add a new row at the bottom">+ Row</button>
          <button type="button" class="btn" id="te-del-row" title="Remove the last row">- Row</button>
          <div style="width:1px;height:24px;background:var(--border);margin:0 4px;"></div>
          <button type="button" class="btn" id="te-add-col" title="Add a new column at the right">+ Column</button>
          <button type="button" class="btn" id="te-del-col" title="Remove the last column">- Column</button>
          <div style="width:1px;height:24px;background:var(--border);margin:0 4px;"></div>
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="font-size:12px;color:var(--text-muted);">Align:</span>
            <button type="button" class="btn" id="te-align-left" title="Align Left">Left</button>
            <button type="button" class="btn" id="te-align-center" title="Align Center">Center</button>
            <button type="button" class="btn" id="te-align-right" title="Align Right">Right</button>
          </div>
        </div>

        <!-- Scrollable Table Container -->
        <div style="flex:1;overflow:auto;max-height:48vh;border:1px solid var(--border);border-radius:8px;background:#0d0d11;padding:8px;">
          <table id="te-table" style="width:100%;border-collapse:collapse;color:var(--text);font-size:14px;">
            <thead></thead>
            <tbody></tbody>
          </table>
        </div>

        <!-- Modal Actions -->
        <div class="modal-actions" style="margin-top:16px;">
          <button type="button" class="btn" id="te-cancel">Cancel</button>
          <button type="button" class="btn primary" id="te-save">Save Table</button>
        </div>
      </div>
    `;

    const thead = wrap.querySelector("thead");
    const tbody = wrap.querySelector("tbody");

    function renderTableDom() {
      thead.replaceChildren();
      tbody.replaceChildren();

      // Render headers
      const trHead = document.createElement("tr");
      trHead.style.background = "#1a1a24";
      parsed.headers.forEach((h, cIdx) => {
        const th = document.createElement("th");
        th.style.border = "1px solid var(--border)";
        th.style.padding = "6px 8px";
        th.style.textAlign = parsed.align[cIdx] || "left";
        th.style.fontWeight = "600";
        th.style.color = "var(--accent)";

        const input = document.createElement("input");
        input.value = h;
        input.style.width = "100%";
        input.style.background = "transparent";
        input.style.border = "none";
        input.style.color = "inherit";
        input.style.font = "inherit";
        input.style.fontWeight = "inherit";
        input.style.textAlign = "inherit";
        input.style.outline = "none";
        input.placeholder = `Header ${cIdx + 1}`;
        input.addEventListener("input", (e) => {
          parsed.headers[cIdx] = e.target.value;
        });

        th.appendChild(input);
        trHead.appendChild(th);
      });
      thead.appendChild(trHead);

      // Render data rows
      parsed.rows.forEach((row, rIdx) => {
        const tr = document.createElement("tr");
        tr.style.background = rIdx % 2 === 0 ? "transparent" : "rgba(255, 255, 255, 0.02)";
        parsed.headers.forEach((_, cIdx) => {
          const td = document.createElement("td");
          td.style.border = "1px solid var(--border)";
          td.style.padding = "6px 8px";
          td.style.textAlign = parsed.align[cIdx] || "left";

          const input = document.createElement("input");
          input.value = row[cIdx] || "";
          input.style.width = "100%";
          input.style.background = "transparent";
          input.style.border = "none";
          input.style.color = "inherit";
          input.style.font = "inherit";
          input.style.textAlign = "inherit";
          input.style.outline = "none";
          input.placeholder = "...";
          input.addEventListener("input", (e) => {
            parsed.rows[rIdx][cIdx] = e.target.value;
          });

          td.appendChild(input);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }

    // Toolbar handlers
    wrap.querySelector("#te-add-row").addEventListener("click", () => {
      const newRow = Array.from({ length: parsed.headers.length }, () => "");
      parsed.rows.push(newRow);
      renderTableDom();
    });

    wrap.querySelector("#te-del-row").addEventListener("click", () => {
      if (parsed.rows.length > 1) {
        parsed.rows.pop();
        renderTableDom();
      }
    });

    wrap.querySelector("#te-add-col").addEventListener("click", () => {
      parsed.headers.push(`Header ${parsed.headers.length + 1}`);
      parsed.align.push("left");
      parsed.rows.forEach((r) => r.push(""));
      renderTableDom();
    });

    wrap.querySelector("#te-del-col").addEventListener("click", () => {
      if (parsed.headers.length > 1) {
        parsed.headers.pop();
        parsed.align.pop();
        parsed.rows.forEach((r) => r.pop());
        renderTableDom();
      }
    });

    wrap.querySelector("#te-align-left").addEventListener("click", () => {
      parsed.align = parsed.align.map(() => "left");
      renderTableDom();
    });
    wrap.querySelector("#te-align-center").addEventListener("click", () => {
      parsed.align = parsed.align.map(() => "center");
      renderTableDom();
    });
    wrap.querySelector("#te-align-right").addEventListener("click", () => {
      parsed.align = parsed.align.map(() => "right");
      renderTableDom();
    });

    const close = () => wrap.remove();
    wrap.querySelector("#te-cancel").addEventListener("click", close);
    wrap.querySelector("#te-close-btn").addEventListener("click", close);

    wrap.querySelector("#te-save").addEventListener("click", () => {
      const newMarkdown = formatTable(parsed);
      close();
      if (onSave) onSave(newMarkdown);
    });

    renderTableDom();
    document.body.appendChild(wrap);
  }

  /* ---------- In-Place Table Decoration & Interactive Enhancements ---------- */
  function decorateRenderedTables(root, getBlockText, updateBlockText) {
    if (!root) return;
    root.querySelectorAll(".blk").forEach((blkWrap) => {
      const table = blkWrap.querySelector("table");
      if (!table || blkWrap.querySelector(".table-action-strip")) return;

      const strip = document.createElement("div");
      strip.className = "table-action-strip w-only";
      strip.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 6px;
        padding: 4px 8px;
        background: #15151a;
        border: 1px solid var(--border);
        border-radius: 6px;
        width: fit-content;
        font-size: 12px;
      `;

      strip.innerHTML = `
        <span style="font-weight:600;color:var(--accent);margin-right:4px;">📊 Table:</span>
        <button type="button" class="btn" data-act="visual" style="padding:2px 8px;font-size:12px;">Visual Editor</button>
        <button type="button" class="btn" data-act="add-row" style="padding:2px 8px;font-size:12px;">+ Row</button>
        <button type="button" class="btn" data-act="add-col" style="padding:2px 8px;font-size:12px;">+ Col</button>
      `;

      strip.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        e.stopPropagation();
        e.preventDefault();

        const act = btn.dataset.act;
        const currentText = getBlockText(blkWrap);
        let parsed = parseTable(currentText);
        if (!parsed) return;

        if (act === "visual") {
          openTableEditorDialog(currentText, (newText) => {
            updateBlockText(blkWrap, newText);
          });
        } else if (act === "add-row") {
          parsed.rows.push(Array.from({ length: parsed.headers.length }, () => ""));
          updateBlockText(blkWrap, formatTable(parsed));
        } else if (act === "add-col") {
          parsed.headers.push(`Header ${parsed.headers.length + 1}`);
          parsed.align.push("left");
          parsed.rows.forEach((r) => r.push(""));
          updateBlockText(blkWrap, formatTable(parsed));
        }
      });

      table.parentNode.insertBefore(strip, table);
    });
  }

  /* Register with NotesInsert */
  function init() {
    if (global.NotesInsert) {
      global.NotesInsert.register({
        id: "table",
        label: "Table…",
        hint: "|---|",
        group: "Blocks",
        keywords: ["table", "grid", "data", "columns", "spreadsheet"],
        run: (t) => openTableDialog(t),
      });

      global.NotesInsert.register({
        id: "table-visual",
        label: "Visual Table Editor…",
        hint: "Docs style",
        group: "Blocks",
        keywords: ["table", "docs", "visual", "editor", "spreadsheet"],
        run: (t) => {
          openTableEditorDialog(null, (md) => {
            global.NotesInsert.put(md, {}, t);
          });
        },
      });
    }
  }

  if (document.readyState === "complete") init();
  else document.addEventListener("DOMContentLoaded", init);

  global.NotesTable = {
    openDialog: openTableDialog,
    openEditor: openTableEditorDialog,
    decorateTables: decorateRenderedTables,
    generateTable,
    parseTable,
    formatTable,
  };
})(window);
