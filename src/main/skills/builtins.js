// Built-in connector skills. Each skill bundles system-prompt instructions
// with tools that call the provider's REST API using an OAuth token minted
// by the auth backend (see auth-backend/src/connectors).
//
// Tool shape: { name, description, risky, params, run(args, bearer) }.
// `run` returns a string for the model. Risky tools confirm with the user.

const MAX_OUTPUT = 20_000;

function clip(s) {
  const str = String(s == null ? "" : s);
  return str.length > MAX_OUTPUT ? str.slice(0, MAX_OUTPUT) + "\n…(truncated)" : str;
}

async function api(url, bearer, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) return `Error: HTTP ${res.status}\n${clip(text)}`;
  return clip(text || "(ok)");
}

const p = (name, description, required = false) => ({ name, description, required });

// ---------- Google Calendar ----------

const GCAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

const googleCalendar = {
  id: "google-calendar",
  name: "Google Calendar",
  builtin: true,
  connector: "google-calendar",
  description: "Read and create events on the user's primary Google Calendar.",
  instructions:
    "You can access the user's Google Calendar with the gcal_* tools. " +
    "Dates must be RFC3339 (e.g. 2026-07-03T09:00:00-07:00). When the user asks " +
    "about their schedule, call gcal_list_events instead of guessing. Confirm " +
    "details (title, time, attendees) before creating events.",
  tools: [
    {
      name: "gcal_list_events",
      description:
        "List events on the user's primary Google Calendar in a time window (defaults to the next 7 days).",
      risky: false,
      params: [
        p("time_min", "Window start, RFC3339 (default: now)"),
        p("time_max", "Window end, RFC3339 (default: now + 7 days)"),
        p("query", "Free-text search filter"),
        p("max_results", "Max events to return (default 10)"),
      ],
      run: async (args, bearer) => {
        const u = new URL(GCAL);
        u.searchParams.set("singleEvents", "true");
        u.searchParams.set("orderBy", "startTime");
        u.searchParams.set("timeMin", args.time_min || new Date().toISOString());
        u.searchParams.set(
          "timeMax",
          args.time_max || new Date(Date.now() + 7 * 864e5).toISOString()
        );
        u.searchParams.set("maxResults", String(args.max_results || 10));
        if (args.query) u.searchParams.set("q", String(args.query));
        return api(u.toString(), bearer);
      },
    },
    {
      name: "gcal_create_event",
      description: "Create an event on the user's primary Google Calendar.",
      risky: true,
      params: [
        p("title", "Event title", true),
        p("start", "Start time, RFC3339", true),
        p("end", "End time, RFC3339", true),
        p("description", "Event description"),
        p("attendees", "Comma-separated attendee emails"),
      ],
      run: async (args, bearer) => {
        const body = {
          summary: String(args.title || ""),
          description: String(args.description || ""),
          start: { dateTime: String(args.start || "") },
          end: { dateTime: String(args.end || "") },
        };
        if (args.attendees) {
          body.attendees = String(args.attendees)
            .split(",")
            .map((e) => ({ email: e.trim() }))
            .filter((a) => a.email);
        }
        return api(GCAL, bearer, { method: "POST", body: JSON.stringify(body) });
      },
    },
  ],
};

// ---------- Outlook (Microsoft Graph) ----------

const GRAPH = "https://graph.microsoft.com/v1.0/me";

const outlook = {
  id: "outlook",
  name: "Outlook",
  builtin: true,
  connector: "outlook",
  description: "Read calendar and mail, and send mail, via the user's Microsoft 365 account.",
  instructions:
    "You can access the user's Outlook calendar and mail with the outlook_* tools. " +
    "Dates must be ISO 8601 (e.g. 2026-07-03T09:00:00). Read before you write: check " +
    "the calendar before proposing times, and show the user a draft before sending mail.",
  tools: [
    {
      name: "outlook_list_events",
      description:
        "List events on the user's Outlook calendar in a time window (defaults to the next 7 days).",
      risky: false,
      params: [
        p("start", "Window start, ISO 8601 (default: now)"),
        p("end", "Window end, ISO 8601 (default: now + 7 days)"),
        p("max_results", "Max events to return (default 10)"),
      ],
      run: async (args, bearer) => {
        const u = new URL(`${GRAPH}/calendarView`);
        u.searchParams.set("startDateTime", args.start || new Date().toISOString());
        u.searchParams.set(
          "endDateTime",
          args.end || new Date(Date.now() + 7 * 864e5).toISOString()
        );
        u.searchParams.set("$top", String(args.max_results || 10));
        u.searchParams.set("$orderby", "start/dateTime");
        u.searchParams.set("$select", "subject,start,end,location,organizer,attendees");
        return api(u.toString(), bearer);
      },
    },
    {
      name: "outlook_create_event",
      description: "Create an event on the user's Outlook calendar.",
      risky: true,
      params: [
        p("title", "Event title", true),
        p("start", "Start time, ISO 8601", true),
        p("end", "End time, ISO 8601", true),
        p("body", "Event description"),
        p("attendees", "Comma-separated attendee emails"),
      ],
      run: async (args, bearer) => {
        const body = {
          subject: String(args.title || ""),
          body: { contentType: "text", content: String(args.body || "") },
          start: { dateTime: String(args.start || ""), timeZone: "UTC" },
          end: { dateTime: String(args.end || ""), timeZone: "UTC" },
        };
        if (args.attendees) {
          body.attendees = String(args.attendees)
            .split(",")
            .map((e) => ({ emailAddress: { address: e.trim() }, type: "required" }))
            .filter((a) => a.emailAddress.address);
        }
        return api(`${GRAPH}/events`, bearer, { method: "POST", body: JSON.stringify(body) });
      },
    },
    {
      name: "outlook_list_mail",
      description: "List recent messages in the user's Outlook inbox, optionally filtered by search.",
      risky: false,
      params: [
        p("query", "Search text (subject, sender, body)"),
        p("max_results", "Max messages to return (default 10)"),
      ],
      run: async (args, bearer) => {
        const u = new URL(`${GRAPH}/messages`);
        u.searchParams.set("$top", String(args.max_results || 10));
        u.searchParams.set("$select", "subject,from,receivedDateTime,bodyPreview,isRead");
        if (args.query) u.searchParams.set("$search", `"${String(args.query)}"`);
        return api(u.toString(), bearer);
      },
    },
    {
      name: "outlook_send_mail",
      description: "Send an email from the user's Outlook account.",
      risky: true,
      params: [
        p("to", "Comma-separated recipient emails", true),
        p("subject", "Email subject", true),
        p("body", "Plain-text email body", true),
      ],
      run: async (args, bearer) => {
        const message = {
          subject: String(args.subject || ""),
          body: { contentType: "text", content: String(args.body || "") },
          toRecipients: String(args.to || "")
            .split(",")
            .map((e) => ({ emailAddress: { address: e.trim() } }))
            .filter((r) => r.emailAddress.address),
        };
        const out = await api(`${GRAPH}/sendMail`, bearer, {
          method: "POST",
          body: JSON.stringify({ message, saveToSentItems: true }),
        });
        return out === "(ok)" ? "Email sent." : out;
      },
    },
  ],
};

module.exports = { BUILTIN_SKILLS: [googleCalendar, outlook] };
