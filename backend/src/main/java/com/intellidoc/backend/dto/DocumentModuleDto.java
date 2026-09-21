package com.intellidoc.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonPropertyOrder({
        "module_number",
        "module_name",
        "children"
})
public class DocumentModuleDto {

    @JsonProperty("module_number")
    private String moduleNumber;

    @JsonProperty("module_name")
    private String moduleName;

    @Builder.Default
    private List<DocumentModuleDto> children =
            new ArrayList<>();
}