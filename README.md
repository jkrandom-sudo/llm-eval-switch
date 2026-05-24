<p align="center">
  <img src="https://img.shields.io/badge/Electron-39-101217?logo=electron" alt="Electron 39">
  <img src="https://img.shields.io/badge/platform-macOS%20|%20Windows-lightgrey" alt="platform">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
  <img src="https://img.shields.io/badge/i18n-8_languages-blue" alt="8 languages">
</p>

---

[English](#english) | [简体中文](#简体中文) | [繁體中文](#繁體中文) | [日本語](#日本語) | [한국어](#한국어)

---

## English

### LLM Eval Switch

A standalone Electron desktop app for configuring and benchmarking LLMs across 18 evaluation dimensions. Dark toolbench layout inspired by developer consoles — model & dimension selection on the left, evaluation workspace on the right.

### Features

- No Python dependency — runs as a native desktop application.
- Supports **OpenAI-compatible** `/chat/completions` and **Anthropic** `/v1/messages` APIs.
- **18 evaluation dimensions** with 1,000 questions each: reasoning, coding, safety, math, tool use, long context, multilingual, creative writing, instruction following, data analysis, code review, counterfactual reasoning, domain expertise, structured output, robustness, agent planning, retrieval QA, and general knowledge.
- Model configurations persist locally — no example models from `eval_config.yaml` leak into the UI.
- Run single-model or multi-model evaluations with configurable concurrency.
- Performance benchmarking mode with TTFT, tokens/sec, and P95 latency.
- Generates per-model **JSON + HTML reports** and multi-model **leaderboard** comparisons.
- Full i18n support: English, 简体中文, 繁體中文, 日本語, 한국어, Français, Deutsch, Español.
- `eval_config.yaml` supports `${ENV_VAR}` interpolation for API keys.

### Download

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon / Intel) | [LLM Eval Switch-1.0.0.dmg](https://github.com/jkrandom-sudo/llm-eval-switch/releases/download/v1.0.0/LLM%20Eval%20Switch-1.0.0.dmg) |
| Windows | [LLM Eval Switch Setup 1.0.0.exe](https://github.com/jkrandom-sudo/llm-eval-switch/releases/download/v1.0.0/LLM%20Eval%20Switch%20Setup%201.0.0.exe) |

> macOS: After downloading, open the DMG and drag `LLM Eval Switch.app` to `/Applications`. First launch may take a few seconds while macOS verifies the app.
>
> Windows: Run the installer. If SmartScreen warns, click "More info" → "Run anyway".

### Quick Start (Developers)

```bash
git clone https://github.com/jkrandom-sudo/llm-eval-switch.git
cd llm-eval-switch
npm install
npm start
```

macOS double-click: `start_mac.command`
Windows double-click: `start_windows.bat`

### Build

```bash
npm run dist:mac   # macOS DMG + ZIP
npm run dist:win   # Windows NSIS + Portable
```

Output appears in `dist/`.

### Configuration

Models added via the UI are persisted. `eval_config.yaml` defines evaluation parameters:

```yaml
models:
  - name: "my-model"
    api_format: "openai"          # or "anthropic"
    base_url: "https://api.openai.com/v1"
    api_key: "${OPENAI_API_KEY}"  # env-var interpolation
    model_id: "gpt-4.1"

evaluation:
  temperature: 0.0
  max_tokens: 2048
  timeout: 60
  concurrency: 1

dimensions:
  reasoning:
    weight: 0.09
    scoring: "step_checking"
```

### Smoke Tests

```bash
npm run check
```

Requires `datasets/` and `eval_config.yaml` in the project root.

---

## 简体中文

### LLM Eval Switch

独立 Electron 桌面应用，用于在大模型评测的 18 个维度上进行配置和基准测试。深色工具台布局 —— 左侧选择模型和维度，右侧为评测工作区。

### 功能特性

- 无需 Python 环境，以原生桌面应用运行。
- 支持 **OpenAI-compatible** `/chat/completions` 和 **Anthropic** `/v1/messages` 接口。
- **18 个评测维度**，每个维度 1000 道题：推理、编程、安全、数学、工具调用、长文本、多语言、创意写作、指令遵循、数据分析、代码审查、反事实推理、领域专业知识、结构化输出、鲁棒性、Agent 规划、检索问答和通用知识。
- 模型配置本地持久化保存。
- 支持单模型和多模型并行评测，可配置并发数。
- 性能基准测试模式，记录首 Token 时间、每秒 Token 数、P95 延迟。
- 生成每个模型的 **JSON + HTML 报告**，以及多模型排行榜对比。
- 完整国际化：English、简体中文、繁體中文、日本語、한국어、Français、Deutsch、Español。
- `eval_config.yaml` 支持 `${环境变量}` 方式配置 API Key。

### 下载

| 平台 | 下载链接 |
|------|----------|
| macOS（Apple Silicon / Intel） | [LLM Eval Switch-1.0.0.dmg](https://github.com/jkrandom-sudo/llm-eval-switch/releases/download/v1.0.0/LLM%20Eval%20Switch-1.0.0.dmg) |
| Windows | [LLM Eval Switch Setup 1.0.0.exe](https://github.com/jkrandom-sudo/llm-eval-switch/releases/download/v1.0.0/LLM%20Eval%20Switch%20Setup%201.0.0.exe) |

> macOS：下载后打开 DMG，将 `LLM Eval Switch.app` 拖入 `/Applications` 即可。首次打开时 macOS 会进行安全验证，可能需要等待几秒。
>
> Windows：运行安装程序。若出现 SmartScreen 警告，点击「更多信息」→「仍要运行」。

### 开发快速开始

```bash
git clone https://github.com/jkrandom-sudo/llm-eval-switch.git
cd llm-eval-switch
npm install
npm start
```

macOS 可双击 `start_mac.command`，Windows 可双击 `start_windows.bat`。

### 打包

```bash
npm run dist:mac   # macOS DMG + ZIP
npm run dist:win   # Windows 安装包 + 便携版
```

产物输出至 `dist/` 目录。

### 配置说明

在界面中新增/编辑/删除的模型会自动持久化保存。`eval_config.yaml` 用于维护评测参数：

```yaml
models:
  - name: "我的模型"
    api_format: "openai"          # 或 "anthropic"
    base_url: "https://api.openai.com/v1"
    api_key: "${OPENAI_API_KEY}"  # 环境变量引用
    model_id: "gpt-4.1"

evaluation:
  temperature: 0.0
  max_tokens: 2048
  timeout: 60
  concurrency: 1

dimensions:
  reasoning:
    weight: 0.09
    scoring: "step_checking"
```

---

## 繁體中文

### LLM Eval Switch

獨立 Electron 桌面應用，用於在 18 個評測維度上進行大模型配置與基準測試。採用深色工具台佈局 —— 左側選擇模型與維度，右側為評測工作區。

### 功能特性

- 無需 Python 環境，以原生桌面應用執行。
- 支援 **OpenAI-compatible** `/chat/completions` 和 **Anthropic** `/v1/messages` 介面。
- **18 個評測維度**，每個維度 1000 道題：推理、程式設計、安全、數學、工具調用、長文本、多語言、創意寫作、指令遵循、資料分析、程式碼審查、反事實推理、領域專業知識、結構化輸出、穩健性、Agent 規劃、檢索問答與通用知識。
- 模型設定本機持久化儲存。
- 支援單模型與多模型並行評測，可設定併發數。
- 效能基準測試模式，記錄首 Token 時間、每秒 Token 數、P95 延遲。
- 生成每個模型的 **JSON + HTML 報告**，以及多模型排行榜對比。
- 完整國際化：English、简体中文、繁體中文、日本語、한국어、Français、Deutsch、Español。
- `eval_config.yaml` 支援 `${環境變數}` 方式設定 API Key。

### 下載

| 平台 | 下載連結 |
|------|----------|
| macOS（Apple Silicon / Intel） | [LLM Eval Switch-1.0.0.dmg](https://github.com/jkrandom-sudo/llm-eval-switch/releases/download/v1.0.0/LLM%20Eval%20Switch-1.0.0.dmg) |
| Windows | [LLM Eval Switch Setup 1.0.0.exe](https://github.com/jkrandom-sudo/llm-eval-switch/releases/download/v1.0.0/LLM%20Eval%20Switch%20Setup%201.0.0.exe) |

> macOS：下載後開啟 DMG，將 `LLM Eval Switch.app` 拖入 `/Applications` 即可。首次開啟時 macOS 會進行安全驗證，可能需要等待數秒。
>
> Windows：執行安裝程式。若出現 SmartScreen 警告，點選「更多資訊」→「仍要執行」。

### 開發快速開始

```bash
git clone https://github.com/jkrandom-sudo/llm-eval-switch.git
cd llm-eval-switch
npm install
npm start
```

macOS 可雙擊 `start_mac.command`，Windows 可雙擊 `start_windows.bat`。

### 打包

```bash
npm run dist:mac   # macOS DMG + ZIP
npm run dist:win   # Windows 安裝程式 + 可攜版
```

### 設定說明

在介面中新增/編輯/刪除的模型會自動持久化儲存。

---

## 日本語

### LLM Eval Switch

18 の評価次元で LLM を設定・ベンチマークするためのスタンドアロン Electron デスクトップアプリです。ダークツールベンチレイアウト — 左側にモデルと次元の選択、右側に評価ワークスペースを配置。

### 主な機能

- Python 不要 — ネイティブデスクトップアプリとして動作します。
- **OpenAI-compatible** `/chat/completions` および **Anthropic** `/v1/messages` API をサポート。
- **18 の評価次元**、各 1000 問：推論、コーディング、安全性、数学、ツール使用、ロングコンテキスト、多言語、クリエイティブライティング、指示追従、データ分析、コードレビュー、反実仮想推論、専門知識、構造化出力、ロバスト性、エージェント計画、検索 QA、一般知識。
- モデル設定はローカルに永続化されます。
- シングルモデル・マルチモデル評価に対応し、並列数を設定可能。
- パフォーマンスベンチマークモード（TTFT、トークン/秒、P95 レイテンシ）。
- モデルごとの **JSON + HTML レポート**とマルチモデルリーダーボードを生成。
- 8 言語の完全な国際化対応。
- `eval_config.yaml` で `${環境変数}` による API キー設定が可能。

### ダウンロード

| プラットフォーム | ダウンロード |
|------------------|--------------|
| macOS（Apple Silicon / Intel） | [LLM Eval Switch-1.0.0.dmg](https://github.com/jkrandom-sudo/llm-eval-switch/releases/download/v1.0.0/LLM%20Eval%20Switch-1.0.0.dmg) |
| Windows | [LLM Eval Switch Setup 1.0.0.exe](https://github.com/jkrandom-sudo/llm-eval-switch/releases/download/v1.0.0/LLM%20Eval%20Switch%20Setup%201.0.0.exe) |

> macOS：DMG を開き、`LLM Eval Switch.app` を `/Applications` にドラッグしてください。初回起動時は macOS の検証に数秒かかることがあります。
>
> Windows：インストーラーを実行してください。SmartScreen の警告が表示された場合は、「詳細情報」→「実行」をクリックしてください。

### 開発クイックスタート

```bash
git clone https://github.com/jkrandom-sudo/llm-eval-switch.git
cd llm-eval-switch
npm install
npm start
```

macOS では `start_mac.command`、Windows では `start_windows.bat` をダブルクリックでも起動できます。

### ビルド

```bash
npm run dist:mac   # macOS DMG + ZIP
npm run dist:win   # Windows インストーラー + ポータブル
```

---

## 한국어

### LLM Eval Switch

18개 평가 차원에서 LLM을 설정하고 벤치마킹하는 독립형 Electron 데스크톱 앱입니다. 다크 도구 레이아웃 — 왼쪽에 모델 및 차원 선택, 오른쪽에 평가 작업 공간.

### 주요 기능

- Python 불필요 — 네이티브 데스크톱 앱으로 실행됩니다.
- **OpenAI 호환** `/chat/completions` 및 **Anthropic** `/v1/messages` API를 지원합니다.
- **18개 평가 차원**, 각 1000문항: 추론, 코딩, 안전성, 수학, 도구 사용, 긴 문맥, 다국어, 창의적 글쓰기, 지시 따르기, 데이터 분석, 코드 리뷰, 반사실적 추론, 도메인 전문성, 구조화된 출력, 견고성, 에이전트 계획, 검색 QA, 일반 지식.
- 모델 설정은 로컬에 영구 저장됩니다.
- 단일/다중 모델 평가 및 병렬 처리 설정을 지원합니다.
- 성능 벤치마크 모드 (TTFT, 토큰/초, P95 지연).
- 모델별 **JSON + HTML 보고서** 및 다중 모델 리더보드를 생성합니다.
- 8개 언어 완전 국제화 지원.
- `eval_config.yaml`에서 `${환경변수}`로 API 키 설정 가능.

### 다운로드

| 플랫폼 | 다운로드 |
|--------|----------|
| macOS (Apple Silicon / Intel) | [LLM Eval Switch-1.0.0.dmg](https://github.com/jkrandom-sudo/llm-eval-switch/releases/download/v1.0.0/LLM%20Eval%20Switch-1.0.0.dmg) |
| Windows | [LLM Eval Switch Setup 1.0.0.exe](https://github.com/jkrandom-sudo/llm-eval-switch/releases/download/v1.0.0/LLM%20Eval%20Switch%20Setup%201.0.0.exe) |

> macOS: DMG를 열고 `LLM Eval Switch.app`을 `/Applications`로 드래그하세요. 최초 실행 시 macOS 검증에 몇 초 소요될 수 있습니다.
>
> Windows: 설치 프로그램을 실행하세요. SmartScreen 경고가 표시되면 "추가 정보" → "실행"을 클릭하세요.

### 개발 빠른 시작

```bash
git clone https://github.com/jkrandom-sudo/llm-eval-switch.git
cd llm-eval-switch
npm install
npm start
```

macOS에서는 `start_mac.command`, Windows에서는 `start_windows.bat`을 더블클릭하여 실행할 수도 있습니다.

### 빌드

```bash
npm run dist:mac   # macOS DMG + ZIP
npm run dist:win   # Windows 설치 프로그램 + 휴대용
```

---

## License

MIT
