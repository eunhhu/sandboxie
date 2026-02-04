# Sandboxie

친구나 지인에게 격리된 터미널 환경을 제공하고, 웹 대시보드를 통해 세션을 관리하는 시스템.

사용자별로 독립된 Podman 컨테이너를 생성하고, Cloudflare Tunnel을 통해 SSH로 접속할 수 있는 샌드박스 환경을 제공한다.
`{username}.sandbox.qucord.com` 형태의 서브도메인이 자동 등록된다.

## 기술 스택

| 영역 | 기술 |
|------|------|
| Runtime | Bun |
| Backend | Elysia.js |
| Frontend | Vite + SolidJS (CSR) |
| Styling | Tailwind CSS |
| Database | PostgreSQL 15 (Podman 컨테이너) |
| ORM | Drizzle ORM |
| Container | Podman (rootless) |
| DNS | Cloudflare API (CNAME → Tunnel) |
| SSH Proxy | Cloudflare Tunnel (cloudflared) |
| Auth | JWT (Bearer Token) |
| Password | bcrypt (Bun.password) |
| E2E Test | Playwright |

## 인프라

- **Host:** Raspberry Pi 5 (8GB)
- **OS:** Debian 13 (trixie), aarch64
- **Domain:** `sandbox.qucord.com`
- **Tunnel:** Cloudflare Tunnel (`cloudflared`)

## 프로젝트 구조

```
sandboxie/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Elysia 서버 진입점 + 정적 파일 서빙
│   │   ├── config.ts             # 환경변수 로딩
│   │   ├── db/
│   │   │   ├── index.ts          # Drizzle 클라이언트
│   │   │   ├── schema.ts         # sessions 테이블 정의
│   │   │   └── migrate.ts        # 마이그레이션 실행
│   │   ├── routes/
│   │   │   ├── auth.ts           # POST /api/auth/login
│   │   │   └── sessions.ts       # 세션 CRUD API
│   │   ├── services/
│   │   │   ├── session.ts        # 세션 비즈니스 로직
│   │   │   ├── podman.ts         # Podman CLI 래퍼
│   │   │   ├── cloudflare.ts     # Cloudflare DNS API (CNAME)
│   │   │   └── tunnel.ts         # Cloudflare Tunnel 인그레스 관리
│   │   ├── middleware/
│   │   │   └── auth.ts           # JWT 인증 미들웨어
│   │   └── utils/
│   │       ├── password.ts       # bcrypt 해싱
│   │       └── port-allocator.ts # SSH 포트 할당
│   └── drizzle/                  # 마이그레이션 파일
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # 루트 컴포넌트 (로그인/대시보드 전환)
│   │   ├── api.ts                # API 클라이언트
│   │   └── pages/
│   │       ├── Login.tsx          # 관리자 로그인
│   │       └── Dashboard.tsx      # 세션 관리 대시보드
│   └── build/                    # 빌드 출력 (백엔드에서 서빙)
├── container/
│   ├── Containerfile             # Ubuntu 22.04 기반 샌드박스 이미지
│   └── entrypoint.sh             # 사용자 생성 + SSH 서버 시작
├── e2e/
│   └── app.spec.ts               # Playwright E2E 테스트
├── scripts/
│   └── deploy.sh                 # 프로덕션 배포 스크립트
├── docker-compose.yml            # PostgreSQL 컨테이너
├── playwright.config.ts          # E2E 테스트 설정
├── .env.example                  # 환경변수 템플릿
└── package.json                  # Bun workspace 루트
```

## 설치 및 실행

### 사전 요구사항

- [Bun](https://bun.sh) v1.0+
- [Podman](https://podman.io) v4.0+
- podman-compose
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/) (SSH 터널링)

### 1. 의존성 설치

```bash
bun install
```

### 2. 환경변수 설정

```bash
cp .env.example .env
# .env 파일을 수정하여 실제 값 입력
```

| 변수 | 필수 | 설명 | 기본값 |
|------|:---:|------|--------|
| `DATABASE_URL` | O | PostgreSQL 연결 문자열 | - |
| `ADMIN_PASSWORD` | O | 대시보드 관리자 비밀번호 | - |
| `JWT_SECRET` | O | JWT 서명 시크릿 | - |
| `CF_API_TOKEN` | | Cloudflare API 토큰 | (없으면 DNS 생략) |
| `CF_ZONE_ID` | | Cloudflare Zone ID | (없으면 DNS 생략) |
| `CF_DOMAIN` | | 기본 도메인 | `sandbox.qucord.com` |
| `PORT` | | 서버 포트 | `3000` |
| `HOST` | | 서버 호스트 | `0.0.0.0` |
| `SANDBOX_IMAGE` | | 컨테이너 이미지 | `localhost/sandboxie:latest` |
| `SSH_PORT_START` | | SSH 포트 범위 시작 | `2200` |
| `SSH_PORT_END` | | SSH 포트 범위 끝 | `2299` |

### 3. PostgreSQL 실행

```bash
bun run db:up
```

### 4. 데이터베이스 마이그레이션

```bash
bun run db:generate
bun run db:migrate
```

### 5. 샌드박스 컨테이너 이미지 빌드

```bash
podman build -t localhost/sandboxie:latest container/
```

### 6. 프론트엔드 빌드

```bash
bun run build
```

### 7. 서버 실행

```bash
# 개발 모드 (watch)
bun run dev:backend

# 프로덕션
bun run start
```

## 프로덕션 배포

`/opt/sandboxie/`에 컴파일된 바이너리 + 정적 파일을 배포한다.

```bash
bun run deploy
```

`scripts/deploy.sh`가 수행하는 작업:

1. 프론트엔드 빌드
2. 백엔드를 단일 바이너리로 컴파일 (`bun build --compile`)
3. 정적 파일 복사
4. systemd 서비스 재시작

### systemd 서비스

```ini
# ~/.config/systemd/user/sandboxie.service
[Unit]
Description=Sandboxie Backend Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/sandboxie
ExecStart=/opt/sandboxie/sandboxie
EnvironmentFile=/opt/sandboxie/.env
Environment=STATIC_DIR=/opt/sandboxie/frontend/build
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

```bash
# 서비스 등록 및 시작
systemctl --user daemon-reload
systemctl --user enable --now sandboxie

# linger 설정 (로그인 없이도 서비스 유지)
loginctl enable-linger $(whoami)

# 상태 확인
systemctl --user status sandboxie
```

## SSH 접속

Cloudflare Tunnel을 통해 SSH 접속한다. 클라이언트에 `cloudflared`가 필요하다.

### 1. 클라이언트 SSH 설정

`~/.ssh/config`에 아래 내용을 추가:

```
Host *.sandbox.qucord.com
    ProxyCommand cloudflared access ssh --hostname %h
```

### 2. 접속

```bash
ssh alice@alice.sandbox.qucord.com
```

### cloudflared 설치

- macOS: `brew install cloudflared`
- Linux: [설치 가이드](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/)
- Windows: [다운로드](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/)

## API

모든 API는 `Authorization: Bearer {token}` 헤더가 필요하다 (로그인, health check 제외).

### 인증

```
POST /api/auth/login
Body: { "password": "<admin_password>" }
Response: { "token": "..." }
```

### Health Check

```
GET /api/health
Response: { "status": "ok", "timestamp": "..." }
```

### 세션 관리

```
GET    /api/sessions                      # 세션 목록
POST   /api/sessions                      # 세션 생성
DELETE /api/sessions/:username            # 세션 삭제
POST   /api/sessions/:username/restart    # 세션 재시작
GET    /api/sessions/:username/stats      # 리소스 사용량 조회
```

#### 세션 생성 요청

```json
{
  "username": "alice",
  "password": "ssh-password",
  "memoryLimit": 256,
  "cpuLimit": 0.5,
  "ttl": 3600
}
```

- `username`: 영문/숫자만, 2-30자
- `memoryLimit`: MB 단위 (기본값 256, 최대 512)
- `cpuLimit`: 코어 수 (기본값 0.5, 최대 2)
- `ttl`: 초 단위 (선택, 미지정 시 무제한)

#### 세션 생성 시 동작 흐름

1. SSH 포트 할당 (2200-2299 범위)
2. Podman 컨테이너 생성 및 시작
3. Cloudflare DNS CNAME 레코드 생성 (→ Tunnel)
4. Cloudflare Tunnel 인그레스 규칙 추가
5. DB에 세션 정보 저장

#### 세션 삭제 시 정리 흐름

1. Cloudflare Tunnel 인그레스 규칙 제거
2. Cloudflare DNS 레코드 삭제
3. Podman 컨테이너 제거
4. DB에서 세션 삭제

## 샌드박스 환경

각 세션은 Ubuntu 22.04 기반 Podman 컨테이너로 생성된다.

**사전 설치 도구:**
- Shell: zsh
- 개발: git, curl, wget, vim, nano
- 언어: Node.js 20.x, Python3, Bun

**권한:**
- sudo로 `apt`/`apt-get`만 사용 가능 (패키지 설치)
- root 로그인 비활성화
- 호스트 시스템 접근 차단

**리소스 제한:**
- 메모리: cgroup memory 컨트롤러 지원 시 적용 (RPi5는 미지원)
- CPU: `--cpus` 플래그로 제한

## 테스트

Playwright 기반 E2E 테스트를 포함한다.

```bash
# E2E 테스트 실행 (서버가 실행 중이어야 함)
bun test
```

테스트 항목:
- Health check API
- 정적 파일 서빙 (HTML, JS, CSS, SPA 폴백)
- 로그인 폼 렌더링 및 인증 실패
- 인증 플로우 (로그인 → 대시보드 → 로그아웃)
- 세션 관리 UI (생성 폼 토글)
- API 엔드포인트 (인증, 세션 목록)

## 스크립트 목록

```bash
bun run dev:backend    # 백엔드 개발 모드 (watch)
bun run dev:frontend   # 프론트엔드 개발 서버
bun run build          # 프론트엔드 빌드
bun run start          # 프로덕션 서버 실행
bun run db:up          # PostgreSQL 컨테이너 시작
bun run db:down        # PostgreSQL 컨테이너 중지
bun run db:generate    # Drizzle 마이그레이션 생성
bun run db:migrate     # 마이그레이션 실행
bun run deploy         # 프로덕션 배포 (/opt/sandboxie/)
bun test               # E2E 테스트 실행
```

## 데이터 모델

### Session

| 필드 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK, 자동 생성 |
| username | varchar(30) | 영문/숫자, unique |
| password | varchar(255) | bcrypt 해시 |
| subdomain | varchar(255) | `{username}.sandbox.qucord.com`, unique |
| sshPort | integer | 2200-2299, unique |
| containerName | varchar(100) | `sandbox-{username}`, unique |
| memoryLimit | integer | MB (기본값 256) |
| cpuLimit | real | 코어 수 (기본값 0.5) |
| status | enum | `running` / `stopped` / `paused` |
| createdAt | timestamp | 생성 시각 |
| expiresAt | timestamp | TTL 만료 시각 (nullable) |
| lastAccessedAt | timestamp | 최근 접근 시각 |

## 알려진 제한사항

- **cgroup v2 memory**: RPi5의 기본 커널은 memory 컨트롤러가 비활성화되어 있어, `--memory` 플래그 사용 시 컨테이너가 크래시한다. 런타임에 `/sys/fs/cgroup/cgroup.controllers`를 확인하여 자동으로 감지한다.
- **Podman restart**: 포트 충돌 문제로 `podman restart` 대신 stop → 1초 대기 → start 패턴을 사용한다.
- **TTL 자동 정리**: DB에 `expiresAt`이 저장되지만, 만료 시 자동 종료하는 크론잡은 아직 미구현이다.
- **Cloudflare DNS**: `CF_API_TOKEN`과 `CF_ZONE_ID`가 설정되지 않으면 DNS 등록을 건너뛴다. DNS/터널 실패는 세션 생성을 차단하지 않는다.
- **Bun 컴파일**: `bun build --compile --production` 사용 시 Elysia 런타임이 깨진다. `--production` 플래그 없이 컴파일해야 한다.
