CREATE TABLE documents (
                           id VARCHAR(64) PRIMARY KEY,
                           title VARCHAR(255) NOT NULL,
                           content TEXT NOT NULL,
                           content_type VARCHAR(255),
                           status VARCHAR(255) NOT NULL,
                           created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                           updated_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE analysis_results (
                                  id VARCHAR(64) PRIMARY KEY,
                                  document_id VARCHAR(64) NOT NULL,
                                  summary TEXT,
                                  sentiment VARCHAR(255),
                                  confidence_score DOUBLE PRECISION,
                                  entities_json TEXT,
                                  key_topics_json TEXT,
                                  processed_at TIMESTAMP WITH TIME ZONE,

                                  CONSTRAINT fk_analysis_results_document
                                      FOREIGN KEY (document_id)
                                          REFERENCES documents(id)
);

CREATE TABLE audit_logs (
                            id VARCHAR(64) PRIMARY KEY,
                            event_type VARCHAR(255) NOT NULL,
                            service_name VARCHAR(255) NOT NULL,
                            details TEXT,
                            created_at TIMESTAMP WITH TIME ZONE
);