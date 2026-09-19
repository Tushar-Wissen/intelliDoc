package com.intellidoc.backend.exception;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.UUID;

@Slf4j
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiErrorBody> handleApi(ApiException ex, HttpServletRequest request) {
        return respond(ex.getStatus(), ex.getCode(), ex.getMessage(), request);
    }

    @ExceptionHandler({
            MethodArgumentNotValidException.class,
            ConstraintViolationException.class,
            HttpMessageNotReadableException.class
    })
    public ResponseEntity<ApiErrorBody> handleValidation(Exception ex, HttpServletRequest request) {
        log.info("Invalid auth request on {}", request.getRequestURI());
        return respond(
                HttpStatus.BAD_REQUEST.value(),
                "AUTH_INVALID_REQUEST",
                "Email and password are required.",
                request
        );
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiErrorBody> handleAccessDenied(AccessDeniedException ex, HttpServletRequest request) {
        log.warn("Workspace access denied on {}", request.getRequestURI());
        return respond(
                HttpStatus.FORBIDDEN.value(),
                "WORKSPACE_ACCESS_DENIED",
                "Not a member of this workspace.",
                request
        );
    }

    private ResponseEntity<ApiErrorBody> respond(int status, String code, String message, HttpServletRequest request) {
        String requestId = request.getHeader("X-Request-Id");
        if (requestId == null || requestId.isBlank()) {
            requestId = UUID.randomUUID().toString();
        }
        ApiErrorBody body = ApiErrorBody.builder()
                .error(ApiErrorBody.ApiError.builder()
                        .code(code)
                        .message(message)
                        .requestId(requestId)
                        .build())
                .build();
        return ResponseEntity.status(status).body(body);
    }
}
