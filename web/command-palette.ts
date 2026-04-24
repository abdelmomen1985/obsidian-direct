import { moveFile } from "./api.ts";
import { getAllDirPaths } from "./tree.ts";

export interface Command {
  id: string;
  label: string;
  description?: string;
  action: () => void | Promise<void>;
}

export interface CommandPaletteHandle {
  el: HTMLElement;
  open: (commands?: Command[]) => void;
  close: () => void;
  setCommands: (commands: Command[]) => void;
}

export function createCommandPalette(): CommandPaletteHandle {
  let commands: Command[] = [];
  let filtered: Command[] = [];
  let selectedIdx = 0;

  // ── DOM ──────────────────────────────────────────────────────────────────
  const overlay = document.createElement("div");
  overlay.id = "cmd-overlay";

  const panel = document.createElement("div");
  panel.className = "cmd-panel hidden";
  overlay.appendChild(panel);

  const header = document.createElement("div");
  header.className = "cmd-header";
  panel.appendChild(header);

  const input = document.createElement("input");
  input.id = "cmd-input";
  input.type = "text";
  input.placeholder = "Type a command…";
  input.autocomplete = "off";
  header.appendChild(input);

  const list = document.createElement("div");
  list.className = "cmd-list";
  panel.appendChild(list);

  // ── Helpers ──────────────────────────────────────────────────────────────
  function isOpen(): boolean {
    return !panel.classList.contains("hidden");
  }

  function render(): void {
    list.innerHTML = "";
    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "cmd-empty";
      empty.textContent = "No matching commands";
      list.appendChild(empty);
      return;
    }

    filtered.forEach((cmd, i) => {
      const item = document.createElement("button");
      item.className = "cmd-item" + (i === selectedIdx ? " selected" : "");
      item.dataset["idx"] = String(i);

      const labelEl = document.createElement("span");
      labelEl.className = "cmd-item-label";
      labelEl.textContent = cmd.label;
      item.appendChild(labelEl);

      if (cmd.description) {
        const desc = document.createElement("span");
        desc.className = "cmd-item-desc";
        desc.textContent = cmd.description;
        item.appendChild(desc);
      }

      item.addEventListener("mouseenter", () => {
        selectedIdx = i;
        render();
      });
      item.addEventListener("click", () => {
        runSelected();
      });

      list.appendChild(item);
    });

    // Scroll selected item into view
    const sel = list.querySelector<HTMLElement>(".cmd-item.selected");
    sel?.scrollIntoView({ block: "nearest" });
  }

  function filter(query: string): void {
    const q = query.toLowerCase().trim();
    filtered = q
      ? commands.filter((c) => c.label.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q))
      : [...commands];
    selectedIdx = 0;
    render();
  }

  function runSelected(): void {
    const cmd = filtered[selectedIdx];
    if (!cmd) return;
    close();
    void cmd.action();
  }

  // ── Events ───────────────────────────────────────────────────────────────
  input.addEventListener("input", () => filter(input.value));

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIdx = Math.min(selectedIdx + 1, filtered.length - 1);
      render();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIdx = Math.max(selectedIdx - 1, 0);
      render();
    } else if (e.key === "Enter") {
      e.preventDefault();
      runSelected();
    } else if (e.key === "Escape") {
      close();
    }
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  // ── Public API ───────────────────────────────────────────────────────────
  function open(cmds?: Command[]): void {
    if (cmds) commands = cmds;
    input.value = "";
    filter("");
    panel.classList.remove("hidden");
    overlay.classList.add("active");
    input.focus();
  }

  function close(): void {
    panel.classList.add("hidden");
    overlay.classList.remove("active");
  }

  function setCommands(cmds: Command[]): void {
    commands = cmds;
  }

  return { el: overlay, open, close, setCommands };
}

// ── "Move file to…" sub-palette ──────────────────────────────────────────────

export function openMoveFilePalette(
  filePath: string,
  onMoved: (oldPath: string, newPath: string) => void
): void {
  const dirs = getAllDirPaths();

  // Build a small inline directory picker panel
  const backdrop = document.createElement("div");
  backdrop.className = "cmd-backdrop";

  const panel = document.createElement("div");
  panel.className = "cmd-panel";
  backdrop.appendChild(panel);

  const header = document.createElement("div");
  header.className = "cmd-header";
  panel.appendChild(header);

  const input = document.createElement("input");
  input.type = "text";
  input.id = "move-input";
  input.placeholder = `Move "${filePath.split("/").pop()}" to directory…`;
  input.autocomplete = "off";
  header.appendChild(input);

  const list = document.createElement("div");
  list.className = "cmd-list";
  panel.appendChild(list);

  let filtered = [...dirs];
  let selectedIdx = 0;

  function render(): void {
    list.innerHTML = "";
    filtered.forEach((dir, i) => {
      const item = document.createElement("button");
      item.className = "cmd-item" + (i === selectedIdx ? " selected" : "");
      item.textContent = dir === "" ? "(root)" : dir;
      item.addEventListener("mouseenter", () => { selectedIdx = i; render(); });
      item.addEventListener("click", () => pickDir(dir));
      list.appendChild(item);
    });
    list.querySelector<HTMLElement>(".cmd-item.selected")?.scrollIntoView({ block: "nearest" });
  }

  function filterDirs(q: string): void {
    const lq = q.toLowerCase().trim();
    filtered = lq ? dirs.filter((d) => d.toLowerCase().includes(lq)) : [...dirs];
    selectedIdx = 0;
    render();
  }

  async function pickDir(destDir: string): Promise<void> {
    backdrop.remove();
    try {
      const newPath = await moveFile(filePath, destDir);
      onMoved(filePath, newPath);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Move failed");
    }
  }

  input.addEventListener("input", () => filterDirs(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, filtered.length - 1); render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); render(); }
    else if (e.key === "Enter") { e.preventDefault(); void pickDir(filtered[selectedIdx] ?? ""); }
    else if (e.key === "Escape") { backdrop.remove(); }
  });
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });

  render();
  document.body.appendChild(backdrop);
  input.focus();
}
