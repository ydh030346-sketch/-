# 데스크 비서 (Desk Buddy)

바탕화면 오른쪽 아래에 캐릭터가 늘 떠 있고, 누르면 대화창이 열리는 AI 비서입니다.
말로 시키면 AI(기본 **Gemini**, 설정에서 Claude로 변경 가능)가 판단해서 **Notion · Google Calendar · Google Tasks**에 직접 처리합니다.

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

## 설치 (Windows)

1. `DeskBuddy-Setup-0.2.0.exe`를 받아 실행합니다.
2. **"Windows의 PC 보호"** 파란 창이 뜨면 **추가 정보 → 실행**을 누릅니다.
   (코드 서명 인증서가 없는 개인 제작 프로그램이라 뜨는 경고입니다. 인증서는 연간 수십만 원이라 넣지 않았습니다.)
3. 설치 위치를 고르고 설치하면 바탕화면에 **"데스크 비서"** 바로가기가 생깁니다.
4. 설치 후 첫 실행부터 Windows 시작 시 자동으로 켜집니다. 원치 않으면 트레이 아이콘 우클릭 → "Windows 시작 시 자동 실행" 체크 해제.
5. 제거: Windows 설정 → 앱 → DeskBuddy → 제거

### 설치 파일 받는 곳
저장소 첫 화면 오른쪽의 **Releases** → 최신 버전 → **Assets**의 `DeskBuddy-Setup-x.x.x.exe`.
코드가 푸시될 때마다 실제 Windows 서버에서 빌드·실행 확인 후 자동으로 올라갑니다.

### 개발자용 실행
```bash
npm install
```

```bash
npm start
```

처음 실행하면 대화창의 ⚙(설정)에서 아래 값을 넣습니다. 비밀값은 OS 키체인(Electron `safeStorage`)으로 암호화되어 저장됩니다.

### 1. Gemini API 키 (기본)

**무료로 쓰기 (권장 시작 방법)**
1. [aistudio.google.com](https://aistudio.google.com) → **Get API key** → **새 프로젝트에서** 키 만들기
2. 그 프로젝트에는 **결제를 연결하지 마세요.** 결제가 연결된 프로젝트의 키는 어떤 모델을 골라도 과금(선불 크레딧 차감)됩니다. 무료/유료는 모델이 아니라 **프로젝트**로 정해집니다.
3. 설정에 키를 넣고 모델은 `gemini-flash-latest`(기본값) 그대로 둡니다. Pro 모델은 무료 한도가 없거나 매우 적을 수 있습니다.
4. **"결제가 연결됨"은 체크하지 마세요.** 무료 등급은 입력이 Google 모델 개선에 쓰이고 사람이 검토할 수 있어서, 체크하지 않으면 앱이 관찰기록·생기부·상담 관련 요청을 아예 전송하지 않습니다.

무료 등급에는 분당·일일 요청 한도가 있습니다. 한도에 걸리면 잠시 기다리거나 `gemini-flash-lite-latest`로 바꾸세요.

**유료로 쓰기**
AI Studio에서 프로젝트에 결제(선불 크레딧 등)를 연결하고 크레딧을 충전한 뒤, 설정의 **"결제가 연결됨"**을 체크합니다. Pro 모델도 쓸 수 있고, 입력이 학습에 쓰이지 않습니다.

> **Gemini 앱 구독(Google AI Pro/Ultra)과 Gemini API는 결제가 별개입니다.** 구독 중이어도 API 사용료는 따로 나갑니다.

### (선택) Claude를 쓰려면
설정의 "사용할 AI"를 Claude로 바꾸고 [console.anthropic.com](https://console.anthropic.com)에서 받은 API 키를 넣습니다. 역시 Claude 구독과 별개로 사용량만큼 과금됩니다.

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
- 관찰 내용은 **Google(Gemini) 또는 Anthropic(Claude) 서버로 전송**되고, Notion(역시 해외 서버)에 저장됩니다. 학교/교육청의 개인정보 처리 지침상 학생 실명·민감정보를 외부 클라우드 AI에 넣는 것이 허용되는지 **먼저 확인**하세요. 불확실하면 이니셜이나 번호로 입력하는 것이 안전합니다.
- 비서는 말한 사실만 근거로 쓰도록 지시되어 있지만, LLM은 그럴듯하게 꾸밀 수 있습니다. **NEIS에 옮기기 전에 반드시 직접 검토**하세요. 승인 카드에서 내용을 확인한 뒤 "실행"을 누르는 구조는 이 때문입니다.

### 기타 한계
- 반복 일정, 다른 캘린더(기본 캘린더만), 참석자 초대는 아직 지원하지 않습니다.
- Google Tasks는 마감 "날짜"만 지원합니다(시각 불가 — Google API 자체 제약).
- 대화 기록은 앱을 끄면 사라집니다. 새 대화(↺)를 자주 눌러야 토큰 비용이 줄어듭니다.
- Mac용(.dmg)은 아직 없습니다. 자동 업데이트도 없어서, 새 버전은 설치 파일을 다시 받아 덮어 설치해야 합니다(설정은 유지됨).

## 구조

```
src/
  main.js          Electron 메인: 캐릭터 창(투명·항상 위), 대화창, 트레이, IPC
  agent.js         Gemini/Claude 도구 사용 루프 + 쓰기 작업 승인 게이트 + 시스템 프롬프트
  config.js        설정 저장 (비밀값 암호화)
  tools/notion.js  Notion 검색·페이지 생성·덧붙이기
  tools/google.js  OAuth 로그인, Calendar·Tasks
  renderer/        캐릭터(SVG), 대화창 UI
```

새 기능(예: Gmail 요약, Google Drive 검색)을 넣으려면 `agent.js`의 `TOOLS`에 도구 정의를, `runTool`에 실행 코드를 추가하고, 쓰기 작업이면 `WRITE_TOOLS`에 이름을 넣으면 됩니다.
