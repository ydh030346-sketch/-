// Claude 에이전트 루프. 읽기 도구는 바로 실행하고, 쓰기 도구(생성/삭제/완료)는
// 반드시 사용자 확인(confirm 콜백)을 거친다.
const Anthropic = require("@anthropic-ai/sdk");
const notion = require("./tools/notion");
const gg = require("./tools/google");

const SYSTEM = `당신은 사용자의 바탕화면에 상주하는 한국어 업무 비서입니다. 사용자는 교사입니다.
도구를 사용해 Notion, Google Calendar, Google Tasks에 실제로 일을 처리합니다.

원칙:
- 날짜/시간은 사용자 메시지에 함께 주어지는 [현재 시각]을 기준으로 해석합니다. "다음 주 화요일"처럼 모호하면 구체 날짜로 바꿔 도구에 넘기고, 응답에도 그 날짜를 명시합니다.
- 종료 시각이 없으면 1시간짜리 일정으로 봅니다. 시각이 아예 없으면 종일 일정인지 한 번만 물어봅니다.
- 쓰기 작업(생성·삭제·완료 처리)은 사용자가 화면에서 승인해야 실행됩니다. 거절되면 다시 시도하지 말고 무엇을 바꿀지 물어보세요.
- 학생 관찰기록: 사용자가 말한 관찰 사실만 근거로 씁니다. 말하지 않은 행동·성격·가정환경을 지어내지 않습니다. 근거가 부족하면 지어내지 말고 무엇이 더 필요한지 묻습니다. 문체는 학교생활기록부식 "~함", "~임" 체로, 구체적 행동 → 의미 순서로 씁니다. 진단명·민감정보(건강, 가정사, 종교 등)는 사용자가 명시적으로 요청하지 않는 한 넣지 않습니다.
- Google Keep은 연동되어 있지 않습니다. Keep 요청이 오면 Google Tasks 또는 Notion으로 대신 저장할지 제안하세요.
- 저장할 Notion 위치를 모르면 notion_search로 찾아보고, 그래도 불확실하면 사용자에게 묻습니다.
- 답변은 짧게. 처리 결과(무엇을, 어디에, 언제로)를 한두 줄로 보고합니다.`;

const TOOLS = [
  {
    name: "notion_search",
    description: "Notion 워크스페이스에서 페이지/데이터베이스를 제목으로 검색합니다. 저장 위치(학생 페이지, 관찰기록 DB 등)를 찾을 때 사용합니다.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "notion_create_page",
    description: "Notion에 새 페이지를 만듭니다. parent_id를 생략하면 설정된 기본 위치(관찰기록 데이터베이스 또는 상위 페이지)에 만듭니다. 본문은 간단한 마크다운(#, ##, -, 1.)을 지원합니다.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content_markdown: { type: "string" },
        parent_id: { type: "string", description: "선택. notion_search로 찾은 페이지/DB id" },
        parent_type: { type: "string", enum: ["page", "database"] },
      },
      required: ["title", "content_markdown"],
    },
  },
  {
    name: "notion_append",
    description: "기존 Notion 페이지 끝에 내용을 덧붙입니다 (예: 학생 개인 페이지에 오늘 관찰 추가).",
    input_schema: {
      type: "object",
      properties: { page_id: { type: "string" }, content_markdown: { type: "string" } },
      required: ["page_id", "content_markdown"],
    },
  },
  {
    name: "calendar_list_events",
    description: "Google 캘린더(기본 캘린더)의 일정을 조회합니다. 시각은 RFC3339(오프셋 포함, 예: 2026-11-12T00:00:00+09:00).",
    input_schema: {
      type: "object",
      properties: { time_min: { type: "string" }, time_max: { type: "string" }, query: { type: "string" } },
      required: ["time_min", "time_max"],
    },
  },
  {
    name: "calendar_create_event",
    description: "Google 캘린더에 일정을 등록합니다. 시간 일정은 start/end를 오프셋 포함 RFC3339로, 종일 일정은 all_day=true와 YYYY-MM-DD(end는 다음날, 배타적)로 넘깁니다.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
        all_day: { type: "boolean" },
        description: { type: "string" },
        location: { type: "string" },
        reminder_minutes: { type: "integer" },
      },
      required: ["summary", "start", "end"],
    },
  },
  {
    name: "calendar_delete_event",
    description: "Google 캘린더 일정을 삭제합니다. 먼저 calendar_list_events로 id를 확인하세요.",
    input_schema: { type: "object", properties: { event_id: { type: "string" }, summary: { type: "string", description: "확인 화면 표시용 일정 제목" } }, required: ["event_id"] },
  },
  {
    name: "tasks_list",
    description: "Google Tasks 기본 목록의 할 일을 조회합니다.",
    input_schema: { type: "object", properties: { show_completed: { type: "boolean" } }, required: [] },
  },
  {
    name: "tasks_create",
    description: "Google Tasks에 할 일을 추가합니다. due_date는 YYYY-MM-DD (Tasks는 마감 시각을 지원하지 않음).",
    input_schema: {
      type: "object",
      properties: { title: { type: "string" }, notes: { type: "string" }, due_date: { type: "string" } },
      required: ["title"],
    },
  },
  {
    name: "tasks_complete",
    description: "Google Tasks의 할 일을 완료 처리합니다. 먼저 tasks_list로 id를 확인하세요.",
    input_schema: { type: "object", properties: { task_id: { type: "string" }, title: { type: "string" } }, required: ["task_id"] },
  },
];

const WRITE_TOOLS = new Set([
  "notion_create_page",
  "notion_append",
  "calendar_create_event",
  "calendar_delete_event",
  "tasks_create",
  "tasks_complete",
]);

function describeAction(name, input) {
  switch (name) {
    case "notion_create_page":
      return { title: "Notion 페이지 만들기", detail: `제목: ${input.title}\n\n${input.content_markdown}` };
    case "notion_append":
      return { title: "Notion 페이지에 덧붙이기", detail: `페이지: ${input.page_id}\n\n${input.content_markdown}` };
    case "calendar_create_event":
      return {
        title: "캘린더 일정 등록",
        detail: `${input.summary}\n${input.all_day ? "종일 " : ""}${input.start} ~ ${input.end}${input.location ? `\n장소: ${input.location}` : ""}${input.description ? `\n\n${input.description}` : ""}`,
      };
    case "calendar_delete_event":
      return { title: "캘린더 일정 삭제", detail: input.summary || input.event_id };
    case "tasks_create":
      return { title: "할 일 추가", detail: `${input.title}${input.due_date ? `\n마감: ${input.due_date}` : ""}${input.notes ? `\n${input.notes}` : ""}` };
    case "tasks_complete":
      return { title: "할 일 완료 처리", detail: input.title || input.task_id };
    default:
      return { title: name, detail: JSON.stringify(input, null, 2) };
  }
}

function validate(tool, input) {
  if (!input || typeof input !== "object") return "입력이 객체가 아닙니다.";
  for (const k of tool.input_schema.required || []) {
    if (input[k] === undefined || input[k] === null || input[k] === "") return `필수 값 '${k}'가 없습니다.`;
  }
  return null;
}

class Agent {
  constructor({ getConfig, saveGoogleToken, confirm, onStatus }) {
    this.getConfig = getConfig;
    this.saveGoogleToken = saveGoogleToken;
    this.confirm = confirm;
    this.onStatus = onStatus || (() => {});
    this.messages = [];
  }

  reset() {
    this.messages = [];
  }

  async runTool(name, input) {
    const cfg = this.getConfig();
    const onTokens = (t) => this.saveGoogleToken(JSON.stringify(t));
    switch (name) {
      case "notion_search": return notion.search(cfg, input);
      case "notion_create_page": return notion.createPage(cfg, input);
      case "notion_append": return notion.appendToPage(cfg, input);
      case "calendar_list_events": return gg.listEvents(cfg, onTokens, input);
      case "calendar_create_event": return gg.createEvent(cfg, onTokens, input);
      case "calendar_delete_event": return gg.deleteEvent(cfg, onTokens, input);
      case "tasks_list": return gg.listTasks(cfg, onTokens, input);
      case "tasks_create": return gg.createTask(cfg, onTokens, input);
      case "tasks_complete": return gg.completeTask(cfg, onTokens, input);
      default: throw new Error(`알 수 없는 도구: ${name}`);
    }
  }

  async send(userText) {
    const start = this.messages.length;
    try {
      return await this._send(userText);
    } catch (e) {
      // 실패한 턴은 대화 기록에서 되돌려 다음 요청이 깨지지 않게 한다.
      this.messages.length = start;
      throw e;
    }
  }

  async _send(userText) {
    const cfg = this.getConfig();
    if (!cfg.anthropicApiKey) throw new Error("Anthropic API 키가 설정되지 않았습니다. 설정(⚙)에서 입력하세요.");
    const client = new Anthropic({ apiKey: cfg.anthropicApiKey });

    const now = new Date().toLocaleString("ko-KR", { timeZone: cfg.timezone, dateStyle: "full", timeStyle: "short" });
    // 현재 시각은 system이 아니라 사용자 턴에 넣어 프롬프트 캐시를 깨지 않는다.
    this.messages.push({ role: "user", content: `[현재 시각: ${now} (${cfg.timezone}, UTC+09:00)]\n${userText}` });

    for (let step = 0; step < 12; step++) {
      this.onStatus("생각 중…");
      const response = await client.beta.messages.create({
        model: cfg.model || "claude-opus-5-5",
        max_tokens: 16000,
        system: SYSTEM,
        tools: TOOLS,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
        // 안전 분류기가 거절하면 서버가 다른 모델로 자동 재시도
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages: this.messages,
      });

      // 응답 블록은 thinking/fallback 블록 포함 그대로 보존해야 한다.
      this.messages.push({ role: "assistant", content: response.content });
      const text = response.content.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();

      if (response.stop_reason === "refusal") return text || "이 요청은 처리할 수 없습니다.";
      if (response.stop_reason === "pause_turn") continue;
      if (response.stop_reason === "max_tokens") return (text ? text + "\n\n" : "") + "(응답이 너무 길어 중간에 잘렸습니다.)";
      if (response.stop_reason !== "tool_use") return text || "완료했습니다.";

      const results = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const tool = TOOLS.find((t) => t.name === block.name);
        const err = tool ? validate(tool, block.input) : `알 수 없는 도구: ${block.name}`;
        if (err) {
          results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: err });
          continue;
        }
        if (WRITE_TOOLS.has(block.name)) {
          const ok = await this.confirm(describeAction(block.name, block.input));
          if (!ok) {
            results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: "사용자가 이 작업을 거절했습니다. 실행하지 않았습니다." });
            continue;
          }
        }
        this.onStatus(`${block.name} 실행 중…`);
        try {
          const out = await this.runTool(block.name, block.input);
          results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
        } catch (e) {
          results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: `오류: ${e.message}` });
        }
      }
      this.messages.push({ role: "user", content: results });
    }
    return "작업 단계가 너무 많아 중단했습니다. 요청을 나눠서 다시 말해 주세요.";
  }
}

module.exports = { Agent, TOOLS, WRITE_TOOLS };
