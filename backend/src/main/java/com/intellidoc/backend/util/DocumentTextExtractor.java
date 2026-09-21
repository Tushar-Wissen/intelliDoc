package com.intellidoc.backend.util;

import net.sourceforge.tess4j.Tesseract;
import net.sourceforge.tess4j.TesseractException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.File;

@Component
public class DocumentTextExtractor {

    private final Tesseract tesseract;

    public DocumentTextExtractor() {
        this.tesseract = new Tesseract();

        String tessDataPath =
                new File("backend/src/main/resources/tessdata")
                        .getAbsolutePath();

        System.out.println(
                "DocumentTextExtractor Tesseract tessdata path: "
                        + tessDataPath
        );

        File trainedData =
                new File(tessDataPath, "eng.traineddata");

        System.out.println("======================================");
        System.out.println(
                "DocumentTextExtractor tessdata path: "
                        + tessDataPath
        );
        System.out.println(
                "eng.traineddata path: "
                        + trainedData.getAbsolutePath()
        );
        System.out.println(
                "eng.traineddata exists: "
                        + trainedData.exists()
        );
        System.out.println(
                "eng.traineddata readable: "
                        + trainedData.canRead()
        );
        System.out.println(
                "eng.traineddata size: "
                        + trainedData.length()
        );
        System.out.println("======================================");

        if (!trainedData.exists() || !trainedData.canRead()) {
            throw new IllegalStateException(
                    "Tesseract language file not found or not readable: "
                            + trainedData.getAbsolutePath()
            );
        }

        this.tesseract.setDatapath(tessDataPath);
        this.tesseract.setLanguage("eng");
        this.tesseract.setPageSegMode(6);
    }

    public String extractText(MultipartFile file)
            throws IOException {

        String fileName = file.getOriginalFilename();

        if (fileName == null || fileName.isBlank()) {
            throw new IllegalArgumentException(
                    "File name is missing"
            );
        }

        String extension =
                getExtension(fileName);

        return switch (extension) {

            case "pdf" ->
                    extractPdfText(file);

            case "docx" ->
                    extractDocxText(file);

            case "pptx" ->
                    extractPptxText(file);

            case "png", "jpg", "jpeg" ->
                    extractImageText(file);

            default ->
                    throw new IllegalArgumentException(
                            "Unsupported file type: " + extension
                    );
        };
    }


    // =========================================================
    // PDF
    // =========================================================

    private String extractPdfText(
            MultipartFile file)
            throws IOException {

        try (PDDocument document =
                     Loader.loadPDF(file.getBytes())) {

            PDFTextStripper stripper =
                    new PDFTextStripper();

            String text =
                    stripper.getText(document);

            /*
             * If PDF already contains text,
             * return it directly.
             */
            if (text != null && !text.isBlank()) {
                return text;
            }

            /*
             * If PDF is scanned/image based,
             * use OCR.
             */
            return extractScannedPdfText(document);
        }
    }


    // =========================================================
    // SCANNED PDF OCR
    // =========================================================

    private String extractScannedPdfText(
            PDDocument document)
            throws IOException {

        StringBuilder extractedText =
                new StringBuilder();

        PDFRenderer renderer =
                new PDFRenderer(document);

        for (int page = 0;
             page < document.getNumberOfPages();
             page++) {

            BufferedImage image =
                    renderer.renderImageWithDPI(
                            page,
                            200,
                            ImageType.RGB
                    );

            try {

                String pageText =
                        tesseract.doOCR(image);

                extractedText
                        .append(pageText)
                        .append("\n");

            } catch (TesseractException e) {

                throw new RuntimeException(
                        "OCR failed for PDF page "
                                + (page + 1),
                        e
                );
            }
        }

        return extractedText.toString();
    }


    // =========================================================
    // DOCX
    // =========================================================

    private String extractDocxText(
            MultipartFile file)
            throws IOException {

        StringBuilder text =
                new StringBuilder();

        try (XWPFDocument document =
                     new XWPFDocument(
                             new ByteArrayInputStream(
                                     file.getBytes()))) {

            for (XWPFParagraph paragraph :
                    document.getParagraphs()) {

                String paragraphText =
                        paragraph.getText();

                if (paragraphText != null
                        && !paragraphText.isBlank()) {

                    text.append(paragraphText)
                            .append("\n");
                }
            }
        }

        return text.toString();
    }


    // =========================================================
    // PPTX
    // =========================================================

    private String extractPptxText(
            MultipartFile file)
            throws IOException {

        StringBuilder text =
                new StringBuilder();

        try (XMLSlideShow presentation =
                     new XMLSlideShow(
                             new ByteArrayInputStream(
                                     file.getBytes()))) {

            int slideNumber = 1;

            for (var slide :
                    presentation.getSlides()) {

                text.append(
                        "Slide "
                                + slideNumber
                                + "\n"
                );

                for (XSLFShape shape :
                        slide.getShapes()) {

                    if (shape instanceof XSLFTextShape textShape) {

                        String slideText =
                                textShape.getText();

                        if (slideText != null
                                && !slideText.isBlank()) {

                            text.append(slideText)
                                    .append("\n");
                        }
                    }
                }

                text.append("\n");

                slideNumber++;
            }
        }

        return text.toString();
    }


    // =========================================================
    // IMAGE OCR
    // =========================================================

    private String extractImageText(MultipartFile file)
            throws IOException {

        byte[] imageBytes = file.getBytes();

        System.out.println("======================================");
        System.out.println(
                "Starting OCR for image: "
                        + file.getOriginalFilename()
        );
        System.out.println(
                "Image content type: "
                        + file.getContentType()
        );
        System.out.println(
                "Image size: "
                        + imageBytes.length
                        + " bytes"
        );

        BufferedImage image =
                ImageIO.read(
                        new ByteArrayInputStream(imageBytes)
                );

        if (image == null) {
            throw new IllegalArgumentException(
                    "Could not read image file: "
                            + file.getOriginalFilename()
            );
        }

        System.out.println(
                "Image width: "
                        + image.getWidth()
        );

        System.out.println(
                "Image height: "
                        + image.getHeight()
        );

        System.out.println(
                "Starting Tesseract OCR..."
        );

        try {

            String result =
                    tesseract.doOCR(image);

            System.out.println(
                    "OCR completed successfully."
            );

            System.out.println(
                    "OCR result length: "
                            + (result == null
                            ? 0
                            : result.length())
            );

            System.out.println("======================================");

            return result == null
                    ? ""
                    : result;

        } catch (TesseractException e) {

            System.out.println(
                    "OCR failed for image: "
                            + file.getOriginalFilename()
            );

            e.printStackTrace();

            throw new RuntimeException(
                    "OCR failed for image",
                    e
            );
        }
    }

    // =========================================================
    // FILE EXTENSION
    // =========================================================

    private String getExtension(
            String fileName) {

        int index =
                fileName.lastIndexOf('.');

        if (index == -1) {
            return "";
        }

        return fileName
                .substring(index + 1)
                .toLowerCase();
    }
}