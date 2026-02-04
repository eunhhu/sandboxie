# Sandbox Manager PRD (Product Requirements Document)

## 1. 프로젝트 개요

### 1.1 프로젝트 명
Sandbox Manager

### 1.2 목적
친구나 지인에게 격리된 터미널 환경을 제공하고, 웹 대시보드를 통해 세션을 관리할 수 있는 시스템

### 1.3 핵심 가치
- 사용자별 완전히 격리된 컴퓨팅 환경 제공
- 리소스 사용량 제한으로 안정적인 홈서버 운영
- 간단한 URL/SSH 명령어로 즉시 접속 가능

---

## 2. 기능 요구사항

### 2.1 Core Features (MVP)

#### 2.1.1 웹 대시보드
**URL:** `sandbox.qucord.com`

**기능:**
- [ ] 관리자 로그인 (간단한 비밀번호 인증)
- [ ] 세션 목록 조회
  - 사용자명
  - 서브도메인
  - SSH 접속 명령어
  - 생성 시간
  - 리소스 사용량 (메모리, CPU)
  - 상태 (Running/Stopped)
- [ ] 세션 생성 폼
  - 사용자명 (영문/숫자만)
  - 비밀번호
  - 메모리 제한 (MB)
  - CPU 제한 (코어 수)
  - TTL (Time To Live, 선택)
- [ ] 세션 삭제 버튼
- [ ] 세션 재시작 버튼

#### 2.1.2 샌드박스 환경
**URL Pattern:** `{username}.sandbox.qucord.com`

**접속 방법:**
```bash
ssh {username}@{username}.sandbox.qucord.com # 비밀번호 입력
```

**환경 스펙:**
- [ ] Ubuntu 22.04 기반 컨테이너
- [ ] Zsh 자동 실행
- [ ] 기본 개발 도구 설치
  - git, curl, wget, vim, nano
  - Node.js, Python3, Bun
- [ ] 사용자 홈 디렉토리 격리
- [ ] sudo 권한 제한 (apt 설치만 허용)
- [ ] 리소스 제한 적용
  - 메모리 제한
  - CPU 제한
  - 디스크 I/O 제한 (선택)

#### 2.1.3 격리 및 보안
- [ ] Podman 컨테이너 기반 완전 격리
- [ ] 사용자별 독립된 네트워크 네임스페이스
- [ ] 호스트 시스템 접근 차단
- [ ] 컨테이너 간 통신 차단

#### 2.1.4 자동화
- [ ] Cloudflare DNS 자동 등록/삭제
- [ ] SSH 포트 자동 할당 (2200-2299 범위)
- [ ] TTL 만료 시 자동 종료 (선택)
- [ ] 크론잡으로 Stopped 컨테이너 정리

---

### 2.2 Future Features (v2)

- [ ] 사용자 자가 등록 (초대 코드)
- [ ] 세션 일시정지/재개
- [ ] 리소스 사용량 그래프 (실시간)
- [ ] 세션 활동 로그
- [ ] 파일 다운로드/업로드 (웹)
- [ ] 웹 터미널 (브라우저에서 접속)
- [ ] Discord 알림 (세션 생성/만료)
- [ ] 사용자별 커스텀 Docker 이미지

---

## 3. 기술 스택

### 3.1 Backend
- **Runtime:** Bun
- **Framework:** Elysia.js
- **Database:** PostgreSQL
- **Container:** Podman
- **DNS:** Cloudflare API

### 3.2 Frontend
- **Framework:** Vite + Svelte
- **Styling:** Tailwind CSS
- **UI Library:** shadcn/ui
- **State:** Svelte Sandard Presets

### 3.3 Infrastructure
- **Host:** Raspberry Pi 5 (8GB)
- **OS:** Raspberry Pi OS Lite
- **Reverse Proxy:** Nginx Proxy Manager
- **Tunnel:** Cloudflare Tunnel
- **Domain:** qucord.com

---

## 4. 시스템 아키텍처
```
┌─────────────────────────────────────────────┐
          Cloudflare Tunnel                  │
│  (sandbox.qucord.com, *.sandbox.qucord.com) │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│       Nginx Proxy Manager                   │
│  - sandbox.qucord.com → :3000               │
│  - *.sandbox.qucord.com → SSH routing       │
└──────────────────┬──────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
┌───────▼─────────┐  ┌────────▼────────────────┐
│   Dashboard     │  │  Podman Containers      │
│   (Next.js)     │  │                         │
│   Port 3000     │  │  sandbox-user1 :2201    │
│                 │  │  sandbox-user2 :2202    │
│  - Session CRUD │  │  sandbox-user3 :2203    │
│  - Podman API   │  │  ...                    │
│  - CF DNS API   │  │                         │
└─────────────────┘  └─────────────────────────┘
```

---

## 5. 데이터 모델

### 5.1 Session
```typescript
interface Session {
  id: string;              // UUID
  username: string;        // 영문/숫자, unique
  password: string;        // hashed
  subdomain: string;       // {username}.sandbox.qucord.com
  sshPort: number;         // 2200-2299
  containerName: string;   // sandbox-{username}
  
  // 리소스 제한
  memoryLimit: number;     // MB
  cpuLimit: number;        // 코어 수 (0.5, 1, 2...)
  
  // 메타데이터
  status: 'running' | 'stopped' | 'paused';
  createdAt: Date;
  expiresAt: Date | null;  // TTL 설정 시
  lastAccessedAt: Date;
}
```

---

## 6. API 명세

### 6.1 대시보드 인증
```
POST /api/auth/login
Body: { password: string }
Response: { token: string }
```

### 6.2 세션 관리

#### 세션 목록 조회
```
GET /api/sessions
Headers: { Authorization: Bearer {token} }
Response: { sessions: Session[] }
```

#### 세션 생성
```
POST /api/sessions
Headers: { Authorization: Bearer {token} }
Body: {
  username: string;
  password: string;
  memoryLimit: number;
  cpuLimit: number;
  ttl?: number; // seconds
}
Response: {
  session: Session;
  sshCommand: string;
}
```

#### 세션 삭제
```
DELETE /api/sessions/:username
Headers: { Authorization: Bearer {token} }
Response: { success: boolean }
```

#### 세션 재시작
```
POST /api/sessions/:username/restart
Headers: { Authorization: Bearer {token} }
Response: { success: boolean }
```

#### 세션 상태 조회
```
GET /api/sessions/:username/stats
Response: {
  memoryUsage: number; // MB
  cpuUsage: number;    // %
  uptime: number;      // seconds
}
```

---

## 7. 구현 우선순위

### Phase 1: MVP (1주)
1. Podman 컨테이너 베이스 이미지 생성
2. 대시보드 백엔드 (Elysia + Bun)
   - 세션 CRUD API
   - Podman 명령어 실행
3. 대시보드 프론트엔드 (SvelteKit)
   - 로그인
   - 세션 목록/생성/삭제
4. Cloudflare DNS API 연동
5. 로컬 테스트

### Phase 2: 배포 (2-3일)
1. Cloudflare Tunnel 설정
2. Nginx Proxy Manager 설정
3. SSH 라우팅 설정
4. 프로덕션 배포

### Phase 3: 안정화 (1주)
1. 에러 핸들링
2. 로깅
3. TTL 자동 정리 크론잡
4. 리소스 모니터링

### Phase 4: 개선 (추후)
- Future Features 구현

---

## 8. 제약사항 및 고려사항

### 8.1 리소스 제약
- Raspberry Pi 5 8GB 메모리
- 동시 세션 수 제한 권장: 10개 이하
- 세션당 최대 메모리: 512MB
- 세션당 최대 CPU: 0.5 core

### 8.2 보안
- 대시보드 접근은 Tailscale 망 내에서만
- SSH는 Cloudflare Tunnel 통해 외부 노출 가능
- 비밀번호는 bcrypt 해싱
- 세션 토큰은 httpOnly 쿠키

### 8.3 네트워크
- SSH 포트 범위: 2200-2299 (최대 100개 세션)
- Cloudflare Tunnel은 SSH 프로토콜 지원
- 서브도메인 wildcard CNAME 설정 필요

---

## 9. 성공 지표

- [ ] 세션 생성부터 SSH 접속까지 30초 이내
- [ ] 대시보드 응답 시간 < 500ms
- [ ] 컨테이너 시작 시간 < 5초
- [ ] 동시 5개 세션 안정적 운영

---

## 10. 참고 자료

### 10.1 비슷한 프로젝트
- Gotty: https://github.com/yudai/gotty
- Warpgate: https://github.com/warp-tech/warpgate
- Teleport: https://goteleport.com

### 10.2 기술 문서
- Podman API: https://docs.podman.io/en/latest/
- Cloudflare API: https://developers.cloudflare.com/api/
- Elysia: https://elysiajs.com


