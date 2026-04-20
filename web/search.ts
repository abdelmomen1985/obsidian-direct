import { search, SearchResult } from "./api.ts";

export function createSearchPanel(
  onSelect: (path: string, line: number) => void
): { el: HTMLElement; open: () => void; close: () => void } {
  const el = document.createElement("div");
  el.className = "search-panel hidden";
  el.innerHTML = `
    <div class="search-inner">
      <div class="search-header">
        <input type="text" id="search-input" placeholder="Search notes… (min 2 chars)" autocomplete="off" />
        <button id="search-close" title="Close (Esc)">✕</button>
      </div>
      <div id="search-results" class="search-results"></div>
    </div>
  `;

  const input = el.querySelector<HTMLInputElement>("#search-input")!;
  const closeBtn = el.querySelector<HTMLButtonElement>("#search-close")!;
  const resultsEl = el.querySelector<HTMLDivElement>("#search-results")!;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  input.addEventListener("input", () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 2) {
      resultsEl.innerHTML = "";
      return;
    }
    debounceTimer = setTimeout(() => runSearch(q), 300);
  });

  async function runSearch(q: string): Promise<void> {
    resultsEl.innerHTML = '<div class="search-loading">Searching…</div>';
    try {
      const results = await search(q);
      renderResults(results, q);
    } catch {
      resultsEl.innerHTML = '<div class="search-error">Search failed</div>';
    }
  }

  function renderResults(results: SearchResult[], q: string): void {
    if (results.length === 0) {
      resultsEl.innerHTML = '<div class="search-empty">No results</div>';
      return;
    }

    resultsEl.innerHTML = "";
    for (const r of results) {
      const item = document.createElement("button");
      item.className = "search-result-item";

      const highlighted = r.snippet.replace(
        new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
        (m) => `<mark>${m}</mark>`
      );

      item.innerHTML = `
        <div class="search-result-path">${r.path}</div>
        <div class="search-result-snippet">${highlighted} <span class="search-line">L${r.lineNumber}</span></div>
      `;
      item.addEventListener("click", () => {
        onSelect(r.path, r.lineNumber);
        close();
      });
      resultsEl.appendChild(item);
    }
  }

  function open(): void {
    el.classList.remove("hidden");
    input.focus();
    input.select();
  }

  function close(): void {
    el.classList.add("hidden");
    input.value = "";
    resultsEl.innerHTML = "";
  }

  closeBtn.addEventListener("click", close);

  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  return { el, open, close };
}
