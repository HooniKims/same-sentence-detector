'use client';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

let fontsLoaded = null;

async function fetchFontB64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`폰트 로드 실패: ${url}`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function ensureFonts() {
  if (!fontsLoaded) {
    fontsLoaded = Promise.all([
      fetchFontB64('/fonts/Paperlogy-4Regular.ttf'),
      fetchFontB64('/fonts/Paperlogy-6SemiBold.ttf'),
    ]);
  }
  return fontsLoaded;
}

export async function exportPdf(result) {
  const [regular, semibold] = await ensureFonts();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.addFileToVFS('Paperlogy-Regular.ttf', regular);
  doc.addFont('Paperlogy-Regular.ttf', 'Paperlogy', 'normal');
  doc.addFileToVFS('Paperlogy-SemiBold.ttf', semibold);
  doc.addFont('Paperlogy-SemiBold.ttf', 'Paperlogy', 'bold');
  doc.setFont('Paperlogy', 'normal');

  const W = doc.internal.pageSize.getWidth();
  const M = 16;
  const dt = result.analyzedAt ? new Date(result.analyzedAt) : new Date();
  let y = 22;

  doc.setFont('Paperlogy', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(36, 36, 36);
  doc.text('무엇이 무엇이 똑같을까 — 중복 문장 분석 보고서', M, y);
  y += 9;

  doc.setFont('Paperlogy', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(78, 77, 77);
  doc.text(`분석 일시: ${dt.toLocaleString('ko-KR')}`, M, y);
  y += 6;
  const fileLines = doc.splitTextToSize(
    `검사 파일: ${result.fileStats.map((f) => `${f.name}(문장 ${f.sentences}개)`).join(', ')}`,
    W - M * 2
  );
  doc.text(fileLines, M, y);
  y += fileLines.length * 5 + 2;
  doc.text(
    `총 검사한 문장 ${result.totalSentences}개 · 의심되는 문장 ${result.duplicateSentenceCount}개 (${result.groups.length}종류)`,
    M,
    y
  );
  y += 9;

  const clean = result.groups.length === 0;
  doc.setFillColor(...(clean ? [226, 252, 239] : [255, 227, 217]));
  doc.roundedRect(M, y - 5.5, W - M * 2, 11, 5.5, 5.5, 'F');
  doc.setFont('Paperlogy', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(36, 36, 36);
  doc.text(
    clean
      ? '판정: 겹치는 문장이 없습니다.'
      : `판정: 똑같은 문장이 있습니다. (파일 간 중복 ${result.groups.filter((g) => g.crossFile).length}건 포함)`,
    M + 6,
    y + 1.5
  );
  y += 13;

  if (!clean) {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['번호', '중복 문장', '횟수', '발견 위치']],
      body: result.groups.map((g, i) => [
        String(i + 1),
        g.sentence +
          (g.crossFile ? '\n[파일 간 중복]' : '') +
          (g.missingPeriod ? '\n[마침표 누락 포함]' : ''),
        String(g.count),
        g.occurrences
          .map(
            (o) =>
              `${o.file} · ${o.friendly || o.location}${o.missingPeriod ? ' (마침표 누락)' : ''}`
          )
          .join('\n'),
      ]),
      styles: {
        font: 'Paperlogy',
        fontStyle: 'normal',
        fontSize: 8.5,
        cellPadding: 3,
        textColor: [36, 36, 36],
        lineColor: [206, 202, 200],
        lineWidth: 0.2,
        valign: 'top',
      },
      headStyles: {
        font: 'Paperlogy',
        fontStyle: 'bold',
        fillColor: [36, 36, 36],
        textColor: [255, 255, 255],
        fontSize: 8.5,
      },
      alternateRowStyles: { fillColor: [246, 243, 241] },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 88 },
        2: { cellWidth: 13, halign: 'center' },
        3: { cellWidth: 65 },
      },
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  if (result.missingPeriods?.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['마침표 누락 의심 문장', '발견 위치']],
      body: result.missingPeriods
        .slice(0, 50)
        .map((m) => [
          m.sentence,
          m.occurrences.map((o) => `${o.file} · ${o.friendly || o.location}`).join('\n'),
        ]),
      styles: {
        font: 'Paperlogy',
        fontStyle: 'normal',
        fontSize: 8.5,
        cellPadding: 3,
        textColor: [36, 36, 36],
        lineColor: [217, 194, 106],
        lineWidth: 0.2,
        valign: 'top',
      },
      headStyles: {
        font: 'Paperlogy',
        fontStyle: 'bold',
        fillColor: [236, 218, 152],
        textColor: [36, 36, 36],
        fontSize: 8.5,
      },
      alternateRowStyles: { fillColor: [251, 247, 235] },
      columnStyles: { 0: { cellWidth: 108 }, 1: { cellWidth: 70 } },
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  if (result.typoSuspects?.length > 0) {
    const rows = [];
    for (const t of result.typoSuspects.slice(0, 40)) {
      for (const o of t.occurrences.slice(0, 5)) {
        rows.push([
          `${o.file} · ${o.friendly || o.location}`,
          `${o.ctxBefore || ''}${t.sentence}${o.ctxAfter || ''}`,
        ]);
      }
    }
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['잘못 입력 의심 위치', '앞뒤 문맥 (가운데가 의심 부분)']],
      body: rows,
      styles: {
        font: 'Paperlogy',
        fontStyle: 'normal',
        fontSize: 8.5,
        cellPadding: 3,
        textColor: [36, 36, 36],
        lineColor: [240, 179, 158],
        lineWidth: 0.2,
        valign: 'top',
      },
      headStyles: {
        font: 'Paperlogy',
        fontStyle: 'bold',
        fillColor: [255, 227, 217],
        textColor: [36, 36, 36],
        fontSize: 8.5,
      },
      alternateRowStyles: { fillColor: [253, 246, 243] },
      columnStyles: { 0: { cellWidth: 72 }, 1: { cellWidth: 106 } },
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  const aiText =
    result.ai?.text || `AI 의견을 작성하지 못했습니다. (사유: ${result.ai?.error || '알 수 없는 오류'})`;
  const aiLines = doc.splitTextToSize(aiText, W - M * 2 - 12);
  const blockH = aiLines.length * 4.6 + 20;
  if (y + blockH > doc.internal.pageSize.getHeight() - 14) {
    doc.addPage();
    y = 20;
  }
  doc.setFillColor(228, 235, 250);
  doc.roundedRect(M, y - 4, W - M * 2, blockH, 6, 6, 'F');
  doc.setFont('Paperlogy', 'bold');
  doc.setFontSize(11);
  doc.text('AI 종합 의견 (Upstage Solar 3 Pro)', M + 6, y + 3.5);
  doc.setFont('Paperlogy', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(36, 36, 36);
  doc.text(aiLines, M + 6, y + 11);

  const pad = (n) => String(n).padStart(2, '0');
  doc.save(
    `중복문장_분석결과_${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}_${pad(dt.getHours())}${pad(dt.getMinutes())}.pdf`
  );
}
