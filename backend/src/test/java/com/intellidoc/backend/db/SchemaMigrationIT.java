package com.intellidoc.backend.db;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import com.intellidoc.backend.client.AiServiceClient;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@ActiveProfiles("schema")
@Testcontainers(disabledWithoutDocker = true)
class SchemaMigrationIT {

    private static final List<String> ERD_TABLES = List.of(
            "tenant",
            "user_account",
            "workspace",
            "workspace_member",
            "document_group",
            "document",
            "document_version",
            "document_page",
            "document_section",
            "document_chunk",
            "extracted_field",
            "processing_job",
            "chat_session",
            "chat_message",
            "answer_citation",
            "user_feedback",
            "evaluation_run",
            "evaluation_question",
            "evaluation_result"
    );

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("pgvector/pgvector:pg16").asCompatibleSubstituteFor("postgres")
    );

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
    }

    @MockBean
    private AiServiceClient aiServiceClient;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private Flyway flyway;

    @Test
    void migrationsCreateErdTablesPgvectorAndHnswIndex() {
        Set<String> tables = Set.copyOf(jdbcTemplate.queryForList(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
                String.class
        ));
        for (String expected : ERD_TABLES) {
            assertTrue(tables.contains(expected), "Missing ERD table: " + expected);
        }

        Integer vectorExt = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM pg_extension WHERE extname = 'vector'",
                Integer.class
        );
        assertEquals(1, vectorExt);

        Integer hnsw = jdbcTemplate.queryForObject(
                """
                        SELECT COUNT(*)
                        FROM pg_indexes
                        WHERE tablename = 'document_chunk'
                          AND indexname = 'idx_document_chunk_embedding_hnsw'
                        """,
                Integer.class
        );
        assertEquals(1, hnsw);

        String ftsIndex = jdbcTemplate.queryForObject(
                """
                        SELECT indexdef
                        FROM pg_indexes
                        WHERE tablename = 'document_chunk'
                          AND indexname = 'idx_document_chunk_chunk_text_fts'
                        """,
                String.class
        );
        assertTrue(ftsIndex != null && ftsIndex.contains("to_tsvector('simple'"), ftsIndex);

        Integer pgTrgm = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM pg_extension WHERE extname = 'pg_trgm'",
                Integer.class
        );
        assertEquals(1, pgTrgm);

        String trgmIndex = jdbcTemplate.queryForObject(
                """
                        SELECT indexdef
                        FROM pg_indexes
                        WHERE tablename = 'document_chunk'
                          AND indexname = 'idx_document_chunk_chunk_text_trgm'
                        """,
                String.class
        );
        assertTrue(trgmIndex != null && trgmIndex.contains("gin_trgm_ops"), trgmIndex);

        Integer uniqueModule = jdbcTemplate.queryForObject(
                """
                        SELECT COUNT(*)
                        FROM pg_constraint
                        WHERE conname = 'uq_document_group_workspace_name'
                        """,
                Integer.class
        );
        assertEquals(1, uniqueModule);
    }

    @Test
    void rerunningMigrationsIsIdempotent() {
        flyway.migrate();
        flyway.migrate();
        assertTrue(flyway.info().current() != null);
    }
}
