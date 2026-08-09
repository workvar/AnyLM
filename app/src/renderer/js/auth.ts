// Renderer auth: login/signup screen, OAuth buttons, and the auth gate.
import { el, qsa } from "./dom.js";

let mode = "login"; // login | register
let onAuthed: (user: AuthUser) => void = () => {};
const MIN_SPLASH_MS = 1000;
const AUTH_TIMEOUT_MS = 10_000;

async function getSessionWithTimeout(): Promise<AuthUser | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      window.api.authMe(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Authentication check timed out.")), AUTH_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function paintBootSplashStatus() {
  const status = el("boot-splash-status");
  if (!status) return;
  try {
    const report = await window.api.startupDeps();
    const bundled = report.deps.filter((d) => d.kind === "bundled");
    const pending = bundled.filter((d) => !d.ok);
    if (!pending.length) {
      status.textContent = "Memory and graph ready";
      return;
    }
    status.textContent =
      pending[0].id === "chroma" ? "Starting project memory…" : "Preparing knowledge graph…";
  } catch {
    status.textContent = "Preparing workspace…";
  }
}

export async function initAuth(onAuthedCallback) {
  onAuthed = onAuthedCallback;
  bind();
  const splash = el("boot-splash");
  const started = Date.now();
  const [user] = await Promise.all([
    getSessionWithTimeout().catch(() => null),
    paintBootSplashStatus(),
  ]);
  const wait = Math.max(0, MIN_SPLASH_MS - (Date.now() - started));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  splash.classList.add("hidden");
  if (user) {
    enterApp(user);
    return true;
  }
  showAuth();
  return false;
}

function showAuth() {
  el("auth-screen").classList.remove("hidden");
  el("app").classList.add("hidden");
}

function enterApp(user) {
  el("auth-screen").classList.add("hidden");
  el("app").classList.remove("hidden");

  const displayName = user.name || user.email || "";
  el("user-name").textContent = displayName;
  el("user-name").title = `${user.email} (${user.provider})`;

  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  el("user-avatar").textContent = initials || "?";

  onAuthed(user);
}

function setError(msg) {
  el("auth-error").textContent = msg || "";
}

function setMode(next) {
  mode = next;
  const register = mode === "register";
  el("auth-name").classList.toggle("hidden", !register);
  el("auth-sub").textContent = register ? "Create your account" : "Sign in to your projects";
  el("auth-submit").textContent = register ? "Create account" : "Sign in";
  el("auth-toggle-text").textContent = register ? "Have an account?" : "No account?";
  el("auth-toggle-link").textContent = register ? "Sign in" : "Create one";
  setError("");
}

function bind() {
  el("auth-toggle-link").onclick = (e) => {
    e.preventDefault();
    setMode(mode === "login" ? "register" : "login");
  };

  el("auth-form").onsubmit = async (e) => {
    e.preventDefault();
    setError("");
    const email = el("auth-email").value.trim();
    const password = el("auth-password").value;
    const name = el("auth-name").value.trim();
    el("auth-submit").disabled = true;
    try {
      const user =
        mode === "register"
          ? await window.api.authRegister(email, password, name)
          : await window.api.authLogin(email, password);
      enterApp(user);
    } catch (err) {
      setError(err.message);
    } finally {
      el("auth-submit").disabled = false;
    }
  };

  for (const btn of qsa(".oauth")) {
    btn.onclick = async () => {
      setError("");
      try {
        const user = await window.api.authOAuth(btn.dataset.provider);
        enterApp(user);
      } catch (err) {
        setError(err.message);
      }
    };
  }

  // User row popup toggle
  const userRow = el("user-row");
  const userPopup = el("user-popup");

  userRow.onclick = (e) => {
    e.stopPropagation();
    userPopup.classList.toggle("hidden");
  };

  document.addEventListener("click", () => {
    userPopup.classList.add("hidden");
  });

  userPopup.onclick = (e) => e.stopPropagation();

  el("logout-btn").onclick = async () => {
    await window.api.authLogout();
    location.reload();
  };
}
