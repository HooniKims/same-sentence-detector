import { extractUnits } from '../../../lib/extract';
import { detectDuplicates, collectReviewCandidates } from '../../../lib/detect';
import {
  generateAiSummary,
  reviewHeaderCandidates,
  reviewMissingPeriods,
} from '../../../lib/solar';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req) {
  const form = await req.formData();
  const files = form.getAll('files').filter((f) => typeof f === 'object' && f?.name);
  // 모든 문장을 검사한다. 의미 없는 한 글자 조각만 거르는 최소값.
  const minLen = 2;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      try {
        if (files.length === 0) throw new Error('올린 파일이 없습니다.');
        send({ type: 'progress', pct: 4, message: `파일 ${files.length}개를 받았습니다` });

        const fileUnits = [];
        const parseSpan = 58;
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          send({
            type: 'progress',
            pct: 6 + Math.round((parseSpan * i) / files.length),
            message: `「${f.name}」 내용을 읽는 중…`,
            fileIndex: i,
          });
          const buf = Buffer.from(await f.arrayBuffer());
          const units = await extractUnits(f.name, buf);
          fileUnits.push({ file: f.name, units });
        }

        send({ type: 'progress', pct: 62, message: '문장을 나누어 다듬는 중…', fileIndex: files.length });
        const { headerCandidates, tailCandidates } = collectReviewCandidates(fileUnits);

        const candidateCount = headerCandidates.length + tailCandidates.length;
        send({
          type: 'progress',
          pct: 68,
          message:
            candidateCount > 0
              ? `Solar 3 Pro가 애매한 문구 ${candidateCount}건을 검토하는 중… (마침표 누락 포함)`
              : '애매한 문구를 확인하는 중…',
        });
        const [headerReview, tailReview] = await Promise.all([
          reviewHeaderCandidates(headerCandidates),
          reviewMissingPeriods(tailCandidates),
        ]);

        // AI가 '문장'이라 한 것만 비교 대상으로 되살린다.
        const headerKeys = headerCandidates
          .filter((it) => headerReview.decisions.get(it.key) === '문장')
          .map((it) => it.key);
        const tailKeys = tailCandidates
          .filter((it) => tailReview.decisions.get(it.key) === '문장')
          .map((it) => it.key);
        const includeKeys = new Set([...headerKeys, ...tailKeys]);

        send({ type: 'progress', pct: 76, message: '문장을 서로 맞대어 보는 중…' });
        const { groups, totalSentences, fileStats, missingPeriods } = detectDuplicates(
          fileUnits,
          minLen,
          { includeKeys }
        );

        send({ type: 'progress', pct: 86, message: 'Solar 3 Pro가 종합 의견을 쓰는 중…' });
        const ai =
          totalSentences === 0
            ? {
                text: '- 파일에서 검사할 문장을 찾지 못해 의견을 쓰지 않았습니다.\n- 아직 기록이 입력되지 않은 빈 양식이거나, 문장이 마침표 없이 끝났을 수 있습니다.\n- 기록을 입력한 뒤 다시 검사해 주세요.',
                model: null,
                error: null,
              }
            : await generateAiSummary({ fileStats, totalSentences, groups });

        send({ type: 'progress', pct: 98, message: '보고서를 마무리하는 중…' });
        send({
          type: 'result',
          data: {
            analyzedAt: new Date().toISOString(),
            minLen,
            fileStats,
            totalSentences,
            groups,
            duplicateSentenceCount: groups.reduce((a, g) => a + g.count, 0),
            ai,
            missingPeriods,
            formatReview: {
              reviewed: headerReview.reviewed + tailReview.reviewed,
              candidates: candidateCount,
              headerReincluded: headerKeys.length,
              missingPeriodRestored: tailKeys.length,
              model: tailReview.model || headerReview.model,
              error: tailReview.error || headerReview.error,
            },
          },
        });
      } catch (e) {
        send({ type: 'error', message: e?.message || String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
