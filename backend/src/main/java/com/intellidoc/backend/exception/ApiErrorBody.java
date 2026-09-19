package com.intellidoc.backend.exception;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Builder;
import lombok.Value;

@Value
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiErrorBody {
    ApiError error;

    @Value
    @Builder
    public static class ApiError {
        String code;
        String message;
        String requestId;
    }
}
