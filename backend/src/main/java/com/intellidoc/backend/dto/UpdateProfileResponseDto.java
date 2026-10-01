package com.intellidoc.backend.dto;

import com.intellidoc.backend.dto.UserProfileDto;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateProfileResponseDto {

    private String message;
    private UserProfileDto user;
}