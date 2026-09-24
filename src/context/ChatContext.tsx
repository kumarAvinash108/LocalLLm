import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import { Conversation, ImageAttachment, Message } from '../types';
import { Storage } from '../utils/storage';
import { chatCompletion, isModelLoaded, stopCompletion } from '../services/llm';
import { useModel } from './ModelContext';

/**
 * Battery bounds for prompt construction. Prompt evaluation ("prefill")
 * is the most CPU-intensive phase of on-device inference and its cost
 * grows with prompt length — resending the entire conversation every turn
 * makes each reply slower and hotter than the last. Cap both the number
 * of messages and the total characters sent.
 */
const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_CHARS = 6000;
const SAVER_HISTORY_MESSAGES = 12;
const SAVER_HISTORY_CHARS = 4000;
/** Per-answer token caps: every generated token keeps the CPU awake. */
const DEFAULT_MAX_TOKENS = 512;
/** Hard ceiling even for explicitly Long answers (legacy 2048 cleanup). */
const MAX_TOKENS_CAP = 1024;
const SAVER_MAX_TOKENS = 256;

function buildPromptHistory(
  messages: Message[],
  maxMessages: number,
  maxChars: number,
): Pick<Message, 'role' | 'content'>[] {
  const recent = messages.slice(-maxMessages);
  let chars = 0;
  const picked: Pick<Message, 'role' | 'content'>[] = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    // Images reach the text-only model as OCR text, so measure the
    // expanded prompt content (not the raw caption) against the budget.
    const content = promptContentForMessage(recent[i]);
    if (picked.length > 0 && chars + content.length > maxChars) break;
    chars += content.length;
    picked.unshift({ role: recent[i].role, content });
  }
  // Never send an empty prompt: truncate the latest message instead.
  if (picked.length === 0 && recent.length > 0) {
    const last = recent[recent.length - 1];
    const content = promptContentForMessage(last).slice(-maxChars);
    picked.push({ role: last.role, content });
  }
  return picked;
}

/**
 * Text-only GGUF models cannot see pixels. Images are represented by
 * their on-device OCR text so the model can still answer questions
 * about documents, screenshots, signs, etc. — fully offline.
 */
export function promptContentForMessage(m: Message): string {
  if (!m.images || m.images.length === 0) return m.content;
  const caption = m.content.trim();
  const parts = [
    caption || '(The user attached image(s) with no caption. Answer about what the extracted text says.)',
  ];
  m.images.forEach((img, idx) => {
    const n = idx + 1;
    if (img.ocrState === 'done' && img.ocrText) {
      parts.push(`[Image ${n} — text extracted on-device by OCR]:\n${img.ocrText}`);
    } else if (img.ocrState === 'empty') {
      parts.push(`[Image ${n}: on-device OCR found no readable text in the image.]`);
    } else {
      parts.push(
        `[Image ${n} attached, but on-device text recognition was unavailable for it. ` +
          `Explain you can only read image text when the app is run from a dev build with OCR support.]`,
      );
    }
  });
  return parts.join('\n\n');
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;
  isGenerating: boolean;
}

type ChatAction =
  | { type: 'SET_CONVERSATIONS'; conversations: Conversation[] }
  | { type: 'SET_ACTIVE_CONVERSATION'; id: string | null }
  | { type: 'ADD_CONVERSATION'; conversation: Conversation }
  | { type: 'UPDATE_CONVERSATION'; conversation: Conversation }
  | { type: 'DELETE_CONVERSATION'; id: string }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_GENERATING'; generating: boolean };

const initialState: ChatState = {
  conversations: [],
  activeConversationId: null,
  isLoading: true,
  isGenerating: false,
};

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_CONVERSATIONS':
      return { ...state, conversations: action.conversations };
    case 'SET_ACTIVE_CONVERSATION':
      return { ...state, activeConversationId: action.id };
    case 'ADD_CONVERSATION':
      return {
        ...state,
        conversations: [action.conversation, ...state.conversations],
        activeConversationId: action.conversation.id,
      };
    case 'UPDATE_CONVERSATION':
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.conversation.id ? action.conversation : c
        ),
      };
    case 'DELETE_CONVERSATION': {
      const filtered = state.conversations.filter((c) => c.id !== action.id);
      return {
        ...state,
        conversations: filtered,
        activeConversationId:
          state.activeConversationId === action.id
            ? filtered[0]?.id ?? null
            : state.activeConversationId,
      };
    }
    case 'SET_LOADING':
      return { ...state, isLoading: action.loading };
    case 'SET_GENERATING':
      return { ...state, isGenerating: action.generating };
    default:
      return state;
  }
}

interface ChatContextValue extends ChatState {
  activeConversation: Conversation | null;
  createNewChat: () => string;
  sendMessage: (content: string, opts?: { images?: ImageAttachment[] }) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
  selectChat: (id: string) => void;
  stopGenerating: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const { notifyActivity } = useModel();

  useEffect(() => {
    loadInitialData();
  }, []);

  // Stop burning battery the moment the app backgrounds: an answer nobody
  // is watching should not keep every core hot in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (appState) => {
      if (appState === 'background' && abortControllerRef.current) {
        abortControllerRef.current.abort();
        void stopCompletion();
        dispatch({ type: 'SET_GENERATING', generating: false });
      }
    });
    return () => sub.remove();
  }, []);

  const loadInitialData = async () => {
    const conversations = await Storage.getConversations();
    const activeId = await Storage.getActiveConversationId();
    dispatch({ type: 'SET_CONVERSATIONS', conversations });
    dispatch({
      type: 'SET_ACTIVE_CONVERSATION',
      id: activeId ?? conversations[0]?.id ?? null,
    });
    dispatch({ type: 'SET_LOADING', loading: false });
  };

  const activeConversation = state.conversations.find(
    (c) => c.id === state.activeConversationId
  ) ?? null;

  const createNewChat = useCallback((): string => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const conversation: Conversation = {
      id,
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    dispatch({ type: 'ADD_CONVERSATION', conversation });
    Storage.saveConversation(conversation);
    Storage.setActiveConversationId(id);
    return id;
  }, []);

  const selectChat = useCallback((id: string) => {
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', id });
    Storage.setActiveConversationId(id);
  }, []);

  const deleteChat = useCallback(
    async (id: string) => {
      dispatch({ type: 'DELETE_CONVERSATION', id });
      await Storage.deleteConversation(id);
      if (state.activeConversationId === id) {
        const remaining = state.conversations.filter((c) => c.id !== id);
        const newActiveId = remaining[0]?.id ?? null;
        dispatch({ type: 'SET_ACTIVE_CONVERSATION', id: newActiveId });
        Storage.setActiveConversationId(newActiveId);
      }
    },
    [state.activeConversationId, state.conversations]
  );

  const sendMessage = useCallback(
    async (content: string, opts?: { images?: ImageAttachment[] }) => {
      const images = opts?.images?.length ? opts.images : undefined;
      const text = content.trim();
      // Allow image-only sends (no caption) — OCR text becomes the prompt.
      if (!text && !images) return;
      let convId = state.activeConversationId;

      if (!convId) {
        convId = createNewChat();
      }

      const userMessage: Message = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        role: 'user',
        content: text,
        timestamp: Date.now(),
        ...(images ? { images } : {}),
      };

      const fallbackTitle = images ? '📷 Image chat' : 'New Chat';
      const titleSeed = text || fallbackTitle;
      const conv = state.conversations.find((c) => c.id === convId) ?? {
        id: convId,
        title: titleSeed.slice(0, 40),
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const updatedConv: Conversation = {
        ...conv,
        title: conv.messages.length === 0 ? titleSeed.slice(0, 40) : conv.title,
        messages: [...conv.messages, userMessage],
        updatedAt: Date.now(),
      };

      dispatch({ type: 'UPDATE_CONVERSATION', conversation: updatedConv });
      Storage.saveConversation(updatedConv);

      dispatch({ type: 'SET_GENERATING', generating: true });

      const assistantMessage: Message = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2) + 'ai',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      const streamingConv: Conversation = {
        ...updatedConv,
        messages: [...updatedConv.messages, assistantMessage],
        updatedAt: Date.now(),
      };
      dispatch({ type: 'UPDATE_CONVERSATION', conversation: streamingConv });

      try {
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        if (!isModelLoaded()) {
          const noModelConv: Conversation = {
            ...updatedConv,
            messages: [
              ...updatedConv.messages,
              {
                ...assistantMessage,
                content:
                  'No model is loaded yet.\n\nGo to Models (menu → Models), download a GGUF model from Hugging Face — e.g. Qwen 2.5 0.5B — then tap "Load in Chat" and ask again. Everything runs offline after the download.',
              },
            ],
            updatedAt: Date.now(),
          };
          dispatch({ type: 'UPDATE_CONVERSATION', conversation: noModelConv });
          Storage.saveConversation(noModelConv);
          return;
        }

        const settings = await Storage.getSettings();
        const saver = settings.batterySaver ?? false;
        // Bound prompt size (prefill cost) and answer length (decode cost).
        const history = buildPromptHistory(
          updatedConv.messages,
          saver ? SAVER_HISTORY_MESSAGES : MAX_HISTORY_MESSAGES,
          saver ? SAVER_HISTORY_CHARS : MAX_HISTORY_CHARS,
        );
        const maxTokens = Math.min(
          settings.maxTokens ?? DEFAULT_MAX_TOKENS,
          saver ? SAVER_MAX_TOKENS : MAX_TOKENS_CAP,
        );
        // Battery saver flushes UI less often: fewer bridge crossings and
        // re-renders per answer at the cost of slightly chunkier streaming.
        const flushIntervalMs = saver ? 250 : 120;

        let accumulated = '';
        let lastFlush = 0;
        const flush = () => {
          const partialConv: Conversation = {
            ...updatedConv,
            messages: [...updatedConv.messages, { ...assistantMessage, content: accumulated }],
            updatedAt: Date.now(),
          };
          dispatch({ type: 'UPDATE_CONVERSATION', conversation: partialConv });
        };

        const fullText = await chatCompletion({
          messages: history,
          temperature: settings.temperature ?? 0.7,
          maxTokens,
          abortSignal: signal,
          onToken: (token) => {
            if (signal.aborted) return;
            accumulated += token;
            // Throttle re-renders: flush at most every ~120ms (plus final flush below).
            const now = Date.now();
            if (now - lastFlush > flushIntervalMs) {
              lastFlush = now;
              flush();
            }
          },
        });
        accumulated = fullText || accumulated;

        const finalConv: Conversation = {
          ...updatedConv,
          messages: [
            ...updatedConv.messages,
            { ...assistantMessage, content: accumulated || '...' },
          ],
          updatedAt: Date.now(),
        };
        dispatch({ type: 'UPDATE_CONVERSATION', conversation: finalConv });
        Storage.saveConversation(finalConv);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          const message =
            (error as Error).message === 'No model loaded. Download and load a model first.'
              ? 'No model is loaded yet. Open Models, download a GGUF file, and tap "Load in Chat".'
              : 'Something went wrong. Please try again.';
          const errorConv: Conversation = {
            ...updatedConv,
            messages: [
              ...updatedConv.messages,
              {
                ...assistantMessage,
                content: message,
              },
            ],
            updatedAt: Date.now(),
          };
          dispatch({ type: 'UPDATE_CONVERSATION', conversation: errorConv });
          Storage.saveConversation(errorConv);
        } else {
          // Stopped mid-stream: persist partial text if any was generated.
          // (The last throttled flush already dispatched it; persist it.)
          const partial = state.conversations.find((c) => c.id === convId);
          if (partial) Storage.saveConversation(partial);
        }
      } finally {
        dispatch({ type: 'SET_GENERATING', generating: false });
        abortControllerRef.current = null;
        // Chat activity resets the model's idle auto-unload countdown.
        notifyActivity();
      }
    },
    [state.activeConversationId, state.conversations, createNewChat, notifyActivity]
  );

  const stopGenerating = useCallback(() => {
    abortControllerRef.current?.abort();
    stopCompletion();
    dispatch({ type: 'SET_GENERATING', generating: false });
  }, []);

  return (
    <ChatContext.Provider
      value={{
        ...state,
        activeConversation,
        createNewChat,
        sendMessage,
        deleteChat,
        selectChat,
        stopGenerating,
      }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatContextValue {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
