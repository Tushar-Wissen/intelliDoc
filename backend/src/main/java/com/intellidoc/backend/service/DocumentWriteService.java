package com.intellidoc.backend.service;

import com.intellidoc.backend.dms.ProcessingStatus;
import com.intellidoc.backend.model.DocumentEntity;
import com.intellidoc.backend.model.ProcessingJobEntity;
import com.intellidoc.backend.repository.DocumentRepository;
import com.intellidoc.backend.repository.ProcessingJobRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

@Service
@RequiredArgsConstructor
public class DocumentWriteService {

    private final DocumentRepository documentRepository;
    private final ProcessingJobRepository processingJobRepository;

    @Transactional
    public DocumentEntity saveUploaded(DocumentEntity document) {
        DocumentEntity saved = documentRepository.save(document);
        processingJobRepository.save(ProcessingJobEntity.builder()
                .documentId(saved.getId())
                .stage(ProcessingStatus.PARSING)
                .status(ProcessingStatus.JOB_PENDING)
                .build());
        return saved;
    }

    @Transactional
    public DocumentEntity markParsing(DocumentEntity document) {
        document.setProcessingStatus(ProcessingStatus.PARSING);
        DocumentEntity saved = documentRepository.save(document);
        processingJobRepository.save(ProcessingJobEntity.builder()
                .documentId(saved.getId())
                .stage(ProcessingStatus.PARSING)
                .status(ProcessingStatus.JOB_PENDING)
                .build());
        return saved;
    }

    @Transactional
    public DocumentEntity archive(DocumentEntity document) {
        document.setDeletedAt(OffsetDateTime.now());
        return documentRepository.save(document);
    }

    @Transactional
    public DocumentEntity save(DocumentEntity document) {
        return documentRepository.save(document);
    }
}
