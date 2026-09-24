package com.intellidoc.backend.dms;

public final class ProcessingStatus {

    public static final String UPLOADED = "UPLOADED";
    public static final String PARSING = "PARSING";
    public static final String EXTRACTING = "EXTRACTING";
    public static final String INDEXING = "INDEXING";
    public static final String READY = "READY";
    public static final String FAILED = "FAILED";

    public static final String JOB_PENDING = "PENDING";
    public static final String JOB_RUNNING = "RUNNING";
    public static final String JOB_COMPLETED = "COMPLETED";
    public static final String JOB_FAILED = "FAILED";

    private ProcessingStatus() {
    }
}
