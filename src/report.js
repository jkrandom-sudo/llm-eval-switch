const fs = require("fs");
const path = require("path");
const { projectPath } = require("./paths");

function safeName(value) {
  return String(value || "model").replace(/[^a-z0-9_.-]+/gi, "_").replace(/^_+|_+$/g, "") || "model";
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function saveModelReport(outputDir, report, language = report.language || "en") {
  const target = path.isAbsolute(outputDir) ? outputDir : projectPath(outputDir);
  ensureDir(target);
  report.language = language;
  const base = safeName(report.model);
  const jsonPath = path.join(target, `${base}_full_report.json`);
  const htmlPath = path.join(target, `${base}_full_report.html`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(htmlPath, renderModelHtml(report, language), "utf8");
  return { json: jsonPath, html: htmlPath };
}

function saveLeaderboard(outputDir, leaderboard, language = "en") {
  const target = path.isAbsolute(outputDir) ? outputDir : projectPath(outputDir);
  ensureDir(target);
  const data = { timestamp: new Date().toISOString(), language, models: leaderboard };
  const jsonPath = path.join(target, "leaderboard.json");
  const htmlPath = path.join(target, "leaderboard.html");
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf8");
  fs.writeFileSync(htmlPath, renderLeaderboardHtml(data, language), "utf8");
  return { json: jsonPath, html: htmlPath };
}

function renderModelHtml(report, language = "en") {
  const text = reportText(language);
  const rows = Object.entries(report.dimensions || {}).map(([name, stats]) => `
    <tr><td>${escapeHtml(name)}</td><td>${fmt(stats.mean)}%</td><td>${fmt(stats.pass_rate)}%</td><td>${stats.count}</td></tr>
  `).join("");
  const perf = report.performance?.overall || {};
  const perfRows = `
    <tr><td>${text.requests}</td><td>${perf.count || 0}</td></tr>
    <tr><td>${text.avgFirstToken}</td><td>${perf.avg_first_token_ms == null ? "N/A" : `${fmt(perf.avg_first_token_ms)} ms`}</td></tr>
    <tr><td>${text.p95FirstToken}</td><td>${perf.p95_first_token_ms == null ? "N/A" : `${fmt(perf.p95_first_token_ms)} ms`}</td></tr>
    <tr><td>${text.avgLatency}</td><td>${fmt(perf.avg_latency_ms)} ms</td></tr>
    <tr><td>${text.p50Latency}</td><td>${fmt(perf.p50_latency_ms)} ms</td></tr>
    <tr><td>${text.p95Latency}</td><td>${fmt(perf.p95_latency_ms)} ms</td></tr>
    <tr><td>${text.outputTps}</td><td>${fmt(perf.avg_tokens_per_second)}</td></tr>
    <tr><td>${text.maxTps}</td><td>${fmt(perf.max_tokens_per_second)}</td></tr>
    <tr><td>${text.totalOutputTokens}</td><td>${perf.total_output_tokens || 0}</td></tr>
    <tr><td>${text.avgOutputTokens}</td><td>${fmt(perf.avg_output_tokens)}</td></tr>
    <tr><td>${text.successRate}</td><td>${fmt(perf.success_rate)}%</td></tr>
  `;
  const failed = [];
  for (const [dimension, results] of Object.entries(report.detailed_results || {})) {
    for (const item of results) {
      if (!item.passed) {
        failed.push(`<tr><td>${escapeHtml(dimension)}</td><td>${escapeHtml(item.test_id)}</td><td>${fmt(item.score * 100)}%</td><td><pre>${escapeHtml(JSON.stringify(item.details || {}, null, 2))}</pre></td></tr>`);
      }
    }
  }
  return page(`${report.model} ${text.report}`, `
    <section class="hero"><div><p>${text.modelEvaluationReport}</p><h1>${escapeHtml(report.model)}</h1><span>${escapeHtml(report.timestamp)}</span></div><strong>${fmt(report.overall_score)}%</strong></section>
    <section><h2>${text.dimensionScores}</h2><table><thead><tr><th>${text.dimension}</th><th>${text.score}</th><th>${text.passRate}</th><th>${text.cases}</th></tr></thead><tbody>${rows}</tbody></table></section>
    <section><h2>${text.performanceMetrics}</h2><table><thead><tr><th>${text.metric}</th><th>${text.value}</th></tr></thead><tbody>${perfRows}</tbody></table></section>
    <section><h2>${text.failedCases}</h2><table><thead><tr><th>${text.dimension}</th><th>${text.case}</th><th>${text.score}</th><th>${text.details}</th></tr></thead><tbody>${failed.join("") || `<tr><td colspan="4">${text.noFailedCases}</td></tr>`}</tbody></table></section>
  `, language);
}

function renderLeaderboardHtml(data, language = data.language || "en") {
  const text = reportText(language);
  const dimensions = [];
  for (const model of data.models || []) {
    for (const dimension of Object.keys(model.dimensions || {})) {
      if (!dimensions.includes(dimension)) dimensions.push(dimension);
    }
  }
  const headers = dimensions.map((dimension) => `<th>${escapeHtml(dimension)}</th>`).join("");
  const rows = (data.models || []).map((model, index) => `
    <tr><td>${index + 1}</td><td>${escapeHtml(model.model)}</td><td>${fmt(model.overall)}%</td><td>${model.performance?.avg_first_token_ms == null ? "N/A" : fmt(model.performance.avg_first_token_ms)}</td><td>${fmt(model.performance?.avg_tokens_per_second)}</td>${dimensions.map((dimension) => `<td>${fmt(model.dimensions?.[dimension] || 0)}%</td>`).join("")}</tr>
  `).join("");
  return page(text.leaderboard, `
    <section class="hero"><div><p>${text.modelComparison}</p><h1>${text.leaderboard}</h1><span>${escapeHtml(data.timestamp)}</span></div><strong>${data.models.length}</strong></section>
    <section><table><thead><tr><th>${text.rank}</th><th>${text.model}</th><th>${text.overall}</th><th>TTFT ms</th><th>Tok/s</th>${headers}</tr></thead><tbody>${rows}</tbody></table></section>
  `, language);
}

function page(title, body, language = "en") {
  return `<!doctype html><html lang="${escapeAttr(language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
  body{margin:0;background:#101217;color:#edf1f7;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  main{width:min(1180px,calc(100% - 32px));margin:24px auto 48px}
  .hero{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid #2b3340;padding:28px 0 22px}
  h1{margin:0;font-size:34px} h2{margin:28px 0 12px;font-size:18px} p{margin:0 0 6px;color:#7dd3fc;text-transform:uppercase;font-size:12px;font-weight:800} span{color:#9aa5b5}
  strong{font-size:48px;color:#86efac} table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #2b3340;padding:10px;text-align:left;vertical-align:top} th{color:#9aa5b5;font-size:12px;text-transform:uppercase} pre{margin:0;white-space:pre-wrap;color:#cbd5e1}
  </style></head><body><main>${body}</main></body></html>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function fmt(value) {
  return Number(value || 0).toFixed(1);
}

function reportText(language) {
  const dictionaries = {
    en: {
      report: "Report", modelEvaluationReport: "Model Evaluation Report", dimensionScores: "Dimension Scores",
      performanceMetrics: "Performance Metrics", failedCases: "Failed / Partial Cases", noFailedCases: "No failed cases.",
      dimension: "Dimension", score: "Score", passRate: "Pass Rate", cases: "Cases", case: "Case", details: "Details",
      metric: "Metric", value: "Value", requests: "Requests", avgFirstToken: "Average first token", p95FirstToken: "P95 first token",
      avgLatency: "Average latency", p50Latency: "P50 latency", p95Latency: "P95 latency", outputTps: "Output tokens/sec",
      maxTps: "Max tokens/sec", totalOutputTokens: "Total output tokens", avgOutputTokens: "Average output tokens", successRate: "Success rate",
      leaderboard: "Leaderboard", modelComparison: "Model Comparison", rank: "Rank", model: "Model", overall: "Overall"
    },
    "zh-CN": {
      report: "报告", modelEvaluationReport: "模型评测报告", dimensionScores: "维度评分",
      performanceMetrics: "性能指标", failedCases: "失败 / 部分通过题目", noFailedCases: "没有失败题目。",
      dimension: "维度", score: "得分", passRate: "通过率", cases: "题数", case: "题目", details: "详情",
      metric: "指标", value: "数值", requests: "请求数", avgFirstToken: "平均首 token 时间", p95FirstToken: "P95 首 token 时间",
      avgLatency: "平均延迟", p50Latency: "P50 延迟", p95Latency: "P95 延迟", outputTps: "输出 tokens/秒",
      maxTps: "最大 tokens/秒", totalOutputTokens: "总输出 tokens", avgOutputTokens: "平均输出 tokens", successRate: "成功率",
      leaderboard: "排行榜", modelComparison: "模型对比", rank: "排名", model: "模型", overall: "总分"
    },
    "zh-TW": {
      report: "報告", modelEvaluationReport: "模型評測報告", dimensionScores: "維度評分",
      performanceMetrics: "效能指標", failedCases: "失敗 / 部分通過題目", noFailedCases: "沒有失敗題目。",
      dimension: "維度", score: "得分", passRate: "通過率", cases: "題數", case: "題目", details: "詳情",
      metric: "指標", value: "數值", requests: "請求數", avgFirstToken: "平均首 token 時間", p95FirstToken: "P95 首 token 時間",
      avgLatency: "平均延遲", p50Latency: "P50 延遲", p95Latency: "P95 延遲", outputTps: "輸出 tokens/秒",
      maxTps: "最大 tokens/秒", totalOutputTokens: "總輸出 tokens", avgOutputTokens: "平均輸出 tokens", successRate: "成功率",
      leaderboard: "排行榜", modelComparison: "模型對比", rank: "排名", model: "模型", overall: "總分"
    },
    ja: {
      report: "レポート", modelEvaluationReport: "モデル評価レポート", dimensionScores: "評価軸スコア",
      performanceMetrics: "性能指標", failedCases: "失敗 / 部分成功ケース", noFailedCases: "失敗ケースはありません。",
      dimension: "評価軸", score: "スコア", passRate: "合格率", cases: "件数", case: "ケース", details: "詳細",
      metric: "指標", value: "値", requests: "リクエスト数", avgFirstToken: "平均初回 token 時間", p95FirstToken: "P95 初回 token 時間",
      avgLatency: "平均レイテンシ", p50Latency: "P50 レイテンシ", p95Latency: "P95 レイテンシ", outputTps: "出力 tokens/秒",
      maxTps: "最大 tokens/秒", totalOutputTokens: "総出力 tokens", avgOutputTokens: "平均出力 tokens", successRate: "成功率",
      leaderboard: "ランキング", modelComparison: "モデル比較", rank: "順位", model: "モデル", overall: "総合"
    },
    ko: {
      report: "보고서", modelEvaluationReport: "모델 평가 보고서", dimensionScores: "차원 점수",
      performanceMetrics: "성능 지표", failedCases: "실패 / 부분 통과 사례", noFailedCases: "실패 사례가 없습니다.",
      dimension: "차원", score: "점수", passRate: "통과율", cases: "문항 수", case: "문항", details: "세부 정보",
      metric: "지표", value: "값", requests: "요청 수", avgFirstToken: "평균 첫 token 시간", p95FirstToken: "P95 첫 token 시간",
      avgLatency: "평균 지연", p50Latency: "P50 지연", p95Latency: "P95 지연", outputTps: "출력 tokens/초",
      maxTps: "최대 tokens/초", totalOutputTokens: "총 출력 tokens", avgOutputTokens: "평균 출력 tokens", successRate: "성공률",
      leaderboard: "순위표", modelComparison: "모델 비교", rank: "순위", model: "모델", overall: "종합"
    },
    fr: {
      report: "Rapport", modelEvaluationReport: "Rapport d'évaluation du modèle", dimensionScores: "Scores par dimension",
      performanceMetrics: "Métriques de performance", failedCases: "Cas échoués / partiels", noFailedCases: "Aucun cas échoué.",
      dimension: "Dimension", score: "Score", passRate: "Taux de réussite", cases: "Cas", case: "Cas", details: "Détails",
      metric: "Métrique", value: "Valeur", requests: "Requêtes", avgFirstToken: "Temps moyen du premier token", p95FirstToken: "P95 premier token",
      avgLatency: "Latence moyenne", p50Latency: "Latence P50", p95Latency: "Latence P95", outputTps: "Tokens de sortie/sec",
      maxTps: "Tokens/sec max", totalOutputTokens: "Total tokens de sortie", avgOutputTokens: "Tokens moyens de sortie", successRate: "Taux de succès",
      leaderboard: "Classement", modelComparison: "Comparaison de modèles", rank: "Rang", model: "Modèle", overall: "Global"
    },
    de: {
      report: "Bericht", modelEvaluationReport: "Modellbewertungsbericht", dimensionScores: "Dimensionswerte",
      performanceMetrics: "Leistungsmetriken", failedCases: "Fehlgeschlagene / Teilfälle", noFailedCases: "Keine fehlgeschlagenen Fälle.",
      dimension: "Dimension", score: "Wert", passRate: "Bestehensrate", cases: "Fälle", case: "Fall", details: "Details",
      metric: "Metrik", value: "Wert", requests: "Anfragen", avgFirstToken: "Durchschnittlicher erster Token", p95FirstToken: "P95 erster Token",
      avgLatency: "Durchschnittslatenz", p50Latency: "P50-Latenz", p95Latency: "P95-Latenz", outputTps: "Ausgabe-Tokens/s",
      maxTps: "Max. Tokens/s", totalOutputTokens: "Ausgabe-Tokens gesamt", avgOutputTokens: "Durchschnittliche Ausgabe-Tokens", successRate: "Erfolgsrate",
      leaderboard: "Rangliste", modelComparison: "Modellvergleich", rank: "Rang", model: "Modell", overall: "Gesamt"
    },
    es: {
      report: "Informe", modelEvaluationReport: "Informe de evaluación del modelo", dimensionScores: "Puntuaciones por dimensión",
      performanceMetrics: "Métricas de rendimiento", failedCases: "Casos fallidos / parciales", noFailedCases: "No hay casos fallidos.",
      dimension: "Dimensión", score: "Puntuación", passRate: "Tasa de aprobación", cases: "Casos", case: "Caso", details: "Detalles",
      metric: "Métrica", value: "Valor", requests: "Solicitudes", avgFirstToken: "Tiempo medio del primer token", p95FirstToken: "P95 primer token",
      avgLatency: "Latencia media", p50Latency: "Latencia P50", p95Latency: "Latencia P95", outputTps: "Tokens de salida/seg",
      maxTps: "Tokens/seg máx.", totalOutputTokens: "Tokens de salida totales", avgOutputTokens: "Tokens de salida medios", successRate: "Tasa de éxito",
      leaderboard: "Clasificación", modelComparison: "Comparación de modelos", rank: "Puesto", model: "Modelo", overall: "Global"
    }
  };
  return dictionaries[language] || dictionaries.en;
}

module.exports = { saveModelReport, saveLeaderboard };
