package com.intellidoc.backend.chat;

import com.intellidoc.backend.exception.DmsExceptions;
import org.springframework.stereotype.Component;

import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SessionLockManager {

    private final Set<UUID> activeSessions = ConcurrentHashMap.newKeySet();

    public void acquireLock(UUID sessionId) {
        if (!activeSessions.add(sessionId)) {
            throw DmsExceptions.messageInProgress();
        }
    }

    public void releaseLock(UUID sessionId) {
        activeSessions.remove(sessionId);
    }
}
