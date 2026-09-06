# Design Specification: Synology Sync Manager

- **Date:** 2026-09-06
- **Status:** Approved Draft
- **Target Platform:** Windows 10/11 (x64)
- **Tech Stack:** Node.js v24, Electron, WebDAV API, Vitest / Jest

---

## 1. Overview & Objectives

Synology Sync Manager는 Windows 데스크톱 환경에서 로컬 폴더를 시놀로지(Synology) NAS와 안전하게 동기화하는 백업/동기화 애플리케이션입니다.

### 핵심 목표
1. **안전 백업(Safe Backup) 정책 준수:**
   - 로컬의 신규 파일 및 수정된 파일만 NAS로 업로드합니다.
   - 로컬에서 파일이 삭제되더라도 NAS에 업로드된 파일은 절대 삭제되지 않고 영구 보존됩니다.
   - 이미 동일한 파일(크기 및 수정 시각 일치)은 전송을 건너뛰어 네트워크 대역폭을 절약합니다.
2. **외부 인터넷 접속 지원:**
   - HTTPS 기반 Synology WebDAV 프로토콜을 사용하여 포트포워딩, DDNS, 공인 IP 환경 어디서나 동작합니다.
   - 자체 서명 SSL 인증서를 지원(옵션 토글)합니다.
3. **심플 GUI 및 시스템 트레이 상주:**
   - 작업 표시줄 트레이(System Tray)에 최소화되어 백그라운드에서 동작합니다.
   - 정기적인 자동 동기화(주기 설정) 및 수동 '지금 동기화' 버튼을 지원합니다.
   - 실시간 진행률, 전송 현황, 활동 로그를 직관적으로 제공합니다.

---

## 2. System Architecture

```
┌────────────────────────────────────────────────────────┐
│                   Electron Desktop App                 │
│                                                        │
│  ┌───────────────────────┐   IPC    ┌───────────────┐  │
│  │   Renderer Process    │ ◄──────► │ Main Process  │  │
│  │  - 설정 화면 (NAS 정보) │          │ - System Tray │  │
│  │  - 상태 & 로그 모니터   │          │ - Window 관리 │  │
│  │  - 수동 '지금 동기화'   │          │ - 설정 저장소 │  │
│  └───────────────────────┘          └───────┬───────┘  │
│                                             │          │
│                                     ┌───────▼───────┐  │
│                                     │  Sync Engine  │  │
│                                     │ - Scheduler   │  │
│                                     │ - File Scanner│  │
│                                     │ - WebDAV      │  │
│                                     └───────┬───────┘  │
└─────────────────────────────────────────────┼──────────┘
                                              │ HTTPS (WebDAV)
                                      ┌───────▼───────┐
                                      │ Synology NAS  │
                                      │  WebDAV Server│
                                      └───────────────┘
```

### 아키텍처 계층
1. **Renderer Layer (UI):**
   - HTML5, CSS3, ES2024 Vanilla JS / TypeScript
   - 상태 표시 (대기, 스캔 중, 동기화 중, 완료, 오류)
   - NAS 연결 정보 설정, 동기화 대상 폴더 선택, 주기 설정, 실시간 로그 뷰어
2. **Preload Layer (Security Bridge):**
   - `contextBridge`를 통한 안전한 IPC 채널 노출 (`window.electronAPI`)
3. **Main Process Layer:**
   - Electron 생명주기 제어, BrowserWindow 생성 및 트레이 아이콘 관리
   - 창 닫기(`close`) 이벤트 가로채어 트레이로 최소화(Hide)
   - 설정 파일(JSON) 입출력 관리
4. **Sync Engine Layer (Core Logic):**
   - `WebDAVClient`: WebDAV 연결, 인증, 원격 폴더 생성(`ensureDir`), 파일 업로드(`putFileContents`), 원격 파일 메타데이터 조회(`stat`/`getDirectoryContents`)
   - `FileScanner`: 로컬 디렉터리 재귀 탐색, 임시/시스템 파일 필터링, 크기/수정일자(`mtime`) 수집
   - `SyncEngine`: 로컬과 원격 비교 알고리즘, 업로드 큐 관리, 동기화 락(중복 실행 방지), 진행률 이벤트 발행
   - `Scheduler`: 타이머 기반 정기 동기화 트리거

---

## 3. Data Flow & Sync Policy

### 3.1 동기화 시작 트리거
- 수동 실행: 사용자가 UI 또는 트레이 메뉴에서 "지금 즉시 동기화" 클릭
- 스케줄러 실행: 지정된 주기(예: 15분, 30분, 1시간, 6시간, 24시간) 도달 시 자동 실행

### 3.2 상세 동기화 알고리즘
1. **실행 중복 방지 (Concurrency Lock):**
   - `isSyncing` 플래그를 검사하여 이미 동기화가 진행 중이면 새로운 동기화 요청을 무시하거나 완료 후로 대기시킵니다.
2. **연결 검증:**
   - NAS WebDAV 엔드포인트에 가벼운 헬스체크 요청을 보냅니다. 실패 시 UI에 즉시 오류를 알리고 중단합니다.
3. **로컬 파일 탐색 (Local Scan):**
   - 로컬 폴더를 재귀 탐색하여 `Map<RelativePath, { size: number, mtime: number }>` 생성
   - 제외 규칙: `.git`, `node_modules`, `~$*`, `*.tmp`, `Thumbs.db`, `.DS_Store`
   - 한글 경로 정규화: 모든 경로는 NFC(`normalize('NFC')`)로 일관성 유지
4. **원격 파일 탐색 (Remote Scan):**
   - NAS의 동기화 대상 디렉터리를 탐색하여 `Map<RelativePath, { size: number, mtime: number }>` 생성
5. **차이점 분석 (Diffing):**
   - 대상: 로컬의 모든 파일
   - 규칙 1 (신규 파일): 원격에 동일 상대 경로의 파일이 없는 경우 ➔ **업로드**
   - 규칙 2 (수정된 파일): 원격에 파일이 있으나, 로컬 파일의 `size`가 다르거나 로컬 `mtime`이 원격 `mtime`보다 최신인 경우 ➔ **업로드**
   - 규칙 3 (동일 파일): 크기와 수정 시각이 일치하는 경우 ➔ **스킵 (Skip)**
   - 규칙 4 (안전 백업): 로컬에 없고 원격에만 존재하는 파일 ➔ **아무 작업도 하지 않음 (보존)**
6. **업로드 실행:**
   - 필요한 원격 상위 디렉터리가 없으면 원격 폴더를 재귀적으로 생성 (`ensureDir`)
   - 대용량 파일도 안전하게 처리할 수 있도록 파일 스트림(`fs.createReadStream`) 업로드
   - 파일 업로드 성공 시 원격 mtime 동기화 시도 및 상태 갱신
   - 파일별 진행 상태(현재 파일명, 완료 건수/전체 건수, 백분율)를 IPC로 Renderer에 전송
7. **완료 및 알림:**
   - 동기화 요약 통계(업로드 개수, 스킵 개수, 실패 개수, 소요 시간) 로그 기록
   - 윈도우 네이티브 알림 표시 (동기화 완료)

---

## 4. Component Interfaces

### 4.1 Configuration Schema (`config.json`)
```typescript
interface AppConfig {
  nas: {
    url: string;              // 예: "https://my-nas.synology.me"
    port: number;             // 기본 WebDAV 포트 (HTTP 5005, HTTPS 5006)
    username: string;
    password: string;
    remotePath: string;       // 예: "/home/CloudBackup"
    allowInsecureSSL: boolean;// 자체 서명 인증서 허용 여부
  };
  sync: {
    localPath: string;        // 로컬 동기화 대상 폴더
    intervalMinutes: number;  // 0: 수동만, 15, 30, 60, 360, 1440
    autoStartOnBoot: boolean; // Windows 시작 프로그램 등록 여부
  };
}
```

### 4.2 WebDAV Client Interface
```typescript
interface IWebDAVClient {
  testConnection(): Promise<{ success: boolean; message?: string }>;
  ensureDir(remoteDirPath: string): Promise<void>;
  uploadFile(localFilePath: string, remoteFilePath: string): Promise<void>;
  listRemoteFiles(remoteBasePath: string): Promise<Map<string, { size: number; mtime: number }>>;
}
```

### 4.3 Sync Progress Event
```typescript
interface SyncProgress {
  status: 'idle' | 'scanning' | 'syncing' | 'completed' | 'error';
  currentFile?: string;
  totalFiles: number;
  completedFiles: number;
  percent: number;
  uploadedCount: number;
  skippedCount: number;
  failedCount: number;
  message?: string;
}
```

---

## 5. UI and System Tray Specification

### 5.1 Main Window UI
- **크기:** 680px x 620px (창 크기 조절 방지 또는 반응형 미니멀 레이아웃)
- **카드 1 (NAS 연결 설정):**
  - 서버 URL, 포트, 계정, 비밀번호, 사설 SSL 허용 체크박스
  - [연결 테스트] 버튼 및 상태 인디케이터
- **카드 2 (동기화 폴더 설정):**
  - 로컬 폴더 경로 [폴더 선택 다이얼로그]
  - NAS 원격 폴더 경로 입력 필드
- **카드 3 (스케줄 & 동기화 실행):**
  - 자동 주기 선택 (수동만 / 15분 / 30분 / 1시간 / 6시간 / 매일)
  - [지금 동기화] 버튼 (동기화 중일 때는 비활성화 및 스피너 표시)
  - 진행률 바(Progress Bar) 및 전송률 표시
- **카드 4 (로그 뷰어):**
  - 최근 동기화 이벤트 타임스탬프 로그 (스크롤 가능)

### 5.2 System Tray
- 기본 동작: 창의 `X` 버튼 클릭 시 창을 숨기고(`win.hide()`) 트레이로 최소화
- 트레이 아이콘 우클릭 컨텍스트 메뉴:
  - 🔄 **지금 즉시 동기화**
  - 🪟 **열기 (Open Window)**
  - ⚙️ **설정**
  - ❌ **완전 종료 (Exit)**
- 트레이 아이콘 더블클릭: 메인 창 복원

---

## 6. Error Handling & Edge Cases

| 상황 | 원인 | 대응 및 방어 조치 |
|------|------|-------------------|
| 사설 SSL 에러 | 시놀로지 자체 서명 인증서 사용 시 `CERT_HAS_EXPIRED` 또는 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | `allowInsecureSSL: true` 설정 시 `rejectUnauthorized: false` 적용 |
| 파일 잠금 (File Lock) | 오피스나 다른 앱에서 파일을 열어두어 읽기 실패(`EBUSY`, `EPERM`) | 해당 파일만 경고 로그를 남기고 스킵, 전체 프로세스는 중단 없이 지속 |
| 한글 파일명 깨짐 | 윈도우/맥/리눅스 NFD/NFC 자모 분리 | 전송 전 `path.normalize('NFC')` 적용 및 WebDAV URL 인코딩 처리 |
| 네트워크 단절/타임아웃 | 업로드 도중 Wi-Fi 끊김 또는 NAS 재부팅 | 요청 타임아웃(30초) 설정, 실패 로그 기록, 다음 주기에서 자동 재시도 |
| 대용량 파일 메모리 고갈 | 수 GB 단위 파일 읽기 시 메모리 누수 | 스트림(`fs.createReadStream`) 파이프라인으로 청크 단위 업로드 |

---

## 7. Testing & Verification Plan

1. **단위 테스트 (Unit Tests):**
   - `FileScanner`: 임시 폴더에 파일 생성 후 스캔 결과의 상대 경로, 크기, mtime 검증 및 제외 파일 필터링 검증
   - `SyncEngine (Diff Engine)`: Mock WebDAV를 이용해 신규 파일 업로드, 수정 파일 갱신, 동일 파일 스킵, 원격 보존(삭제 안 함) 규칙 단위 테스트
2. **통합 테스트 (Integration Test):**
   - 로컬 테스트 디렉터리와 로컬 WebDAV 테스트 서버(또는 실제 Synology 엔드포인트) 간의 파일 전송 종단간 검증
3. **UI/빌드 검증:**
   - Electron 앱 실행, 트레이 최소화/복원 확인, IPC 통신 및 로그 출력 검증
