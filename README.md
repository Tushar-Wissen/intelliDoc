# IntelliDoc — Pod 3 Document Extractor + Chatbot (POC)

Three-service stack: React web client, Java/Spring Boot Core API, and Python/FastAPI AI Service, plus Postgres+pgvector, Neo4j, Redis, and MinIO.

## Where the work stands

Ingestion runs in the AI service as one pipeline: parse, selective OCR, chunk, classify and extract, then embed. A successful document stops at `processing_status = INDEXING`. It is not marked `READY`. Epic 5 (knowledge graph) is the remaining gate before `READY`.

| Epic | Status | Where to look |
|---|---|---|
| 0 Foundation | In the repo: Compose stack, Flyway schema, JWT login | `docs/Implementation/01_EPIC_00_FOUNDATION_IMPLEMENTATION_PLAN.md` |
| 1 DMS | In the repo: workspaces, modules, upload, document status | `docs/Implementation/02_EPIC_01_DMS_IMPLEMENTATION_PLAN.md` |
| 2 Parsing and OCR | In the repo | `ai-service/app/pipeline/parsing.py`, `ocr.py`, `chunking.py` |
| 3 Classification and extraction | In the repo | `ai-service/app/pipeline/classification.py`, `extraction.py`; field review API under `backend/.../field/` |
| 4 Search indexing | In the repo | `ai-service/app/pipeline/indexing.py`; Flyway `V22` (simple full-text) and `V23` (`pg_trgm`) |
| 5 Knowledge graph | Not started | Next epic. Do not mark documents `READY` until the graph stage exists |
| 6–10 | Not started | Epic 6 retrieval should call `route_text_search()`, not `keyword_search()` directly |

Plans live in `docs/Implementation/`. Requirements and the ERD live in `docs/ReqAndDesign/`. Follow the plan for the epic you pick up. Do not add tables or columns that are not in the ERD.

Search behavior already in Epic 4:

- `generate_embeddings()` writes `document_chunk.embedding` (`vector(1024)`). Blank chunks are skipped.
- `vector_search()` ranks by cosine distance.
- `keyword_search()` is Postgres full-text with the `simple` config.
- `is_identifier_like()` plus `trigram_search()` handle reference-number queries such as `SA-2026-014`. `route_text_search()` chooses between those two text paths.

Still open inside Epic 4:

- `SELECT to_tsvector('simple', 'SA-2026-014')` has not been run against a dev database and recorded in the Epic 4 plan.
- The `V23` trigram migration is in the repo. It applies the next time Core API starts Flyway. An existing database does not need a volume wipe for a new `Vxx` file.

The frontend still uses its mock login. Core API auth is `POST /auth/login`.

## Run locally in under 10 minutes

### Prerequisites

- Docker Desktop (or Docker Engine + Compose v2)
- Ports free: `3000`, `8080`, `8000`, `5432`, `7474`, `7687`, `6379`, `9000`, `9001`

### Start the stack

```bash
cp .env.example .env
docker compose up --build
```

Wait until these six services are healthy (usually well under 2 minutes after images are built): `postgres`, `neo4j`, `redis`, `minio`, `ai-service`, `core-api`.

### Check health

```bash
curl http://localhost:8080/health
curl http://localhost:8000/health
```

Both return `200` with `"status":"UP"`.

Infra health is Compose `healthcheck` blocks (`pg_isready`, Neo4j HTTP, Redis `PING`, MinIO `/minio/health/live`).

### Seed a POC login (Story 0.4)

There is no signup API. Run this **after** `docker compose up` and Core API has applied Flyway migrations (tables `tenant` and `user_account` exist).

**Docker (Linux/macOS / Git Bash):**

```bash
docker compose exec -T postgres psql -U postgres -d intellidoc -f - < scripts/seed_users.sql
```

**Docker (Windows PowerShell):**

```powershell
Get-Content scripts/seed_users.sql | docker compose exec -T postgres psql -U postgres -d intellidoc
```

**Host `psql`** (Postgres published on `localhost:5432`; default password `postgres`):

```bash
psql -h localhost -U postgres -d intellidoc -f scripts/seed_users.sql
```

Seeded login: `jane.doe@company.com` / `password`.

Then:

```bash
curl -X POST http://localhost:8080/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"jane.doe@company.com\",\"password\":\"password\"}"
```


Use the returned bearer token:

```bash
curl http://localhost:8080/auth/me -H "Authorization: Bearer <token>"
```

### URLs

| Service | URL |
|---|---|
| Core API health | http://localhost:8080/health |
| Core API (legacy nested health) | http://localhost:8080/api/v1/health |
| AI Service health | http://localhost:8000/health |
| AI Service docs | http://localhost:8000/docs |
| Frontend | http://localhost:3000 |
| MinIO console | http://localhost:9001 |
| Neo4j browser | http://localhost:7474 |

The frontend still uses its existing mock login until a later epic wires it to `/auth/login`.

## Database migrations

Flyway runs automatically when `core-api` starts. A failed migration aborts startup (non-zero exit).

If you previously ran an older Compose Postgres image **without** pgvector, recreate the volume before Story 0.2 schema can apply:

```bash
docker compose down -v
docker compose up --build
```

If you see `Migration checksum mismatch` after editing an already-applied SQL file, Compose starts Flyway with `repair-on-migrate` so history checksums are updated. That does **not** re-run the old scripts; real schema changes still need a new `Vxx__*.sql` file. To rebuild the database from scratch instead:

```bash
docker compose down -v
docker compose up --build
```

## Running services without Docker

### AI Service

```bash
cd ai-service
python -m venv venv
# Windows: .\venv\Scripts\activate
# Linux/macOS: source venv/bin/activate
pip install -r requirements.txt
pytest
uvicorn app.main:app --port 8000 --reload
```

`requirements.txt` is enough for the API and unit tests. The Docker image also installs `requirements-pipeline.txt` (Docling, PaddleOCR, and the BGE-M3 embedding library). Unit tests inject a fake embedder and do not download that model.

### Core API

Requires PostgreSQL 16 with the `vector` extension (or the `pgvector/pgvector:pg16` image).

```bash
cd backend
mvn clean test
mvn spring-boot:run
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Tests

| Service | Command |
|---|---|
| AI Service | `pytest` in `ai-service/` |
| Core API | `mvn test` in `backend/` |
| Frontend | `npm run build` in `frontend/` |

Schema tests use Testcontainers (`pgvector/pgvector:pg16`) and are skipped if Docker is not available.

## CI

GitHub Actions runs build + tests on every push. On success, images are tagged with the git commit SHA (`intellidoc-core-api:<sha>`, `intellidoc-ai-service:<sha>`).

## Repository layout

```
backend/          # Core API (Spring Boot 3 / Java 17)
ai-service/       # FastAPI AI Service
frontend/         # React UI
scripts/          # POC seed data (not a product provisioning API)
docs/             # BRD, architecture, ERD, implementation plans
```
