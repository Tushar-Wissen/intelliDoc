package com.intellidoc.backend.service;

import com.intellidoc.backend.dto.DocumentModuleDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class ModuleExtractionServiceImpl
        implements ModuleExtractionService {

    /*
     * Examples:
     *
     * 1. Introduction
     * 2. Employee Benefits
     * 2.1 Health Insurance
     * 2.2 Life Insurance
     * 3. Leave Policy
     */

    private static final Pattern NUMBERED_HEADING =
            Pattern.compile(
                    "^\\s*(\\d+(?:\\.\\d+)*)[.)]?\\s+(.+?)\\s*$"
            );


    @Override
    public List<DocumentModuleDto> extractModules(
            String content) {

        if (content == null
                || content.isBlank()) {

            return new ArrayList<>();
        }


        String[] lines =
                content.split("\\r?\\n");


        List<DocumentModuleDto> rootModules =
                new ArrayList<>();


        for (String line : lines) {

            String trimmed =
                    line.trim();


            if (trimmed.isEmpty()) {
                continue;
            }


            Matcher matcher =
                    NUMBERED_HEADING.matcher(trimmed);


            if (!matcher.matches()) {
                continue;
            }


            String number =
                    matcher.group(1);


            String name =
                    matcher.group(2).trim();


            DocumentModuleDto module =
                    DocumentModuleDto.builder()
                            .moduleNumber(number)
                            .moduleName(name)
                            .build();


            if (!number.contains(".")) {

                rootModules.add(module);

            } else {

                String parentNumber =
                        getParentNumber(number);


                DocumentModuleDto parent =
                        findModule(
                                rootModules,
                                parentNumber
                        );


                if (parent != null) {

                    parent.getChildren()
                            .add(module);

                } else {

                    /*
                     * Parent not found.
                     * Keep module at root level
                     * instead of losing it.
                     */
                    rootModules.add(module);
                }
            }
        }


        return rootModules;
    }


    private String getParentNumber(
            String number) {

        int lastDot =
                number.lastIndexOf('.');


        return number.substring(
                0,
                lastDot
        );
    }


    private DocumentModuleDto findModule(
            List<DocumentModuleDto> modules,
            String number) {

        for (DocumentModuleDto module :
                modules) {

            if (module.getModuleNumber()
                    .equals(number)) {

                return module;
            }


            DocumentModuleDto result =
                    findModule(
                            module.getChildren(),
                            number
                    );


            if (result != null) {
                return result;
            }
        }


        return null;
    }
}