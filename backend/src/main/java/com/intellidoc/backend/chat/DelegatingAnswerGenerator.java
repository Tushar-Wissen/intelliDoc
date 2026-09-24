package com.intellidoc.backend.chat;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import java.util.function.Consumer;

@Component
@Primary
public class DelegatingAnswerGenerator implements AnswerGeneratorClient {

    private final AnswerGeneratorClient stubAnswerGenerator;
    private final AnswerGeneratorClient httpAnswerGenerator;
    private final String mode;

    public DelegatingAnswerGenerator(
            @Qualifier("stubAnswerGenerator") AnswerGeneratorClient stubAnswerGenerator,
            @Qualifier("httpAnswerGenerator") AnswerGeneratorClient httpAnswerGenerator,
            @Value("${intellidoc.chat.answer-generator.mode:stub}") String mode) {
        this.stubAnswerGenerator = stubAnswerGenerator;
        this.httpAnswerGenerator = httpAnswerGenerator;
        this.mode = mode;
    }

    @Override
    public void generate(AnswerRequest request, Consumer<AnswerEvent> eventConsumer) {
        if ("http".equalsIgnoreCase(mode)) {
            httpAnswerGenerator.generate(request, eventConsumer);
        } else {
            stubAnswerGenerator.generate(request, eventConsumer);
        }
    }
}
