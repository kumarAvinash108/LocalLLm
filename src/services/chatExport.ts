import { Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Conversation, Message } from '../types';
import { formatLabels } from './imageRecognition';

export type ExportFormat = 'markdown' | 'text' | 'json';

function sanitizeFilename(title: string): string {
  const clean = title
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
  return clean || 'chat';
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMessageImages(m: Message): string {
  if (!m.images || m.images.length === 0) return '';
  const lines: string[] = [];
  m.images.forEach((img, idx) => {
    const parts: string[] = [];
    if (img.labels && img.labels.length > 0) {
      parts.push(`Objects: ${formatLabels(img.labels)}`);
    }
    if (img.ocrText && img.ocrText.trim()) {
      parts.push(`OCR: "${img.ocrText.trim()}"`);
    }
    const detail = parts.length > 0 ? ` (${parts.join(' | ')})` : '';
    lines.push(`*[Attached Image ${idx + 1}${detail}]*`);
  });
  return lines.join('\n');
}

/**
 * Converts a Conversation to a clean, readable Markdown string.
 */
export function conversationToMarkdown(conversation: Conversation): string {
  const lines: string[] = [];
  lines.push(`# ${conversation.title || 'Chat Export'}\n`);
  lines.push(`*Created:* ${formatDate(conversation.createdAt)}  `);
  lines.push(`*Updated:* ${formatDate(conversation.updatedAt)}  `);
  if (conversation.model) {
    lines.push(`*Model:* ${conversation.model}  `);
  }
  lines.push('\n---\n');

  for (const msg of conversation.messages) {
    const roleName = msg.role === 'user' ? '👤 User' : msg.role === 'assistant' ? '⚡ Assistant' : '⚙️ System';
    lines.push(`### ${roleName} (${formatDate(msg.timestamp)})\n`);

    const imgText = formatMessageImages(msg);
    if (imgText) {
      lines.push(`${imgText}\n`);
    }

    if (msg.content) {
      lines.push(`${msg.content}\n`);
    }
    lines.push('\n');
  }

  return lines.join('\n');
}

/**
 * Converts a Conversation to plain text format.
 */
export function conversationToPlainText(conversation: Conversation): string {
  const lines: string[] = [];
  lines.push(`=== ${conversation.title || 'Chat Export'} ===`);
  lines.push(`Date: ${formatDate(conversation.updatedAt)}`);
  if (conversation.model) {
    lines.push(`Model: ${conversation.model}`);
  }
  lines.push('----------------------------------------\n');

  for (const msg of conversation.messages) {
    const roleName = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
    lines.push(`[${roleName} - ${formatDate(msg.timestamp)}]:`);

    if (msg.images && msg.images.length > 0) {
      lines.push(`[Attached ${msg.images.length} image(s)]`);
    }

    if (msg.content) {
      lines.push(msg.content);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Converts a Conversation (or list) to structured JSON string for backup/export.
 */
export function conversationToJson(data: Conversation | Conversation[]): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Opens the native share dialog with formatted Markdown / text directly.
 */
export async function shareConversationText(
  conversation: Conversation,
  asMarkdown: boolean = true,
): Promise<void> {
  const content = asMarkdown
    ? conversationToMarkdown(conversation)
    : conversationToPlainText(conversation);

  await Share.share({
    title: conversation.title,
    message: content,
  });
}

/**
 * Shares a single message's text via native Share sheet.
 */
export async function shareMessageText(message: Message): Promise<void> {
  const roleName = message.role === 'assistant' ? 'LocalLLM' : 'You';
  await Share.share({
    title: `${roleName}'s message`,
    message: message.content,
  });
}

/**
 * Writes the conversation to a cache file (.md, .txt, or .json) and invokes
 * expo-sharing to let the user save it to Files, Google Drive, or send via apps.
 */
export async function exportConversationFile(
  conversation: Conversation,
  format: ExportFormat,
): Promise<{ success: boolean; uri?: string }> {
  const title = sanitizeFilename(conversation.title);
  const timestamp = Date.now().toString(36);

  let extension = 'md';
  let mimeType = 'text/markdown';
  let uti = 'net.daringfireball.markdown';
  let content = '';

  switch (format) {
    case 'markdown':
      extension = 'md';
      mimeType = 'text/markdown';
      uti = 'net.daringfireball.markdown';
      content = conversationToMarkdown(conversation);
      break;
    case 'text':
      extension = 'txt';
      mimeType = 'text/plain';
      uti = 'public.plain-text';
      content = conversationToPlainText(conversation);
      break;
    case 'json':
      extension = 'json';
      mimeType = 'application/json';
      uti = 'public.json';
      content = conversationToJson(conversation);
      break;
  }

  const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
  const fileUri = `${baseDir}localllm-${title}-${timestamp}.${extension}`;

  await FileSystem.writeAsStringAsync(fileUri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(fileUri, {
      mimeType,
      dialogTitle: `Export "${conversation.title}"`,
      UTI: uti,
    });
    return { success: true, uri: fileUri };
  } else {
    // Fallback to text share if native file sharing is unavailable (e.g. web)
    await Share.share({
      title: conversation.title,
      message: content,
    });
    return { success: true, uri: fileUri };
  }
}

/**
 * Prompts user to select a JSON backup file and parses it into Conversation objects.
 */
export async function importConversationsFromFile(): Promise<Conversation[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.length) {
    return [];
  }

  const picked = result.assets[0];
  const fileContent = await FileSystem.readAsStringAsync(picked.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(fileContent);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  const rawList: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  const validated: Conversation[] = [];

  for (const item of rawList) {
    if (item && typeof item === 'object') {
      const conv = item as Partial<Conversation>;
      if (typeof conv.title === 'string' && Array.isArray(conv.messages)) {
        // Ensure unique ID to avoid collision with existing chats
        const newId = Date.now().toString(36) + Math.random().toString(36).slice(2);
        validated.push({
          id: newId,
          title: conv.title,
          messages: conv.messages.map((m) => ({
            id: m.id || Date.now().toString(36) + Math.random().toString(36).slice(2),
            role: m.role || 'user',
            content: m.content || '',
            timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now(),
            images: m.images,
          })),
          createdAt: typeof conv.createdAt === 'number' ? conv.createdAt : Date.now(),
          updatedAt: typeof conv.updatedAt === 'number' ? conv.updatedAt : Date.now(),
          model: conv.model,
        });
      }
    }
  }

  if (validated.length === 0) {
    throw new Error('No valid conversations found in the selected file.');
  }

  return validated;
}
