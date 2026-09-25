package com.intellidoc.backend.service;

import com.intellidoc.backend.client.AiServiceClient;
import com.intellidoc.backend.dms.ProcessingStatus;
import com.intellidoc.backend.dto.DocumentUploadResponseDto;
import com.intellidoc.backend.exception.ApiException;
import com.intellidoc.backend.model.DocumentEntity;
import com.intellidoc.backend.model.DocumentGroupEntity;
import com.intellidoc.backend.model.WorkspaceEntity;
import com.intellidoc.backend.repository.DocumentGroupRepository;
import com.intellidoc.backend.repository.DocumentRepository;
import com.intellidoc.backend.security.AuthPrincipal;
import com.intellidoc.backend.storage.MinioStorageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DocumentServiceTest {

    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID WORKSPACE_ID = UUID.fromString("00000000-0000-0000-0000-000000000010");
    private static final UUID MODULE_ID = UUID.fromString("00000000-0000-0000-0000-000000000020");

    @Mock
    private WorkspaceAccessService workspaceAccessService;
    @Mock
    private ModuleService moduleService;
    @Mock
    private DocumentRepository documentRepository;
    @Mock
    private DocumentGroupRepository documentGroupRepository;
    @Mock
    private DocumentWriteService documentWriteService;
    @Mock
    private MinioStorageService minioStorageService;
    @Mock
    private AiServiceClient aiServiceClient;

    private DocumentService documentService;

    @BeforeEach
    void setUp() {
        documentService = new DocumentService(
                workspaceAccessService,
                moduleService,
                documentRepository,
                documentGroupRepository,
                documentWriteService,
                minioStorageService,
                aiServiceClient,
                1024,
                "pdf,docx"
        );
        when(workspaceAccessService.requireMember(eq(WORKSPACE_ID), eq(USER_ID)))
                .thenReturn(WorkspaceEntity.builder().id(WORKSPACE_ID).build());
    }

    @Test
    void topLevelFolderUsesFirstSegmentOnly() {
        assertEquals("Finance", DocumentService.topLevelFolder("Finance/Contracts/Q3.pdf"));
        assertNull(DocumentService.topLevelFolder("loose-memo.docx"));
        assertNull(DocumentService.topLevelFolder(""));
    }

    @Test
    void mixedBatchAcceptsPdfAndRejectsXlsxWithoutStoringInvalidFile() {
        MockMultipartFile pdf = new MockMultipartFile("files", "ok.pdf", "application/pdf", new byte[]{1, 2, 3});
        MockMultipartFile xlsx = new MockMultipartFile("files", "bad.xlsx", "application/vnd.ms-excel", new byte[]{1});
        when(documentWriteService.saveUploaded(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(documentGroupRepository.findById(any())).thenReturn(java.util.Optional.empty());

        DocumentUploadResponseDto result = documentService.upload(
                new AuthPrincipal(USER_ID, TENANT_ID),
                WORKSPACE_ID,
                List.of(pdf, xlsx),
                null
        );

        assertEquals(1, result.getDocuments().size());
        assertEquals(ProcessingStatus.UPLOADED, result.getDocuments().get(0).getProcessingStatus());
        assertEquals(1, result.getRejections().size());
        assertEquals("UNSUPPORTED_FILE_TYPE", result.getRejections().get(0).getCode());
        verify(minioStorageService, times(1)).store(anyString(), any(), any());
        verify(aiServiceClient).triggerProcessing(any());
    }

    @Test
    void oversizedFileIsRejectedBeforeStorage() {
        byte[] tooBig = new byte[1025];
        MockMultipartFile pdf = new MockMultipartFile("files", "big.pdf", "application/pdf", tooBig);

        DocumentUploadResponseDto result = documentService.upload(
                new AuthPrincipal(USER_ID, TENANT_ID),
                WORKSPACE_ID,
                List.of(pdf),
                null
        );

        assertTrue(result.getDocuments() == null || result.getDocuments().isEmpty());
        assertEquals("FILE_TOO_LARGE", result.getRejections().get(0).getCode());
        verify(minioStorageService, never()).store(anyString(), any(), any());
        verify(documentWriteService, never()).saveUploaded(any());
    }

    @Test
    void storesAtWorkspaceDocumentOriginalPath() {
        MockMultipartFile pdf = new MockMultipartFile("files", "ok.pdf", "application/pdf", new byte[]{1, 2});
        when(documentWriteService.saveUploaded(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(documentGroupRepository.findById(any())).thenReturn(java.util.Optional.empty());

        documentService.upload(new AuthPrincipal(USER_ID, TENANT_ID), WORKSPACE_ID, List.of(pdf), null);

        ArgumentCaptor<String> path = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<DocumentEntity> entity = ArgumentCaptor.forClass(DocumentEntity.class);
        verify(minioStorageService).store(path.capture(), any(), any());
        verify(documentWriteService).saveUploaded(entity.capture());
        assertTrue(path.getValue().startsWith("workspace/" + WORKSPACE_ID + "/document/"));
        assertTrue(path.getValue().endsWith("/original.pdf"));
        assertEquals(path.getValue(), entity.getValue().getStoragePath());
        assertEquals(entity.getValue().getId().toString(), path.getValue().split("/")[3]);
    }

    @Test
    void folderPathCreatesModuleAndLooseFileStaysUnassigned() {
        MockMultipartFile report = new MockMultipartFile("files", "Q3report.pdf", "application/pdf", new byte[]{1});
        MockMultipartFile loose = new MockMultipartFile("files", "loose-memo.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document", new byte[]{2});
        when(moduleService.findOrCreate(WORKSPACE_ID, "Finance"))
                .thenReturn(DocumentGroupEntity.builder().id(MODULE_ID).workspaceId(WORKSPACE_ID).name("Finance").build());
        when(documentWriteService.saveUploaded(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(documentGroupRepository.findById(MODULE_ID))
                .thenReturn(java.util.Optional.of(DocumentGroupEntity.builder().id(MODULE_ID).name("Finance").build()));

        DocumentUploadResponseDto result = documentService.upload(
                new AuthPrincipal(USER_ID, TENANT_ID),
                WORKSPACE_ID,
                List.of(report, loose),
                List.of("Finance/Q3report.pdf", "loose-memo.docx")
        );

        assertEquals(MODULE_ID, result.getDocuments().get(0).getModuleId());
        assertEquals("Finance", result.getDocuments().get(0).getModuleName());
        assertNull(result.getDocuments().get(1).getModuleId());
        verify(moduleService).findOrCreate(WORKSPACE_ID, "Finance");
    }

    @Test
    void uploadToModuleAssignsEveryAcceptedFile() {
        MockMultipartFile pdf = new MockMultipartFile("files", "ok.pdf", "application/pdf", new byte[]{1, 2});
        when(moduleService.requireModule(MODULE_ID)).thenReturn(
                DocumentGroupEntity.builder().id(MODULE_ID).workspaceId(WORKSPACE_ID).name("Finance").build());
        when(documentWriteService.saveUploaded(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(documentGroupRepository.findById(MODULE_ID))
                .thenReturn(java.util.Optional.of(DocumentGroupEntity.builder().id(MODULE_ID).name("Finance").build()));

        DocumentUploadResponseDto result = documentService.uploadToModule(
                new AuthPrincipal(USER_ID, TENANT_ID),
                MODULE_ID,
                List.of(pdf)
        );

        assertEquals(MODULE_ID, result.getDocuments().get(0).getModuleId());
        assertEquals("Finance", result.getDocuments().get(0).getModuleName());
        ArgumentCaptor<DocumentEntity> entity = ArgumentCaptor.forClass(DocumentEntity.class);
        verify(documentWriteService).saveUploaded(entity.capture());
        assertEquals(MODULE_ID, entity.getValue().getGroupId());
        assertEquals(WORKSPACE_ID, entity.getValue().getWorkspaceId());
        verify(moduleService, never()).findOrCreate(any(), any());
    }

    @Test
    void retryRejectedWhenNotFailed() {
        UUID documentId = UUID.randomUUID();
        when(documentRepository.findByIdAndDeletedAtIsNull(documentId))
                .thenReturn(java.util.Optional.of(DocumentEntity.builder()
                        .id(documentId)
                        .workspaceId(WORKSPACE_ID)
                        .processingStatus(ProcessingStatus.READY)
                        .build()));

        ApiException ex = assertThrows(ApiException.class, () ->
                documentService.retry(new AuthPrincipal(USER_ID, TENANT_ID), documentId));
        assertEquals("INVALID_STATE_TRANSITION", ex.getCode());
        assertEquals(409, ex.getStatus());
    }

    @Test
    void getOriginalReturnsStoredBytesAsIs() {
        UUID documentId = UUID.randomUUID();
        String storagePath = "workspace/" + WORKSPACE_ID + "/document/" + documentId + "/original.pdf";
        byte[] original = new byte[]{9, 8, 7};
        when(documentRepository.findByIdAndDeletedAtIsNull(documentId))
                .thenReturn(java.util.Optional.of(DocumentEntity.builder()
                        .id(documentId)
                        .workspaceId(WORKSPACE_ID)
                        .fileName("sample.pdf")
                        .fileType("pdf")
                        .storagePath(storagePath)
                        .processingStatus(ProcessingStatus.UPLOADED)
                        .build()));
        when(minioStorageService.load(storagePath))
                .thenReturn(new MinioStorageService.StoredObject(original, "application/pdf"));

        var file = documentService.getOriginal(new AuthPrincipal(USER_ID, TENANT_ID), documentId);

        assertArrayEquals(original, file.getBytes());
        assertEquals("application/pdf", file.getContentType());
        assertEquals("sample.pdf", file.getFileName());
        verify(workspaceAccessService).requireMember(WORKSPACE_ID, USER_ID);
    }
}
