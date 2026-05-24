const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
let _yaml;
function YAML() { if (!_yaml) _yaml = require("yaml"); return _yaml; }
const { projectPath } = require("./paths");

const CONFIG_FILE = "eval_config.yaml";
const USER_MODELS_FILE = "models.json";
const DIM_CACHE_FILE = "dimensions_cache.json";

function loadConfig() {
  const file = projectPath(CONFIG_FILE);
  const text = fs.readFileSync(file, "utf8");
  return YAML().parse(text) || {};
}

function saveConfig(config) {
  const file = projectPath(CONFIG_FILE);
  fs.writeFileSync(file, YAML().stringify(config), "utf8");
}

function userDataDir() {
  if (process.env.LLM_EVAL_USER_DATA) return process.env.LLM_EVAL_USER_DATA;
  if (process.versions.electron) {
    try {
      const { app } = require("electron");
      if (app?.getPath) return app.getPath("userData");
    } catch (_) {
      // Fall through to project-local storage for tests.
    }
  }
  return projectPath(".llm-eval-switch");
}

function userModelsPath() {
  return path.join(userDataDir(), USER_MODELS_FILE);
}

function loadUserModels() {
  const file = userModelsPath();
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(data.models) ? data.models : [];
  } catch (_) {
    return [];
  }
}

function saveUserModels(models) {
  const dir = userDataDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(userModelsPath(), JSON.stringify({ models }, null, 2), "utf8");
  return models;
}

function resolveEnv(value) {
  if (typeof value !== "string") return value || "";
  const match = value.match(/^\$\{([^}]+)\}$/);
  return match ? process.env[match[1]] || "" : value;
}

function discoverDimensions(config) {
  const configured = config.dimensions || {};
  const specs = {};
  for (const [name, info] of Object.entries(configured)) {
    specs[name] = {
      name,
      weight: Number(info.weight ?? 1),
      dataset: info.dataset || `datasets/${name}/test_cases.json`,
      description: info.description || "",
      scoring: info.scoring || info.scoring_method || "auto"
    };
  }

  const datasetsRoot = projectPath("datasets");
  if (fs.existsSync(datasetsRoot)) {
    for (const entry of fs.readdirSync(datasetsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const testFile = path.join(datasetsRoot, entry.name, "test_cases.json");
      if (fs.existsSync(testFile) && !specs[entry.name]) {
        specs[entry.name] = {
          name: entry.name,
          weight: 1,
          dataset: `datasets/${entry.name}/test_cases.json`,
          description: `Discovered dataset: ${entry.name}`,
          scoring: "auto"
        };
      }
    }
  }
  return Object.values(specs);
}

async function loadConfigAsync() {
  const file = projectPath(CONFIG_FILE);
  const text = await fsp.readFile(file, "utf8");
  return YAML().parse(text) || {};
}

async function discoverDimensionsAsync() {
  const { projectPath: pp } = require("./paths");
  const cacheFile = path.join(userDataDir(), DIM_CACHE_FILE);

  // Fast path: check cache first (sync, no I/O if we have a valid cache)
  try {
    const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    if (cached.dimensions) {
      const datasetsRoot = pp("datasets");
      const configFile = pp(CONFIG_FILE);
      const [configStat, dsStat] = await Promise.all([
        fsp.stat(configFile).catch(() => ({ mtimeMs: 0 })),
        fsp.stat(datasetsRoot).catch(() => ({ mtimeMs: 0 }))
      ]);
      const cacheKey = `${configStat.mtimeMs}_${dsStat.mtimeMs}`;
      if (cached._key === cacheKey) return cached.dimensions;
    }
  } catch (_) {}

  // First launch fast path: use seed file without any async I/O
  const seedFile = pp("dimensions_seed.json");
  try {
    const seed = JSON.parse(fs.readFileSync(seedFile, "utf8"));
    if (seed.dimensions && seed.seed) {
      try {
        const dir = userDataDir();
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(cacheFile, JSON.stringify({ _key: "seed", dimensions: seed.dimensions }), "utf8");
      } catch (_) {}
      return seed.dimensions;
    }
  } catch (_) {}

  // Full discovery fallback: stat + read config + scan datasets
  const datasetsRoot = pp("datasets");
  const configFile = pp(CONFIG_FILE);
  const [configStat, dsStat] = await Promise.all([
    fsp.stat(configFile).catch(() => ({ mtimeMs: 0 })),
    fsp.stat(datasetsRoot).catch(() => ({ mtimeMs: 0 }))
  ]);
  const cacheKey = `${configStat.mtimeMs}_${dsStat.mtimeMs}`;

  const [config, entries] = await Promise.all([
    loadConfigAsync(),
    fsp.readdir(datasetsRoot, { withFileTypes: true }).catch(() => [])
  ]);

  const configured = config.dimensions || {};
  const specs = {};
  for (const [name, info] of Object.entries(configured)) {
    specs[name] = {
      name,
      weight: Number(info.weight ?? 1),
      dataset: info.dataset || `datasets/${name}/test_cases.json`,
      description: info.description || "",
      scoring: info.scoring || info.scoring_method || "auto"
    };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!specs[entry.name]) {
      specs[entry.name] = {
        name: entry.name,
        weight: 1,
        dataset: `datasets/${entry.name}/test_cases.json`,
        description: `Discovered dataset: ${entry.name}`,
        scoring: "auto"
      };
    }
  }

  const dimensions = Object.values(specs);
  try {
    const dir = userDataDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify({ _key: cacheKey, dimensions }), "utf8");
  } catch (_) {}
  return dimensions;
}

function loadDataset(datasetPath, limit) {
  const absolute = path.isAbsolute(datasetPath) ? datasetPath : projectPath(datasetPath);
  const data = JSON.parse(fs.readFileSync(absolute, "utf8"));
  return limit ? data.slice(0, limit) : data;
}

function upsertModel(model) {
  const models = loadUserModels();
  const normalized = normalizeModel(model);
  const index = models.findIndex((item) => item.name === normalized.name);
  if (index >= 0) models[index] = normalized;
  else models.push(normalized);
  saveUserModels(models);
  return models;
}

function deleteModels(names) {
  const selected = new Set(names);
  const models = loadUserModels().filter((model) => !selected.has(model.name));
  saveUserModels(models);
  return models;
}

function normalizeModel(model) {
  const apiFormat = model.api_format || model.provider || "openai";
  return {
    name: model.name,
    api_format: apiFormat,
    type: apiFormat === "anthropic" ? "anthropic" : "openai_compatible",
    base_url: model.base_url || model.endpoint || "",
    endpoint: model.base_url || model.endpoint || "",
    api_key: model.api_key || "",
    model_id: model.model_id || "",
    anthropic_version: model.anthropic_version || "2023-06-01"
  };
}

module.exports = {
  loadConfig,
  loadConfigAsync,
  saveConfig,
  loadUserModels,
  saveUserModels,
  resolveEnv,
  discoverDimensions,
  discoverDimensionsAsync,
  loadDataset,
  upsertModel,
  deleteModels,
  normalizeModel
};
