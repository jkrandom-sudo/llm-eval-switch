const path = require("path");
const { app } = require("electron");

function projectRoot() {
  if (process.env.LLM_EVAL_PROJECT_ROOT) return process.env.LLM_EVAL_PROJECT_ROOT;
  if (app && app.isPackaged) return process.resourcesPath;
  return path.resolve(__dirname, "..");
}

function projectPath(...parts) {
  return path.join(projectRoot(), ...parts);
}

module.exports = { projectRoot, projectPath };
