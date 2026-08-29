// Public surface of the GitHub Projects sync feature — what ipc.ts wires up.
// Each concern lives in its own file: auth.ts (device-flow sign-in),
// graphql.ts (reads from GitHub), sync.ts (GitHub -> Firestore), board.ts
// (Firestore -> renderer), mutations.ts (renderer edits -> GitHub).
export * as githubAuth from "./auth";
export * as githubSync from "./sync";
export * as githubBoard from "./board";
export * as githubMutations from "./mutations";
export type { FieldValueUpdate } from "./mutations";
