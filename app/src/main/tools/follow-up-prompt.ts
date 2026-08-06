function followUpPromptBlock(): string {
  return (
    "Tool follow-ups: If you proposed a tool and the user replies with a short confirmation " +
    'or reference (e.g. "do it", "go ahead", "yes", "this", "that", "the link", "complete", "finish it"), ' +
    "call that same tool with the arguments implied by the prior turn. " +
    "Do not treat the confirmation as a shell command unless they clearly asked to run a shell command."
  );
}

export { followUpPromptBlock };
