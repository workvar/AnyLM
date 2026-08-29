// Reads the current synced state of a board back out of Firestore. This is
// what the renderer polls on an interval while a board view is open — see
// docs/github-projects-sync.md for why polling stands in for a push channel
// here. Kept separate from sync.ts: this only reads what's already synced,
// it never talks to GitHub itself.
import { col, query } from "../data/store";
import type { GhField, GhView } from "./graphql";

export interface BoardProject {
  id: string;
  title: string;
  url: string;
  closed: boolean;
  fields: GhField[];
  views: GhView[];
  updatedAt: string | null;
}

export interface BoardItem {
  id: string;
  contentType: string;
  title: string;
  url: string | null;
  state: string | null;
  assignees: string[];
  labels: string[];
  fieldValues: { fieldId: string; fieldName: string; value: string | number | null }[];
  updatedAt: string | null;
}

export interface BoardSnapshot {
  project: BoardProject | null;
  items: BoardItem[];
}

export async function getBoardSnapshot(userId: string, projectId: string): Promise<BoardSnapshot> {
  const projectSnap = await col("githubProjects").doc(projectId).get<BoardProject & { ownerUid: string }>();
  const project = projectSnap.exists && projectSnap.data()!.ownerUid === userId ? projectSnap.data() : null;
  if (!project) return { project: null, items: [] };

  const items = await query("githubProjectItems")
    .where("ownerUid", "==", userId)
    .where("projectId", "==", projectId)
    .get<BoardItem>();

  return { project, items };
}

export async function listConnectedProjects(
  userId: string
): Promise<{ id: string; title: string; url: string; ownerLogin: string; number: number }[]> {
  return query("githubProjects")
    .where("ownerUid", "==", userId)
    .get<{ title: string; url: string; ownerLogin: string; number: number }>();
}

export async function disconnectProject(userId: string, projectId: string): Promise<void> {
  const snap = await col("githubProjects").doc(projectId).get<{ ownerUid: string }>();
  if (!snap.exists || snap.data()!.ownerUid !== userId) return;
  await col("githubProjects").doc(projectId).delete();
  const items = await query("githubProjectItems")
    .where("ownerUid", "==", userId)
    .where("projectId", "==", projectId)
    .get<{ id: string }>();
  for (const row of items) await col("githubProjectItems").doc(row.id).delete();
}
