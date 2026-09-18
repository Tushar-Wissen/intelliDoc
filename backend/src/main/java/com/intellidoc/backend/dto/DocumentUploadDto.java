package com.intellidoc.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.web.multipart.MultipartFile;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DocumentUploadDto {

    @NotBlank(message = "Document title is required")
    private String title;

    private MultipartFile file;

    private String contentType;
}
