package com.intellidoc.backend.exception;

import org.springframework.http.HttpStatus;

public final class DmsExceptions {

    private DmsExceptions() {
    }

    public static ApiException workspaceInvalidName() {
        return new ApiException(
                HttpStatus.BAD_REQUEST.value(),
                "WORKSPACE_INVALID_NAME",
                "Workspace name is required."
        );
    }

    public static ApiException workspaceAccessDenied() {
        return new ApiException(
                HttpStatus.FORBIDDEN.value(),
                "WORKSPACE_ACCESS_DENIED",
                "Not a member of this workspace."
        );
    }

    public static ApiException workspaceNotFound() {
        return new ApiException(
                HttpStatus.NOT_FOUND.value(),
                "WORKSPACE_NOT_FOUND",
                "Workspace not found."
        );
    }

    public static ApiException unsupportedFileType(String fileName) {
        return new ApiException(
                HttpStatus.UNSUPPORTED_MEDIA_TYPE.value(),
                "UNSUPPORTED_FILE_TYPE",
                "Unsupported file type for " + fileName + ". Only PDF and DOCX are accepted."
        );
    }

    public static ApiException fileTooLarge(String fileName) {
        return new ApiException(
                HttpStatus.PAYLOAD_TOO_LARGE.value(),
                "FILE_TOO_LARGE",
                "File exceeds the configured maximum size: " + fileName
        );
    }

    public static ApiException storageWriteFailed(String fileName) {
        return new ApiException(
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                "STORAGE_WRITE_FAILED",
                "Failed to store file: " + fileName
        );
    }

    public static ApiException storageReadFailed(String fileName) {
        return new ApiException(
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                "STORAGE_READ_FAILED",
                "Failed to read stored file: " + fileName
        );
    }

    public static ApiException moduleNameTaken() {
        return new ApiException(
                HttpStatus.CONFLICT.value(),
                "MODULE_NAME_TAKEN",
                "A module with this name already exists in the workspace."
        );
    }

    public static ApiException moduleInvalidName() {
        return new ApiException(
                HttpStatus.BAD_REQUEST.value(),
                "MODULE_INVALID_NAME",
                "Module name is required."
        );
    }

    public static ApiException moduleNotFound() {
        return new ApiException(
                HttpStatus.NOT_FOUND.value(),
                "MODULE_NOT_FOUND",
                "Module not found."
        );
    }

    public static ApiException invalidModuleScope() {
        return new ApiException(
                HttpStatus.BAD_REQUEST.value(),
                "INVALID_MODULE_SCOPE",
                "Module must belong to the same workspace as the document."
        );
    }

    public static ApiException invalidStateTransition() {
        return new ApiException(
                HttpStatus.CONFLICT.value(),
                "INVALID_STATE_TRANSITION",
                "Retry is only allowed for documents in FAILED status."
        );
    }

    public static ApiException documentNotFound() {
        return new ApiException(
                HttpStatus.NOT_FOUND.value(),
                "DOCUMENT_NOT_FOUND",
                "Document not found."
        );
    }

    public static ApiException fieldNotFound() {
        return new ApiException(
                HttpStatus.NOT_FOUND.value(),
                "FIELD_NOT_FOUND",
                "Extracted field not found."
        );
    }
}
