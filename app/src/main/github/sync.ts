// Pulls a GitHub Projects v2 board into Firestore. This is the path that
// runs at connect-time and on a manual "Resync" — the Cloudflare Worker
// (../../cloudflare-github-relay) keeps individual items current in between
// via webhooks, but field/view *definitions* only change here, and a fresh
// connect needs a full snapshot regardless.
import { col, query } from "../data/store";
import { fetchProjectBoard, type GhProject } from "./graphql";
import { tokenFor } from "./auth";

export interface SyncedProject {
  projectId: string;
  title: string;
  url: string;
}

/** Pull one board by owner login + project number, and write it in full. */
export async function syncProject(userId: string, login: string, number: number): Promise<SyncedProject> {
  const token = await tokenFor(userId);
  const board = await fetchProjectBoard(token, login, number);
  await writeBoard(userId, login, board);
  return { projectId: board.id, title: board.title, url: board.url };
}

/** Re-pull every project this user has already connected. Used for the
 *  periodic "did we miss anything" resync, since field/view changes and any
 *  webhook the relay failed to deliver both only self-heal here. */
export async function resyncAll(userId: string): Promise<void> {
  const projects = await query("githubProjects").where("ownerUid", "==", userId).get<{
    ownerLogin: string;
    number: number;
  }>();
  const token = await tokenFor(userId);
  for (const p of projects) {
    try {
      const board = await fetchProjectBoard(token, p.ownerLogin, p.number);
      await writeBoard(userId, p.ownerLogin, board);
    } catch {
      // One board failing (deleted upstream, token scope changed) shouldn't
      // stop the rest from resyncing.
    }
  }
}

async function writeBoard(userId: string, login: string, board: GhProject): Promise<void> {
  await col("githubProjects").doc(board.id).merge({
    ownerUid: userId,
    ownerLogin: login,
    number: board.number,
    title: board.title,
    url: board.url,
    closed: board.closed,
    fields: board.fields,
    views: board.views,
    updatedAt: new Date(),
  });

  const existing = await query("githubProjectItems")
    .where("ownerUid", "==", userId)
    .where("projectId", "==", board.id)
    .get<{ id: string }>();
  const seen = new Set<string>();

  for (const item of board.items) {
    seen.add(item.id);
    await col("githubProjectItems").doc(item.id).merge({
      itemId: item.id,
      projectId: board.id,
      ownerUid: userId,
      contentType: item.contentType,
      title: item.title,
      url: item.url,
      state: item.state,
      assignees: item.assignees,
      labels: item.labels,
      fieldValues: item.fieldValues,
      updatedAt: new Date(),
    });
  }

  // Anything that used to be on the board and isn't any more (removed,
  // converted, or the query simply didn't return it) gets cleaned up so
  // the UI doesn't show stale cards.
  for (const row of existing) {
    if (!seen.has(row.id)) await col("githubProjectItems").doc(row.id).delete();
  }
}
