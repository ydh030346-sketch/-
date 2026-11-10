// Electron 메인 프로세스: 바탕화면 캐릭터 창 + 채팅 창 + 트레이
const { app, BrowserWindow, ipcMain, Tray, Menu, screen, globalShortcut, nativeImage, dialog } = require("electron");
const path = require("path");
const config = require("./config");
const google = require("./tools/google");
const { Agent } = require("./agent");

let characterWin = null;
let chatWin = null;
let tray = null;
const pendingConfirms = new Map();
let confirmSeq = 0;

const CHAR_SIZE = 140;
const CHAT_W = 380;
const CHAT_H = 540;

function createCharacter() {
  const { workArea } = screen.getPrimaryDisplay();
  characterWin = new BrowserWindow({
    width: CHAR_SIZE,
    height: CHAR_SIZE,
    x: workArea.x + workArea.width - CHAR_SIZE - 24,
    y: workArea.y + workArea.height - CHAR_SIZE - 24,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
  });
  characterWin.setAlwaysOnTop(true, "floating");
  characterWin.setVisibleOnAllWorkspaces(true);
  characterWin.loadFile(path.join(__dirname, "renderer", "character.html"));
}

function createChat() {
  chatWin = new BrowserWindow({
    width: CHAT_W,
    height: CHAT_H,
    show: false,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
  });
  chatWin.loadFile(path.join(__dirname, "renderer", "chat.html"));
  chatWin.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      chatWin.hide();
    }
  });
}

// 캐릭터 옆(화면 안쪽)에 채팅창을 띄운다
function positionChat() {
  const [cx, cy] = characterWin.getPosition();
  const { workArea } = screen.getDisplayNearestPoint({ x: cx, y: cy });
  let x = cx - CHAT_W - 8;
  if (x < workArea.x) x = cx + CHAR_SIZE + 8;
  let y = cy + CHAR_SIZE - CHAT_H;
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - CHAT_H));
  chatWin.setPosition(Math.round(x), Math.round(y));
}

function toggleChat() {
  if (chatWin.isVisible()) {
    chatWin.hide();
  } else {
    positionChat();
    chatWin.show();
    chatWin.focus();
    chatWin.webContents.send("chat:focus");
  }
}

function setCharacterState(state) {
  characterWin?.webContents.send("character:state", state);
}

const agent = new Agent({
  getConfig: () => config.load(),
  saveGoogleToken: (t) => config.save({ googleToken: t }),
  onStatus: (s) => chatWin?.webContents.send("chat:status", s),
  confirm: (action) =>
    new Promise((resolve) => {
      const id = ++confirmSeq;
      pendingConfirms.set(id, resolve);
      if (!chatWin.isVisible()) toggleChat();
      chatWin.webContents.send("confirm:request", { id, ...action });
    }),
});

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, "renderer", "icon.png"));
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip("데스크 비서");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "대화창 열기/닫기", click: toggleChat },
      { label: "캐릭터 숨기기/보이기", click: () => (characterWin.isVisible() ? characterWin.hide() : characterWin.show()) },
      { label: "새 대화", click: () => { agent.reset(); chatWin.webContents.send("chat:cleared"); } },
      { type: "separator" },
      { label: "종료", click: () => { app.isQuitting = true; app.quit(); } },
    ])
  );
  tray.on("click", toggleChat);
}

// ---- IPC ----
ipcMain.on("character:move", (_e, { dx, dy }) => {
  const [x, y] = characterWin.getPosition();
  characterWin.setPosition(Math.round(x + dx), Math.round(y + dy));
  if (chatWin.isVisible()) positionChat();
});
ipcMain.on("character:click", toggleChat);
ipcMain.on("chat:hide", () => chatWin.hide());

ipcMain.handle("chat:send", async (_e, text) => {
  setCharacterState("thinking");
  try {
    const reply = await agent.send(text);
    setCharacterState("happy");
    return { ok: true, text: reply };
  } catch (e) {
    setCharacterState("error");
    return { ok: false, text: e.message };
  } finally {
    setTimeout(() => setCharacterState("idle"), 2500);
  }
});
ipcMain.handle("chat:reset", () => { agent.reset(); return true; });

ipcMain.on("confirm:response", (_e, { id, ok }) => {
  const r = pendingConfirms.get(id);
  if (r) {
    pendingConfirms.delete(id);
    r(!!ok);
  }
});

ipcMain.handle("settings:get", () => config.publicView(config.load()));
ipcMain.handle("settings:save", (_e, partial) => {
  // 가려진 값("••••")이 그대로 오면 기존 비밀값을 유지
  const clean = {};
  for (const [k, v] of Object.entries(partial || {})) {
    if (config.SECRET_KEYS.includes(k) && (!v || String(v).startsWith("••••"))) continue;
    clean[k] = typeof v === "string" ? v.trim() : v;
  }
  return config.publicView(config.save(clean));
});
ipcMain.handle("settings:pickGoogleFile", async () => {
  const r = await dialog.showOpenDialog(chatWin, { filters: [{ name: "JSON", extensions: ["json"] }], properties: ["openFile"] });
  return r.canceled ? "" : r.filePaths[0];
});
ipcMain.handle("settings:googleLogin", async () => {
  try {
    const token = await google.login(config.load());
    config.save({ googleToken: token });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ---- 앱 시작 ----
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    createCharacter();
    createChat();
    createTray();
    globalShortcut.register("CommandOrControl+Shift+Space", toggleChat);
    // 로그인 시 자동 실행 (Windows/macOS)
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
  });
  app.on("second-instance", () => toggleChat());
  app.on("will-quit", () => globalShortcut.unregisterAll());
  app.on("window-all-closed", (e) => e.preventDefault());
}
