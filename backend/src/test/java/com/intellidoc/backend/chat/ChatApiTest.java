package com.intellidoc.backend.chat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intellidoc.backend.client.AiServiceClient;
import com.intellidoc.backend.dto.AnswerOutcome;
import com.intellidoc.backend.dto.CitationDto;
import com.intellidoc.backend.dto.SourcePassageDto;
import com.intellidoc.backend.model.DocumentChunkEntity;
import com.intellidoc.backend.model.DocumentEntity;
import com.intellidoc.backend.model.DocumentGroupEntity;
import com.intellidoc.backend.model.TenantEntity;
import com.intellidoc.backend.model.UserAccountEntity;
import com.intellidoc.backend.model.WorkspaceEntity;
import com.intellidoc.backend.repository.AnswerCitationRepository;
import com.intellidoc.backend.repository.ChatMessageRepository;
import com.intellidoc.backend.repository.ChatSessionDocumentRepository;
import com.intellidoc.backend.repository.ChatSessionRepository;
import com.intellidoc.backend.repository.DocumentChunkRepository;
import com.intellidoc.backend.repository.DocumentGroupRepository;
import com.intellidoc.backend.repository.DocumentRepository;
import com.intellidoc.backend.repository.TenantRepository;
import com.intellidoc.backend.repository.UserAccountRepository;
import com.intellidoc.backend.repository.WorkspaceMemberRepository;
import com.intellidoc.backend.repository.WorkspaceRepository;
import com.intellidoc.backend.security.AuthPrincipal;
import com.intellidoc.backend.storage.MinioStorageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class ChatApiTest {

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
    private DocumentChunkRepository documentChunkRepository;
    @Autowired
    private ChatSessionRepository chatSessionRepository;
    @Autowired
    private ChatSessionDocumentRepository chatSessionDocumentRepository;
    @Autowired
    private ChatMessageRepository chatMessageRepository;
    @Autowired
    private AnswerCitationRepository answerCitationRepository;
    @Autowired
    private ChatAnswerFacade chatAnswerFacade;

    @MockBean
    private AiServiceClient aiServiceClient;
    @MockBean
    private MinioStorageService minioStorageService;

    private String token;
    private String otherToken;

    @BeforeEach
    void seed() throws Exception {
        answerCitationRepository.deleteAll();
        chatMessageRepository.deleteAll();
        chatSessionDocumentRepository.deleteAll();
        chatSessionRepository.deleteAll();
        documentChunkRepository.deleteAll();
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
    void story8_1_createWorkspaceScopedSessionAndGetDetail() throws Exception {
        String workspaceId = createWorkspace(token, "Chat Workspace 1");
        DocumentEntity doc1 = createDocument(UUID.fromString(workspaceId), null, "doc1.pdf");

        MvcResult created = mockMvc.perform(post("/workspaces/" + workspaceId + "/chat-sessions")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"scope\": {\"type\": \"workspace\"}, \"title\": \"General Chat\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", notNullValue()))
                .andExpect(jsonPath("$.scope.type", is("WORKSPACE")))
                .andExpect(jsonPath("$.resolvedDocumentIds", hasSize(1)))
                .andReturn();

        String sessionId = objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asText();

        mockMvc.perform(get("/chat-sessions/" + sessionId).header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(sessionId)))
                .andExpect(jsonPath("$.scope.type", is("WORKSPACE")))
                .andExpect(jsonPath("$.messages", hasSize(0)));
    }

    @Test
    void story8_1_createModuleScopedSession() throws Exception {
        String workspaceId = createWorkspace(token, "Module WS");
        DocumentGroupEntity module = documentGroupRepository.save(DocumentGroupEntity.builder()
                .workspaceId(UUID.fromString(workspaceId))
                .name("HR Policies")
                .build());
        DocumentEntity doc1 = createDocument(UUID.fromString(workspaceId), module.getId(), "policy.pdf");

        mockMvc.perform(post("/workspaces/" + workspaceId + "/chat-sessions")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"scope\": {\"type\": \"module\", \"moduleId\": \"" + module.getId() + "\"}}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.scope.type", is("MODULE")))
                .andExpect(jsonPath("$.scope.moduleId", is(module.getId().toString())))
                .andExpect(jsonPath("$.resolvedDocumentIds", hasSize(1)));
    }

    @Test
    void story8_1_createDocumentsScopedSession() throws Exception {
        String workspaceId = createWorkspace(token, "Docs WS");
        DocumentEntity doc1 = createDocument(UUID.fromString(workspaceId), null, "docA.pdf");
        DocumentEntity doc2 = createDocument(UUID.fromString(workspaceId), null, "docB.pdf");

        mockMvc.perform(post("/workspaces/" + workspaceId + "/chat-sessions")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"scope\": {\"type\": \"documents\", \"documentIds\": [\"" + doc1.getId() + "\", \"" + doc2.getId() + "\"]}}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.scope.type", is("DOCUMENTS")))
                .andExpect(jsonPath("$.resolvedDocumentIds", hasSize(2)));
    }

    @Test
    void story8_5_rejectCrossWorkspaceDocumentOrModule() throws Exception {
        String workspaceA = createWorkspace(token, "Workspace A");
        String workspaceB = createWorkspace(token, "Workspace B");
        DocumentEntity docB = createDocument(UUID.fromString(workspaceB), null, "docB.pdf");

        mockMvc.perform(post("/workspaces/" + workspaceA + "/chat-sessions")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"scope\": {\"type\": \"documents\", \"documentIds\": [\"" + docB.getId() + "\"]}}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code", is("SCOPE_OUTSIDE_WORKSPACE")));
    }

    @Test
    void story8_2_and_8_3_postMessageSseStreamingAndCitationRetrieval() throws Exception {
        String workspaceId = createWorkspace(token, "SSE WS");
        DocumentEntity doc = createDocument(UUID.fromString(workspaceId), null, "contract.pdf");
        DocumentChunkEntity chunk = documentChunkRepository.save(DocumentChunkEntity.builder()
                .documentId(doc.getId())
                .pageNumber(2)
                .chunkText("The notice period for termination is 30 days written notice.")
                .build());

        MvcResult sessionRes = mockMvc.perform(post("/workspaces/" + workspaceId + "/chat-sessions")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"scope\": {\"type\": \"workspace\"}}"))
                .andExpect(status().isCreated())
                .andReturn();

        String sessionId = objectMapper.readTree(sessionRes.getResponse().getContentAsString()).get("id").asText();

        MvcResult asyncListener = mockMvc.perform(post("/chat-sessions/" + sessionId + "/messages")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"question\": \"What is the notice period?\"}"))
                .andExpect(request().asyncStarted())
                .andReturn();

        // Wait up to 2 seconds for async thread execution to complete
        asyncListener.getAsyncResult(2000);

        MvcResult sseResult = mockMvc.perform(asyncDispatch(asyncListener))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("text/event-stream"))
                .andReturn();

        String body = sseResult.getResponse().getContentAsString();
        assertTrue(body.contains("event:token"));
        assertTrue(body.contains("event:citation"));
        assertTrue(body.contains("event:done"));

        // Verify messages in DB
        assertEquals(2, chatMessageRepository.count());

        // Get citations for the assistant message
        UUID assistantMsgId = chatMessageRepository.findAll().stream()
                .filter(m -> "assistant".equals(m.getRole()))
                .findFirst().orElseThrow().getId();

        MvcResult citationsRes = mockMvc.perform(get("/messages/" + assistantMsgId + "/citations")
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].excerpt", containsString("notice period")))
                .andReturn();

        String citationId = objectMapper.readTree(citationsRes.getResponse().getContentAsString()).get(0).get("citationId").asText();

        // Story 8.4: Source passage viewer
        mockMvc.perform(get("/citations/" + citationId + "/source")
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.citationId", is(citationId)))
                .andExpect(jsonPath("$.passage", containsString("notice period")))
                .andExpect(jsonPath("$.highlight.start", notNullValue()))
                .andExpect(jsonPath("$.highlight.end", notNullValue()));
    }

    @Test
    void story8_2_notFoundQuestionEmitsNotFoundResponse() throws Exception {
        String workspaceId = createWorkspace(token, "NotFound WS");
        createDocument(UUID.fromString(workspaceId), null, "doc.pdf");

        MvcResult sessionRes = mockMvc.perform(post("/workspaces/" + workspaceId + "/chat-sessions")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"scope\": {\"type\": \"workspace\"}}"))
                .andExpect(status().isCreated())
                .andReturn();

        String sessionId = objectMapper.readTree(sessionRes.getResponse().getContentAsString()).get("id").asText();

        MvcResult asyncListener = mockMvc.perform(post("/chat-sessions/" + sessionId + "/messages")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"question\": \"What is the unknown concept? not found\"}"))
                .andExpect(request().asyncStarted())
                .andReturn();

        asyncListener.getAsyncResult(2000);

        MvcResult sseResult = mockMvc.perform(asyncDispatch(asyncListener))
                .andExpect(status().isOk())
                .andReturn();

        String body = sseResult.getResponse().getContentAsString();
        assertTrue(body.contains("\"isNotFound\":true"));
    }

    @Test
    void facade_programmaticAskReturnsAnswerOutcome() throws Exception {
        String workspaceId = createWorkspace(token, "Facade WS");
        DocumentEntity doc = createDocument(UUID.fromString(workspaceId), null, "docF.pdf");
        documentChunkRepository.save(DocumentChunkEntity.builder()
                .documentId(doc.getId())
                .pageNumber(1)
                .chunkText("The notice period for termination is 30 days written notice.")
                .build());

        MvcResult sessionRes = mockMvc.perform(post("/workspaces/" + workspaceId + "/chat-sessions")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"scope\": {\"type\": \"workspace\"}}"))
                .andExpect(status().isCreated())
                .andReturn();

        String sessionId = objectMapper.readTree(sessionRes.getResponse().getContentAsString()).get("id").asText();

        AuthPrincipal principal = new AuthPrincipal(USER_ID, TENANT_ID);
        AnswerOutcome outcome = chatAnswerFacade.ask(UUID.fromString(sessionId), principal, "What is the notice period?", "retrieval_plus_graph");

        assertNotNull(outcome);
        assertNotNull(outcome.getMessageId());
        assertEquals("retrieval_plus_graph", outcome.getAnswerMode());
        assertFalse(outcome.getIsNotFound());
        assertFalse(outcome.getCitations().isEmpty());
    }

    @Test
    void crossWorkspaceSessionAccessIsDenied() throws Exception {
        String workspaceId = createWorkspace(token, "Private WS");
        createDocument(UUID.fromString(workspaceId), null, "docP.pdf");

        MvcResult sessionRes = mockMvc.perform(post("/workspaces/" + workspaceId + "/chat-sessions")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"scope\": {\"type\": \"workspace\"}}"))
                .andExpect(status().isCreated())
                .andReturn();

        String sessionId = objectMapper.readTree(sessionRes.getResponse().getContentAsString()).get("id").asText();

        mockMvc.perform(get("/chat-sessions/" + sessionId).header("Authorization", bearer(otherToken)))
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

    private DocumentEntity createDocument(UUID workspaceId, UUID groupId, String fileName) {
        return documentRepository.save(DocumentEntity.builder()
                .workspaceId(workspaceId)
                .groupId(groupId)
                .fileName(fileName)
                .fileType("pdf")
                .fileSizeBytes(1024)
                .storagePath("workspace/" + workspaceId + "/document/" + UUID.randomUUID() + "/original.pdf")
                .processingStatus("READY")
                .uploadedBy(USER_ID)
                .build());
    }

    private static String bearer(String authToken) {
        return "Bearer " + authToken;
    }
}
