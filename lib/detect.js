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

const TERMINATOR_END = /[.!?…。]["'」』)\]]?$/;

/**
 * 비교 대상이 되는 '온전한 문장'인지 판단한다.
 * 생활기록부 문장은 마침표 단위로 끝난다 — 마침표(또는 ?, !)가 찍혀야
 * 한 문장이 끝난 것이다. 따라서 "성실함."은 문장이고,
 * "발표를 잘함"(마침표 없음), "책임감이 강한 편", "행동특성 및 종합의견"(머리글),
 * "김하늘"(이름)은 모두 문장이 아니다.
 */
export function isCompleteSentence(sentence) {
  return TERMINATOR_END.test(sentence.trim());
}

/**
 * AI 검토가 필요한 문구를 모은다 (정규화 키 기준으로 중복 제거).
 * - headerCandidates: 머리글 행에서 나왔지만 마침표로 끝나는 텍스트 —
 *   머리글이 아니라 실제 기록 문장일 수 있어 AI가 확인 후 되살린다.
 * - tailCandidates: 마침표 없이 끝나는 문구 — 교사가 마침표를 빠뜨린
 *   완결 문장일 수 있어 AI가 확인 후 비교에 포함한다.
 */
export function collectReviewCandidates(fileUnits) {
  const header = new Map();
  const tail = new Map();
  for (const f of fileUnits) {
    for (const u of f.units) {
      for (const s of splitSentences(u.text)) {
        const key = normalizeKey(s);
        if (!isEligible(key, 2)) continue;
        if (u.isHeader) {
          if (isCompleteSentence(s) && !header.has(key)) header.set(key, s);
        } else if (!isCompleteSentence(s) && !tail.has(key)) {
          tail.set(key, s);
        }
      }
    }
  }
  const toList = (m) => [...m].map(([key, text]) => ({ key, text }));
  return { headerCandidates: toList(header), tailCandidates: toList(tail) };
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
  const missingMap = new Map(); // 마침표 누락 상태로 비교에 포함된 문장들
  let totalSentences = 0;
  const fileStats = [];

  for (const f of fileUnits) {
    let count = 0;
    let headerSkipped = 0;
    let labelSkipped = 0;
    for (const u of f.units) {
      const sents = splitSentences(u.text);
      for (let si = 0; si < sents.length; si++) {
        const s = sents[si];
        const key = normalizeKey(s);
        if (!isEligible(key, minLen)) continue;

        const byHeader = !!u.isHeader;
        const missingPeriod = !isCompleteSentence(s);
        let excludedFlag = byHeader || missingPeriod;
        if (overrides?.includeKeys?.has(key)) excludedFlag = false;
        if (overrides?.excludeKeys?.has(key)) excludedFlag = true;

        if (excludedFlag) {
          if (byHeader) headerSkipped++;
          else labelSkipped++;
          continue;
        }
        count++;
        totalSentences++;
        const occ = { file: f.file, location: u.location, sentence: s };
        if (u.friendly) occ.friendly = u.friendly;
        // 앞뒤 문맥 — 오타 의심 부분을 고칠 때 참고할 수 있게 남겨 둔다.
        if (si > 0) occ.ctxBefore = '…' + sents[si - 1].slice(-16) + ' ';
        if (si < sents.length - 1) occ.ctxAfter = ' ' + sents[si + 1].slice(0, 16) + '…';
        if (missingPeriod) {
          occ.missingPeriod = true;
          if (!missingMap.has(key)) missingMap.set(key, { sentence: s, occurrences: [] });
          missingMap
            .get(key)
            .occurrences.push({ file: f.file, location: u.location, friendly: u.friendly });
        }
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(occ);
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

  const groups = [...map.entries()]
    .filter(([, occ]) => occ.length >= 2)
    .map(([key, occ]) => {
      const files = [...new Set(occ.map((o) => o.file))];
      return {
        key,
        sentence: occ[0].sentence,
        count: occ.length,
        files,
        crossFile: files.length > 1,
        missingPeriod: occ.some((o) => o.missingPeriod),
        occurrences: occ,
      };
    })
    .sort(
      (a, b) =>
        Number(b.crossFile) - Number(a.crossFile) ||
        b.count - a.count ||
        b.sentence.length - a.sentence.length
    );

  const missingPeriods = [...missingMap.values()].sort(
    (a, b) => b.occurrences.length - a.occurrences.length
  );

  // 검사에 포함된 모든 문장 (오타 의심 전수 검토용)
  const allSentences = [...map.entries()].map(([key, occ]) => ({
    key,
    sentence: occ[0].sentence,
    occurrences: occ,
  }));

  return { groups, totalSentences, fileStats, missingPeriods, allSentences };
}
