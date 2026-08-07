// Organization dashboard: overview, members, policies, usage, settings.
// Role-aware: members see their own usage and personal policies; managers get
// org policies and usage; admins/owners manage members, limits, and pricing.
import { el, node } from "./dom.js";
import { promptText } from "./prompt.js";
import { initPolicyModal, openPolicyModal } from "./policy-editor.js";
import { POLICY_TEMPLATES } from "./policy-templates.js";
import { createSwitch } from "./switch.js";

const rank = { member: 0, manager: 1, admin: 2, owner: 3 };

// View state. The payloads come straight from the governance API and are
// rendered field-by-field, so they are typed loosely on purpose; the shapes
// that matter (Policy, Identity) are checked where they cross the IPC bridge.
interface OrgViewState {
  org: any;
  usage: any;
  limits: any[];
  personal: any[];
  orgPolicies: any[];
  audit: any[];
  myInvites: any[];
  orgInvites: any[];
  teams: any[];
  apiKeys: any[];
  tab: string;
}

const s: OrgViewState = {
  org: null, // GET /orgs/:id result (members + myRole) or null
  usage: null, // org usage summary (managers+)
  limits: [], // my limits across orgs
  personal: [], // my personal policies
  orgPolicies: [],
  audit: [],
  myInvites: [], // pending invitations addressed to me
  orgInvites: [], // pending invitations sent by this org (admin)
  teams: [], // teams with rolled-up usage (manager+)
  apiKeys: [], // my API keys
  tab: "overview",
};

function myRole() {
  return s.org ? s.org.myRole : null;
}
function can(min) {
  return s.org && rank[myRole()] >= rank[min];
}

// ---------- data ----------

async function refresh() {
  const memberships = await window.api.gov("GET", "/orgs/mine");
  const first = memberships && memberships[0];
  [s.limits, s.personal, s.myInvites, s.apiKeys] = await Promise.all<any>([
    window.api.gov("GET", "/usage/me").catch(() => []),
    window.api.gov("GET", "/policies/mine").catch(() => []),
    window.api.gov("GET", "/invites/mine").catch(() => []),
    window.api.gov("GET", "/apikeys").catch(() => []),
  ]);
  if (!first) {
    s.org = s.usage = null;
    s.orgPolicies = s.orgInvites = s.teams = [];
    return;
  }
  s.org = await window.api.gov("GET", `/orgs/${first.orgId}`);
  if (can("manager")) {
    [s.orgPolicies, s.usage, s.audit, s.teams] = await Promise.all([
      window.api.gov("GET", `/orgs/${s.org.id}/policies`).catch(() => []),
      window.api.gov("GET", `/orgs/${s.org.id}/usage`).catch(() => null),
      window.api.gov("GET", `/orgs/${s.org.id}/audit`).catch(() => []),
      window.api.gov("GET", `/orgs/${s.org.id}/teams`).catch(() => []),
    ]);
  } else {
    s.orgPolicies = [];
    s.usage = null;
    s.audit = [];
    s.teams = [];
  }
  s.orgInvites = can("admin")
    ? await window.api.gov("GET", `/orgs/${s.org.id}/invites`).catch(() => [])
    : [];
}

export async function openOrgView() {
  await refresh();
  render();
}

// ---------- shell ----------

function tabs() {
  const t = [["overview", "Overview"], ["policies", "Policies"]];
  if (can("admin")) t.splice(1, 0, ["members", "Members"]);
  if (can("admin")) t.push(["teams", "Teams"]);
  if (can("manager")) t.push(["usage", "Usage & Billing"]);
  if (can("admin")) t.push(["compliance", "Compliance"]);
  t.push(["apikeys", "API Keys"]);
  if (can("admin")) t.push(["settings", "Settings"]);
  return t;
}

function render() {
  el("org-title").textContent = s.org ? s.org.name : "Organization";
  const actions = el("org-actions");
  actions.innerHTML = "";
  if (s.org) {
    actions.appendChild(node("span", `role-badge role-${myRole()}`, myRole()));
  }

  const bar = el("org-tabs");
  bar.innerHTML = "";
  const list = tabs();
  if (!list.some(([id]) => id === s.tab)) s.tab = "overview";
  for (const [id, label] of list) {
    const b = node("button", id === s.tab ? "active" : "", label);
    b.onclick = () => {
      s.tab = id;
      render();
    };
    bar.appendChild(b);
  }
  bar.classList.toggle("hidden", !s.org);

  const body = el("org-body");
  body.innerHTML = "";
  if (!s.org) return renderNoOrg(body);
  if (s.tab === "overview") renderOverview(body);
  else if (s.tab === "members") renderMembers(body);
  else if (s.tab === "policies") renderPolicies(body);
  else if (s.tab === "teams") renderTeams(body);
  else if (s.tab === "usage") renderUsage(body);
  else if (s.tab === "compliance") renderCompliance(body);
  else if (s.tab === "apikeys") renderApiKeys(body);
  else if (s.tab === "settings") renderSettings(body);
}

// Pending invitations addressed to me (accept / decline).
function invitesForMe() {
  const wrap = node("div", "org-table");
  for (const inv of s.myInvites) {
    const row = node("div", "org-row policy-row");
    const main = node("div", "org-cell org-who");
    main.appendChild(node("div", "org-who-name", inv.org ? inv.org.name : "Organization"));
    main.appendChild(node("div", "org-who-mail", `Invited as ${inv.role}`));
    row.appendChild(main);
    const accept = node("button", "primary small", "Accept");
    accept.onclick = async () => {
      await window.api.gov("POST", `/invites/${inv.id}/accept`);
      await openOrgView();
    };
    const decline = node("button", "ghost small danger", "Decline");
    decline.onclick = async () => {
      await window.api.gov("POST", `/invites/${inv.id}/decline`);
      await openOrgView();
    };
    const actions = node("div", "org-cell org-row-actions");
    actions.append(accept, decline);
    row.appendChild(node("div", "org-cell"));
    row.appendChild(actions);
    wrap.appendChild(row);
  }
  return wrap;
}

// ---------- sections ----------

function renderNoOrg(body) {
  const wrap = node("div", "org-empty");
  wrap.appendChild(node("h2", "org-empty-title", "No organization yet"));
  wrap.appendChild(
    node(
      "p",
      "org-empty-sub",
      "Create an organization to share knowledge, govern usage, and set per-member token budgets. Or ask an admin to add you by email."
    )
  );
  const create = node("button", "primary", "Create organization");
  create.onclick = async () => {
    const name = await promptText("Organization name", "");
    if (!name) return;
    await window.api.gov("POST", "/orgs", { name });
    await openOrgView();
  };
  wrap.appendChild(create);
  body.appendChild(wrap);

  if (s.myInvites.length) {
    body.appendChild(sectionTitle("Invitations for you"));
    body.appendChild(invitesForMe());
  }
  body.appendChild(sectionTitle("My usage"));
  body.appendChild(limitsCards());
  body.appendChild(sectionTitle("My policies", personalAddButton()));
  body.appendChild(policyList(s.personal, "personal"));
  renderApiKeys(body);
}

function renderOverview(body) {
  if (s.myInvites.length) {
    body.appendChild(sectionTitle("Invitations for you"));
    body.appendChild(invitesForMe());
  }
  body.appendChild(sectionTitle("My usage"));
  body.appendChild(limitsCards());
  if (s.usage) {
    body.appendChild(sectionTitle("Organization at a glance"));
    const row = node("div", "org-cards");
    row.appendChild(statCard("Members", String(s.usage.members.length)));
    row.appendChild(statCard("Tokens used", s.usage.totalTokens.toLocaleString()));
    row.appendChild(statCard("Spend", money(s.usage.totalCost, s.usage.currency)));
    row.appendChild(
      statCard("Rate", `${money(s.usage.pricePerUnit, s.usage.currency)} / ${s.usage.tokensPerUnit.toLocaleString()} tokens`)
    );
    body.appendChild(row);
  }
}

function limitsCards() {
  const row = node("div", "org-cards");
  if (!s.limits.length) {
    row.appendChild(node("div", "grid-empty", "No usage limits apply to you."));
    return row;
  }
  for (const l of s.limits) {
    const caps = [l.tokenLimit, l.budgetTokens].filter((c) => c != null);
    const cap = caps.length ? Math.min(...caps) : null;
    const card = node("div", "org-card");
    card.appendChild(node("div", "org-card-title", l.orgName));
    card.appendChild(
      node(
        "div",
        "org-card-big",
        cap != null ? `${l.usedTokens.toLocaleString()} / ${cap.toLocaleString()}` : l.usedTokens.toLocaleString()
      )
    );
    card.appendChild(
      node("div", "org-card-sub", `${l.period} tokens · ${money(l.usedCost, l.currency)} spent`)
    );
    if (cap != null) {
      const track = node("div", "usage-track");
      const bar = node("div", "usage-bar");
      const pct = Math.min(100, Math.round((l.usedTokens / cap) * 100));
      bar.style.width = `${pct}%`;
      if (pct >= 90) bar.classList.add("warn");
      track.appendChild(bar);
      card.appendChild(track);
    }
    row.appendChild(card);
  }
  return row;
}

function renderMembers(body) {
  // Invite (pending until accepted — no instant membership).
  const form = node("div", "org-add-row");
  const email = document.createElement("input");
  email.className = "auth-input";
  email.placeholder = "user@company.com";
  const role = roleSelect("member");
  const add = node("button", "primary", "Send invitation");
  add.onclick = async () => {
    if (!email.value.trim()) return;
    try {
      await window.api.gov("POST", `/orgs/${s.org.id}/invites`, {
        email: email.value.trim(),
        role: role.value,
      });
      email.value = "";
      toast("Invitation sent. They'll see it when they open AnyLM.");
      await openOrgView();
    } catch (e) {
      toast(e.message);
    }
  };
  form.append(email, role, add);
  body.appendChild(sectionTitle("Invite a member"));
  body.appendChild(form);

  if (s.orgInvites.length) {
    body.appendChild(sectionTitle("Pending invitations"));
    const pend = node("div", "org-table");
    for (const inv of s.orgInvites) {
      const row = node("div", "org-row policy-row");
      const main = node("div", "org-cell org-who");
      main.appendChild(node("div", "org-who-name", inv.email));
      main.appendChild(
        node("div", "org-who-mail", `${inv.role} · invited ${new Date(inv.createdAt).toLocaleDateString()}`)
      );
      row.appendChild(main);
      row.appendChild(node("div", "org-cell"));
      const revoke = node("button", "ghost small danger", "Revoke");
      revoke.onclick = async () => {
        await window.api.gov("DELETE", `/orgs/${s.org.id}/invites/${inv.id}`);
        await openOrgView();
      };
      const actions = node("div", "org-cell org-row-actions");
      actions.appendChild(revoke);
      row.appendChild(actions);
      pend.appendChild(row);
    }
    body.appendChild(pend);
  }

  body.appendChild(sectionTitle("Members"));
  const table = node("div", "org-table");
  table.appendChild(headRow(["Member", "Role", "Team", "Token limit", "Period", "Budget", ""]));
  for (const m of s.org.members) {
    table.appendChild(memberRow(m));
  }
  body.appendChild(table);
}

function memberRow(m) {
  const row = node("div", "org-row");
  const who = node("div", "org-cell org-who");
  who.appendChild(node("div", "org-who-name", m.user.name || m.user.email));
  who.appendChild(node("div", "org-who-mail", m.user.email));
  row.appendChild(who);

  const patch: Record<string, any> = {};
  const save = async () => {
    try {
      await window.api.gov("PATCH", `/orgs/${s.org.id}/members/${m.id}`, patch);
      await openOrgView();
    } catch (e) {
      toast(e.message);
    }
  };

  const role = roleSelect(m.role);
  if (m.role === "owner") {
    role.disabled = true;
  }
  role.onchange = () => {
    patch.role = role.value;
    save();
  };
  row.appendChild(wrapCell(role));

  // Team assignment (rolled-up budgets).
  const team = document.createElement("select");
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "—";
  team.appendChild(none);
  for (const t of s.teams) {
    const o = document.createElement("option");
    o.value = t.id;
    o.textContent = t.name;
    if (t.id === m.teamId) o.selected = true;
    team.appendChild(o);
  }
  team.onchange = () => {
    patch.teamId = team.value || null;
    save();
  };
  row.appendChild(wrapCell(team));

  const limit = numInput(m.tokenLimit, "∞");
  limit.onchange = () => {
    patch.tokenLimit = limit.value === "" ? null : Number(limit.value);
    save();
  };
  row.appendChild(wrapCell(limit));

  const period = document.createElement("select");
  for (const p of ["daily", "weekly", "monthly", "lifetime"]) {
    const o = document.createElement("option");
    o.value = p;
    o.textContent = p;
    if (p === m.limitPeriod) o.selected = true;
    period.appendChild(o);
  }
  period.onchange = () => {
    patch.limitPeriod = period.value;
    save();
  };
  row.appendChild(wrapCell(period));

  const budget = numInput(m.budgetLimit, "none");
  budget.step = "0.01";
  budget.onchange = () => {
    patch.budgetLimit = budget.value === "" ? null : Number(budget.value);
    save();
  };
  row.appendChild(wrapCell(budget));

  const actions = node("div", "org-cell org-row-actions");
  if (m.role !== "owner") {
    const rm = node("button", "ghost small danger", "Remove");
    rm.onclick = async () => {
      try {
        await window.api.gov("DELETE", `/orgs/${s.org.id}/members/${m.id}`);
        await openOrgView();
      } catch (e) {
        toast(e.message);
      }
    };
    actions.appendChild(rm);
  }
  row.appendChild(actions);
  return row;
}

function renderPolicies(body) {
  if (can("manager")) {
    const add = node("button", "primary small", "+ Org policy");
    add.onclick = () =>
      openPolicyModal({
        scope: "org",
        orgId: s.org.id,
        members: s.org.members,
        onSaved: openOrgView,
      });
    body.appendChild(sectionTitle("Organization policies", add));

    // One-click compliance presets.
    const tpl = node("div", "tpl-row");
    for (const t of POLICY_TEMPLATES) {
      const b = node("button", "ghost small", `+ ${t.label}`);
      b.title = t.description;
      b.onclick = async () => {
        try {
          for (const p of t.policies) {
            await window.api.gov("POST", "/policies", { ...p, orgId: s.org.id });
          }
          toast(`${t.label} added.`);
          await openOrgView();
        } catch (e) {
          toast(e.message);
        }
      };
      tpl.appendChild(b);
    }
    body.appendChild(tpl);
    body.appendChild(policyList(s.orgPolicies, "org"));
  }
  body.appendChild(sectionTitle("My personal policies", personalAddButton()));
  body.appendChild(policyList(s.personal, "personal"));
}

function personalAddButton() {
  const add = node("button", "primary small", "+ Personal policy");
  add.onclick = () => openPolicyModal({ scope: "personal", onSaved: openOrgView });
  return add;
}

const TYPE_LABEL = {
  content_filter: "Content filter",
  pii: "PII",
  model_allowlist: "Model allowlist",
  rate_limit: "Rate limit",
  token_limit: "Token limit",
};

function policyList(policies, scope) {
  const wrap = node("div", "org-table");
  if (!policies.length) {
    wrap.appendChild(node("div", "grid-empty", "No policies defined."));
    return wrap;
  }
  for (const p of policies) {
    const row = node("div", "org-row policy-row");
    const main = node("div", "org-cell org-who");
    main.appendChild(node("div", "org-who-name", p.name));
    const target =
      scope === "org" && p.userId
        ? memberEmail(p.userId) || "one member"
        : scope === "org"
        ? "everyone"
        : "me";
    main.appendChild(node("div", "org-who-mail", `${TYPE_LABEL[p.type] || p.type} · ${p.action} · ${target}`));
    row.appendChild(main);

    const toggleWrap = createSwitch(!!p.enabled, async (next) => {
      await window.api.gov("PATCH", `/policies/${p.id}`, { enabled: next });
    });
    row.appendChild(wrapCell(toggleWrap));

    const edit = node("button", "ghost small", "Edit");
    edit.onclick = () =>
      openPolicyModal({
        scope,
        orgId: scope === "org" ? s.org.id : null,
        members: scope === "org" ? s.org.members : [],
        policy: p,
        onSaved: openOrgView,
      });
    const del = node("button", "ghost small danger", "Delete");
    del.onclick = async () => {
      await window.api.gov("DELETE", `/policies/${p.id}`);
      await openOrgView();
    };
    const actions = node("div", "org-cell org-row-actions");
    actions.append(edit, del);
    row.appendChild(actions);
    wrap.appendChild(row);
  }
  return wrap;
}

function memberEmail(userId) {
  const m = (s.org.members || []).find((x) => x.userId === userId);
  return m ? m.user.email : null;
}

function renderUsage(body) {
  if (!s.usage) {
    body.appendChild(node("div", "grid-empty", "Usage data unavailable."));
    return;
  }
  const exportBtn = node("button", "ghost small", "Export CSV");
  exportBtn.onclick = async () => {
    try {
      const path = await window.api.exportUsage(s.org.id);
      if (path) toast(`Saved to ${path}`);
    } catch (e) {
      toast(e.message);
    }
  };
  const row = node("div", "org-cards");
  row.appendChild(statCard("Total tokens", s.usage.totalTokens.toLocaleString()));
  row.appendChild(statCard("Total spend", money(s.usage.totalCost, s.usage.currency)));
  body.appendChild(sectionTitle("Totals", exportBtn));
  body.appendChild(row);

  body.appendChild(sectionTitle("Per member"));
  const table = node("div", "org-table");
  table.appendChild(headRow(["Member", "Used (period)", "Limit", "All time", "Spend"]));
  for (const r of s.usage.members) {
    const tr = node("div", "org-row cols-5");
    const who = node("div", "org-cell org-who");
    who.appendChild(node("div", "org-who-name", r.name || r.email));
    who.appendChild(node("div", "org-who-mail", `${r.role} · ${r.period}`));
    tr.appendChild(who);
    tr.appendChild(node("div", "org-cell", r.usedTokens.toLocaleString()));
    tr.appendChild(node("div", "org-cell", r.tokenLimit != null ? r.tokenLimit.toLocaleString() : "∞"));
    tr.appendChild(node("div", "org-cell", r.allTimeTokens.toLocaleString()));
    tr.appendChild(node("div", "org-cell", money(r.usedCost, s.usage.currency)));
    table.appendChild(tr);
  }
  body.appendChild(table);

  body.appendChild(sectionTitle("Audit log"));
  const log = node("div", "org-audit");
  if (!s.audit.length) log.appendChild(node("div", "grid-empty", "No activity yet."));
  for (const a of s.audit) {
    const line = node("div", "audit-line");
    line.appendChild(node("span", "audit-action", a.action));
    line.appendChild(node("span", "audit-detail", a.detail || ""));
    line.appendChild(node("span", "audit-time", new Date(a.createdAt).toLocaleString()));
    log.appendChild(line);
  }
  body.appendChild(log);
}

// --- Teams (departments with rolled-up budgets) ---

function renderTeams(body) {
  const add = node("button", "primary small", "+ New team");
  add.onclick = async () => {
    const name = await promptText("Team name", "");
    if (!name) return;
    await window.api.gov("POST", `/orgs/${s.org.id}/teams`, { name });
    await openOrgView();
  };
  body.appendChild(sectionTitle("Teams", add));
  if (!s.teams.length) {
    body.appendChild(node("div", "grid-empty", "No teams yet. Create one, then assign members from the Members tab."));
    return;
  }
  const cards = node("div", "org-cards");
  for (const t of s.teams) {
    const card = node("div", "org-card");
    card.appendChild(node("div", "org-card-title", t.name));
    const caps = [t.tokenLimit].filter((c) => c != null);
    card.appendChild(
      node(
        "div",
        "org-card-big",
        caps.length ? `${t.usedTokens.toLocaleString()} / ${t.tokenLimit.toLocaleString()}` : t.usedTokens.toLocaleString()
      )
    );
    card.appendChild(
      node(
        "div",
        "org-card-sub",
        `${t.memberCount} member${t.memberCount === 1 ? "" : "s"} · ${t.limitPeriod} · ${money(t.usedCost, s.org.currency)} spent` +
          (t.budgetLimit != null ? ` · budget ${money(t.budgetLimit, s.org.currency)}` : "")
      )
    );
    if (t.tokenLimit != null) {
      const track = node("div", "usage-track");
      const bar = node("div", "usage-bar");
      const pct = Math.min(100, Math.round((t.usedTokens / t.tokenLimit) * 100));
      bar.style.width = `${pct}%`;
      if (pct >= 90) bar.classList.add("warn");
      track.appendChild(bar);
      card.appendChild(track);
    }

    const controls = node("div", "team-controls");
    const limit = numInput(t.tokenLimit, "token cap");
    limit.onchange = () => saveTeam(t.id, { tokenLimit: limit.value === "" ? null : Number(limit.value) });
    const budget = numInput(t.budgetLimit, "budget");
    budget.step = "0.01";
    budget.onchange = () => saveTeam(t.id, { budgetLimit: budget.value === "" ? null : Number(budget.value) });
    const period = document.createElement("select");
    for (const p of ["daily", "weekly", "monthly", "lifetime"]) {
      const o = document.createElement("option");
      o.value = p;
      o.textContent = p;
      if (p === t.limitPeriod) o.selected = true;
      period.appendChild(o);
    }
    period.onchange = () => saveTeam(t.id, { limitPeriod: period.value });
    const del = node("button", "ghost small danger", "Delete");
    del.onclick = async () => {
      await window.api.gov("DELETE", `/orgs/${s.org.id}/teams/${t.id}`);
      await openOrgView();
    };
    controls.append(limit, budget, period, del);
    card.appendChild(controls);
    cards.appendChild(card);
  }
  body.appendChild(cards);
}

async function saveTeam(teamId, patch) {
  try {
    await window.api.gov("PATCH", `/orgs/${s.org.id}/teams/${teamId}`, patch);
    await openOrgView();
  } catch (e) {
    toast(e.message);
  }
}

// --- Compliance: prompt/response logging with retention ---

function renderCompliance(body) {
  body.appendChild(sectionTitle("Logging settings"));
  const form = node("div", "org-settings");
  const enabledWrap = node("label", "pol-check");
  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.checked = !!s.org.loggingEnabled;
  enabledWrap.appendChild(enabled);
  enabledWrap.appendChild(document.createTextNode(" Log member prompts and responses for compliance review"));
  form.appendChild(enabledWrap);
  const retention = labeled(form, "Retention (days)", numInput(s.org.retentionDays));
  const save = node("button", "primary small", "Save logging settings");
  save.onclick = async () => {
    await window.api.gov("PATCH", `/orgs/${s.org.id}`, {
      loggingEnabled: enabled.checked,
      retentionDays: Number(retention.value) || 30,
    });
    toast("Saved.");
    await openOrgView();
  };
  form.appendChild(save);
  body.appendChild(form);

  const clear = node("button", "ghost small danger", "Clear all logs");
  clear.onclick = async () => {
    await window.api.gov("DELETE", `/orgs/${s.org.id}/logs`);
    await openOrgView();
  };
  body.appendChild(sectionTitle("Interaction logs", clear));

  const search = document.createElement("input");
  search.className = "auth-input";
  search.placeholder = "Search prompts and responses…";
  body.appendChild(search);
  const holder = node("div", "org-audit log-list");
  body.appendChild(holder);

  async function load() {
    const q = search.value.trim();
    const logs = await window.api
      .gov("GET", `/orgs/${s.org.id}/logs${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .catch(() => []);
    holder.innerHTML = "";
    if (!logs.length) {
      holder.appendChild(node("div", "grid-empty", s.org.loggingEnabled ? "No logs yet." : "Logging is disabled."));
      return;
    }
    for (const l of logs) {
      const line = node("div", "log-entry");
      const head = node("div", "audit-line");
      head.appendChild(node("span", "audit-action", l.email));
      head.appendChild(node("span", "audit-detail", l.model));
      head.appendChild(node("span", "audit-time", new Date(l.createdAt).toLocaleString()));
      line.appendChild(head);
      line.appendChild(node("div", "log-prompt", `→ ${l.prompt}`));
      line.appendChild(node("div", "log-response", `← ${l.response}`));
      const flags = safeFlags(l.flags);
      if (flags.length) line.appendChild(node("div", "log-flags", `⚖ ${flags.join(" · ")}`));
      holder.appendChild(line);
    }
  }
  let searchTimer;
  search.oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 350);
  };
  load();
}

function safeFlags(json) {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// --- API keys (route other local apps through AnyLM's governance) ---

function renderApiKeys(body) {
  const add = node("button", "primary small", "+ New key");
  add.onclick = async () => {
    const name = await promptText("Key name (e.g. 'VS Code extension')", "");
    if (name == null) return;
    try {
      const created = await window.api.gov("POST", "/apikeys", { name });
      await navigator.clipboard.writeText(created.key).catch(() => {});
      window.alert(
        `API key created and copied to clipboard.\n\n${created.key}\n\nStore it now — it won't be shown again.`
      );
      await openOrgView();
    } catch (e) {
      toast(e.message);
    }
  };
  body.appendChild(sectionTitle("API keys", add));
  // The endpoint now runs inside AnyLM itself rather than a separate backend,
  // so show the address it actually bound to instead of describing it.
  const hint = node("div", "org-hint", "Loading endpoint address...");
  body.appendChild(hint);
  window.api
    .proxyStatus()
    .then(({ running, baseUrl }) => {
      hint.textContent = running
        ? `Other local apps can call ${baseUrl}/chat/completions with one of these keys. Your policies, limits, and logging apply to that traffic too.`
        : "The local endpoint is turned off. Enable it in Settings to let other apps route through AnyLM.";
    })
    .catch(() => {
      hint.textContent =
        "Other local apps can call AnyLM's OpenAI-compatible endpoint with one of these keys. Your policies, limits, and logging apply to that traffic too.";
    });
  const table = node("div", "org-table");
  if (!s.apiKeys.length) table.appendChild(node("div", "grid-empty", "No API keys yet."));
  for (const k of s.apiKeys) {
    const row = node("div", "org-row policy-row");
    const main = node("div", "org-cell org-who");
    main.appendChild(node("div", "org-who-name", k.name));
    main.appendChild(
      node(
        "div",
        "org-who-mail",
        `${k.prefix}… · created ${new Date(k.createdAt).toLocaleDateString()}` +
          (k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : " · never used") +
          (k.revoked ? " · revoked" : "")
      )
    );
    row.appendChild(main);
    row.appendChild(node("div", "org-cell"));
    const actions = node("div", "org-cell org-row-actions");
    if (!k.revoked) {
      const revoke = node("button", "ghost small danger", "Revoke");
      revoke.onclick = async () => {
        await window.api.gov("DELETE", `/apikeys/${k.id}`);
        await openOrgView();
      };
      actions.appendChild(revoke);
    }
    row.appendChild(actions);
    table.appendChild(row);
  }
  body.appendChild(table);
}

function renderSettings(body) {
  body.appendChild(sectionTitle("Pricing & defaults"));
  const form = node("div", "org-settings");

  const name = labeled(form, "Organization name", textInput(s.org.name));
  const tpu = labeled(form, "Tokens per unit", numInput(s.org.tokensPerUnit));
  const ppu = labeled(form, "Price per unit", numInput(s.org.pricePerUnit));
  ppu.step = "0.01";
  const cur = labeled(form, "Currency", textInput(s.org.currency));
  const dlim = labeled(form, "Default token limit (blank = unlimited)", numInput(s.org.defaultTokenLimit, ""));
  const dper = document.createElement("select");
  for (const p of ["daily", "weekly", "monthly", "lifetime"]) {
    const o = document.createElement("option");
    o.value = p;
    o.textContent = p;
    if (p === s.org.defaultLimitPeriod) o.selected = true;
    dper.appendChild(o);
  }
  labeledEl(form, "Default limit period", dper);

  const hint = node(
    "div",
    "org-hint",
    "Example: 500 tokens per unit at 5.00 means every 500 tokens cost 5.00. Budgets use this rate."
  );
  form.appendChild(hint);

  const save = node("button", "primary", "Save settings");
  save.onclick = async () => {
    try {
      await window.api.gov("PATCH", `/orgs/${s.org.id}`, {
        name: name.value.trim() || s.org.name,
        tokensPerUnit: Number(tpu.value) || 1000,
        pricePerUnit: Number(ppu.value) || 0,
        currency: cur.value.trim() || "USD",
        defaultTokenLimit: dlim.value === "" ? null : Number(dlim.value),
        defaultLimitPeriod: dper.value,
      });
      await openOrgView();
      toast("Saved.");
    } catch (e) {
      toast(e.message);
    }
  };
  form.appendChild(save);
  body.appendChild(form);

  body.appendChild(sectionTitle("SSO & auto-join"));
  const sso = node("div", "org-settings");
  const domains = labeled(
    sso,
    "Auto-join email domains (comma-separated, e.g. acme.com)",
    textInput(s.org.autoJoinDomains || "")
  );
  const provider = document.createElement("select");
  for (const [v, label] of [["any", "Any sign-in method"], ["google", "Google"], ["github", "GitHub"]]) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = label;
    if (v === s.org.ssoProvider) o.selected = true;
    provider.appendChild(o);
  }
  labeledEl(sso, "Required sign-in provider", provider);
  const reqWrap = node("label", "pol-check");
  const required = document.createElement("input");
  required.type = "checkbox";
  required.checked = !!s.org.ssoRequired;
  reqWrap.appendChild(required);
  reqWrap.appendChild(
    document.createTextNode(" Enforce SSO: members (and matching domains) must use the provider above")
  );
  sso.appendChild(reqWrap);
  sso.appendChild(
    node(
      "div",
      "org-hint",
      "Anyone signing up or logging in with a matching email domain is automatically added to this organization as a member."
    )
  );
  const saveSso = node("button", "primary", "Save SSO settings");
  saveSso.onclick = async () => {
    try {
      await window.api.gov("PATCH", `/orgs/${s.org.id}`, {
        autoJoinDomains: domains.value.trim(),
        ssoProvider: provider.value,
        ssoRequired: required.checked,
      });
      toast("Saved.");
      await openOrgView();
    } catch (e) {
      toast(e.message);
    }
  };
  sso.appendChild(saveSso);
  body.appendChild(sso);

  body.appendChild(sectionTitle("Shared memory (ChromaDB)"));
  const mem = node("div", "org-settings");
  const chromaUrl = labeled(
    mem,
    "Remote ChromaDB URL (blank = each member's local server)",
    textInput(s.org.chromaUrl || "")
  );
  chromaUrl.placeholder = "https://chroma.acme.com:8000";
  mem.appendChild(
    node(
      "div",
      "org-hint",
      "When set, the organization's shared knowledge collection is stored on this server, so every member reads and writes one centrally synced memory. Members' personal and project memory stays on their own machine."
    )
  );
  const saveMem = node("button", "primary", "Save memory settings");
  saveMem.onclick = async () => {
    try {
      await window.api.gov("PATCH", `/orgs/${s.org.id}`, { chromaUrl: chromaUrl.value.trim() });
      toast("Saved. Members pick this up on their next sign-in.");
      await openOrgView();
    } catch (e) {
      toast(e.message);
    }
  };
  mem.appendChild(saveMem);
  body.appendChild(mem);

  if (myRole() === "owner") {
    body.appendChild(sectionTitle("Danger zone"));
    const del = node("button", "ghost danger", "Delete organization");
    del.onclick = async () => {
      const sure = await promptText(`Type "${s.org.name}" to delete`, "");
      if (sure !== s.org.name) return;
      await window.api.gov("DELETE", `/orgs/${s.org.id}`);
      await openOrgView();
    };
    body.appendChild(del);
  }
}

// ---------- small helpers ----------

function sectionTitle(text: string, action?: Node | null) {
  const h = node("div", "org-section-head");
  h.appendChild(node("h2", "org-section-title", text));
  if (action) h.appendChild(action);
  return h;
}

function statCard(label, value) {
  const c = node("div", "org-card");
  c.appendChild(node("div", "org-card-title", label));
  c.appendChild(node("div", "org-card-big", value));
  return c;
}

function headRow(cols) {
  const r = node("div", `org-row org-head cols-${cols.length}`);
  for (const c of cols) r.appendChild(node("div", "org-cell", c));
  return r;
}

function wrapCell(elm) {
  const c = node("div", "org-cell");
  c.appendChild(elm);
  return c;
}

function roleSelect(value) {
  const sel = document.createElement("select");
  for (const r of ["member", "manager", "admin", ...(value === "owner" ? ["owner"] : [])]) {
    const o = document.createElement("option");
    o.value = r;
    o.textContent = r;
    if (r === value) o.selected = true;
    sel.appendChild(o);
  }
  return sel;
}

function numInput(value, placeholder = "") {
  const i = document.createElement("input");
  i.type = "number";
  i.className = "auth-input";
  i.min = "0";
  i.placeholder = placeholder;
  if (value != null) i.value = String(value);
  return i;
}

function textInput(value) {
  const i = document.createElement("input");
  i.className = "auth-input";
  if (value != null) i.value = String(value);
  return i;
}

function labeled(form, label, input) {
  labeledEl(form, label, input);
  return input;
}

function labeledEl(form, label, elm) {
  const w = node("div", "org-field");
  w.appendChild(node("label", "field-label", label));
  w.appendChild(elm);
  form.appendChild(w);
  return elm;
}

function money(v, currency) {
  return `${(v || 0).toFixed(2)} ${currency || ""}`.trim();
}

let toastTimer;
function toast(msg) {
  let t = document.getElementById("org-toast");
  if (!t) {
    t = node("div", "org-toast");
    t.id = "org-toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

export function initOrg() {
  initPolicyModal();
}
