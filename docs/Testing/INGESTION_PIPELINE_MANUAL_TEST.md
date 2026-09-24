# Ingestion pipeline — manual test guide

This guide walks through the pipeline that is in the repository today: upload a document, then parse it, run OCR only when a page has almost no text, split it into chunks, classify it and extract fields, embed those chunks, and write a workspace-scoped knowledge graph.

Chat, retrieval, and the evaluation report are not part of this test. Those come in later epics. The React UI still uses its own mock login, so this test uses the Core API directly.

Anyone who can run Docker and paste commands in PowerShell can follow it. You do not need to read the source code.

Work from the repository root (`codebase`) in **Windows PowerShell**.

---

## What “success” looks like

One DOCX is uploaded into a workspace. After processing finishes:

| Check | Expected result |
|---|---|
| Document status | `READY` |
| Original file | Stored in MinIO and downloadable |
| Pages and sections | Rows in Postgres, text matches the file |
| Chunks | At least one chunk, each tied to a page and a section |
| Classification | Document type `contract`, overview and summary filled in |
| Extracted fields | Parties, dates, and contract terms you can read and correct |
| Embeddings | Every non-empty chunk has a 1024-number vector |
| Knowledge graph | A `Document` node in Neo4j, plus organizations, a date, and a person, all stamped with the same `workspace_id` |

The document is marked `READY` only after embeddings **and** the graph stage both finish. If the graph cannot be written, the status becomes `FAILED`, even when pages, fields, and embeddings are already saved.

---

## How the pipeline moves

After upload, Core API stores the file and asks the AI service to process it. A Celery worker inside the AI service container runs these stages in order:

1. **Parsing** — read the file from MinIO and save page text and sections.
2. **OCR** — only pages with very little text (fewer than 80 characters). A normal typed DOCX skips OCR.
3. **Chunking** — split the text into searchable pieces, each pointing at a page and a section.
4. **Classification and extraction** — set the document type, overview, summary, and extracted fields.
5. **Indexing** — write a BGE-M3 embedding (1024 numbers) on every non-empty chunk.
6. **Knowledge graph** — write entities and relationships in Neo4j for this workspace only.

While you watch the document, the status values you will see are:

`UPLOADED` → `PARSING` → `EXTRACTING` → `INDEXING` → `READY`

OCR and chunking happen during `PARSING`. Classification happens during `EXTRACTING`. Embeddings and the graph both happen during `INDEXING`. There is no separate status for OCR, chunking, or the graph.

If something breaks, the status becomes `FAILED`. The job row stores a short message you can show to a user.

---

## Before you start

### Tools

- Docker Desktop is running.
- Ports are free: `3000`, `8080`, `8000`, `5432`, `7474`, `7687`, `6379`, `9000`, `9001`.
- The machine can reach the internet on the **first** document. The AI image downloads the BGE-M3 embedding model the first time indexing runs. That download is large. Later documents are much faster.
- Use `curl.exe`, not `curl`. In PowerShell, `curl` is an alias for a different command and will not upload a file correctly.

### What the sample file is designed to prove

The default language model for this proof of concept is a rules engine (`LLM_PROVIDER` defaults to `rules`). It does not call OpenAI or Ollama. It looks for plain phrases. The sample contract below is written so those rules fire in a predictable way:

- The words “Master Services Agreement” and “contract” classify the file as a **contract** with confidence **0.93**.
- “Parties: Acme Corp and Beta Ltd” becomes the Parties field and two organization nodes.
- “Effective Date: 2026-01-01” becomes a date field and a date node.
- “shall” becomes an Obligations field.
- “30 days written notice” becomes termination fields.
- “Signed by Jane Doe” becomes a person node.
- “Topics: payment terms” becomes a topic.
- “Reference SA-2026-014” becomes a reference-number field.

If someone has set `LLM_PROVIDER` to `ollama` or `hosted`, the type and field wording will differ. The rest of the checks (pages, chunks, embeddings, a graph node for this workspace) still apply. For this scripted pass, leave the provider on `rules`.

### Neo4j must be reachable from the AI container

Inside Docker, `localhost` is the AI container itself, not the Neo4j container. `docker-compose.yml` already sets this on `ai-service`:

```yaml
- NEO4J_URI=bolt://neo4j:7687
- NEO4J_USER=neo4j
- NEO4J_PASSWORD=neo4jpassword
```

It also sets `LLM_PROVIDER` to `rules` unless `.env` overrides it. Confirm the running container picked those values up:

```powershell
docker compose exec ai-service printenv NEO4J_URI LLM_PROVIDER
```

Expect `bolt://neo4j:7687` and `rules`. If `NEO4J_URI` is `bolt://localhost:7687`, the container is running an old Compose file. Recreate it before you upload anything:

```powershell
docker compose up -d --force-recreate ai-service
```

Without the Compose hostname, parsing and embeddings can still succeed, and the document then fails at the graph stage.

---

## Step 1 — Start the stack

**Action**

```powershell
copy .env.example .env
docker compose up --build
```

Leave this window open so you can see logs, or open a second PowerShell window in the same folder for the commands below.

Wait until these services report healthy. The first build can take several minutes.

```powershell
docker compose ps
```

**Validate**

- `postgres`, `neo4j`, `redis`, `minio`, `ai-service`, and `core-api` are `healthy` (or `running` with a healthy health check).
- Core API: open http://localhost:8080/health — body contains `"status":"UP"`.
- AI service: open http://localhost:8000/health — body contains `"status":"UP"`.
- AI service docs load at http://localhost:8000/docs (you will not call this from the browser during the test; Core API calls it).
- Neo4j Browser loads at http://localhost:7474.
- MinIO Console loads at http://localhost:9001.

If `core-api` exits immediately, read `docker compose logs core-api`. A failed database migration stops startup on purpose.

---

## Step 2 — Create the test user

There is no signup screen. The seed script inserts one user after the database tables exist.

**Action**

```powershell
Get-Content scripts/seed_users.sql | docker compose exec -T postgres psql -U postgres -d intellidoc
```

**Validate**

The script finishes without an error such as “relation user_account does not exist”. Running it twice is safe.

```powershell
docker compose exec postgres psql -U postgres -d intellidoc -c "SELECT email, display_name FROM user_account;"
```

You should see `jane.doe@company.com` / `Jane Doe`.

---

## Step 3 — Log in and keep the token

**Action**

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:8080/auth/login -ContentType "application/json" -Body '{"email":"jane.doe@company.com","password":"password"}'
$token = $login.token
$headers = @{ Authorization = "Bearer $token" }
$login.user
```

**Validate**

- The call returns a long `token` string and a user object.
- `displayName` is `Jane Doe`.
- `role` is `member`.

Confirm the token works:

```powershell
Invoke-RestMethod -Uri http://localhost:8080/auth/me -Headers $headers
```

The same user comes back.

**Also check a rejected login**

```powershell
try {
  Invoke-RestMethod -Method Post -Uri http://localhost:8080/auth/login -ContentType "application/json" -Body '{"email":"jane.doe@company.com","password":"wrong"}'
} catch {
  $_.Exception.Response.StatusCode.value__
}
```

Expect HTTP **401**. Calling `/auth/me` with no `Authorization` header is also **401**.

If this PowerShell window is closed, log in again. Later steps use `$token` and `$headers`.

---

## Step 4 — Create a workspace

A workspace is the boundary for documents and for the knowledge graph. Two workspaces never share graph nodes.

**Action**

```powershell
$workspace = Invoke-RestMethod -Method Post -Uri http://localhost:8080/workspaces -Headers $headers -ContentType "application/json" -Body '{"name":"Pipeline Test Workspace"}'
$workspaceId = $workspace.id
$workspace
```

**Validate**

- HTTP status is 201 (Invoke-RestMethod does not print the status; a returned object means it succeeded).
- `name` is `Pipeline Test Workspace`.
- `status` is `ACTIVE`.
- `id` is a UUID. Copy it if you need it later; `$workspaceId` holds it.

List workspaces:

```powershell
Invoke-RestMethod -Uri http://localhost:8080/workspaces -Headers $headers
```

The new workspace is in the list. A request with no token returns **401**.

---

## Step 5 — Create a module (folder)

A module is a folder inside one workspace. It does not change how the pipeline runs. It only groups the document.

**Action**

```powershell
$module = Invoke-RestMethod -Method Post -Uri "http://localhost:8080/workspaces/$workspaceId/modules" -Headers $headers -ContentType "application/json" -Body '{"name":"Vendor Contracts"}'
$moduleId = $module.id
$module
```

**Validate**

- `name` is `Vendor Contracts`.
- `workspaceId` equals `$workspaceId`.

Create the same name again in this workspace. Expect an error (HTTP **409**, code `MODULE_NAME_TAKEN`). The same folder name in a different workspace would be allowed; you do not need a second workspace for the happy path.

---

## Step 6 — Create the sample contract

**Action**

Run this once. It writes `ServiceAgreement.docx` in the current folder. The text is the contract the rules engine knows how to read.

```powershell
$sampleDir = Join-Path $PWD "testdata"
New-Item -ItemType Directory -Force -Path $sampleDir | Out-Null
$build = Join-Path $sampleDir "_docx_build"
if (Test-Path $build) { Remove-Item $build -Recurse -Force }
New-Item -ItemType Directory -Force -Path "$build\_rels" | Out-Null
New-Item -ItemType Directory -Force -Path "$build\word\_rels" | Out-Null

@'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
'@ | Set-Content -Encoding UTF8 "$build\[Content_Types].xml"

@'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
'@ | Set-Content -Encoding UTF8 "$build\_rels\.rels"

@'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
'@ | Set-Content -Encoding UTF8 "$build\word\_rels\document.xml.rels"

$paragraphs = @(
  "Master Services Agreement",
  "Parties: Acme Corp and Beta Ltd",
  "Effective Date: 2026-01-01",
  "Reference SA-2026-014",
  "The vendor shall perform services per this contract.",
  "Either party may end the agreement with 30 days written notice.",
  "Signed by Jane Doe.",
  "Topics: payment terms"
)
$body = ($paragraphs | ForEach-Object {
  "<w:p><w:r><w:t>$([System.Security.SecurityElement]::Escape($_))</w:t></w:r></w:p>"
}) -join ""
@"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>$body<w:sectPr/></w:body>
</w:document>
"@ | Set-Content -Encoding UTF8 "$build\word\document.xml"

$docx = Join-Path $sampleDir "ServiceAgreement.docx"
if (Test-Path $docx) { Remove-Item $docx -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($build, $docx)
Remove-Item $build -Recurse -Force
Get-Item $docx | Select-Object FullName, Length
```

**Validate**

- `testdata\ServiceAgreement.docx` exists.
- Size is a few kilobytes, not zero.
- You can open it in Word and read the eight lines above. If Word says the file is corrupt, stop and recreate it. Do not upload a corrupt file.

---

## Step 7 — Upload the document

Upload does not wait for parsing. A successful upload returns immediately with status `UPLOADED`, and processing continues in the background.

**Action**

```powershell
$docxPath = (Resolve-Path ".\testdata\ServiceAgreement.docx").Path
$uploadJson = curl.exe -sS -X POST "http://localhost:8080/workspaces/$workspaceId/documents" -H "Authorization: Bearer $token" -F "files=@$docxPath;filename=ServiceAgreement.docx" -F "relativePaths=Vendor Contracts/ServiceAgreement.docx"
$upload = $uploadJson | ConvertFrom-Json
$upload | ConvertTo-Json -Depth 5
$documentId = $upload.documents[0].id
```

`relativePaths` tells the API that the file sits in a folder named `Vendor Contracts`. That folder already exists, so the API reuses it instead of creating a second module.

**Validate**

- `documents` has one item.
- `fileName` is `ServiceAgreement.docx`.
- `processingStatus` is `UPLOADED` (it may already have moved to `PARSING` if the worker started instantly).
- `moduleName` is `Vendor Contracts`.
- `rejections` is absent or empty.
- Save `$documentId`. Every later check uses it.

Open MinIO Console at http://localhost:9001 (`minioadmin` / `minioadmin`). In the `intellidoc` bucket, confirm an object at:

`workspace/<workspaceId>/document/<documentId>/original.docx`

**Also check a bad upload in the same call style**

Create a tiny text file and upload it:

```powershell
Set-Content -Path .\testdata\notes.txt -Value "not a document"
$bad = curl.exe -sS -w "`nHTTP_STATUS:%{http_code}" -X POST "http://localhost:8080/workspaces/$workspaceId/documents" -H "Authorization: Bearer $token" -F "files=@$((Resolve-Path .\testdata\notes.txt).Path);filename=notes.txt"
$bad
```

The text file is rejected. The response body includes code `UNSUPPORTED_FILE_TYPE`. The DOCX you already uploaded is unchanged. PDF and DOCX are the only accepted types. Files larger than 20 MB are rejected as too large.

---

## Step 8 — Watch processing until READY or FAILED

The first document is slow. Parsing libraries and the embedding model may download on first use. Ten to twenty minutes on a first run is normal. Later runs of a similar file are usually a couple of minutes.

**Action**

In another window:

```powershell
docker compose logs -f ai-service
```

In the test window, poll until the status stops changing:

```powershell
do {
  Start-Sleep -Seconds 5
  $doc = Invoke-RestMethod -Uri "http://localhost:8080/documents/$documentId" -Headers $headers
  "{0:HH:mm:ss}  {1}" -f (Get-Date), $doc.processingStatus
} while ($doc.processingStatus -notin @("READY", "FAILED"))
$doc | ConvertTo-Json -Depth 4
```

**Validate in the logs, in this order**

Look for lines that include your document id:

1. `Stage parsing completed`
2. `Stage ocr completed` — for this typed DOCX the log also says OCR was skipped (`scannedPages=0`). That is correct. OCR is for scanned pages, not for every file.
3. `Stage chunking completed`
4. `Stage classification completed` — type `contract`, and `lowConfidence` is false.
5. `Embeddings stored` — `count` is at least 1.
6. `Knowledge graph built`
7. `Document ready`

**Validate on the document**

| Field | Expected |
|---|---|
| `processingStatus` | `READY` |
| `documentType` | `contract` |
| `classificationConfidence` | `0.93` |
| `overview` | A short sentence. With the rules engine it starts with “Overview of”. |
| `summary` | A short sentence. With the rules engine it starts with “Summary covering”. |
| `fileName` | `ServiceAgreement.docx` |
| `moduleId` | The Vendor Contracts module id |

`pageCount` in this API response is currently always `0`. Do not treat that as a failure. Confirm the real page count in Postgres in the next step.

**If status is FAILED**

```powershell
docker compose exec postgres psql -U postgres -d intellidoc -c "SELECT stage, status, error_message FROM processing_job WHERE document_id = '$documentId' ORDER BY started_at;"
```

Read `error_message`:

| Message | Usual cause |
|---|---|
| The document could not be read… | Corrupt file, or MinIO could not be read. |
| The document produced no searchable text chunks. | Parser returned no pages. |
| The document could not be indexed for search. | Embedding model failed to download or run. Check AI service logs. |
| The document knowledge graph could not be built. | AI service cannot reach Neo4j. Recheck `NEO4J_URI=bolt://neo4j:7687` and Neo4j health. |
| Document processing failed. | Anything else. Read the traceback in `docker compose logs ai-service`. |

A failed document can be retried after you fix the cause. See Step 15. Do not continue the happy-path checks until status is `READY`.

**If status stays UPLOADED**

Core API could not reach the AI service. Check `docker compose logs core-api` for `Fire-and-forget processing trigger failed`. Confirm `http://localhost:8000/health` is up, then retry is only allowed from `FAILED`, so for a stuck `UPLOADED` document upload a new file after the AI service is healthy.

---

## Step 9 — Confirm the original file can be downloaded

**Action**

```powershell
curl.exe -sS -D - -o .\testdata\downloaded.docx -H "Authorization: Bearer $token" "http://localhost:8080/documents/$documentId/file"
```

**Validate**

- HTTP status in the headers is **200**.
- `Content-Type` is the Word type (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`).
- `Content-Disposition` contains `ServiceAgreement.docx`.
- `testdata\downloaded.docx` opens and shows the same eight lines as the file you uploaded.

This download works as soon as upload succeeds. It does not wait for `READY`. You are checking it now so you know the stored original was not replaced by extracted text.

---

## Step 10 — Confirm pages, sections, and chunks in Postgres

**Action**

```powershell
docker compose exec postgres psql -U postgres -d intellidoc -c @"
SELECT page_number, was_ocr, ocr_confidence, left(raw_text, 400) AS raw_text
FROM document_page
WHERE document_id = '$documentId'
ORDER BY page_number;
"@

docker compose exec postgres psql -U postgres -d intellidoc -c @"
SELECT heading, start_page, end_page
FROM document_section
WHERE document_id = '$documentId';
"@

docker compose exec postgres psql -U postgres -d intellidoc -c @"
SELECT page_number, token_count, section_id IS NOT NULL AS has_section, left(chunk_text, 200) AS chunk_text
FROM document_chunk
WHERE document_id = '$documentId'
ORDER BY page_number;
"@
```

**Validate — pages**

- At least one row.
- `was_ocr` is `f` (false) and `ocr_confidence` is empty. This file has real text, so OCR must not rewrite it.
- `raw_text` contains phrases from the file, including `Acme Corp`, `2026-01-01`, and `SA-2026-014`.

**Validate — sections**

- At least one section.
- `start_page` and `end_page` are numbers inside the page range you just saw (for this one-page file, both are `1`).

**Validate — chunks**

- At least one row.
- `has_section` is `t`.
- `page_number` is `1`.
- `chunk_text` contains the contract wording. It must not be empty.
- `token_count` is a positive number. A one-page sample can be under the 200-token target. The pipeline keeps a short document as one chunk instead of inventing text to hit the target.

---

## Step 11 — Confirm classification and extracted fields

**Action**

```powershell
$fields = Invoke-RestMethod -Uri "http://localhost:8080/documents/$documentId/fields" -Headers $headers
$fields.fields | Format-Table fieldName, fieldCategory, fieldValue, confidence, sourcePage, status -AutoSize
```

**Validate**

Every field:

- `status` is `AI_GENERATED`.
- `sourcePage` is `1`.
- `confidence` is between 0 and 1.
- `id` is present (you need one id in the next step).

With the rules engine, expect these names. Extra fields are fine. Missing ones mean the sample text was changed or a different model provider is configured.

| fieldName | fieldCategory | fieldValue contains |
|---|---|---|
| Title | universal | Master Services Agreement |
| Parties | universal | Acme Corp and Beta Ltd |
| Effective Date | universal | 2026-01-01 |
| Reference Numbers | universal | SA-2026-014 |
| Topics | universal | payment terms |
| Obligations | contract_specific | services |
| Termination Terms | contract_specific | 30 days |
| Termination Notice Period | contract_specific | 30 days |

The same rows exist in Postgres:

```powershell
docker compose exec postgres psql -U postgres -d intellidoc -c @"
SELECT field_name, field_category, field_value, source_page, source_chunk_id IS NOT NULL AS has_chunk, status
FROM extracted_field
WHERE document_id = '$documentId'
ORDER BY field_name;
"@
```

`has_chunk` is `t` for every row. Each fact points at the chunk it came from.

List the workspace documents and filter by type:

```powershell
Invoke-RestMethod -Uri "http://localhost:8080/workspaces/$workspaceId/documents?documentType=contract" -Headers $headers
```

`ServiceAgreement.docx` is in the list and `processingStatus` is `READY`.

---

## Step 12 — Correct a field, remove a field, export the rest

This is the human review step. It does not re-run the pipeline.

**Action — correct**

Pick the Termination Notice Period id from the table above.

```powershell
$notice = $fields.fields | Where-Object { $_.fieldName -eq "Termination Notice Period" } | Select-Object -First 1
$corrected = Invoke-RestMethod -Method Patch -Uri "http://localhost:8080/fields/$($notice.id)" -Headers $headers -ContentType "application/json" -Body '{"fieldValue":"45 days","status":"CORRECTED"}'
$corrected
```

**Validate**

- `fieldValue` is `45 days`.
- `status` is `CORRECTED`.
- Other fields are unchanged. Call the fields list again and confirm Parties is still `Acme Corp and Beta Ltd`.

**Action — remove**

```powershell
$topics = $fields.fields | Where-Object { $_.fieldName -eq "Topics" } | Select-Object -First 1
Invoke-RestMethod -Method Delete -Uri "http://localhost:8080/fields/$($topics.id)" -Headers $headers
```

**Validate**

- The response `status` is `REMOVED`.
- A fresh fields list does **not** include Topics. Removed fields stay in the database and are hidden from the list.

**Action — export**

```powershell
curl.exe -sS -D - -o .\testdata\fields.csv -H "Authorization: Bearer $token" "http://localhost:8080/documents/$documentId/fields/export?format=csv"
Get-Content .\testdata\fields.csv
```

**Validate**

- HTTP **200**.
- The file starts with the header `fieldName,fieldValue,confidence,sourcePage,status`.
- The notice-period row shows `45 days` and `CORRECTED`.
- Topics is absent.
- Parties, Effective Date, and Reference Numbers are still present.

JSON export, for a second look:

```powershell
curl.exe -sS -o .\testdata\fields.json -H "Authorization: Bearer $token" "http://localhost:8080/documents/$documentId/fields/export?format=json"
Get-Content .\testdata\fields.json
```

`format` must be `csv` or `json`. Any other value is rejected.

---

## Step 13 — Confirm embeddings

**Action**

```powershell
docker compose exec postgres psql -U postgres -d intellidoc -c @"
SELECT
  count(*) AS chunks,
  count(*) FILTER (WHERE btrim(chunk_text) <> '' AND embedding IS NULL) AS missing_embeddings,
  count(*) FILTER (WHERE embedding IS NOT NULL) AS embedded,
  min(vector_dims(embedding)) AS min_dims,
  max(vector_dims(embedding)) AS max_dims
FROM document_chunk
WHERE document_id = '$documentId';
"@
```

**Validate**

- `chunks` is at least 1.
- `missing_embeddings` is **0**. A non-empty chunk without a vector would have failed the document before `READY`.
- `embedded` equals `chunks` for this sample, because every chunk has text.
- `min_dims` and `max_dims` are both **1024** (BGE-M3).

Keyword search is implemented inside the AI service for a later epic. There is no public “search” URL yet. The check above is the indexing proof for this pipeline: the vectors exist, they are the right size, and none are missing.

---

## Step 14 — Confirm the knowledge graph

Open http://localhost:7474. Connect with:

- Connect URL: `bolt://localhost:7687`
- Username: `neo4j`
- Password: `neo4jpassword`
- Database: `neo4j`

If the browser asks for a password change, skip it. The password is already set by Docker.

**Action — document node**

Paste this in the Neo4j query box. Replace the id with your `$documentId` (keep the quotes).

```cypher
MATCH (d:Document {document_id: "PASTE-DOCUMENT-ID"})
RETURN d.document_id, d.workspace_id, d.title, d.document_type, d.source_page, d.source_chunk_id
```

**Validate**

- One `Document` node.
- `workspace_id` equals `$workspaceId` from Step 4. It is not empty.
- `title` is `ServiceAgreement.docx`.
- `document_type` is `contract`.
- `source_chunk_id` is a UUID that exists in `document_chunk` for this document.
- `source_page` is `1`.

**Action — entities and relationships**

```cypher
MATCH (d:Document {document_id: "PASTE-DOCUMENT-ID"})-[r]-(n)
RETURN type(r) AS relationship, labels(n) AS labels, n.name AS name, n.value AS value, n.workspace_id AS workspace_id
ORDER BY relationship, name
```

**Validate**

- Every connected node has the **same** `workspace_id` as the document. A node with a blank or different workspace id is a failure.
- You can see organizations whose names normalize to `acme corp` and `beta ltd` (stored lowercase).
- You can see a person `jane doe`.
- You can see a date fact whose value is `2026-01-01`.
- Relationship types are only from this set: `SIGNED`, `EXPIRES_ON`, `AMENDS`, `MENTIONS`, `HAS_VALUE`. You should see `SIGNED` or `MENTIONS` for the companies, `MENTIONS` for Jane Doe, and `EXPIRES_ON` for the date.

**Action — nothing leaked into another workspace**

```cypher
MATCH (n)
WHERE n.workspace_id IS NULL
RETURN labels(n), count(*) AS nodes_missing_workspace
```

**Validate**

- The count is **0**. Every node written by this pipeline carries `workspace_id`.

Optional, from PowerShell, the same document check:

```powershell
docker compose exec neo4j cypher-shell -u neo4j -p neo4jpassword "MATCH (d:Document {document_id: '$documentId'}) RETURN d.workspace_id, d.title, d.document_type"
```

The printed workspace id matches `$workspaceId`.

---

## Step 15 — Retry is only for failures

**Action**

```powershell
try {
  Invoke-RestMethod -Method Post -Uri "http://localhost:8080/documents/$documentId/retry" -Headers $headers
} catch {
  $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
  $reader.ReadToEnd()
}
```

**Validate**

- The call is rejected. Retry is allowed only when status is `FAILED`.
- A following GET still shows `READY`. Pages, fields, and the graph are untouched.

If you are testing a document that really is `FAILED` (Step 8), fix the cause first, then:

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:8080/documents/$documentId/retry" -Headers $headers
```

Status returns to `PARSING`, the worker runs the pipeline again, and you wait until `READY` or `FAILED` exactly as in Step 8. After a successful retry, repeat Steps 10, 11, 13, and 14.

---

## Step 16 — Move the document between modules

**Action — unassign**

```powershell
Invoke-RestMethod -Method Patch -Uri "http://localhost:8080/documents/$documentId/module" -Headers $headers -ContentType "application/json" -Body '{"moduleId":null}'
```

**Validate**

- `moduleId` is null.
- `processingStatus` is still `READY`. Moving a module does not reprocess the file.

**Action — assign again**

```powershell
Invoke-RestMethod -Method Patch -Uri "http://localhost:8080/documents/$documentId/module" -Headers $headers -ContentType "application/json" -Body "{`"moduleId`":`"$moduleId`"}"
```

**Validate**

- `moduleId` is the Vendor Contracts id again.

---

## Step 17 — Archive the document

**Action**

```powershell
curl.exe -sS -o NUL -w "HTTP_STATUS:%{http_code}" -X DELETE -H "Authorization: Bearer $token" "http://localhost:8080/documents/$documentId"
```

**Validate**

- HTTP status is **204**.
- A following GET of the same document returns **404**.

```powershell
try {
  Invoke-RestMethod -Uri "http://localhost:8080/documents/$documentId" -Headers $headers
} catch {
  $_.Exception.Response.StatusCode.value__
}
```

Expect **404**.

The workspace document list no longer includes the file:

```powershell
Invoke-RestMethod -Uri "http://localhost:8080/workspaces/$workspaceId/documents" -Headers $headers
```

Archive hides the document from the API. It does not, by itself, delete the Neo4j nodes from Step 14. If you query Neo4j again you may still see the old graph. That is expected for this version. A new upload creates a new document id and a new graph node.

---

## Pass / fail checklist

Use a fresh upload (Steps 6–14) as the official run. Tick a row only after you have seen the evidence, not because an earlier step “probably” did it.

| # | Check | Pass when |
|---|---|---|
| 1 | Stack health | Core API and AI service both return UP, and Compose shows the data services healthy. |
| 2 | Login | Jane can log in; a wrong password returns 401. |
| 3 | Workspace and module | Workspace is ACTIVE; module name is unique inside that workspace. |
| 4 | Upload | DOCX accepted as UPLOADED; a `.txt` file is rejected; MinIO has `original.docx`. |
| 5 | Pipeline status | Document reaches READY. Logs show parsing, OCR, chunking, classification, embeddings, graph, then “Document ready”. |
| 6 | OCR | `was_ocr` is false on this typed file. |
| 7 | Text | Page text contains Acme Corp, the date, and SA-2026-014. |
| 8 | Chunks | Every chunk has a page number and a section. |
| 9 | Classification | Type `contract`, confidence 0.93, overview and summary are non-empty. |
| 10 | Fields | Parties, Effective Date, reference number, obligations, and termination fields exist, each with a source page and a source chunk. |
| 11 | Review | Corrected value is 45 days; removed field disappears from the list and from CSV export. |
| 12 | Embeddings | No non-empty chunk is missing a vector; dimension is 1024. |
| 13 | Graph | Document node exists; organizations, person, and date are present; every node has this workspace id; no node has a null workspace id. |
| 14 | Safety rails | Retry on a READY document is rejected. Archive makes the document 404. |

If rows 5 and 13 fail together and the job message is about the knowledge graph, fix Neo4j connectivity (the pre-start section) and retry. If row 12 fails, the embedding model did not finish; read the AI service log and retry after the model can be downloaded.
