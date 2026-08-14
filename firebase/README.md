# AnyLM on Firebase (free Spark plan, no server)

AnyLM runs entirely on Firebase's free tier. There is no backend process
anywhere: not the retired NestJS service, not Cloud Functions.

```
firebase/
  firestore.rules          the authorization layer, read this first
  firestore.indexes.json   composite indexes (no TTL policy, see below)
  hosting/public/          one page: the Google / GitHub sign-in handler
```

Everything the old server did now runs inside the Electron main process, in
`app/src/main/api/`, talking to Firestore over its REST API under the
signed-in user's own ID token.

## Why there is no server

Cloud Functions cannot be deployed on the free Spark plan; it requires Blaze
and a card on file. Auth, Firestore and Hosting are all still free, so the
rest of the stack stayed put and the service logic moved into the app.

## What this costs you

**Usage limits became cooperative rather than adversarial-proof.** Firestore
rules can stop a user raising their own limit, editing org policy, reading a
colleague's prompts, or rewriting usage history. They cannot force a client to
report its usage at all. A patched build could stay silent.

That is a smaller hole than it first appears: anyone able to patch the app can
also run `ollama run` directly and skip AnyLM entirely. The limits are for
managed machines and honest users. If that stops being true, the fix is one
seam wide, see "Putting a server back" below.

**Domain auto-join and SSO enforcement are gone.** Both required reading orgs
the caller is not a member of, which without a server means making every org's
domain list readable by anyone signed in. Invitations replace them.

**Google Calendar connector is disabled.** Google requires a client secret at
its token endpoint to issue refresh tokens, even for desktop apps using PKCE.
Outlook works, because Microsoft supports genuine public clients.

**Log retention is swept, not automatic.** Firestore TTL policies need a
billing account, so `expiresAt` is enforced by a bounded delete that runs when
an admin opens the compliance view (`app/src/main/api/logs.ts`). Expired
entries are never returned by `list()`, but they can sit in the collection
until someone looks. Enabling billing and restoring the TTL field override is
a two-line upgrade.

## One-time setup

1. Create a Firebase project. Put its id in `.firebaserc` (copy from
   `.firebaserc.example`). Stay on the free **Spark** plan.
2. **Authentication → Sign-in method**: enable Email/Password, Google, and
   GitHub. For GitHub, register an OAuth app whose callback is
   `https://<project>.firebaseapp.com/__/auth/handler`, then paste its client
   id and secret into the Firebase console. That secret lives in your Firebase
   project, never in the app bundle.
3. **Firestore**: create the database in Native mode. Location is permanent.
4. **Project settings → Your apps**: register a **Web** app. This is what makes
   Hosting serve `/__/firebase/init.js`, which the sign-in page relies on.
5. `cp ../app/.env.example ../app/.env`, then set `ANYLM_FIREBASE_PROJECT` and
   `ANYLM_FIREBASE_API_KEY`. Both are project identifiers, not secrets, and
   are compiled into the shipped app by `app/scripts/build-env.js`.
6. `firebase deploy` (rules, indexes and the one hosting page).

No billing account, no card, no functions.

## How sign-in works

Firebase Auth's popup flow needs a DOM, which an Electron main process does
not have, and Google refuses sign-in inside embedded webviews. So:

1. The app opens a loopback port and launches the system browser at
   `https://<project>.web.app/?provider=google&port=<port>`.
2. That page runs `signInWithRedirect` with the Firebase web SDK (redirect,
   not popup — the app opens the page with `?provider=…`, and browsers block
   popups that are not tied to a user gesture). Firebase's own hosted OAuth
   handler holds the provider secrets inside your project.
3. The page redirects to `http://127.0.0.1:<port>/callback?refreshToken=...`.
4. The app trades the refresh token for a session and stores it through the OS
   keystore (`app/src/main/token-store.ts`).

The result comes back on a loopback port rather than the `anylm://` scheme
deliberately. Any application on the machine can register a URL scheme and
intercept a callback; only one process can hold a TCP port. This is the
pattern RFC 8252 recommends for native apps.

Email and password sign-in skips all of this and calls Identity Toolkit
directly from the app.

## Data model

| Collection | Doc id | Notes |
|---|---|---|
| `users` | uid | mirror of Firebase Auth, for email lookups |
| `orgs` | auto | `createdBy` is what authorises the owner membership |
| `members` | `<orgId>__<userId>` | composite id makes role checks a point read |
| `teams` | auto | |
| `invites` | auto | carries `orgName`, since invitees cannot read the org yet |
| `policies` | auto | `config` is a JSON string, as the renderer expects |
| `usage` | auto | append-only, server-stamped `createdAt` |
| `interactionLogs` | auto | TTL on `expiresAt` |
| `audit` | auto | append-only |
| `apiKeys` | sha256 of the key | knowing the key is what permits the read |
| `connectors` | `<userId>__<provider>` | owner-only |

Rules depend on those id conventions. `members` in particular: rules cannot run
queries, so a role check has to be `get()` on a predictable path.

## Putting a server back

The app calls its API through `auth.request(method, path, body)`, which
dispatches into `app/src/main/api/index.ts` using REST-shaped paths. That
indirection is deliberate. To restore authoritative enforcement, host that
same router (it is a plain dispatch table) and change `request()` to make an
HTTPS call. Nothing above that line knows the difference.

Options that do not need Blaze: Cloudflare Workers, Deno Deploy, or Render.
Firebase Auth and Firestore stay exactly as they are.

## Local development

```
firebase emulators:start --only firestore,auth,hosting
cd ../app && ANYLM_SITE_URL=http://127.0.0.1:5000 bun start
```

Or `./scripts/dev.sh --emulator` from the repo root.
