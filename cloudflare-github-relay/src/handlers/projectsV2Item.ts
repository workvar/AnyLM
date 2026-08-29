// Handles the `projects_v2_item` webhook: an item (issue, PR, or draft) was
// added to, edited on, or removed from a Projects v2 board. Field-definition
// and view changes are NOT covered by this event (GitHub doesn't emit
// webhooks for those yet), so those still come from the app's periodic
// GraphQL resync — this handler only keeps individual items current.
import { deleteDoc, getDoc, upsertDoc } from "../firestore";

interface ProjectsV2ItemPayload {
  action: "created" | "edited" | "deleted" | "reordered" | "archived" | "restored" | "converted";
  projects_v2_item: {
    id: number | string;
    node_id: string;
    project_node_id: string;
    content_node_id?: string;
    content_type?: "Issue" | "PullRequest" | "DraftIssue";
  };
}

export async function handleProjectsV2Item(
  serviceAccountJson: string,
  payload: ProjectsV2ItemPayload
): Promise<void> {
  const item = payload.projects_v2_item;
  const itemId = item.node_id;
  const projectId = item.project_node_id;

  if (payload.action === "deleted") {
    await deleteDoc(serviceAccountJson, "githubProjectItems", itemId);
    return;
  }

  // Attribute the item to whoever owns the project in our records. If the
  // project hasn't been synced into AnyLM yet, there's no owner to write
  // under (and rules require one) — the app's initial sync will pick this
  // item up once the user connects that project.
  const project = await getDoc(serviceAccountJson, "githubProjects", projectId);
  if (!project || !project.ownerUid) return;

  await upsertDoc(serviceAccountJson, "githubProjectItems", itemId, {
    itemId,
    projectId,
    ownerUid: project.ownerUid,
    contentType: item.content_type || "DraftIssue",
    // Title/state/fieldValues need a GraphQL follow-up read (the webhook
    // payload alone doesn't carry them for this event) — the app does that
    // on its next poll tick, keyed off updatedAt below, rather than this
    // Worker calling back into GraphQL with a token it doesn't hold.
    updatedAt: new Date(),
  });
}
