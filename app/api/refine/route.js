import { reviewSentenceCompleteness } from '../../../lib/solar';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * 문장 온전성 검토 — 클라이언트가 문장을 청크로 나눠 호출한다.
 * (한 번에 최대 150건. 서버리스 함수 시간 제한 안에서 Solar 호출 1~2번 분량)
 */
export async function POST(req) {
  try {
    const { items } = await req.json();
    if (!Array.isArray(items) || items.length === 0) {
      return Response.json({ decisions: [], error: null });
    }
    const safe = items
      .slice(0, 150)
      .map((it) => ({ key: String(it.key), text: String(it.text || '').slice(0, 400) }));
    const review = await reviewSentenceCompleteness(safe);
    return Response.json({ decisions: [...review.decisions], error: review.error });
  } catch (e) {
    return Response.json({ decisions: [], error: e?.message || String(e) }, { status: 200 });
  }
}
