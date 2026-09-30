package com.intellidoc.backend.exception;

import org.springframework.http.HttpStatus;

public class PasswordMismatchException extends ApiException {

    public PasswordMismatchException() {
        super(
                HttpStatus.BAD_REQUEST.value(),
                "AUTH_PASSWORD_MISMATCH",
                "New password and confirmation do not match."
        );
    }
}