package com.intellidoc.backend.chat;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.function.Consumer;

@Slf4j
@Component("httpAnswerGenerator")
@RequiredArgsConstructor
public class HttpAnswerGenerator implements AnswerGeneratorClient {

    @Override
    public void generate(AnswerRequest request, Consumer<AnswerEvent> eventConsumer) {
        log.info("HttpAnswerGenerator called for sessionId={}", request.getSessionId());
        eventConsumer.accept(AnswerEvent.token("AI Service response for question: " + request.getQuestion()));
        eventConsumer.accept(AnswerEvent.finalEvent(false, 0.9, request.getAnswerMode()));
    }
}
