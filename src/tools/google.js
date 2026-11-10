// Google Calendar / Google Tasks 연동 (OAuth 데스크톱 앱 + 로컬 루프백 리디렉션)
// Google Keep은 개인 Gmail 계정용 공개 API가 없어 연동하지 않는다 (README 참고).
const { google } = require("googleapis");
const http = require("http");
const fs = require("fs");
const { shell } = require("electron");

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/tasks",
];

function readClient(cfg) {
  if (!cfg.googleClientFile) throw new Error("Google OAuth 클라이언트 JSON 파일 경로가 설정되지 않았습니다.");
  const j = JSON.parse(fs.readFileSync(cfg.googleClientFile, "utf8"));
  const c = j.installed || j.web;
  if (!c) throw new Error("OAuth JSON 형식이 올바르지 않습니다. '데스크톱 앱' 유형으로 만든 파일인지 확인하세요.");
  return c;
}

// 브라우저를 열어 로그인 → 127.0.0.1 임시 서버로 code 수신 → 토큰 반환
async function login(cfg) {
  const c = readClient(cfg);
  const server = http.createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const redirect = `http://127.0.0.1:${server.address().port}`;
  const oauth = new google.auth.OAuth2(c.client_id, c.client_secret, redirect);
  const url = oauth.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Google 로그인 시간이 초과되었습니다.")), 5 * 60 * 1000);
    server.on("request", (req, res) => {
      const q = new URL(req.url, redirect).searchParams;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h3>로그인 완료. 이 창을 닫아도 됩니다.</h3>");
      clearTimeout(timer);
      if (q.get("code")) resolve(q.get("code"));
      else reject(new Error(q.get("error") || "로그인 취소됨"));
    });
    shell.openExternal(url);
  }).finally(() => server.close());

  const { tokens } = await oauth.getToken(code);
  return JSON.stringify(tokens);
}

function auth(cfg, onTokens) {
  if (!cfg.googleToken) throw new Error("Google 계정이 연결되지 않았습니다. 설정에서 'Google 로그인'을 누르세요.");
  const c = readClient(cfg);
  const oauth = new google.auth.OAuth2(c.client_id, c.client_secret);
  oauth.setCredentials(JSON.parse(cfg.googleToken));
  // access token이 갱신되면 저장 (refresh_token은 첫 발급 때만 오므로 기존 값 유지)
  oauth.on("tokens", (t) => onTokens && onTokens({ ...JSON.parse(cfg.googleToken), ...t }));
  return oauth;
}

async function listEvents(cfg, onTokens, { time_min, time_max, query }) {
  const cal = google.calendar({ version: "v3", auth: auth(cfg, onTokens) });
  const res = await cal.events.list({
    calendarId: "primary",
    timeMin: time_min,
    timeMax: time_max,
    q: query || undefined,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
  });
  return (res.data.items || []).map((e) => ({
    id: e.id,
    summary: e.summary,
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    location: e.location,
  }));
}

async function createEvent(cfg, onTokens, { summary, start, end, all_day, description, location, reminder_minutes }) {
  const cal = google.calendar({ version: "v3", auth: auth(cfg, onTokens) });
  const tz = cfg.timezone || "Asia/Seoul";
  const requestBody = {
    summary,
    description: description || undefined,
    location: location || undefined,
    start: all_day ? { date: start.slice(0, 10) } : { dateTime: start, timeZone: tz },
    end: all_day ? { date: end.slice(0, 10) } : { dateTime: end, timeZone: tz },
  };
  if (typeof reminder_minutes === "number") {
    requestBody.reminders = { useDefault: false, overrides: [{ method: "popup", minutes: reminder_minutes }] };
  }
  const res = await cal.events.insert({ calendarId: "primary", requestBody });
  return { id: res.data.id, link: res.data.htmlLink };
}

async function deleteEvent(cfg, onTokens, { event_id }) {
  const cal = google.calendar({ version: "v3", auth: auth(cfg, onTokens) });
  await cal.events.delete({ calendarId: "primary", eventId: event_id });
  return { ok: true };
}

async function listTasks(cfg, onTokens, { show_completed }) {
  const tasks = google.tasks({ version: "v1", auth: auth(cfg, onTokens) });
  const res = await tasks.tasks.list({ tasklist: "@default", showCompleted: !!show_completed, maxResults: 100 });
  return (res.data.items || []).map((t) => ({ id: t.id, title: t.title, due: t.due, status: t.status, notes: t.notes }));
}

async function createTask(cfg, onTokens, { title, notes, due_date }) {
  const tasks = google.tasks({ version: "v1", auth: auth(cfg, onTokens) });
  // Tasks API는 due의 날짜 부분만 사용한다(시간은 무시됨).
  const due = due_date ? `${due_date.slice(0, 10)}T00:00:00.000Z` : undefined;
  const res = await tasks.tasks.insert({ tasklist: "@default", requestBody: { title, notes, due } });
  return { id: res.data.id };
}

async function completeTask(cfg, onTokens, { task_id }) {
  const tasks = google.tasks({ version: "v1", auth: auth(cfg, onTokens) });
  await tasks.tasks.patch({ tasklist: "@default", task: task_id, requestBody: { status: "completed" } });
  return { ok: true };
}

module.exports = { login, listEvents, createEvent, deleteEvent, listTasks, createTask, completeTask };
