package com.intellidoc.backend;

import com.intellidoc.backend.client.AiServiceClient;
import com.intellidoc.backend.dto.AiAnalysisRequestDto;
import com.intellidoc.backend.dto.AiAnalysisResponseDto;
import com.intellidoc.backend.dto.DocumentModuleDto;
import com.intellidoc.backend.dto.FolderDocumentResponseDto;
import com.intellidoc.backend.dto.FolderFileResponseDto;
import com.intellidoc.backend.dto.FolderSectionResponseDto;
import com.intellidoc.backend.dto.FolderUploadResponseDto;
import com.intellidoc.backend.dto.GetAllDocumentsResponseDto;
import com.intellidoc.backend.dto.StructuredDocumentDto;
import com.intellidoc.backend.service.DocumentService;
import com.intellidoc.backend.util.DocumentStructureExtractor;
import com.intellidoc.backend.util.DocumentTextExtractor;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.mockito.Mockito;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;


@SpringBootTest
@ActiveProfiles("test")
class IntelliDocBackendApplicationTests {

    // ============================================================
    // SERVICE
    // ============================================================

    @Autowired
    private DocumentService documentService;


    // ============================================================
    // MOCK SERVICES
    // ============================================================

    @MockBean
    private AiServiceClient aiServiceClient;

    @MockBean
    private DocumentStructureExtractor documentStructureExtractor;

    @MockBean
    private DocumentTextExtractor documentTextExtractor;


    // ============================================================
    // TEST FILES
    // ============================================================

    private MockMultipartFile testFile1;

    private MockMultipartFile testFile2;

    private MockMultipartFile testFile3;


    // ============================================================
    // WORKSPACE
    // ============================================================

    private static final String WORKSPACE_ID =
            "ws_test_001";


    // ============================================================
    // SETUP
    // ============================================================

    @BeforeEach
    void setUp() throws Exception {

        // --------------------------------------------------------
        // File 1
        // --------------------------------------------------------

        testFile1 =
                new MockMultipartFile(
                        "file",
                        "EmployeePolicy.docx",
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        "Employee policy introduction and employee details."
                                .getBytes(StandardCharsets.UTF_8)
                );


        // --------------------------------------------------------
        // File 2
        // --------------------------------------------------------

        testFile2 =
                new MockMultipartFile(
                        "file",
                        "EmployeePolicy.pdf",
                        "application/pdf",
                        "Employee policy benefits and employee information."
                                .getBytes(StandardCharsets.UTF_8)
                );


        // --------------------------------------------------------
        // File 3
        // --------------------------------------------------------

        testFile3 =
                new MockMultipartFile(
                        "file",
                        "EmployeeBenefits.pdf",
                        "application/pdf",
                        "Employee benefits information."
                                .getBytes(StandardCharsets.UTF_8)
                );


        // ========================================================
        // MOCK TEXT EXTRACTION
        // ========================================================

        Mockito.when(
                documentTextExtractor.extractText(any())
        ).thenReturn(
                "Employee policy introduction and employee details."
        );


        // ========================================================
        // MOCK STRUCTURED EXTRACTION
        // ========================================================

        StructuredDocumentDto structuredDocument =
                StructuredDocumentDto.builder()
                        .content(
                                "Employee policy introduction and employee details."
                        )
                        .blocks(List.of())
                        .build();


        Mockito.when(
                documentStructureExtractor.extract(any())
        ).thenReturn(
                structuredDocument
        );


        // ========================================================
        // MOCK AI ANALYSIS
        // ========================================================

        Mockito.when(
                aiServiceClient.analyzeDocument(
                        any(AiAnalysisRequestDto.class)
                )
        ).thenAnswer(invocation -> {

            AiAnalysisRequestDto request =
                    invocation.getArgument(0);


            /*
             * Every uploaded file will receive
             * three sections/modules.
             */
            return AiAnalysisResponseDto.builder()

                    .documentId(
                            request.getDocumentId()
                    )

                    .summary(
                            "Employee policy document summary"
                    )

                    .sentiment(
                            "POSITIVE"
                    )

                    .confidenceScore(
                            0.95
                    )

                    .entities(
                            List.of(
                                    "Employee",
                                    "Policy"
                            )
                    )

                    .keyTopics(
                            List.of(
                                    "Employee",
                                    "Benefits",
                                    "Policy"
                            )
                    )

                    .modules(
                            List.of(

                                    DocumentModuleDto.builder()
                                            .moduleNumber("1")
                                            .moduleName("Introduction")
                                            .children(List.of())
                                            .build(),

                                    DocumentModuleDto.builder()
                                            .moduleNumber("2")
                                            .moduleName("Employee Details")
                                            .children(List.of())
                                            .build(),

                                    DocumentModuleDto.builder()
                                            .moduleNumber("3")
                                            .moduleName("Benefits")
                                            .children(List.of())
                                            .build()
                            )
                    )

                    .build();
        });
    }


    // ============================================================
    // TEST 1
    // ============================================================

    /**
     * Verify that Spring Boot application context loads.
     */
    @Test
    void contextLoads() {

        assertNotNull(
                documentService
        );
    }


    // ============================================================
    // TEST 2
    // ============================================================

    /**
     * Verify POST document upload.
     *
     * Expected:
     *
     * - Folder is created
     * - Document is uploaded
     * - Folder ID is returned
     * - Folder title is returned
     * - Status is COMPLETED
     * - File count is 1
     */
    @Test
    void testProcessAndSaveDocumentCreatesFolder()
            throws Exception {

        String workspaceId =
                "ws_post_folder_test";


        FolderUploadResponseDto response =
                documentService.processAndSaveDocument(

                        workspaceId,

                        testFile1,

                        "Employee Policy Folder"
                );


        assertNotNull(
                response
        );


        assertFalse(
                response.isError()
        );


        assertNotNull(
                response.getMessage()
        );


        assertTrue(
                response.getMessage()
                        .contains(
                                "Employee Policy Folder"
                        )
        );


        assertNotNull(
                response.getData()
        );


        assertNotNull(
                response.getData()
                        .getId()
        );


        assertEquals(
                "Employee Policy Folder",
                response.getData()
                        .getTitle()
        );


        assertEquals(
                "COMPLETED",
                response.getData()
                        .getStatus()
        );


        assertNotNull(
                response.getData()
                        .getCreatedAt()
        );


        assertEquals(
                "1",
                response.getData()
                        .getFilesCount()
        );


        Mockito.verify(
                aiServiceClient,
                Mockito.atLeastOnce()
        ).analyzeDocument(
                any(AiAnalysisRequestDto.class)
        );
    }


    // ============================================================
    // TEST 3
    // ============================================================

    /**
     * Verify that when the same folder title is used again,
     * the document is uploaded into the existing folder.
     */
    @Test
    void testUploadIntoExistingFolder()
            throws Exception {

        String workspaceId =
                "ws_existing_folder_test";


        String folderName =
                "Employee Policy Folder";


        // --------------------------------------------------------
        // First upload
        // --------------------------------------------------------

        FolderUploadResponseDto firstResponse =
                documentService.processAndSaveDocument(

                        workspaceId,

                        testFile1,

                        folderName
                );


        assertNotNull(
                firstResponse
        );


        String firstFolderId =
                firstResponse
                        .getData()
                        .getId();


        assertNotNull(
                firstFolderId
        );


        assertEquals(
                "1",
                firstResponse
                        .getData()
                        .getFilesCount()
        );


        // --------------------------------------------------------
        // Second upload
        // --------------------------------------------------------

        FolderUploadResponseDto secondResponse =
                documentService.processAndSaveDocument(

                        workspaceId,

                        testFile2,

                        folderName
                );


        assertNotNull(
                secondResponse
        );


        String secondFolderId =
                secondResponse
                        .getData()
                        .getId();


        // --------------------------------------------------------
        // Both uploads should use same folder
        // --------------------------------------------------------

        assertEquals(
                firstFolderId,
                secondFolderId,
                "Second document should use the existing folder"
        );


        // --------------------------------------------------------
        // File count should now be 2
        // --------------------------------------------------------

        assertEquals(
                "2",
                secondResponse
                        .getData()
                        .getFilesCount()
        );


        assertTrue(
                secondResponse
                        .getMessage()
                        .contains(
                                "existing folder"
                        )
        );
    }


    // ============================================================
    // TEST 4
    // ============================================================

    /**
     * Verify the complete GET All Documents response.
     *
     * Folder:
     *
     * id
     * title
     * status
     * uploaded_date
     * files_count
     * sections_count
     * files
     */
    @Test
    void testGetAllDocumentsReturnsFolderResponse()
            throws Exception {

        String workspaceId =
                "ws_get_all_folder_test";


        String folderName =
                "Employee Policy Folder";


        // --------------------------------------------------------
        // Upload first file
        // --------------------------------------------------------

        documentService.processAndSaveDocument(

                workspaceId,

                testFile1,

                folderName
        );


        // --------------------------------------------------------
        // Upload second file into same folder
        // --------------------------------------------------------

        documentService.processAndSaveDocument(

                workspaceId,

                testFile2,

                folderName
        );


        // --------------------------------------------------------
        // GET ALL
        // --------------------------------------------------------

        GetAllDocumentsResponseDto response =
                documentService.getAllDocuments(
                        workspaceId
                );


        assertNotNull(
                response
        );


        // --------------------------------------------------------
        // Verify wrapper
        // --------------------------------------------------------

        assertEquals(
                "Document details retrieved successfully",
                response.getMessage()
        );


        assertFalse(
                response.isError()
        );


        assertNotNull(
                response.getData()
        );


        assertFalse(
                response.getData()
                        .isEmpty()
        );


        // --------------------------------------------------------
        // Find expected folder
        // --------------------------------------------------------

        FolderDocumentResponseDto folder =
                response.getData()
                        .stream()
                        .filter(item ->
                                folderName.equals(
                                        item.getTitle()
                                )
                        )
                        .findFirst()
                        .orElseThrow(
                                () -> new AssertionError(
                                        "Expected folder was not found"
                                )
                        );


        // ========================================================
        // VERIFY FOLDER FIELDS
        // ========================================================

        assertNotNull(
                folder.getId()
        );


        assertEquals(
                folderName,
                folder.getTitle()
        );


        assertEquals(
                "COMPLETED",
                folder.getStatus()
        );


        /*
         * uploaded_date should be available directly
         * below status in the response DTO.
         */
        assertNotNull(
                folder.getUploadedDate()
        );


        /*
         * Two files were uploaded into the same folder.
         */
        assertEquals(
                "2",
                folder.getFilesCount()
        );


        /*
         * Each file has three sections.
         *
         * 2 files × 3 sections = 6 sections.
         */
        assertEquals(
                "6",
                folder.getSectionsCount()
        );


        // ========================================================
        // VERIFY FILE LIST
        // ========================================================

        assertNotNull(
                folder.getFiles()
        );


        assertEquals(
                2,
                folder.getFiles()
                        .size()
        );
    }


    // ============================================================
    // TEST 5
    // ============================================================

    /**
     * Verify actual file names inside the folder.
     */
    @Test
    void testGetAllDocumentsReturnsActualFileNames()
            throws Exception {

        String workspaceId =
                "ws_file_names_test";


        String folderName =
                "Employee Policy Folder";


        documentService.processAndSaveDocument(

                workspaceId,

                testFile1,

                folderName
        );


        documentService.processAndSaveDocument(

                workspaceId,

                testFile2,

                folderName
        );


        GetAllDocumentsResponseDto response =
                documentService.getAllDocuments(
                        workspaceId
                );


        FolderDocumentResponseDto folder =
                response.getData()
                        .stream()
                        .filter(item ->
                                folderName.equals(
                                        item.getTitle()
                                )
                        )
                        .findFirst()
                        .orElseThrow();


        assertEquals(
                2,
                folder.getFiles()
                        .size()
        );


        boolean firstFileFound =
                folder.getFiles()
                        .stream()
                        .anyMatch(file ->
                                "EmployeePolicy.docx"
                                        .equals(
                                                file.getFilesName()
                                        )
                        );


        boolean secondFileFound =
                folder.getFiles()
                        .stream()
                        .anyMatch(file ->
                                "EmployeePolicy.pdf"
                                        .equals(
                                                file.getFilesName()
                                        )
                        );


        assertTrue(
                firstFileFound,
                "EmployeePolicy.docx should be returned"
        );


        assertTrue(
                secondFileFound,
                "EmployeePolicy.pdf should be returned"
        );
    }


    // ============================================================
    // TEST 6
    // ============================================================

    /**
     * Verify files_number.
     *
     * First file -> 1
     * Second file -> 2
     */
    @Test
    void testFilesAreNumberedInsideFolder()
            throws Exception {

        String workspaceId =
                "ws_file_number_test";


        String folderName =
                "Employee Policy Folder";


        documentService.processAndSaveDocument(

                workspaceId,

                testFile1,

                folderName
        );


        documentService.processAndSaveDocument(

                workspaceId,

                testFile2,

                folderName
        );


        GetAllDocumentsResponseDto response =
                documentService.getAllDocuments(
                        workspaceId
                );


        FolderDocumentResponseDto folder =
                response.getData()
                        .stream()
                        .filter(item ->
                                folderName.equals(
                                        item.getTitle()
                                )
                        )
                        .findFirst()
                        .orElseThrow();


        assertEquals(
                2,
                folder.getFiles()
                        .size()
        );


        FolderFileResponseDto firstFile =
                folder.getFiles()
                        .get(0);


        FolderFileResponseDto secondFile =
                folder.getFiles()
                        .get(1);


        assertEquals(
                "1",
                firstFile.getFilesNumber()
        );


        assertEquals(
                "2",
                secondFile.getFilesNumber()
        );
    }


    // ============================================================
    // TEST 7
    // ============================================================

    /**
     * Verify that files_number and files_name appear
     * before children logically through the DTO structure.
     *
     * The DTO should contain:
     *
     * files_number
     * files_name
     * children
     */
    @Test
    void testFileResponseContainsFileInformationAndChildren()
            throws Exception {

        String workspaceId =
                "ws_file_structure_test";


        String folderName =
                "Employee Policy Folder";


        documentService.processAndSaveDocument(

                workspaceId,

                testFile1,

                folderName
        );


        GetAllDocumentsResponseDto response =
                documentService.getAllDocuments(
                        workspaceId
                );


        FolderDocumentResponseDto folder =
                response.getData()
                        .stream()
                        .filter(item ->
                                folderName.equals(
                                        item.getTitle()
                                )
                        )
                        .findFirst()
                        .orElseThrow();


        assertEquals(
                1,
                folder.getFiles()
                        .size()
        );


        FolderFileResponseDto file =
                folder.getFiles()
                        .get(0);


        // --------------------------------------------------------
        // File information
        // --------------------------------------------------------

        assertEquals(
                "1",
                file.getFilesNumber()
        );


        assertEquals(
                "EmployeePolicy.docx",
                file.getFilesName()
        );


        // --------------------------------------------------------
        // Children / Sections
        // --------------------------------------------------------

        assertNotNull(
                file.getChildren()
        );


        assertEquals(
                3,
                file.getChildren()
                        .size()
        );
    }


    // ============================================================
    // TEST 8
    // ============================================================

    /**
     * Verify sections inside children.
     */
    @Test
    void testSectionsAreReturnedInsideChildren()
            throws Exception {

        String workspaceId =
                "ws_sections_test";


        String folderName =
                "Employee Policy Folder";


        documentService.processAndSaveDocument(

                workspaceId,

                testFile1,

                folderName
        );


        GetAllDocumentsResponseDto response =
                documentService.getAllDocuments(
                        workspaceId
                );


        FolderDocumentResponseDto folder =
                response.getData()
                        .stream()
                        .filter(item ->
                                folderName.equals(
                                        item.getTitle()
                                )
                        )
                        .findFirst()
                        .orElseThrow();


        FolderFileResponseDto file =
                folder.getFiles()
                        .get(0);


        assertNotNull(
                file.getChildren()
        );


        assertEquals(
                3,
                file.getChildren()
                        .size()
        );


        // --------------------------------------------------------
        // Section 1
        // --------------------------------------------------------

        FolderSectionResponseDto section1 =
                file.getChildren()
                        .get(0);


        assertEquals(
                "1.1",
                section1.getSectionsNumber()
        );


        assertEquals(
                "Introduction",
                section1.getSectionsName()
        );


        // --------------------------------------------------------
        // Section 2
        // --------------------------------------------------------

        FolderSectionResponseDto section2 =
                file.getChildren()
                        .get(1);


        assertEquals(
                "1.2",
                section2.getSectionsNumber()
        );


        assertEquals(
                "Employee Details",
                section2.getSectionsName()
        );


        // --------------------------------------------------------
        // Section 3
        // --------------------------------------------------------

        FolderSectionResponseDto section3 =
                file.getChildren()
                        .get(2);


        assertEquals(
                "1.3",
                section3.getSectionsNumber()
        );


        assertEquals(
                "Benefits",
                section3.getSectionsName()
        );
    }


    // ============================================================
    // TEST 9
    // ============================================================

    /**
     * Verify sections_count when multiple files are
     * present in one folder.
     */
    @Test
    void testSectionsCountForMultipleFiles()
            throws Exception {

        String workspaceId =
                "ws_sections_count_test";


        String folderName =
                "Employee Policy Folder";


        // File 1 -> 3 sections
        documentService.processAndSaveDocument(

                workspaceId,

                testFile1,

                folderName
        );


        // File 2 -> 3 sections
        documentService.processAndSaveDocument(

                workspaceId,

                testFile2,

                folderName
        );


        // File 3 -> 3 sections
        documentService.processAndSaveDocument(

                workspaceId,

                testFile3,

                folderName
        );


        GetAllDocumentsResponseDto response =
                documentService.getAllDocuments(
                        workspaceId
                );


        FolderDocumentResponseDto folder =
                response.getData()
                        .stream()
                        .filter(item ->
                                folderName.equals(
                                        item.getTitle()
                                )
                        )
                        .findFirst()
                        .orElseThrow();


        // --------------------------------------------------------
        // 3 files
        // --------------------------------------------------------

        assertEquals(
                "3",
                folder.getFilesCount()
        );


        // --------------------------------------------------------
        // 3 files × 3 sections = 9
        // --------------------------------------------------------

        assertEquals(
                "9",
                folder.getSectionsCount()
        );


        assertEquals(
                3,
                folder.getFiles()
                        .size()
        );
    }


    // ============================================================
    // TEST 10
    // ============================================================

    /**
     * Verify that different folder names create different folders.
     */
    @Test
    void testDifferentFolderNamesCreateDifferentFolders()
            throws Exception {

        String workspaceId =
                "ws_multiple_folders_test";


        documentService.processAndSaveDocument(

                workspaceId,

                testFile1,

                "Employee Policy Folder"
        );


        documentService.processAndSaveDocument(

                workspaceId,

                testFile2,

                "Employee Benefits Folder"
        );


        GetAllDocumentsResponseDto response =
                documentService.getAllDocuments(
                        workspaceId
                );


        assertNotNull(
                response
        );


        assertTrue(
                response.getData()
                        .stream()
                        .anyMatch(folder ->
                                "Employee Policy Folder"
                                        .equals(
                                                folder.getTitle()
                                        )
                        )
        );


        assertTrue(
                response.getData()
                        .stream()
                        .anyMatch(folder ->
                                "Employee Benefits Folder"
                                        .equals(
                                                folder.getTitle()
                                        )
                        )
        );
    }


    // ============================================================
    // TEST 11
    // ============================================================

    /**
     * Verify workspace isolation.
     *
     * Workspace A should not receive folders
     * belonging to Workspace B.
     */
    @Test
    void testGetAllDocumentsWorkspaceIsolation()
            throws Exception {

        String workspaceA =
                "ws_isolation_a";


        String workspaceB =
                "ws_isolation_b";


        // --------------------------------------------------------
        // Workspace A
        // --------------------------------------------------------

        documentService.processAndSaveDocument(

                workspaceA,

                testFile1,

                "Workspace A Folder"
        );


        // --------------------------------------------------------
        // Workspace B
        // --------------------------------------------------------

        documentService.processAndSaveDocument(

                workspaceB,

                testFile2,

                "Workspace B Folder"
        );


        // --------------------------------------------------------
        // GET Workspace A
        // --------------------------------------------------------

        GetAllDocumentsResponseDto workspaceAResponse =
                documentService.getAllDocuments(
                        workspaceA
                );


        // --------------------------------------------------------
        // GET Workspace B
        // --------------------------------------------------------

        GetAllDocumentsResponseDto workspaceBResponse =
                documentService.getAllDocuments(
                        workspaceB
                );


        assertNotNull(
                workspaceAResponse
        );


        assertNotNull(
                workspaceBResponse
        );


        // --------------------------------------------------------
        // Workspace A contains A
        // --------------------------------------------------------

        assertTrue(
                workspaceAResponse
                        .getData()
                        .stream()
                        .anyMatch(folder ->
                                "Workspace A Folder"
                                        .equals(
                                                folder.getTitle()
                                        )
                        )
        );


        // --------------------------------------------------------
        // Workspace A does not contain B
        // --------------------------------------------------------

        assertFalse(
                workspaceAResponse
                        .getData()
                        .stream()
                        .anyMatch(folder ->
                                "Workspace B Folder"
                                        .equals(
                                                folder.getTitle()
                                        )
                        )
        );


        // --------------------------------------------------------
        // Workspace B contains B
        // --------------------------------------------------------

        assertTrue(
                workspaceBResponse
                        .getData()
                        .stream()
                        .anyMatch(folder ->
                                "Workspace B Folder"
                                        .equals(
                                                folder.getTitle()
                                        )
                        )
        );


        // --------------------------------------------------------
        // Workspace B does not contain A
        // --------------------------------------------------------

        assertFalse(
                workspaceBResponse
                        .getData()
                        .stream()
                        .anyMatch(folder ->
                                "Workspace A Folder"
                                        .equals(
                                                folder.getTitle()
                                        )
                        )
        );
    }


    // ============================================================
    // TEST 12
    // ============================================================

    /**
     * Verify GET All response for an empty workspace.
     */
    @Test
    void testGetAllDocumentsForEmptyWorkspace()
            throws Exception {

        String workspaceId =
                "ws_empty_workspace_test";


        GetAllDocumentsResponseDto response =
                documentService.getAllDocuments(
                        workspaceId
                );


        assertNotNull(
                response
        );


        assertEquals(
                "Document details retrieved successfully",
                response.getMessage()
        );


        assertFalse(
                response.isError()
        );


        assertNotNull(
                response.getData()
        );


        assertTrue(
                response.getData()
                        .isEmpty(),
                "Empty workspace should not contain folders"
        );
    }


    // ============================================================
    // TEST 13
    // ============================================================

    /**
     * Verify that AI service receives the generated document ID,
     * title and extracted content.
     */
    @Test
    void testAiServiceReceivesCorrectDocumentInformation()
            throws Exception {

        String workspaceId =
                "ws_ai_request_test";


        documentService.processAndSaveDocument(

                workspaceId,

                testFile1,

                "Employee Policy Folder"
        );


        Mockito.verify(
                aiServiceClient,
                Mockito.atLeastOnce()
        ).analyzeDocument(

                Mockito.argThat(
                        request ->

                                request != null

                                        && request
                                        .getDocumentId()
                                        != null

                                        && request
                                        .getTitle()
                                        != null

                                        && request
                                        .getContent()
                                        != null

                                        && !request
                                        .getContent()
                                        .isBlank()
                )
        );
    }
}