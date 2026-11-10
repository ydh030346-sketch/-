// 설정 저장소. 비밀값(API 키, 토큰)은 OS 키체인 기반 safeStorage로 암호화해서 저장한다.
const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

const SECRET_KEYS = ["anthropicApiKey", "notionToken", "googleToken"];

const DEFAULTS = {
  anthropicApiKey: "",
  notionToken: "",
  // 관찰기록 등을 넣을 Notion 데이터베이스 ID (선택). 없으면 notionParentPageId 아래에 하위 페이지로 만든다.
  notionDatabaseId: "",
  notionTitleProperty: "이름",
  notionParentPageId: "",
  // Google Cloud 콘솔에서 받은 "데스크톱 앱" OAuth 클라이언트 JSON 파일 경로
  googleClientFile: "",
  googleToken: "",
  timezone: "Asia/Seoul",
  model: "claude-opus-5-5",
};

function file() {
  return path.join(app.getPath("userData"), "config.json");
}

function canEncrypt() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function load() {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(file(), "utf8"));
  } catch {
    /* 첫 실행 */
  }
  const cfg = { ...DEFAULTS, ...raw };
  for (const k of SECRET_KEYS) {
    const v = raw[k];
    if (v && typeof v === "object" && v.enc) {
      try {
        cfg[k] = safeStorage.decryptString(Buffer.from(v.enc, "base64"));
      } catch {
        cfg[k] = "";
      }
    }
  }
  return cfg;
}

function save(partial) {
  const merged = { ...load(), ...partial };
  const out = { ...merged };
  if (canEncrypt()) {
    for (const k of SECRET_KEYS) {
      if (merged[k]) out[k] = { enc: safeStorage.encryptString(merged[k]).toString("base64") };
    }
  }
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(out, null, 2), { mode: 0o600 });
  return merged;
}

// 렌더러에 보낼 때는 비밀값을 가린다.
function publicView(cfg) {
  const v = { ...cfg };
  for (const k of SECRET_KEYS) v[k] = cfg[k] ? "••••(저장됨)" : "";
  return v;
}

module.exports = { load, save, publicView, SECRET_KEYS };
