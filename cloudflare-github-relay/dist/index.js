var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/verify.ts
function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(toHex, "toHex");
function timingSafeEqual(a, b) {
  if (a.length !== b.length)
    return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++)
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
__name(timingSafeEqual, "timingSafeEqual");
async function verifyGitHubSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !signatureHeader.startsWith("sha256="))
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = `sha256=${toHex(mac)}`;
  return timingSafeEqual(expected, signatureHeader);
}
__name(verifyGitHubSignature, "verifyGitHubSignature");

// src/google-auth.ts
function base64url(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const b of bytes)
    binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(base64url, "base64url");
function pemToPkcs8(pem) {
  const clean = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++)
    bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
__name(pemToPkcs8, "pemToPkcs8");
var cached = null;
async function firestoreAccessToken(serviceAccountJson) {
  if (cached && cached.expiresAt - 6e4 > Date.now())
    return cached.token;
  const key = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1e3);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    })
  );
  const unsigned = `${header}.${claims}`;
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(key.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64url(signature)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`
  });
  if (!res.ok)
    throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1e3 };
  return cached.token;
}
__name(firestoreAccessToken, "firestoreAccessToken");

// src/values.ts
function encodeValue(v) {
  if (v === null || v === void 0)
    return { nullValue: null };
  if (typeof v === "string")
    return { stringValue: v };
  if (typeof v === "boolean")
    return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (v instanceof Date)
    return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(encodeValue) } };
  }
  if (typeof v === "object") {
    return { mapValue: { fields: encodeFields(v) } };
  }
  return { stringValue: String(v) };
}
__name(encodeValue, "encodeValue");
function encodeFields(obj) {
  const out = {};
  for (const [k, val] of Object.entries(obj))
    out[k] = encodeValue(val);
  return out;
}
__name(encodeFields, "encodeFields");

// src/firestore.ts
function projectIdFrom(serviceAccountJson) {
  return JSON.parse(serviceAccountJson).project_id;
}
__name(projectIdFrom, "projectIdFrom");
async function upsertDoc(serviceAccountJson, collection, id, fields) {
  const token = await firestoreAccessToken(serviceAccountJson);
  const projectId = projectIdFrom(serviceAccountJson);
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const res = await fetch(`${base}/${collection}/${encodeURIComponent(id)}?${mask}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ fields: encodeFields(fields) })
  });
  if (!res.ok) {
    throw new Error(`Firestore write to ${collection}/${id} failed (${res.status}): ${await res.text()}`);
  }
}
__name(upsertDoc, "upsertDoc");
async function deleteDoc(serviceAccountJson, collection, id) {
  const token = await firestoreAccessToken(serviceAccountJson);
  const projectId = projectIdFrom(serviceAccountJson);
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const res = await fetch(`${base}/${collection}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Firestore delete of ${collection}/${id} failed (${res.status}): ${await res.text()}`);
  }
}
__name(deleteDoc, "deleteDoc");
async function getDoc(serviceAccountJson, collection, id) {
  const token = await firestoreAccessToken(serviceAccountJson);
  const projectId = projectIdFrom(serviceAccountJson);
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const res = await fetch(`${base}/${collection}/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.status === 404)
    return null;
  if (!res.ok)
    throw new Error(`Firestore read of ${collection}/${id} failed (${res.status}): ${await res.text()}`);
  const doc = await res.json();
  const out = {};
  for (const [k, v] of Object.entries(doc.fields || {}))
    out[k] = v.stringValue ?? v;
  return out;
}
__name(getDoc, "getDoc");

// src/handlers/projectsV2.ts
async function handleProjectsV2(serviceAccountJson, payload) {
  const project = payload.projects_v2;
  if (payload.action === "deleted") {
    await deleteDoc(serviceAccountJson, "githubProjects", project.node_id);
    return;
  }
  await upsertDoc(serviceAccountJson, "githubProjects", project.node_id, {
    title: project.title,
    number: project.number,
    url: project.url || "",
    updatedAt: /* @__PURE__ */ new Date()
  });
}
__name(handleProjectsV2, "handleProjectsV2");

// src/handlers/projectsV2Item.ts
async function handleProjectsV2Item(serviceAccountJson, payload) {
  const item = payload.projects_v2_item;
  const itemId = item.node_id;
  const projectId = item.project_node_id;
  if (payload.action === "deleted") {
    await deleteDoc(serviceAccountJson, "githubProjectItems", itemId);
    return;
  }
  const project = await getDoc(serviceAccountJson, "githubProjects", projectId);
  if (!project || !project.ownerUid)
    return;
  await upsertDoc(serviceAccountJson, "githubProjectItems", itemId, {
    itemId,
    projectId,
    ownerUid: project.ownerUid,
    contentType: item.content_type || "DraftIssue",
    // Title/state/fieldValues need a GraphQL follow-up read (the webhook
    // payload alone doesn't carry them for this event) — the app does that
    // on its next poll tick, keyed off updatedAt below, rather than this
    // Worker calling back into GraphQL with a token it doesn't hold.
    updatedAt: /* @__PURE__ */ new Date()
  });
}
__name(handleProjectsV2Item, "handleProjectsV2Item");

// src/index.ts
var src_default = {
  async fetch(request, env) {
    if (request.method !== "POST")
      return new Response("Method not allowed", { status: 405 });
    const rawBody = await request.text();
    const signature = request.headers.get("X-Hub-Signature-256");
    const ok = await verifyGitHubSignature(rawBody, signature, env.GITHUB_WEBHOOK_SECRET);
    if (!ok)
      return new Response("Invalid signature", { status: 401 });
    const event = request.headers.get("X-GitHub-Event") || "";
    const payload = JSON.parse(rawBody);
    try {
      switch (event) {
        case "projects_v2":
          await handleProjectsV2(env.GOOGLE_SERVICE_ACCOUNT_JSON, payload);
          break;
        case "projects_v2_item":
          await handleProjectsV2Item(env.GOOGLE_SERVICE_ACCOUNT_JSON, payload);
          break;
        default:
          return new Response(`Ignored event: ${event}`, { status: 202 });
      }
    } catch (err) {
      console.error(`[anylm-github-relay] ${event} handling failed:`, err);
      return new Response("Handled with errors; see Worker logs", { status: 200 });
    }
    return new Response("OK", { status: 200 });
  }
};
export {
  src_default as default
};
//# sourceMappingURL=index.js.map
