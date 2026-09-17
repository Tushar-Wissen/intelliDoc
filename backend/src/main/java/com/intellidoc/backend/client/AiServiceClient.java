package com.intellidoc.backend.client;

import com.intellidoc.backend.dto.AiAnalysisRequestDto;
import com.intellidoc.backend.dto.AiAnalysisResponseDto;
import com.intellidoc.backend.dto.AiExtractionResponseDto;
import com.intellidoc.backend.dto.AiQARequestDto;
import com.intellidoc.backend.dto.AiQAResponseDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

@Component
@Slf4j
public class AiServiceClient {

    private final RestClient restClient;

    public AiServiceClient(@Value("${intellidoc.ai-service.url:http://ai-service:8000}") String baseUrl) {
        log.info("Initializing AiServiceClient targeting: {}", baseUrl);
        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .build();
    }

    public Map<String, Object> checkHealth() {
        try {
            return restClient.get()
                    .uri("/health")
                    .retrieve()
                    .body(Map.class);
        } catch (Exception e) {
            log.error("Failed to connect to Python AI Service health endpoint", e);
            return Map.of("status", "DOWN", "error", e.getMessage());
        }
    }

    public AiAnalysisResponseDto analyzeDocument(AiAnalysisRequestDto request) {
        log.info("Dispatching document ID {} to AI Service for analysis", request.getDocumentId());
        try {
            return restClient.post()
                    .uri("/api/v1/analyze")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(request)
                    .retrieve()
                    .body(AiAnalysisResponseDto.class);
        } catch (Exception e) {
            log.error("Error invoking AI Service /api/v1/analyze", e);
            throw new RuntimeException("AI Service processing error: " + e.getMessage(), e);
        }
    }

    public AiExtractionResponseDto extractDocument(String documentId, MultipartFile file) {
        log.info("Dispatching document ID {} to AI Service for extraction", documentId);
        try {
            ByteArrayResource resource = new ByteArrayResource(file.getBytes()) {
                @Override
                public String getFilename() {
                    return file.getOriginalFilename();
                }
            };
            MultipartBodyBuilder bodyBuilder = new MultipartBodyBuilder();
            bodyBuilder.part("document_id", documentId);
            bodyBuilder.part("file", resource)
                    .filename(file.getOriginalFilename())
                    .contentType(file.getContentType() != null
                            ? MediaType.parseMediaType(file.getContentType())
                            : MediaType.APPLICATION_OCTET_STREAM);

            return restClient.post()
                    .uri("/api/v1/extract/file")
                    .body(bodyBuilder.build())
                    .retrieve()
                    .body(AiExtractionResponseDto.class);
        } catch (Exception e) {
            log.error("Error invoking AI Service /api/v1/extract/file", e);
            throw new RuntimeException("AI Service extraction error: " + e.getMessage(), e);
        }
    }

    public AiQAResponseDto askQuestion(AiQARequestDto request) {
        log.info("Dispatching Q&A request for document ID {}", request.getDocumentId());
        try {
            return restClient.post()
                    .uri("/api/v1/qa")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(request)
                    .retrieve()
                    .body(AiQAResponseDto.class);
        } catch (Exception e) {
            log.error("Error invoking AI Service /api/v1/qa", e);
            throw new RuntimeException("AI Service Q&A processing error: " + e.getMessage(), e);
        }
    }
}
