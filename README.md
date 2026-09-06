# koken Sync Manager (코켄 동기화 매니저) v1.3.0

Windows 데스크톱 환경에서 로컬 폴더를 다양한 원격 서버(**WebDAV, Samba / SMB, FTP, FTPS**)와 안전하고 신속하게 백업 및 동기화하는 올인원 동기화 프로그램입니다.

---

## ✨ 핵심 주요 기능

### 1. 🌐 다중 원격 접속 프로토콜 지원
- **WebDAV**: Synology(시놀로지) NAS, Nextcloud, ownCloud 등 HTTP/HTTPS 기반 WebDAV 서버 지원 (사설 SSL 허용 옵션 제공).
- **Samba (SMB)**: Windows 네트워크 공유 폴더(`\\192.168.0.10\share` 등 UNC 경로) 및 사내 NAS 공유 폴더 직접 연동.
- **FTP**: 표준 FTP 전송 프로토콜을 통한 파일 백업 및 디렉토리 자동 생성.
- **FTPS**: TLS 보안 암호화가 적용된 보안 FTP 전송 지원.
- **프로토콜별 동적 UI**: 프로토콜 선택 시 해당 연결 형식에 맞는 안내 문구, 기본 포트(5006, 445, 21 등), 플레이스홀더 및 SSL 옵션이 실시간 자동 조정됩니다.

### 2. 📁 다중 동기화 폴더 & 경로 자동 완성
- 여러 개의 로컬 폴더와 원격 저장 경로 쌍을 각각 개별 등록 및 관리할 수 있습니다.
- 로컬 폴더를 선택하면 원격 백업 경로에 로컬 폴더명 기반의 하위 경로(예: `/Backup/[폴더명]`)가 자동으로 완성됩니다.

### 3. 🗑️ 양방향 미러 삭제 동기화
- **원격 삭제 미러링**: 로컬에서 파일/폴더를 삭제했을 때 원격 백업 서버의 파일도 함께 삭제할지 폴더별로 선택 가능.
- **로컬 삭제 미러링**: 원격 백업 서버에서 파일/폴더를 삭제했을 때 로컬의 파일 및 빈 상위 폴더까지 깔끔하게 자동 정리.
- **동기화 상태 추적 (Sync State Manifest)**: 로컬 및 원격 파일의 메타데이터(크기, 수정일자, 이전 동기화 내역)를 정확히 비교하여 불필요한 재전송 없이 변경/삭제된 항목만 정밀 동기화합니다.

### 4. ⚡ 실시간 파일 감지 & 스케줄 자동 동기화
- **실시간 자동 동기화**: 등록된 로컬 폴더의 파일 생성, 수정, 삭제 이벤트를 실시간 감지하여 3초 디바운스 후 즉각 자동 동기화.
- **주기적 동기화 스케줄**: 수동 실행만, 15분, 30분(기본), 1시간, 6시간, 매일 1회 주기 선택 가능.
- **동기화 즉시 취소 (`⏹️ 동기화 취소`)**: 수동/자동 동기화 진행 중 언제든 안전하게 작업을 즉시 중단할 수 있습니다.

### 5. 🚀 Windows 시작 시 자동 실행 (시작 프로그램 등록)
- Windows 부팅 시 백그라운드 트레이로 자동 실행되도록 레지스트리(`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`)에 안전하게 등록/해제할 수 있습니다.
- 단일 포터블(`.exe`) 및 설치형(`.exe`) 모두에서 완벽하게 동작합니다.

### 6. 🔒 비밀번호 안전 암호화 저장
- Windows DPAPI 기반의 Electron `safeStorage` 기술을 적용하여 원격 접속 비밀번호가 평문이 아닌 안전한 암호문으로 `config.json`에 저장됩니다.

### 7. 📜 일별 활동 로그 자동 기록 & 동기화 자동 배제
- 프로그램 실행 위치의 `logs/` 디렉토리에 날짜별 로그 파일(`YYYY-MM-DD.log`)이 실시간으로 기록됩니다.
- `logs/` 폴더 및 시스템 메타데이터(`@eaDir`, `#recycle`, `desktop.ini`, `Thumbs.db`, `.DS_Store`, `.git` 등)는 동기화 대상에서 원천 배제되어 무한 루프나 오류를 방지합니다.
- UI 상단의 **`[📂 로그 폴더 열기]`** 버튼으로 언제든 로그 폴더를 즉시 탐색기에서 확인할 수 있습니다.

### 8. 🔄 원클릭 설정 초기화 (`[🔄 설정 초기화]`)
- 원격 접속 정보, 등록된 모든 동기화 폴더 목록, 동기화 추적 기록(`sync-state.json`)을 원클릭으로 초기 상태로 리셋할 수 있습니다.

---

## 📥 실행 방법

### 1. `.exe` 실행 파일로 바로 사용 (권장)
컴파일이나 Node.js 설치 없이 배포 폴더(`release/`)의 실행 파일로 즉시 실행할 수 있습니다:

1. **포터블(단일 파일) 실행 파일**:
   - 파일 경로: `release/koken Sync Manager 1.3.0.exe`
   - 설치 과정 없이 USB, 바탕화면 등 원하는 위치에서 더블 클릭하면 즉시 실행됩니다.
2. **설치형 Setup 실행 파일**:
   - 파일 경로: `release/koken Sync Manager Setup 1.3.0.exe`
   - 바탕화면 및 시작 메뉴 바로가기를 자동 생성하며 편리하게 설치/삭제할 수 있습니다.
3. **압축 해제형 즉시 실행 파일**:
   - 파일 경로: `release/win-unpacked/koken Sync Manager.exe`

---

### 2. 개발 환경에서 실행 (Node.js)

```bash
# 의존성 패키지 설치
npm install

# TypeScript 빌드 & 렌더러/에셋 복사
npm run build

# 단위 및 통합 테스트 실행 (Vitest)
npm test

# 개발 모드 앱 실행
npm start

# Windows 실행 파일(.exe) 패키징 빌드
npm run dist
```

---

## ⚙️ 프로토콜별 연결 가이드

메인 화면 헤더 우측의 **`[⚙️ 연결 설정]`** 버튼을 클릭하면 열리는 모달 창에서 설정할 수 있습니다:

| 프로토콜 | 주소/호스트 입력 예시 | 기본 포트 | 특징 및 권장 설정 |
|---|---|---|---|
| **WebDAV** | `https://my-nas.synology.me:5006` 또는 `http://192.168.0.10:5005` | 5006 (HTTPS) / 5005 (HTTP) | Synology DSM WebDAV Server, 사설 SSL 인증서 사용 시 [자체 서명 SSL 허용] 체크 |
| **Samba (SMB)** | `\\192.168.0.10\share` 또는 `192.168.0.10` | 445 | Windows 네트워크 공유 폴더 UNC 경로 형식 사용 |
| **FTP** | `ftp.example.com` 또는 `192.168.0.10` | 21 | 일반 FTP 서버 연결 |
| **FTPS** | `ftps.example.com` 또는 `192.168.0.10` | 21 (암시적: 990) | TLS 암호화 보안 FTP 전송 |

설정 입력 후 **`[연결 테스트]`**를 클릭하여 정상 접속 여부를 즉시 검증할 수 있습니다.

---

## 📂 프로젝트 아키텍처

```text
synchronization/
├── src/
│   ├── main/                 # Electron 메인 프로세스
│   │   ├── index.ts          # 라이프사이클, IPC 통신, 동기화 프로세스 오케스트레이션
│   │   ├── store.ts          # 설정 영속화 (DPAPI 비밀번호 암호화)
│   │   ├── logger.ts         # 일별 로그(logs/YYYY-MM-DD.log) 기록기
│   │   └── tray.ts           # 시스템 트레이 아이콘 및 컨텍스트 메뉴
│   ├── sync/                 # 동기화 코어 엔진
│   │   ├── remote-client.ts  # 원격 클라이언트 인터페이스 및 팩토리
│   │   ├── webdav-client.ts  # WebDAV 클라이언트 (Synology 등)
│   │   ├── smb-client.ts     # Samba / SMB 클라이언트 (UNC 연동)
│   │   ├── ftp-client.ts     # FTP / FTPS 클라이언트 (basic-ftp 기반)
│   │   ├── file-scanner.ts   # 로컬 디렉토리 재귀 스캔 및 무시 패턴 필터링
│   │   ├── sync-engine.ts    # 동기화 플랜 계산 (업로드, 삭제, 보존 판별)
│   │   ├── sync-state.ts     # 동기화 매니페스트 상태 추적 (양방향 삭제 보증)
│   │   ├── scheduler.ts      # 주기별 자동 동기화 타이머
│   │   └── file-watcher.ts   # 실시간 파일 변경 감시 (chokidar 기반)
│   ├── preload/              # 렌더러 안전 통신 프리로드 스크립트
│   │   └── preload.ts
│   └── renderer/             # Electron UI 화면 (HTML / CSS / JS)
│       ├── index.html        # 메인 대시보드 및 연결 설정 모달
│       ├── style.css         # UI 스타일시트
│       └── app.js            # 동적 폼 제어, 실시간 로그/진행률 표시
├── tests/                    # Vitest 단위 및 통합 테스트 (41개 테스트)
├── assets/                   # 앱 및 시스템 트레이 아이콘 (icon.ico, icon.png)
├── logs/                     # 일별 활동 로그 보관 디렉토리 (동기화 제외)
├── release/                  # 패키징된 Windows 실행 파일 (.exe)
├── package.json              # 패키지 명세 (v1.3.0)
└── electron-builder.json     # Windows 인스톨러 및 포터블 빌드 설정
```

---

## 📄 라이선스
MIT License
