import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ensureNeonSchema, getDb, isNeonConfigured } from '@/db';
import { mapDeckRow } from '@/db/queries';
import { decks } from '@/db/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { LIMITS } from '@/lib/types';

function clamp(val: unknown, max: number): string {
  return typeof val === 'string' ? val.trim().slice(0, max) : '';
}

export async function POST(req: NextRequest) {
  if (!isNeonConfigured()) {
    return NextResponse.json({ error: 'NEON_NOT_CONFIGURED' }, { status: 503 });
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const title = clamp(body.title, LIMITS.TITLE_MAX) || 'Bộ thẻ mới';
    const description = clamp(body.description, LIMITS.DESC_MAX);
    const category = clamp(body.category, LIMITS.CATEGORY_MAX) || 'Cá nhân';
    const id =
      typeof body.id === 'string' && body.id.trim()
        ? body.id.trim().slice(0, 120)
        : `deck_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const now = Date.now();
    await ensureNeonSchema();
    const db = getDb();

    const [inserted] = await db
      .insert(decks)
      .values({
        id,
        userId,
        title,
        description,
        category,
        cardCount: 0,
        masteredCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json({ deck: mapDeckRow(inserted) }, { status: 201 });
  } catch (error) {
    console.error('POST /api/decks error:', error);
    return NextResponse.json(
      { error: 'Không thể tạo bộ thẻ.' },
      { status: 500 }
    );
  }
}
