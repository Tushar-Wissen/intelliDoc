import { useCallback, useState } from 'react';

import { AI_MODELS, DEFAULT_AI_MODEL_ID, getAiModel } from '@/constants/ai-models';

// The chosen assistant is remembered locally so it sticks across chats and page reloads
// until the user picks another one.
const STORAGE_KEY = 'intellidoc-ai-model';

function readStoredModelId() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return AI_MODELS.some((model) => model.id === stored) ? stored : DEFAULT_AI_MODEL_ID;
  } catch {
    return DEFAULT_AI_MODEL_ID;
  }
}

export function useAiModel() {
  const [modelId, setModelId] = useState(readStoredModelId);

  const selectModel = useCallback((id) => {
    setModelId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore write failures (private browsing, storage full, etc.)
    }
  }, []);

  return { model: getAiModel(modelId), selectModel };
}
