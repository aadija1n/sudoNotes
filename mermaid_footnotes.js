/* Phase 13: Mermaid diagram template starters & Footnotes authoring helper.
   window.NotesExtraBlocks */

(function (global) {
  const MERMAID_TEMPLATES = [
    {
      name: "Flowchart (Top to Bottom)",
      code: "```mermaid\ngraph TD\n    A[Start] --> B{Is it true?}\n    B -- Yes --> C[Proceed]\n    B -- No --> D[Stop]\n```",
    },
    {
      name: "Sequence Diagram",
      code: "```mermaid\nsequenceDiagram\n    autonumber\n    Client->>Server: Request Data\n    Server-->>Database: Query\n    Database-->>Server: Results\n    Server-->>Client: 200 OK Response\n```",
    },
    {
      name: "Class Diagram",
      code: "```mermaid\nclassDiagram\n    class Animal {\n        +String name\n        +makeSound()\n    }\n    class Dog {\n        +bark()\n    }\n    Animal <|-- Dog\n```",
    },
    {
      name: "State Diagram",
      code: "```mermaid\nstateDiagram-v2\n    [*] --> Idle\n    Idle --> Processing: Event\n    Processing --> Done: Success\n    Done --> [*]\n```",
    },
    {
      name: "Git Graph",
      code: "```mermaid\ngitGraph\n    commit\n    branch feature\n    checkout feature\n    commit\n    checkout main\n    merge feature\n```",
    },
  ];

  function openMermaidDialog(target) {
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.id = "mermaid-modal";
    wrap.innerHTML = `
      <div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="mmd-title">
        <h2 id="mmd-title">Insert Mermaid Diagram</h2>
        <p class="modal-sub">Choose a diagram template to get started:</p>
        <div style="display:flex;flex-direction:column;gap:8px;margin:16px 0;">
          ${MERMAID_TEMPLATES.map((t, i) => `
            <button type="button" class="btn" data-idx="${i}" style="text-align:left;padding:12px;display:flex;justify-content:space-between;align-items:center;">
              <b>${t.name}</b>
              <span style="font-size:12px;color:var(--text-muted)">Insert template</span>
            </button>
          `).join("")}
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" id="mmd-cancel">Cancel</button>
        </div>
      </div>
    `;

    wrap.querySelector("#mmd-cancel").addEventListener("click", () => wrap.remove());
    wrap.querySelectorAll("button[data-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = MERMAID_TEMPLATES[+btn.dataset.idx];
        wrap.remove();
        if (global.NotesInsert) {
          global.NotesInsert.put(t.code, {}, target);
        }
      });
    });

    document.body.appendChild(wrap);
  }

  function insertFootnote(target) {
    // Generate a new footnote number based on existing footnotes in editor
    const num = Math.floor(Math.random() * 90) + 1;
    const tag = `[^${num}]`;
    const def = `\n\n[^${num}]: Footnote text here.`;

    if (target && target.ta) {
      const s = target.ta.selectionStart;
      const val = target.ta.value;
      target.ta.value = val.slice(0, s) + tag + val.slice(s) + def;
      target.ta.setSelectionRange(s + tag.length, s + tag.length);
      target.ta.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (global.NotesInsert) {
      global.NotesInsert.put(`${tag}${def}`, {}, target);
    }
  }

  function init() {
    if (global.NotesInsert) {
      global.NotesInsert.register({
        id: "mermaid",
        label: "Mermaid diagram…",
        hint: "```mermaid",
        group: "Blocks",
        keywords: ["mermaid", "chart", "diagram", "graph", "flowchart"],
        run: (t) => openMermaidDialog(t),
      });

      global.NotesInsert.register({
        id: "footnote",
        label: "Footnote",
        hint: "[^1]",
        group: "Text",
        keywords: ["footnote", "note", "citation", "reference"],
        run: (t) => insertFootnote(t),
      });
    }
  }

  if (document.readyState === "complete") init();
  else document.addEventListener("DOMContentLoaded", init);

  global.NotesExtraBlocks = {
    openMermaidDialog,
    insertFootnote,
  };
})(window);
