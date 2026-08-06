// Pre-flight enforcement: may this user send this request right now?
//
// IMPORTANT, AND DELIBERATE: this runs on the user's own machine. It is
// honest bookkeeping, not a security boundary. Firestore rules stop a user
// raising their own limit or rewriting history, but nothing stops a patched
// build from skipping the check entirely. That is an accepted trade for
// staying on Firebase's free tier; see firestore.rules for the reasoning.
import { query } from "../data/store";
import { countSince, parseJson, sumTokens, sumTokensForUsers } from "./shared";
import { effective } from "./policies";
import { limitsFor } from "./usage";
import { teamUsage } from "./teams";
import { orgDoc } from "./orgs";

export interface CheckResult {
  allowed: boolean;
  reason?: string;
  warnings: string[];
  remainingTokens: number | null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Allowed-hours window and requests-per-hour ceiling. */
async function checkRate(
  userId: string,
  name: string,
  cfg: Record<string, unknown>,
  action: string,
  warnings: string[]
): Promise<CheckResult | null> {
  const startHour = num(cfg.startHour);
  const endHour = num(cfg.endHour);
  if (startHour != null && endHour != null) {
    const h = new Date().getHours();
    const inWindow =
      startHour <= endHour ? h >= startHour && h < endHour : h >= startHour || h < endHour;
    if (!inWindow) {
      const msg = `LLM access is limited to ${startHour}:00-${endHour}:00 by policy "${name}".`;
      if (action === "warn") warnings.push(msg);
      else return { allowed: false, reason: msg, warnings: [], remainingTokens: null };
    }
  }
  const maxPerHour = num(cfg.maxPerHour);
  if (maxPerHour != null && maxPerHour > 0) {
    const count = await countSince(userId, new Date(Date.now() - 3600_000));
    if (count >= maxPerHour) {
      const msg = `Hourly request limit reached (${maxPerHour}/hour, policy "${name}"). Try again later.`;
      if (action === "warn") warnings.push(msg);
      else return { allowed: false, reason: msg, warnings: [], remainingTokens: null };
    }
  }
  return null;
}

/** token_limit policies: per-request prompt size and per-day consumption. */
async function checkTokens(
  userId: string,
  name: string,
  cfg: Record<string, unknown>,
  action: string,
  promptTokens: number,
  warnings: string[]
): Promise<CheckResult | null> {
  const maxPerRequest = num(cfg.maxPerRequest);
  if (maxPerRequest != null && maxPerRequest > 0 && promptTokens > maxPerRequest) {
    const msg = `Prompt is ~${promptTokens.toLocaleString()} tokens; policy "${name}" allows ${maxPerRequest.toLocaleString()} per request.`;
    if (action === "warn") warnings.push(msg);
    else return { allowed: false, reason: msg, warnings: [], remainingTokens: null };
  }
  const maxPerDay = num(cfg.maxPerDay);
  if (maxPerDay != null && maxPerDay > 0) {
    const used = await sumTokens(userId, null, "daily");
    if (used >= maxPerDay) {
      const msg = `Daily token limit reached (${used.toLocaleString()} / ${maxPerDay.toLocaleString()}, policy "${name}").`;
      if (action === "warn") warnings.push(msg);
      else return { allowed: false, reason: msg, warnings: [], remainingTokens: 0 };
    }
    if (used >= maxPerDay * 0.9) {
      warnings.push(
        `You have used ${Math.round((used / maxPerDay) * 100)}% of your daily token allowance (policy "${name}").`
      );
    }
  }
  return null;
}

/** Team pools: block when the shared allowance is exhausted. */
async function checkTeams(userId: string, warnings: string[]): Promise<CheckResult | null> {
  const members = await query("members")
    .where("userId", "==", userId)
    .get<{ orgId: string; teamId: string | null }>();

  for (const m of members) {
    if (!m.teamId) continue;
    const { team, usedTokens } = await teamUsage(m.teamId);
    if (!team) continue;
    const org = (await orgDoc(m.orgId)) as unknown as {
      pricePerUnit: number;
      tokensPerUnit: number;
    } | null;
    if (!org) continue;

    const budgetTokens =
      team.budgetLimit != null && org.pricePerUnit > 0
        ? Math.floor((team.budgetLimit / org.pricePerUnit) * org.tokensPerUnit)
        : null;
    const caps = [team.tokenLimit, budgetTokens].filter((c) => c != null) as number[];
    if (!caps.length) continue;
    const cap = Math.min(...caps);

    if (usedTokens >= cap) {
      return {
        allowed: false,
        reason: `Your team "${team.name}" has exhausted its ${team.limitPeriod} allowance (${usedTokens.toLocaleString()} / ${cap.toLocaleString()} tokens).`,
        warnings,
        remainingTokens: 0,
      };
    }
    if (usedTokens >= cap * 0.9) {
      warnings.push(
        `Team "${team.name}" has used ${Math.round((usedTokens / cap) * 100)}% of its ${team.limitPeriod} allowance.`
      );
    }
  }
  return null;
}

export async function check(
  userId: string,
  model: string,
  promptTokens = 0
): Promise<CheckResult> {
  const warnings: string[] = [];
  const limits = await limitsFor(userId);

  for (const l of limits) {
    const caps = [l.tokenLimit, l.budgetTokens].filter((c) => c != null) as number[];
    if (!caps.length) continue;
    const cap = Math.min(...caps);
    if (l.usedTokens >= cap) {
      const kind = l.budgetTokens != null && cap === l.budgetTokens ? "budget" : "token limit";
      return {
        allowed: false,
        reason: `Your ${l.period} ${kind} for ${l.orgName} is exhausted (${l.usedTokens.toLocaleString()} / ${cap.toLocaleString()} tokens). Contact your admin.`,
        warnings,
        remainingTokens: 0,
      };
    }
    if (l.usedTokens >= cap * 0.9) {
      warnings.push(
        `You have used ${Math.round((l.usedTokens / cap) * 100)}% of your ${l.period} allowance for ${l.orgName}.`
      );
    }
  }

  const teamVerdict = await checkTeams(userId, warnings);
  if (teamVerdict) return teamVerdict;

  for (const p of await effective(userId)) {
    const cfg = parseJson(p.config);
    if (p.type === "model_allowlist") {
      const allowed = Array.isArray(cfg.models) ? (cfg.models as string[]) : [];
      if (allowed.length && !allowed.includes(model)) {
        if (p.action === "warn") {
          warnings.push(`Model "${model}" is outside the allowed list (${p.name}).`);
        } else {
          return {
            allowed: false,
            reason: `Model "${model}" is not allowed by policy "${p.name}". Allowed: ${allowed.join(", ")}.`,
            warnings,
            remainingTokens: null,
          };
        }
      }
    }
    if (p.type === "rate_limit") {
      const res = await checkRate(userId, p.name, cfg, p.action, warnings);
      if (res) return { ...res, warnings };
    }
    if (p.type === "token_limit") {
      const res = await checkTokens(userId, p.name, cfg, p.action, promptTokens, warnings);
      if (res) return { ...res, warnings };
    }
  }

  const remaining = limits
    .map((l) => {
      const caps = [l.tokenLimit, l.budgetTokens].filter((c) => c != null) as number[];
      return caps.length ? Math.min(...caps) - l.usedTokens : null;
    })
    .filter((r) => r != null) as number[];

  return {
    allowed: true,
    warnings,
    remainingTokens: remaining.length ? Math.max(0, Math.min(...remaining)) : null,
  };
}

export { sumTokensForUsers };
