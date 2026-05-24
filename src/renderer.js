let state = { models: [], dimensions: [] };
let running = false;
let progressState = { models: new Map(), globalCompleted: 0, globalTotal: 0 };
let modelListExpanded = false;
let dimensionListExpanded = false;
let questionPreset = "fast";
let currentLanguage = "en";
const selectedModelNames = new Set();

const $ = (id) => document.getElementById(id);
const PRESET_COUNTS = { fast: 25, normal: 50, deep: 100 };

async function perfLog(msg) {
  try { await window.llmEval.perfLog("renderer: " + msg); } catch (_) {}
}
perfLog("renderer.js start");

function showToast(message, type) {
  const typeClass = type === "success" ? "success" : type === "error" ? "error" : "";
  const el = document.createElement("div");
  el.className = `toast ${typeClass}`;
  el.textContent = message;
  ($("toastContainer") || document.body).appendChild(el);
  setTimeout(() => el.classList.add("out"), 2400);
  setTimeout(() => el.remove(), 2700);
}
window.addEventListener("DOMContentLoaded", () => {
  perfLog("DOMContentLoaded");
  bindNavigation();
  bindActions();
  bindEditingFallbacks();
  initializeLanguage();
  setRunningControls(false);
  window.llmEval.onEvalEvent(handleEvalEvent);
  setStatus(t("loading"), true);
  reloadState().catch((error) => log(`Load failed: ${error.message}`));
});

function bindNavigation() {
  document.querySelectorAll(".nav").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      $(`panel-${button.dataset.panel}`).classList.add("active");
      updatePageTitle(button.dataset.panel);
    });
  });
}

function bindActions() {
  $("chooseOutput").addEventListener("click", async () => {
    const dir = await window.llmEval.chooseOutput();
    if (dir) $("outputDir").value = dir;
  });
  $("languageSelect").addEventListener("change", () => {
    currentLanguage = $("languageSelect").value;
    localStorage.setItem("llmEvalLanguage", currentLanguage);
    applyLanguage();
  });
  $("runButton").addEventListener("click", runEvaluation);
  $("abortButton").addEventListener("click", async () => {
    await window.llmEval.abortEvaluation();
    setStatus(t("stopped"), false);
  });
  $("toggleModels").addEventListener("click", () => {
    modelListExpanded = !modelListExpanded;
    renderModelChecks();
  });
  $("toggleDimensions").addEventListener("click", () => {
    dimensionListExpanded = !dimensionListExpanded;
    renderDimensionSectionState();
  });
  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => applyPreset(button.dataset.preset));
  });
  document.querySelectorAll('input[name="evalMode"]').forEach((input) => {
    input.addEventListener("change", refreshRunButton);
  });
  $("applyCustomCount").addEventListener("click", () => applyCustomCount());
  $("newModel").addEventListener("click", newModelForm);
  $("loadModel").addEventListener("click", loadSelectedModel);
  $("saveModel").addEventListener("click", saveModel);
  $("deleteModel").addEventListener("click", deleteSelectedModels);
  $("compareReports").addEventListener("click", compareReports);
  $("openOutput").addEventListener("click", () => window.llmEval.openPath($("outputDir").value || "results"));
}

function bindEditingFallbacks() {
  document.addEventListener("contextmenu", (event) => {
    if (isEditable(event.target)) {
      event.preventDefault();
      window.llmEval.showEditMenu();
    }
  });

  document.addEventListener("keydown", async (event) => {
    const isModifier = event.metaKey || event.ctrlKey;
    if (!isModifier || !isEditable(event.target)) return;

    const key = event.key.toLowerCase();
    if (key === "v") {
      const pasted = await pasteIntoEditable(event.target);
      if (pasted) event.preventDefault();
    } else if (key === "a") {
      event.target.select?.();
    }
  });
}

async function reloadState() {
  const started = performance.now();
  perfLog("reloadState start");
  const toast = $("startupToast");
  const hint = $("startupHint");
  if (hint) hint.textContent = t("startupLoadingModels");
  state.models = await window.llmEval.getModels();
  perfLog("models loaded: " + state.models.length);
  const available = new Set(state.models.map((model) => model.name));
  [...selectedModelNames].forEach((name) => {
    if (!available.has(name)) selectedModelNames.delete(name);
  });
  renderModelChecks();
  $("modelCount").textContent = state.models.length;
  refreshRunButton();
  const modelElapsed = Math.round(performance.now() - started);
  log(`Models loaded in ${modelElapsed}ms`);
  loadDimensionsAsync();
}

async function loadDimensionsAsync() {
  const toast = $("startupToast");
  const hint = $("startupHint");
  if (hint) hint.textContent = t("startupLoadingDimensions");
  try {
    state.dimensions = await window.llmEval.getDimensions();
    perfLog("dimensions loaded in renderer: " + state.dimensions.length);
    renderDimensionChecks();
    $("dimensionCount").textContent = state.dimensions.length;
    renderDimensionsTable();
    refreshRunButton();
    log(t("loaded").replace("{models}", state.models.length).replace("{dimensions}", state.dimensions.length));
  } catch (error) {
    log(`Dimension load failed: ${error.message}`);
  }
  perfLog("UI ready");
  setStatus(t("ready"), false);
  toast?.classList.add("hidden");
}

function initializeLanguage() {
  currentLanguage = localStorage.getItem("llmEvalLanguage") || "en";
  if (!I18N[currentLanguage]) currentLanguage = "en";
  $("languageSelect").value = currentLanguage;
  applyLanguage();
}

function applyLanguage() {
  document.documentElement.lang = currentLanguage;
  document.querySelector('[data-panel="run"]').textContent = t("navRun");
  document.querySelector('[data-panel="models"]').textContent = t("navModels");
  document.querySelector('[data-panel="datasets"]').textContent = t("navDatasets");
  document.querySelector('[data-panel="reports"]').textContent = t("navReports");
  $("chooseOutput").textContent = t("chooseDir");
  $("runButton").textContent = t("start");
  $("abortButton").textContent = t("stop");
  $("newModel").textContent = t("newModel");
  $("loadModel").textContent = t("loadSelected");
  $("saveModel").textContent = t("saveConfig");
  $("deleteModel").textContent = t("deleteSelected");
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  renderModelChecks();
  renderDimensionSectionState();
  updatePageTitle(document.querySelector(".nav.active")?.dataset.panel || "run");
}

function updatePageTitle(panel) {
  const titleKeys = {
    run: ["runTitle", "runSubtitle"],
    models: ["modelsTitle", "modelsSubtitle"],
    datasets: ["datasetsTitle", "datasetsSubtitle"],
    reports: ["reportsTitle", "reportsSubtitle"]
  };
  $("pageTitle").textContent = t(titleKeys[panel][0]);
  $("pageSubtitle").textContent = t(titleKeys[panel][1]);
}

function t(key) {
  return (I18N[currentLanguage] && I18N[currentLanguage][key]) || I18N.en[key] || key;
}

function renderModelChecks() {
  const root = $("modelChecks");
  root.innerHTML = "";
  const visible = modelListExpanded ? state.models : state.models.slice(0, 8);
  for (const model of visible) {
    const label = document.createElement("label");
    label.className = "check model-check";
    label.title = `${model.name} / ${model.model_id || ""}`;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = model.name;
    input.checked = selectedModelNames.has(model.name);
    input.addEventListener("change", () => {
      if (input.checked) selectedModelNames.add(model.name);
      else selectedModelNames.delete(model.name);
      refreshRunButton();
      if (input.checked) loadModelIntoForm(model.name);
    });
    const span = document.createElement("span");
    span.className = "model-name";
    span.textContent = model.name;
    const badge = document.createElement("span");
    badge.className = "model-badge";
    badge.textContent = (model.api_format || model.provider || "openai").toLowerCase();
    label.append(input, span, badge);
    root.appendChild(label);
  }
  if (!modelListExpanded && state.models.length > visible.length) {
    const overflow = document.createElement("div");
    overflow.className = "model-overflow";
    overflow.textContent = t("modelOverflow").replace("{count}", state.models.length - visible.length);
    overflow.addEventListener("click", () => {
      modelListExpanded = true;
      renderModelChecks();
    });
    root.appendChild(overflow);
  }
  $("toggleModels").textContent = modelListExpanded ? t("collapse") : t("expand");
  $("toggleModels").disabled = false;
  document.querySelector(".model-section")?.classList.toggle("expanded", modelListExpanded);
}

function renderDimensionChecks() {
  const root = $("dimensionChecks");
  const selectedDimensionNames = new Set(selectedDimensions().map((dimension) => dimension.name));
  const previousLimits = Object.fromEntries(selectedDimensions().map((dimension) => [dimension.name, dimension.limit]));
  root.innerHTML = "";
  for (const dimension of state.dimensions) {
    const label = document.createElement("label");
    label.className = "check dimension-check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = dimension.name;
    input.checked = selectedDimensionNames.size ? selectedDimensionNames.has(dimension.name) : true;
    input.addEventListener("change", refreshRunButton);
    const span = document.createElement("span");
    span.textContent = dimension.name;
    const count = document.createElement("input");
    count.className = "dimension-count";
    count.type = "number";
    count.min = "1";
    count.value = previousLimits[dimension.name] || PRESET_COUNTS[questionPreset] || "";
    count.placeholder = t("allQuestions");
    count.dataset.dimensionLimit = dimension.name;
    count.addEventListener("click", (event) => event.stopPropagation());
    label.append(input, span, count);
    root.appendChild(label);
  }
  renderDimensionSectionState();
}

function renderDimensionSectionState() {
  const section = $("dimensionSection");
  if (!section) return;
  section.classList.toggle("expanded", dimensionListExpanded);
  $("toggleDimensions").textContent = dimensionListExpanded ? t("collapse") : t("expand");
}

function applyPreset(preset) {
  questionPreset = preset;
  const count = PRESET_COUNTS[preset];
  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.classList.toggle("active", button.dataset.preset === preset);
  });
  document.querySelectorAll("[data-dimension-limit]").forEach((input) => {
    input.value = count;
  });
  log(t("presetApplied").replace("{preset}", presetLabel(preset)).replace("{count}", count));
}

function applyCustomCount() {
  const value = Number($("customQuestionCount").value);
  if (!Number.isFinite(value) || value <= 0) {
    log(t("customCountInvalid"));
    return;
  }
  questionPreset = "custom";
  document.querySelectorAll("[data-preset]").forEach((button) => button.classList.remove("active"));
  document.querySelectorAll("[data-dimension-limit]").forEach((input) => {
    input.value = Math.floor(value);
  });
  log(t("customCountApplied").replace("{count}", Math.floor(value)));
}

function presetLabel(preset) {
  return { fast: t("presetFastName"), normal: t("presetNormalName"), deep: t("presetDeepName") }[preset] || t("presetCustomName");
}

function renderDimensionsTable() {
  $("dimensionRows").innerHTML = state.dimensions.map((dimension) => `
    <tr>
      <td>${escapeHtml(dimension.name)}</td>
      <td>${Number(dimension.weight || 0).toFixed(2)}</td>
      <td>${escapeHtml(dimension.description || "")}</td>
    </tr>
  `).join("");
}

function selected(id) {
  if (id === "modelChecks") return [...selectedModelNames];
  return [...document.querySelectorAll(`#${id} input:checked`)].map((item) => item.value);
}

function selectedDimensions() {
  return [...document.querySelectorAll("#dimensionChecks label")].filter((label) => label.querySelector('input[type="checkbox"]').checked).map((label) => {
    const checkbox = label.querySelector('input[type="checkbox"]');
    const count = label.querySelector("[data-dimension-limit]");
    return { name: checkbox.value, limit: count.value.trim() };
  });
}

function loadSelectedModel() {
  const name = selected("modelChecks")[0];
  loadModelIntoForm(name);
}

function loadModelIntoForm(name) {
  const model = state.models.find((item) => item.name === name);
  if (!model) return;
  $("modelName").value = model.name || "";
  $("apiFormat").value = model.api_format || model.provider || "openai";
  $("baseUrl").value = model.base_url || model.endpoint || "";
  $("apiKey").value = model.api_key || "";
  $("modelId").value = model.model_id || "";
}

function newModelForm() {
  $("modelName").value = "";
  $("apiFormat").value = "openai";
  $("baseUrl").value = "";
  $("apiKey").value = "";
  $("modelId").value = "";
  document.querySelectorAll("#modelChecks input:checked").forEach((input) => { input.checked = false; });
  selectedModelNames.clear();
  refreshRunButton();
  log(t("newModelLog"));
}

async function saveModel() {
  const model = {
    name: $("modelName").value.trim(),
    api_format: $("apiFormat").value,
    base_url: $("baseUrl").value.trim(),
    api_key: $("apiKey").value.trim(),
    model_id: $("modelId").value.trim()
  };
  if (!model.name) {
    log("Model name is required");
    return;
  }
  await window.llmEval.saveModel(model);
  showToast(`Saved: ${model.name}`, "success");
  log(`Saved model: ${model.name}`);
  await reloadState();
}

async function deleteSelectedModels() {
  const names = selected("modelChecks");
  if (!names.length) return;
  await window.llmEval.deleteModels(names);
  names.forEach((name) => selectedModelNames.delete(name));
  showToast(`Deleted: ${names.join(", ")}`, "success");
  log(`Deleted models: ${names.join(", ")}`);
  await reloadState();
}

async function runEvaluation() {
  if (running) return;
  const models = selected("modelChecks");
  const dimensions = selectedDimensions();
  const performanceOnly = selectedEvalMode() === "performance";
  if (!models.length || (!performanceOnly && !dimensions.length)) {
    log(performanceOnly ? t("selectModel") : t("selectModelDimension"));
    return;
  }
  running = true;
  setStatus(t("running"), true);
  setRunningControls(true);
  $("resultRows").innerHTML = "";
  $("dimensionProgress").innerHTML = "";
  $("scorePanel").className = "score-panel empty";
  $("scorePanel").textContent = t("runningScore");
  $("progressBar").style.width = "0%";
  $("progressText").textContent = "0%";
  log(`Starting evaluation: ${models.join(", ")} / ${dimensions.length} dimensions`);
  try {
    const result = await window.llmEval.runEvaluation({
      models,
      dimensions: dimensions.map((dimension) => dimension.name),
      dimensionLimits: Object.fromEntries(dimensions.filter((dimension) => dimension.limit).map((dimension) => [dimension.name, dimension.limit])),
      outputDir: $("outputDir").value || "results",
      limit: null,
      retryLimit: $("retryLimit").value,
      timeoutSeconds: $("timeoutSeconds").value,
      measurePerformance: true,
      performanceOnly,
      language: currentLanguage
    });
    renderRunResult(result);
  } catch (error) {
    showToast(`Run failed: ${error.message}`, "error");
    log(`Run failed: ${error.message}`);
  } finally {
    running = false;
    setStatus(t("ready"), false);
    setRunningControls(false);
  }
}

function handleEvalEvent(event) {
  if (event.event === "run_start") {
    initializeProgress(event);
  } else if (event.event === "case_start") {
    updateDimensionActive(event);
    log(`Running ${event.model} / ${event.dimension} / ${event.test_id}`);
  } else if (event.event === "case_done") {
    const percent = event.global_total ? Math.round(event.global_completed / event.global_total * 100) : 0;
    $("progressBar").style.width = `${percent}%`;
    $("progressText").textContent = `${percent}%`;
    updateDimensionProgress(event);
    log(`${event.model} / ${event.dimension} / ${event.test_id}: ${(event.score * 100).toFixed(1)}% ${event.passed ? "PASS" : "FAIL"}`);
  } else if (event.event === "dimension_done") {
    log(`Dimension done: ${event.model} / ${event.dimension} mean=${event.stats.mean.toFixed(1)}%`);
  } else if (event.event === "retry") {
    log(`Retry ${event.model} / ${event.dimension} / ${event.test_id}: ${event.attempt}/${event.max_retries} ${event.reason}`);
  } else if (event.event === "model_error") {
    markModelProgress(event.model, "error");
    log(`Model error: ${event.model} ${event.error}`);
  } else if (event.event === "model_paused") {
    markModelProgress(event.model, "paused");
    log(`Paused model: ${event.model}`);
  } else if (event.event === "model_resumed") {
    markModelProgress(event.model, "");
    log(`Resumed model: ${event.model}`);
  } else if (event.event === "model_stopped") {
    markModelProgress(event.model, "stopped");
    log(`Stopped model: ${event.model}`);
  } else if (event.event === "run_stopped") {
    log("Evaluation stopped.");
    setStatus(t("stopped"), false);
    setRunningControls(false);
  } else if (event.event === "all_done") {
    renderRunResult(event.result);
    setRunningControls(false);
  }
}

function updateDimensionActive(event) {
  const row = document.querySelector(`.model-progress[data-model="${cssEscape(event.model)}"] .dimension-progress-row[data-dimension="${cssEscape(event.dimension)}"]`);
  if (!row) return;
  row.classList.add("active");
  const strong = row.querySelector("strong");
  if (strong && strong.textContent === "0/0") strong.textContent = "running";
}

function initializeProgress(event) {
  progressState = { models: new Map(), globalCompleted: 0, globalTotal: event.total || 0 };
  const root = $("dimensionProgress");
  root.innerHTML = "";
  for (const model of event.models || []) {
    const modelCard = document.createElement("div");
    modelCard.className = "model-progress";
    modelCard.dataset.model = model;
    modelCard.innerHTML = `
          <div class="model-progress-header">
        <h3 title="${escapeAttr(model)}">${escapeHtml(model)}</h3>
        <div class="model-actions">
          <button type="button" data-model-action="pause" data-model="${escapeAttr(model)}">${t("actionPause")}</button>
          <button type="button" data-model-action="resume" data-model="${escapeAttr(model)}" disabled>${t("actionResume")}</button>
          <button type="button" data-model-action="stop" data-model="${escapeAttr(model)}">${t("actionStop")}</button>
        </div>
      </div>
    `;
    for (const dimension of event.dimensions || []) {
      const row = document.createElement("div");
      row.className = "dimension-progress-row";
      row.dataset.dimension = dimension.name;
      row.innerHTML = `
        <span>${escapeHtml(dimension.name)}</span>
        <div class="mini-progress"><div></div></div>
        <strong>0/0</strong>
      `;
      modelCard.appendChild(row);
    }
    root.appendChild(modelCard);
  }
  root.querySelectorAll("[data-model-action]").forEach((button) => {
    button.addEventListener("click", () => controlModel(button.dataset.model, button.dataset.modelAction));
  });
}

function updateDimensionProgress(event) {
  const row = document.querySelector(`.model-progress[data-model="${cssEscape(event.model)}"] .dimension-progress-row[data-dimension="${cssEscape(event.dimension)}"]`);
  if (!row) return;
  const percent = event.dimension_total ? event.dimension_completed / event.dimension_total * 100 : 0;
  row.querySelector(".mini-progress div").style.width = `${percent}%`;
  row.querySelector("strong").textContent = `${event.dimension_completed}/${event.dimension_total}`;
  row.classList.remove("active");
}

async function controlModel(model, action) {
  if (!running) return;
  await window.llmEval.controlModel(model, action);
  const card = document.querySelector(`.model-progress[data-model="${cssEscape(model)}"]`);
  if (!card) return;
  const pause = card.querySelector('[data-model-action="pause"]');
  const resume = card.querySelector('[data-model-action="resume"]');
  const stop = card.querySelector('[data-model-action="stop"]');
  if (action === "pause") {
    pause.disabled = true;
    resume.disabled = false;
  } else if (action === "resume") {
    pause.disabled = false;
    resume.disabled = true;
  } else if (action === "stop") {
    pause.disabled = true;
    resume.disabled = true;
    stop.disabled = true;
  }
}

function markModelProgress(model, statusClass) {
  const card = document.querySelector(`.model-progress[data-model="${cssEscape(model)}"]`);
  if (!card) return;
  card.classList.remove("paused", "stopped", "error");
  if (statusClass) card.classList.add(statusClass);
  if (statusClass === "stopped" || statusClass === "error") {
    card.querySelectorAll("[data-model-action]").forEach((button) => { button.disabled = true; });
  }
}

function renderRunResult(result) {
  if (!result?.models) return;
  renderScorePanel(result);
  $("resultRows").innerHTML = Object.entries(result.models).map(([name, item]) => {
    if (item.error) return `<tr><td>${escapeHtml(name)}</td><td>ERROR</td><td>${escapeHtml(item.error)}</td></tr>`;
    const html = item.report_paths?.html || "";
    return `<tr><td>${escapeHtml(name)}</td><td>${Number(item.overall || 0).toFixed(1)}%</td><td><a href="#" data-open="${escapeAttr(html)}">${escapeHtml(html)}</a></td></tr>`;
  }).join("");
  document.querySelectorAll("[data-open]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      window.llmEval.openPath(link.dataset.open);
    });
  });
}

function renderScorePanel(result) {
  const rows = Object.entries(result.models).map(([name, item]) => ({ name, item })).filter((row) => !row.item.error);
  const dimensions = [...new Set(rows.flatMap((row) => Object.keys(row.item.dimension_scores || {})))];
  const ranked = rows.sort((a, b) => Number(b.item.overall || 0) - Number(a.item.overall || 0));
  const errorRows = Object.entries(result.models).filter(([, item]) => item.error);
  if (!ranked.length && !errorRows.length) {
    $("scorePanel").className = "score-panel empty";
    $("scorePanel").textContent = t("scorePanelEmpty");
    return;
  }
  $("scorePanel").className = "score-panel score-grid";
  $("scorePanel").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>${t("rank")}</th>
          <th>${t("model")}</th>
          <th>${t("overall")}</th>
          <th>TTFT</th>
          <th>Tok/s</th>
          <th>${t("latencyP95")}</th>
          <th>${t("outputTokens")}</th>
          ${dimensions.map((name) => `<th>${escapeHtml(name)}</th>`).join("")}
          <th>${t("status")}</th>
        </tr>
      </thead>
      <tbody>
        ${ranked.map((row, index) => `
          <tr>
            <td><span class="score-rank">#${index + 1}</span></td>
            <td>${escapeHtml(row.name)}</td>
            <td>${Number(row.item.overall || 0).toFixed(1)}%</td>
            <td>${formatMs(row.item.performance?.overall?.avg_first_token_ms)}</td>
            <td>${formatNumber(row.item.performance?.overall?.avg_tokens_per_second)}</td>
            <td>${formatMs(row.item.performance?.overall?.p95_latency_ms)}</td>
            <td>${formatNumber(row.item.performance?.overall?.total_output_tokens)}</td>
            ${dimensions.map((name) => `<td>${formatDimensionScore(row.item.dimension_scores?.[name])}</td>`).join("")}
            <td><span class="status-pill">${t("completed")}</span></td>
          </tr>
        `).join("")}
        ${errorRows.map(([name, item]) => `
          <tr>
            <td>-</td>
            <td>${escapeHtml(name)}</td>
            <td>ERROR</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            ${dimensions.map(() => "<td>-</td>").join("")}
            <td><span class="status-pill error" title="${escapeAttr(item.error)}">${t("failed")}</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function formatDimensionScore(stats) {
  if (!stats) return "-";
  return `${Number(stats.mean || 0).toFixed(1)}%`;
}

function formatMs(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(0)} ms` : "-";
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(1) : "-";
}

async function compareReports() {
  const paths = await window.llmEval.compareReports($("outputDir").value || "results", currentLanguage);
  $("reportLog").textContent = JSON.stringify(paths, null, 2);
  if (paths.html) await window.llmEval.openPath(paths.html);
}

function setStatus(text, busy) {
  $("statusText").textContent = text;
  $("statusDot").style.background = busy ? "var(--accent)" : "var(--good)";
}

function setRunningControls(isRunning) {
  running = isRunning;
  refreshRunButton();
  $("abortButton").disabled = !isRunning;
  $("saveModel").disabled = isRunning;
  $("deleteModel").disabled = isRunning;
  $("loadModel").disabled = isRunning;
  $("newModel").disabled = isRunning;
  $("chooseOutput").disabled = isRunning;
  $("retryLimit").disabled = isRunning;
  $("timeoutSeconds").disabled = isRunning;
  $("evalModeComprehensive").disabled = isRunning;
  $("evalModePerformance").disabled = isRunning;
}

function refreshRunButton() {
  const hasModels = selected("modelChecks").length > 0;
  const hasDimensions = selectedDimensions().length > 0;
  $("runButton").disabled = running || !hasModels || (selectedEvalMode() !== "performance" && !hasDimensions);
}

function selectedEvalMode() {
  return document.querySelector('input[name="evalMode"]:checked')?.value || "comprehensive";
}

function log(message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  $("log").textContent += line + "\n";
  $("log").scrollTop = $("log").scrollHeight;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

function isEditable(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

async function pasteIntoEditable(target) {
  if (!navigator.clipboard?.readText) return false;
  try {
    const text = await navigator.clipboard.readText();
    if (typeof target.selectionStart === "number" && typeof target.selectionEnd === "number") {
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const value = target.value || "";
      target.value = value.slice(0, start) + text + value.slice(end);
      const cursor = start + text.length;
      target.setSelectionRange(cursor, cursor);
      target.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    document.execCommand("insertText", false, text);
    return true;
  } catch (_) {
    return false;
  }
}
