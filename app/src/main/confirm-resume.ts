// Run a stored confirmation after the fact.
//
// The original agent loop is gone by the time a restored confirm is approved,
// so there is nothing to resume into: we execute the saved call on its own and
// hand the result (plus any generated file) back to the renderer, which appends
// it to the conversation the confirm came from.
import * as toolsExec from "./tools/exec";
import * as skillsExec from "./skills/exec";

export interface ResumeResult {
  ok: boolean;
  output: string;
  files: GeneratedFile[];
}

const alwaysAllow = async () => true;

export async function resumeConfirm(record: PendingConfirmRecord): Promise<ResumeResult> {
  const files: GeneratedFile[] = [];
  try {
    const output = skillsExec.owns(record.toolName)
      ? await skillsExec.execute(record.toolName, record.args, alwaysAllow)
      : await toolsExec.execute(record.toolName, record.args, alwaysAllow, undefined, {
          projectId: record.projectId || null,
          onFile: (file: GeneratedFile) => files.push(file),
        });
    const text = String(output ?? "");
    return { ok: !/^error/i.test(text.trim()), output: text, files };
  } catch (e) {
    return { ok: false, output: `Error: ${(e as Error).message}`, files };
  }
}
