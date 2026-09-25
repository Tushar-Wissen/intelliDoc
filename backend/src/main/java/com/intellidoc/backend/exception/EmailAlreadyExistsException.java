package com.intellidoc.backend.exception;

import org.springframework.http.HttpStatus;

public class EmailAlreadyExistsException extends ApiException {

    public EmailAlreadyExistsException() {
        super(
                HttpStatus.CONFLICT.value(),
                "AUTH_EMAIL_ALREADY_EXISTS",
                "An account with this email already exists."
        );
    }
}
