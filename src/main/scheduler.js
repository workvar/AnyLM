// Background governance tasks: limit alerts, renewal notices, and scheduled
// usage reports. Runs on an hourly tick (plus a quick check after each chat).
const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const auth = require("./auth");
const identity = require("./identity");
const settings = require("./settings");
const notify = require("./notify");

const HOUR = 3600_000;
const ALERT_LEVELS = [75, 90, 100];
let timer = null;
let quickTimer = null;

function start() {
  if (timer) return;
  timer = setInterval(tick, HOUR);
  setTimeout(tick, 20_000); // first pass shortly after launch
}

// Called after each usage report so alerts fire promptly, debounced.
function checkSoon() {
  clearTimeout(quickTimer);
  quickTimer = setTimeout(() => checkLimits().catch(() => {}), 4000);
}

async function tick() {
  if (!auth.loadTokens()) return;
  await checkLimits().catch(() => {});
  await maybeReport().catch(() => {});
}

// --- limit alerts + renewal notices ---

async function checkLimits() {
  const limits = await auth.request("GET", "/usage/me");
  const s = settings.read();
  const alerts = { ...(s.govAlerts || {}) };
  let changed = false;

  for (const l of limits || []) {
    const caps = [l.tokenLimit, l.budgetTokens].filter((c) => c != null);
    if (!caps.length) continue;
    const cap = Math.min(...caps);
    const pct = cap > 0 ? Math.round((l.usedTokens / cap) * 100) : 0;
    const periodKey = `${l.period}:${periodStamp(l.period)}`;
    const prev = alerts[l.orgId] || { periodKey: null, level: 0 };

    // New period → allowance renewed.
    if (prev.periodKey && prev.periodKey !== periodKey) {
      notify.send(
        "renewal",
        "Token allowance renewed",
        `Your ${l.period} allowance for ${l.orgName} has reset (${cap.toLocaleString()} tokens available).`
      );
      prev.level = 0;
    }
    prev.periodKey = periodKey;

    // Crossed a new alert threshold → usage warning.
    for (const level of ALERT_LEVELS) {
      if (pct >= level && prev.level < level) {
        prev.level = level;
        notify.send(
          "usage",
          level >= 100 ? "Token limit reached" : `Token usage at ${level}%`,
          level >= 100
            ? `You've used your ${l.period} allowance for ${l.orgName}. Requests will be blocked until it renews.`
            : `You've used ${pct}% of your ${l.period} allowance for ${l.orgName} (${l.usedTokens.toLocaleString()} / ${cap.toLocaleString()} tokens).`
        );
      }
    }
    alerts[l.orgId] = prev;
    changed = true;
  }
  if (changed) settings.write({ govAlerts: alerts });
}

// Stable string for the current window of a period (renewal detection).
function periodStamp(period) {
  const now = new Date();
  if (period === "daily") return now.toISOString().slice(0, 10);
  if (period === "weekly") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }
  if (period === "monthly") return now.toISOString().slice(0, 7);
  return "lifetime";
}

// --- scheduled usage reports ---

const REPORT_INTERVALS = { daily: 1, weekly: 7, monthly: 30 };

async function maybeReport() {
  const s = settings.read();
  const days = REPORT_INTERVALS[s.reportFrequency];
  if (!days) return;
  const last = s.lastReportAt ? new Date(s.lastReportAt).getTime() : 0;
  if (Date.now() - last < days * 24 * HOUR) return;

  const who = identity.get();
  if (!who.orgId || !["manager", "admin", "owner"].includes(who.role)) return;

  const file = await exportUsageCsv(who.orgId, defaultReportPath(who.orgName));
  settings.write({ lastReportAt: new Date().toISOString() });
  notify.send(
    "report",
    "Usage report ready",
    `Your ${s.reportFrequency} usage report for ${who.orgName} was saved to ${file}`
  );
}

function defaultReportPath(orgName) {
  const dir = path.join(app.getPath("documents"), "AnyLM Reports");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const safe = String(orgName || "org").replace(/[^a-zA-Z0-9-_ ]/g, "");
  return path.join(dir, `${safe}-usage-${stamp}.csv`);
}

// Fetch the org's usage CSV and write it to `dest`. Returns the path.
async function exportUsageCsv(orgId, dest) {
  const csv = await auth.requestText("GET", `/orgs/${orgId}/usage/export`);
  fs.writeFileSync(dest, csv);
  return dest;
}

module.exports = { start, checkSoon, exportUsageCsv };
