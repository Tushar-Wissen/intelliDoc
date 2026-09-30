package com.intellidoc.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FolderUploadResponseDto {

    private String message;

    private FolderData data;

    @JsonProperty("isError")
    private boolean isError;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class FolderData {

        private String id;

        private String title;

        private String status;

        @JsonProperty("created_at")
        private OffsetDateTime createdAt;

        @JsonProperty("files_count")
        private String filesCount;
    }
}