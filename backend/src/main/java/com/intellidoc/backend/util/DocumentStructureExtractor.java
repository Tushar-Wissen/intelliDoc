package com.intellidoc.backend.util;

import com.intellidoc.backend.dto.DocumentTextBlockDto;
import com.intellidoc.backend.dto.StructuredDocumentDto;
import net.sourceforge.tess4j.Tesseract;
import net.sourceforge.tess4j.TesseractException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFTextParagraph;
import org.apache.poi.xslf.usermodel.XSLFTextRun;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import org.apache.poi.sl.usermodel.Placeholder;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import java.io.File;

@Component
public class DocumentStructureExtractor {

    private static final Pattern EMAIL_PATTERN =
            Pattern.compile("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+$");

    private static final Pattern URL_PATTERN =
            Pattern.compile("^(https?://|www\\.)\\S+$",
                    Pattern.CASE_INSENSITIVE);

    private static final Pattern PHONE_PATTERN =
            Pattern.compile("^[+()\\-\\s\\d]{8,25}$");

    private static final Pattern PAGE_NUMBER_PATTERN =
            Pattern.compile("^\\d{1,4}$");

    private static final String FOOTER_TEXT =
            "knowledge. insight. action";

    private final Tesseract tesseract;

    public DocumentStructureExtractor() {

        this.tesseract = new Tesseract();

        String tessDataPath =
                new File("backend/src/main/resources/tessdata")
                        .getAbsolutePath();

        File trainedData =
                new File(tessDataPath, "eng.traineddata");

        System.out.println("======================================");
        System.out.println("Tesseract tessdata path: " + tessDataPath);
        System.out.println("eng.traineddata path: " + trainedData.getAbsolutePath());
        System.out.println("eng.traineddata exists: " + trainedData.exists());
        System.out.println("eng.traineddata readable: " + trainedData.canRead());
        System.out.println("eng.traineddata size: " + trainedData.length());
        System.out.println("======================================");

        this.tesseract.setDatapath(tessDataPath);
        this.tesseract.setLanguage("eng");
        this.tesseract.setPageSegMode(6);
    }



    /**
     * Main entry point.
     *
     * Supported structured extraction:
     *
     * PDF
     * PPTX
     *
     * DOCX/images are handled by DocumentTextExtractor
     * in the service layer.
     */
    public StructuredDocumentDto extract(MultipartFile file)
            throws IOException {

        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException(
                    "Uploaded file is empty"
            );
        }

        String fileName = file.getOriginalFilename();

        if (fileName == null || fileName.isBlank()) {
            throw new IllegalArgumentException(
                    "File name is missing"
            );
        }

        String extension = getExtension(fileName);

        return switch (extension) {

            case "pdf" ->
                    extractPdfStructure(file);

            case "pptx" ->
                    extractPptxStructure(file);

            default ->
                    throw new IllegalArgumentException(
                            "Structured extraction is not supported for file type: "
                                    + extension
                    );
        };
    }

    // ============================================================
    // PDF EXTRACTION
    // ============================================================

    /**
     * Extract structured information from a PDF.
     *
     * Important:
     *
     * Some PDFs contain real text.
     * Some PDFs contain images of slides.
     * Some PDFs are mixed.
     *
     * Therefore every page is inspected individually.
     *
     * If the PDFBox text layer contains meaningful text,
     * PDFBox is used.
     *
     * If the page contains only footer/page number or
     * insufficient text, OCR is used.
     */
    private StructuredDocumentDto extractPdfStructure(
            MultipartFile file) throws IOException {

        StringBuilder completeContent =
                new StringBuilder();

        List<DocumentTextBlockDto> blocks =
                new ArrayList<>();

        try (PDDocument document =
                     Loader.loadPDF(file.getBytes())) {

            PDFRenderer renderer =
                    new PDFRenderer(document);

            int totalPages =
                    document.getNumberOfPages();

            for (int pageIndex = 0;
                 pageIndex < totalPages;
                 pageIndex++) {

                int pageNumber =
                        pageIndex + 1;

                PDPage page =
                        document.getPage(pageIndex);

                /*
                 * First attempt normal PDF text extraction.
                 */
                String pdfText =
                        extractPdfPageText(
                                document,
                                pageNumber
                        );

                /*
                 * Determine whether PDFBox extracted
                 * useful text.
                 */
                if (hasMeaningfulText(pdfText)) {

                    addPdfTextBlocks(
                            document,
                            page,
                            pageNumber,
                            blocks
                    );

                    appendContent(
                            completeContent,
                            cleanPageText(pdfText)
                    );

                } else {

                    /*
                     * PDFBox did not find enough useful text.
                     *
                     * This is exactly what happens with the
                     * uploaded Apache Kafka PDF.
                     *
                     * The slide title is inside the page image.
                     */
                    BufferedImage image =
                            renderer.renderImageWithDPI(
                                    pageIndex,
                                    200,
                                    ImageType.RGB
                            );

                    String ocrText =
                            performOcr(image, pageNumber);

                    appendContent(
                            completeContent,
                            cleanOcrText(ocrText)
                    );

                    addOcrBlocks(
                            ocrText,
                            pageNumber,
                            blocks
                    );
                }
            }

            System.out.println(
                    "Structured PDF extraction completed. Pages: "
                            + totalPages
                            + ", Blocks extracted: "
                            + blocks.size()
            );
        }

        return StructuredDocumentDto.builder()
                .content(completeContent.toString().trim())
                .blocks(blocks)
                .build();
    }

    /**
     * Extract text from a single PDF page using PDFBox.
     */
    private String extractPdfPageText(
            PDDocument document,
            int pageNumber) throws IOException {

        PDFTextStripper stripper =
                new PDFTextStripper();

        stripper.setStartPage(pageNumber);
        stripper.setEndPage(pageNumber);

        return stripper.getText(document);
    }

    /**
     * Determine whether extracted PDF text is actually useful.
     *
     * Example of text that is NOT useful:
     *
     * Knowledge. Insight. Action
     * 1
     *
     * Such a page should go through OCR.
     */
    private boolean hasMeaningfulText(String text) {

        if (text == null || text.isBlank()) {
            return false;
        }

        String[] lines =
                text.split("\\R");

        int meaningfulCharacters = 0;
        int meaningfulLines = 0;

        for (String rawLine : lines) {

            String line =
                    normalizeWhitespace(rawLine);

            if (line.isBlank()) {
                continue;
            }

            if (isNoise(line)) {
                continue;
            }

            /*
             * A page number alone is not meaningful.
             */
            if (PAGE_NUMBER_PATTERN.matcher(line).matches()) {
                continue;
            }

            meaningfulLines++;

            meaningfulCharacters +=
                    line.length();
        }

        /*
         * Require a reasonable amount of actual content.
         *
         * This prevents pages containing only a footer
         * from being treated as successfully extracted.
         */
        return meaningfulLines >= 2
                || meaningfulCharacters >= 40;
    }

    /**
     * Add PDFBox text blocks.
     *
     * This extracts positional information:
     *
     * x
     * y
     * width
     * height
     * font size
     * bold
     * italic
     */
    private void addPdfTextBlocks(
            PDDocument document,
            PDPage page,
            int pageNumber,
            List<DocumentTextBlockDto> blocks)
            throws IOException {

        PDFStructuredTextStripper stripper =
                new PDFStructuredTextStripper(
                        pageNumber,
                        blocks
                );

        stripper.getText(document);
    }

    /**
     * OCR a rendered PDF page.
     */
    private String performOcr(
            BufferedImage image,
            int pageNumber) {

        try {
            System.out.println("======================================");
            System.out.println("Starting OCR for PDF page: " + pageNumber);
            System.out.println("Image width: " + image.getWidth());
            System.out.println("Image height: " + image.getHeight());
            System.out.println("OCR language: eng");
            System.out.println("OCR completed initialization");

            String result = tesseract.doOCR(image);

            System.out.println(
                    "OCR successfully completed for page: "
                            + pageNumber
            );

            System.out.println(
                    "OCR result length: "
                            + (result == null ? 0 : result.length())
            );

            System.out.println("======================================");

            return result == null ? "" : result;

        } catch (TesseractException e) {

            System.out.println(
                    "OCR failed for page: "
                            + pageNumber
            );

            e.printStackTrace();

            throw new RuntimeException(
                    "OCR failed for PDF page " + pageNumber,
                    e
            );
        }
    }

    /**
     * Convert OCR text into structured blocks.
     *
     * Tesseract's normal doOCR() API does not expose
     * reliable font-size information.
     *
     * Therefore we use:
     *
     * - line order
     * - line length
     * - position approximation
     * - title-like characteristics
     *
     * The first meaningful short line near the top
     * of a presentation page is treated as PAGE_TITLE.
     */
    private void addOcrBlocks(
            String ocrText,
            int pageNumber,
            List<DocumentTextBlockDto> blocks) {

        if (ocrText == null ||
                ocrText.isBlank()) {
            return;
        }

        String[] lines =
                ocrText.split("\\R");

        int meaningfulLineIndex = 0;

        /*
         * Approximate page width/height.
         *
         * These are not exact coordinates because
         * normal Tesseract OCR does not return bounding
         * boxes through doOCR().
         *
         * The Python service mainly uses the block
         * text/type for OCR blocks.
         */
        double yPosition = 0.0;

        for (String rawLine : lines) {

            String line =
                    normalizeWhitespace(rawLine);

            if (line.isBlank()) {
                continue;
            }

            if (isNoise(line)) {
                continue;
            }

            if (PAGE_NUMBER_PATTERN.matcher(line).matches()) {
                continue;
            }

            if (isPhoneNumber(line)) {
                continue;
            }

            if (EMAIL_PATTERN.matcher(line).matches()) {
                continue;
            }

            if (URL_PATTERN.matcher(line).matches()) {
                continue;
            }

            boolean title =
                    isLikelyOcrTitle(
                            line,
                            meaningfulLineIndex
                    );

            String blockType =
                    title
                            ? "PAGE_TITLE"
                            : "PAGE";

            /*
             * Titles are given a larger estimated
             * font size so the Python module extractor
             * can recognize them as headings.
             */
            double estimatedFontSize =
                    title ? 24.0 : 12.0;

            blocks.add(
                    DocumentTextBlockDto.builder()
                            .text(line)
                            .type(blockType)
                            .pageNumber(pageNumber)
                            .x(0.0)
                            .y(yPosition)
                            .width(100.0)
                            .height(20.0)
                            .fontSize(
                                    estimatedFontSize
                            )
                            .bold(title)
                            .italic(false)
                            .build()
            );

            yPosition += 25.0;
            meaningfulLineIndex++;
        }
    }

    /**
     * Decide whether an OCR line is probably the slide title.
     *
     * Typical Kafka slide:
     *
     * Data Pipelines
     *
     * Communication is required...
     *
     * So the first meaningful short line is a strong
     * title candidate.
     */
    private boolean isLikelyOcrTitle(
            String line,
            int meaningfulLineIndex) {

        if (meaningfulLineIndex > 2) {
            return false;
        }

        if (line.length() < 4 ||
                line.length() > 90) {
            return false;
        }

        if (isPhoneNumber(line) ||
                EMAIL_PATTERN.matcher(line).matches() ||
                URL_PATTERN.matcher(line).matches()) {
            return false;
        }

        /*
         * Sentences usually aren't slide titles.
         */
        if (looksLikeSentence(line)) {
            return false;
        }

        /*
         * Lines containing lots of punctuation
         * are less likely to be titles.
         */
        long punctuationCount =
                line.chars()
                        .filter(ch ->
                                ".,:;!?()[]{}=/\\"
                                        .indexOf(ch) >= 0)
                        .count();

        if (punctuationCount > 5) {
            return false;
        }

        return true;
    }

    /**
     * Remove common footer and page-number noise.
     */
    private String cleanPageText(String text) {

        if (text == null) {
            return "";
        }

        StringBuilder cleaned =
                new StringBuilder();

        String[] lines =
                text.split("\\R");

        for (String rawLine : lines) {

            String line =
                    normalizeWhitespace(rawLine);

            if (line.isBlank()) {
                continue;
            }

            if (isNoise(line)) {
                continue;
            }

            if (PAGE_NUMBER_PATTERN.matcher(line).matches()) {
                continue;
            }

            cleaned
                    .append(line)
                    .append("\n");
        }

        return cleaned.toString().trim();
    }

    /**
     * Clean OCR output.
     */
    private String cleanOcrText(String text) {

        return cleanPageText(text);
    }

    /**
     * Append page content while keeping page separation.
     */
    private void appendContent(
            StringBuilder content,
            String pageText) {

        if (pageText == null ||
                pageText.isBlank()) {
            return;
        }

        if (content.length() > 0) {
            content.append("\n\n");
        }

        content.append(pageText);
    }

    // ============================================================
    // PPTX EXTRACTION
    // ============================================================

    /**
     * Extract structured information from PPTX.
     *
     * Unlike the PDF case, PowerPoint gives us
     * text shapes, placeholders and font information.
     */
    private StructuredDocumentDto extractPptxStructure(
            MultipartFile file) throws IOException {

        StringBuilder completeContent =
                new StringBuilder();

        List<DocumentTextBlockDto> blocks =
                new ArrayList<>();

        try (XMLSlideShow presentation =
                     new XMLSlideShow(
                             new ByteArrayInputStream(
                                     file.getBytes()
                             )
                     )) {

            int slideNumber = 1;

            for (var slide :
                    presentation.getSlides()) {

                List<SlideTextBlock> slideBlocks =
                        new ArrayList<>();

                for (XSLFShape shape :
                        slide.getShapes()) {

                    if (!(shape instanceof XSLFTextShape textShape)) {
                        continue;
                    }

                    String shapeText =
                            extractShapeText(textShape);

                    if (shapeText.isBlank()) {
                        continue;
                    }

                    boolean titlePlaceholder =
                            isTitlePlaceholder(
                                    textShape
                            );

                    double x = 0.0;
                    double y = 0.0;
                    double width = 0.0;
                    double height = 0.0;

                    if (textShape.getAnchor() != null) {

                        x =
                                textShape.getAnchor()
                                        .getX();

                        y =
                                textShape.getAnchor()
                                        .getY();

                        width =
                                textShape.getAnchor()
                                        .getWidth();

                        height =
                                textShape.getAnchor()
                                        .getHeight();
                    }

                    double fontSize =
                            getAverageFontSize(
                                    textShape
                            );

                    boolean bold =
                            isBold(textShape);

                    boolean italic =
                            isItalic(textShape);

                    slideBlocks.add(
                            new SlideTextBlock(
                                    shapeText,
                                    titlePlaceholder,
                                    x,
                                    y,
                                    width,
                                    height,
                                    fontSize,
                                    bold,
                                    italic
                            )
                    );
                }

                /*
                 * Sort blocks from top to bottom.
                 */
                slideBlocks.sort(
                        Comparator.comparingDouble(
                                SlideTextBlock::y
                        )
                );

                String slideTitle =
                        findSlideTitle(
                                slideBlocks
                        );

                /*
                 * Add title first.
                 */
                if (slideTitle != null &&
                        !slideTitle.isBlank()) {

                    blocks.add(
                            DocumentTextBlockDto.builder()
                                    .text(slideTitle)
                                    .type("SLIDE_TITLE")
                                    .pageNumber(slideNumber)
                                    .x(findTitleX(slideBlocks))
                                    .y(findTitleY(slideBlocks))
                                    .width(findTitleWidth(slideBlocks))
                                    .height(findTitleHeight(slideBlocks))
                                    .fontSize(findTitleFontSize(slideBlocks))
                                    .bold(true)
                                    .italic(false)
                                    .build()
                    );

                    completeContent
                            .append(slideTitle)
                            .append("\n");
                }

                /*
                 * Add remaining slide content.
                 */
                for (SlideTextBlock block :
                        slideBlocks) {

                    if (slideTitle != null &&
                            slideTitle.equals(
                                    block.text()
                            )) {
                        continue;
                    }

                    if (isNoise(block.text())) {
                        continue;
                    }

                    blocks.add(
                            DocumentTextBlockDto.builder()
                                    .text(block.text())
                                    .type("SLIDE_CONTENT")
                                    .pageNumber(slideNumber)
                                    .x(block.x())
                                    .y(block.y())
                                    .width(block.width())
                                    .height(block.height())
                                    .fontSize(block.fontSize())
                                    .bold(block.bold())
                                    .italic(block.italic())
                                    .build()
                    );

                    completeContent
                            .append(block.text())
                            .append("\n");
                }

                completeContent.append("\n");

                slideNumber++;
            }
        }

        System.out.println(
                "Structured PPTX extraction completed. "
                        + "Slides/blocks: "
                        + blocks.size()
        );

        return StructuredDocumentDto.builder()
                .content(
                        completeContent
                                .toString()
                                .trim()
                )
                .blocks(blocks)
                .build();
    }

    /**
     * Extract complete text from a PowerPoint shape.
     *
     * This is important because a title can be split
     * across multiple text runs.
     */
    private String extractShapeText(
            XSLFTextShape textShape) {

        StringBuilder result =
                new StringBuilder();

        for (XSLFTextParagraph paragraph :
                textShape.getTextParagraphs()) {

            StringBuilder paragraphText =
                    new StringBuilder();

            for (XSLFTextRun run :
                    paragraph.getTextRuns()) {

                String text =
                        run.getRawText();

                if (text != null &&
                        !text.isBlank()) {

                    paragraphText
                            .append(text);
                }
            }

            String paragraphResult =
                    normalizeWhitespace(
                            paragraphText.toString()
                    );

            if (!paragraphResult.isBlank()) {

                if (result.length() > 0) {
                    result.append(" ");
                }

                result.append(
                        paragraphResult
                );
            }
        }

        /*
         * Fallback to getText() if run extraction
         * didn't return anything.
         */
        if (result.length() == 0) {

            String text =
                    textShape.getText();

            if (text != null) {
                return normalizeWhitespace(text);
            }
        }

        return result.toString().trim();
    }

    /**
     * Check whether a PowerPoint shape is a title placeholder.
     */
    private boolean isTitlePlaceholder(
            XSLFTextShape textShape) {

        try {

            Placeholder placeholder =
                    textShape.getPlaceholder();

            return placeholder ==
                    Placeholder.TITLE
                    ||
                    placeholder ==
                            Placeholder.CENTERED_TITLE;

        } catch (Exception ignored) {

            return false;
        }
    }

    /**
     * Find the slide title.
     *
     * Priority:
     *
     * 1. PowerPoint title placeholder
     * 2. Large font
     * 3. Top position
     * 4. Short heading-like text
     */
    private String findSlideTitle(
            List<SlideTextBlock> blocks) {

        if (blocks.isEmpty()) {
            return null;
        }

        /*
         * First priority: actual PowerPoint title.
         */
        for (SlideTextBlock block : blocks) {

            if (block.titlePlaceholder()) {
                return block.text();
            }
        }

        /*
         * Second priority: largest font.
         */
        SlideTextBlock largest =
                blocks.stream()
                        .filter(block ->
                                !isNoise(
                                        block.text()
                                ))
                        .filter(block ->
                                !looksLikeSentence(
                                        block.text()
                                ))
                        .max(
                                Comparator.comparingDouble(
                                        SlideTextBlock::fontSize
                                )
                        )
                        .orElse(null);

        if (largest != null &&
                largest.text().length() <= 100) {

            return largest.text();
        }

        /*
         * Third priority: top-most heading.
         */
        return blocks.stream()
                .filter(block ->
                        !isNoise(
                                block.text()
                        ))
                .filter(block ->
                        !looksLikeSentence(
                                block.text()
                        ))
                .filter(block ->
                        block.text().length() <= 100
                )
                .min(
                        Comparator.comparingDouble(
                                SlideTextBlock::y
                        )
                )
                .map(SlideTextBlock::text)
                .orElse(null);
    }

    private double findTitleX(
            List<SlideTextBlock> blocks) {

        return findTitleBlock(blocks)
                .map(SlideTextBlock::x)
                .orElse(0.0);
    }

    private double findTitleY(
            List<SlideTextBlock> blocks) {

        return findTitleBlock(blocks)
                .map(SlideTextBlock::y)
                .orElse(0.0);
    }

    private double findTitleWidth(
            List<SlideTextBlock> blocks) {

        return findTitleBlock(blocks)
                .map(SlideTextBlock::width)
                .orElse(0.0);
    }

    private double findTitleHeight(
            List<SlideTextBlock> blocks) {

        return findTitleBlock(blocks)
                .map(SlideTextBlock::height)
                .orElse(0.0);
    }

    private double findTitleFontSize(
            List<SlideTextBlock> blocks) {

        return findTitleBlock(blocks)
                .map(SlideTextBlock::fontSize)
                .orElse(24.0);
    }

    private java.util.Optional<SlideTextBlock>
    findTitleBlock(
            List<SlideTextBlock> blocks) {

        if (blocks.isEmpty()) {
            return java.util.Optional.empty();
        }

        for (SlideTextBlock block : blocks) {

            if (block.titlePlaceholder()) {
                return java.util.Optional.of(block);
            }
        }

        return blocks.stream()
                .filter(block ->
                        !isNoise(block.text())
                )
                .filter(block ->
                        !looksLikeSentence(
                                block.text()
                        ))
                .filter(block ->
                        block.text().length() <= 100
                )
                .max(
                        Comparator.comparingDouble(
                                SlideTextBlock::fontSize
                        )
                );
    }

    // ============================================================
    // FONT INFORMATION
    // ============================================================

    private double getAverageFontSize(
            XSLFTextShape textShape) {

        double total = 0.0;
        int count = 0;

        for (XSLFTextParagraph paragraph :
                textShape.getTextParagraphs()) {

            for (XSLFTextRun run :
                    paragraph.getTextRuns()) {

                Double size =
                        run.getFontSize();

                if (size != null &&
                        size > 0) {

                    total += size;
                    count++;
                }
            }
        }

        if (count == 0) {
            return 12.0;
        }

        return total / count;
    }

    private boolean isBold(
            XSLFTextShape textShape) {

        for (XSLFTextParagraph paragraph :
                textShape.getTextParagraphs()) {

            for (XSLFTextRun run :
                    paragraph.getTextRuns()) {

                Boolean bold =
                        run.isBold();

                if (Boolean.TRUE.equals(bold)) {
                    return true;
                }
            }
        }

        return false;
    }

    private boolean isItalic(
            XSLFTextShape textShape) {

        for (XSLFTextParagraph paragraph :
                textShape.getTextParagraphs()) {

            for (XSLFTextRun run :
                    paragraph.getTextRuns()) {

                Boolean italic =
                        run.isItalic();

                if (Boolean.TRUE.equals(italic)) {
                    return true;
                }
            }
        }

        return false;
    }

    // ============================================================
    // NOISE FILTERING
    // ============================================================

    /**
     * Determine whether text should be ignored.
     */
    private boolean isNoise(
            String text) {

        if (text == null ||
                text.isBlank()) {

            return true;
        }

        String normalized =
                normalizeWhitespace(text)
                        .toLowerCase(Locale.ROOT);

        /*
         * Company footer.
         */
        if (normalized.contains(
                FOOTER_TEXT)) {

            return true;
        }

        /*
         * Email.
         */
        if (EMAIL_PATTERN.matcher(
                text.trim()
        ).matches()) {

            return true;
        }

        /*
         * URL.
         */
        if (URL_PATTERN.matcher(
                text.trim()
        ).matches()) {

            return true;
        }

        /*
         * Phone number.
         */
        if (isPhoneNumber(text)) {
            return true;
        }

        /*
         * Page number.
         */
        if (PAGE_NUMBER_PATTERN.matcher(
                text.trim()
        ).matches()) {

            return true;
        }

        return false;
    }

    private boolean isPhoneNumber(
            String text) {

        if (text == null) {
            return false;
        }

        String trimmed =
                text.trim();

        if (!PHONE_PATTERN.matcher(
                trimmed
        ).matches()) {

            return false;
        }

        String digits =
                trimmed.replaceAll(
                        "\\D",
                        ""
                );

        return digits.length() >= 8
                && digits.length() <= 15;
    }

    /**
     * Determine whether text looks like a sentence.
     *
     * Used to avoid choosing paragraph content
     * as a slide title.
     */
    private boolean looksLikeSentence(
            String text) {

        if (text == null ||
                text.isBlank()) {

            return false;
        }

        String value =
                text.trim();

        if (value.endsWith(".")
                || value.endsWith(";")
                || value.endsWith(":")) {

            return true;
        }

        String[] words =
                value.split("\\s+");

        /*
         * Long lines are usually content.
         */
        if (words.length > 14) {
            return true;
        }

        /*
         * Sentence-style phrases.
         */
        String lower =
                value.toLowerCase(
                        Locale.ROOT
                );

        return lower.startsWith(
                "the "
        )
                || lower.startsWith(
                "this "
        )
                || lower.startsWith(
                "it is "
        )
                || lower.startsWith(
                "a "
        )
                || lower.startsWith(
                "an "
        );
    }

    // ============================================================
    // UTILITIES
    // ============================================================

    private String normalizeWhitespace(
            String text) {

        if (text == null) {
            return "";
        }

        return text
                .replace('\u00A0', ' ')
                .replaceAll(
                        "\\s+",
                        " "
                )
                .trim();
    }

    private String getExtension(
            String fileName) {

        int index =
                fileName.lastIndexOf('.');

        if (index == -1) {
            return "";
        }

        return fileName
                .substring(index + 1)
                .toLowerCase(
                        Locale.ROOT
                );
    }

    // ============================================================
    // INTERNAL DATA TYPES
    // ============================================================

    private record SlideTextBlock(
            String text,
            boolean titlePlaceholder,
            double x,
            double y,
            double width,
            double height,
            double fontSize,
            boolean bold,
            boolean italic
    ) {
    }

    // ============================================================
    // PDF STRUCTURED TEXT STRIPPER
    // ============================================================

    /**
     * Custom PDFBox stripper.
     *
     * Captures:
     *
     * - text
     * - page number
     * - x
     * - y
     * - width
     * - height
     * - average font size
     * - bold
     * - italic
     */
    private static class PDFStructuredTextStripper
            extends PDFTextStripper {

        private final int pageNumber;

        private final List<DocumentTextBlockDto> blocks;

        private final List<TextPosition> currentLine =
                new ArrayList<>();

        private String lastLineText = "";

        PDFStructuredTextStripper(
                int pageNumber,
                List<DocumentTextBlockDto> blocks)
                throws IOException {

            super();

            this.pageNumber = pageNumber;
            this.blocks = blocks;

            /*
             * Keep text extraction in natural
             * page order.
             */
            setSortByPosition(true);
        }

        @Override
        protected void writeString(
                String text,
                List<TextPosition> textPositions)
                throws IOException {

            if (text == null ||
                    text.isBlank() ||
                    textPositions == null ||
                    textPositions.isEmpty()) {

                return;
            }

            String cleanedText =
                    text
                            .replaceAll(
                                    "\\s+",
                                    " "
                            )
                            .trim();

            if (cleanedText.isBlank()) {
                return;
            }

            /*
             * Calculate bounding box.
             */
            double minX =
                    Double.POSITIVE_INFINITY;

            double minY =
                    Double.POSITIVE_INFINITY;

            double maxX =
                    Double.NEGATIVE_INFINITY;

            double maxY =
                    Double.NEGATIVE_INFINITY;

            double fontTotal = 0.0;
            int fontCount = 0;

            boolean bold = false;
            boolean italic = false;

            for (TextPosition position :
                    textPositions) {

                float x =
                        position.getXDirAdj();

                float y =
                        position.getYDirAdj();

                float width =
                        position.getWidthDirAdj();

                float height =
                        position.getHeightDir();

                minX =
                        Math.min(
                                minX,
                                x
                        );

                minY =
                        Math.min(
                                minY,
                                y
                        );

                maxX =
                        Math.max(
                                maxX,
                                x + width
                        );

                maxY =
                        Math.max(
                                maxY,
                                y + height
                        );

                float fontSize =
                        position.getFontSizeInPt();

                if (fontSize > 0) {

                    fontTotal +=
                            fontSize;

                    fontCount++;
                }

                String fontName =
                        position
                                .getFont()
                                .getName()
                                .toLowerCase(
                                        Locale.ROOT
                                );

                if (fontName.contains("bold")
                        || fontName.contains("black")
                        || fontName.contains("heavy")) {

                    bold = true;
                }

                if (fontName.contains("italic")
                        || fontName.contains("oblique")) {

                    italic = true;
                }
            }

            double averageFontSize =
                    fontCount > 0
                            ? fontTotal / fontCount
                            : 0.0;

            /*
             * Avoid adding obvious noise.
             */
            if (isNoiseStatic(
                    cleanedText
            )) {
                return;
            }

            /*
             * Avoid duplicate lines.
             */
            if (cleanedText.equals(
                    lastLineText
            )) {
                return;
            }

            lastLineText =
                    cleanedText;

            blocks.add(
                    DocumentTextBlockDto.builder()
                            .text(cleanedText)
                            .type("PAGE")
                            .pageNumber(pageNumber)
                            .x(
                                    Double.isFinite(minX)
                                            ? minX
                                            : 0.0
                            )
                            .y(
                                    Double.isFinite(minY)
                                            ? minY
                                            : 0.0
                            )
                            .width(
                                    Double.isFinite(maxX)
                                            && Double.isFinite(minX)
                                            ? maxX - minX
                                            : 0.0
                            )
                            .height(
                                    Double.isFinite(maxY)
                                            && Double.isFinite(minY)
                                            ? maxY - minY
                                            : 0.0
                            )
                            .fontSize(
                                    averageFontSize
                            )
                            .bold(bold)
                            .italic(italic)
                            .build()
            );
        }
    }

    /**
     * Static noise check used by the PDF stripper.
     */
    private static boolean isNoiseStatic(
            String text) {

        if (text == null ||
                text.isBlank()) {

            return true;
        }

        String normalized =
                text.trim()
                        .toLowerCase(
                                Locale.ROOT
                        );

        if (normalized.contains(
                FOOTER_TEXT
        )) {
            return true;
        }

        if (EMAIL_PATTERN.matcher(
                text.trim()
        ).matches()) {
            return true;
        }

        if (URL_PATTERN.matcher(
                text.trim()
        ).matches()) {
            return true;
        }

        if (PAGE_NUMBER_PATTERN.matcher(
                text.trim()
        ).matches()) {
            return true;
        }

        if (PHONE_PATTERN.matcher(
                text.trim()
        ).matches()) {

            String digits =
                    text.replaceAll(
                            "\\D",
                            ""
                    );

            if (digits.length() >= 8
                    && digits.length() <= 15) {

                return true;
            }
        }

        return false;
    }
}