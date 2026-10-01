package com.intellidoc.backend.exception;

import org.springframework.http.HttpStatus;

public class InvalidOldPasswordException extends ApiException {

    public InvalidOldPasswordException() {
        super(
                HttpStatus.BAD_REQUEST.value(),
                "AUTH_INVALID_OLD_PASSWORD",
                "Current password is incorrect."
        );
    }
}