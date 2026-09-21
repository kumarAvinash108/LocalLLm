import AsyncStorage from 'expo-sqlite/kv-store';
import { Conversation, DownloadedModel, Settings } from '../types';

const KEYS = {
  CONVERSATIONS: '@localllm_conversations',
  SETTINGS: '@localllm_settings',
  ACTIVE_CONVERSATION: '@localllm_active_conversation',
  DOWNLOADED_MODELS: '@localllm_downloaded_models',
  ACTIVE_MODEL_ID: '@localllm_active_model_id',
};

const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  modelName: 'local-model',
  temperature: 0.7,
  // 512 caps per-answer CPU work: each generated token burns battery, and
  // 2048-token answers keep all cores hot for minutes on a phone.
  maxTokens: 512,
  batterySaver: false,
  // Release native weights after 10 min so an idle/loaded model doesn't
  // keep hogging RAM (which forces the OS to compress/kill other apps).
  autoUnloadMinutes: 10,
};

export const Storage = {
  async getConversations(): Promise<Conversation[]> {
    try {
      const data = await AsyncStorage.getItem(KEYS.CONVERSATIONS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  async saveConversations(conversations: Conversation[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.CONVERSATIONS, JSON.stringify(conversations));
  },

  async getConversation(id: string): Promise<Conversation | null> {
    const conversations = await this.getConversations();
    return conversations.find((c) => c.id === id) ?? null;
  },

  async saveConversation(conversation: Conversation): Promise<void> {
    const conversations = await this.getConversations();
    const index = conversations.findIndex((c) => c.id === conversation.id);
    if (index >= 0) {
      conversations[index] = conversation;
    } else {
      conversations.unshift(conversation);
    }
    await this.saveConversations(conversations);
  },

  async deleteConversation(id: string): Promise<void> {
    const conversations = await this.getConversations();
    await this.saveConversations(conversations.filter((c) => c.id !== id));
  },

  async getActiveConversationId(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.ACTIVE_CONVERSATION);
  },

  async setActiveConversationId(id: string | null): Promise<void> {
    if (id) {
      await AsyncStorage.setItem(KEYS.ACTIVE_CONVERSATION, id);
    } else {
      await AsyncStorage.removeItem(KEYS.ACTIVE_CONVERSATION);
    }
  },

  async getSettings(): Promise<Settings> {
    try {
      const data = await AsyncStorage.getItem(KEYS.SETTINGS);
      // Merge over defaults so settings saved by older versions pick up
      // the new battery fields instead of staying undefined.
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : { ...DEFAULT_SETTINGS };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },

  async saveSettings(settings: Settings): Promise<void> {
    await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
  },

  async getDownloadedModels(): Promise<DownloadedModel[]> {
    try {
      const data = await AsyncStorage.getItem(KEYS.DOWNLOADED_MODELS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  async saveDownloadedModels(models: DownloadedModel[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.DOWNLOADED_MODELS, JSON.stringify(models));
  },

  async getActiveModelId(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(KEYS.ACTIVE_MODEL_ID);
    } catch {
      return null;
    }
  },

  async setActiveModelId(id: string | null): Promise<void> {
    if (id) {
      await AsyncStorage.setItem(KEYS.ACTIVE_MODEL_ID, id);
    } else {
      await AsyncStorage.removeItem(KEYS.ACTIVE_MODEL_ID);
    }
  },

  async clearAll(): Promise<void> {
    const keys = Object.values(KEYS);
    for (const key of keys) {
      await AsyncStorage.removeItem(key);
    }
  },
};
