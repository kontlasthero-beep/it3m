# UI Art Folder Guide

화면 단계별로 UI와 아트 시안을 정리한 작업 폴더 안내입니다. 폴더명은 영어 `kebab-case`로 통일했습니다.

상위 폴더는 화면 단계 또는 공통 요소이고, 하위 폴더는 그 화면에 들어가는 UI입니다. 첨부한 로비 화면은 `game-lobby-screen`에 해당합니다.

## 화면별 상위 폴더

| 폴더 | 화면 또는 용도 | 현재 코드 위치 |
| --- | --- | --- |
| `login-screen` | 로그인 화면 | `accountScreen (로그인 모드)` |
| `registration-screen` | 계정 등록 화면 | `accountScreen (계정 등록 모드)` |
| `guest-warning-screen` | 게스트 안내 화면 | `guestWarningScreen` |
| `game-lobby-screen` | 게임 로비 화면 (첨부한 화면) | `homeScreen` |
| `account-settings-screen` | 계정 설정 화면 | `accountSettingsScreen` |
| `game-mode-selection-screen` | 플레이 방식 선택 화면 | `startMenu` |
| `public-room-browser-screen` | 공개 방 찾기 화면 | `browseRoomsScreen` |
| `room-password-screen` | 사설 방 비밀번호 화면 | `publicRoomPasswordOverlay` |
| `room-code-join-screen` | 방 코드 참가 화면 | `joinRoomScreen` |
| `online-room-creation-screen` | 온라인 방 생성 화면 | `createRoomScreen` |
| `local-play-setup-screen` | 로컬 2인 플레이 준비 화면 | `localPlayScreen` |
| `ai-opponent-selection-screen` | AI 대전 선택 화면 | `aiPlayScreen` |
| `map-selection-screen` | 맵 선택 및 온라인 준비 화면 | `mapSelectOverlay` |
| `hero-selection-screen` | 영웅 능력 선택 화면 | `heroSelectOverlay` |
| `catalog-screen` | 도감 화면 | `catalogOverlay` |
| `deck-builder-screen` | 카드 덱 만들기 화면 | `deckOverlay` |
| `in-game-screen` | 실제 경기 화면 | `game / topbar / scoreboard / hands` |
| `tutorial-screen` | 튜토리얼 화면 | `tutorialPanel + 경기 화면` |
| `trigger-selection-screen` | 트리거 선택 창 | `triggerSelectOverlay` |
| `bag-inspection-screen` | 인게임 가방 확인 창 | `gameDeckOverlay` |
| `game-settings-screen` | 인게임 설정 창 | `gameSettingsOverlay` |
| `match-results-screen` | 경기 결과 및 보상 화면 | `resultOverlay` |
| `card-draw-screen` | 카드 뽑기 표시 단계 | `dealOverlay` |
| `shared-ui` | 화면 공통 디자인 | `공통 요소` |
| `web-poster-screen` | 웹 포스터 및 세계관 기록 | `poster.html` |

## 로비 화면 예시

첨부한 화면에서 보이는 요소는 다음 위치로 나뉩니다.

```text
game-lobby-screen/
  background/
  game-title/
  stone-display/
  player-profile/
    nickname/
    player-id/
    level-fame-label/
    fame-progress-bar/
  play-button/
  tutorial-button/
  catalog-button/
  deck-builder-button/
  account-settings-button/
```

## 화면별 하위 UI 폴더

아래 경로는 각 상위 폴더를 기준으로 한 상대 경로입니다. `/`로 이어지는 항목은 실제 중첩된 폴더입니다.

### 로그인 화면 · `login-screen`

- `background`: 배경
- `game-title`: 게임 제목
- `account-id-input`: 계정 ID 입력칸
- `password-input`: 비밀번호 입력칸
- `login-button`: 로그인 버튼
- `register-button`: 계정 등록 화면 이동 버튼
- `guest-play-button`: 게스트 플레이 버튼
- `status-message`: 로그인 상태 및 오류 메시지

### 계정 등록 화면 · `registration-screen`

- `background`: 배경
- `game-title`: 게임 제목
- `account-id-input`: 계정 ID 입력칸
- `nickname-input`: 닉네임 입력칸
- `password-input`: 비밀번호 입력칸
- `register-button`: 계정 등록 버튼
- `back-button`: 로그인 화면 복귀 버튼
- `status-message`: 등록 상태 및 오류 메시지

### 게스트 안내 화면 · `guest-warning-screen`

- `background`: 배경
- `warning-panel`: 진척도 미저장 안내
- `confirm-button`: 확인 버튼
- `back-button`: 돌아가기 버튼

### 게임 로비 화면 (첨부한 화면) · `game-lobby-screen`

- `background`: 배경
- `game-title`: 게임 제목
- `stone-display`: 파란색 및 빨간색 스톤 장식
- `player-profile/nickname`: 닉네임
- `player-profile/player-id`: 개인 플레이어 ID
- `player-profile/level-fame-label`: 레벨 및 명성치 텍스트
- `player-profile/fame-progress-bar`: 명성치 진행 바
- `play-button`: 게임 시작 버튼
- `tutorial-button`: 튜토리얼 버튼
- `catalog-button`: 도감 버튼
- `deck-builder-button`: 카드 덱 만들기 버튼
- `account-settings-button`: 계정 설정 버튼

### 계정 설정 화면 · `account-settings-screen`

- `screen-layout`: 전체 배치
- `account-identity`: 계정 및 플레이어 ID
- `match-records`: 경기·승리·패배·무승부 전적
- `nickname-input`: 닉네임 입력칸
- `nickname-change-button`: 닉네임 변경 버튼
- `logout-button`: 로그아웃 버튼
- `back-to-lobby-button`: 로비 복귀 버튼

### 플레이 방식 선택 화면 · `game-mode-selection-screen`

- `screen-layout`: 전체 배치
- `public-room-button`: 공개 방 찾기 버튼
- `room-code-button`: 방 코드 입력하기 버튼
- `local-play-button`: 로컬 2인 플레이 버튼
- `online-room-button`: 온라인 방 만들기 버튼
- `ai-battle-button`: AI 대전 버튼
- `deck-builder-button`: 카드 덱 만들기 버튼
- `back-to-lobby-button`: 로비 복귀 버튼

### 공개 방 찾기 화면 · `public-room-browser-screen`

- `screen-layout`: 전체 배치
- `player-identity`: 현재 플레이어 정보
- `room-list`: 공개 방 목록
- `room-entry`: 방 항목과 잠금·참가 가능 상태
- `status-message`: 목록 및 참가 상태
- `refresh-button`: 목록 새로고침 버튼
- `back-button`: 뒤로 버튼

### 사설 방 비밀번호 화면 · `room-password-screen`

- `screen-layout`: 전체 배치
- `room-title`: 선택한 방 정보
- `password-input`: 방 비밀번호 입력칸
- `join-button`: 참가 버튼
- `cancel-button`: 취소 버튼
- `status-message`: 비밀번호 및 참가 오류

### 방 코드 참가 화면 · `room-code-join-screen`

- `screen-layout`: 전체 배치
- `player-identity`: 현재 플레이어 정보
- `room-code-input`: 초대 코드 입력칸
- `password-input`: 사설 방 비밀번호 입력칸
- `join-button`: 참가 버튼
- `back-button`: 뒤로 버튼
- `status-message`: 참가 상태

### 온라인 방 생성 화면 · `online-room-creation-screen`

- `screen-layout`: 전체 배치
- `player-identity`: 현재 플레이어 정보
- `private-room-toggle`: 사설 방 체크박스
- `password-input`: 방 비밀번호 입력칸과 비활성 상태
- `create-room-button`: 방 만들기 버튼
- `back-button`: 뒤로 버튼
- `status-message`: 생성 상태

### 로컬 2인 플레이 준비 화면 · `local-play-setup-screen`

- `screen-layout`: 전체 배치
- `player-nickname-inputs`: 두 플레이어 닉네임 입력칸
- `player-deck-selectors`: 플레이어별 가방 선택
- `map-selection-button`: 맵 선택 버튼
- `back-button`: 뒤로 버튼

### AI 대전 선택 화면 · `ai-opponent-selection-screen`

- `screen-layout`: 전체 배치
- `player-identity`: 플레이어 닉네임
- `opponent-portraits/neo`: 네오 초상화
- `opponent-portraits/neutron`: 뉴트론 초상화
- `opponent-portraits/aab`: AAB 초상화
- `portrait-frames`: 초상화 테두리 및 선택 상태
- `difficulty-skulls`: 해골 난이도 표시
- `opponent-record-panel`: 상대 이름 및 기록 패널
- `deck-selector`: 사용할 가방 선택
- `start-game-button`: 게임 시작 버튼
- `back-button`: 뒤로 버튼

### 맵 선택 및 온라인 준비 화면 · `map-selection-screen`

- `screen-layout`: 전체 배치
- `map-options/classic`: 기본 맵 선택 항목
- `map-options/ice`: 얼음 맵 선택 항목
- `map-options/moving-walls`: 구조물 맵 선택 항목
- `invite-code-panel`: 방 초대 코드
- `player-ready-status`: 양 플레이어 준비 상태
- `connection-status`: 방 연결 안내
- `confirm-button`: 맵 확정 버튼
- `cancel-leave-button`: 취소 및 방 나가기 버튼

### 영웅 능력 선택 화면 · `hero-selection-screen`

- `screen-layout`: 전체 배치
- `hero-choice-cards`: 영웅 초상화와 선택 카드
- `player-identity`: 선택 중인 플레이어
- `selection-countdown`: 15초 카운트다운
- `description-tooltip`: 영웅 설명 툴팁
- `selection-feedback`: 선택 및 자동 선택 연출
- `status-message`: 선택 상태

### 도감 화면 · `catalog-screen`

- `screen-layout`: 전체 배치
- `catalog-tabs`: 카드·트리거·영웅 도감 탭
- `card-catalog/card-entry`: 카드 삽화·이름·설명 항목
- `card-catalog/locked-card-overlay`: 잠긴 카드 블러·자물쇠
- `trigger-catalog/trigger-entry`: 트리거 이미지·설명 항목
- `hero-catalog/hero-entry`: 영웅 초상화·설명 항목
- `description-panel`: 요소 설명 영역
- `back-to-lobby-button`: 로비 복귀 버튼

### 카드 덱 만들기 화면 · `deck-builder-screen`

- `screen-layout`: 전체 배치
- `owned-card-pool`: 보유 카드 풀
- `bag-slots`: 가방 배치 칸
- `card-count`: 8장 구성 수량 표시
- `preset-buttons`: 1·2·3 프리셋 버튼
- `save-button`: 저장 버튼과 활성·비활성 상태
- `reset-button`: 덱 초기화 버튼
- `back-button`: 돌아가기 버튼
- `drag-preview`: 드래그 카드 미리보기
- `duplicate-card-aura`: 중복 추가 가능 아우라
- `status-message`: 저장 및 오류 상태

### 실제 경기 화면 · `in-game-screen`

- `screen-layout`: 경기 화면 전체 배치
- `header-map-turn-status`: 게임 제목·맵·현재 턴 표시
- `curling-table-maps/classic`: 기본 테이블
- `curling-table-maps/ice`: 얼음 테이블
- `curling-table-maps/moving-walls`: 움직이는 구조물 맵
- `curling-table-maps/table-boundaries`: 테이블 윤곽·골·거리 표시선
- `curling-table-maps/placement-limit`: 배치 제한 영역 표시
- `stones-player-markers/blue-stone`: 파란색 스톤
- `stones-player-markers/red-stone`: 빨간색 스톤
- `stones-player-markers/status-markers`: 선택 및 카드 효과 표시
- `scoreboard-player-panels/player-info`: 이름·영웅·점수
- `scoreboard-player-panels/remaining-stones`: 남은 스톤 수
- `scoreboard-player-panels/match-score`: 매치 승수 및 라운드 표시
- `hand-cards-animations/compact-card`: 축소 손패 카드
- `hand-cards-animations/card-inspector`: 호버 확대 카드
- `hand-cards-animations/card-back`: 카드 뒷면
- `hand-cards-animations/drag-preview`: 카드 사용 드래그 형태
- `hand-cards-animations/use-animation`: 카드 소멸 및 사용 연출
- `in-game-bag/deck-stack`: 남은 수에 따른 카드 더미
- `in-game-bag/bag-tooltip`: 플레이어 가방 설명
- `trigger-placement-button/trigger-icon`: 회전하는 배치 버튼
- `trigger-placement-button/remaining-use-badge`: 남은 설치 횟수
- `power-meter-launch-ui/launch-button`: 발사 버튼
- `power-meter-launch-ui/meter-frame`: 파워 미터 프레임
- `power-meter-launch-ui/meter-indicator`: 왕복 미터 및 파워 표시
- `power-meter-launch-ui/confirm-button`: 파워 결정 버튼
- `power-meter-launch-ui/locked-power-label`: 스톤 위 확정 파워
- `turn-timer-game-speed/turn-timer`: 남은 턴 시간
- `turn-timer-game-speed/countdown-feedback`: 카운트다운 강조
- `turn-timer-game-speed/speed-button`: 게임 속도 버튼
- `turn-controls/end-turn-button`: 턴 종료 버튼
- `turn-controls/action-status`: 조작 상태 안내
- `connection-network-status/status-button`: 연결 상태 버튼
- `connection-network-status/details-panel`: 핑·전송 경로·갱신 정보
- `connection-network-status/connection-notice`: 입장·연결·이탈 알림
- `game-objects/structure-drop-brick`: 구조물 투하 벽돌
- `game-objects/data-barrier`: 데이터 장벽
- `game-objects/guard-satellites`: 방호벽 위성체
- `game-objects/ammo-projectile`: 총알 장전 탄환
- `game-objects/triggers/blackhole`: 블랙홀 방출 트리거
- `game-objects/triggers/pulse`: 방출 트리거
- `game-objects/triggers/hardening`: 경질화 트리거
- `game-objects/triggers/guard`: 방호벽 트리거
- `effects/shockwave`: 방출 충격파
- `effects/black-hole`: 블랙홀 방출 효과
- `effects/collision-fall-knockout`: 충돌·추락·처치 연출
- `effects/card-feedback`: 카드 적용 강조
- `effects/particles`: 파티클
- `effects/speed-change`: 속도 변경 피드백
- `entity-tooltip`: 스톤·트리거·구조물 설명
- `settings-button`: 인게임 설정 버튼
- `aim-direction`: 발사 방향 점선

### 튜토리얼 화면 · `tutorial-screen`

- `screen-layout`: 튜토리얼 안내 영역
- `lesson-selector`: 단계 선택
- `lesson-title`: 단계 제목
- `instructions`: 단계 설명
- `objective-status`: 목표 및 달성 상태
- `retry-button`: 다시 연습 버튼
- `next-lesson-button`: 다음 연습 버튼
- `highlighted-controls`: 연습 요소 강조
- `success-feedback`: 수료 애니메이션

### 트리거 선택 창 · `trigger-selection-screen`

- `screen-layout`: 전체 배치
- `trigger-choice-icons`: 회전하는 트리거 선택지
- `selected-trigger-state`: 선택 강조
- `confirm-button`: 이 위치에 배치 버튼
- `cancel-button`: 취소 버튼

### 인게임 가방 확인 창 · `bag-inspection-screen`

- `screen-layout`: 전체 배치
- `owner-title`: 플레이어 가방 이름
- `compact-card-list`: 가방 카드 목록
- `drawn-card-state`: 뽑은 카드 회색 표시
- `back-button`: 돌아가기 버튼

### 인게임 설정 창 · `game-settings-screen`

- `screen-layout`: 전체 배치
- `music-volume-control`: 배경음악 볼륨 슬라이더 및 수치
- `sfx-volume-control`: 효과음 볼륨 슬라이더 및 수치
- `tutorial-restart-button`: 현재 연습 다시 시작
- `back-to-lobby-button`: 튜토리얼 로비 복귀
- `ai-forfeit-button`: 게임 포기 버튼
- `forfeit-confirmation`: 포기 확인 문구 및 버튼
- `resume-button`: 게임 복귀 버튼

### 경기 결과 및 보상 화면 · `match-results-screen`

- `screen-layout`: 전체 배치
- `winner-title`: 승리·패배 제목
- `result-message`: 경기 결과 안내
- `player-result-panels`: 플레이어별 최종 점수
- `fame-reward`: 명성치 보상
- `level-up-feedback`: 레벨업 표시
- `card-unlock-feedback`: 카드 해금 보상
- `replay-button`: 다시 플레이 버튼
- `lobby-button`: 로비 복귀 버튼

### 카드 뽑기 표시 단계 · `card-draw-screen`

- `screen-layout`: 중앙 공개 카드 배치
- `player-name`: 카드를 뽑는 플레이어
- `revealed-card`: 삽화·이름·설명이 있는 카드
- `draw-animation`: 가방에서 중앙을 거쳐 손패로 가는 연출

### 화면 공통 디자인 · `shared-ui`

- `account-layout`: 기존 시작·계정 공통 시안
- `branding`: 게임 로고 및 앱 아이콘
- `dialog-frames`: 공통 창 테두리
- `button-states`: 기본·호버·선택·비활성 버튼 상태
- `input-fields`: 공통 입력칸
- `checkboxes-dropdowns`: 체크박스 및 선택 메뉴
- `tooltips`: 공통 설명창
- `background-textures`: 화면 배경·질감
- `typography`: 서체 및 텍스트 스타일

### 웹 포스터 및 세계관 기록 · `web-poster-screen`

- `screen-layout`: 전체 포스터 배치
- `background-timeline`: 세계관 스크롤 배경
- `fixed-game-title`: 중앙 고정 게임 제목
- `play-button`: 게임 플레이 링크 버튼
- `story-records`: 기록 01~05 자막
- `side-quotes`: 세로 문구
- `scroll-overlays`: 스크롤에 따른 이미지 투명도 및 암막

## 재사용과 기존 자산

- 여러 화면이 같은 버튼·입력칸·창 테두리를 사용할 때는 `shared-ui`에 공통 시안을 둡니다.
- 로그인과 계정 등록은 현재 코드에서 같은 폼의 두 모드이지만, 디자인 작업은 `login-screen`과 `registration-screen`으로 구분합니다.
- 튜토리얼은 경기 화면의 스톤·테이블·카드를 공유하므로 공통 경기 아트는 `in-game-screen`, 튜토리얼 전용 안내 UI는 `tutorial-screen`에 둡니다.
- `Card_illustration`, `Trigger_illustration`, `영웅 초상화`, `World_illustration`, `배경음악`, `효과음` 및 루트의 기존 이미지 파일은 현재 게임 참조 경로에 유지됩니다.
- 이번 폴더 구조는 신규 디자인 작업물의 보관 위치입니다. 새 이미지의 실제 게임 적용은 해당 자산을 연결하는 별도 코드 변경으로 진행합니다.
- 빈 UI 폴더의 `.gitkeep`은 Git에서 폴더 구조를 보존하는 표시 파일입니다.
