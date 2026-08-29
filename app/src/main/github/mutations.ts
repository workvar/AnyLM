// Writing back to GitHub: field edits and new draft items made on the board
// inside AnyLM. Reads (graphql.ts) and writes are split because the mutation
// shapes depend on the field's dataType in a way a generic query doesn't —
// GitHub has a distinct mutation per value type rather than one "set field"
// call.
import { githubGraphQL } from "./graphql";
import { tokenFor } from "./auth";
import { badRequest } from "../api/shared";

const UPDATE_TEXT = `
  mutation($project: ID!, $item: ID!, $field: ID!, $text: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $project, itemId: $item, fieldId: $field, value: { text: $text }
    }) { projectV2Item { id } }
  }
`;
const UPDATE_NUMBER = `
  mutation($project: ID!, $item: ID!, $field: ID!, $number: Float!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $project, itemId: $item, fieldId: $field, value: { number: $number }
    }) { projectV2Item { id } }
  }
`;
const UPDATE_DATE = `
  mutation($project: ID!, $item: ID!, $field: ID!, $date: Date!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $project, itemId: $item, fieldId: $field, value: { date: $date }
    }) { projectV2Item { id } }
  }
`;
const UPDATE_SINGLE_SELECT = `
  mutation($project: ID!, $item: ID!, $field: ID!, $optionId: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $optionId }
    }) { projectV2Item { id } }
  }
`;
const ADD_DRAFT_ITEM = `
  mutation($project: ID!, $title: String!) {
    addProjectV2DraftIssue(input: { projectId: $project, title: $title }) {
      projectItem { id }
    }
  }
`;
const DELETE_ITEM = `
  mutation($project: ID!, $item: ID!) {
    deleteProjectV2Item(input: { projectId: $project, itemId: $item }) {
      deletedItemId
    }
  }
`;

export type FieldValueUpdate =
  | { kind: "text"; value: string }
  | { kind: "number"; value: number }
  | { kind: "date"; value: string } // ISO date, e.g. "2026-09-01"
  | { kind: "singleSelect"; optionId: string };

export async function setFieldValue(
  userId: string,
  projectId: string,
  itemId: string,
  fieldId: string,
  update: FieldValueUpdate
): Promise<void> {
  const token = await tokenFor(userId);
  const vars = { project: projectId, item: itemId, field: fieldId };
  switch (update.kind) {
    case "text":
      await githubGraphQL(token, UPDATE_TEXT, { ...vars, text: update.value });
      return;
    case "number":
      await githubGraphQL(token, UPDATE_NUMBER, { ...vars, number: update.value });
      return;
    case "date":
      await githubGraphQL(token, UPDATE_DATE, { ...vars, date: update.value });
      return;
    case "singleSelect":
      await githubGraphQL(token, UPDATE_SINGLE_SELECT, { ...vars, optionId: update.optionId });
      return;
    default:
      throw badRequest("Unsupported field type for editing.");
  }
}

export async function addDraftItem(userId: string, projectId: string, title: string): Promise<string> {
  const token = await tokenFor(userId);
  const data = await githubGraphQL<{ addProjectV2DraftIssue: { projectItem: { id: string } } }>(
    token,
    ADD_DRAFT_ITEM,
    { project: projectId, title }
  );
  return data.addProjectV2DraftIssue.projectItem.id;
}

export async function deleteItem(userId: string, projectId: string, itemId: string): Promise<void> {
  const token = await tokenFor(userId);
  await githubGraphQL(token, DELETE_ITEM, { project: projectId, item: itemId });
}
