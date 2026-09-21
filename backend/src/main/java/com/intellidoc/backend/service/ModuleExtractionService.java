package com.intellidoc.backend.service;

import com.intellidoc.backend.dto.DocumentModuleDto;

import java.util.List;

public interface ModuleExtractionService {

    List<DocumentModuleDto> extractModules(
            String content
    );
}