import * as XLSX from 'xlsx';
import JSZip from 'jszip';

/**
 * 파일 버퍼에서 텍스트 단위를 추출한다.
 * 반환: [{ text, location }]
 *  - xlsx/xls/csv → 셀 단위, location: "시트명!B3"
 *  - pdf          → 페이지 단위, location: "3쪽"
 *  - hwpx         → 문단 단위, location: "문단 12"
 */
export async function extractUnits(filename, buffer) {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return extractExcel(buffer);
  if (ext === 'pdf') return extractPdf(buffer);
  if (ext === 'hwpx') return extractHwpx(buffer);
  throw new Error(`지원하지 않는 파일 형식입니다: .${ext} (xlsx, xls, csv, pdf, hwpx만 지원)`);
}

function extractExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellText: true });
  const units = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const cells = [];
    for (const addr of Object.keys(sheet)) {
      if (addr.startsWith('!')) continue;
      const cell = sheet[addr];
      const text = typeof cell.v === 'string' ? cell.v : (cell.w ?? '');
      if (typeof text === 'string' && text.trim()) {
        cells.push({ text, addr, row: XLSX.utils.decode_cell(addr).r });
      }
    }
    if (cells.length === 0) continue;
    // 시트의 첫 번째 내용 행은 열 제목(머리글)으로 보고 검사 대상에서 제외한다.
    // 단, 내용이 한 행뿐인 시트는 머리글이 없다고 보고 모두 검사한다.
    const rows = new Set(cells.map((c) => c.row));
    const headerRow = Math.min(...rows);
    const hasHeader = rows.size >= 2;

    // 사람이 알아보기 쉬운 위치("김지율 학생(1/1) · 세부능력 및 특기사항")를
    // 만들기 위해 머리글에서 이름·번호 열을 찾아 둔다.
    const colOf = (addr) => addr.match(/^[A-Z]+/)[0];
    const headersByCol = {};
    cells
      .filter((c) => c.row === headerRow)
      .forEach((c) => {
        headersByCol[colOf(c.addr)] = c.text.trim();
      });
    const findCol = (re) => Object.keys(headersByCol).find((c) => re.test(headersByCol[c]));
    const nameCol = findCol(/성명|이름/);
    const numCol = findCol(/반\s*\/?\s*번호/);
    const idCol = findCol(/학번|개인번호/);
    const cellValue = (col, row) => {
      const cell = sheet[`${col}${row + 1}`];
      return cell == null ? '' : String(cell.v ?? '').trim();
    };
    const rowLabel = (row) => {
      const name = nameCol ? cellValue(nameCol, row) : '';
      if (name) {
        const num = numCol ? cellValue(numCol, row) : '';
        return `${name} 학생${num ? `(${num})` : ''}`;
      }
      const id = idCol ? cellValue(idCol, row) : '';
      return id ? `학번 ${id}` : '';
    };

    for (const c of cells) {
      const isHeader = hasHeader && c.row === headerRow;
      let friendly;
      if (hasHeader && !isHeader) {
        const label = rowLabel(c.row);
        const colTitle = headersByCol[colOf(c.addr)];
        if (label) friendly = colTitle ? `${label} · ${colTitle.slice(0, 14)}` : label;
      }
      units.push({
        text: c.text,
        location: `${sheetName}!${c.addr}`,
        isHeader,
        ...(friendly ? { friendly } : {}),
      });
    }
  }
  return units;
}

async function extractPdf(buffer) {
  const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
  const pages = [];
  await pdfParse(buffer, {
    pagerender: async (pageData) => {
      const tc = await pageData.getTextContent();
      let text = '';
      let lastY = null;
      for (const item of tc.items) {
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 2) text += '\n';
        text += item.str;
        lastY = y;
      }
      pages.push(text);
      return text;
    },
  });
  return pages
    .map((text, i) => ({ text, location: `${i + 1}쪽` }))
    .filter((u) => u.text.trim());
}

async function extractHwpx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const sectionNames = Object.keys(zip.files)
    .filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
  if (sectionNames.length === 0) {
    throw new Error('HWPX 본문(section)을 찾을 수 없습니다. 파일이 손상되었거나 HWP(구버전) 형식일 수 있습니다.');
  }
  const units = [];
  let paraNo = 0;
  for (const name of sectionNames) {
    const xml = await zip.files[name].async('string');
    for (const para of xml.split(/<\/hp:p>/)) {
      const texts = [...para.matchAll(/<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/g)].map((m) =>
        decodeXml(m[1])
      );
      const text = texts.join('');
      paraNo++;
      if (text.trim()) units.push({ text, location: `문단 ${paraNo}` });
    }
  }
  return units;
}

function decodeXml(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
