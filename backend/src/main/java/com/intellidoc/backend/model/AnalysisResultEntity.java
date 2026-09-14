package com.intellidoc.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.OffsetDateTime;

@Entity
@Table(name = "analysis_results")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AnalysisResultEntity {

    @Id
    @Column(name = "id", length = 64)
    private String id;

    @Column(name = "document_id", nullable = false, length = 64)
    private String documentId;

    @Column(name = "summary", columnDefinition = "TEXT")
    private String summary;

    @Column(name = "sentiment")
    private String sentiment;

    @Column(name = "confidence_score")
    private Double confidenceScore;

    @Column(name = "entities_json", columnDefinition = "TEXT")
    private String entitiesJson;

    @Column(name = "key_topics_json", columnDefinition = "TEXT")
    private String keyTopicsJson;

    @Column(name = "processed_at")
    private OffsetDateTime processedAt;

    @PrePersist
    protected void onCreate() {
        if (this.processedAt == null) {
            this.processedAt = OffsetDateTime.now();
        }
    }
}
