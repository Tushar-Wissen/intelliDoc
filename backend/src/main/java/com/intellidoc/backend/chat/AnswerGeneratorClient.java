package com.intellidoc.backend.chat;

import java.util.function.Consumer;

public interface AnswerGeneratorClient {
    void generate(AnswerRequest request, Consumer<AnswerEvent> eventConsumer);
}
