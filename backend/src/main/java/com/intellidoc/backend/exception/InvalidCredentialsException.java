package com.intellidoc.backend.exception;

import org.springframework.http.HttpStatus;

public class InvalidCredentialsException extends ApiException {

    public InvalidCredentialsException() {
        super(
                HttpStatus.UNAUTHORIZED.value(),
                "AUTH_INVALID_CREDENTIALS",
                "Invalid email or password."
        );
    }
}
