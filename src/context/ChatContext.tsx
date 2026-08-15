import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { Conversation, Message } from '../types';
import { Storage } from '../utils/storage';

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

        // Placeholder: This is where you will integrate the local inference engine.
        // For now, simulate a streaming response.
        const simulatedResponse = `This is a placeholder response. To connect a local LLM, integrate your inference engine (e.g., llama.cpp, MLX, ONNX Runtime) here.\n\nYou said: "${content}"`;

        let accumulated = '';
        for (let i = 0; i < simulatedResponse.length; i++) {
          if (!abortControllerRef.current?.signal.aborted) {
            accumulated += simulatedResponse[i];
            const partialMsg: Message = {
              ...assistantMessage,
              content: accumulated,
            };
            const partialConv: Conversation = {
              ...updatedConv,
              messages: [...updatedConv.messages, partialMsg],
              updatedAt: Date.now(),
            };
            dispatch({ type: 'UPDATE_CONVERSATION', conversation: partialConv });
          }
        }

        const finalConv: Conversation = {
          ...updatedConv,
          messages: [
            ...updatedConv.messages,
            { ...assistantMessage, content: accumulated || simulatedResponse },
          ],
          updatedAt: Date.now(),
        };
        dispatch({ type: 'UPDATE_CONVERSATION', conversation: finalConv });
        Storage.saveConversation(finalConv);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          const errorConv: Conversation = {
            ...updatedConv,
            messages: [
              ...updatedConv.messages,
              {
                ...assistantMessage,
                content: 'Something went wrong. Please try again.',
              },
            ],
            updatedAt: Date.now(),
          };
          dispatch({ type: 'UPDATE_CONVERSATION', conversation: errorConv });
          Storage.saveConversation(errorConv);
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
