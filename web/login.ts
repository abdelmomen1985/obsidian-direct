import { login } from "./api.ts";

export function renderLogin(onSuccess: () => void): HTMLElement {
  const el = document.createElement("div");
  el.className = "login-screen";
  el.innerHTML = `
    <div class="login-card">
      <div class="login-logo">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
      </div>
      <h1>Obsidian Direct</h1>
      <form id="login-form">
        <div class="field">
          <label for="password">Password</label>
          <input type="password" id="password" autocomplete="current-password" placeholder="Enter your password" />
        </div>
        <div id="login-error" class="login-error hidden"></div>
        <button type="submit" id="login-btn">Sign in</button>
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
