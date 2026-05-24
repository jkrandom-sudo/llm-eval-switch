const assert = require("assert");
const fs = require("fs");
const path = require("path");

process.env.LLM_EVAL_PROJECT_ROOT = path.resolve(__dirname, "../../..");

const { deleteModels, loadConfig, discoverDimensions, loadDataset, loadUserModels, upsertModel } = require("../src/configStore");
const { evaluateResponse } = require("../src/evaluator");
const { saveLeaderboard, saveModelReport } = require("../src/report");

const config = loadConfig();
const dimensions = discoverDimensions(config);
assert(config.models.length >= 1, "expected models in config");
assert(dimensions.length >= 1, "expected dimensions");

for (const dimension of dimensions) {
  const cases = loadDataset(dimension.dataset, 1);
  assert(Array.isArray(cases), `dataset ${dimension.name} should be an array`);
  assert(cases.length > 0, `dataset ${dimension.name} should not be empty`);
}

const score = evaluateResponse("math", "答案是 42", {
  id: "smoke",
  answer_type: "numeric",
  reference_answer: "42"
});
assert(score.passed, "numeric evaluator should pass");

process.env.LLM_EVAL_USER_DATA = path.resolve(__dirname, "../smoke-user-data");
fs.rmSync(process.env.LLM_EVAL_USER_DATA, { recursive: true, force: true });
assert.strictEqual(loadUserModels().length, 0, "user model store should start empty");
upsertModel({ name: "smoke-user-model", api_format: "openai", base_url: "https://example.com/v1", api_key: "test", model_id: "test-model" });
assert.strictEqual(loadUserModels().length, 1, "user model should persist");
deleteModels(["smoke-user-model"]);
assert.strictEqual(loadUserModels().length, 0, "user model should delete");

const outputDir = path.resolve(__dirname, "../smoke-results");
const paths = saveModelReport(outputDir, {
  model: "smoke-model",
  timestamp: new Date().toISOString(),
  overall_score: 100,
  dimensions: { math: { mean: 100, pass_rate: 100, count: 1, min: 100, max: 100 } },
  detailed_results: { math: [score] }
});
const leaderboard = saveLeaderboard(outputDir, [{ model: "smoke-model", overall: 100, dimensions: { math: 100 } }]);

assert(fs.existsSync(paths.json), "model json report should exist");
assert(fs.existsSync(paths.html), "model html report should exist");
assert(fs.existsSync(leaderboard.json), "leaderboard json should exist");
assert(fs.existsSync(leaderboard.html), "leaderboard html should exist");

console.log(`ok: ${config.models.length} models, ${dimensions.length} dimensions`);
