package com.intellidoc.backend.chat;

import com.intellidoc.backend.dto.SourceHighlightDto;

public final class HighlightLocator {

    private HighlightLocator() {
    }

    public static SourceHighlightDto locate(String passage, String excerpt) {
        if (passage == null || excerpt == null || excerpt.isBlank()) {
            return null;
        }

        // 1. Direct match
        int idx = passage.indexOf(excerpt);
        if (idx >= 0) {
            return new SourceHighlightDto(idx, idx + excerpt.length());
        }

        // 2. Trimmed match
        String trimmedExcerpt = excerpt.trim();
        idx = passage.indexOf(trimmedExcerpt);
        if (idx >= 0) {
            return new SourceHighlightDto(idx, idx + trimmedExcerpt.length());
        }

        // 3. Whitespace-normalized match
        String normPassage = passage.replaceAll("\\s+", " ");
        String normExcerpt = trimmedExcerpt.replaceAll("\\s+", " ");
        int normIdx = normPassage.indexOf(normExcerpt);
        if (normIdx >= 0) {
            // Find mapping back to original passage offsets
            int origStart = mapNormalizedToOriginalIndex(passage, normIdx);
            int origEnd = mapNormalizedToOriginalIndex(passage, normIdx + normExcerpt.length());
            if (origStart >= 0 && origEnd > origStart) {
                return new SourceHighlightDto(origStart, origEnd);
            }
        }

        return null;
    }

    private static int mapNormalizedToOriginalIndex(String original, int normTargetIndex) {
        int normPos = 0;
        boolean inSpace = false;
        for (int i = 0; i < original.length(); i++) {
            char c = original.charAt(i);
            if (Character.isWhitespace(c)) {
                if (!inSpace) {
                    if (normPos == normTargetIndex) {
                        return i;
                    }
                    normPos++;
                    inSpace = true;
                }
            } else {
                inSpace = false;
                if (normPos == normTargetIndex) {
                    return i;
                }
                normPos++;
            }
        }
        if (normPos == normTargetIndex) {
            return original.length();
        }
        return -1;
    }
}
