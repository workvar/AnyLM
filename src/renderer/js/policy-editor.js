// Policy editor modal: create/edit governance policies (personal or org).
import { el } from "./dom.js";

let ctx = null; // { scope, orgId, members, policy, onSaved }

const CFG_SECTIONS = {
  content_filter: "policy-cfg-content",
  pii: "policy-cfg-pii",
  model_allowlist: "policy-cfg-models",
  rate_limit: "policy-cfg-rate",
  token_limit: "policy-cfg-tokens",
};

function showCfg(type) {
  for (const id of Object.values(CFG_SECTIONS)) {
    el(id).classList.toggle("hidden", CFG_SECTIONS[type] !== id);
  }
}

function fillTargets(members, selectedUserId) {
  const sel = el("policy-target");
  sel.innerHTML = "";
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "Everyone in the organization";
  sel.appendChild(all);
  for (const m of members || []) {
    const o = document.createElement("option");
    o.value = m.userId;
    o.textContent = m.user.name ? `${m.user.name} (${m.user.email})` : m.user.email;
    if (m.userId === selectedUserId) o.selected = true;
    sel.appendChild(o);
  }
}

function readConfig(type) {
  if (type === "content_filter") {
    return {
      patterns: el("policy-patterns")
        .value.split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      regex: el("policy-regex").checked,
    };
  }
  if (type === "pii") {
    const types = [...el("policy-pii-types").querySelectorAll("input:checked")].map((i) => i.value);
    return { types };
  }
  if (type === "model_allowlist") {
    return {
      models: el("policy-models")
        .value.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
  if (type === "rate_limit") {
    const cfg = {};
    if (el("policy-maxhour").value !== "") cfg.maxPerHour = Number(el("policy-maxhour").value);
    if (el("policy-start").value !== "" && el("policy-end").value !== "") {
      cfg.startHour = Number(el("policy-start").value);
      cfg.endHour = Number(el("policy-end").value);
    }
    return cfg;
  }
  if (type === "token_limit") {
    const cfg = {};
    if (el("policy-maxreq").value !== "") cfg.maxPerRequest = Number(el("policy-maxreq").value);
    if (el("policy-maxday").value !== "") cfg.maxPerDay = Number(el("policy-maxday").value);
    return cfg;
  }
  return {};
}

function writeConfig(type, cfg) {
  el("policy-patterns").value = Array.isArray(cfg.patterns) ? cfg.patterns.join("\n") : "";
  el("policy-regex").checked = !!cfg.regex;
  for (const i of el("policy-pii-types").querySelectorAll("input")) {
    i.checked = Array.isArray(cfg.types) ? cfg.types.includes(i.value) : true;
  }
  el("policy-models").value = Array.isArray(cfg.models) ? cfg.models.join(", ") : "";
  el("policy-maxhour").value = cfg.maxPerHour != null ? cfg.maxPerHour : "";
  el("policy-start").value = cfg.startHour != null ? cfg.startHour : "";
  el("policy-end").value = cfg.endHour != null ? cfg.endHour : "";
  el("policy-maxreq").value = cfg.maxPerRequest != null ? cfg.maxPerRequest : "";
  el("policy-maxday").value = cfg.maxPerDay != null ? cfg.maxPerDay : "";
}

export function openPolicyModal(context) {
  ctx = context;
  const p = ctx.policy || null;
  el("policy-modal-title").textContent = p ? "Edit policy" : "New policy";
  el("policy-modal-sub").textContent =
    ctx.scope === "org"
      ? "Applies to your organization's members when they interact with any model."
      : "A personal guardrail applied to your own prompts.";
  el("policy-name").value = p ? p.name : "";
  el("policy-type").value = p ? p.type : "content_filter";
  el("policy-type").disabled = !!p;
  el("policy-action").value = p ? p.action : "block";
  writeConfig(el("policy-type").value, p ? safeParse(p.config) : {});
  showCfg(el("policy-type").value);
  el("policy-target-row").classList.toggle("hidden", ctx.scope !== "org");
  if (ctx.scope === "org") fillTargets(ctx.members, p ? p.userId : null);
  el("policy-error").textContent = "";
  el("policy-modal").classList.remove("hidden");
}

function close() {
  el("policy-modal").classList.add("hidden");
  ctx = null;
}

async function save() {
  if (!ctx) return;
  const type = el("policy-type").value;
  const name = el("policy-name").value.trim();
  if (!name) {
    el("policy-error").textContent = "Give the policy a name.";
    return;
  }
  const payload = {
    name,
    action: el("policy-action").value,
    config: readConfig(type),
  };
  try {
    if (ctx.policy) {
      if (ctx.scope === "org") payload.userId = el("policy-target").value || null;
      await window.api.gov("PATCH", `/policies/${ctx.policy.id}`, payload);
    } else {
      payload.type = type;
      if (ctx.scope === "org") {
        payload.orgId = ctx.orgId;
        payload.userId = el("policy-target").value || null;
      }
      await window.api.gov("POST", "/policies", payload);
    }
    const done = ctx.onSaved;
    close();
    if (done) await done();
  } catch (e) {
    el("policy-error").textContent = e.message;
  }
}

function safeParse(json) {
  try {
    return JSON.parse(json) || {};
  } catch {
    return {};
  }
}

export function initPolicyModal() {
  el("policy-type").onchange = (e) => showCfg(e.target.value);
  el("policy-cancel").onclick = close;
  el("policy-save").onclick = save;
  el("policy-modal").onclick = (e) => {
    if (e.target.id === "policy-modal") close();
  };
}
