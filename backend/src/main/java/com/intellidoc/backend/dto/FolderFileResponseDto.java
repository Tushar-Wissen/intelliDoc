package com.intellidoc.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonPropertyOrder({
        "files_number",
        "files_name",
        "children"
})
public class FolderFileResponseDto {

    @JsonProperty("files_number")
    private String filesNumber;

    @JsonProperty("files_name")
    private String filesName;

    private List<FolderSectionResponseDto> children;
}