// Handles the `projects_v2` webhook: the project itself was created, edited
// (e.g. renamed, closed) or deleted. Custom field/view definitions aren't
// part of this payload either — same caveat as projectsV2Item.ts.
import { deleteDoc, upsertDoc } from "../firestore";

interface ProjectsV2Payload {
  action: "created" | "edited" | "deleted" | "closed" | "reopened";
  projects_v2: {
    node_id: string;
    title: string;
    number: number;
    url?: string;
  };
}

export async function handleProjectsV2(
  serviceAccountJson: string,
  payload: ProjectsV2Payload
): Promise<void> {
  const project = payload.projects_v2;

  if (payload.action === "deleted") {
    await deleteDoc(serviceAccountJson, "githubProjects", project.node_id);
    return;
  }

  // Renames/closes touch only these fields; ownerUid, fields[], views[] are
  // left alone (upsertDoc merges) since they were set at connect-time /
  // by the last GraphQL resync, not by this event.
  await upsertDoc(serviceAccountJson, "githubProjects", project.node_id, {
    title: project.title,
    number: project.number,
    url: project.url || "",
    updatedAt: new Date(),
  });
}
