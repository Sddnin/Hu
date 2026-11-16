import type { Flashcard } from '@/lib/types';

/**
 * Lặp lại cách quãng (spaced repetition) nhẹ, không cần đổi schema DB.
 *
 * Mỗi thẻ có một "trọng số ôn tập" dựa trên:
 *  - độ yếu: thẻ mới / trả lời sai nhiều => trọng số cao
 *  - độ "quá hạn": thời gian từ lần cập nhật gần nhất (updatedAt) so với
 *    khoảng ôn tập hiện tại của thẻ. Thẻ đã thuộc càng lâu không ôn thì
 *    càng quay lại sớm.
 *
 * Thứ tự cuối cùng là xáo trộn CÓ TRỌNG SỐ (thẻ nặng ký thường đứng trước
 * nhưng không cố định), nên mỗi phiên vẫn có độ ngẫu nhiên.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// Giới hạn hệ số "quá hạn" để một thẻ không áp đảo hoàn toàn / bị bỏ đói.
const OVERDUE_MIN = 0.25;
const OVERDUE_MAX = 4;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Khoảng ôn tập (ngày) mong muốn của thẻ ở trạng thái hiện tại. */
export function getReviewIntervalDays(card: Flashcard): number {
  if (card.mastery === 'mastered') {
    // 2 đúng -> 4 ngày, 3 -> 8, 4 -> 16, từ 5 trở lên -> tối đa 30 ngày
    return Math.min(30, 2 ** Math.min(Math.max(card.correctCount, 1), 5));
  }
  return 1;
}

/** Trọng số ôn tập: càng lớn càng nên cho xuất hiện sớm. */
export function getCardWeight(card: Flashcard, now: number = Date.now()): number {
  if (card.mastery === 'new' || card.reviewCount <= 0) return 3;

  const accuracy = card.correctCount / card.reviewCount;
  const base =
    card.mastery === 'mastered'
      ? 0.5
      : 1.5 + (1 - Math.min(1, Math.max(0, accuracy))) * 2.5;

  const daysSince = Math.max(0, now - card.updatedAt) / DAY_MS;
  const overdue = Math.min(
    OVERDUE_MAX,
    Math.max(OVERDUE_MIN, daysSince / getReviewIntervalDays(card))
  );

  return base * overdue;
}

/**
 * Xáo trộn có trọng số (Efraimidis–Spirakis): thẻ có trọng số cao có xác suất
 * đứng đầu danh sách cao hơn. Cùng `seed` => cùng thứ tự (ổn định khi re-render).
 */
export function prioritizeCards(
  list: Flashcard[],
  seed = 1,
  now: number = Date.now()
): Flashcard[] {
  if (list.length <= 1) return [...list];
  const rand = mulberry32(seed || 1);
  return list
    .map((card) => {
      const u = Math.max(rand(), 1e-9);
      return { card, key: -Math.log(u) / getCardWeight(card, now) };
    })
    .sort((a, b) => a.key - b.key)
    .map((x) => x.card);
}
