/* Phase 11: Interactive Table tools (grid picker, markdown table generator, row/column buttons).
   window.NotesTable */

(function (global) {
  /* ---------- Markdown Table Generation ---------- */
  function generateTable(rows, cols, align = "left") {
    const alignStr = align === "center" ? ":---:" : align === "right" ? "---:" : ":---";
    const headRow = "| " + Array.from({ length: cols }, (_, i) => `Header ${i + 1}`).join(" | ") + " |";
    const sepRow = "| " + Array.from({ length: cols }, () => alignStr).join(" | ") + " |";
    const dataRows = Array.from({ length: rows - 1 }, (_, r) => {
      return "| " + Array.from({ length: cols }, (_, c) => `Cell ${r + 1}.${c + 1}`).join(" | ") + " |";
    });
    return [headRow, sepRow, ...dataRows].join("\n");
  }

  /* ---------- Visual Grid Picker Dialog ---------- */
  function openTableDialog(target) {
    if (!global.NotesInsert) return;

    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.id = "table-modal";
    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="tbl-title" style="width:340px;">
        <h2 id="tbl-title">Insert Table</h2>
        <p class="modal-sub">Select rows and columns:</p>
        <div id="tbl-grid" style="display:grid;grid-template-columns:repeat(8, 24px);gap:4px;justify-content:center;margin:16px 0;cursor:pointer;"></div>
        <p id="tbl-label" style="text-align:center;font-weight:600;margin:0 0 16px;color:var(--accent);">3 × 3 Table</p>
        <div class="modal-actions">
          <button type="button" class="btn" id="tbl-cancel">Cancel</button>
          <button type="button" class="btn primary" id="tbl-insert">Insert</button>
        </div>
      </div>
    `;

    const grid = wrap.querySelector("#tbl-grid");
    const label = wrap.querySelector("#tbl-label");
    let selRows = 3;
    let selCols = 3;

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

    function highlight(r, c) {
      selRows = r;
      selCols = c;
      label.textContent = `${r} × ${c} Table`;
      grid.querySelectorAll(".tbl-cell").forEach((el) => {
        const row = +el.dataset.r;
        const col = +el.dataset.c;
        const active = row <= r && col <= c;
        el.style.background = active ? "rgba(138, 180, 255, 0.35)" : "#0a0a0d";
        el.style.borderColor = active ? "var(--accent)" : "var(--border)";
      });
    }

    grid.addEventListener("mouseover", (e) => {
      const cell = e.target.closest(".tbl-cell");
      if (cell) highlight(+cell.dataset.r, +cell.dataset.c);
    });

    wrap.querySelector("#tbl-cancel").addEventListener("click", () => wrap.remove());
    wrap.querySelector("#tbl-insert").addEventListener("click", () => {
      wrap.remove();
      const markdown = generateTable(Math.max(2, selRows), Math.max(1, selCols));
      global.NotesInsert.put(markdown, {}, target);
    });

    highlight(3, 3);
    document.body.appendChild(wrap);
  }

  /* ---------- Table Manipulation inside Block Editor ---------- */
  function parseTable(text) {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return null;
    const splitRow = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    const headers = splitRow(lines[0]);
    const align = splitRow(lines[1]).map((a) => {
      if (a.startsWith(":") && a.endsWith(":")) return "center";
      if (a.endsWith(":")) return "right";
      return "left";
    });
    const rows = lines.slice(2).map(splitRow);
    return { headers, align, rows };
  }

  function formatTable({ headers, align, rows }) {
    const cols = headers.length;
    const sep = align.map((a) => (a === "center" ? ":---:" : a === "right" ? "---:" : ":---"));
    const h = "| " + headers.join(" | ") + " |";
    const s = "| " + sep.join(" | ") + " |";
    const r = rows.map((row) => {
      const cells = Array.from({ length: cols }, (_, i) => row[i] || "");
      return "| " + cells.join(" | ") + " |";
    });
    return [h, s, ...r].join("\n");
  }

  /* Register with NotesInsert */
  function init() {
    if (global.NotesInsert) {
      global.NotesInsert.register({
        id: "table",
        label: "Table…",
        hint: "|---|",
        group: "Blocks",
        keywords: ["table", "grid", "data", "columns"],
        run: (t) => openTableDialog(t),
      });
    }
  }

  if (document.readyState === "complete") init();
  else document.addEventListener("DOMContentLoaded", init);

  global.NotesTable = {
    openDialog: openTableDialog,
    generateTable,
    parseTable,
    formatTable,
  };
})(window);
