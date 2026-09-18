package com.intellidoc.backend;

import com.intellidoc.backend.client.AiServiceClient;
import com.intellidoc.backend.dto.AiAnalysisRequestDto;
import com.intellidoc.backend.dto.AiAnalysisResponseDto;
import com.intellidoc.backend.dto.DocumentModuleDto;
import com.intellidoc.backend.dto.DocumentResponseDto;
import com.intellidoc.backend.dto.StructuredDocumentDto;
import com.intellidoc.backend.service.DocumentService;
import com.intellidoc.backend.util.DocumentStructureExtractor;
import com.intellidoc.backend.util.DocumentTextExtractor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;

@SpringBootTest
@ActiveProfiles("test")
class IntelliDocBackendApplicationTests {

    @Autowired
    private DocumentService documentService;

    @MockBean
    private AiServiceClient aiServiceClient;

    @MockBean
    private DocumentStructureExtractor documentStructureExtractor;

    @MockBean
    private DocumentTextExtractor documentTextExtractor;

    private MockMultipartFile testFile;

    private static final String WORKSPACE_ID = "ws_test_001";

    @BeforeEach
    void setUp() throws Exception {

        /*
         * Create a simple mock uploaded document.
         *
         * We are not using a real PDF here because these tests
         * should test DocumentService behavior, not PDFBox/OCR.
         */
        testFile = new MockMultipartFile(
                "file",
                "Test Document.txt",
                "text/plain",
                "IntelliDoc Spring Boot backend test document content."
                        .getBytes(StandardCharsets.UTF_8)
        );

        /*
         * Mock structured document extraction.
         */
        StructuredDocumentDto structuredDocument =
                StructuredDocumentDto.builder()
                        .content(
                                "IntelliDoc Spring Boot backend test document content."
                        )
                        .blocks(List.of())
                        .build();

        Mockito.when(documentStructureExtractor.extract(any()))
                .thenReturn(structuredDocument);

        /*
         * Mock normal text extraction as well.
         *
         * This prevents the test from depending on the actual
         * file extraction implementation.
         */
        Mockito.when(documentTextExtractor.extractText(any()))
                .thenReturn(
                        "IntelliDoc Spring Boot backend test document content."
                );

        /*
         * Mock AI analysis response.
         */
        AiAnalysisResponseDto mockResponse =
                AiAnalysisResponseDto.builder()
                        .documentId("doc_test")
                        .summary("Test document summary")
                        .sentiment("POSITIVE")
                        .confidenceScore(0.95)
                        .entities(List.of(
                                "IntelliDoc",
                                "Spring Boot"
                        ))
                        .keyTopics(List.of(
                                "Java",
                                "Backend"
                        ))
                        .modules(List.of(
                                DocumentModuleDto.builder()
                                        .moduleNumber("1")
                                        .moduleName("Introduction")
                                        .children(List.of())
                                        .build(),
                                DocumentModuleDto.builder()
                                        .moduleNumber("2")
                                        .moduleName("Backend")
                                        .children(List.of())
                                        .build()
                        ))
                        .build();

        Mockito.when(
                aiServiceClient.analyzeDocument(
                        any(AiAnalysisRequestDto.class)
                )
        ).thenAnswer(invocation -> {

            AiAnalysisRequestDto request =
                    invocation.getArgument(0);

            /*
             * Return the same document ID that the service sends.
             * This makes the mock more realistic.
             */
            return AiAnalysisResponseDto.builder()
                    .documentId(request.getDocumentId())
                    .summary("Test document summary")
                    .sentiment("POSITIVE")
                    .confidenceScore(0.95)
                    .entities(List.of(
                            "IntelliDoc",
                            "Spring Boot"
                    ))
                    .keyTopics(List.of(
                            "Java",
                            "Backend"
                    ))
                    .modules(List.of(
                            DocumentModuleDto.builder()
                                    .moduleNumber("1")
                                    .moduleName("Introduction")
                                    .children(List.of())
                                    .build(),
                            DocumentModuleDto.builder()
                                    .moduleNumber("2")
                                    .moduleName("Backend")
                                    .children(List.of())
                                    .build()
                    ))
                    .build();
        });
    }

    /**
     * Test 1:
     * Verify that the Spring Boot application context loads
     * and DocumentService is available.
     */
    @Test
    void contextLoads() {

        assertNotNull(documentService);
    }

    /**
     * Test 2:
     * Verify that a document can be uploaded and processed
     * for a specific workspace.
     */
    @Test
    void testProcessAndSaveDocumentSuccess() throws Exception {

        String workspaceId = WORKSPACE_ID;

        DocumentResponseDto result =
                documentService.processAndSaveDocument(
                        workspaceId,
                        testFile,
                        "Test Document.txt"
                );

        assertNotNull(result);

        assertNotNull(result.getId());

        assertEquals(
                "Test Document.txt",
                result.getTitle()
        );

        assertEquals(
                "COMPLETED",
                result.getStatus()
        );

        /*
         * Verify that modules returned by the AI service
         * are present in the document response.
         */
        assertNotNull(result.getModules());

        assertEquals(
                2,
                result.getModules().size()
        );

        assertEquals(
                "Introduction",
                result.getModules().get(0).getModuleName()
        );

        assertEquals(
                "Backend",
                result.getModules().get(1).getModuleName()
        );

        /*
         * Verify that the AI service was called.
         */
        Mockito.verify(
                aiServiceClient,
                Mockito.atLeastOnce()
        ).analyzeDocument(
                any(AiAnalysisRequestDto.class)
        );
    }

    /**
     * Test 3:
     * Verify that documents can be retrieved using workspace ID.
     */
    @Test
    void testGetAllDocumentsByWorkspace() throws Exception {

        String workspaceId = "ws_get_all_test";

        /*
         * First create a document inside this workspace.
         */
        DocumentResponseDto savedDocument =
                documentService.processAndSaveDocument(
                        workspaceId,
                        testFile,
                        "Workspace Test Document.txt"
                );

        assertNotNull(savedDocument);
        assertNotNull(savedDocument.getId());

        /*
         * Retrieve documents belonging to this workspace.
         */
        List<DocumentResponseDto> documents =
                documentService.getAllDocuments(
                        workspaceId
                );

        assertNotNull(documents);

        assertFalse(
                documents.isEmpty(),
                "Workspace should contain at least one document"
        );

        /*
         * Verify that our uploaded document exists.
         */
        boolean documentFound =
                documents.stream()
                        .anyMatch(document ->
                                savedDocument.getId()
                                        .equals(document.getId())
                        );

        assertTrue(
                documentFound,
                "Uploaded document should be returned for the workspace"
        );
    }

    /**
     * Test 4:
     * Verify that a specific document can be retrieved
     * using both workspace ID and document ID.
     */
    @Test
    void testGetDocumentByIdAndWorkspace() throws Exception {

        String workspaceId = "ws_get_by_id_test";

        DocumentResponseDto savedDocument =
                documentService.processAndSaveDocument(
                        workspaceId,
                        testFile,
                        "Get By ID Test.txt"
                );

        assertNotNull(savedDocument);
        assertNotNull(savedDocument.getId());

        DocumentResponseDto result =
                documentService.getDocumentById(
                        workspaceId,
                        savedDocument.getId()
                );

        assertNotNull(result);

        assertEquals(
                savedDocument.getId(),
                result.getId()
        );

        assertEquals(
                "Get By ID Test.txt",
                result.getTitle()
        );

        assertEquals(
                "COMPLETED",
                result.getStatus()
        );

        assertNotNull(result.getModules());

        assertEquals(
                2,
                result.getModules().size()
        );
    }

    /**
     * Test 5:
     * Verify workspace isolation.
     *
     * A document created in Workspace A should not be
     * accessible through Workspace B.
     */
    @Test
    void testDocumentCannotBeAccessedFromDifferentWorkspace()
            throws Exception {

        String workspaceA = "ws_a_test";
        String workspaceB = "ws_b_test";

        DocumentResponseDto savedDocument =
                documentService.processAndSaveDocument(
                        workspaceA,
                        testFile,
                        "Workspace A Document.txt"
                );

        assertNotNull(savedDocument);
        assertNotNull(savedDocument.getId());

        /*
         * Try to retrieve the document using another workspace.
         */
        assertThrows(
                RuntimeException.class,
                () -> documentService.getDocumentById(
                        workspaceB,
                        savedDocument.getId()
                )
        );
    }

    /**
     * Test 6:
     * Verify that getAllDocuments() only returns documents
     * belonging to the requested workspace.
     */
    @Test
    void testGetAllDocumentsWorkspaceIsolation()
            throws Exception {

        String workspaceA = "ws_isolation_a";
        String workspaceB = "ws_isolation_b";

        /*
         * Create one document in Workspace A.
         */
        DocumentResponseDto documentA =
                documentService.processAndSaveDocument(
                        workspaceA,
                        testFile,
                        "Document A.txt"
                );

        /*
         * Create one document in Workspace B.
         */
        DocumentResponseDto documentB =
                documentService.processAndSaveDocument(
                        workspaceB,
                        testFile,
                        "Document B.txt"
                );

        assertNotNull(documentA);
        assertNotNull(documentB);

        /*
         * Get Workspace A documents.
         */
        List<DocumentResponseDto> workspaceADocuments =
                documentService.getAllDocuments(
                        workspaceA
                );

        /*
         * Get Workspace B documents.
         */
        List<DocumentResponseDto> workspaceBDocuments =
                documentService.getAllDocuments(
                        workspaceB
                );

        assertNotNull(workspaceADocuments);
        assertNotNull(workspaceBDocuments);

        /*
         * Workspace A should contain its document.
         */
        assertTrue(
                workspaceADocuments.stream()
                        .anyMatch(document ->
                                documentA.getId()
                                        .equals(document.getId())
                        )
        );

        /*
         * Workspace A should NOT contain Workspace B document.
         */
        assertFalse(
                workspaceADocuments.stream()
                        .anyMatch(document ->
                                documentB.getId()
                                        .equals(document.getId())
                        )
        );

        /*
         * Workspace B should contain its document.
         */
        assertTrue(
                workspaceBDocuments.stream()
                        .anyMatch(document ->
                                documentB.getId()
                                        .equals(document.getId())
                        )
        );

        /*
         * Workspace B should NOT contain Workspace A document.
         */
        assertFalse(
                workspaceBDocuments.stream()
                        .anyMatch(document ->
                                documentA.getId()
                                        .equals(document.getId())
                        )
        );
    }

    /**
     * Test 7:
     * Verify that modules returned by AI analysis
     * are persisted and returned with the document.
     */
    @Test
    void testDocumentModulesAreReturned() throws Exception {

        String workspaceId = "ws_modules_test";

        DocumentResponseDto result =
                documentService.processAndSaveDocument(
                        workspaceId,
                        testFile,
                        "Modules Test.txt"
                );

        assertNotNull(result);

        assertNotNull(result.getModules());

        assertEquals(
                2,
                result.getModules().size()
        );

        DocumentModuleDto firstModule =
                result.getModules().get(0);

        assertEquals(
                "1",
                firstModule.getModuleNumber()
        );

        assertEquals(
                "Introduction",
                firstModule.getModuleName()
        );

        assertNotNull(
                firstModule.getChildren()
        );

        DocumentModuleDto secondModule =
                result.getModules().get(1);

        assertEquals(
                "2",
                secondModule.getModuleNumber()
        );

        assertEquals(
                "Backend",
                secondModule.getModuleName()
        );
    }

    /**
     * Test 8:
     * Verify that AI analysis receives the generated document ID,
     * title and extracted content.
     */
    @Test
    void testAiServiceReceivesCorrectDocumentInformation()
            throws Exception {

        String workspaceId = "ws_ai_request_test";

        documentService.processAndSaveDocument(
                workspaceId,
                testFile,
                "AI Request Test.txt"
        );

        Mockito.verify(
                aiServiceClient,
                Mockito.atLeastOnce()
        ).analyzeDocument(
                Mockito.argThat(request ->

                        request != null

                                && request.getDocumentId() != null

                                && "AI Request Test.txt"
                                .equals(request.getTitle())

                                && request.getContent() != null

                                && !request.getContent()
                                .isBlank()
                )
        );
    }
}