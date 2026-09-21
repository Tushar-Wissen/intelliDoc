package com.intellidoc.backend.dms;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intellidoc.backend.client.AiServiceClient;
import com.intellidoc.backend.model.DocumentEntity;
import com.intellidoc.backend.model.TenantEntity;
import com.intellidoc.backend.model.UserAccountEntity;
import com.intellidoc.backend.repository.DocumentGroupRepository;
import com.intellidoc.backend.repository.DocumentRepository;
import com.intellidoc.backend.repository.ProcessingJobRepository;
import com.intellidoc.backend.repository.TenantRepository;
import com.intellidoc.backend.repository.UserAccountRepository;
import com.intellidoc.backend.repository.WorkspaceMemberRepository;
import com.intellidoc.backend.repository.WorkspaceRepository;
import com.intellidoc.backend.storage.MinioStorageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DmsApiTest {

    private static final UUID TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID OTHER_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000003");

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private TenantRepository tenantRepository;
    @Autowired
    private UserAccountRepository userAccountRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private WorkspaceRepository workspaceRepository;
    @Autowired
    private WorkspaceMemberRepository workspaceMemberRepository;
    @Autowired
    private DocumentGroupRepository documentGroupRepository;
    @Autowired
    private DocumentRepository documentRepository;
    @Autowired
    private ProcessingJobRepository processingJobRepository;

    @MockBean
    private AiServiceClient aiServiceClient;
    @MockBean
    private MinioStorageService minioStorageService;

    private String token;
    private String otherToken;

    @BeforeEach
    void seed() throws Exception {
        processingJobRepository.deleteAll();
        documentRepository.deleteAll();
        documentGroupRepository.deleteAll();
        workspaceMemberRepository.deleteAll();
        workspaceRepository.deleteAll();
        userAccountRepository.deleteAll();
        tenantRepository.deleteAll();

        tenantRepository.save(TenantEntity.builder().id(TENANT_ID).name("IntelliDoc POC Tenant").build());
        userAccountRepository.save(UserAccountEntity.builder()
                .id(USER_ID)
                .tenantId(TENANT_ID)
                .email("jane.doe@company.com")
                .displayName("Jane Doe")
                .role("member")
                .passwordHash(passwordEncoder.encode("password"))
                .build());
        userAccountRepository.save(UserAccountEntity.builder()
                .id(OTHER_USER_ID)
                .tenantId(TENANT_ID)
                .email("john.doe@company.com")
                .displayName("John Doe")
                .role("member")
                .passwordHash(passwordEncoder.encode("password"))
                .build());
        token = login("jane.doe@company.com");
        otherToken = login("john.doe@company.com");
    }

    @Test
    void workspaceLifecycleAndTenantStamp() throws Exception {
        MvcResult created = mockMvc.perform(post("/workspaces")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Q3 Vendor Contracts Review\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name", is("Q3 Vendor Contracts Review")))
                .andExpect(jsonPath("$.status", is("ACTIVE")))
                .andReturn();
        String workspaceId = objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asText();

        assertEquals(TENANT_ID, workspaceRepository.findById(UUID.fromString(workspaceId)).orElseThrow().getTenantId());

        mockMvc.perform(get("/workspaces").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));

        mockMvc.perform(patch("/workspaces/" + workspaceId)
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Renamed\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name", is("Renamed")));

        mockMvc.perform(delete("/workspaces/" + workspaceId).header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status", is("ARCHIVED")));

        mockMvc.perform(get("/workspaces").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void nonMemberReceives403() throws Exception {
        String workspaceId = createWorkspace(token, "Private");
        mockMvc.perform(get("/workspaces/" + workspaceId).header("Authorization", bearer(otherToken)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code", is("WORKSPACE_ACCESS_DENIED")));
    }

    @Test
    void uploadTwoFilesAndTriggerProcessing() throws Exception {
        String workspaceId = createWorkspace(token, "Uploads");
        mockMvc.perform(multipart("/workspaces/" + workspaceId + "/documents")
                        .file(pdf("a.pdf"))
                        .file(docx("b.docx"))
                        .header("Authorization", bearer(token)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.documents", hasSize(2)))
                .andExpect(jsonPath("$.documents[0].processingStatus", is("UPLOADED")));

        assertEquals(2, documentRepository.count());
        assertEquals(2, processingJobRepository.count());
        verify(aiServiceClient, atLeastOnce()).triggerProcessing(any());
        verify(minioStorageService, atLeastOnce()).store(any(), any(), any());
        String path = documentRepository.findAll().get(0).getStoragePath();
        assertTrue(path.matches("workspace/" + workspaceId + "/document/.+/original\\.(pdf|docx)"));
    }

    @Test
    void mixedInvalidFilesDoNotCreateRows() throws Exception {
        String workspaceId = createWorkspace(token, "Mixed");
        mockMvc.perform(multipart("/workspaces/" + workspaceId + "/documents")
                        .file(pdf("ok.pdf"))
                        .file(file("bad.xlsx", "application/vnd.ms-excel", new byte[]{1}))
                        .file(file("huge.pdf", "application/pdf", new byte[2000]))
                        .header("Authorization", bearer(token)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.documents", hasSize(1)))
                .andExpect(jsonPath("$.rejections", hasSize(2)));

        assertEquals(1, documentRepository.count());
    }

    @Test
    void listReflectsSeededStatusesAndDocumentTypeFilter() throws Exception {
        String workspaceId = createWorkspace(token, "Status");
        mockMvc.perform(multipart("/workspaces/" + workspaceId + "/documents")
                        .file(pdf("one.pdf"))
                        .header("Authorization", bearer(token)))
                .andExpect(status().isAccepted());
        DocumentEntity document = documentRepository.findAll().get(0);
        document.setProcessingStatus(ProcessingStatus.READY);
        document.setDocumentType("contract");
        document.setOverview("overview");
        document.setSummary("summary");
        documentRepository.save(document);

        mockMvc.perform(get("/workspaces/" + workspaceId + "/documents")
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.documents[0].processingStatus", is("READY")));

        mockMvc.perform(get("/workspaces/" + workspaceId + "/documents")
                        .param("documentType", "contract")
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.documents", hasSize(1)));

        mockMvc.perform(get("/workspaces/" + workspaceId + "/documents")
                        .param("documentType", "policy")
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.documents", hasSize(0)));

        mockMvc.perform(get("/documents/" + document.getId()).header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overview", is("overview")))
                .andExpect(jsonPath("$.processingStatus", is("READY")));
    }

    @Test
    void retryFailedThenRejectReady() throws Exception {
        String workspaceId = createWorkspace(token, "Retry");
        mockMvc.perform(multipart("/workspaces/" + workspaceId + "/documents")
                        .file(pdf("fail.pdf"))
                        .header("Authorization", bearer(token)))
                .andExpect(status().isAccepted());
        DocumentEntity document = documentRepository.findAll().get(0);
        document.setProcessingStatus(ProcessingStatus.FAILED);
        documentRepository.save(document);

        mockMvc.perform(post("/documents/" + document.getId() + "/retry")
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.processingStatus", is("PARSING")));

        document.setProcessingStatus(ProcessingStatus.READY);
        documentRepository.save(document);
        mockMvc.perform(post("/documents/" + document.getId() + "/retry")
                        .header("Authorization", bearer(token)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code", is("INVALID_STATE_TRANSITION")));
    }

    @Test
    void moduleUniquenessIsWorkspaceScoped() throws Exception {
        String workspaceA = createWorkspace(token, "A");
        String workspaceB = createWorkspace(token, "B");
        mockMvc.perform(post("/workspaces/" + workspaceA + "/modules")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Contracts\"}"))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/workspaces/" + workspaceB + "/modules")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Contracts\"}"))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/workspaces/" + workspaceA + "/modules")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Contracts\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code", is("MODULE_NAME_TAKEN")));
    }

    @Test
    void crossWorkspaceModuleAssignmentIsRejected() throws Exception {
        String workspaceA = createWorkspace(token, "A2");
        String workspaceB = createWorkspace(token, "B2");
        MvcResult moduleB = mockMvc.perform(post("/workspaces/" + workspaceB + "/modules")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Finance\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        String moduleBId = objectMapper.readTree(moduleB.getResponse().getContentAsString()).get("id").asText();

        mockMvc.perform(multipart("/workspaces/" + workspaceA + "/documents")
                        .file(pdf("doc.pdf"))
                        .header("Authorization", bearer(token)))
                .andExpect(status().isAccepted());
        UUID documentId = documentRepository.findAll().get(0).getId();

        mockMvc.perform(patch("/documents/" + documentId + "/module")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"moduleId\":\"" + moduleBId + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code", is("INVALID_MODULE_SCOPE")));
    }

    @Test
    void folderUploadAssignsTopLevelModule() throws Exception {
        String workspaceId = createWorkspace(token, "Folder");
        mockMvc.perform(multipart("/workspaces/" + workspaceId + "/documents")
                        .file(pdf("Q3report.pdf"))
                        .file(docx("loose-memo.docx"))
                        .param("relativePaths", "Finance/Q3report.pdf")
                        .param("relativePaths", "loose-memo.docx")
                        .header("Authorization", bearer(token)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.documents[0].moduleName", is("Finance")))
                .andExpect(jsonPath("$.documents[1].moduleId", nullValue()));

        assertEquals(1, documentGroupRepository.findByWorkspaceIdAndName(
                UUID.fromString(workspaceId), "Finance").stream().count());
    }

    @Test
    void archiveHidesDocumentFromList() throws Exception {
        String workspaceId = createWorkspace(token, "Archive");
        mockMvc.perform(multipart("/workspaces/" + workspaceId + "/documents")
                        .file(pdf("gone.pdf"))
                        .header("Authorization", bearer(token)))
                .andExpect(status().isAccepted());
        UUID documentId = documentRepository.findAll().get(0).getId();

        mockMvc.perform(delete("/documents/" + documentId).header("Authorization", bearer(token)))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/workspaces/" + workspaceId + "/documents").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.documents", hasSize(0)));
        mockMvc.perform(get("/documents/" + documentId).header("Authorization", bearer(token)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code", is("DOCUMENT_NOT_FOUND")));
    }

    @Test
    void originalFileIsStreamedForMemberAndDeniedForNonMember() throws Exception {
        String workspaceId = createWorkspace(token, "Viewer");
        mockMvc.perform(multipart("/workspaces/" + workspaceId + "/documents")
                        .file(pdf("sample.pdf"))
                        .header("Authorization", bearer(token)))
                .andExpect(status().isAccepted());
        DocumentEntity document = documentRepository.findAll().get(0);
        when(minioStorageService.load(document.getStoragePath()))
                .thenReturn(new MinioStorageService.StoredObject(new byte[]{1, 2, 3}, "application/pdf"));

        mockMvc.perform(get("/documents/" + document.getId() + "/file").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "application/pdf"))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, containsString("inline")))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, containsString("sample.pdf")))
                .andExpect(content().bytes(new byte[]{1, 2, 3}));

        mockMvc.perform(get("/documents/" + document.getId() + "/file").header("Authorization", bearer(otherToken)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code", is("WORKSPACE_ACCESS_DENIED")));
    }

    private String login(String email) throws Exception {
        MvcResult login = mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"password\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(login.getResponse().getContentAsString()).get("token").asText();
    }

    private String createWorkspace(String authToken, String name) throws Exception {
        MvcResult created = mockMvc.perform(post("/workspaces")
                        .header("Authorization", bearer(authToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asText();
    }

    private static String bearer(String authToken) {
        return "Bearer " + authToken;
    }

    private static MockMultipartFile pdf(String name) {
        return file(name, "application/pdf", new byte[]{1, 2, 3});
    }

    private static MockMultipartFile docx(String name) {
        return file(name, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", new byte[]{4, 5});
    }

    private static MockMultipartFile file(String name, String contentType, byte[] bytes) {
        return new MockMultipartFile("files", name, contentType, bytes);
    }
}
