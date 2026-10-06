package com.intellidoc.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiSuccessRateResponseDto {
    private Integer percentage;
    private Long answeredCount;
    private Long totalCount;
    private String weeklyChange;
    private String unansweredTopic;
}