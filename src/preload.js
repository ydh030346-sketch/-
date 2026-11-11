const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // 캐릭터
  moveCharacter: (dx, dy) => ipcRenderer.send("character:move", { dx, dy }),
  clickCharacter: () => ipcRenderer.send("character:click"),
  onCharacterState: (cb) => ipcRenderer.on("character:state", (_e, s) => cb(s)),
  // 채팅
  send: (text) => ipcRenderer.invoke("chat:send", text),
  reset: () => ipcRenderer.invoke("chat:reset"),
  hide: () => ipcRenderer.send("chat:hide"),
  onStatus: (cb) => ipcRenderer.on("chat:status", (_e, s) => cb(s)),
  onFocus: (cb) => ipcRenderer.on("chat:focus", () => cb()),
  onCleared: (cb) => ipcRenderer.on("chat:cleared", () => cb()),
  onConfirm: (cb) => ipcRenderer.on("confirm:request", (_e, req) => cb(req)),
  answerConfirm: (id, ok) => ipcRenderer.send("confirm:response", { id, ok }),
  // 설정
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (s) => ipcRenderer.invoke("settings:save", s),
  listGeminiModels: () => ipcRenderer.invoke("settings:listGeminiModels"),
  pickGoogleFile: () => ipcRenderer.invoke("settings:pickGoogleFile"),
  googleLogin: () => ipcRenderer.invoke("settings:googleLogin"),
});
