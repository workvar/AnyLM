// Renderer auth: login/signup screen, OAuth buttons, and the auth gate.
import { el } from "./dom.js";

let mode = "login"; // login | register
let onAuthed = () => {};

export function initAuth(onAuthedCallback) {
  onAuthed = onAuthedCallback;
  bind();
  return checkSession();
}

// Returns true if a valid session was restored.
async function checkSession() {
  const user = await window.api.authMe();
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
  el("user-email").textContent = user.email;
  el("user-email").title = `${user.email} (${user.provider})`;
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

  for (const btn of document.querySelectorAll(".oauth")) {
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

  el("logout-btn").onclick = async () => {
    await window.api.authLogout();
    location.reload();
  };
}
