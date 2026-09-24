import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { File, UploadType } from 'expo-file-system';
import * as Crypto from 'expo-crypto';

import { env } from './env';
import { supabase } from './supabase';

export type PickedMedia = {
  uri: string;
  kind: 'image' | 'video';
  mimeType: string;
  width: number;
  height: number;
  durationMs: number | null;
  fileSize: number | null;
};

export const LIMITS = {
  imageBytes: 15 * 1024 * 1024,
  videoBytes: 100 * 1024 * 1024,
  videoMs: 10 * 60 * 1000,
  storyVideoMs: 60 * 1000,
  imageMaxSide: 1600,
};

const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

export class MediaError extends Error {}

type PickOptions = { kinds: 'images' | 'videos' | 'all'; camera?: boolean; square?: boolean; maxVideoMs?: number };

export async function pickMedia({ kinds, camera, square, maxVideoMs = LIMITS.videoMs }: PickOptions): Promise<PickedMedia | null> {
  const mediaTypes: ImagePicker.MediaType[] = kinds === 'all' ? ['images', 'videos'] : [kinds];
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes,
    quality: 0.9,
    allowsEditing: !!square,
    aspect: square ? [1, 1] : undefined,
    videoMaxDuration: Math.round(maxVideoMs / 1000),
    exif: false,
  };

  if (camera) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new MediaError('Permití el acceso a la cámara en los ajustes del teléfono.');
  } else if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new MediaError('Permití el acceso a tus fotos en los ajustes del teléfono.');
  }

  const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const isVideo = asset.type === 'video' || (asset.mimeType ?? '').startsWith('video/');

  if (isVideo) {
    const mimeType = normalizeVideoMime(asset.mimeType, asset.uri);
    if (!VIDEO_TYPES.includes(mimeType)) throw new MediaError('Formato de video no soportado. Usá MP4 o MOV.');
    if ((asset.fileSize ?? 0) > LIMITS.videoBytes) throw new MediaError('El video supera los 100 MB.');
    if ((asset.duration ?? 0) > maxVideoMs) {
      throw new MediaError(`El video puede durar hasta ${Math.round(maxVideoMs / 60000) || 1} min.`);
    }
    return {
      uri: asset.uri,
      kind: 'video',
      mimeType,
      width: asset.width || 1080,
      height: asset.height || 1920,
      durationMs: asset.duration ?? null,
      fileSize: asset.fileSize ?? null,
    };
  }

  if ((asset.fileSize ?? 0) > LIMITS.imageBytes) throw new MediaError('La imagen supera los 15 MB.');
  return prepareImage(asset.uri, asset.width, asset.height);
}

// Re-encodes images to JPEG, capped at 1600 px. Re-encoding also strips EXIF
// metadata such as GPS location, which protects the creator's privacy.
export async function prepareImage(uri: string, width: number, height: number): Promise<PickedMedia> {
  const longest = Math.max(width || 0, height || 0);
  const ctx = ImageManipulator.manipulate(uri);
  if (longest > LIMITS.imageMaxSide) {
    ctx.resize(width >= height ? { width: LIMITS.imageMaxSide } : { height: LIMITS.imageMaxSide });
  }
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
  return { uri: out.uri, kind: 'image', mimeType: 'image/jpeg', width: out.width, height: out.height, durationMs: null, fileSize: null };
}

function normalizeVideoMime(mime: string | undefined | null, uri: string): string {
  if (mime && mime.startsWith('video/')) return mime;
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'webm') return 'video/webm';
  return 'video/mp4';
}

export async function makeVideoCover(video: PickedMedia): Promise<PickedMedia> {
  if (Platform.OS === 'web') return webVideoCover(video.uri);
  const thumb = await VideoThumbnails.getThumbnailAsync(video.uri, { time: Math.min(800, (video.durationMs ?? 1000) / 2), quality: 0.8 });
  return prepareImage(thumb.uri, thumb.width, thumb.height);
}

// Web fallback: draw a frame of the video on a canvas.
async function webVideoCover(uri: string): Promise<PickedMedia> {
  const doc = (globalThis as any).document;
  const videoEl = doc.createElement('video');
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.crossOrigin = 'anonymous';
  videoEl.src = uri;
  await new Promise<void>((resolve, reject) => {
    videoEl.onloadeddata = () => resolve();
    videoEl.onerror = () => reject(new MediaError('No pudimos leer el video.'));
  });
  videoEl.currentTime = Math.min(0.8, (videoEl.duration || 1) / 2);
  await new Promise<void>((resolve) => (videoEl.onseeked = () => resolve()));
  const canvas = doc.createElement('canvas');
  const scale = Math.min(1, LIMITS.imageMaxSide / Math.max(videoEl.videoWidth, videoEl.videoHeight));
  canvas.width = Math.round(videoEl.videoWidth * scale);
  canvas.height = Math.round(videoEl.videoHeight * scale);
  canvas.getContext('2d').drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  const dataUrl: string = canvas.toDataURL('image/jpeg', 0.82);
  return { uri: dataUrl, kind: 'image', mimeType: 'image/jpeg', width: canvas.width, height: canvas.height, durationMs: null, fileSize: null };
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

/** Random, unguessable object name inside the user's folder. */
export function objectPath(userId: string, mimeType: string): string {
  return `${userId}/${Crypto.randomUUID()}.${EXT[mimeType] ?? 'bin'}`;
}

export async function uploadFile(
  bucket: 'media' | 'avatars' | 'kyc',
  path: string,
  media: Pick<PickedMedia, 'uri' | 'mimeType'>,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new MediaError('Tu sesión venció. Iniciá sesión de nuevo.');

  if (Platform.OS === 'web') {
    const blob = await (await fetch(media.uri)).blob();
    const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: media.mimeType, upsert: false });
    if (error) throw new MediaError(uploadErrorMessage(error.message));
    onProgress?.(1);
    return path;
  }

  // Native: stream the file from disk (never loads large videos into JS memory).
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const result = await new File(media.uri).upload(`${env.supabaseUrl}/storage/v1/object/${bucket}/${encodedPath}`, {
    httpMethod: 'POST',
    uploadType: UploadType.BINARY_CONTENT,
    mimeType: media.mimeType,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.supabaseKey,
      'Content-Type': media.mimeType,
      'x-upsert': 'false',
      'cache-control': 'max-age=31536000',
    },
    onProgress: ({ bytesSent, totalBytes }) => {
      if (totalBytes > 0) onProgress?.(bytesSent / totalBytes);
    },
  });
  if (result.status < 200 || result.status >= 300) {
    let message = '';
    try {
      message = JSON.parse(result.body)?.message ?? '';
    } catch {
      message = result.body;
    }
    throw new MediaError(uploadErrorMessage(message));
  }
  onProgress?.(1);
  return path;
}

function uploadErrorMessage(message: string): string {
  if (/size|too large|exceeded/i.test(message)) return 'El archivo es demasiado grande.';
  if (/mime|type/i.test(message)) return 'Tipo de archivo no permitido.';
  if (/row-level security|unauthorized|jwt/i.test(message)) return 'No tenés permiso para subir este archivo.';
  return 'No pudimos subir el archivo. Revisá tu conexión y probá de nuevo.';
}

export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

export async function removeFiles(bucket: 'media' | 'avatars', paths: string[]) {
  const clean = paths.filter(Boolean);
  if (clean.length) await supabase.storage.from(bucket).remove(clean);
}
