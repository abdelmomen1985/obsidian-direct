import { createBaseTableView } from "./base-table.ts";
import type { BaseTableCallbacks } from "./base-table.ts";
import { queryBase } from "./base-api.ts";

export function processEmbeddedBases(
  container: HTMLElement,
  callbacks: BaseTableCallbacks
): void {
  const codeBlocks = container.querySelectorAll<HTMLElement>(
    "pre > code.language-base, pre > code.language-bases"
  );

  codeBlocks.forEach((codeEl) => {
    const preEl = codeEl.parentElement;
    if (!preEl) return;

    const yamlContent = codeEl.textContent ?? "";
    if (!yamlContent.trim()) return;

    const wrapper = document.createElement("div");
    wrapper.className = "base-embedded";

    const header = document.createElement("div");
    header.className = "base-embedded-header";
    header.innerHTML = `
      <span class="base-embedded-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
        </svg>
        Embedded Base
      </span>
      <button class="base-embedded-toggle" title="Toggle source">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
      </button>
    `;
    wrapper.appendChild(header);

    // rendered view
    const viewContainer = document.createElement("div");
    viewContainer.className = "base-embedded-view";
    viewContainer.innerHTML = '<div class="base-loading">Loading embedded base…</div>';
    wrapper.appendChild(viewContainer);

    // source view (hidden by default)
    const sourceView = document.createElement("pre");
    sourceView.className = "base-embedded-source hidden";
    sourceView.textContent = yamlContent;
    wrapper.appendChild(sourceView);

    // toggle between source and rendered
    const toggleBtn = header.querySelector(".base-embedded-toggle");
    toggleBtn?.addEventListener("click", () => {
      viewContainer.classList.toggle("hidden");
      sourceView.classList.toggle("hidden");
    });

    // load the embedded base query
    // embedded bases are inline YAML, so we send them to the server for processing
    void loadEmbeddedBase(viewContainer, yamlContent, callbacks);

    preEl.replaceWith(wrapper);
  });
}

async function loadEmbeddedBase(
  container: HTMLElement,
  _yamlContent: string,
  callbacks: BaseTableCallbacks
): Promise<void> {
  // Embedded bases display a simplified table from inline YAML
  // For now we display the raw content with a note that full embedded support
  // requires the YAML to be saved as a .base file first
  container.innerHTML = `
    <div class="base-embedded-info">
      <p>Embedded base definitions are detected. To view as a table, save the YAML as a <code>.base</code> file and open it from the file tree.</p>
    </div>
  `;
}
