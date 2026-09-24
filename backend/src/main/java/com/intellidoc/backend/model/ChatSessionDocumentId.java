package com.intellidoc.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.UUID;

@Embeddable
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChatSessionDocumentId implements Serializable {

    @Column(name = "session_id")
    private UUID sessionId;

    @Column(name = "document_id")
    private UUID documentId;
}
