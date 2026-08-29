// The in-process API.
//
// This is where the Cloud Functions Express app ended up. Keeping the same
// REST-shaped surface means `auth.request("GET", "/orgs/mine")` still works
// and nothing downstream had to change: ipc.ts, identity.ts, governance.ts,
// scheduler.ts, skills/exec.ts and the renderer's window.api.gov() calls are
// all untouched by the move off Cloud Functions.
//
// The paths are also the seam to put a server back behind, if usage
// enforcement ever needs to be adversarial-proof. Swap this dispatch for an
// HTTPS call and everything above it is none the wiser.
import { ApiError, currentUserId, serialize } from "./shared";
import * as orgs from "./orgs";
import * as policies from "./policies";
import * as usage from "./usage";
import { check } from "./usage-check";
import * as teams from "./teams";
import * as invites from "./invites";
import * as logs from "./logs";
import * as apikeys from "./apikeys";
import * as connectors from "./connectors";
import * as users from "./users";
import * as tokenStore from "../token-store";

type Body = Record<string, any>;
type Handler = (params: string[], body: Body) => Promise<unknown>;

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
}

const routes: Route[] = [];

/** `/orgs/:id/teams/:teamId` becomes a regex capturing both segments. */
function route(method: string, path: string, handler: Handler): void {
  const pattern = new RegExp(
    "^" + path.replace(/:[A-Za-z]+/g, "([^/]+)").replace(/\//g, "\\/") + "$"
  );
  routes.push({ method, pattern, handler });
}

const uid = () => currentUserId();

async function email(): Promise<string> {
  const tokens = tokenStore.load();
  if (!tokens) throw new ApiError(401, "Not authenticated");
  return (await users.me()).email;
}

// --- auth ---------------------------------------------------------------------
route("GET", "/auth/me", () => users.me());
route("POST", "/auth/logout", async () => {
  // With no server there is no refresh-token revocation endpoint to call.
  // Clearing local storage is the whole of sign-out; the refresh token stays
  // valid until it expires, which is why token-store.ts encrypts it.
  tokenStore.clear();
  return { success: true };
});

// --- orgs ----------------------------------------------------------------------
route("POST", "/orgs", (_p, b) => orgs.create(uid(), b.name));
route("GET", "/orgs/mine", () => orgs.mine(uid()));

// Declared before /orgs/:id/usage so the more specific path wins.
route("GET", "/orgs/:id/usage/export", ([id]) => usage.exportCsv(id, uid()));

route("GET", "/orgs/:id", ([id]) => orgs.get(id, uid()));
route("PATCH", "/orgs/:id", ([id], b) => orgs.update(id, uid(), b));
route("DELETE", "/orgs/:id", ([id]) => orgs.remove(id, uid()));

route("POST", "/orgs/:id/members", ([id], b) =>
  orgs.addMember(id, uid(), b.email, b.role || "member")
);
route("PATCH", "/orgs/:id/members/:memberId", ([id, memberId], b) =>
  orgs.updateMember(id, uid(), memberId, b)
);
route("DELETE", "/orgs/:id/members/:memberId", ([id, memberId]) =>
  orgs.removeMember(id, uid(), memberId)
);

route("GET", "/orgs/:id/policies", ([id]) => policies.forOrg(id, uid()));
route("GET", "/orgs/:id/usage", ([id]) => usage.orgSummary(id, uid()));
route("GET", "/orgs/:id/audit", ([id]) => orgs.auditLog(id, uid()));

route("POST", "/orgs/:id/invites", ([id], b) =>
  invites.create(id, uid(), b.email, b.role || "member")
);
route("GET", "/orgs/:id/invites", ([id]) => invites.listForOrg(id, uid()));
route("DELETE", "/orgs/:id/invites/:inviteId", ([id, inviteId]) =>
  invites.revoke(id, uid(), inviteId)
);

route("POST", "/orgs/:id/teams", ([id], b) => teams.create(id, uid(), b.name));
route("GET", "/orgs/:id/teams", ([id]) => teams.listWithUsage(id, uid()));
route("PATCH", "/orgs/:id/teams/:teamId", ([id, teamId], b) =>
  teams.update(id, uid(), teamId, b)
);
route("DELETE", "/orgs/:id/teams/:teamId", ([id, teamId]) => teams.remove(id, uid(), teamId));

route("GET", "/orgs/:id/logs", ([id], b) => logs.list(id, uid(), b.q));
route("DELETE", "/orgs/:id/logs", ([id]) => logs.clear(id, uid()));

// --- policies --------------------------------------------------------------------
route("GET", "/policies/effective", async () => {
  const userId = uid();
  const [list, limits] = await Promise.all([policies.effective(userId), usage.limitsFor(userId)]);
  return { policies: list, limits };
});
route("GET", "/policies/mine", () => policies.personal(uid()));
route("POST", "/policies", (_p, b) => policies.create(uid(), b as policies.PolicyInput));
route("PATCH", "/policies/:id", ([id], b) => policies.update(uid(), id, b));
route("DELETE", "/policies/:id", ([id]) => policies.remove(uid(), id));

// --- usage -----------------------------------------------------------------------
route("POST", "/usage/check", (_p, b) =>
  check(uid(), b.model || "", Math.max(0, Math.round(b.promptTokens || 0)))
);
route("POST", "/usage/report", (_p, b) => usage.report(uid(), b));
route("GET", "/usage/me", () => usage.limitsFor(uid()));

// --- logs ------------------------------------------------------------------------
route("POST", "/logs", (_p, b) => logs.record(uid(), b));

// --- invites (invitee side) --------------------------------------------------------
route("GET", "/invites/mine", async () => invites.mine(await email()));
route("POST", "/invites/:id/accept", async ([id]) => invites.accept(uid(), await email(), id));
route("POST", "/invites/:id/decline", async ([id]) => invites.decline(uid(), await email(), id));

// --- api keys ----------------------------------------------------------------------
route("POST", "/apikeys", (_p, b) => apikeys.create(uid(), b.name));
route("GET", "/apikeys", () => apikeys.list(uid()));
route("DELETE", "/apikeys/:id", ([id]) => apikeys.revoke(uid(), id));

// --- connectors ---------------------------------------------------------------------
route("GET", "/connectors", () => connectors.status(uid()));
route("POST", "/connectors/:provider/start", ([provider]) => connectors.connect(uid(), provider));
route("GET", "/connectors/:provider/token", ([provider]) => connectors.freshToken(uid(), provider));
route("DELETE", "/connectors/:provider", ([provider]) => connectors.disconnect(uid(), provider));

// --- dispatch -------------------------------------------------------------------------

interface Match {
  handler: Handler;
  params: string[];
  /** Query-string values, merged into the body so handlers read one object. */
  queryParams: Record<string, string>;
}

function match(method: string, path: string): Match | null {
  const [rawPath, search] = path.split("?");
  const clean = rawPath.replace(/\/+$/, "") || "/";

  // Callers pass query strings on GETs (`/orgs/:id/logs?q=term`). There is no
  // HTTP layer left to separate them from the body, so do it here and merge.
  const queryParams: Record<string, string> = {};
  if (search) new URLSearchParams(search).forEach((v, k) => (queryParams[k] = v));

  for (const r of routes) {
    if (r.method !== method) continue;
    const m = clean.match(r.pattern);
    if (m) {
      return { handler: r.handler, params: m.slice(1).map(decodeURIComponent), queryParams };
    }
  }
  return null;
}

/**
 * Call the API. Mirrors what `fetch` used to return, including throwing an
 * Error whose message is what the UI shows, so callers did not change.
 */
export async function request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const hit = match(method, path);
  if (!hit) throw new ApiError(404, `No route for ${method} ${path}`);
  const merged = { ...hit.queryParams, ...((body as Body) || {}) };
  const result = await hit.handler(hit.params, merged);
  return serialize(result) as T;
}

/** Text responses, currently only the usage CSV export. */
export async function requestText(method: string, path: string): Promise<string> {
  return String(await request<string>(method, path));
}

export { ApiError };
