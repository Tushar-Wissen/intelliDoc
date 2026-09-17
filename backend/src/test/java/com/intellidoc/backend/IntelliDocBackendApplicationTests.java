package com.intellidoc.backend;

import com.intellidoc.backend.client.AiServiceClient;
import com.intellidoc.backend.dto.AiAnalysisRequestDto;
import com.intellidoc.backend.dto.AiAnalysisResponseDto;
import com.intellidoc.backend.dto.AiExtractionResponseDto;
import com.intellidoc.backend.dto.DocumentUploadDto;
import com.intellidoc.backend.dto.DocumentResponseDto;
import com.intellidoc.backend.service.DocumentService;
import com.intellidoc.backend.repository.ProcessingJobRepository;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.mock.web.MockMultipartFile;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;

@SpringBootTest
@ActiveProfiles("test")
class IntelliDocBackendApplicationTests {

    @Autowired
    private DocumentService documentService;

    @Autowired
    private ProcessingJobRepository processingJobRepository;

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
        assertEquals("READY", result.getStatus());
        assertEquals("Test Summary", result.getSummary());
        assertEquals("POSITIVE", result.getSentiment());
        assertEquals(0.95, result.getConfidenceScore());
        assertEquals(3, processingJobRepository.findAllByDocumentIdOrderByStartedAtAsc(result.getId()).size());
    }

    @Test
    void testGetAllDocuments() {
        List<DocumentResponseDto> documents = documentService.getAllDocuments();
        assertNotNull(documents);
    }

        @Test
        void testProcessAndSaveUploadedDocumentUsesExtractedText() {
        AiExtractionResponseDto extraction = new AiExtractionResponseDto();
        extraction.setCombinedText("[Page 1]\nExtracted contract text.");
        Mockito.when(aiServiceClient.extractDocument(any(), any()))
            .thenReturn(extraction);

        AiAnalysisResponseDto analysis = AiAnalysisResponseDto.builder()
            .summary("Extracted contract summary")
            .sentiment("NEUTRAL")
            .confidenceScore(0.9)
            .entities(List.of("Contract"))
            .keyTopics(List.of("Agreement"))
            .build();
        Mockito.when(aiServiceClient.analyzeDocument(any(AiAnalysisRequestDto.class)))
            .thenReturn(analysis);

        MockMultipartFile file = new MockMultipartFile(
            "file", "contract.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "binary document".getBytes());

        DocumentResponseDto result = documentService.processAndSaveUploadedDocument(file);

        assertEquals("READY", result.getStatus());
        assertEquals("[Page 1]\nExtracted contract text.", result.getContent());
        Mockito.verify(aiServiceClient).extractDocument(any(), any());
        }
}
