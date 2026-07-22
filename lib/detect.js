/**
 * 문장 분리 · 정규화 · 완전 동일 문장 검출.
 * 판정 기준: 구두점/공백 차이는 무시하되, 글자가 하나라도 다르면(조사 포함) 다른 문장으로 본다.
 */

const ENDS_WITH_TERMINATOR = /[.!?…。]["'」』)\]]?\s*$/;

export function splitSentences(text) {
  // 1) 줄 단위로 뭉친다. 종결 부호 없이 끝나는 짧은 줄(제목·머리글)은
  //    다음 문장에 붙지 않도록 독립 블록으로 처리하고,
  //    긴 줄은 문장이 줄바꿈된 것으로 보고 다음 줄과 이어 붙인다.
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const blocks = [];
  let buf = '';
  for (const line of lines) {
    const headingLike = !ENDS_WITH_TERMINATOR.test(line) && line.length <= 20;
    if (headingLike) {
      if (buf) {
        blocks.push(buf);
        buf = '';
      }
      blocks.push(line);
      continue;
    }
    buf = buf ? `${buf} ${line}` : line;
    if (ENDS_WITH_TERMINATOR.test(line)) {
      blocks.push(buf);
      buf = '';
    }
  }
  if (buf) blocks.push(buf);

  // 2) 블록 안에서 문장 종결 부호 뒤를 자른다. "3.5" 같은 소수점은
  //    분리하지 않도록 종결 부호 다음이 공백 또는 한글일 때만 자른다.
  const sentences = [];
  for (const block of blocks) {
    const cleaned = block.replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    for (const s of cleaned.split(/(?<=[.!?…。])(?=\s|[가-힣])/)) {
      const t = s.trim();
      if (t) sentences.push(t);
    }
  }
  return sentences;
}

export function normalizeKey(sentence) {
  // 유니코드 정규화 후 글자·숫자만 남긴다 (구두점·공백·기호 제거)
  const nfc = sentence.normalize('NFC').toLowerCase();
  let key = '';
  for (const ch of nfc) {
    if (/[\p{L}\p{N}]/u.test(ch)) key += ch;
  }
  return key;
}

function isEligible(key, minLen) {
  if (key.length < minLen) return false;
  return /\p{L}/u.test(key); // 숫자만 있는 경우 제외
}

// 명사형 종결('~함', '~임' 등)로 끝나는 글자 — 문장의 끝맺음으로 인정한다.
const NOMINAL_ENDINGS = '함임음됨남봄줌옴짐움림듬듦름감냄다요';
const TERMINATOR_END = /[.!?…。]["'」』)\]]?$/;

/**
 * 비교 대상이 되는 '온전한 문장'인지 판단한다.
 * 기준: (1) 두 어절 이상, (2) 종결부호나 문장형 어미('~함', '~임', '~다' 등)로 끝남.
 * 따라서 "성실함."(한 어절), "책임감이 강한 편"(끝맺음 없음),
 * "행동특성 및 종합의견"(머리글), "김하늘"(이름)은 모두 제외된다.
 */
export function isCompleteSentence(sentence) {
  const t = sentence.trim();
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  if (TERMINATOR_END.test(t)) return true;
  const stripped = t.replace(/["'」』)\]]+$/, '');
  return NOMINAL_ENDINGS.includes(stripped.slice(-1));
}

/**
 * AI 검토가 필요한 문구를 모은다 (정규화 키 기준으로 중복 제거).
 * 규칙이 온전한 문장이 아니라고 뺀 문구가 대상이다 — 규칙이 모르는
 * 끝맺음으로 끝나는 실제 문장이면 AI가 되살린다.
 */
export function collectReviewCandidates(fileUnits) {
  const excluded = new Map();
  for (const f of fileUnits) {
    for (const u of f.units) {
      for (const s of splitSentences(u.text)) {
        const key = normalizeKey(s);
        if (!isEligible(key, 2)) continue;
        if (u.isHeader || !isCompleteSentence(s)) {
          if (!excluded.has(key)) excluded.set(key, s);
        }
      }
    }
  }
  return { excludedByRule: [...excluded].map(([key, text]) => ({ key, text })) };
}

/**
 * fileUnits: [{ file, units: [{ text, location, isHeader? }] }]
 * overrides: { includeKeys?: Set, excludeKeys?: Set } — AI 검토 결과 반영.
 *   includeKeys: 규칙이 뺐지만 문장으로 되살릴 키
 *   excludeKeys: 규칙이 통과시켰지만 서식으로 뺄 키
 * 반환: { groups, totalSentences, fileStats }
 */
export function detectDuplicates(fileUnits, minLen = 2, overrides = null) {
  const map = new Map();
  let totalSentences = 0;
  const fileStats = [];

  for (const f of fileUnits) {
    let count = 0;
    let headerSkipped = 0;
    let labelSkipped = 0;
    for (const u of f.units) {
      for (const s of splitSentences(u.text)) {
        const key = normalizeKey(s);
        if (!isEligible(key, minLen)) continue;

        const byHeader = !!u.isHeader;
        let excludedFlag = byHeader || !isCompleteSentence(s);
        if (overrides?.includeKeys?.has(key)) excludedFlag = false;
        if (overrides?.excludeKeys?.has(key)) excludedFlag = true;

        if (excludedFlag) {
          if (byHeader) headerSkipped++;
          else labelSkipped++;
          continue;
        }
        count++;
        totalSentences++;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ file: f.file, location: u.location, sentence: s });
      }
    }
    fileStats.push({
      name: f.file,
      units: f.units.length,
      sentences: count,
      headerSkipped,
      labelSkipped,
    });
  }

  const groups = [...map.values()]
    .filter((occ) => occ.length >= 2)
    .map((occ) => {
      const files = [...new Set(occ.map((o) => o.file))];
      return {
        sentence: occ[0].sentence,
        count: occ.length,
        files,
        crossFile: files.length > 1,
        occurrences: occ,
      };
    })
    .sort(
      (a, b) =>
        Number(b.crossFile) - Number(a.crossFile) ||
        b.count - a.count ||
        b.sentence.length - a.sentence.length
    );

  return { groups, totalSentences, fileStats };
}
