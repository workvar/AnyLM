// Firebase project coordinates for the desktop app.
//
// These values are NOT secrets. A Firebase web config is designed to ship in
// client bundles; it identifies the project, it does not authorize anything.
// All authorization happens in the Cloud Function, and firestore.rules denies
// every direct client read and write, so a copy of this file buys nothing.
//
// They now come from app/.env via env.ts rather than being hardcoded here.
// Override any of them with env vars when pointing a dev build at the
// emulator or a staging project.
import { env } from "./env";

export const projectId = env.firebase.projectId;
export const apiKey = env.firebase.apiKey;
export const authDomain = env.firebase.authDomain;

// Where the hosted sign-in page and the governance API live. Hosting rewrites
// /api/** to the `api` function, so one origin covers both.
export const SITE_URL = env.siteUrl;
export const API_URL = env.apiUrl;
export const SIGNIN_URL = env.signinUrl;
