# Project Knowledge Base — Pod 3: Generic Document Extractor + Chatbot

> **Purpose of this document:** a single place that summarises what the project is, why it exists, what's been decided, and where to find more detail. Anyone (or any AI assistant) joining the project should be able to read this file first and understand the whole picture in 5 minutes.

**Source of truth:** `BRD_Pod3_DocumentExtractor_Chatbot.docx` (v1.0, 14 Sep 2026). This file summarises it and tracks decisions made after it.

---

## 1. What we're building (one paragraph)

A proof-of-concept (POC) tool where a user uploads a mixed set of business documents (contracts, proposals, financial reports, policies — PDF/DOCX only) into a **workspace**, optionally organized into **modules** (folder-level groups), the system automatically classifies each document and extracts key facts, builds a lightweight **knowledge graph** of entities and relationships across those documents, and lets the user ask questions in plain language — scoped to a whole workspace, a single module, or specific documents — and get answers that are **grounded and cited** back to the exact document/page. The knowledge graph is used to catch and reduce hallucinated (made-up) answers compared to plain AI search, and **workspaces are strictly isolated from each other** — answers, citations, and contradiction checks never merge across workspace boundaries, even when two workspaces happen to share module names or mention the same real-world entities.

## 2. Why it exists

Business teams manually read through contracts, proposals, and reports to find facts or compare documents. General AI chat tools hallucinate and lose track of which document a fact came from. This POC proves whether adding a knowledge-graph layer on top of standard AI retrieval (an approach known as **GraphRAG**) measurably reduces that problem — enough to justify funding a full build.

## 3. POC guardrails (do not lose sight of these)

| Guardrail | Detail |
|---|---|
| Timeline | 4 weeks, fixed, non-negotiable |
| Team | 5–6 people, fixed |
| #1 priority | **Accuracy**, not speed, not feature breadth, not visual polish |
| Exit criteria | BOTH must be true: (1) measured accuracy improvement vs. a retrieval-only baseline, (2) a working live demo for leadership |
| File types | PDF and DOCX only |
| Environment | Non-production, internal only |

## 4. Key decisions made so far

| # | Decision | Rationale | Status |
|---|---|---|---|
| 1 | The knowledge-graph differentiator is **self-built** (our own extraction + graph, e.g. Neo4j or a graph-in-Postgres fallback) — not a specific Microsoft/Google product | Those vendor products aren't integrable third-party services for arbitrary customer documents; a self-built graph keeps us vendor-independent | Confirmed |
| 2 | Target users for the POC are **mixed business users generally**, not one department | No single team was designated as the first user group | Confirmed |
| 3 | Data sensitivity of documents used is **not yet confirmed** | Could be client-confidential/financial/PII | **Open — see §6** |
| 4 | 4-week / 5–6 person plan is a **fixed, already-approved** constraint | Budget/timeline already signed off | Confirmed |
| 5 | "Pod 3" is just this team's name, not a dependency on other pods | The POC is self-contained | Confirmed |
| 6 | POC success = accuracy proof **and** demo, both required | Neither alone is sufficient to prove the idea | Confirmed |
| 7 | LLM provider should be **configurable/swappable** (local vs hosted API) | De-risks the open question on GPU/compute availability (BRD §15) | Recommended — see Architecture doc |
| 8 | Reject building a real **OKF (Open Knowledge Format)** layer | It would be an AI-generated derivative of already-imperfect extraction — an extra hallucination-risk hop with no accuracy benefit the graph doesn't already cover; a template-based (non-AI) export is fine as a P1 stretch if portability is ever needed | Confirmed |
| 9 | Reject adopting **Microsoft's GraphRAG library** wholesale | Built for batch, whole-corpus indexing with community-summary "global search" — mismatched with our incremental, per-workspace, exact-citation, contradiction-aware use case; also now in maintenance mode | Confirmed |
| 10 | Adopt **`neo4j-graphrag-python`** (official Neo4j library) for KG construction | First-party fit for our already-chosen Neo4j; incremental per-document extraction via `SimpleKGPipeline`, not a batch pipeline; reduces custom build time on the riskiest epic | Confirmed — see Architecture doc §1, §3, §5 |
| 11 | Vector search (pgvector) and keyword search (Postgres FTS) stay in Postgres, **not** moved into Neo4j's native indexes | Keeps the "three representations of a document" principle clean; avoids reopening the DB schema mid-sprint | Confirmed — flagged as a real alternative if priorities change |
| 12 | Reject **Azure Document Intelligence** for OCR/parsing | Free tier caps at the first 2 pages per document — unusable for our typical 10–18 page contracts; real usage costs $1.50–$30 per 1,000 pages, conflicting with the zero-spend goal. Self-hosted Docling/PyMuPDF/PaddleOCR stays the default; revisit only if the evaluation harness shows OCR quality, not the graph, is capping accuracy | Confirmed |
| 13 | Add an optional **module** (folder) layer between workspace and document | User uploads a folder of documents (e.g. subfolders per department); chat must be scopeable to workspace, module, or individual document(s) | Confirmed — see `04_...md` §1, `05_...md` §4 |
| 14 | **Strict workspace isolation is a non-negotiable rule** | Two workspaces can have identically-named modules and mention the same real-world entities, but must never share a graph node, citation, or contradiction result. Enforced by stamping `workspace_id` on every graph node at write time, not just filtering at query time | Confirmed — see Architecture doc §1 principle 6, DB doc §3, Stories 5.3/5.4/6.2/8.5 |

## 5. Document map

| Doc | Contents |
|---|---|
| `BRD_Pod3_DocumentExtractor_Chatbot.docx` | Business requirements, scope, success criteria, risks — the business-level source of truth |
| `01_project_knowledge.md` | This file — quick-reference summary and decision log |
| `02_requirements_and_user_journeys.md` | User personas, user stories, and step-by-step user journeys |
| `03_architecture.md` | System architecture, tech stack, ingestion & query pipelines (Mermaid diagrams) |
| `04_db_mapping_and_er_diagram.md` | Relational schema (ER diagram), module/workspace-isolation schema, and knowledge-graph schema |
| `05_api_specs.md` | REST API endpoint specifications, including module and scope-aware chat endpoints |
| `06_backend_epics_and_stories.md` | Backend backlog: epics, stories, acceptance criteria, sample actions/results, sized for a 2-week sprint |
| `07_realistic_timeline_and_task_plan.md` | Realistic AI-assisted vs. non-AI timeline, 4 independent dev tracks, per-story input/action/output |

## 6. Open items still needing a business decision

Carried over from BRD §15 — these affect the technical docs and should be resolved early in Week 1:

- **Data sensitivity** of documents used, even for testing (affects hosting/security posture).
- **Deployment environment** — existing cloud, on-prem, or new sandbox — and whether GPU access exists (affects whether we run a local LLM or call a hosted API).
- **Demo date and audience** for leadership.
- **Which sample documents** will make up the evaluation test set.

Until these are resolved, the architecture docs assume: cloud or local Docker Compose deployment, GPU availability unconfirmed (so the design keeps the LLM provider swappable), and synthetic/non-sensitive sample documents for testing.

## 7. Glossary

| Term | Plain-English meaning |
|---|---|
| RAG | AI first searches documents for relevant passages, then answers using those passages, instead of relying on what it already "knows." |
| Knowledge graph | A structured map of facts and how they connect (e.g. Company A — signed — Contract X — expires — 31 March). |
| GraphRAG | RAG combined with a knowledge graph, so answers can be checked against structured facts as well as raw text. |
| Hallucination | The AI confidently stating something not actually supported by the source documents. |
| Citation | A reference on an answer showing exactly which document/page/section it came from. |
| Embedding | Converting text into numbers so a computer can find passages similar in meaning, not just wording. |
| Entity extraction | Automatically identifying people, companies, dates, amounts, etc. in a document. |
| Reranking | A second pass that re-scores retrieved passages for relevance before sending them to the AI model, to improve precision. |
| Module | An optional folder-level grouping of documents within one workspace (e.g. mirrors an uploaded subfolder). Chat can be scoped to a module. Same module name can exist in different workspaces — they're unrelated. |
| Workspace isolation | The rule that two workspaces never share data — no merged graph nodes, no cross-workspace citations or contradictions, even if they have identically-named modules or mention the same real-world entities. |
| `neo4j-graphrag-python` | The official Neo4j library used to build the knowledge graph — handles entity/relationship extraction and writing to Neo4j per document, so we don't hand-write that pipeline ourselves. |

---
*Last updated: 16 September 2026 — added module/workspace-isolation decisions and doc map entries for `06`/`07`.*
