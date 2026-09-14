# IntelliDoc - Multi-Tier Document Intelligence Platform

IntelliDoc is a centralized, microservices-based enterprise platform for document summarization, entity extraction, sentiment analysis, and interactive document Q&A built with **React**, **Spring Boot**, **Python FastAPI**, and **Supabase**.

---

## 🏗️ Architecture Overview

```
                          ┌──────────────────────────┐
                          │   React 18 SPA (Vite)    │
                          │     (Port: 3000 / 80)    │
                          └────────────┬─────────────┘
                                       │ REST API Calls
                                       ▼
                          ┌──────────────────────────┐
                          │  Spring Boot Backend API │
                          │       (Port: 8080)       │
                          └─────┬──────────────┬─────┘
                                │              │
           Supabase JPA SQL     │              │ REST Client (OpenAPI Contract)
                                ▼              ▼
       ┌──────────────────────────┐          ┌──────────────────────────┐
       │ Supabase / Postgres DB   │          │ Python AI Microservice   │
       │       (Port: 5432)       │          │       (Port: 8000)       │
       └──────────────────────────┘          └──────────────────────────┘
```

---

## 📋 System Requirements & Prerequisites

### Option A: Running via Docker (Recommended)
- **Docker**: Docker Desktop (Windows / macOS) or Docker Engine v20.10+ & Docker Compose v2.0+ (Linux).
- **RAM**: Minimum 4 GB free RAM (8 GB total system RAM recommended).
- **Disk Space**: ~3 GB free disk space.
- **Ports**: Ensure ports `3000`, `8080`, `8000`, and `5432` are available.

### Option B: Running Manually Without Docker
- **Java**: JDK 17+ & Apache Maven 3.8+
- **Python**: Python 3.11+ & pip
- **Node.js**: Node.js 18+ & npm
- **Database**: PostgreSQL 15+ installed locally OR a free [Supabase Cloud](https://supabase.com) account.

---

## ⚙️ Environment & Supabase Database Setup

### Step 1: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### Step 2: Set Up Supabase Database
1. Go to your [Supabase Dashboard](https://supabase.com) (or open local PostgreSQL).
2. Open the **SQL Editor** (`>_` icon).
3. Copy and execute the contents of [`supabase/migrations/20260911000000_init_schema.sql`](file:///c:/Users/Wissen/Desktop/intelliDoc/codebase/supabase/migrations/20260911000000_init_schema.sql).
4. Update the database host, user, password, and keys in your `.env` file:
   ```ini
   POSTGRES_HOST=db.YOUR_SUPABASE_PROJECT_ID.supabase.co
   POSTGRES_PORT=5432
   POSTGRES_DB=postgres
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=YOUR_DB_PASSWORD

   SUPABASE_URL=https://YOUR_SUPABASE_PROJECT_ID.supabase.co
   SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
   VITE_SUPABASE_URL=https://YOUR_SUPABASE_PROJECT_ID.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
   ```

---

## 🚀 How to Run the Application

### Method 1: One-Command Docker Startup (Recommended)

Run the full multi-tier system with healthchecks:

```bash
docker compose up --build
```

Access the application in your browser once started:
- 🌐 **React Frontend App**: [http://localhost:3000](http://localhost:3000)
- ⚙️ **Spring Boot API**: [http://localhost:8080/api/v1/documents](http://localhost:8080/api/v1/documents)
- ❤️ **Spring Boot Health**: [http://localhost:8080/api/v1/health](http://localhost:8080/api/v1/health)
- 🤖 **Python AI Service Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### Method 2: Running Services Individually (Development Mode)

If you prefer to run services manually on your host machine:

#### 1. Python AI Service Microservice
```bash
cd ai-service
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
pytest                                  # Run unit tests
uvicorn app.main:app --port 8000 --reload
```

#### 2. Spring Boot Backend API
```bash
cd backend
mvn clean test                          # Run unit & integration tests
mvn spring-boot:run                     # Starts API at http://localhost:8080
```

#### 3. React Frontend Web Application
```bash
cd frontend
npm install
npm run dev                             # Launches Vite dev server at http://localhost:3000
```

---

## 🧪 Testing & Verification Commands

| Service | Test Command | Directory |
| :--- | :--- | :--- |
| **Python AI Service** | `pytest` | `ai-service/` |
| **Spring Boot Backend** | `mvn test` | `backend/` |
| **React Frontend** | `npm run build` | `frontend/` |

---

## 📂 Repository Structure

```
.
├── contracts/                  # OpenAPI 3.0 Contract Specifications
│   └── ai-service-api.yaml
├── supabase/                   # Centralised Database Schema & Migrations
│   └── migrations/
│       └── 20260911000000_init_schema.sql
├── ai-service/                 # Python 3.11 FastAPI Microservice
│   ├── app/
│   │   ├── main.py             # FastAPI entry point & routers
│   │   ├── schemas.py          # Pydantic V2 contract models
│   │   └── services/           # Document NLP processor engine
│   ├── tests/                  # Pytest suite
│   ├── Dockerfile
│   └── requirements.txt
├── backend/                    # Spring Boot 3 Java Backend API
│   ├── src/main/java/com/intellidoc/backend/
│   │   ├── client/             # RestClient calling Python AI Service
│   │   ├── controller/         # REST Controllers (/api/v1/documents)
│   │   ├── dto/                # Data Transfer Objects
│   │   ├── model/              # JPA Entities (documents, analysis, audit)
│   │   └── service/            # Business & orchestration logic
│   ├── src/test/               # JUnit 5 & Mockito test suite
│   ├── pom.xml
│   └── Dockerfile
├── frontend/                   # React 18 SPA (Vite + Glassmorphism UI)
│   ├── src/
│   │   ├── App.jsx             # Main Dashboard & AI Insights view
│   │   └── index.css           # Custom Glassmorphism design system
│   ├── Dockerfile
│   └── nginx.conf
├── .github/
│   └── workflows/
│       └── ci.yml              # GitHub Actions CI/CD Pipeline
├── docker-compose.yml          # Multi-container local orchestration
├── .env.example                # Environment variables template
├── .gitignore                  # Git exclusions (protects secrets)
└── README.md
```

---

## 🧪 CI/CD Pipeline

The included GitHub Actions workflow ([`.github/workflows/ci.yml`](file:///.github/workflows/ci.yml)) automatically performs:
1. Automated unit test execution for Python AI Service (`pytest`).
2. Automated compilation and unit testing for Spring Boot Backend (`mvn test`).
3. Automated compilation for React Frontend (`npm run build`).
4. Container image build validation for all 3 microservices.
