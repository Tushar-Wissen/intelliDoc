import { Sparkles, Hexagon, Asterisk } from 'lucide-react';

// AI assistants the user can chat with. `provider` and `model` are sent with every chat
// message so the backend can route the question to the chosen LLM.
// `tint` styles the provider's icon tile, matching the AI Settings provider cards.
export const AI_MODELS = [
  {
    id: 'gemini-2.5-flash',
    provider: 'gemini',
    providerName: 'Google Gemini',
    label: 'Gemini 2.5 Flash',
    description: 'Fast answers across large document sets',
    icon: Sparkles,
    tint: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    providerName: 'OpenAI',
    label: 'GPT-4o',
    description: 'Balanced reasoning for summaries and Q&A',
    icon: Hexagon,
    tint: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  {
    id: 'claude-sonnet-5',
    provider: 'anthropic',
    providerName: 'Anthropic Claude',
    label: 'Claude Sonnet 5',
    description: 'Careful, well-cited analysis of long documents',
    icon: Asterisk,
    tint: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  },
];

export const DEFAULT_AI_MODEL_ID = AI_MODELS[0].id;

export function getAiModel(id) {
  return AI_MODELS.find((model) => model.id === id) ?? AI_MODELS[0];
}
