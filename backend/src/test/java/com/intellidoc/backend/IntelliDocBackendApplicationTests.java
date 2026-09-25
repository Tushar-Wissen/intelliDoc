package com.intellidoc.backend;

import com.intellidoc.backend.client.AiServiceClient;
import com.intellidoc.backend.service.DocumentService;
import com.intellidoc.backend.storage.MinioStorageService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.assertNotNull;

@SpringBootTest
@ActiveProfiles("test")
class IntelliDocBackendApplicationTests {

    @Autowired
    private DocumentService documentService;

    @MockBean
    private AiServiceClient aiServiceClient;

    @MockBean
    private MinioStorageService minioStorageService;

    @Test
    void contextLoads() {
        assertNotNull(documentService);
    }
}
