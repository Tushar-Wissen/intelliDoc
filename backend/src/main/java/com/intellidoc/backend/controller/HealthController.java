package com.intellidoc.backend.controller;

import com.intellidoc.backend.client.AiServiceClient;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/health")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class HealthController {

    private final AiServiceClient aiServiceClient;

    @GetMapping
    public ResponseEntity<Map<String, Object>> getHealthStatus() {
        Map<String, Object> healthInfo = new HashMap<>();
        healthInfo.put("status", "UP");
        healthInfo.put("service", "intellidoc-backend");
        healthInfo.put("version", "1.0.0");
        healthInfo.put("timestamp", System.currentTimeMillis());

        Map<String, Object> aiHealth = aiServiceClient.checkHealth();
        healthInfo.put("ai_service", aiHealth);

        return ResponseEntity.ok(healthInfo);
    }
}
