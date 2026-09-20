package com.intellidoc.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonPropertyOrder({
        "id",
        "title",
        "status",
        "uploaded_date",
        "files_count",
        "sections_count",
        "files"
})
public class FolderDocumentResponseDto {

    private String id;

    private String title;

    private String status;

    @JsonProperty("uploaded_date")
    private OffsetDateTime uploadedDate;

    @JsonProperty("files_count")
    private String filesCount;

    @JsonProperty("sections_count")
    private String sectionsCount;

    private List<FolderFileResponseDto> files;
}