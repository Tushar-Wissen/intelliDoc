package com.intellidoc.backend.client;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intellidoc.backend.dto.AiAnalysisRequestDto;
import com.intellidoc.backend.dto.AiAnalysisResponseDto;
import com.intellidoc.backend.dto.AiQARequestDto;
import com.intellidoc.backend.dto.AiQAResponseDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
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
            ObjectMapper objectMapper) {

        this.baseUrl = baseUrl;
        this.objectMapper = objectMapper;

        this.restTemplate = new RestTemplate();

        log.info(
                "Initializing AiServiceClient targeting: {}",
                baseUrl
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
}