package com.intellidoc.backend.exception;

import org.springframework.http.HttpStatus;

public class UserNotFoundException extends ApiException {

    public UserNotFoundException() {
        super(
                HttpStatus.UNAUTHORIZED.value(),
                "AUTH_TOKEN_INVALID",
                "Session expired or invalid."
        );
    }
}
