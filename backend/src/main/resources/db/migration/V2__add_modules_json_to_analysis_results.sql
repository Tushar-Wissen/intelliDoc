ALTER TABLE analysis_results
    ADD COLUMN IF NOT EXISTS modules_json TEXT;