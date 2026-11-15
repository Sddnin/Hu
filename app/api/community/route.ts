import crypto from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { ensureNeonSchema, getDb, isNeonConfigured } from '@/db';
import { communityDecks, users } from '@/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import {
  fetchCommunityDeckBlobCards,
  isBlobConfigured,
  uploadCommunityDeckBlob,
} from '@/lib/blob';
import { buildCommunityStarterDecks } from '@/lib/community-seed';
import { CommunityCardItem, CommunityDeck, LIMITS } from '@/lib/types';

function parseCardsJson(raw: string): CommunityCardItem[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function mapCommunityDeckWithBlob(
  row: typeof communityDecks.$inferSelect
): Promise<CommunityDeck> {
  let cards = parseCardsJson(row.cardsJson);
  if (cards.length === 0 && row.blobUrl) {
    const blobCards = await fetchCommunityDeckBlobCards(row.blobUrl);
    if (blobCards && blobCards.length > 0) {
      cards = blobCards;
    }
  }
  return {
    id: row.id,
    sourceDeckId: row.sourceDeckId ?? null,
    authorId: row.authorUserId,
    authorName: row.authorName,
    title: row.title,
    description: row.description,
    category: row.category,
    cardCount: row.cardCount || cards.length,
    downloadsCount: row.downloadsCount,
    blobUrl: row.blobUrl ?? null,
    cards,
    publishedAt: Number(row.publishedAt),
  };
}

export async function GET() {
  const blobConfigured = isBlobConfigured();

  if (!isNeonConfigured()) {
    return NextResponse.json({
      configured: false,
      blobConfigured,
      decks: buildCommunityStarterDecks(),
    });
  }

  try {
    await ensureNeonSchema();
    const db = getDb();

    let rows = await db
      .select()
      .from(communityDecks)
      .orderBy(desc(communityDecks.publishedAt))
      .limit(100);

    if (rows.length === 0) {
      const starter = buildCommunityStarterDecks();
      await db
        .insert(communityDecks)
        .values(
          starter.map((d) => ({
            id: d.id,
            sourceDeckId: d.sourceDeckId,
            authorUserId: d.authorId,
            authorName: d.authorName,
            title: d.title,
            description: d.description,
            category: d.category,
            blobUrl: null,
            cardsJson: JSON.stringify(d.cards),
            cardCount: d.cardCount,
            downloadsCount: d.downloadsCount,
            publishedAt: d.publishedAt,
          }))
        )
        .onConflictDoNothing();

      rows = await db
        .select()
        .from(communityDecks)
        .orderBy(desc(communityDecks.publishedAt))
        .limit(100);
    }

    const decks = await Promise.all(rows.map(mapCommunityDeckWithBlob));

    return NextResponse.json({
      configured: true,
      blobConfigured,
      decks,
    });
  } catch (error) {
    console.error('GET /api/community error:', error);
    return NextResponse.json(
      { error: 'Không thể tải Kho thẻ cộng đồng.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isNeonConfigured()) {
    return NextResponse.json({ error: 'NEON_NOT_CONFIGURED' }, { status: 503 });
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json(
      { error: 'Vui lòng đăng nhập để đăng tải bộ thẻ lên Kho thẻ.' },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const title =
      typeof body.title === 'string'
        ? body.title.trim().slice(0, LIMITS.TITLE_MAX)
        : '';
    const description =
      typeof body.description === 'string'
        ? body.description.trim().slice(0, LIMITS.DESC_MAX)
        : '';
    const category =
      typeof body.category === 'string' && body.category.trim()
        ? body.category.trim().slice(0, LIMITS.CATEGORY_MAX)
        : 'Chung';
    const sourceDeckId =
      typeof body.sourceDeckId === 'string' && body.sourceDeckId.trim()
        ? body.sourceDeckId.trim().slice(0, 120)
        : null;

    const rawCards = Array.isArray(body.cards) ? body.cards : [];
    const cleanCards: CommunityCardItem[] = rawCards
      .slice(0, 150)
      .map(
        (c: {
          term?: unknown;
          phonetic?: unknown;
          partOfSpeech?: unknown;
          meaning?: unknown;
          example?: unknown;
        }) => ({
          term:
            typeof c?.term === 'string'
              ? c.term.trim().slice(0, LIMITS.TERM_MAX)
              : '',
          phonetic:
            typeof c?.phonetic === 'string'
              ? c.phonetic.trim().slice(0, LIMITS.PHONETIC_MAX)
              : '',
          partOfSpeech:
            typeof c?.partOfSpeech === 'string'
              ? c.partOfSpeech.trim().slice(0, LIMITS.POS_MAX)
              : '',
          meaning:
            typeof c?.meaning === 'string'
              ? c.meaning.trim().slice(0, LIMITS.MEANING_MAX)
              : '',
          example:
            typeof c?.example === 'string'
              ? c.example.trim().slice(0, LIMITS.EXAMPLE_MAX)
              : '',
        })
      )
      .filter((c: CommunityCardItem) => c.term.length > 0 && c.meaning.length > 0);

    if (!title || cleanCards.length === 0) {
      return NextResponse.json(
        { error: 'Bộ thẻ cần có tiêu đề và ít nhất 1 thẻ từ vựng.' },
        { status: 400 }
      );
    }

    await ensureNeonSchema();
    const db = getDb();

    const [userRow] = await db
      .select({ displayName: users.displayName, username: users.username })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const authorName = userRow?.displayName || userRow?.username || 'Thành viên';
    const now = Date.now();

    if (sourceDeckId) {
      const [existing] = await db
        .select()
        .from(communityDecks)
        .where(
          and(
            eq(communityDecks.sourceDeckId, sourceDeckId),
            eq(communityDecks.authorUserId, userId)
          )
        )
        .limit(1);

      if (existing) {
        const uploadedBlobUrl = await uploadCommunityDeckBlob(existing.id, {
          id: existing.id,
          title,
          description,
          category,
          authorName,
          cards: cleanCards,
          publishedAt: now,
        });

        const [updated] = await db
          .update(communityDecks)
          .set({
            authorName,
            title,
            description,
            category,
            blobUrl: uploadedBlobUrl ?? existing.blobUrl ?? null,
            cardsJson: uploadedBlobUrl ? '[]' : JSON.stringify(cleanCards),
            cardCount: cleanCards.length,
            publishedAt: now,
          })
          .where(eq(communityDecks.id, existing.id))
          .returning();

        return NextResponse.json({
          deck: {
            id: updated.id,
            sourceDeckId: updated.sourceDeckId ?? null,
            authorId: updated.authorUserId,
            authorName: updated.authorName,
            title: updated.title,
            description: updated.description,
            category: updated.category,
            cardCount: updated.cardCount,
            downloadsCount: updated.downloadsCount,
            blobUrl: updated.blobUrl ?? null,
            cards: cleanCards,
            publishedAt: Number(updated.publishedAt),
          },
        });
      }
    }

    const id = `comm_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const uploadedBlobUrl = await uploadCommunityDeckBlob(id, {
      id,
      title,
      description,
      category,
      authorName,
      cards: cleanCards,
      publishedAt: now,
    });

    const [inserted] = await db
      .insert(communityDecks)
      .values({
        id,
        sourceDeckId,
        authorUserId: userId,
        authorName,
        title,
        description,
        category,
        blobUrl: uploadedBlobUrl,
        cardsJson: uploadedBlobUrl ? '[]' : JSON.stringify(cleanCards),
        cardCount: cleanCards.length,
        downloadsCount: 0,
        publishedAt: now,
      })
      .returning();

    return NextResponse.json(
      {
        deck: {
          id: inserted.id,
          sourceDeckId: inserted.sourceDeckId ?? null,
          authorId: inserted.authorUserId,
          authorName: inserted.authorName,
          title: inserted.title,
          description: inserted.description,
          category: inserted.category,
          cardCount: inserted.cardCount,
          downloadsCount: inserted.downloadsCount,
          blobUrl: inserted.blobUrl ?? null,
          cards: cleanCards,
          publishedAt: Number(inserted.publishedAt),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/community error:', error);
    return NextResponse.json(
      { error: 'Không thể đăng tải bộ thẻ.' },
      { status: 500 }
    );
  }
}
