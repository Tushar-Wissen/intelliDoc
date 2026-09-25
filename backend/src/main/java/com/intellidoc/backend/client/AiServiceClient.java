package com.intellidoc.backend.client;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intellidoc.backend.dto.AiChatAnswerRequestDto;
import com.intellidoc.backend.dto.AiChatAnswerResponseDto;
import com.intellidoc.backend.dto.AiAnalysisRequestDto;
import com.intellidoc.backend.dto.AiAnalysisResponseDto;
import com.intellidoc.backend.dto.AiQARequestDto;
import com.intellidoc.backend.dto.AiQAResponseDto;
import com.intellidoc.backend.dto.DocumentProcessRequestDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@Component
@Slf4j
public class AiServiceClient {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final String baseUrl;

    public AiServiceClient(
            @Value("${intellidoc.ai-service.url:http://ai-service:8000}")
            String baseUrl,
            @Value("${intellidoc.chat.upstream.timeout-ms:120000}")
            int upstreamTimeoutMs,
            ObjectMapper objectMapper) {

        this.baseUrl = baseUrl;
        this.objectMapper = objectMapper;

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(upstreamTimeoutMs);
        requestFactory.setReadTimeout(upstreamTimeoutMs);
        this.restTemplate = new RestTemplate(requestFactory);

        log.info(
                "Initializing AiServiceClient targeting: {} (timeoutMs={})",
                baseUrl,
                upstreamTimeoutMs
        );
    }

    public Map<String, Object> checkHealth() {

        try {

            ResponseEntity<Map> response =
                    restTemplate.getForEntity(
                            baseUrl + "/health",
                            Map.class
                    );

            return response.getBody();

        } catch (Exception e) {

            log.error(
                    "Failed to connect to Python AI Service health endpoint",
                    e
            );

            return Map.of(
                    "status",
                    "DOWN",
                    "error",
                    e.getMessage()
            );
        }
    }

    public AiAnalysisResponseDto analyzeDocument(
            AiAnalysisRequestDto request) {

        log.info(
                "Dispatching document ID {} to AI Service for analysis",
                request.getDocumentId()
        );

        try {

            // Convert request DTO to JSON
            String jsonRequest =
                    objectMapper.writeValueAsString(request);

            log.info(
                    "JSON being sent to Python AI Service: {}",
                    jsonRequest
            );

            // Create HTTP headers
            HttpHeaders headers =
                    new HttpHeaders();

            headers.setContentType(
                    MediaType.APPLICATION_JSON
            );

            headers.setAccept(
                    java.util.List.of(
                            MediaType.APPLICATION_JSON
                    )
            );

            // Create HTTP entity containing headers + JSON body
            HttpEntity<String> httpEntity =
                    new HttpEntity<>(
                            jsonRequest,
                            headers
                    );

            log.info(
                    "Sending POST request to: {}/api/v1/analyze",
                    baseUrl
            );

            ResponseEntity<AiAnalysisResponseDto> response =
                    restTemplate.exchange(
                            baseUrl + "/api/v1/analyze",
                            HttpMethod.POST,
                            httpEntity,
                            AiAnalysisResponseDto.class
                    );

            log.info(
                    "AI Service responded with status: {}",
                    response.getStatusCode()
            );

            return response.getBody();

        } catch (JsonProcessingException e) {

            log.error(
                    "Failed to convert AI analysis request to JSON",
                    e
            );

            throw new RuntimeException(
                    "Failed to create AI Service request: "
                            + e.getMessage(),
                    e
            );

        } catch (Exception e) {

            log.error(
                    "Error invoking AI Service /api/v1/analyze",
                    e
            );

            throw new RuntimeException(
                    "AI Service processing error: "
                            + e.getMessage(),
                    e
            );
        }
    }

    public AiQAResponseDto askQuestion(
            AiQARequestDto request) {

        log.info(
                "Dispatching Q&A request for document ID {}",
                request.getDocumentId()
        );

        try {

            HttpHeaders headers =
                    new HttpHeaders();

            headers.setContentType(
                    MediaType.APPLICATION_JSON
            );

            headers.setAccept(
                    java.util.List.of(
                            MediaType.APPLICATION_JSON
                    )
            );

            HttpEntity<AiQARequestDto> httpEntity =
                    new HttpEntity<>(
                            request,
                            headers
                    );

            ResponseEntity<AiQAResponseDto> response =
                    restTemplate.exchange(
                            baseUrl + "/api/v1/qa",
                            HttpMethod.POST,
                            httpEntity,
                            AiQAResponseDto.class
                    );

            return response.getBody();

        } catch (Exception e) {

            log.error(
                    "Error invoking AI Service /api/v1/qa",
                    e
            );

            throw new RuntimeException(
                    "AI Service Q&A processing error: "
                            + e.getMessage(),
                    e
            );
        }
    }

    public AiChatAnswerResponseDto generateChatAnswer(AiChatAnswerRequestDto request) {
        log.info(
                "Dispatching chat answer request sessionId={} workspaceId={} documentCount={}",
                request.getSessionId(),
                request.getWorkspaceId(),
                request.getResolvedDocumentIds() != null ? request.getResolvedDocumentIds().size() : 0
        );

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setAccept(java.util.List.of(MediaType.APPLICATION_JSON));

            HttpEntity<AiChatAnswerRequestDto> entity = new HttpEntity<>(request, headers);

            ResponseEntity<AiChatAnswerResponseDto> response = restTemplate.exchange(
                    baseUrl + "/internal/ai/chat/answer",
                    HttpMethod.POST,
                    entity,
                    AiChatAnswerResponseDto.class
            );

            return response.getBody();
        } catch (Exception e) {
            log.error("Error invoking AI Service /internal/ai/chat/answer", e);
            throw new RuntimeException(
                    "AI Service chat answer error: " + e.getMessage(),
                    e
            );
        }
    }

    public void triggerProcessing(java.util.UUID documentId) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<DocumentProcessRequestDto> entity = new HttpEntity<>(
                    DocumentProcessRequestDto.builder().documentId(documentId).build(),
                    headers
            );
            restTemplate.exchange(
                    baseUrl + "/internal/ai/documents/process",
                    HttpMethod.POST,
                    entity,
                    Void.class
            );
            log.info("Triggered AI processing for document {}", documentId);
        } catch (Exception e) {
            log.error(
                    "PROCESSING_TRIGGER_FAILED documentId={} aiServiceUrl={} — document remains UPLOADED; "
                            + "check ai-service health and Celery worker logs",
                    documentId,
                    baseUrl,
                    e
            );
        }
    }
}