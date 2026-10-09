/* Phase 14: Q&A custom study block (Question, Options, collapsible Answer details in blockquote).
   window.NotesQA */

(function (global) {
  function formatQABlock(question, options, answer) {
    const lines = [];
    lines.push(`> **Question:** ${question.trim()}`);
    lines.push(`>`);

    if (options && options.trim()) {
      const opts = options.trim().split("\n").filter((l) => l.trim());
      opts.forEach((opt) => {
        lines.push(`> - ${opt.trim().replace(/^[-*•]\s*/, "")}`);
      });
      lines.push(`>`);
    }

    lines.push(`> <details>`);
    lines.push(`> <summary>Show Answer</summary>`);
    lines.push(`>`);
    lines.push(`> **Answer:** ${answer.trim()}`);
    lines.push(`> </details>`);

    return lines.join("\n");
  }

  function openQADialog(target) {
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.id = "qa-modal";
    wrap.innerHTML = `
      <form class="modal wide" role="dialog" aria-modal="true" aria-labelledby="qa-title" autocomplete="off">
        <h2 id="qa-title">Insert Q&A Study Block</h2>
        <label class="field">
          <span>Question</span>
          <textarea name="question" placeholder="e.g. What is the time complexity of QuickSort?" style="width:100%;min-height:60px;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font:inherit;resize:vertical;" required></textarea>
        </label>
        <label class="field">
          <span>Options (Optional, one per line)</span>
          <textarea name="options" placeholder="A) O(n log n) average&#10;B) O(n^2) worst case&#10;C) O(1)" style="width:100%;min-height:60px;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font:inherit;resize:vertical;"></textarea>
        </label>
        <label class="field">
          <span>Answer (hidden until revealed)</span>
          <textarea name="answer" placeholder="e.g. Average: O(n log n), Worst case: O(n^2)" style="width:100%;min-height:60px;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font:inherit;resize:vertical;" required></textarea>
        </label>
        <p class="form-error" role="alert"></p>
        <div class="modal-actions">
          <button type="button" class="btn" id="qa-cancel">Cancel</button>
          <button type="submit" class="btn primary">Insert Q&A Block</button>
        </div>
      </form>
    `;

    wrap.querySelector("#qa-cancel").addEventListener("click", () => wrap.remove());
    wrap.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const q = form.elements.question.value;
      const opts = form.elements.options.value;
      const a = form.elements.answer.value;
      const markdown = formatQABlock(q, opts, a);
      wrap.remove();
      if (global.NotesInsert) {
        global.NotesInsert.put(markdown, {}, target);
      }
    });

    document.body.appendChild(wrap);
    wrap.querySelector("textarea[name='question']").focus();
  }

  function init() {
    if (global.NotesInsert) {
      global.NotesInsert.register({
        id: "qa",
        label: "Q&A study block…",
        hint: "> Q&A",
        group: "Blocks",
        keywords: ["qa", "quiz", "question", "answer", "study", "card"],
        run: (t) => openQADialog(t),
      });
    }
  }

  if (document.readyState === "complete") init();
  else document.addEventListener("DOMContentLoaded", init);

  global.NotesQA = {
    openDialog: openQADialog,
    formatQABlock,
  };
})(window);
