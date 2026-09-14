package com.intellidoc.backend;

import com.intellidoc.backend.client.AiServiceClient;
import com.intellidoc.backend.dto.AiAnalysisRequestDto;
import com.intellidoc.backend.dto.AiAnalysisResponseDto;
import com.intellidoc.backend.dto.DocumentUploadDto;
import com.intellidoc.backend.dto.DocumentResponseDto;
import com.intellidoc.backend.service.DocumentService;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;

@SpringBootTest
@ActiveProfiles("test")
class IntelliDocBackendApplicationTests {

    @Autowired
    private DocumentService documentService;

    @MockBean
    private AiServiceClient aiServiceClient;

    @Test
    void contextLoads() {
        assertNotNull(documentService);
    }

    @Test
    void testProcessAndSaveDocumentSuccess() {
        // Mock AI Service Response
        AiAnalysisResponseDto mockResponse = AiAnalysisResponseDto.builder()
                .documentId("doc_test_1")
                .summary("Test Summary")
                .sentiment("POSITIVE")
                .confidenceScore(0.95)
                .entities(List.of("IntelliDoc", "Test"))
                .keyTopics(List.of("Architecture"))
                .build();

        Mockito.when(aiServiceClient.analyzeDocument(any(AiAnalysisRequestDto.class)))
                .thenReturn(mockResponse);

        DocumentUploadDto uploadDto = DocumentUploadDto.builder()
                .title("Test Document.txt")
                .content("IntelliDoc Spring Boot backend unit test content.")
                .contentType("text/plain")
                .build();

        DocumentResponseDto result = documentService.processAndSaveDocument(uploadDto);

        assertNotNull(result);
        assertNotNull(result.getId());
        assertEquals("Test Document.txt", result.getTitle());
        assertEquals("COMPLETED", result.getStatus());
        assertEquals("Test Summary", result.getSummary());
        assertEquals("POSITIVE", result.getSentiment());
        assertEquals(0.95, result.getConfidenceScore());
    }

    @Test
    void testGetAllDocuments() {
        List<DocumentResponseDto> documents = documentService.getAllDocuments();
        assertNotNull(documents);
    }
}
