package com.intellidoc.backend.util;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.List;

public final class OverviewTopicsParser {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private OverviewTopicsParser() {
    }

    public static List<String> parse(String overview) {
        if (overview == null || overview.isBlank()) {
            return List.of();
        }
        String trimmed = overview.trim();
        if (trimmed.startsWith("[")) {
            try {
                List<String> topics = MAPPER.readValue(trimmed, new TypeReference<>() {
                });
                return topics.stream()
                        .filter(topic -> topic != null && !topic.isBlank())
                        .map(String::trim)
                        .toList();
            } catch (Exception ignored) {
                // Fall through for legacy plain-text overview values.
            }
        }
        return List.of(trimmed);
    }
}
