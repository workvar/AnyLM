// Firebase project coordinates for the desktop app.
//
// These values are NOT secrets. A Firebase web config is designed to ship in
// client bundles; it identifies the project, it does not authorize anything.
// Authorization is firestore.rules, which is evaluated against the signed-in
// user's ID token, so a copy of this file on its own buys nothing.
//
// They come from app/.env via env.ts. Override any of them with env vars when
// pointing a dev build at the emulator or a staging project.
import { env } from "./env";

export const projectId = env.firebase.projectId;
export const apiKey = env.firebase.apiKey;
export const authDomain = env.firebase.authDomain;

// Firebase Hosting serves exactly one page, the OAuth sign-in handler. There
// is no API origin: the governance API runs inside this process, against
// Firestore directly. See src/main/api/.
export const SITE_URL = env.siteUrl;
export const SIGNIN_URL = env.signinUrl;
