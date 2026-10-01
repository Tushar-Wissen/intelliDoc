package com.intellidoc.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ForgotPasswordRequestDto {

    @NotBlank
    @Email
    private String email;

    @NotBlank
    @Size(min = 6)
    private String newPassword;

    @NotBlank
    private String confirmNewPassword;
}