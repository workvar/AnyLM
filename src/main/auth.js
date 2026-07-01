// Auth client for the NestJS backend: token storage, API calls with refresh,
// and the desktop OAuth popup flow.
const { app, shell } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { waitForTokens } = require("./protocol");

// Discover the live API base. The backend publishes its actual port to
// ~/.llmeter/runtime.json, so we stay correct even after a port fallback.
function resolveApi() {
  if (process.env.LLMETER_API_URL) return process.env.LLMETER_API_URL;
  try {
    const file = path.join(os.homedir(), ".llmeter", "runtime.json");
    const { apiUrl } = JSON.parse(fs.readFileSync(file, "utf8"));
    if (apiUrl) return apiUrl;
  } catch {
    /* fall through to default */
  }
  return "http://127.0.0.1:3227";
}

const API = resolveApi();

function tokenPath() {
  return path.join(app.getPath("userData"), "llmeter-auth.json");
}

function loadTokens() {
  try {
    return JSON.parse(fs.readFileSync(tokenPath(), "utf8"));
  } catch {
    return null;
  }
}

function saveTokens(tokens) {
  fs.writeFileSync(tokenPath(), JSON.stringify(tokens, null, 2));
}

function clearTokens() {
  try {
    fs.unlinkSync(tokenPath());
  } catch {
    /* already gone */
  }
}

async function post(path, body, bearer) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

// GET with the access token; on 401 try one refresh, then retry.
async function authedGet(path) {
  const tokens = loadTokens();
  if (!tokens) throw new Error("Not authenticated");
  let res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  });
  if (res.status === 401) {
    await refresh();
    const next = loadTokens();
    res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${next.accessToken}` },
    });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

async function register(email, password, name) {
  const data = await post("/auth/register", { email, password, name });
  saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return data.user;
}

async function login(email, password) {
  const data = await post("/auth/login", { email, password });
  saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return data.user;
}

async function refresh() {
  const tokens = loadTokens();
  if (!tokens) throw new Error("Not authenticated");
  const data = await post("/auth/refresh", null, tokens.refreshToken);
  saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return data.user;
}

async function me() {
  return authedGet("/auth/me");
}

async function logout() {
  const tokens = loadTokens();
  if (tokens) {
    await post("/auth/logout", null, tokens.accessToken).catch(() => {});
  }
  clearTokens();
  return { success: true };
}

// Open the provider's OAuth URL in the system browser, then wait for the
// backend to hand tokens back via the anylm:// deep link. Using the real
// browser (not an embedded window) is also required by Google, which blocks
// sign-in inside embedded webviews.
async function oauth(provider) {
  const pending = waitForTokens();
  await shell.openExternal(`${API}/auth/${provider}`);
  const tokens = await pending;
  saveTokens(tokens);
  return me();
}

module.exports = { register, login, refresh, me, logout, oauth, loadTokens, clearTokens, API };
