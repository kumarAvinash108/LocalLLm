import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { Conversation, Message } from '../types';
import { Storage } from '../utils/storage';
import { chatCompletion, isModelLoaded, stopCompletion } from '../services/llm';

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
  sendMessage: (content: string) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
  selectChat: (id: string) => void;
  stopGenerating: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  useEffect(() => {
    loadInitialData();
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
    async (content: string) => {
      let convId = state.activeConversationId;

      if (!convId) {
        convId = createNewChat();
      }

      const userMessage: Message = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      const conv = state.conversations.find((c) => c.id === convId) ?? {
        id: convId,
        title: content.slice(0, 40),
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const updatedConv: Conversation = {
        ...conv,
        title: conv.messages.length === 0 ? content.slice(0, 40) : conv.title,
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
        const history: Pick<Message, 'role' | 'content'>[] = [
          ...updatedConv.messages.map((m) => ({ role: m.role, content: m.content })),
        ];

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
          maxTokens: settings.maxTokens ?? 512,
          abortSignal: signal,
          onToken: (token) => {
            if (signal.aborted) return;
            accumulated += token;
            // Throttle re-renders: flush at most every ~120ms (plus final flush below).
            const now = Date.now();
            if (now - lastFlush > 120) {
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
      }
    },
    [state.activeConversationId, state.conversations, createNewChat]
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
