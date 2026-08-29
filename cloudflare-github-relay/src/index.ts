// Entry point: verify the webhook, dispatch by GitHub event type. Everything
// else lives in handlers/ so this stays a router, not a place logic grows.
import type { Env } from "./env";
import { verifyGitHubSignature } from "./verify";
import { handleProjectsV2 } from "./handlers/projectsV2";
import { handleProjectsV2Item } from "./handlers/projectsV2Item";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const rawBody = await request.text();
    const signature = request.headers.get("X-Hub-Signature-256");
    const ok = await verifyGitHubSignature(rawBody, signature, env.GITHUB_WEBHOOK_SECRET);
    if (!ok) return new Response("Invalid signature", { status: 401 });

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
        // Issues and pull_request events are consumed by the app's GraphQL
        // poll today (their content maps onto project *items*, which the
        // projects_v2_item handler above already keeps current); add cases
        // here if standalone (non-project) issue/PR sync is wanted later.
        default:
          return new Response(`Ignored event: ${event}`, { status: 202 });
      }
    } catch (err) {
      // Log and 200 back to GitHub anyway: GitHub retries on non-2xx, and a
      // Firestore hiccup shouldn't trigger a retry storm — the app's next
      // periodic resync will self-heal a missed update.
      console.error(`[anylm-github-relay] ${event} handling failed:`, err);
      return new Response("Handled with errors; see Worker logs", { status: 200 });
    }

    return new Response("OK", { status: 200 });
  },
};
