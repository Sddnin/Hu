import { del, put } from '@vercel/blob';
import { CommunityCardItem } from '@/lib/types';

export function isBlobConfigured(): boolean {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return Boolean(token && token.length > 0);
}

export interface CommunityBlobPayload {
  id: string;
  title: string;
  description: string;
  category: string;
  authorName: string;
  cards: CommunityCardItem[];
  publishedAt: number;
}

export async function uploadCommunityDeckBlob(
  deckId: string,
  payload: CommunityBlobPayload
): Promise<string | null> {
  if (!isBlobConfigured()) return null;
  try {
    const blob = await put(
      `community-decks/${deckId}.json`,
      JSON.stringify(payload),
      {
        access: 'public',
        contentType: 'application/json; charset=utf-8',
        addRandomSuffix: false,
        allowOverwrite: true,
      }
    );
    return blob.url;
  } catch (error) {
    console.error('Vercel Blob upload error:', error);
    return null;
  }
}

export async function fetchCommunityDeckBlobCards(
  blobUrl: string
): Promise<CommunityCardItem[] | null> {
  if (!blobUrl) return null;
  try {
    const res = await fetch(blobUrl, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<CommunityBlobPayload>;
    if (!Array.isArray(data.cards)) return null;
    return data.cards;
  } catch (error) {
    console.error('Vercel Blob fetch error:', error);
    return null;
  }
}

export async function deleteCommunityDeckBlob(
  blobUrl: string | null | undefined
): Promise<void> {
  if (!blobUrl || !isBlobConfigured()) return;
  try {
    await del(blobUrl);
  } catch (error) {
    console.error('Vercel Blob delete error:', error);
  }
}
