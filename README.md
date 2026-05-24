# LLM Eval Switch Desktop

一个独立的 Electron 桌面端，用于配置和评测大模型。界面风格参考 cc-switch 的深色工具台布局：左侧模型/维度选择，右侧配置、运行、题库和报告工作区。

## 能力

- 不依赖 Python 运行桌面端。
- 支持 OpenAI-compatible `/chat/completions`。
- 支持 Anthropic `/v1/messages`。
- 读取项目根目录的 `eval_config.yaml`。
- 读取项目根目录的 `datasets/<dimension>/test_cases.json`。
- 模型配置保存到应用用户数据目录，不再导入 `eval_config.yaml` 中的示例模型。
- 支持单模型和多模型同时评测。
- 生成单模型 JSON/HTML 报告。
- 生成多模型 leaderboard JSON/HTML 对比报告。

## 开发启动

```bash
cd desktop/llm-eval-switch
npm install
npm start
```

macOS 可双击：

```text
desktop/llm-eval-switch/start_mac.command
```

Windows 可双击：

```text
desktop/llm-eval-switch/start_windows.bat
```

## 打包

macOS:

```bash
npm run dist:mac
```

Windows:

```bash
npm run dist:win
```

产物会输出到 `desktop/llm-eval-switch/dist/`。

## 配置格式

界面中新增/更新/删除的模型会持久化保存，下次启动仍可见。`eval_config.yaml` 主要用于维护评测参数和维度题库；示例模型不会出现在桌面端模型列表中。

OpenAI-compatible:

```yaml
- name: "my-openai"
  api_format: "openai"
  base_url: "https://api.openai.com/v1"
  api_key: "${OPENAI_API_KEY}"
  model_id: "gpt-4.1"
```

Anthropic:

```yaml
- name: "my-claude"
  api_format: "anthropic"
  base_url: "https://api.anthropic.com/v1"
  api_key: "${ANTHROPIC_API_KEY}"
  model_id: "claude-3-5-sonnet-latest"
```
