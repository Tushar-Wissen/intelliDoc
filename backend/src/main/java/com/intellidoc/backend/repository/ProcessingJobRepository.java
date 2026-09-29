package com.intellidoc.backend.repository;

import com.intellidoc.backend.model.ProcessingJobEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ProcessingJobRepository extends JpaRepository<ProcessingJobEntity, UUID> {
}
