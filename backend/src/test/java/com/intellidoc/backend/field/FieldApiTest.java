package com.intellidoc.backend.field;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intellidoc.backend.model.DocumentEntity;
import com.intellidoc.backend.model.ExtractedFieldEntity;
import com.intellidoc.backend.model.TenantEntity;
import com.intellidoc.backend.model.UserAccountEntity;
import com.intellidoc.backend.model.WorkspaceEntity;
import com.intellidoc.backend.model.WorkspaceMemberEntity;
import com.intellidoc.backend.repository.DocumentRepository;
import com.intellidoc.backend.repository.ExtractedFieldRepository;
import com.intellidoc.backend.repository.TenantRepository;
import com.intellidoc.backend.repository.UserAccountRepository;
import com.intellidoc.backend.repository.WorkspaceMemberRepository;
import com.intellidoc.backend.repository.WorkspaceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class FieldApiTest {

    private static final UUID TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000000010");
    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000011");
    private static final UUID OTHER_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000012");

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
    private DocumentRepository documentRepository;
    @Autowired
    private ExtractedFieldRepository extractedFieldRepository;

    private String token;
    private String otherToken;
    private UUID workspaceId;
    private UUID documentId;
    private UUID fieldId;

    @BeforeEach
    void seed() throws Exception {
        extractedFieldRepository.deleteAll();
        documentRepository.deleteAll();
        workspaceMemberRepository.deleteAll();
        workspaceRepository.deleteAll();
        userAccountRepository.deleteAll();
        tenantRepository.deleteAll();

        tenantRepository.save(TenantEntity.builder().id(TENANT_ID).name("Tenant").build());
        userAccountRepository.save(UserAccountEntity.builder()
                .id(USER_ID)
                .tenantId(TENANT_ID)
                .email("fields@company.com")
                .displayName("Fields User")
                .role("member")
                .passwordHash(passwordEncoder.encode("password"))
                .build());
        userAccountRepository.save(UserAccountEntity.builder()
                .id(OTHER_USER_ID)
                .tenantId(TENANT_ID)
                .email("other@company.com")
                .displayName("Other")
                .role("member")
                .passwordHash(passwordEncoder.encode("password"))
                .build());
        token = login("fields@company.com");
        otherToken = login("other@company.com");

        workspaceId = UUID.randomUUID();
        workspaceRepository.save(WorkspaceEntity.builder()
                .id(workspaceId)
                .tenantId(TENANT_ID)
                .name("Fields WS")
                .status("ACTIVE")
                .createdBy(USER_ID)
                .build());
        workspaceMemberRepository.save(WorkspaceMemberEntity.builder()
                .workspaceId(workspaceId)
                .userId(USER_ID)
                .role("member")
                .build());

        documentId = UUID.randomUUID();
        documentRepository.save(DocumentEntity.builder()
                .id(documentId)
                .workspaceId(workspaceId)
                .fileName("contract.pdf")
                .fileType("pdf")
                .fileSizeBytes(100)
                .storagePath("workspace/" + workspaceId + "/document/" + documentId + "/original.pdf")
                .processingStatus("EXTRACTING")
                .uploadedBy(USER_ID)
                .createdAt(OffsetDateTime.now())
                .build());

        fieldId = UUID.randomUUID();
        extractedFieldRepository.save(ExtractedFieldEntity.builder()
                .id(fieldId)
                .documentId(documentId)
                .fieldName("Termination Notice Period")
                .fieldCategory("contract_specific")
                .fieldValue("30 days")
                .confidence(0.81)
                .sourcePage(12)
                .status(FieldStatus.AI_GENERATED)
                .createdAt(OffsetDateTime.now())
                .build());
    }

    @Test
    void listPatchDeleteAndExportFields() throws Exception {
        mockMvc.perform(get("/documents/" + documentId + "/fields").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fields", hasSize(1)))
                .andExpect(jsonPath("$.fields[0].fieldName", is("Termination Notice Period")));

        mockMvc.perform(patch("/fields/" + fieldId)
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fieldValue\":\"45 days\",\"status\":\"CORRECTED\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fieldValue", is("45 days")))
                .andExpect(jsonPath("$.status", is("CORRECTED")));

        mockMvc.perform(get("/documents/" + documentId + "/fields").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fields[0].status", is("CORRECTED")));

        mockMvc.perform(get("/documents/" + documentId + "/fields/export")
                        .param("format", "csv")
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("fieldName,fieldValue,confidence,sourcePage,status")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("45 days")));

        mockMvc.perform(delete("/fields/" + fieldId).header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status", is("REMOVED")));

        mockMvc.perform(get("/documents/" + documentId + "/fields").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fields", hasSize(0)));
    }

    @Test
    void nonMemberCannotAccessFields() throws Exception {
        mockMvc.perform(get("/documents/" + documentId + "/fields").header("Authorization", bearer(otherToken)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code", is("WORKSPACE_ACCESS_DENIED")));
    }

    @Test
    void invalidExportFormatReturns400() throws Exception {
        mockMvc.perform(get("/documents/" + documentId + "/fields/export")
                        .param("format", "xml")
                        .header("Authorization", bearer(token)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code", is("FIELD_INVALID_EXPORT_FORMAT")));
    }

    private String login(String email) throws Exception {
        MvcResult login = mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"password\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(login.getResponse().getContentAsString()).get("token").asText();
    }

    private static String bearer(String authToken) {
        return "Bearer " + authToken;
    }
}
