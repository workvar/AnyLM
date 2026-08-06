// Governance calls made on behalf of an API-key caller.
//
// The key difference from auth.js: this never touches the signed-in user's
// session. It forwards the caller's own `anylm_` key straight through as the
// bearer, and the API resolves it to the owning account. That is what lets
// the proxy run locally without holding any credential or knowing any user
// id, and it means an API key can never inherit the desktop user's identity.
import { API_URL } from "../firebase-config";

async function call(method: string, path: string, bearer: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = ((await res.json().catch(() => ({}))) as any);
  if (!res.ok) {
    const err = new Error(data.message || `Request failed (${res.status})`) as HttpError;
    err.status = res.status;
    throw err;
  }
  return data;
}

// Policies that apply to the key's owner. Returns just the policy list; the
// endpoint also carries limits, which the proxy does not need because
// /usage/check already accounts for them.
async function effectivePolicies(bearer: string): Promise<Policy[]> {
  const data = await call("GET", "/policies/effective", bearer);
  return data.policies || [];
}

function check(bearer: string, model: string, promptTokens: number) {
  return call("POST", "/usage/check", bearer, { model, promptTokens });
}

function report(bearer, model, promptTokens, completionTokens) {
  return call("POST", "/usage/report", bearer, { model, promptTokens, completionTokens });
}

function log(bearer, entry) {
  return call("POST", "/logs", bearer, entry);
}

export { effectivePolicies, check, report, log };

