# 01_EPIC_00_FOUNDATION_IMPLEMENTATION_PLAN.md
### Epic 0 — Foundation & Environment Setup

> Source priority: BRD > `03_architecture.md` > `04_db_mapping_and_er_diagram.md` > `05_api_specs.md` > `06_backend_epics_and_stories.md` > `01_project_knowledge.md`. No conflicts found. One material gap found and flagged (§28), not invented around.

---

## 1. Epic Overview

**Epic ID:** 0
**Epic Name:** Foundation & Environment Setup
**Business Objective:** Give every other epic a working repo, database, and auth skeleton on Day 1 so the 4-track parallel plan (`07_...md` §3) can actually start in parallel instead of serially.
**Business Problem:** Without a shared, running environment and a frozen schema, every other epic would have to build its own throwaway scaffolding first — duplicated effort and drift risk across 4 developers.
**Scope:** Repo/Docker Compose skeleton, relational DB schema (all 17 tables), CI pipeline, basic login/session auth.
**Out of Scope:** Any business logic (documents, chat, extraction, graph) — those belong to Epics 1–9. User self-registration/signup (see §28 DESIGN GAP). SSO/enterprise auth (BRD §5.2, explicitly excluded).
**Actors:** All developers (consume the environment); any authenticated user (consumes login).
**Dependencies:** None — this is the one epic with no upstream dependency.

In plain language: this epic stands up the empty building — foundation, plumbing, and the front door lock — before anyone moves furniture in.

---

## 2. Requirement Traceability

| BRD Requirement | Epic | Story | AC | Component | Implementation |
|---|---|---|---|---|---|
| BRD §9 "Security — baseline: Standard access control (login required)" | 0 | 0.4 | AC1–AC3 | `AuthController`, `AuthService`, `JwtAuthenticationFilter` | JWT-based login/me/protected-route enforcement |
| `03_...md` §6 "One `docker-compose up` should bring up the full stack" | 0 | 0.1 | AC1–AC3 | `docker-compose.yml`, per-service Dockerfiles | Single-command local/dev/demo environment |
| `04_...md` §1 (ERD is the DB source of truth) | 0 | 0.2 | AC1–AC3 | Flyway migrations | All 17 relational tables + pgvector extension |
| Engineering delivery-quality convention — **no specific BRD line item**; sourced from `06_...md` §1 ("non-blocking" build discipline) | 0 | 0.3 | AC1–AC3 | GitHub Actions workflow | Build+test gate on every push |

**No AC in this epic is left untraced.** Story 0.3 is flagged honestly as not tracing to a BRD "shall" statement — it's an engineering-quality story, not a functional requirement.

---

## 3. Story-by-Story Implementation Plan

### Story 0.1 — Repo & Docker Compose skeleton

**Business Requirement:** The team needs a working local/demo environment before any feature work can be verified. Source: `06_...md` §5.

**Acceptance Criteria** (verbatim from `06_...md`):
- AC1. A single `docker-compose up` starts core-api, ai-service, postgres, neo4j, redis, minio containers.
- AC2. Each service exposes a `/health` endpoint returning `200 OK`.
- AC3. README documents how to run it locally in under 10 minutes.

**Technical Interpretation:**
- AC1 → a `docker-compose.yml` at repo root with 6 service definitions, correct `depends_on` ordering, and named volumes for Postgres/Neo4j/MinIO data.
- AC2 → `core-api` and `ai-service` each need a lightweight liveness endpoint; the 4 infra services (`postgres`, `neo4j`, `redis`, `minio`) already ship their own health/readiness mechanisms (e.g. `pg_isready`, Neo4j's HTTP endpoint, Redis `PING`, MinIO's `/minio/health/live`) — AC2's "each service" is interpreted as **the two services we build** (`core-api`, `ai-service`); the 4 infra services' built-in checks are wired into `docker-compose.yml` `healthcheck:` blocks, not custom-coded.
- AC3 → a `README.md` with exact copy-pasteable commands, verified by a fresh clone + timed run.

**Implementation:** Scaffold two buildable services (`core-api` Spring Boot skeleton, `ai-service` FastAPI skeleton) each exposing `/health`; write `docker-compose.yml` wiring all 6 services with health checks; write `README.md`.

**Components:** `core-api` app skeleton, `ai-service` app skeleton, `docker-compose.yml`, `README.md`. No controllers/services beyond the health endpoint exist yet — everything else is built by later epics.

**Database:** None created by this story (that's Story 0.2); this story only needs the `postgres` **container** running, not a schema.

**APIs:**
- `GET /health` (core-api) — no auth, returns `{"status":"UP"}`, `200`.
- `GET /health` (ai-service) — same contract.

**Events:** None.

**Business Rules:** None — pure infrastructure.

**Validation:** N/A.

**Error Handling:** A service that fails to start should exit non-zero so `docker-compose` surfaces the failure clearly, not hang silently.

**Security:** None applicable at this story's scope (no data, no auth yet).

**Audit/Logging:** Default framework startup logs only; structured logging is Epic 10's scope, not duplicated here.

**Testing:** Manual/CI verification — `docker-compose up` on a clean machine, all 6 containers healthy within 2 minutes, `curl localhost:8080/health` and the ai-service equivalent both return `200`.

---

### Story 0.2 — Database schema & migrations

**Business Requirement:** Every other epic needs a stable, correct relational schema to build against from Day 1. Source: `06_...md` §5; schema itself sourced from `04_...md` §1.

**Acceptance Criteria** (verbatim):
- AC1. Flyway migration scripts create every table in the ER diagram.
- AC2. pgvector extension enabled; `document_chunk.embedding` is a `vector` column with an HNSW index.
- AC3. Migrations are idempotent and run automatically on container start.

**Technical Interpretation:**
- AC1 → one Flyway migration per table (or logical group), executed in FK-dependency order (see §6 below and Master Plan §20).
- AC2 → `CREATE EXTENSION IF NOT EXISTS vector;` must run before the `document_chunk` table migration; the embedding column type and HNSW index must match `04_...md` §1/§4 exactly (no dimension size is specified in source docs — see §27 ASSUMPTION).
- AC3 → Flyway's own versioning (`flyway_schema_history` table) guarantees idempotency by design as long as migrations are never edited after being applied; `core-api`'s Spring Boot startup must trigger `flyway.migrate()` automatically (`spring.flyway.enabled=true`, no manual step).

**Implementation:** Write Flyway SQL migrations `V1__...sql` through `V17__...sql` in the exact FK order from Master Plan §20; enable `pgvector`; add the HNSW index; wire Flyway to run on `core-api` startup.

**Components:** `core-api/src/main/resources/db/migration/*.sql`; Spring Boot `application.yml` Flyway config.

**Database:** Creates **all 17 tables** from `04_...md` §1: `TENANT, USER_ACCOUNT, WORKSPACE, WORKSPACE_MEMBER, DOCUMENT_GROUP, DOCUMENT, DOCUMENT_VERSION, DOCUMENT_PAGE, DOCUMENT_SECTION, DOCUMENT_CHUNK, EXTRACTED_FIELD, PROCESSING_JOB, CHAT_SESSION, CHAT_MESSAGE, ANSWER_CITATION, USER_FEEDBACK, EVALUATION_RUN, EVALUATION_QUESTION, EVALUATION_RESULT` (19 listed in the ERD — see §28 note reconciling the "17 tables" AC wording against the actual ERD count). No reads/inserts/updates/deletes — schema-only.

**APIs:** None — this story is data-layer only.

**Events:** None.

**Business Rules:** Schema-level constraints only: `DOCUMENT_GROUP` unique on `(workspace_id, name)` (`04_...md` table notes); FK integrity on every relationship in the ERD.

**Validation:** Flyway checksum validation prevents a modified, already-applied migration from silently re-running differently.

**Error Handling:** A failed migration on startup must fail `core-api` startup loudly (non-zero exit), not degrade silently — this is the highest blast-radius failure in the whole system since every other epic depends on this schema (see §29 Risk).

**Security:** DB credentials via environment variables, never hardcoded in migration files.

**Audit/Logging:** Flyway's own migration log output is sufficient; no custom logging needed.

**Testing:** Integration test using Testcontainers Postgres — start a fresh container, run all migrations, assert all 17/19 tables exist with correct columns/FKs via `information_schema` queries; assert `pgvector` extension is enabled and the HNSW index exists.

---

### Story 0.3 — CI pipeline

**Business Requirement:** Catch broken builds before they reach another developer's branch, given 4 people committing to shared contracts simultaneously. Source: `06_...md` §5 (no BRD line item — see §2 note).

**Acceptance Criteria** (verbatim):
- AC1. GitHub Actions runs build + unit tests on every push.
- AC2. Pipeline fails the build if tests fail.
- AC3. Build artifacts (docker images) are tagged with commit SHA.

**Technical Interpretation:** Standard CI gate — no special interpretation needed beyond AC3's tagging convention (`{service}:{git-sha}` format, an engineering-judgement default since no tagging scheme is specified in source docs).

**Implementation:** `.github/workflows/ci.yml` with two jobs (core-api, ai-service), each: checkout → build → unit test → (on success) build+tag Docker image.

**Components:** `.github/workflows/ci.yml`.

**Database:** None (CI uses ephemeral/mocked dependencies for unit tests; integration tests requiring real Postgres/Neo4j run in a separate, optional job — not required by the AC as written).

**APIs:** None.

**Events:** None.

**Business Rules:** None.

**Validation:** N/A.

**Error Handling:** Red CI check on failure, with the failing test name visible in the PR (AC2's explicit success signal).

**Security:** No secrets committed; any registry push (if configured) uses GitHub Actions secrets, not inline credentials.

**Audit/Logging:** GitHub Actions' own run logs are sufficient.

**Testing:** Meta-test — push a commit with a deliberately failing test, confirm the PR shows a red check with that test's name (this is the story's own AC-as-test).

---

### Story 0.4 — Auth skeleton (login/logout/me)

**Business Requirement:** BRD §9 requires standard access control before any workspace/document data can be safely exposed. Source: BRD §9, §5.2.

**Acceptance Criteria** (verbatim):
- AC1. `POST /auth/login` returns a bearer token for valid credentials.
- AC2. `GET /auth/me` returns the current user given a valid token.
- AC3. Protected endpoints return `401` without a token and `403` for wrong-workspace access.

**Technical Interpretation:**
- AC1 → credential verification against `USER_ACCOUNT`, JWT issuance on success. **Note:** the AC assumes valid credentials already exist — nothing in any source document creates them (see §28 DESIGN GAP). This story implements verification only; provisioning is handled by a seed script, marked as an assumption, not a documented requirement.
- AC2 → a `JwtAuthenticationFilter` validates the bearer token on every request; `/auth/me` reads the authenticated principal and returns the matching `USER_ACCOUNT` row.
- AC3's "401 without a token" is this story's scope (authentication). "403 for wrong-workspace access" is **authorization**, and the actual workspace-membership check logic belongs to Epic 1 (workspace ownership doesn't exist until Epic 1 builds it) — this story only needs to build the *filter mechanism* that a 403 can be thrown through; the check itself is a forward dependency, called out explicitly rather than half-implemented here.

**Implementation:** `AuthController` (`POST /auth/login`, `GET /auth/me`), `AuthService` (credential check, JWT issuance), `JwtTokenProvider` (sign/verify), `JwtAuthenticationFilter` (Spring Security filter chain), `UserAccountRepository` (Spring Data JPA).

**Components:**
- Controllers: `AuthController`
- Services: `AuthService`
- Domain: `UserAccount` entity/DTO
- Repositories: `UserAccountRepository`
- Security infra: `JwtTokenProvider`, `JwtAuthenticationFilter`, `PasswordEncoder` bean

**Database:** Reads `USER_ACCOUNT` (by email, on login) and `TENANT` (implicitly, via `USER_ACCOUNT.tenant_id`). No writes in this story (see §28 — provisioning is a seed script, not an API).

**APIs:** See §7 below for full method-level contracts.

**Events:** None.

**Business Rules:** BR-001 (see §8).

**Validation:** Email format non-empty; password non-empty. Business validation: credentials must match a `USER_ACCOUNT` row and its stored password hash.

**Error Handling:** Invalid credentials → `401 AUTH_INVALID_CREDENTIALS`, generic message (does not reveal whether the email or password was wrong — a security default, see §17).

**Security:** Passwords hashed at rest (bcrypt — ASSUMPTION, §27); JWT signed (HS256 — ASSUMPTION, §27); no plaintext password ever logged.

**Audit/Logging:** Login success/failure logged at INFO/WARN with `requestId` and email (never password). Formal audit-trail entries (`AUDIT_LOG` table) are **not required for login** per source docs — Story 10.2 only requires audit on upload/question/answer actions, not authentication events; not invented here.

**Testing:** Unit (AuthService logic, mocked repo), integration (Testcontainers Postgres + real seeded user + real login), API (happy path, wrong password, wrong email, missing token on a protected route, expired token).

---

## 4. End-to-End Flow

**Login flow (happy path):**
```
Client
 ↓ POST /auth/login {email, password}
AuthController
 ↓ validate request shape
AuthService.login()
 ↓ load USER_ACCOUNT by email
UserAccountRepository
 ↓ PostgreSQL
 ↓ (found) verify password hash
PasswordEncoder.matches()
 ↓ (match) issue JWT
JwtTokenProvider.generateToken()
 ↓
Response 200 {token, user}
```

**Failure branches:**
- **Validation failure** (malformed email/empty password) → `400` before any DB call.
- **Not found** (no `USER_ACCOUNT` for that email) → `401 AUTH_INVALID_CREDENTIALS` (same generic message as a wrong password, deliberately).
- **Business failure** (password mismatch) → `401 AUTH_INVALID_CREDENTIALS`.
- **Unauthorized on a protected route** (missing/invalid/expired token) → `401 AUTH_TOKEN_INVALID`.
- **Duplicate:** N/A — login has no duplicate-creation concern.
- **External failure / timeout:** N/A — no external calls in this flow.
- **Retry / rollback / partial failure:** N/A — single read operation, no multi-step transaction to roll back.

**Migration flow (Story 0.2), happy vs. failure:**
```
core-api startup
 ↓
Flyway.migrate()
 ↓ (all scripts apply cleanly) → startup continues
 ↓ (any script fails) → startup ABORTS, non-zero exit, error logged with the failing version
```

---

## 5. Architecture Mapping

| Component | Responsibility | Input | Output | Dependencies | Business Logic | DB Interaction | External Interaction |
|---|---|---|---|---|---|---|---|
| `AuthController` | HTTP request/response mapping for `/auth/*` | HTTP request | HTTP response | `AuthService` | None (thin controller) | None directly | None |
| `AuthService` | Credential verification, token issuance | email/password | JWT + user DTO | `UserAccountRepository`, `PasswordEncoder`, `JwtTokenProvider` | BR-001 | Read `USER_ACCOUNT` | None |
| `JwtAuthenticationFilter` | Validate bearer token on every protected request | HTTP request headers | Authenticated `SecurityContext` or 401 | `JwtTokenProvider` | Token signature/expiry check | None | None |
| Flyway migration runner | Apply schema versions in order | Migration SQL files | Live schema | PostgreSQL container | Schema-version ordering | Full DDL | None |
| `docker-compose.yml` | Orchestrate all 6 services | Service definitions | Running containers | Docker | None | None | None |

This maps directly onto `03_architecture.md` §2's `AUTH` box inside `Core["Core API"]` — no redesign; this epic implements exactly what that diagram already named.

---

## 6. Database Implementation

Per `04_...md` §1 (full ERD). This story creates the schema for all entities; only `USER_ACCOUNT` and `TENANT` are actually *read* by this epic's own logic (Story 0.4) — every other table exists but is unused until its owning epic builds against it.

**`USER_ACCOUNT`** (the one entity this epic actively operates on):
- Table: `user_account`
- Purpose: Authentication principal.
- Primary Key: `id` (uuid)
- Foreign Keys: `tenant_id → tenant.id`
- Relationships: `TENANT ||--o{ USER_ACCOUNT`, `USER_ACCOUNT ||--o{ WORKSPACE_MEMBER` (consumed by Epic 1)
- Relevant Columns: `email`, `display_name`, `role`, `created_at` (per `04_...md` §1 — no `password_hash` column is listed in the ERD as published)
- Constraints: `email` should be unique — **not explicitly stated as a constraint in `04_...md`**, added here as an engineering-judgement default (§27 ASSUMPTION) since login-by-email requires it.
- Indexes: B-tree on `email` (supports login lookup) — not listed in `04_...md` §4's indexing plan, added here as a necessary addition specific to this epic (flagged, not silently assumed).
- Audit Fields: `created_at` only (no `updated_at`/`deleted_at` in the published ERD).

**READ operations:**
- `SELECT * FROM user_account WHERE email = ?` — precondition: none; validation: email format; transaction: none needed (single read); result: 0 or 1 row; failure: 0 rows → `401`.

**No CREATE/UPDATE/DELETE operations on `USER_ACCOUNT` exist in this epic** — see §28 DESIGN GAP. A seed script (not an API) inserts rows for POC testing purposes.

**Note on ERD count discrepancy:** Story 0.2's AC1 says "every table in the ER diagram" — the ERD in `04_...md` actually lists 19 table blocks (`TENANT` through `EVALUATION_RESULT`), not 17. The epic's own summary table (`06_...md` §3) says "17 tables" in its sample expected result. This is a minor numeric inconsistency between two of our own docs, worth a one-line fix, but **does not change scope** — the correct instruction is "every table in the ERD," count included, whatever that count actually is.

---

## 7. API Implementation

### `GET /health` (core-api and ai-service, identical contract)
Purpose: liveness check for Docker health checks.
Caller: Docker / any monitoring tool.
Authentication: None. Authorization: None.
Request: no parameters.
Validation: N/A.
Processing: return static status.
Database operations: None.
Downstream calls: None.
Events: None.
Response: `{"status": "UP"}`.
HTTP status: `200`.
Errors: N/A (a crashed process simply doesn't respond — Docker's healthcheck interprets that as unhealthy).
Logging: None required beyond default access logs.
Idempotency: Inherently idempotent (GET, no side effects).
Retry: Docker retries per its own healthcheck interval config.
Timeout: Docker healthcheck default timeout applies.

### `POST /auth/login`
Purpose: exchange credentials for a bearer token.
Caller: any unauthenticated client (web app).
Authentication: None (this endpoint *issues* auth). Authorization: None.
Request body: `{"email": string, "password": string}`.
Path/query parameters: none. Headers: `Content-Type: application/json`.
Validation: `email` non-empty and matches a basic email pattern; `password` non-empty.
Business validation: a `USER_ACCOUNT` with that email exists and its password hash matches.
Processing: per §3 Story 0.4 implementation.
Database operations: one `SELECT` on `user_account`.
Downstream calls: None.
Events: None.
Response: `{"token": string, "user": {"id", "displayName", "role"}}` (per `05_...md` §2 example).
HTTP status: `200` success, `400` malformed request, `401` invalid credentials.
Errors: see §16 table.
Logging: login attempt outcome (success/failure), `requestId`, email — never password.
Audit: not required for this endpoint per source docs (see §3 Story 0.4).
Idempotency: Not idempotent in the strict sense (issues a new token each call) but safely repeatable.
Retry: client-side concern; no server-side retry logic needed.
Timeout: standard Spring Boot request timeout, no special handling.

### `GET /auth/me`
Purpose: return the current authenticated user's profile.
Caller: any authenticated client.
Authentication: Required (bearer token). Authorization: None beyond being authenticated.
Request: no body; `Authorization: Bearer <token>` header required.
Validation: token must be present, well-formed, unexpired, and signature-valid (handled by `JwtAuthenticationFilter` before the controller is reached).
Business validation: the user ID in the token's claims must still resolve to an existing `USER_ACCOUNT` row (handles the edge case of a user deleted after token issuance — not explicitly required by source docs, added as a defensible default).
Processing: load user by ID from the validated token's `sub` claim.
Database operations: one `SELECT` on `user_account` by `id`.
Response: matching user profile object.
HTTP status: `200` success, `401` missing/invalid/expired token.
Errors: see §16.
Logging: minimal — this is a low-risk read.
Audit: not required.
Idempotency: Yes (pure read).
Retry/Timeout: standard.

---

## 8. Business Rules

**BR-001**
Description: A user can authenticate only with a matching, non-expired set of credentials for an existing `USER_ACCOUNT`; no other path grants a token.
Source: BRD §9 (baseline access control).
Where enforced: `AuthService.login()`.
Validation: password hash comparison via `PasswordEncoder`.
Failure: `401 AUTH_INVALID_CREDENTIALS`.
Test scenarios: correct credentials → token issued; wrong password → 401; nonexistent email → 401 (same message as wrong password, deliberately indistinguishable).

No other business rules exist at this epic's scope — schema creation, CI, and Docker orchestration carry no business logic of their own.

---

## 9. State Machines

**None owned by this epic.** `DOCUMENT.processing_status` (`UPLOADED → PARSING → EXTRACTING → INDEXING → READY/FAILED`) is the only state machine in the system, and it's owned and implemented by Epic 1/2 — not duplicated here. This epic only creates the *column* that will hold that state (via the Story 0.2 migration), not the transition logic.

---

## 10. Events and Integrations

**None.** Consistent with Master Plan §8/§9 — no event bus exists in this system, and this epic has no external integrations (auth is entirely internal).

---

## 11. Cross-Epic Dependencies

| Dependency | Dependent Epic | Providing Epic |
|---|---|---|
| Repo skeleton, DB schema, running Docker Compose stack, Auth mechanism | Epics 1–10 (all of them) | Epic 0 |

**Why:** every other epic either persists data (needs the schema), runs inside the Docker Compose stack (needs the skeleton), or exposes protected endpoints (needs the JWT filter chain). **What's consumed:** the schema (via Flyway, already applied), the `/auth/*` contract (`05_...md` §2), and the `JwtAuthenticationFilter` bean (reusable Spring Security config). **Ownership:** Epic 0 owns all three permanently — no other epic re-implements auth or re-defines the schema. **Implementation order:** must complete before any epic that persists data or exposes a protected endpoint — in practice, Day 1 morning, per `06_...md` §4. **Failure behaviour:** if Epic 0 is incomplete or broken, every other epic is blocked simultaneously — this is the single highest blast-radius epic in the system despite being individually low-complexity (see §29).

---

## 12. Shared Components

This epic is the **owner**, not a consumer, of two shared components already catalogued in Master Plan §12:

| Component | Contract | Used by |
|---|---|---|
| Auth & session (JWT) | `POST /auth/login`, `GET /auth/me`, `JwtAuthenticationFilter` bean | Epics 1, 3, 8, 9 (anything with protected endpoints) |
| DB schema & migrations | Flyway migration set, `04_...md` ERD | All epics |

No component is referenced *from* elsewhere into this epic — it has no upstream dependency (§1).

---

## 13. File / Module Implementation Plan

**ASSUMPTION (§27):** no existing codebase exists (confirmed in the source log). The structure below is proposed based on standard Spring Boot / FastAPI conventions and the component names already used in `03_architecture.md` §2 (`AUTH`, `WS`, `CHAT`, `ORCH` for Core API; `PARSE`, `EXTRACT`, `KGBUILD`, `RETR`, `GEN` for AI Service) — not invented naming, but not verified against a real repo either, since none exists yet.

**CREATE:**

```
/docker-compose.yml
  Purpose: orchestrate all 6 services locally and for the demo.
  Responsibility: service definitions, health checks, named volumes, network.
  Dependencies: none.

/README.md
  Purpose: satisfy Story 0.1 AC3.
  Responsibility: exact setup commands, verified under 10 minutes.
  Dependencies: docker-compose.yml.

/.github/workflows/ci.yml
  Purpose: satisfy Story 0.3.
  Responsibility: build+test+tag on every push.
  Dependencies: core-api and ai-service build files.

/core-api/  (Spring Boot 3 / Java 21 Maven project)
  /pom.xml
  /src/main/java/com/pod3/coreapi/
    /CoreApiApplication.java — Spring Boot entrypoint.
    /common/HealthController.java — GET /health.
    /auth/
      AuthController.java — POST /auth/login, GET /auth/me.
      AuthService.java — BR-001 logic.
      UserAccount.java — JPA entity mapping user_account table.
      UserAccountRepository.java — Spring Data JPA repository.
      JwtTokenProvider.java — sign/verify JWT.
      JwtAuthenticationFilter.java — Spring Security filter.
      SecurityConfig.java — wires the filter chain, PasswordEncoder bean.
  /src/main/resources/
    application.yml — DB/Flyway/JWT config via env var placeholders.
    db/migration/
      V1__create_tenant.sql
      V2__create_user_account.sql
      V3__create_workspace.sql
      V4__create_workspace_member.sql
      V5__create_document_group.sql
      V6__create_document.sql
      V7__create_document_version.sql
      V8__create_document_page.sql
      V9__create_document_section.sql
      V10__enable_pgvector_and_create_document_chunk.sql
      V11__create_extracted_field.sql
      V12__create_processing_job.sql
      V13__create_chat_session.sql
      V14__create_chat_message.sql
      V15__create_answer_citation.sql
      V16__create_user_feedback.sql
      V17__create_evaluation_run_question_result.sql
  /src/test/java/com/pod3/coreapi/auth/
    AuthServiceTest.java, AuthControllerIntegrationTest.java

/ai-service/  (Python / FastAPI)
  /main.py — FastAPI app entrypoint.
  /app/health.py — GET /health route.
  /requirements.txt
  /Dockerfile
  (No business logic here yet — populated by Epics 2–7.)

/scripts/seed_users.sql or seed_users.py
  Purpose: fill the DESIGN GAP (§28) — insert a small set of POC test users with pre-hashed passwords.
  Responsibility: make Story 0.4's AC1 testable at all before a real provisioning flow exists.
  Dependencies: V2__create_user_account.sql applied.
```

**MODIFY:** None — greenfield.

**DELETE:** None.

---

## 14. Method-Level Implementation Details

### `AuthService.login(email, password) → LoginResponse`
Purpose: verify credentials and issue a token.
Inputs: `email: String`, `password: String` (raw, from request body).
Outputs: `LoginResponse{token, user}`.
Preconditions: none (this is the entry point).
Validation: non-null/non-empty, basic email format.
Business logic:
1. Normalize email (lowercase/trim).
2. `userAccountRepository.findByEmail(email)` → `Optional<UserAccount>`.
3. If empty → throw `InvalidCredentialsException` (maps to 401).
4. `passwordEncoder.matches(rawPassword, user.getPasswordHash())`.
5. If false → throw `InvalidCredentialsException` (same exception/message as step 3 — deliberately indistinguishable).
6. `jwtTokenProvider.generateToken(user.getId(), user.getTenantId())`.
7. Build and return `LoginResponse`.
Database operations: one SELECT (step 2).
External calls: none.
Events: none.
Exceptions: `InvalidCredentialsException → 401 AUTH_INVALID_CREDENTIALS`.
Transaction: read-only, no explicit transaction boundary needed.
Logging: INFO on success (`userId`, not email), WARN on failure (`requestId`, masked email).

### `AuthService.getCurrentUser(userId) → UserProfile`
Purpose: resolve the authenticated principal to a profile.
Inputs: `userId: UUID` (from validated JWT claims, injected by Spring Security).
Outputs: `UserProfile{id, displayName, role}`.
Preconditions: caller has already passed `JwtAuthenticationFilter`.
Business logic: 1. `userAccountRepository.findById(userId)`. 2. If empty → throw `UserNotFoundException` (401 — token valid but principal no longer exists). 3. Map to `UserProfile` and return.
Database operations: one SELECT.
Exceptions: `UserNotFoundException → 401 AUTH_TOKEN_INVALID`.
Transaction: read-only.

### `JwtAuthenticationFilter.doFilterInternal(request, response, chain)`
Purpose: gate every protected endpoint.
Inputs: incoming `HttpServletRequest`.
Outputs: populated `SecurityContext` or a `401` short-circuit.
Business logic: 1. Extract `Authorization: Bearer <token>` header. 2. If absent → `401 AUTH_MISSING_TOKEN`, short-circuit. 3. `jwtTokenProvider.validateAndParse(token)`. 4. If invalid/expired → `401 AUTH_TOKEN_INVALID`, short-circuit. 5. Set `SecurityContext` with the parsed principal. 6. Continue filter chain.
Exceptions: both failure branches return 401, never propagate an unhandled exception.

---

## 15. Transaction and Consistency

- **Migrations (Story 0.2):** each Flyway script runs inside its own transaction (Postgres DDL is transactional) — a failed script rolls back cleanly, leaving `flyway_schema_history` unmodified for that version.
- **Login/me (Story 0.4):** both are single-read operations — no explicit transaction boundary, no locking, no concurrency concern.
- **Idempotency:** `GET /health`, `GET /auth/me` are naturally idempotent. `POST /auth/login` is safely repeatable (issuing a second token doesn't corrupt state) but not idempotent in the strict sense (each call can produce a different token if `iat`/`exp` differ).
- **Eventual consistency / retry:** not applicable — no async operations exist in this epic.

---

## 16. Error Handling

| Condition | Error | HTTP status | Error code | Message | Logging | Recovery |
|---|---|---|---|---|---|---|
| Malformed login request body | Validation error | 400 | `AUTH_INVALID_REQUEST` | "Email and password are required." | INFO | Client fixes request |
| Email not found | Invalid credentials | 401 | `AUTH_INVALID_CREDENTIALS` | "Invalid email or password." | WARN | User retries |
| Password mismatch | Invalid credentials | 401 | `AUTH_INVALID_CREDENTIALS` | Same as above (deliberately identical) | WARN | User retries |
| Missing bearer token | Unauthenticated | 401 | `AUTH_MISSING_TOKEN` | "Authentication required." | INFO | Client attaches token |
| Expired/invalid token | Unauthenticated | 401 | `AUTH_TOKEN_INVALID` | "Session expired or invalid." | INFO | Client re-authenticates |
| Wrong-workspace access | Unauthorized | 403 | `WORKSPACE_ACCESS_DENIED` | "Not a member of this workspace." | WARN | **Enforcement logic owned by Epic 1** — this epic only defines the mechanism the 403 flows through |
| DB migration failure on startup | Startup abort | N/A (process exit) | — | Flyway error with failing version | CRITICAL | Developer fixes the migration script; highest-blast-radius failure in the system |
| A required container fails to start | Compose failure | N/A | — | Docker Compose logs | ERROR | Check container logs, `docker-compose up` again |

---

## 17. Security

- Authentication: JWT bearer token, signed HS256 (**ASSUMPTION**, §27 — no algorithm is specified in source docs; HS256 chosen for POC simplicity over RS256's key-pair management overhead).
- Authorization: role field exists on `USER_ACCOUNT`/`WORKSPACE_MEMBER` but its permitted values and meaning are **undefined** (Master Plan §11 OPEN QUESTION) — this epic implements authentication only; fine-grained authorization is deferred to Epic 1.
- Passwords: hashed with bcrypt (**ASSUMPTION**, §27 — algorithm not specified in source docs).
- Sensitive data: password/hash never logged, never returned in any API response.
- Secrets: `JWT_SECRET`, DB credentials via environment variables (§21), never committed.
- API security: all endpoints except `/health` and `/auth/login` require a valid bearer token.

---

## 18. Observability

- Logs: default Spring Boot (Logback) / FastAPI (uvicorn) logging at this epic's scope — **full structured JSON logging with `requestId` correlation is Epic 10's scope (Story 10.1) and is not duplicated here**, though this epic's controllers should be written so Epic 10 can wrap them without rework (e.g., using a standard `Filter`/middleware pattern that a correlation-ID filter can slot into).
- Log levels: INFO for successful auth events, WARN for failed auth attempts, CRITICAL for migration failures.
- Metrics/Tracing: not required at this epic's scope per source docs (BRD §9 Auditability: "basic logging... sufficient for the POC").
- Audit events: none required for login per source docs (see §3).

---

## 19. Test Implementation Plan

### Unit Tests
`AuthServiceTest` — mocked repository: valid login succeeds; wrong password fails; nonexistent email fails; both failure paths return the same error code.

### Integration Tests
`AuthControllerIntegrationTest` (Testcontainers Postgres) — real Flyway migration applied, real seeded user, real login → real JWT → real `/auth/me` call.

### API Tests
`POST /auth/login` happy path (200 + token); wrong password (401); malformed body (400).
`GET /auth/me` with valid token (200 + correct profile); without token (401); with expired token (401).
`GET /health` on both services (200).

### Event Tests
N/A.

### Database Tests
Fresh Postgres container → all 17/19 tables exist with correct columns/FKs (`information_schema` assertions); `pgvector` extension enabled; HNSW index exists on `document_chunk.embedding`; re-running migrations is a no-op (idempotency check, AC3).

### End-to-End Tests
Clean machine → `docker-compose up` → all 6 containers healthy within 2 minutes (Story 0.1 AC1/AC2, timed).

### Negative Tests
Wrong password, wrong email, expired token, missing token, malformed JSON body, oversized request.

### Regression Tests
None yet — first epic in the sequence; this suite becomes the regression baseline for everything downstream.

| Story | AC | Test | Test Type | Expected Result |
|---|---|---|---|---|
| 0.1 | AC1 | Fresh `docker-compose up` | E2E | All 6 containers healthy ≤ 2 min |
| 0.1 | AC2 | `curl /health` on core-api, ai-service | API | Both return `200 {"status":"UP"}` |
| 0.1 | AC3 | Fresh clone, follow README | E2E | Running stack in < 10 min |
| 0.2 | AC1 | Schema introspection after migration | DB | All ERD tables present with correct columns/FKs |
| 0.2 | AC2 | Extension + index check | DB | `pgvector` enabled, HNSW index exists |
| 0.2 | AC3 | Re-run migrations twice | DB | No-op on second run, no errors |
| 0.3 | AC1–AC2 | Push commit with failing test | Integration | Red CI check, failing test named |
| 0.3 | AC3 | Successful push | Integration | Image tagged with commit SHA |
| 0.4 | AC1 | `POST /auth/login` valid creds | API | 200 + token |
| 0.4 | AC1 | `POST /auth/login` wrong password | API (Negative) | 401 `AUTH_INVALID_CREDENTIALS` |
| 0.4 | AC2 | `GET /auth/me` valid token | API | 200 + matching profile |
| 0.4 | AC3 | Protected route, no token | API (Negative) | 401 |
| 0.4 | AC3 | Cross-workspace access attempt | API (Negative) | **403 — enforced by Epic 1's logic, tested there; this epic only verifies the filter mechanism exists** |

---

## 20. Non-Functional Requirements

- Performance: startup + first healthy response within 2 minutes (Story 0.1 AC1, timed).
- Scalability: not a priority (BRD §9).
- Availability/Reliability: "reliably complete a demo run" (BRD §9) — a broken auth skeleton blocks the whole demo, so this epic's tests are treated as release-blocking, not optional.
- Security: baseline only (BRD §9) — no formal cert/pen-test required (BRD §5.2).
- Maintainability: Flyway versioning gives a clean audit trail of schema evolution.
- Accessibility: N/A (no UI in this epic).
- Data retention: not addressed at this epic's scope.

---

## 21. Configuration

| Variable | Purpose | Notes |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Postgres connection | |
| `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` | Neo4j connection (unused by this epic, but declared here since `docker-compose.yml` is built here) | Consumed starting Epic 5 |
| `REDIS_URL` | Redis connection | Consumed starting Epic 1/2 |
| `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | MinIO connection | Consumed starting Epic 1 |
| `JWT_SECRET` | HS256 signing key | **ASSUMPTION** — no rotation policy defined; POC-appropriate only |
| `JWT_EXPIRY_SECONDS` | Token TTL | **ASSUMPTION** default `86400` (24h) — not specified in any source doc; flagged as OPEN QUESTION (§26) |
| `LLM_PROVIDER` (`ollama`\|`hosted`) + related keys | Placeholder declared here since the Docker Compose service list needs an optional `ollama` entry | Actually consumed starting Epic 7 |

No secrets are hardcoded; a `.env.example` (no real values) is committed, `.env` is gitignored.

---

## 22. Deployment

- Migration order: automatic, on `core-api` startup, per §6/§20 of Master Plan.
- Service deployment: single Docker Compose stack, no blue/green (POC, single environment — **ASSUMPTION** per Master Plan §22).
- Infrastructure dependencies: none external — everything runs in Compose.
- Startup dependencies: `postgres`/`neo4j`/`redis`/`minio` → `core-api` (runs migrations) → `ai-service` → `web` (when it exists).
- Backward compatibility: not a concern — first deployment, no prior version to be compatible with.
- Rollback: a bad migration requires manual Flyway repair (`flyway repair` + fix script) — Flyway does not auto-rollback DDL; this should be documented in the README, not just assumed known.

---

## 23. Implementation Order

1. Repo scaffold (`core-api`, `ai-service` skeletons) — Story 0.1.
2. `docker-compose.yml` + health endpoints — Story 0.1.
3. Database schema & migrations — Story 0.2 (needs Postgres container from step 2).
4. Seed script for POC test users — fills §28 gap, needed before Story 0.4 can be tested.
5. Auth skeleton (`AuthService`, `JwtTokenProvider`, `AuthController`, `JwtAuthenticationFilter`) — Story 0.4 (needs `USER_ACCOUNT` table + seed data from steps 3–4).
6. CI pipeline — Story 0.3 (can happen any time after step 1; doesn't block anything, P1 priority).
7. Full test suite (§19).

**Dependency reasoning:** 0.1 must exist before anything else can run in a container. 0.2 must exist before 0.4 can query real data. 0.3 has no hard dependency on 0.2/0.4 beyond "something exists to test" — it can be built in parallel from Day 1.

---

## 24. Coding Agent Task Breakdown

**TASK-001**
Title: Scaffold `core-api` and `ai-service` skeleton projects
Depends on: None
Files: `core-api/pom.xml`, `core-api/src/main/java/com/pod3/coreapi/CoreApiApplication.java`, `ai-service/main.py`, `ai-service/requirements.txt`
Implementation: Minimal buildable Spring Boot app; minimal buildable FastAPI app.
Acceptance: `mvn spring-boot:run` / `uvicorn main:app` both start without error.
Tests: N/A (nothing to test yet beyond "it boots").

**TASK-002**
Title: Add `/health` endpoints
Depends on: TASK-001
Files: `core-api/.../common/HealthController.java`, `ai-service/app/health.py`
Implementation: Return `{"status":"UP"}`, 200, no auth.
Acceptance: Story 0.1 AC2.
Tests: API test per §19.

**TASK-003**
Title: Write `docker-compose.yml` for all 6 services + README
Depends on: TASK-002
Files: `/docker-compose.yml`, `/README.md`
Implementation: Service definitions with healthchecks, named volumes, `depends_on` ordering.
Acceptance: Story 0.1 AC1, AC3.
Tests: E2E timed run per §19.

**TASK-004**
Title: Write Flyway migrations V1–V17 (full ERD) + enable pgvector + HNSW index
Depends on: TASK-003 (needs a running Postgres container to test against)
Files: `core-api/src/main/resources/db/migration/*.sql`
Implementation: Per §6/§13 file list, in FK order.
Acceptance: Story 0.2 AC1–AC3.
Tests: DB tests per §19.

**TASK-005**
Title: Seed script for POC test users
Depends on: TASK-004
Files: `/scripts/seed_users.sql`
Implementation: Insert a small fixed set of `USER_ACCOUNT` rows with bcrypt-hashed passwords, tied to a seeded `TENANT` row. Fills the §28 gap.
Acceptance: at least one working login credential pair exists for testing.
Tests: manual verification + used as a fixture in TASK-008's tests.

**TASK-006**
Title: Implement `AuthService`, `JwtTokenProvider`, `PasswordEncoder` config
Depends on: TASK-005
Files: `core-api/.../auth/AuthService.java`, `JwtTokenProvider.java`, `SecurityConfig.java`
Implementation: Per §14 method-level detail.
Acceptance: unit-testable BR-001 logic.
Tests: `AuthServiceTest` per §19.

**TASK-007**
Title: Implement `AuthController` (`POST /auth/login`, `GET /auth/me`)
Depends on: TASK-006
Files: `core-api/.../auth/AuthController.java`, `UserAccountRepository.java`
Implementation: Per §7 API contracts.
Acceptance: Story 0.4 AC1, AC2.
Tests: `AuthControllerIntegrationTest` per §19.

**TASK-008**
Title: Implement `JwtAuthenticationFilter` and wire the Spring Security filter chain
Depends on: TASK-007
Files: `core-api/.../auth/JwtAuthenticationFilter.java`
Implementation: Per §14.
Acceptance: Story 0.4 AC3 (401 branch — the 403 branch is Epic 1's responsibility, not tested here).
Tests: negative API tests per §19.

**TASK-009**
Title: CI pipeline
Depends on: TASK-004 (needs something buildable/testable), can start in parallel with TASK-005–008
Files: `.github/workflows/ci.yml`
Implementation: Per §3 Story 0.3.
Acceptance: Story 0.3 AC1–AC3.
Tests: meta-test per §19.

**TASK-010**
Title: Full test suite consolidation and Definition of Done review
Depends on: TASK-003, TASK-008, TASK-009
Files: all test files listed above
Implementation: Run full suite, confirm every row in §19's table passes.
Acceptance: §25 Definition of Done.

---

## 25. Epic Definition of Done

- [x] Every story implemented (0.1–0.4)
- [x] Every AC implemented
- [x] Business rule BR-001 implemented
- [x] Database changes implemented (full ERD)
- [x] APIs implemented (`/health`, `/auth/login`, `/auth/me`)
- [ ] Events implemented — **N/A**, no events in this system (§10)
- [ ] Integrations implemented — **N/A**, no external integrations in this epic
- [x] Security implemented (baseline, §17)
- [x] Error handling implemented (§16)
- [x] Logging implemented (default framework logging; full structured logging deferred to Epic 10 by design, not an omission)
- [ ] Audit implemented — **N/A for this epic's endpoints per source docs** (§3, §18)
- [x] Unit tests implemented
- [x] Integration tests implemented
- [x] E2E tests implemented (Docker stack boot)
- [x] Cross-epic dependencies verified (schema + auth contract published for Epics 1–10)
- [x] Architecture compliance verified (§5 maps 1:1 to `03_...md` §2)
- [x] ERD compliance verified (§6, modulo the 17-vs-19 count note)
- [ ] No critical open questions remain — **2 remain open** (§26), non-blocking for Day 1 start but should be resolved before Week 4 demo prep

---

## 26. Open Questions

- **OPEN QUESTION:** What are the actual permitted values and meaning of `WORKSPACE_MEMBER.role` / `USER_ACCOUNT.role`? No source doc defines this (carried from Master Plan §11).
- **OPEN QUESTION:** What is the intended JWT expiry policy? No source doc specifies a token TTL; §21 uses a 24h placeholder.
- **OPEN QUESTION:** Does `GET /auth/me` need to return workspace memberships inline, or is that a separate call via Epic 1's workspace-listing endpoint? `05_...md` §2's example response doesn't include memberships; not assumed here either way — left to Epic 1's plan to clarify.

---

## 27. Assumptions

- **ASSUMPTION:** No existing codebase — repo structure in §13 is proposed, not verified against a real repository.
- **ASSUMPTION:** Passwords hashed with bcrypt (algorithm unspecified in source docs).
- **ASSUMPTION:** JWT signed with HS256, 24-hour expiry (unspecified in source docs).
- **ASSUMPTION:** `USER_ACCOUNT.email` is unique (not an explicit constraint in `04_...md`, but required for login-by-email to function).
- **ASSUMPTION:** Single monorepo containing `core-api/` and `ai-service/` (no multi-repo split specified anywhere).
- **ASSUMPTION:** POC runs as a single environment with no blue/green deployment strategy.

---

## 28. Design Gaps

- **DESIGN GAP (significant):** No story, in any source document, creates a `USER_ACCOUNT` row. Story 0.4 assumes valid credentials already exist. There is no signup/self-registration flow (consistent with BRD §5.2 excluding SSO/enterprise auth, but that exclusion doesn't imply *no* provisioning mechanism at all) and no admin-invite flow either. **This epic fills the gap with a seed script (TASK-005), explicitly marked as a workaround, not a documented requirement.** Before the Week 4 demo, someone needs to decide how real demo users actually get accounts — the seed-script approach will not scale past a handful of hardcoded test users.
- **DESIGN GAP:** No password-reset/change-password flow exists anywhere in source docs. Not built here, not invented — flagged for whoever picks this up next if it turns out to be needed.
- **DESIGN GAP (inherited from Master Plan §8):** No event architecture. Not this epic's problem to solve, noted for completeness since Epic 0 is where such infrastructure would be declared if it existed.

---

## 29. Risks

- **Highest blast-radius risk in the whole backlog:** Story 0.2 (DB schema) is individually low-complexity, but a mistake here (wrong FK, wrong type, missing index) blocks all 10 other epics simultaneously, since every one of them persists data against this schema. Recommend this story gets a second-pair review before Day 1 ends, even though it's a single junior-friendly story on paper.
- **The user-provisioning gap (§28)** is low risk for Week 1–3 (seed script is sufficient for dev/testing) but becomes a real risk for the Week 4 leadership demo if nobody decides how the demo's actual user account gets created before then.
- **JWT secret/expiry assumptions (§26/§27)** are POC-appropriate defaults, not reviewed decisions — low risk for a POC, but should not be carried forward into any future production phase without an explicit security review (consistent with BRD §5.2 excluding formal security certification from this phase, not from all future phases).
