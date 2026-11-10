# 데스크 비서 (Desk Buddy)

바탕화면 오른쪽 아래에 캐릭터가 늘 떠 있고, 누르면 대화창이 열리는 AI 비서입니다.
말로 시키면 Claude가 판단해서 **Notion · Google Calendar · Google Tasks**에 직접 처리합니다.

- 캐릭터: 드래그로 이동, 클릭하면 대화창 열기/닫기 (단축키 `Ctrl+Shift+Space`)
- 쓰기 작업(페이지 생성, 일정 등록/삭제, 할 일 추가/완료)은 **반드시 승인 카드에서 "실행"을 눌러야** 반영됩니다.
- 트레이 아이콘: 새 대화, 캐릭터 숨기기, 종료

## 할 수 있는 일

| 요청 예시 | 처리 |
|---|---|
| "내일 오후 3시에 학부모 상담 일정 잡아줘" | Google Calendar에 일정 등록 |
| "이번 주 일정 알려줘" | Calendar 조회 |
| "금요일까지 성적 입력 할 일 추가" | Google Tasks 추가 |
| "김민준 오늘 관찰: 모둠활동에서 친구 의견을 먼저 들어주고 정리해서 발표함. 관찰기록 써서 노션에 넣어줘" | 생기부 문체로 관찰기록 작성 → Notion DB에 저장 |
| "3반 학생 페이지 찾아서 오늘 관찰 내용 덧붙여줘" | Notion 검색 → 페이지에 추가 |

## 설치 및 실행

Node.js 20 이상이 필요합니다.

```bash
npm install
```

```bash
npm start
```

처음 실행하면 대화창의 ⚙(설정)에서 아래 값을 넣습니다. 비밀값은 OS 키체인(Electron `safeStorage`)으로 암호화되어 저장됩니다.

### 1. Anthropic API 키
[console.anthropic.com](https://console.anthropic.com)에서 발급. **사용량만큼 과금됩니다.** (Claude Pro 구독과 별개)

### 2. Notion
1. [notion.so/my-integrations](https://www.notion.so/my-integrations)에서 "내부 통합" 생성 → 토큰 복사
2. 관찰기록을 넣을 데이터베이스(또는 상위 페이지)를 열고 `···` → **연결(Connections)** → 방금 만든 통합 추가. *이걸 안 하면 404가 납니다.*
3. 데이터베이스 URL의 32자리 ID를 설정의 "관찰기록 데이터베이스 ID"에 넣기
   (권장 속성: 이름(제목), 그 외 속성은 비서가 건드리지 않고 본문에만 씁니다)

### 3. Google Calendar / Tasks
1. [Google Cloud Console](https://console.cloud.google.com)에서 프로젝트 생성
2. **Google Calendar API**, **Google Tasks API** 사용 설정
3. OAuth 동의 화면 구성(외부, 테스트 사용자에 본인 Gmail 추가)
4. 사용자 인증 정보 → OAuth 클라이언트 ID → 유형 **데스크톱 앱** → JSON 다운로드
5. 설정에서 JSON 파일 선택 → "Google 로그인"

> 동의 화면이 "테스트" 상태면 refresh token이 **7일 후 만료**되어 다시 로그인해야 합니다. 계속 쓰려면 앱을 "프로덕션"으로 게시하세요(개인용은 검수 없이 경고 화면만 뜹니다).

## 솔직하게 짚어야 할 점

### Google Keep은 연동하지 않았습니다
Google Keep API는 **Google Workspace(기업/학교) 관리자용**으로만 열려 있고, 개인 Gmail 계정에서는 쓸 수 없습니다. 비공식 라이브러리(gkeepapi 등)는 계정 비밀번호/마스터 토큰을 요구하고 언제든 막힐 수 있어 넣지 않았습니다. 메모는 Google Tasks나 Notion으로 대체하는 것을 권합니다. 학교 Workspace 계정이고 관리자가 API를 열어준다면 추가는 가능합니다.

### 학생 관찰기록은 개인정보입니다
- 관찰 내용은 **Anthropic API(해외 서버)로 전송**되고, Notion(역시 해외 서버)에 저장됩니다. 학교/교육청의 개인정보 처리 지침상 학생 실명·민감정보를 외부 클라우드 AI에 넣는 것이 허용되는지 **먼저 확인**하세요. 불확실하면 이니셜이나 번호로 입력하는 것이 안전합니다.
- 비서는 말한 사실만 근거로 쓰도록 지시되어 있지만, LLM은 그럴듯하게 꾸밀 수 있습니다. **NEIS에 옮기기 전에 반드시 직접 검토**하세요. 승인 카드에서 내용을 확인한 뒤 "실행"을 누르는 구조는 이 때문입니다.

### 기타 한계
- 반복 일정, 다른 캘린더(기본 캘린더만), 참석자 초대는 아직 지원하지 않습니다.
- Google Tasks는 마감 "날짜"만 지원합니다(시각 불가 — Google API 자체 제약).
- 대화 기록은 앱을 끄면 사라집니다. 새 대화(↺)를 자주 눌러야 토큰 비용이 줄어듭니다.
- 배포용 설치 파일(.exe/.dmg)은 아직 없습니다. 필요하면 `electron-builder`를 붙이면 됩니다.

## 구조

```
src/
  main.js          Electron 메인: 캐릭터 창(투명·항상 위), 대화창, 트레이, IPC
  agent.js         Claude 도구 사용 루프 + 쓰기 작업 승인 게이트 + 시스템 프롬프트
  config.js        설정 저장 (비밀값 암호화)
  tools/notion.js  Notion 검색·페이지 생성·덧붙이기
  tools/google.js  OAuth 로그인, Calendar·Tasks
  renderer/        캐릭터(SVG), 대화창 UI
```

새 기능(예: Gmail 요약, Google Drive 검색)을 넣으려면 `agent.js`의 `TOOLS`에 도구 정의를, `runTool`에 실행 코드를 추가하고, 쓰기 작업이면 `WRITE_TOOLS`에 이름을 넣으면 됩니다.
