// A thin GraphQL client for GitHub's Projects v2 API. REST doesn't cover
// Projects v2 at all — fields, views, and item field-values are GraphQL-only
// — so this is the one place in the app that speaks GraphQL rather than
// REST, same way data/client.ts is the one place that speaks Firestore's
// REST dialect.
import { badRequest } from "../api/shared";

const ENDPOINT = "https://api.github.com/graphql";

export async function githubGraphQL<T>(
  token: string,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (!res.ok || body.errors?.length) {
    const msg = body.errors?.map((e) => e.message).join("; ") || `GitHub API error (${res.status})`;
    throw badRequest(msg);
  }
  return body.data as T;
}

// --- Types for the one board query, shaped after what GitHub's Projects
// page itself shows: every field type, every view, every item. ---

export interface GhFieldOption {
  id: string;
  name: string;
}

export interface GhField {
  id: string;
  name: string;
  dataType: string; // TEXT | NUMBER | DATE | SINGLE_SELECT | ITERATION | ...
  options?: GhFieldOption[];
}

export interface GhView {
  id: string;
  name: string;
  layout: string; // TABLE_LAYOUT | BOARD_LAYOUT | ROADMAP_LAYOUT
}

export interface GhItemFieldValue {
  fieldId: string;
  fieldName: string;
  value: string | number | null;
}

export interface GhItem {
  id: string;
  contentType: "Issue" | "PullRequest" | "DraftIssue" | null;
  title: string;
  url: string | null;
  state: string | null;
  assignees: string[];
  labels: string[];
  fieldValues: GhItemFieldValue[];
}

export interface GhProject {
  id: string;
  number: number;
  title: string;
  url: string;
  closed: boolean;
  fields: GhField[];
  views: GhView[];
  items: GhItem[];
}

// GitHub's Projects v2 items carry field values as a union of node types
// (ProjectV2ItemFieldTextValue, ...DateValue, ...SingleSelectValue, etc).
// Requesting every variant's shared shape via `... on X { field { ... } text
// }` and picking the one that has a value is simpler than a second query
// per field type.
const FIELD_VALUE_FRAGMENT = `
  fieldValues(first: 50) {
    nodes {
      ... on ProjectV2ItemFieldTextValue {
        text
        field { ... on ProjectV2FieldCommon { id name } }
      }
      ... on ProjectV2ItemFieldNumberValue {
        number
        field { ... on ProjectV2FieldCommon { id name } }
      }
      ... on ProjectV2ItemFieldDateValue {
        date
        field { ... on ProjectV2FieldCommon { id name } }
      }
      ... on ProjectV2ItemFieldSingleSelectValue {
        name
        field { ... on ProjectV2FieldCommon { id name } }
      }
      ... on ProjectV2ItemFieldIterationValue {
        title
        field { ... on ProjectV2FieldCommon { id name } }
      }
    }
  }
`;

const PROJECT_QUERY = `
  query ProjectBoard($login: String!, $number: Int!) {
    repositoryOwner: user(login: $login) { ...projectOwnerFields }
    organizationOwner: organization(login: $login) { ...projectOwnerFields }
  }

  fragment projectOwnerFields on ProjectV2Owner {
    projectV2(number: $number) {
      id
      number
      title
      url
      closed
      fields(first: 50) {
        nodes {
          ... on ProjectV2FieldCommon { id name dataType }
          ... on ProjectV2SingleSelectField {
            id name dataType
            options { id name }
          }
          ... on ProjectV2IterationField { id name dataType }
        }
      }
      views(first: 20) {
        nodes { id name layout }
      }
      items(first: 100) {
        nodes {
          id
          content {
            ... on Issue { title url state assignees(first: 10) { nodes { login } } labels(first: 10) { nodes { name } } }
            ... on PullRequest { title url state assignees(first: 10) { nodes { login } } labels(first: 10) { nodes { name } } }
            ... on DraftIssue { title assignees(first: 10) { nodes { login } } }
          }
          ${FIELD_VALUE_FRAGMENT}
        }
      }
    }
  }
`;

interface RawOwnerResult {
  projectV2: {
    id: string;
    number: number;
    title: string;
    url: string;
    closed: boolean;
    fields: { nodes: (GhField & { options?: GhFieldOption[] })[] };
    views: { nodes: GhView[] };
    items: {
      nodes: {
        id: string;
        content: {
          title?: string;
          url?: string;
          state?: string;
          assignees?: { nodes: { login: string }[] };
          labels?: { nodes: { name: string }[] };
        } | null;
        fieldValues: {
          nodes: {
            text?: string;
            number?: number;
            date?: string;
            name?: string;
            title?: string;
            field?: { id: string; name: string };
          }[];
        };
      }[];
    };
  } | null;
}

function contentTypeOf(content: RawOwnerResult["projectV2"] extends null ? never : NonNullable<RawOwnerResult["projectV2"]>["items"]["nodes"][number]["content"]): GhItem["contentType"] {
  if (!content) return "DraftIssue";
  if ("state" in content && content.url?.includes("/pull/")) return "PullRequest";
  if ("state" in content) return "Issue";
  return "DraftIssue";
}

/** Fetch a project board (owned by a user OR an org — GitHub doesn't let one
 *  query ask "whichever it is", so both are requested and the present one wins). */
export async function fetchProjectBoard(token: string, login: string, number: number): Promise<GhProject> {
  const data = await githubGraphQL<{
    repositoryOwner: RawOwnerResult | null;
    organizationOwner: RawOwnerResult | null;
  }>(token, PROJECT_QUERY, { login, number });

  const owner = data.repositoryOwner?.projectV2 ? data.repositoryOwner : data.organizationOwner;
  const raw = owner?.projectV2;
  if (!raw) throw badRequest(`No Projects v2 board #${number} found for "${login}".`);

  return {
    id: raw.id,
    number: raw.number,
    title: raw.title,
    url: raw.url,
    closed: raw.closed,
    fields: raw.fields.nodes.map((f) => ({ id: f.id, name: f.name, dataType: f.dataType, options: f.options })),
    views: raw.views.nodes,
    items: raw.items.nodes.map((item) => {
      const fieldValues: GhItemFieldValue[] = item.fieldValues.nodes
        .filter((v) => v.field)
        .map((v) => ({
          fieldId: v.field!.id,
          fieldName: v.field!.name,
          value: v.text ?? v.number ?? v.date ?? v.name ?? v.title ?? null,
        }));
      return {
        id: item.id,
        contentType: contentTypeOf(item.content),
        title: item.content?.title || "(untitled)",
        url: item.content?.url || null,
        state: item.content?.state || null,
        assignees: item.content?.assignees?.nodes.map((a) => a.login) || [],
        labels: item.content?.labels?.nodes.map((l) => l.name) || [],
        fieldValues,
      };
    }),
  };
}
