import type {
  IndexedNote,
  BaseDefinition,
  ViewDefinition,
  QueryResponse,
  PropertyDefinition,
  PropertyPatch,
  FilterPatch,
  FilterCondition,
  FilterGroup,
  BaseMutation,
} from "./base-api.ts";
import { queryBase, updateProperty, mutateBase } from "./base-api.ts";
import {
  getCellValue,
  formatValue,
  formatColumnName,
  escapeHtml,
  compareValues,
  applyClientSort,
  type SortState,
} from "./base-cell.ts";
import { buildCardList } from "./base-card-view.ts";

export interface BaseTableCallbacks {
  onOpenNote: (path: string) => void;
  onRefresh: () => void;
  onToggleSource?: () => void;
}

export function createBaseTableView(
  basePath: string,
  callbacks: BaseTableCallbacks
): { el: HTMLElement; refresh: () => Promise<void> } {
  const wrapper = document.createElement("div");
  wrapper.className = "base-view-wrapper";

  let currentViewIndex = 0;
  let currentSort: SortState | null = null;
  let lastResponse: QueryResponse | null = null;
  let baseMtime: number | undefined;
  let openMenuCleanup: (() => void) | null = null;

  // Persistent toolbar — not wiped on re-render
  const toolbar = document.createElement("div");
  toolbar.className = "base-toolbar";

  const addColBtn = document.createElement("button");
  addColBtn.className = "base-toolbar-btn icon-btn";
  addColBtn.title = "Add a column to this view";
  addColBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
    Add column
  `;
  addColBtn.addEventListener("click", () => void promptAddColumn());
  toolbar.appendChild(addColBtn);

  const addViewBtn = document.createElement("button");
  addViewBtn.className = "base-toolbar-btn icon-btn";
  addViewBtn.title = "Add a new view (table, list/cards, gallery)";
  addViewBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <line x1="17.5" y1="14" x2="17.5" y2="21"/>
      <line x1="14" y1="17.5" x2="21" y2="17.5"/>
    </svg>
    Add view
  `;
  addViewBtn.addEventListener("click", () => void promptAddView());
  toolbar.appendChild(addViewBtn);

  const filterBtn = document.createElement("button");
  filterBtn.className = "base-toolbar-btn icon-btn";
  filterBtn.title = "Manage filters";
  filterBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
    Filter
  `;
  filterBtn.addEventListener("click", () => toggleFilterPanel());
  toolbar.appendChild(filterBtn);

  const filterPanel = document.createElement("div");
  filterPanel.className = "base-filter-panel hidden";
  wrapper.appendChild(filterPanel);

  function toggleFilterPanel(): void {
    filterPanel.classList.toggle("hidden");
    if (!filterPanel.classList.contains("hidden") && lastResponse) {
      renderFilterPanel(lastResponse);
    }
  }

  function renderFilterPanel(response: QueryResponse): void {
    filterPanel.innerHTML = "";
    const def = response.definition;
    const view = def.views?.[currentViewIndex];

    // base-level filters section
    const baseSection = document.createElement("div");
    baseSection.className = "base-filter-section";
    const baseTitle = document.createElement("div");
    baseTitle.className = "base-filter-section-title";
    baseTitle.textContent = "Base filters";
    baseSection.appendChild(baseTitle);
    renderFilterConditions(baseSection, def.filters, "base");
    filterPanel.appendChild(baseSection);

    // view-level filters section
    if (view) {
      const viewSection = document.createElement("div");
      viewSection.className = "base-filter-section";
      const viewTitle = document.createElement("div");
      viewTitle.className = "base-filter-section-title";
      viewTitle.textContent = `View filters (${view.name})`;
      viewSection.appendChild(viewTitle);
      renderFilterConditions(viewSection, view.filter ?? null, "view");
      filterPanel.appendChild(viewSection);
    }
  }

  function renderFilterConditions(
    container: HTMLElement,
    filter: FilterGroup | null,
    scope: "base" | "view"
  ): void {
    const conditions = flattenFilterConditions(filter);

    if (conditions.length > 0) {
      const list = document.createElement("div");
      list.className = "base-filter-list";
      for (const tracked of conditions) {
        const row = document.createElement("div");
        row.className = "base-filter-row";

        const arrayLabel = document.createElement("span");
        arrayLabel.className = "base-filter-array-label";
        arrayLabel.textContent = tracked.arrayKey.toUpperCase();
        row.appendChild(arrayLabel);

        const label = document.createElement("span");
        label.className = "base-filter-label";
        label.textContent = formatFilterCondition(tracked.condition);
        row.appendChild(label);

        // only and-conditions are editable/removable via mutations
        if (tracked.arrayKey === "and") {
          const editBtn = document.createElement("button");
          editBtn.className = "base-filter-action-btn";
          editBtn.title = "Edit filter";
          editBtn.textContent = "✎";
          editBtn.addEventListener("click", () => {
            void openFilterDialog(tracked.condition, scope).then((patch) => {
              if (!patch) return;
              void applyMutation({
                type: "updateFilter",
                filterIndex: tracked.yamlIndex,
                filter: patch,
                scope,
                viewIndex: scope === "view" ? currentViewIndex : undefined,
              });
            });
          });
          row.appendChild(editBtn);

          const removeBtn = document.createElement("button");
          removeBtn.className = "base-filter-action-btn base-filter-remove-btn";
          removeBtn.title = "Remove filter";
          removeBtn.textContent = "×";
          removeBtn.addEventListener("click", () => {
            void applyMutation({
              type: "removeFilter",
              filterIndex: tracked.yamlIndex,
              scope,
              viewIndex: scope === "view" ? currentViewIndex : undefined,
            });
          });
          row.appendChild(removeBtn);
        }

        list.appendChild(row);
      }
      container.appendChild(list);
    } else {
      const empty = document.createElement("div");
      empty.className = "base-filter-empty";
      empty.textContent = "No filters";
      container.appendChild(empty);
    }

    const addBtn = document.createElement("button");
    addBtn.className = "base-filter-add-btn";
    addBtn.textContent = "+ Add filter";
    addBtn.addEventListener("click", () => {
      void openFilterDialog(null, scope).then((patch) => {
        if (!patch) return;
        void applyMutation({
          type: "addFilter",
          filter: patch,
          scope,
          viewIndex: scope === "view" ? currentViewIndex : undefined,
        });
      });
    });
    container.appendChild(addBtn);
  }

  if (callbacks.onToggleSource) {
    const sourceBtn = document.createElement("button");
    sourceBtn.className = "base-source-btn icon-btn";
    sourceBtn.title = "Edit source YAML (Ctrl+E)";
    sourceBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="16 18 22 12 16 6"/>
        <polyline points="8 6 2 12 8 18"/>
      </svg>
      Source
    `;
    sourceBtn.addEventListener("click", () => callbacks.onToggleSource?.());
    toolbar.appendChild(sourceBtn);
  }
  wrapper.appendChild(toolbar);

  const container = document.createElement("div");
  container.className = "base-view";
  wrapper.appendChild(container);

  async function refresh(): Promise<void> {
    try {
      container.innerHTML = '<div class="base-loading">Loading base…</div>';
      const response = await queryBase(basePath, currentViewIndex);
      lastResponse = response;
      render(response);
    } catch (err) {
      container.innerHTML = `<div class="base-error">${err instanceof Error ? err.message : "Failed to load base"}</div>`;
    }
  }

  async function applyMutation(mutation: BaseMutation): Promise<void> {
    try {
      const result = await mutateBase(basePath, mutation, baseMtime);
      baseMtime = result.mtime;
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update base";
      if (msg.startsWith("CONFLICT:")) {
        alert("This base file changed externally. Reloading.");
        await refresh();
      } else {
        alert(msg);
      }
    }
  }

  async function promptAddColumn(): Promise<void> {
    const suggestions = collectKnownProperties(lastResponse);
    const name = await pickColumnName(suggestions);
    if (!name) return;
    await applyMutation({
      type: "addColumn",
      viewIndex: currentViewIndex,
      column: name,
    });
  }

  async function promptAddView(): Promise<void> {
    const result = await pickViewDefinition();
    if (!result) return;
    await applyMutation({
      type: "addView",
      view: { name: result.name, type: result.type },
    });
    // jump to the newly-added view (refresh() already updated lastResponse)
    const views = lastResponse?.definition.views;
    if (views && views.length > 0) {
      currentViewIndex = views.length - 1;
      await refresh();
    }
  }

  async function removeColumnAt(column: string): Promise<void> {
    if (!confirm(`Remove column "${column}" from this view?`)) return;
    await applyMutation({
      type: "removeColumn",
      viewIndex: currentViewIndex,
      column,
    });
  }

  async function editPropertyMeta(column: string, currentDef?: PropertyDefinition): Promise<void> {
    const patch = await openPropertyDialog(column, currentDef);
    if (!patch) return;
    if (currentDef) {
      await applyMutation({ type: "updateProperty", oldName: column, property: patch });
    } else {
      await applyMutation({ type: "addProperty", property: patch });
    }
  }

  function render(response: QueryResponse): void {
    container.innerHTML = "";

    const { definition, warnings, total } = response;
    if (typeof response.mtime === "number") baseMtime = response.mtime;

    // update filter badge
    const view = definition.views?.[currentViewIndex];
    const baseFilterCount = flattenFilterConditions(definition.filters).length;
    const viewFilterCount = flattenFilterConditions(view?.filter ?? null).length;
    const totalFilters = baseFilterCount + viewFilterCount;
    filterBtn.textContent = "";
    filterBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
      </svg>
      Filter${totalFilters > 0 ? ` (${totalFilters})` : ""}
    `;
    if (totalFilters > 0) filterBtn.classList.add("base-filter-active");
    else filterBtn.classList.remove("base-filter-active");

    // refresh filter panel if open
    if (!filterPanel.classList.contains("hidden")) {
      renderFilterPanel(response);
    }

    // warnings bar
    if (warnings.length > 0) {
      const warningsEl = document.createElement("div");
      warningsEl.className = "base-warnings";
      warningsEl.innerHTML = warnings
        .map((w) => `<div class="base-warning">${escapeHtml(w)}</div>`)
        .join("");
      container.appendChild(warningsEl);
    }

    // view tabs
    if (definition.views && definition.views.length > 1) {
      const tabs = document.createElement("div");
      tabs.className = "base-view-tabs";
      definition.views.forEach((view, idx) => {
        const tab = document.createElement("button");
        tab.className =
          "base-view-tab" + (idx === currentViewIndex ? " active" : "");
        tab.textContent = view.name;
        tab.addEventListener("click", () => {
          currentViewIndex = idx;
          currentSort = null;
          void refresh();
        });
        tabs.appendChild(tab);
      });
      container.appendChild(tabs);
    }

    // toolbar-level controls that depend on the view (Add view button)
    renderToolbarExtras(definition);

    // unsupported view type
    if (view && !view._supported) {
      const placeholder = document.createElement("div");
      placeholder.className = "base-unsupported-view";
      placeholder.innerHTML = `
        <div class="base-unsupported-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
          </svg>
        </div>
        <div class="base-unsupported-text">${escapeHtml(view._unsupportedReason ?? `View type "${view.type}" is not yet supported`)}</div>
        <div class="base-unsupported-hint">The view definition is preserved and will work when this view type is implemented.</div>
      `;
      container.appendChild(placeholder);
      return;
    }

    // determine columns
    const columns = resolveColumns(response, definition, view);
    const notes = Array.isArray(response.notes)
      ? response.notes
      : Object.values(response.notes).flat();

    // info bar
    const infoBar = document.createElement("div");
    infoBar.className = "base-info-bar";
    infoBar.textContent = `${notes.length} of ${total} notes`;
    container.appendChild(infoBar);

    const isCardLike = view?.type === "list" || view?.type === "gallery";
    const renderGroupContent = (
      key: string,
      groupNotes: IndexedNote[]
    ): HTMLElement => {
      const sorted = currentSort ? applyClientSort(groupNotes, currentSort) : groupNotes;
      const groupEl = document.createElement("div");
      groupEl.className = "base-group";
      const groupHeader = document.createElement("div");
      groupHeader.className = "base-group-header";
      groupHeader.textContent = key;
      groupEl.appendChild(groupHeader);
      groupEl.appendChild(
        isCardLike
          ? buildCardList(columns, sorted, definition, view, callbacks)
          : buildTable(columns, sorted, definition)
      );
      return groupEl;
    };

    // re-apply persistent client-side sort (if user has sorted by clicking)
    const sortedFlat = currentSort ? applyClientSort(notes, currentSort) : notes;

    // grouped rendering
    if (!Array.isArray(response.notes)) {
      const grouped = response.notes as Record<string, IndexedNote[]>;
      for (const [groupKey, groupNotes] of Object.entries(grouped)) {
        container.appendChild(renderGroupContent(groupKey, groupNotes));
      }
    } else if (isCardLike) {
      container.appendChild(
        buildCardList(columns, sortedFlat, definition, view, callbacks)
      );
    } else {
      container.appendChild(buildTable(columns, sortedFlat, definition));
    }
  }

  function renderToolbarExtras(_definition: BaseDefinition): void {
    // (placeholder for future view-aware toolbar items)
  }

  function buildTable(
    columns: string[],
    notes: IndexedNote[],
    definition: BaseDefinition
  ): HTMLElement {
    const table = document.createElement("table");
    table.className = "base-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const col of columns) {
      headerRow.appendChild(buildHeader(col, definition));
    }
    // Trailing "+" cell to add a column inline at end-of-row
    const addTh = document.createElement("th");
    addTh.className = "base-th base-th-add";
    addTh.title = "Add column";
    addTh.textContent = "+";
    addTh.addEventListener("click", () => void promptAddColumn());
    headerRow.appendChild(addTh);
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const note of notes) {
      tbody.appendChild(buildRow(columns, note, definition, callbacks, /*hasTrailingAddCol*/ true));
    }
    table.appendChild(tbody);

    return table;
  }

  function buildHeader(
    col: string,
    definition: BaseDefinition
  ): HTMLTableCellElement {
    const th = document.createElement("th");
    th.className = "base-th";

    const propDef = definition.properties?.find((p) => p.name === col);
    const label = propDef?.label ?? formatColumnName(col);

    const labelSpan = document.createElement("span");
    labelSpan.className = "base-th-label";
    labelSpan.textContent = label;
    th.appendChild(labelSpan);
    th.title = col;

    if (propDef?.width) th.style.width = `${propDef.width}px`;

    if (currentSort?.column === col) {
      th.classList.add(`sort-${currentSort.direction}`);
    }

    // sort on click (clicking on label or header background)
    labelSpan.addEventListener("click", () => {
      const newDir: "asc" | "desc" =
        currentSort?.column === col && currentSort.direction === "asc" ? "desc" : "asc";
      currentSort = { column: col, direction: newDir };
      if (lastResponse) render(lastResponse);
    });

    // header-options menu (⋮)
    const menuBtn = document.createElement("button");
    menuBtn.className = "base-th-menu";
    menuBtn.title = "Column options";
    menuBtn.innerHTML = "⋮";
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openColumnMenu(menuBtn, col, propDef);
    });
    th.appendChild(menuBtn);

    return th;
  }

  function openColumnMenu(
    anchor: HTMLElement,
    column: string,
    propDef: PropertyDefinition | undefined
  ): void {
    closeAnyOpenMenu();
    const menu = document.createElement("div");
    menu.className = "base-th-popup";

    const isFileCol = column.startsWith("file.") || column.startsWith("formula:");

    addMenuItem(menu, "Sort ascending", () => {
      currentSort = { column, direction: "asc" };
      if (lastResponse) render(lastResponse);
    });
    addMenuItem(menu, "Sort descending", () => {
      currentSort = { column, direction: "desc" };
      if (lastResponse) render(lastResponse);
    });
    addMenuItem(menu, "Clear sort", () => {
      currentSort = null;
      if (lastResponse) render(lastResponse);
    });

    if (!isFileCol) {
      addMenuItem(menu, propDef ? "Edit property…" : "Set property metadata…", () => {
        void editPropertyMeta(column, propDef);
      });
    }

    addMenuItem(menu, "Remove from view", () => {
      void removeColumnAt(column);
    });

    if (!isFileCol) {
      addMenuItem(menu, "Delete property (and column)", () => {
        if (confirm(`Delete property "${column}" from base definition? This will not modify any notes.`)) {
          void applyMutation({ type: "removeProperty", name: column });
        }
      });
    }

    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${rect.left}px`;

    const onDocClick = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node)) closeAnyOpenMenu();
    };
    setTimeout(() => document.addEventListener("click", onDocClick), 0);
    openMenuCleanup = () => {
      document.removeEventListener("click", onDocClick);
      menu.remove();
      openMenuCleanup = null;
    };
  }

  function closeAnyOpenMenu(): void {
    if (openMenuCleanup) openMenuCleanup();
  }

  void refresh();
  return { el: wrapper, refresh };
}

function resolveColumns(
  response: QueryResponse,
  definition: BaseDefinition,
  view: ViewDefinition | undefined
): string[] {
  // use view-defined columns if available
  if (view?.columns && view.columns.length > 0) {
    return view.columns;
  }

  // use property definitions
  if (definition.properties && definition.properties.length > 0) {
    return definition.properties
      .filter((p) => !p.hidden)
      .map((p) => p.name);
  }

  // auto-detect from notes
  const columnSet = new Set<string>(["file.name"]);
  const notes = Array.isArray(response.notes)
    ? response.notes
    : Object.values(response.notes).flat();

  for (const note of notes.slice(0, 50)) {
    for (const key of Object.keys(note.frontmatter)) {
      columnSet.add(key);
    }
    if (note.formulaValues) {
      for (const key of Object.keys(note.formulaValues)) {
        columnSet.add(`formula:${key}`);
      }
    }
  }
  return [...columnSet];
}

function buildRow(
  columns: string[],
  note: IndexedNote,
  definition: BaseDefinition,
  callbacks: BaseTableCallbacks,
  hasTrailingAddCol = false
): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.className = "base-tr";

  for (const col of columns) {
    const td = document.createElement("td");
    td.className = "base-td";

    const value = getCellValue(note, col);

    if (col === "file.name" || col === "file.path") {
      const link = document.createElement("a");
      link.href = "#";
      link.className = "base-note-link";
      link.textContent = String(value ?? note.name);
      link.addEventListener("click", (e) => {
        e.preventDefault();
        callbacks.onOpenNote(note.path);
      });
      td.appendChild(link);
    } else if (col.startsWith("formula:")) {
      td.textContent = formatValue(value);
      td.classList.add("base-td-formula");
    } else if (col.startsWith("file.")) {
      td.textContent = formatValue(value);
      td.classList.add("base-td-readonly");
    } else {
      td.textContent = formatValue(value);
      td.classList.add("base-td-editable");
      td.addEventListener("dblclick", () => {
        startCellEdit(td, note, col, callbacks);
      });
    }

    tr.appendChild(td);
  }

  if (hasTrailingAddCol) {
    const filler = document.createElement("td");
    filler.className = "base-td base-td-filler";
    tr.appendChild(filler);
  }

  return tr;
}

function collectKnownProperties(response: QueryResponse | null): string[] {
  const known = new Set<string>([
    "file.name", "file.path", "file.folder", "file.ext",
    "file.mtime", "file.ctime", "file.tags",
  ]);
  if (response) {
    const def = response.definition;
    for (const p of def.properties ?? []) known.add(p.name);
    for (const k of Object.keys(def.formulas ?? {})) known.add(`formula:${k}`);
    const flat = Array.isArray(response.notes)
      ? response.notes
      : Object.values(response.notes).flat();
    for (const note of flat.slice(0, 100)) {
      for (const k of Object.keys(note.frontmatter)) known.add(k);
    }
  }
  return [...known].sort();
}

function addMenuItem(menu: HTMLElement, label: string, onClick: () => void): void {
  const item = document.createElement("button");
  item.className = "base-th-popup-item";
  item.textContent = label;
  item.addEventListener("click", () => onClick());
  menu.appendChild(item);
}

function pickViewDefinition(): Promise<{ name: string; type: string } | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "base-modal-overlay";
    const modal = document.createElement("div");
    modal.className = "base-modal";
    modal.innerHTML = `
      <div class="base-modal-title">Add view</div>
      <div class="base-modal-body">
        <label class="base-modal-label">Name</label>
        <input class="base-modal-input" data-field="name" type="text" placeholder="e.g. Cards, Backlog" value="New view">
        <label class="base-modal-label">View type</label>
        <select class="base-modal-input" data-field="type">
          <option value="table">Table</option>
          <option value="list">Card list</option>
          <option value="gallery">Gallery</option>
        </select>
        <div class="base-modal-hint">Card list and gallery render each note as a card. You can switch the type later by editing source.</div>
      </div>
      <div class="base-modal-actions">
        <button class="base-modal-cancel">Cancel</button>
        <button class="base-modal-ok">Add</button>
      </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const nameInput = modal.querySelector<HTMLInputElement>('[data-field="name"]')!;
    const typeSelect = modal.querySelector<HTMLSelectElement>('[data-field="type"]')!;
    const ok = modal.querySelector<HTMLButtonElement>(".base-modal-ok")!;
    const cancel = modal.querySelector<HTMLButtonElement>(".base-modal-cancel")!;

    const close = (val: { name: string; type: string } | null) => {
      overlay.remove();
      resolve(val);
    };

    ok.addEventListener("click", () => {
      const name = nameInput.value.trim();
      if (!name) return;
      close({ name, type: typeSelect.value });
    });
    cancel.addEventListener("click", () => close(null));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); ok.click(); }
      else if (e.key === "Escape") { e.preventDefault(); close(null); }
    });
    setTimeout(() => { nameInput.focus(); nameInput.select(); }, 0);
  });
}

function pickColumnName(suggestions: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "base-modal-overlay";
    const modal = document.createElement("div");
    modal.className = "base-modal";
    modal.innerHTML = `
      <div class="base-modal-title">Add column</div>
      <div class="base-modal-body">
        <label class="base-modal-label">Property name</label>
        <input class="base-modal-input" type="text" list="base-col-suggestions" placeholder="e.g. status, due, file.mtime">
        <datalist id="base-col-suggestions">
          ${suggestions.map((s) => `<option value="${escapeHtml(s)}"></option>`).join("")}
        </datalist>
        <div class="base-modal-hint">Use <code>file.*</code> for file metadata, <code>formula:*</code> for formulas, or any frontmatter key.</div>
      </div>
      <div class="base-modal-actions">
        <button class="base-modal-cancel">Cancel</button>
        <button class="base-modal-ok">Add</button>
      </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const input = modal.querySelector<HTMLInputElement>(".base-modal-input")!;
    const ok = modal.querySelector<HTMLButtonElement>(".base-modal-ok")!;
    const cancel = modal.querySelector<HTMLButtonElement>(".base-modal-cancel")!;

    const close = (val: string | null) => {
      overlay.remove();
      resolve(val);
    };

    ok.addEventListener("click", () => {
      const v = input.value.trim();
      close(v || null);
    });
    cancel.addEventListener("click", () => close(null));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); ok.click(); }
      else if (e.key === "Escape") { e.preventDefault(); close(null); }
    });
    setTimeout(() => input.focus(), 0);
  });
}

function openPropertyDialog(
  name: string,
  current: PropertyDefinition | undefined
): Promise<PropertyPatch | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "base-modal-overlay";
    const modal = document.createElement("div");
    modal.className = "base-modal";

    const initLabel = current?.label ?? "";
    const initType = current?.type ?? "";
    const initWidth = current?.width != null ? String(current.width) : "";
    const initHidden = current?.hidden === true;

    modal.innerHTML = `
      <div class="base-modal-title">${current ? "Edit" : "Add"} property: ${escapeHtml(name)}</div>
      <div class="base-modal-body">
        <label class="base-modal-label">Name</label>
        <input class="base-modal-input" data-field="name" type="text" value="${escapeHtml(name)}">
        <label class="base-modal-label">Label (optional)</label>
        <input class="base-modal-input" data-field="label" type="text" value="${escapeHtml(initLabel)}">
        <label class="base-modal-label">Type (optional)</label>
        <input class="base-modal-input" data-field="type" type="text" placeholder="text, number, date, list, …" value="${escapeHtml(initType)}">
        <label class="base-modal-label">Width (px, optional)</label>
        <input class="base-modal-input" data-field="width" type="number" min="40" value="${escapeHtml(initWidth)}">
        <label class="base-modal-checkbox-row">
          <input type="checkbox" data-field="hidden" ${initHidden ? "checked" : ""}>
          Hidden by default
        </label>
      </div>
      <div class="base-modal-actions">
        <button class="base-modal-cancel">Cancel</button>
        <button class="base-modal-ok">Save</button>
      </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const get = (field: string): string =>
      (modal.querySelector(`[data-field="${field}"]`) as HTMLInputElement).value;
    const getBool = (field: string): boolean =>
      (modal.querySelector(`[data-field="${field}"]`) as HTMLInputElement).checked;
    const ok = modal.querySelector<HTMLButtonElement>(".base-modal-ok")!;
    const cancel = modal.querySelector<HTMLButtonElement>(".base-modal-cancel")!;

    const close = (val: PropertyPatch | null) => { overlay.remove(); resolve(val); };

    ok.addEventListener("click", () => {
      const newName = get("name").trim() || name;
      const labelStr = get("label").trim();
      const typeStr = get("type").trim();
      const widthStr = get("width").trim();
      const widthNum = widthStr === "" ? NaN : Number(widthStr);
      close({
        name: newName,
        // null means "remove this field", undefined means "leave alone"
        label: labelStr || null,
        type: typeStr || null,
        width: widthStr === "" ? null : (isNaN(widthNum) ? null : widthNum),
        hidden: getBool("hidden") ? true : null,
      });
    });
    cancel.addEventListener("click", () => close(null));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
    setTimeout(() => (modal.querySelector('[data-field="label"]') as HTMLInputElement).focus(), 0);
  });
}

function startCellEdit(
  td: HTMLTableCellElement,
  note: IndexedNote,
  property: string,
  callbacks: BaseTableCallbacks
): void {
  const currentValue = note.frontmatter[property];
  const input = document.createElement("input");
  input.className = "base-cell-input";
  input.type = "text";
  input.value = currentValue !== undefined && currentValue !== null ? String(currentValue) : "";

  td.textContent = "";
  td.appendChild(input);
  input.focus();
  input.select();

  const commit = async () => {
    const newValue = parseInputValue(input.value);
    td.textContent = formatValue(newValue);
    try {
      await updateProperty(note.path, property, newValue, note.mtime);
      note.frontmatter[property] = newValue;
      callbacks.onRefresh();
    } catch (err) {
      td.textContent = formatValue(currentValue);
      if (err instanceof Error && err.message.startsWith("CONFLICT:")) {
        alert("This file was modified externally. Please refresh.");
      } else {
        alert(err instanceof Error ? err.message : "Update failed");
      }
    }
  };

  let cancelled = false;
  input.addEventListener("blur", () => { if (!cancelled) void commit(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    } else if (e.key === "Escape") {
      cancelled = true;
      td.textContent = formatValue(currentValue);
    }
  });
}

function parseInputValue(str: string): unknown {
  const trimmed = str.trim();
  if (trimmed === "") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== "") return num;
  // check for list (comma-separated)
  if (trimmed.includes(",")) {
    return trimmed.split(",").map((s) => s.trim());
  }
  return trimmed;
}

// ── Filter helpers ───────────────────────────────────────────────────────────

function isFilterCondition(
  item: FilterGroup | FilterCondition
): item is FilterCondition {
  return "property" in item && "operator" in item;
}

interface TrackedFilter {
  condition: FilterCondition;
  arrayKey: "and" | "or" | "not";
  yamlIndex: number;
}

function flattenFilterConditions(filter: FilterGroup | null): TrackedFilter[] {
  if (!filter) return [];
  const results: TrackedFilter[] = [];
  if (filter.and) {
    for (let i = 0; i < filter.and.length; i++) {
      const item = filter.and[i]!;
      if (isFilterCondition(item)) results.push({ condition: item, arrayKey: "and", yamlIndex: i });
    }
  }
  if (filter.or) {
    for (let i = 0; i < filter.or.length; i++) {
      const item = filter.or[i]!;
      if (isFilterCondition(item)) results.push({ condition: item, arrayKey: "or", yamlIndex: i });
    }
  }
  if (filter.not && isFilterCondition(filter.not)) {
    results.push({ condition: filter.not, arrayKey: "not", yamlIndex: 0 });
  }
  return results;
}

const OPERATOR_LABELS: Record<string, string> = {
  eq: "=",
  neq: "≠",
  gt: ">",
  lt: "<",
  gte: "≥",
  lte: "≤",
  contains: "contains",
  exists: "exists",
  empty: "is empty",
};

function formatFilterCondition(cond: FilterCondition): string {
  const opLabel = OPERATOR_LABELS[cond.operator] ?? cond.operator;
  if (cond.operator === "exists" || cond.operator === "empty") {
    return `${cond.property} ${opLabel}`;
  }
  const val = cond.value !== undefined && cond.value !== null
    ? String(cond.value)
    : "";
  return `${cond.property} ${opLabel} ${val}`.trim();
}

function openFilterDialog(
  current: FilterCondition | null,
  _scope: "base" | "view"
): Promise<FilterPatch | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "base-modal-overlay";
    const modal = document.createElement("div");
    modal.className = "base-modal";

    const initProp = current?.property ?? "";
    const initOp = current?.operator ?? "eq";
    const initVal = current?.value !== undefined && current?.value !== null
      ? String(current.value)
      : "";

    const operators = ["eq", "neq", "gt", "lt", "gte", "lte", "contains", "exists", "empty"];

    modal.innerHTML = `
      <div class="base-modal-title">${current ? "Edit" : "Add"} filter</div>
      <div class="base-modal-body">
        <label class="base-modal-label">Property</label>
        <input class="base-modal-input" data-field="property" type="text"
          placeholder='e.g. status, file.inFolder("Folder"), file.hasTag("tag")'
          value="${escapeHtml(initProp)}">
        <label class="base-modal-label">Operator</label>
        <select class="base-modal-input" data-field="operator">
          ${operators.map((op) => `<option value="${op}" ${op === initOp ? "selected" : ""}>${OPERATOR_LABELS[op] ?? op} (${op})</option>`).join("")}
        </select>
        <label class="base-modal-label" data-value-label>Value</label>
        <input class="base-modal-input" data-field="value" type="text"
          placeholder="Filter value" value="${escapeHtml(initVal)}">
        <div class="base-modal-hint">
          Use <code>file.inFolder("path")</code>, <code>file.hasTag("tag")</code>, or any frontmatter property.
        </div>
      </div>
      <div class="base-modal-actions">
        <button class="base-modal-cancel">Cancel</button>
        <button class="base-modal-ok">${current ? "Save" : "Add"}</button>
      </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const propInput = modal.querySelector<HTMLInputElement>('[data-field="property"]')!;
    const opSelect = modal.querySelector<HTMLSelectElement>('[data-field="operator"]')!;
    const valInput = modal.querySelector<HTMLInputElement>('[data-field="value"]')!;
    const valLabel = modal.querySelector<HTMLElement>('[data-value-label]')!;
    const ok = modal.querySelector<HTMLButtonElement>(".base-modal-ok")!;
    const cancel = modal.querySelector<HTMLButtonElement>(".base-modal-cancel")!;

    const updateValueVisibility = () => {
      const op = opSelect.value;
      const hidden = op === "exists" || op === "empty";
      valInput.style.display = hidden ? "none" : "";
      valLabel.style.display = hidden ? "none" : "";
    };
    opSelect.addEventListener("change", updateValueVisibility);
    updateValueVisibility();

    const close = (val: FilterPatch | null) => {
      overlay.remove();
      resolve(val);
    };

    ok.addEventListener("click", () => {
      const property = propInput.value.trim();
      if (!property) return;
      const operator = opSelect.value;
      const rawVal = valInput.value.trim();
      let value: unknown;
      if (operator === "exists" || operator === "empty") {
        value = undefined;
      } else if (rawVal === "true") {
        value = true;
      } else if (rawVal === "false") {
        value = false;
      } else if (rawVal !== "" && !isNaN(Number(rawVal))) {
        value = Number(rawVal);
      } else {
        value = rawVal || undefined;
      }
      close({ property, operator, value });
    });
    cancel.addEventListener("click", () => close(null));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
    propInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); ok.click(); }
      else if (e.key === "Escape") { e.preventDefault(); close(null); }
    });
    valInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); ok.click(); }
      else if (e.key === "Escape") { e.preventDefault(); close(null); }
    });
    setTimeout(() => propInput.focus(), 0);
  });
}


