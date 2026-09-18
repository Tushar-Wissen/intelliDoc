package com.intellidoc.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DocumentTextBlockDto {

    private String text;

    private String type;

    @JsonProperty("page_number")
    private Integer pageNumber;

    private Double x;

    private Double y;

    private Double width;

    private Double height;

    @JsonProperty("font_size")
    private Double fontSize;

    private Boolean bold;

    private Boolean italic;
}