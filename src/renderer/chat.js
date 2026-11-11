const log = document.getElementById("log");
const input = document.getElementById("input");
const statusEl = document.getElementById("status");
const sendBtn = document.getElementById("btnSend");
const settings = document.getElementById("settings");
let busy = false;

function add(cls, text) {
  const d = document.createElement("div");
  d.className = `msg ${cls}`;
  d.textContent = text;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}

async function submit() {
  const text = input.value.trim();
  if (!text || busy) return;
  busy = true;
  sendBtn.disabled = true;
  input.value = "";
  add("me", text);
  const r = await window.api.send(text);
  add(r.ok ? "bot" : "bot err", r.text);
  statusEl.textContent = "";
  busy = false;
  sendBtn.disabled = false;
  input.focus();
}

document.getElementById("composer").addEventListener("submit", (e) => { e.preventDefault(); submit(); });
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
  if (e.key === "Escape") window.api.hide();
});
document.getElementById("btnClose").onclick = () => window.api.hide();
document.getElementById("btnNew").onclick = async () => { if (busy) return; await window.api.reset(); clearLog(); };
function clearLog() { log.innerHTML = ""; add("bot", "새 대화를 시작합니다."); }

window.api.onStatus((s) => (statusEl.textContent = s));
window.api.onFocus(() => input.focus());
window.api.onCleared(clearLog);

// 쓰기 작업 승인 카드
window.api.onConfirm(({ id, title, detail }) => {
  const card = document.createElement("div");
  card.className = "confirm";
  const h = document.createElement("h4"); h.textContent = `승인 필요: ${title}`;
  const pre = document.createElement("pre"); pre.textContent = detail;
  const row = document.createElement("div"); row.className = "row end";
  const no = document.createElement("button"); no.textContent = "거절"; no.className = "danger";
  const yes = document.createElement("button"); yes.textContent = "실행"; yes.className = "primary";
  const answer = (ok) => {
    window.api.answerConfirm(id, ok);
    row.innerHTML = `<span class="done">${ok ? "승인함" : "거절함"}</span>`;
  };
  no.onclick = () => answer(false);
  yes.onclick = () => answer(true);
  row.append(no, yes);
  card.append(h, pre, row);
  log.appendChild(card);
  log.scrollTop = log.scrollHeight;
  yes.focus();
});

// 설정
const fields = () => [...settings.querySelectorAll("input[name], select[name]")];
const providerSel = settings.querySelector("select[name=provider]");
const modelSel = settings.querySelector("select[name=geminiModel]");

function showProvider() {
  for (const fs of settings.querySelectorAll("fieldset[data-provider]")) fs.hidden = fs.dataset.provider !== providerSel.value;
}
providerSel.onchange = showProvider;

function ensureModelOption(id) {
  if (id && ![...modelSel.options].some((o) => o.value === id)) modelSel.add(new Option(id, id));
}

async function openSettings() {
  const s = await window.api.getSettings();
  ensureModelOption(s.geminiModel);
  for (const f of fields()) {
    if (f.type === "checkbox") f.checked = !!s[f.name];
    else f.value = s[f.name] ?? "";
  }
  showProvider();
  document.getElementById("googleState").textContent = s.googleToken ? "연결됨" : "미연결";
  settings.hidden = false;
}
document.getElementById("btnSettings").onclick = () => (settings.hidden ? openSettings() : (settings.hidden = true));
document.getElementById("btnCancelSettings").onclick = () => (settings.hidden = true);
document.getElementById("btnSaveSettings").onclick = async () => {
  const data = Object.fromEntries(fields().map((f) => [f.name, f.type === "checkbox" ? f.checked : f.value]));
  await window.api.saveSettings(data);
  settings.hidden = true;
  add("bot", "설정을 저장했습니다.");
};
document.getElementById("btnModels").onclick = async (e) => {
  const btn = e.currentTarget;
  // 방금 입력한 키를 먼저 저장해야 목록을 불러올 수 있다
  await window.api.saveSettings({ geminiApiKey: settings.querySelector("input[name=geminiApiKey]").value });
  btn.disabled = true;
  btn.textContent = "불러오는 중…";
  const r = await window.api.listGeminiModels();
  btn.disabled = false;
  btn.textContent = "모델 목록 불러오기";
  if (!r.ok) return alert(`모델 목록을 불러오지 못했습니다: ${r.error}`);
  const cur = modelSel.value;
  modelSel.innerHTML = "";
  for (const alias of ["gemini-pro-latest", "gemini-flash-latest"]) modelSel.add(new Option(`${alias} (항상 최신)`, alias));
  for (const m of r.models) if (!m.id.endsWith("-latest")) modelSel.add(new Option(`${m.label} (${m.id})`, m.id));
  ensureModelOption(cur);
  modelSel.value = cur;
};
document.getElementById("btnPick").onclick = async () => {
  const p = await window.api.pickGoogleFile();
  if (p) settings.querySelector("input[name=googleClientFile]").value = p;
};
document.getElementById("btnGoogle").onclick = async () => {
  const st = document.getElementById("googleState");
  await window.api.saveSettings({ googleClientFile: settings.querySelector("input[name=googleClientFile]").value });
  st.textContent = "브라우저에서 로그인하세요…";
  const r = await window.api.googleLogin();
  st.textContent = r.ok ? "연결됨" : `실패: ${r.error}`;
};
