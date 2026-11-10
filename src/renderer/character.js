// 드래그로 이동, 짧게 누르면 대화창 열기
const el = document.getElementById("buddy");
let down = null;
let moved = 0;

el.addEventListener("pointerdown", (e) => {
  down = { x: e.screenX, y: e.screenY };
  moved = 0;
  el.setPointerCapture(e.pointerId);
});
el.addEventListener("pointermove", (e) => {
  if (!down) return;
  const dx = e.screenX - down.x;
  const dy = e.screenY - down.y;
  if (dx || dy) {
    moved += Math.abs(dx) + Math.abs(dy);
    window.api.moveCharacter(dx, dy);
    down = { x: e.screenX, y: e.screenY };
  }
});
el.addEventListener("pointerup", () => {
  if (down && moved < 5) window.api.clickCharacter();
  down = null;
});

window.api.onCharacterState((s) => {
  document.body.className = s === "idle" ? "" : s;
});

// 가끔 눈 깜빡임
setInterval(() => {
  document.body.classList.add("blink");
  setTimeout(() => document.body.classList.remove("blink"), 160);
}, 4200);
