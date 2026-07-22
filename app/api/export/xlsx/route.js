import ExcelJS from 'exceljs';

export const runtime = 'nodejs';

const FONT = '맑은 고딕';
const INK = 'FF242424';
const PARCHMENT = 'FFF6F3F1';
const ASH = 'FFCECAC8';
const CORAL_BG = 'FFFFE3D9';
const MINT_BG = 'FFE2FCEF';
const PERIWINKLE = 'FFE4EBFA';

const thin = { style: 'thin', color: { argb: ASH } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

// 셀 폭과 글자 수로 줄 수를 추정해 행 높이를 계산 (한글은 폭 2로 계산)
function estimateHeight(text, colWidthChars, lineHeight = 15) {
  if (!text) return 20;
  let lines = 0;
  for (const raw of String(text).split('\n')) {
    let w = 0;
    for (const ch of raw) w += /[ᄀ-ￜ]/.test(ch) ? 2 : 1;
    lines += Math.max(1, Math.ceil(w / colWidthChars));
  }
  return Math.max(20, lines * lineHeight + 6);
}

export async function POST(req) {
  const { fileStats, totalSentences, groups, duplicateSentenceCount, ai, analyzedAt, formatReview } =
    await req.json();

  const wb = new ExcelJS.Workbook();
  wb.creator = '무엇이 무엇이 똑같을까';
  wb.created = new Date();

  /* ── 시트 1: 요약 ─────────────────────────────── */
  const s1 = wb.addWorksheet('요약', { views: [{ showGridLines: false }] });
  s1.columns = [{ width: 3 }, { width: 24 }, { width: 76 }, { width: 3 }];

  s1.getCell('B2').value = '무엇이 무엇이 똑같을까 — 중복 문장 분석 보고서';
  s1.getCell('B2').font = { name: FONT, size: 18, bold: true, color: { argb: INK } };
  s1.getRow(2).height = 30;

  const dt = analyzedAt ? new Date(analyzedAt) : new Date();
  const meta = [
    ['분석 일시', dt.toLocaleString('ko-KR')],
    ['검사 파일', fileStats.map((f) => `${f.name} (문장 ${f.sentences}개)`).join('\n')],
    ['검사 대상 문장 수', `${totalSentences}개`],
    [
      '검사 제외',
      `표 머리글 ${fileStats.reduce((a, f) => a + (f.headerSkipped || 0), 0)}건, 마침표로 끝나지 않는 문구 ${fileStats.reduce((a, f) => a + (f.labelSkipped || 0), 0)}건`,
    ],
    [
      'AI 머리글 검토',
      formatReview?.reviewed > 0
        ? `머리글 후보 ${formatReview.reviewed}건 검토 — 기록 문장으로 복원 ${formatReview.reincluded}건`
        : `검토할 후보 없음${formatReview?.error ? ` (${formatReview.error})` : ''}`,
    ],
    ['중복 문장 그룹', `${groups.length}개`],
    ['중복 발생 총 횟수', `${duplicateSentenceCount}회`],
    [
      '판정',
      groups.length === 0
        ? '✓ 겹치는 문장이 없습니다.'
        : `✗ 똑같은 문장이 있습니다. (파일 간 중복 ${groups.filter((g) => g.crossFile).length}건 포함)`,
    ],
  ];
  let r = 4;
  for (const [k, v] of meta) {
    const kc = s1.getCell(`B${r}`);
    const vc = s1.getCell(`C${r}`);
    kc.value = k;
    kc.font = { name: FONT, size: 10, bold: true, color: { argb: INK } };
    kc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PARCHMENT } };
    kc.alignment = { vertical: 'top' };
    kc.border = BORDER;
    vc.value = v;
    vc.font = { name: FONT, size: 10, color: { argb: 'FF4E4D4D' } };
    vc.alignment = { vertical: 'top', wrapText: true };
    vc.border = BORDER;
    if (k === '판정') {
      vc.font = { name: FONT, size: 11, bold: true, color: { argb: INK } };
      vc.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: groups.length === 0 ? MINT_BG : CORAL_BG },
      };
    }
    s1.getRow(r).height = estimateHeight(v, 76);
    r++;
  }

  r += 1;
  s1.getCell(`B${r}`).value = 'AI 종합 의견 (Upstage Solar 3 Pro)';
  s1.getCell(`B${r}`).font = { name: FONT, size: 12, bold: true, color: { argb: INK } };
  r += 1;
  const aiText = ai?.text || `AI 의견을 작성하지 못했습니다. (사유: ${ai?.error || '알 수 없는 오류'})`;
  s1.mergeCells(`B${r}:C${r}`);
  const aiCell = s1.getCell(`B${r}`);
  aiCell.value = aiText;
  aiCell.font = { name: FONT, size: 10, color: { argb: INK } };
  aiCell.alignment = { vertical: 'top', wrapText: true };
  aiCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PERIWINKLE } };
  aiCell.border = BORDER;
  s1.getRow(r).height = estimateHeight(aiText, 100);

  /* ── 시트 2: 중복 문장 상세 ───────────────────── */
  const s2 = wb.addWorksheet('중복 문장 상세', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  });
  s2.columns = [
    { header: '번호', key: 'no', width: 6 },
    { header: '중복 문장', key: 'sentence', width: 68 },
    { header: '반복 횟수', key: 'count', width: 10 },
    { header: '파일 간 중복', key: 'cross', width: 12 },
    { header: '발견 위치 (파일 · 위치)', key: 'where', width: 56 },
  ];

  const head = s2.getRow(1);
  head.height = 24;
  head.eachCell((c) => {
    c.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    c.alignment = { vertical: 'middle', horizontal: 'center' };
    c.border = BORDER;
  });

  groups.forEach((g, i) => {
    const where = g.occurrences.map((o) => `${o.file} · ${o.location}`).join('\n');
    const row = s2.addRow({
      no: i + 1,
      sentence: g.sentence,
      count: g.count,
      cross: g.crossFile ? '예' : '아니오',
      where,
    });
    row.eachCell((c, col) => {
      c.font = { name: FONT, size: 10, color: { argb: INK } };
      c.border = BORDER;
      c.alignment = { vertical: 'top', wrapText: true };
      if (col === 1 || col === 3 || col === 4) {
        c.alignment = { vertical: 'top', horizontal: 'center' };
      }
      if (i % 2 === 1) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PARCHMENT } };
      }
    });
    if (g.crossFile) {
      row.getCell('cross').font = { name: FONT, size: 10, bold: true, color: { argb: 'FFC0392B' } };
    }
    row.height = Math.max(estimateHeight(g.sentence, 68), estimateHeight(where, 56));
  });

  if (groups.length === 0) {
    const row = s2.addRow({ no: '-', sentence: '겹치는 문장이 없습니다.', count: '-', cross: '-', where: '-' });
    row.eachCell((c) => {
      c.font = { name: FONT, size: 10, color: { argb: INK } };
      c.border = BORDER;
    });
  }
  s2.autoFilter = { from: 'A1', to: `E${Math.max(2, groups.length + 1)}` };

  const buf = await wb.xlsx.writeBuffer();
  const pad = (n) => String(n).padStart(2, '0');
  const fname = `중복문장_분석결과_${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}_${pad(dt.getHours())}${pad(dt.getMinutes())}.xlsx`;

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`,
    },
  });
}
