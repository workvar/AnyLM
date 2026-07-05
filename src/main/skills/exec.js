// Connector-skill tool execution. Fetches a fresh OAuth access token from
// the auth backend, then runs the tool's API call. Risky tools (anything
// that writes: create event, send mail) confirm with the user first.
const auth = require("../auth");
const registry = require("./registry");

// True when `name` belongs to an enabled built-in connector skill.
function owns(name) {
  return !!registry.findConnectorTool(name);
}

// Execute a connector tool call from the model.
// confirm(tool, args) → Promise<boolean>; invoked for risky calls only.
async function execute(name, args, confirm) {
  const found = registry.findConnectorTool(name);
  if (!found) return `Error: skill tool "${name}" is not available`;
  const { skill, tool } = found;
  const parsedArgs = args && typeof args === "object" ? args : {};

  if (tool.risky) {
    const ok = await confirm(tool, parsedArgs);
    if (!ok) return "The user declined to run this tool.";
  }

  let bearer;
  try {
    const res = await auth.request("GET", `/connectors/${skill.connector}/token`);
    bearer = res.accessToken;
  } catch (e) {
    return (
      `Error: the ${skill.name} skill is not connected (${e.message}). ` +
      `Ask the user to connect it in the Skills view.`
    );
  }

  try {
    return await tool.run(parsedArgs, bearer);
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

module.exports = { owns, execute };
