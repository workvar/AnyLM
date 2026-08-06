// When the model should stop and ask instead of guessing.
//
// Small local models will happily invent a spec rather than admit a request is
// underspecified, so the instruction is explicit about the cases and about
// asking once rather than interrogating.

const BLOCK =
  "Before starting anything substantial, check whether the request is actually " +
  "specific enough to do well. If a choice would change the result and you " +
  "cannot infer it from the conversation, call ask_user with a short question " +
  "and 2-4 concrete options.\n" +
  "Ask when: the deliverable's format, scope, or destination is unclear; there " +
  "are several reasonable approaches; or acting would overwrite or delete " +
  "something.\n" +
  "Do not ask when: the answer is in the conversation already, the question is " +
  "a matter of taste you can decide, or the task is a simple lookup or edit. " +
  "One question is usually enough — never ask twice in a row about the same " +
  "thing, and never ask after the user has already answered.";

function promptBlock(): string {
  return BLOCK;
}

export { promptBlock };
