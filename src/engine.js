const { EventEmitter } = require("events");
const { discoverDimensions, loadConfig, loadDataset, loadUserModels } = require("./configStore");
const { evaluateResponse, aggregate } = require("./evaluator");
const { runModelDetailed } = require("./runner");
const { saveLeaderboard, saveModelReport } = require("./report");

const PERFORMANCE_PROMPTS = [
  {
    id: "perf_short_latency",
    type: "latency",
    max_tokens: 96,
    prompt: "Answer in one concise paragraph: what is the purpose of model latency benchmarking?"
  },
  {
    id: "perf_medium_generation",
    type: "throughput",
    max_tokens: 384,
    prompt: "Write a structured explanation of retrieval augmented generation, including benefits, risks, and production monitoring considerations."
  },
  {
    id: "perf_reasoning_generation",
    type: "mixed",
    max_tokens: 512,
    prompt: "Solve this step by step and then give the final answer: A service processes 125 requests per minute. Traffic grows 18% each month for 4 months. What approximate requests per minute should capacity planning target with a 30% safety margin?"
  }
];

class EvalEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.outputDir = options.outputDir || "results";
    this.aborted = false;
    this.modelControls = new Map();
    this.activeControllers = new Set();
  }

  abort() {
    this.aborted = true;
    for (const controller of this.activeControllers) controller.abort(new Error("Evaluation stopped"));
    this.activeControllers.clear();
    this.emit("event", { event: "run_stopped" });
  }

  pauseModel(modelName) {
    const control = this.ensureModelControl(modelName);
    control.paused = true;
    this.emit("event", { event: "model_paused", model: modelName });
  }

  resumeModel(modelName) {
    const control = this.ensureModelControl(modelName);
    control.paused = false;
    this.emit("event", { event: "model_resumed", model: modelName });
  }

  stopModel(modelName) {
    const control = this.ensureModelControl(modelName);
    control.stopped = true;
    control.paused = false;
    control.controller?.abort(new Error("Model evaluation stopped"));
    this.emit("event", { event: "model_stopped", model: modelName });
  }

  ensureModelControl(modelName) {
    if (!this.modelControls.has(modelName)) {
      this.modelControls.set(modelName, { paused: false, stopped: false });
    }
    return this.modelControls.get(modelName);
  }

  async runModels(modelNames, dimensionNames, options = {}) {
    const config = loadConfig();
    const language = options.language || "en";
    const models = loadUserModels().filter((model) => modelNames.includes(model.name));
    const modelResults = {};
    const configuredConcurrency = Number(options.modelConcurrency ?? config.evaluation?.model_concurrency);
    const workers = Math.max(1, Math.min(Number.isFinite(configuredConcurrency) && configuredConcurrency > 0 ? configuredConcurrency : models.length || 1, models.length || 1));
    const queue = [...models];
    const selectedDimensions = options.performanceOnly ? [] : this.selectDimensions(config, dimensionNames);
    const globalTotal = models.reduce((sum) => sum + (options.performanceOnly ? PERFORMANCE_PROMPTS.length : this.countCases(selectedDimensions, options)), 0);
    const runState = { globalCompleted: 0, globalTotal };

    this.emit("event", {
      event: "run_start",
      models: models.map((model) => model.name),
      dimensions: (options.performanceOnly ? [{ name: "performance", total: PERFORMANCE_PROMPTS.length }] : selectedDimensions.map((dimension) => ({
        name: dimension.name,
        total: this.dimensionLimit(dimension.name, options) || "all"
      }))),
      total: globalTotal
    });

    const runNext = async () => {
      while (queue.length) {
        if (this.aborted) break;
        const model = queue.shift();
        try {
          modelResults[model.name] = options.performanceOnly
            ? await this.runPerformanceModel(model, options, config, runState)
            : await this.runModel(model, dimensionNames, options, config, runState);
        } catch (error) {
          if (this.aborted) break;
          modelResults[model.name] = { model: model.name, error: error.message };
          this.emit("event", { event: "model_error", model: model.name, error: error.message });
        }
      }
    };

    await Promise.all(Array.from({ length: workers }, runNext));
    const comparable = Object.values(modelResults).filter((item) => item.dimension_scores);
    const leaderboard = buildLeaderboard(comparable, discoverDimensions(config));
    const comparisonPaths = leaderboard.length ? saveLeaderboard(this.outputDir, leaderboard, language) : {};
    const result = { models: modelResults, comparison_paths: comparisonPaths, stopped: this.aborted };
    this.emit("event", { event: "all_done", result });
    return result;
  }

  async runModel(model, dimensionNames, options, config = loadConfig(), runState = { globalCompleted: 0, globalTotal: 0 }) {
    const evalOptions = {
      temperature: Number(config.evaluation?.temperature ?? 0),
      max_tokens: Number(config.evaluation?.max_tokens ?? 2048),
      timeout: positiveNumber(options.timeoutSeconds, Number(config.evaluation?.timeout ?? 60))
    };
    const retryLimit = positiveNumber(options.retryLimit, Number(config.evaluation?.retries ?? 10));
    const measurePerformance = options.measurePerformance !== false;
    const dimensions = this.selectDimensions(config, dimensionNames);
    const total = this.countCases(dimensions, options);
    let modelCompleted = 0;
    const detailed = {};
    const dimensionScores = {};
    const dimensionPerformance = {};
    const allPerformance = [];

    for (const dimension of dimensions) {
      if (this.aborted) break;
      this.assertModelActive(model.name);
      const limit = this.dimensionLimit(dimension.name, options);
      const testCases = loadDataset(dimension.dataset, limit);
      let dimensionCompleted = 0;
      const results = [];
      this.emit("event", { event: "dimension_start", model: model.name, dimension: dimension.name, count: testCases.length, model_total: total });

      for (const testCase of testCases) {
        if (this.aborted) break;
        await this.waitIfPaused(model.name);
        if (this.aborted) break;
        this.assertModelActive(model.name);
        const maxTokens = testCase.max_tokens || evalOptions.max_tokens;
        this.emit("event", { event: "case_start", model: model.name, dimension: dimension.name, test_id: testCase.id });
        const response = await runWithRetries(model, testCase.prompt, { ...evalOptions, max_tokens: maxTokens, measurePerformance }, retryLimit, (retryEvent) => {
          this.emit("event", {
            event: "retry",
            model: model.name,
            dimension: dimension.name,
            test_id: testCase.id,
            ...retryEvent
          });
        }, () => this.aborted || this.ensureModelControl(model.name).stopped, () => this.createAttemptSignal(model.name));
        const score = evaluateResponse(dimension.name, response.text, testCase);
        score.performance = response.metrics;
        results.push(score);
        if (response.metrics) allPerformance.push(response.metrics);
        dimensionCompleted += 1;
        modelCompleted += 1;
        runState.globalCompleted += 1;
        this.emit("event", {
          event: "case_done",
          model: model.name,
          dimension: dimension.name,
          test_id: testCase.id,
          score: score.score,
          passed: score.passed,
          performance: response.metrics,
          dimension_completed: dimensionCompleted,
          dimension_total: testCases.length,
          model_completed: modelCompleted,
          model_total: total,
          global_completed: runState.globalCompleted,
          global_total: runState.globalTotal
        });
      }

      detailed[dimension.name] = results;
      dimensionScores[dimension.name] = aggregate(results);
      dimensionPerformance[dimension.name] = aggregatePerformance(results.map((item) => item.performance).filter(Boolean));
      this.emit("event", { event: "dimension_done", model: model.name, dimension: dimension.name, stats: dimensionScores[dimension.name] });
    }

    if (this.aborted) throw new Error("Evaluation stopped");
    const overall = computeOverall(dimensionScores, dimensions);
    const report = {
      model: model.name,
      language: options.language || "en",
      timestamp: new Date().toISOString(),
      overall_score: overall,
      dimensions: dimensionScores,
      performance: {
        overall: aggregatePerformance(allPerformance),
        by_dimension: dimensionPerformance
      },
      detailed_results: detailed
    };
    const reportPaths = saveModelReport(this.outputDir, report, options.language || "en");
    return { model: model.name, overall, dimension_scores: dimensionScores, detailed_results: detailed, performance: report.performance, report_paths: reportPaths };
  }

  async runPerformanceModel(model, options, config = loadConfig(), runState = { globalCompleted: 0, globalTotal: 0 }) {
    const evalOptions = {
      temperature: 0,
      max_tokens: positiveNumber(options.performanceMaxTokens, 512),
      timeout: positiveNumber(options.timeoutSeconds, Number(config.evaluation?.timeout ?? 60))
    };
    const retryLimit = positiveNumber(options.retryLimit, Number(config.evaluation?.retries ?? 10));
    const detailed = [];
    let completed = 0;
    this.emit("event", { event: "dimension_start", model: model.name, dimension: "performance", count: PERFORMANCE_PROMPTS.length, model_total: PERFORMANCE_PROMPTS.length });
    for (const testCase of PERFORMANCE_PROMPTS) {
      if (this.aborted) break;
      await this.waitIfPaused(model.name);
      if (this.aborted) break;
      this.assertModelActive(model.name);
      this.emit("event", { event: "case_start", model: model.name, dimension: "performance", test_id: testCase.id });
      const response = await runWithRetries(model, testCase.prompt, { ...evalOptions, max_tokens: testCase.max_tokens, measurePerformance: true }, retryLimit, (retryEvent) => {
        this.emit("event", { event: "retry", model: model.name, dimension: "performance", test_id: testCase.id, ...retryEvent });
      }, () => this.aborted || this.ensureModelControl(model.name).stopped, () => this.createAttemptSignal(model.name));
      completed += 1;
      runState.globalCompleted += 1;
      detailed.push({ test_id: testCase.id, prompt_type: testCase.type, performance: response.metrics, output_preview: String(response.text || "").slice(0, 500) });
      this.emit("event", {
        event: "case_done",
        model: model.name,
        dimension: "performance",
        test_id: testCase.id,
        score: 1,
        passed: true,
        performance: response.metrics,
        dimension_completed: completed,
        dimension_total: PERFORMANCE_PROMPTS.length,
        model_completed: completed,
        model_total: PERFORMANCE_PROMPTS.length,
        global_completed: runState.globalCompleted,
        global_total: runState.globalTotal
      });
    }
    if (this.aborted) throw new Error("Evaluation stopped");
    const performance = aggregatePerformance(detailed.map((item) => item.performance).filter(Boolean));
    const score = performanceScore(performance);
    const dimensionScores = { performance: { mean: score, pass_rate: 100, count: detailed.length, min: score, max: score } };
    const report = {
      model: model.name,
      language: options.language || "en",
      timestamp: new Date().toISOString(),
      overall_score: score,
      dimensions: dimensionScores,
      performance: { overall: performance, by_dimension: { performance } },
      detailed_results: { performance: detailed }
    };
    const reportPaths = saveModelReport(this.outputDir, report, options.language || "en");
    this.emit("event", { event: "dimension_done", model: model.name, dimension: "performance", stats: dimensionScores.performance });
    return { model: model.name, overall: score, dimension_scores: dimensionScores, detailed_results: report.detailed_results, performance: report.performance, report_paths: reportPaths };
  }

  async waitIfPaused(modelName) {
    while (!this.aborted) {
      const control = this.ensureModelControl(modelName);
      if (control.stopped) throw new Error("用户已终止该模型评测");
      if (!control.paused) return;
      await delay(250);
    }
  }

  assertModelActive(modelName) {
    const control = this.ensureModelControl(modelName);
    if (control.stopped) throw new Error("用户已终止该模型评测");
  }

  createAttemptSignal(modelName) {
    const controller = new AbortController();
    const control = this.ensureModelControl(modelName);
    control.controller = controller;
    this.activeControllers.add(controller);
    return {
      signal: controller.signal,
      release: () => {
        this.activeControllers.delete(controller);
        if (control.controller === controller) control.controller = null;
      }
    };
  }

  selectDimensions(config, dimensionNames) {
    return discoverDimensions(config).filter((dimension) => !dimensionNames?.length || dimensionNames.includes(dimension.name));
  }

  dimensionLimit(dimensionName, options) {
    const value = options.dimensionLimits?.[dimensionName] ?? options.limit;
    if (value === undefined || value === null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  countCases(dimensions, options) {
    return dimensions.reduce((sum, dimension) => {
      const limit = this.dimensionLimit(dimension.name, options);
      return sum + loadDataset(dimension.dataset, limit).length;
    }, 0);
  }
}

async function runWithRetries(model, prompt, options, retries, onRetry, shouldStop = () => false, createAttemptSignal = () => ({ signal: null, release: () => {} })) {
  let lastError = "";
  const maxRetries = Math.max(0, Math.floor(Number(retries) || 0));
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (shouldStop()) throw new Error("评测已终止");
    const request = createAttemptSignal();
    try {
      const output = await runModelDetailed(model, prompt, { ...options, signal: request.signal });
      if (!String(output.text).startsWith("[ERROR]")) return output;
      lastError = String(output.text);
    } catch (error) {
      if (shouldStop()) throw new Error("评测已终止");
      lastError = normalizeError(error);
    } finally {
      request.release();
    }
    if (shouldStop()) throw new Error("评测已终止");
    if (attempt < maxRetries) {
      onRetry?.({
        attempt: attempt + 1,
        max_retries: maxRetries,
        reason: lastError
      });
      await delay(Math.min(8000, 500 * Math.pow(2, attempt)));
    }
  }
  throw new Error(`接口请求失败，已重试 ${maxRetries} 次仍未恢复，已终止当前模型评测。最后错误：${lastError}`);
}

function buildLeaderboard(results, dimensions) {
  return results.map((item) => ({
    model: item.model,
    overall: computeOverall(item.dimension_scores, dimensions),
    dimensions: Object.fromEntries(Object.entries(item.dimension_scores).map(([name, stats]) => [name, stats.mean])),
    performance: item.performance?.overall || item.performance || {}
  })).sort((a, b) => b.overall - a.overall);
}

function computeOverall(scores, dimensions) {
  let totalWeight = 0;
  let weighted = 0;
  const weights = Object.fromEntries(dimensions.map((dimension) => [dimension.name, Number(dimension.weight || 1)]));
  for (const [dimension, stats] of Object.entries(scores)) {
    const weight = weights[dimension] ?? 1;
    totalWeight += weight;
    weighted += Number(stats.mean || 0) * weight;
  }
  return totalWeight ? weighted / totalWeight : 0;
}

function aggregatePerformance(items) {
  const valid = items.filter(Boolean);
  if (!valid.length) {
    return {
      count: 0,
      avg_latency_ms: 0,
      p50_latency_ms: 0,
      p95_latency_ms: 0,
      avg_first_token_ms: null,
      p50_first_token_ms: null,
      p95_first_token_ms: null,
      avg_tokens_per_second: 0,
      max_tokens_per_second: 0,
      min_tokens_per_second: 0,
      avg_total_tokens_per_second: 0,
      total_output_tokens: 0,
      avg_output_tokens: 0,
      success_rate: 0
    };
  }
  const firstTokens = valid.map((item) => item.first_token_ms).filter((value) => Number.isFinite(Number(value)));
  const latencies = valid.map((item) => Number(item.latency_ms || 0)).sort((a, b) => a - b);
  const throughputs = valid.map((item) => Number(item.tokens_per_second || 0)).sort((a, b) => a - b);
  const outputTokens = valid.map((item) => Number(item.output_tokens || 0));
  return {
    count: valid.length,
    avg_latency_ms: round(avg(latencies)),
    p50_latency_ms: round(percentile(latencies, 50)),
    p95_latency_ms: round(percentile(latencies, 95)),
    avg_first_token_ms: firstTokens.length ? round(avg(firstTokens)) : null,
    p50_first_token_ms: firstTokens.length ? round(percentile(firstTokens.sort((a, b) => a - b), 50)) : null,
    p95_first_token_ms: firstTokens.length ? round(percentile(firstTokens.sort((a, b) => a - b), 95)) : null,
    avg_tokens_per_second: round(avg(throughputs)),
    max_tokens_per_second: round(Math.max(...throughputs)),
    min_tokens_per_second: round(Math.min(...throughputs)),
    avg_total_tokens_per_second: round(avg(valid.map((item) => Number(item.total_tokens_per_second || 0)))),
    total_output_tokens: outputTokens.reduce((sum, value) => sum + value, 0),
    avg_output_tokens: round(avg(outputTokens)),
    success_rate: 100
  };
}

function performanceScore(performance) {
  if (!performance?.count) return 0;
  const ttft = performance.avg_first_token_ms || performance.avg_latency_ms || 60000;
  const latencyScore = Math.max(0, 100 - ttft / 40);
  const throughputScore = Math.min(100, Number(performance.avg_tokens_per_second || 0) * 4);
  return round(latencyScore * 0.45 + throughputScore * 0.55);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeError(error) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return "请求超时";
  return error?.message || String(error);
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function avg(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function round(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

module.exports = { EvalEngine, buildLeaderboard };
