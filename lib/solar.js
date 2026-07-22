/**
 * Upstage Solar 3 Pro 호출 모듈.
 * - generateAiSummary: 분석 결과에 대한 종합 의견 생성
 * - reviewFormatPhrases: 경계 문구(머리글·라벨 후보)가 문장인지 서식인지 판별
 * 모델 이름이 환경에 따라 다를 수 있어 후보를 순서대로 시도하고,
 * 한 번 성공한 모델은 기억해 둔다.
 */
const MODEL_CANDIDATES = ['solar-pro3', 'solar-3-pro', 'solar-pro-3', 'solar-pro2'];
let workingModel = null;

async function callSolar(messages, { maxTokens = 1200, temperature = 0 } = {}) {
  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) return { text: null, model: null, error: 'UPSTAGE_API_KEY가 설정되지 않았습니다.' };

  const models = [
    ...new Set([workingModel, process.env.UPSTAGE_MODEL, ...MODEL_CANDIDATES].filter(Boolean)),
  ];
  let lastError = null;

  for (const model of models) {
    try {
      const res = await fetch('https://api.upstage.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
        signal: AbortSignal.timeout(120_000),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        lastError = data?.error?.message || data?.message || `HTTP ${res.status}`;
        if (res.status === 404 || /model/i.test(String(lastError))) continue;
        break;
      }
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (text) {
        workingModel = model;
        return { text, model, error: null };
      }
      lastError = '빈 응답';
    } catch (e) {
      lastError = e?.message || String(e);
    }
  }
  return { text: null, model: null, error: lastError };
}

/* ── 서식 문구 검토 ─────────────────────────────────── */

const REVIEW_CHUNK = 120;

async function runLimited(limit, items, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

function parseJsonArray(text) {
  const cleaned = text.replace(/```(?:json)?/g, '').trim();

  // 1) 정상적인 JSON 배열
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const arr = JSON.parse(cleaned.slice(start, end + 1));
      if (Array.isArray(arr)) return arr;
    } catch {
      /* 아래 대안으로 넘어간다 */
    }
  }

  // 2) 대괄호 없이 객체만 나열한 경우: {"i":1,...},{"i":2,...}
  try {
    const arr = JSON.parse(`[${cleaned}]`);
    if (Array.isArray(arr)) return arr;
  } catch {
    /* 아래 대안으로 넘어간다 */
  }

  // 3) 최후 수단: {"i":N,"t":"문장|서식"} 패턴을 하나씩 추출
  const found = [...cleaned.matchAll(/\{\s*"i"\s*:\s*(\d+)\s*,\s*"t"\s*:\s*"(문장|서식)"\s*\}/g)];
  if (found.length > 0) return found.map((m) => ({ i: Number(m[1]), t: m[2] }));
  return null;
}

/**
 * items: [{ key, text }]
 * 반환: { decisions: Map<key, '문장'|'서식'>, reviewed, model, error }
 * 실패한 청크는 건너뛴다(규칙 판정 유지). 전체 실패 시 decisions는 비어 있다.
 */
export async function reviewFormatPhrases(items) {
  const decisions = new Map();
  if (!items || items.length === 0) return { decisions, reviewed: 0, model: null, error: null };

  const chunks = [];
  for (let i = 0; i < items.length; i += REVIEW_CHUNK) {
    chunks.push(items.slice(i, i + REVIEW_CHUNK));
  }

  // 동시 호출은 4개로 제한한다 (대용량 파일에서 요청 폭주 방지)
  const results = await runLimited(4, chunks, async (chunk) => {
      const list = chunk.map((it, i) => `${i + 1}. ${it.text}`).join('\n');
      const res = await callSolar(
        [
          {
            role: 'system',
            content:
              '당신은 학교 문서에서 추출한 텍스트가 서술 문장인지 문서 서식인지 가려내는 분류기입니다. 반드시 JSON 배열만 출력합니다.',
          },
          {
            role: 'user',
            content: [
              '아래 텍스트는 학교 문서(생활기록부, 명렬표, 안내문 등)에서 추출한 것입니다.',
              '각 항목을 둘 중 하나로 분류해 주세요.',
              '- "문장": 사람이 쓴 서술·평가 문장이나 그 일부. 예: "성실함.", "발표를 잘함", "책임감이 강한 편"',
              '- "서식": 표 머리글·열 제목, 문서 제목, 항목 이름, 사람 이름, 날짜·학번 같은 데이터 값. 예: "이름", "행동특성 및 종합의견", "2026학년도 1학기", "김하늘"',
              '',
              '판단이 애매하면 "문장"으로 분류하세요. 문장을 서식으로 잘못 빼는 것이 더 나쁜 오류입니다.',
              '',
              '텍스트 목록:',
              list,
              '',
              '출력 형식(JSON 배열만, 다른 말 금지): [{"i":1,"t":"문장"},{"i":2,"t":"서식"}]',
            ].join('\n'),
          },
        ],
        { maxTokens: 4000, temperature: 0 }
      );
      return { chunk, res };
  });

  let reviewed = 0;
  let model = null;
  let lastError = null;
  for (const { chunk, res } of results) {
    if (!res.text) {
      lastError = res.error;
      continue;
    }
    model = res.model;
    const arr = parseJsonArray(res.text);
    if (!arr) {
      lastError = '응답 형식을 해석하지 못했습니다.';
      continue;
    }
    for (const entry of arr) {
      const idx = Number(entry?.i) - 1;
      const type = entry?.t;
      if (idx >= 0 && idx < chunk.length && (type === '문장' || type === '서식')) {
        decisions.set(chunk[idx].key, type);
        reviewed++;
      }
    }
  }
  return { decisions, reviewed, model, error: decisions.size > 0 ? null : lastError };
}

/* ── 종합 의견 ─────────────────────────────────────── */

export async function generateAiSummary({ fileStats, totalSentences, groups }) {
  const top = groups.slice(0, 30).map((g) => ({
    문장: g.sentence.length > 140 ? g.sentence.slice(0, 140) + '…' : g.sentence,
    반복횟수: g.count,
    파일간중복: g.crossFile ? '예' : '아니오',
    발견파일: g.files,
  }));

  const userPrompt = [
    '다음은 교사가 업로드한 문서들에서 "완전히 동일한 문장"을 검출한 결과입니다.',
    '',
    `- 검사 파일: ${fileStats.map((f) => `${f.name}(문장 ${f.sentences}개)`).join(', ')}`,
    `- 전체 문장 수: ${totalSentences}개`,
    `- 중복 문장 그룹: ${groups.length}개 (이 중 파일 간 중복 ${groups.filter((g) => g.crossFile).length}개)`,
    '',
    groups.length > 0
      ? `상위 중복 문장 목록(최대 30개):\n${JSON.stringify(top, null, 1)}`
      : '중복 문장이 없습니다.',
    '',
    '위 결과를 바탕으로 교사에게 전달할 종합 의견을 한국어로 작성해 주세요.',
    '포함할 내용: (1) 전반적인 중복 상태 평가, (2) 특히 주의가 필요한 파일이나 문장(파일 간 중복 우선), (3) 수정 권고사항.',
    '형식: 머리기호(-) 위주로 5~9줄, 간결하고 실무적으로. 마크다운 강조기호(**)는 쓰지 마세요.',
    '문체: 번역투를 쓰지 마세요. "발견되었습니다", "요구됩니다" 같은 수동태 대신 "찾았습니다", "필요합니다"처럼 자연스러운 능동형 한국어로 쓰세요.',
  ].join('\n');

  return callSolar(
    [
      {
        role: 'system',
        content:
          '당신은 학교 문서(생활기록부 등)의 문장 중복을 점검하는 전문 보조원입니다. 정확하고 간결한 한국어로 답합니다.',
      },
      { role: 'user', content: userPrompt },
    ],
    { maxTokens: 1200, temperature: 0.3 }
  );
}
