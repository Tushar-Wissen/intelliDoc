# IntelliDoc — Pod 3 Document Extractor + Chatbot (POC)

Three-service stack: React web client, Java/Spring Boot Core API, and Python/FastAPI AI Service, plus Postgres+pgvector, Neo4j, Redis, and MinIO.

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

There is no signup API. After Core API has applied Flyway migrations:

```bash
docker compose exec -T postgres psql -U postgres -d intellidoc -f - < scripts/seed_users.sql
```

On Windows PowerShell:

```powershell
Get-Content scripts/seed_users.sql | docker compose exec -T postgres psql -U postgres -d intellidoc
```

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
