const { resolveEnv } = require("./configStore");

function normalizeBaseUrl(value, fallback) {
  return (value || fallback || "").replace(/\/+$/, "");
}

async function runModel(model, prompt, options = {}) {
  const result = await runModelDetailed(model, prompt, options);
  return result.text;
}

async function runModelDetailed(model, prompt, options = {}) {
  const apiFormat = (model.api_format || model.provider || "openai").toLowerCase();
  if (apiFormat === "anthropic") return runAnthropic(model, prompt, options);
  return runOpenAI(model, prompt, options);
}

async function runOpenAI(model, prompt, options = {}) {
  const startedAt = performance.now();
  const baseUrl = normalizeBaseUrl(resolveEnv(model.base_url || model.endpoint), "https://api.openai.com/v1");
  const apiKey = resolveEnv(model.api_key);
  const modelId = model.model_id;
  if (!baseUrl || !apiKey || !modelId) return errorResult("[ERROR] Missing OpenAI-compatible base_url/api_key/model_id", startedAt);

  const endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
  const stream = options.measurePerformance !== false;
  const request = createRequestSignal(options.timeout ?? 60, options.signal);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: prompt }],
        temperature: options.temperature ?? 0,
        max_tokens: options.max_tokens ?? 2048,
        stream
      }),
      signal: request.signal
    });
    if (stream && response.ok && response.body) {
      return await readOpenAIStream(response, startedAt);
    }
    const text = await response.text();
    if (stream && !response.ok && (response.status === 400 || response.status === 422)) {
      return runOpenAI(model, prompt, { ...options, measurePerformance: false });
    }
    if (!response.ok) return errorResult(`[ERROR] HTTP ${response.status}: ${text.slice(0, 500)}`, startedAt);
    const body = JSON.parse(text);
    return resultWithMetrics(body.choices?.[0]?.message?.content || "", startedAt, null);
  } finally {
    request.cleanup();
  }
}

async function runAnthropic(model, prompt, options = {}) {
  const startedAt = performance.now();
  const baseUrl = normalizeBaseUrl(resolveEnv(model.base_url || model.endpoint), "https://api.anthropic.com/v1");
  const apiKey = resolveEnv(model.api_key);
  const modelId = model.model_id;
  if (!baseUrl || !apiKey || !modelId) return errorResult("[ERROR] Missing Anthropic base_url/api_key/model_id", startedAt);

  const endpoint = baseUrl.endsWith("/messages") ? baseUrl : `${baseUrl}/messages`;
  const stream = options.measurePerformance !== false;
  const request = createRequestSignal(options.timeout ?? 60, options.signal);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": model.anthropic_version || "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: options.max_tokens ?? 2048,
        temperature: options.temperature ?? 0,
        messages: [{ role: "user", content: prompt }],
        stream
      }),
      signal: request.signal
    });
    if (stream && response.ok && response.body) {
      return await readAnthropicStream(response, startedAt);
    }
    const text = await response.text();
    if (stream && !response.ok && (response.status === 400 || response.status === 422)) {
      return runAnthropic(model, prompt, { ...options, measurePerformance: false });
    }
    if (!response.ok) return errorResult(`[ERROR] HTTP ${response.status}: ${text.slice(0, 500)}`, startedAt);
    const body = JSON.parse(text);
    return resultWithMetrics((body.content || []).filter((item) => item.type === "text").map((item) => item.text).join("\n"), startedAt, null);
  } finally {
    request.cleanup();
  }
}

async function readOpenAIStream(response, startedAt) {
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  let firstTokenAt = null;
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content || "";
        if (delta && firstTokenAt === null) firstTokenAt = performance.now();
        output += delta;
      } catch (_) {}
    }
  }
  return resultWithMetrics(output, startedAt, firstTokenAt);
}

async function readAnthropicStream(response, startedAt) {
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  let firstTokenAt = null;
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data) continue;
      try {
        const json = JSON.parse(data);
        const delta = json.delta?.text || "";
        if (delta && firstTokenAt === null) firstTokenAt = performance.now();
        output += delta;
      } catch (_) {}
    }
  }
  return resultWithMetrics(output, startedAt, firstTokenAt);
}

function resultWithMetrics(text, startedAt, firstTokenAt) {
  const endedAt = performance.now();
  const outputTokens = estimateTokens(text);
  const totalSeconds = Math.max(0.001, (endedAt - startedAt) / 1000);
  const generationSeconds = Math.max(0.001, (endedAt - (firstTokenAt || startedAt)) / 1000);
  return {
    text,
    metrics: {
      latency_ms: Math.round(endedAt - startedAt),
      first_token_ms: firstTokenAt ? Math.round(firstTokenAt - startedAt) : null,
      output_tokens: outputTokens,
      tokens_per_second: round(outputTokens / generationSeconds),
      total_tokens_per_second: round(outputTokens / totalSeconds)
    }
  };
}

function errorResult(text, startedAt) {
  const data = resultWithMetrics(text, startedAt, null);
  data.metrics.error = text;
  return data;
}

function createRequestSignal(timeoutSeconds, externalSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Request timed out")), Math.max(1, Number(timeoutSeconds) || 60) * 1000);
  const abort = () => controller.abort(externalSignal.reason || new Error("Request aborted"));
  if (externalSignal) {
    if (externalSignal.aborted) abort();
    else externalSignal.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener?.("abort", abort);
    }
  };
}

function estimateTokens(text) {
  const value = String(text || "").trim();
  if (!value) return 0;
  const cjk = (value.match(/[\u3400-\u9fff]/g) || []).length;
  const words = (value.replace(/[\u3400-\u9fff]/g, " ").match(/[A-Za-z0-9_]+(?:['-][A-Za-z0-9_]+)?/g) || []).length;
  const punctuation = (value.match(/[^\sA-Za-z0-9_\u3400-\u9fff]/g) || []).length;
  return Math.max(1, Math.round(cjk * 0.8 + words * 1.25 + punctuation * 0.25));
}

function round(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

module.exports = { runModel, runModelDetailed };
