package com.intellidoc.backend.model;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "chat_session_document")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatSessionDocumentEntity {

    @EmbeddedId
    private ChatSessionDocumentId id;

    public ChatSessionDocumentEntity(java.util.UUID sessionId, java.util.UUID documentId) {
        this.id = new ChatSessionDocumentId(sessionId, documentId);
    }
}
