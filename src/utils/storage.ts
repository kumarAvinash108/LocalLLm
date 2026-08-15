import AsyncStorage from 'expo-sqlite/kv-store';
import { Conversation, Settings } from '../types';

const KEYS = {
  CONVERSATIONS: '@localllm_conversations',
  SETTINGS: '@localllm_settings',
  ACTIVE_CONVERSATION: '@localllm_active_conversation',
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
      return data
        ? JSON.parse(data)
        : { language: 'en', modelName: 'local-model', temperature: 0.7, maxTokens: 2048 };
    } catch {
      return { language: 'en', modelName: 'local-model', temperature: 0.7, maxTokens: 2048 };
    }
  },

  async saveSettings(settings: Settings): Promise<void> {
    await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
  },

  async clearAll(): Promise<void> {
    const keys = Object.values(KEYS);
    for (const key of keys) {
      await AsyncStorage.removeItem(key);
    }
  },
};
