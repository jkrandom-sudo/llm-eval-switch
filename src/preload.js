const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("llmEval", {
  getState: () => ipcRenderer.invoke("state:get"),
  getModels: () => ipcRenderer.invoke("models:get"),
  getDimensions: () => ipcRenderer.invoke("dimensions:get"),
  saveModel: (model) => ipcRenderer.invoke("model:save", model),
  deleteModels: (names) => ipcRenderer.invoke("model:delete", names),
  chooseOutput: () => ipcRenderer.invoke("dialog:output"),
  openPath: (target) => ipcRenderer.invoke("path:open", target),
  runEvaluation: (payload) => ipcRenderer.invoke("eval:run", payload),
  abortEvaluation: () => ipcRenderer.invoke("eval:abort"),
  controlModel: (model, action) => ipcRenderer.invoke("eval:model-control", { model, action }),
  compareReports: (outputDir, language) => ipcRenderer.invoke("reports:compare", { outputDir, language }),
  showEditMenu: () => ipcRenderer.send("show-edit-menu"),
  perfLog: (msg) => ipcRenderer.invoke("perf:log", msg),
  onEvalEvent: (handler) => {
    const listener = (_, event) => handler(event);
    ipcRenderer.on("eval:event", listener);
    return () => ipcRenderer.removeListener("eval:event", listener);
  }
});
