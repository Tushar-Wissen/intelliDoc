package com.intellidoc.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class FieldUpdateRequestDto {
    @NotBlank
    private String fieldValue;

    private String status;
}