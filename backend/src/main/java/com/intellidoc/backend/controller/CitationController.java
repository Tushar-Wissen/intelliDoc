package com.intellidoc.backend.controller;

import com.intellidoc.backend.chat.CitationService;
import com.intellidoc.backend.chat.SourcePassageService;
import com.intellidoc.backend.dto.CitationDto;
import com.intellidoc.backend.dto.SourcePassageDto;
import com.intellidoc.backend.security.AuthPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class CitationController {

    private final CitationService citationService;
    private final SourcePassageService sourcePassageService;

    @GetMapping({"/messages/{messageId}/citations", "/api/v1/messages/{messageId}/citations"})
    public ResponseEntity<List<CitationDto>> getCitations(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID messageId) {
        return ResponseEntity.ok(citationService.getCitationsForMessage(principal, messageId));
    }

    @GetMapping({"/citations/{citationId}/source", "/api/v1/citations/{citationId}/source"})
    public ResponseEntity<SourcePassageDto> getSourcePassage(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID citationId) {
        return ResponseEntity.ok(sourcePassageService.getSourcePassage(principal, citationId));
    }
}
