// Who is signed in right now, and their primary organization. Set after any
// successful auth flow; consumed by governance checks and Chroma scoping.
const auth = require("./auth");

let current = { userId: null, orgId: null, orgName: null, role: null, orgChromaUrl: "" };

async function refresh(user) {
  try {
    const u = user || (await auth.me());
    current.userId = u ? u.id : null;
    if (current.userId) {
      const memberships = await auth.request("GET", "/orgs/mine").catch(() => []);
      const first = Array.isArray(memberships) ? memberships[0] : null;
      current.orgId = first ? first.orgId : null;
      current.orgName = first && first.org ? first.org.name : null;
      current.role = first ? first.role : null;
      // Remote ChromaDB for the org's shared memory (blank = member-local).
      current.orgChromaUrl = (first && first.org && first.org.chromaUrl) || "";
    } else {
      current.orgId = current.orgName = current.role = null;
      current.orgChromaUrl = "";
    }
  } catch {
    current = { userId: null, orgId: null, orgName: null, role: null, orgChromaUrl: "" };
  }
  return current;
}

function get() {
  return current;
}

function clear() {
  current = { userId: null, orgId: null, orgName: null, role: null, orgChromaUrl: "" };
}

module.exports = { refresh, get, clear };
