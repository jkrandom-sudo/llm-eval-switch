const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const t0 = Date.now();
const PERF_LOG = path.join(require("os").tmpdir(), "llm-eval-startup.log");
function perf(msg) { try { fs.appendFileSync(PERF_LOG, `${Date.now() - t0}ms ${msg}\n`); } catch (_) {} }
perf("main.js start");

app.commandLine.appendSwitch("disable-features", "TranslateUI");
app.commandLine.appendSwitch("disable-component-update");

let mainWindow;
let currentEngine = null;
let _configStore;
let _dimensionsCache = null;
function configStore() {
  if (!_configStore) { _configStore = require("./configStore"); perf("configStore require done"); }
  return _configStore;
}

function preloadDimensions() {
  if (_dimensionsCache) return _dimensionsCache;
  perf("preloadDimensions start");
  _dimensionsCache = configStore().discoverDimensionsAsync().then(d => {
    perf("dimensions loaded: " + d.length);
    return d;
  });
  return _dimensionsCache;
}

function createWindow() {
  perf("createWindow");
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 1020,
    minHeight: 680,
    title: "LLM Eval Switch",
    backgroundColor: "#101217",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.webContents.on("did-finish-load", () => perf("did-finish-load"));
}

app.whenReady().then(() => {
  perf("app ready");
  preloadDimensions();
  createWindow();
  setTimeout(createApplicationMenu, 0);
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("state:get", async () => {
  return { models: configStore().loadUserModels(), dimensions: [] };
});

ipcMain.handle("models:get", async () => {
  return configStore().loadUserModels();
});

ipcMain.handle("dimensions:get", async () => {
  return preloadDimensions();
});

ipcMain.handle("model:save", async (_, model) => {
  return { models: configStore().upsertModel(model) };
});

ipcMain.handle("model:delete", async (_, names) => {
  return { models: configStore().deleteModels(names) };
});

ipcMain.handle("dialog:output", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("path:open", async (_, target) => {
  if (target) await shell.openPath(target);
  return true;
});

ipcMain.handle("eval:run", async (_, payload) => {
  if (currentEngine) throw new Error("Evaluation is already running");
  const { EvalEngine } = require("./engine");
  const engine = new EvalEngine({ outputDir: payload.outputDir || "results" });
  currentEngine = engine;
  engine.on("event", (event) => mainWindow.webContents.send("eval:event", event));
  try {
    return await engine.runModels(payload.models || [], payload.dimensions || [], {
      limit: payload.limit || null,
      dimensionLimits: payload.dimensionLimits || {},
      retryLimit: payload.retryLimit,
      timeoutSeconds: payload.timeoutSeconds,
      measurePerformance: payload.measurePerformance,
      performanceOnly: payload.performanceOnly,
      language: payload.language || "en"
    });
  } finally {
    if (currentEngine === engine) currentEngine = null;
  }
});

ipcMain.handle("eval:abort", async () => {
  const engine = currentEngine;
  currentEngine = null;
  if (engine) engine.abort();
  return true;
});

ipcMain.handle("eval:model-control", async (_, payload) => {
  if (!currentEngine || !payload?.model) return false;
  if (payload.action === "pause") currentEngine.pauseModel(payload.model);
  if (payload.action === "resume") currentEngine.resumeModel(payload.model);
  if (payload.action === "stop") currentEngine.stopModel(payload.model);
  return true;
});

ipcMain.handle("reports:compare", async (_, payload) => {
  const fs = require("fs");
  const { projectPath } = require("./paths");
  const { discoverDimensions, loadConfig } = configStore();
  const outputDir = typeof payload === "string" ? payload : payload?.outputDir;
  const language = typeof payload === "object" ? payload.language : "en";
  const dir = path.isAbsolute(outputDir || "") ? outputDir : projectPath(outputDir || "results");
  if (!fs.existsSync(dir)) return {};
  const reports = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith("_full_report.json")) continue;
    reports.push(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
  }
  const dimensions = discoverDimensions(loadConfig());
  const { buildLeaderboard } = require("./engine");
  const leaderboard = buildLeaderboard(reports.map((report) => ({
    model: report.model,
    dimension_scores: report.dimensions
  })), dimensions);
  const { saveLeaderboard } = require("./report");
  return saveLeaderboard(outputDir || "results", leaderboard, language || reports[0]?.language || "en");
});

ipcMain.handle("perf:log", async (_, msg) => { perf(msg); return true; });

ipcMain.handle("config:saveRaw", async (_, config) => {
  configStore().saveConfig(config);
  return true;
});

function createApplicationMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    }] : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "close" }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const editContextMenu = Menu.buildFromTemplate([
  { role: "undo" },
  { role: "redo" },
  { type: "separator" },
  { role: "cut" },
  { role: "copy" },
  { role: "paste" },
  { role: "pasteAndMatchStyle" },
  { role: "delete" },
  { type: "separator" },
  { role: "selectAll" }
]);

ipcMain.on("show-edit-menu", () => {
  if (mainWindow) editContextMenu.popup({ window: mainWindow });
});
