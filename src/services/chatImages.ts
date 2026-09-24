import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ImageAttachment } from '../types';
import { recognizeImageText } from './ocr';

/** Max images per message — bounds prompt size, storage, and OCR work. */
export const MAX_IMAGES_PER_MESSAGE = 3;
export const CHAT_IMAGES_DIR = 'localllm-chat-images';

function imagesDir(): string {
  const base = FileSystem.documentDirectory ?? '';
  return `${base}${CHAT_IMAGES_DIR}/`;
}

async function ensureImagesDir(): Promise<void> {
  const dir = imagesDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function extForAsset(uri: string): string {
  const clean = uri.split('?')[0].toLowerCase();
  if (clean.endsWith('.png')) return '.png';
  if (clean.endsWith('.heic') || clean.endsWith('.heif')) return '.jpg';
  if (clean.endsWith('.webp')) return '.jpg';
  return '.jpg';
}

/**
 * Copy a picker/cache URI into the app's document directory so the image
 * survives cache eviction and chat history reloads. Always copy — never
 * reference the picker cache URI directly.
 */
export async function persistChatImage(sourceUri: string): Promise<string> {
  await ensureImagesDir();
  const dest = `${imagesDir()}${makeId()}${extForAsset(sourceUri)}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

export interface PickedChatImage {
  uri: string;
  width?: number;
  height?: number;
}

/** System photo library picker (images only, up to MAX_IMAGES_PER_MESSAGE). */
export async function pickChatImages(): Promise<PickedChatImage[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Photo library permission is required to attach images.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: MAX_IMAGES_PER_MESSAGE,
    quality: 0.8,
  });
  if (result.canceled) return [];
  return (result.assets ?? [])
    .filter((a) => a.type !== 'video')
    .slice(0, MAX_IMAGES_PER_MESSAGE)
    .map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
}

/** Camera capture (single photo). */
export async function captureChatImage(): Promise<PickedChatImage | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Camera permission is required to take a photo.');
  }
  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: false,
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const a = result.assets[0];
  return { uri: a.uri, width: a.width, height: a.height };
}

/**
 * Persist + OCR a batch of picked images. OCR failures never throw —
 * they are recorded per-attachment as `ocrState: 'error'` so the message
 * can still be sent (the LLM is told OCR was unavailable).
 */
export async function prepareImageAttachments(
  picked: PickedChatImage[],
): Promise<ImageAttachment[]> {
  const out: ImageAttachment[] = [];
  for (const p of picked) {
    const id = makeId();
    let uri = p.uri;
    try {
      uri = await persistChatImage(p.uri);
    } catch {
      // Fall back to the original URI if the copy fails.
    }
    let ocrText: string | undefined;
    let ocrState: ImageAttachment['ocrState'] = 'pending';
    try {
      const text = await recognizeImageText(uri);
      if (text) {
        ocrText = text;
        ocrState = 'done';
      } else {
        ocrText = '';
        ocrState = 'empty';
      }
    } catch {
      ocrText = undefined;
      ocrState = 'error';
    }
    out.push({ id, uri, width: p.width, height: p.height, ocrText, ocrState });
  }
  return out;
}
