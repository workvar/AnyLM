export function generateDocumentToolMessage(
  fileName: string,
  inProject: boolean
): string {
  const where = inProject ? "in the project folder" : "in Documents/AnyLM/generated";
  return `Created "${fileName}" ${where}. Tell the user it is ready; do not repeat the document content in your reply.`;
}
