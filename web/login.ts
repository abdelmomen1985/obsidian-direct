import { login } from "./api.ts";

export function renderLogin(onSuccess: () => void): HTMLElement {
  const el = document.createElement("div");
  el.className = "flex items-center justify-center min-h-screen bg-ob-bg3";
  el.innerHTML = `
    <div class="bg-ob-bg2 border border-ob-border rounded-xl text-center w-[360px] px-9 py-10">
      <div class="mb-3 text-ob-accent">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
      </div>
      <h1 class="font-semibold text-ob-text mb-7" style="font-size:20px;">Obsidian Direct</h1>
      <form id="login-form">
        <div class="text-left mb-4">
          <label for="password" class="block text-ob-muted mb-1.5 text-xs">Password</label>
          <input
            type="password" id="password"
            autocomplete="current-password"
            placeholder="Enter your password"
            class="w-full bg-ob-bg3 border border-ob-border rounded-md text-ob-text outline-none focus:border-ob-accent transition-colors duration-150 px-3 py-2 text-sm"
            style="font-family:inherit;"
          />
        </div>
        <div id="login-error" class="text-ob-red mb-3 text-[13px] hidden"></div>
        <button
          type="submit" id="login-btn"
          class="w-full bg-ob-accent text-white rounded-md font-semibold mt-1 py-[10px] text-sm transition-opacity duration-150 hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed"
        >Sign in</button>
      </form>
    </div>
  `;

  const form = el.querySelector<HTMLFormElement>("#login-form")!;
  const input = el.querySelector<HTMLInputElement>("#password")!;
  const btn = el.querySelector<HTMLButtonElement>("#login-btn")!;
  const errorEl = el.querySelector<HTMLDivElement>("#login-error")!;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = input.value;
    if (!password) return;

    btn.disabled = true;
    btn.textContent = "Signing in…";
    errorEl.classList.add("hidden");

    try {
      await login(password);
      onSuccess();
    } catch (err) {
      errorEl.textContent = err instanceof Error ? err.message : "Login failed";
      errorEl.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Sign in";
      input.select();
    }
  });

  setTimeout(() => input.focus(), 50);
  return el;
}
