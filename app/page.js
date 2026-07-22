'use client';

import { useEffect, useRef, useState } from 'react';

const ACCEPT = '.xlsx,.xls,.csv,.pdf,.hwpx';
const STEPS = [
  { at: 5, label: '파일 받기' },
  { at: 30, label: '내용 읽기' },
  { at: 68, label: 'AI 머리글 검토' },
  { at: 76, label: '문장 대조' },
  { at: 86, label: 'AI 의견' },
  { at: 99, label: '보고서 완성' },
];

function fileExt(name) {
  return name.split('.').pop().toUpperCase();
}

/* 숫자가 0에서 목표값까지 차오르는 카운트업 */
function CountUp({ value }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!value) {
      setN(value || 0);
      return;
    }
    const steps = 28;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setN(Math.round(value * (1 - Math.pow(1 - i / steps, 3))));
      if (i >= steps) clearInterval(id);
    }, 22);
    return () => clearInterval(id);
  }, [value]);
  return n.toLocaleString();
}

export default function Home() {
  const [files, setFiles] = useState([]);
  const [phase, setPhase] = useState('idle'); // idle | analyzing | done | error
  const [pct, setPct] = useState(0);
  const [shownPct, setShownPct] = useState(0);
  const [msg, setMsg] = useState('');
  const [doneFiles, setDoneFiles] = useState(-1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [downloading, setDownloading] = useState(null); // 'xlsx' | 'pdf'
  const [toast, setToast] = useState(null);
  const [fontLevel, setFontLevel] = useState('1');
  const inputRef = useRef(null);

  const split = phase !== 'idle';

  /* 저장해 둔 글자 크기 불러오기 */
  useEffect(() => {
    const saved = localStorage.getItem('fontLevel');
    if (saved === '2' || saved === '3') {
      setFontLevel(saved);
      document.documentElement.dataset.font = saved;
    }
  }, []);

  function changeFontLevel(level) {
    setFontLevel(level);
    if (level === '1') delete document.documentElement.dataset.font;
    else document.documentElement.dataset.font = level;
    localStorage.setItem('fontLevel', level);
  }

  /* 진행률을 목표값까지 부드럽게 트위닝 */
  useEffect(() => {
    if (phase !== 'analyzing') {
      setShownPct(pct);
      return;
    }
    const id = setInterval(() => {
      setShownPct((p) => {
        const diff = pct - p;
        if (Math.abs(diff) < 0.6) return pct;
        return p + Math.max(0.35, diff * 0.1);
      });
    }, 40);
    return () => clearInterval(id);
  }, [pct, phase]);

  /* 토스트 자동 사라짐 */
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  function showToast(message) {
    setToast({ message, id: Date.now() });
  }

  function addFiles(list) {
    const incoming = [...list].filter((f) => /\.(xlsx|xls|csv|pdf|hwpx)$/i.test(f.name));
    if (incoming.length === 0 && list.length > 0) {
      showToast('지원하지 않는 파일 형식입니다');
      return;
    }
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...incoming.filter((f) => !names.has(f.name))];
    });
  }

  async function startAnalysis() {
    if (files.length === 0 || phase === 'analyzing') return;
    setPhase('analyzing');
    setPct(0);
    setShownPct(0);
    setMsg('분석을 준비하는 중…');
    setDoneFiles(-1);
    setResult(null);
    setError(null);

    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);

      const res = await fetch('/api/analyze', { method: 'POST', body: fd });
      if (!res.ok || !res.body) throw new Error(`서버 오류 (HTTP ${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === 'progress') {
            setPct(ev.pct);
            setMsg(ev.message);
            if (typeof ev.fileIndex === 'number') setDoneFiles(ev.fileIndex - 1);
          } else if (ev.type === 'result') {
            finalResult = ev.data;
          } else if (ev.type === 'error') {
            throw new Error(ev.message);
          }
        }
      }

      if (!finalResult) throw new Error('분석 결과를 받지 못했습니다.');
      setPct(100);
      setDoneFiles(files.length - 1);
      setMsg('완료');
      setTimeout(() => {
        setResult(finalResult);
        setPhase('done');
      }, 600);
    } catch (e) {
      setError(e?.message || String(e));
      setPhase('error');
    }
  }

  async function downloadXlsx() {
    if (!result) return;
    setDownloading('xlsx');
    try {
      const res = await fetch('/api/export/xlsx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      if (!res.ok) throw new Error('엑셀 생성에 실패했습니다.');
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename\*=UTF-8''(.+)$/);
      const name = m ? decodeURIComponent(m[1]) : '중복문장_분석결과.xlsx';
      triggerDownload(blob, name);
      showToast('엑셀 파일을 내려받았습니다');
    } catch (e) {
      showToast(e.message);
    } finally {
      setDownloading(null);
    }
  }

  async function downloadPdf() {
    if (!result) return;
    setDownloading('pdf');
    try {
      const { exportPdf } = await import('../lib/pdf-export');
      await exportPdf(result);
      showToast('PDF 파일을 내려받았습니다');
    } catch (e) {
      showToast(`PDF를 만들지 못했습니다: ${e.message}`);
    } finally {
      setDownloading(null);
    }
  }

  function triggerDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copySentence(sentence) {
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = sentence;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        showToast(ok ? '문장을 복사했습니다' : '복사에 실패했습니다');
      } catch {
        showToast('복사에 실패했습니다');
      }
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(sentence)
        .then(() => showToast('문장을 복사했습니다'))
        .catch(fallback);
    } else {
      fallback();
    }
  }

  function reset() {
    setPhase('idle');
    setPct(0);
    setShownPct(0);
    setResult(null);
    setError(null);
    setDoneFiles(-1);
  }

  const headerSkipped = result?.fileStats?.reduce((a, f) => a + (f.headerSkipped || 0), 0) ?? 0;
  const labelSkipped = result?.fileStats?.reduce((a, f) => a + (f.labelSkipped || 0), 0) ?? 0;
  const pctInt = Math.round(shownPct);

  return (
    <div className="shell">
      <div className="bg-wash one" />
      <div className="bg-wash two" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          <strong className="brand-dcms">DCMS</strong>
        </div>
        <div className="topbar-right">
          <div className="font-switch" role="group" aria-label="글자 크기 조절">
            {[
              { level: '1', cls: 'sm', name: '기본 크기' },
              { level: '2', cls: 'md', name: '크게' },
              { level: '3', cls: 'lg', name: '아주 크게' },
            ].map((o) => (
              <button
                key={o.level}
                className={`fs-btn ${o.cls}${fontLevel === o.level ? ' on' : ''}`}
                onClick={() => changeFontLevel(o.level)}
                aria-label={`글자 ${o.name}`}
                title={`글자 ${o.name}`}
              >
                가
              </button>
            ))}
          </div>
          <div className="topbar-note">Powered by Upstage Solar 3 Pro</div>
          <div className="signature">by HooniKim</div>
        </div>
      </header>

      <main className={`stage${split ? ' split' : ''}`}>
        {/* ── 왼쪽: 업로드 카드 ── */}
        <section className="left-panel">
          <div className="card enter">
            <div className="badge">Sentence Duplicate Check</div>
            <h1 className="hero-title">무엇이 무엇이 똑같을까</h1>
            <p className="hero-sub">
              여러 문서를 올리면 파일 안팎에서 똑같은 문장을 모두 찾아냅니다. 마침표로
              끝나는 온전한 문장만 비교하고, 제목·이름 같은 문구는 알아서 거릅니다.
            </p>

            {phase === 'idle' || phase === 'error' ? (
              <>
                <div
                  className={`dropzone${dragging ? ' dragging' : ''}`}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    addFiles(e.dataTransfer.files);
                  }}
                >
                  <div className="dz-icon">⇪</div>
                  <div className="dz-main">파일을 끌어다 놓거나 눌러서 골라 주세요</div>
                  <div className="dz-hint">xlsx · xls · csv · pdf · hwpx — 여러 개도 한 번에</div>
                  <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPT}
                    multiple
                    hidden
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </div>

                {files.length > 0 && (
                  <div className="file-list">
                    {files.map((f) => (
                      <div className="file-chip pop" key={f.name}>
                        <span className="f-type">{fileExt(f.name)}</span>
                        <span className="f-name">{f.name}</span>
                        <button
                          aria-label="파일 제거"
                          title="파일 제거"
                          onClick={() => setFiles((prev) => prev.filter((x) => x !== f))}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  className="btn btn-blue btn-block"
                  disabled={files.length === 0}
                  onClick={startAnalysis}
                >
                  분석 시작 <span aria-hidden>▸</span>
                </button>
              </>
            ) : (
              <>
                <div className="file-list">
                  {files.map((f, i) => {
                    const state =
                      phase === 'done' || i <= doneFiles
                        ? 'done'
                        : i === doneFiles + 1 && phase === 'analyzing'
                          ? 'active'
                          : '';
                    return (
                      <div className={`file-chip ${state}`} key={f.name}>
                        <span className="f-type">{fileExt(f.name)}</span>
                        <span className="f-name">{f.name}</span>
                        <span className="f-status">
                          {state === 'done' ? '✓' : state === 'active' ? '…' : '·'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {phase === 'done' && (
                  <button className="btn btn-ghost btn-block" onClick={reset}>
                    새로 검사하기
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        {/* ── 오른쪽: 진행 / 결과 ── */}
        <section className="right-panel">
          {phase === 'analyzing' && (
            <div className="card progress-wrap">
              <div className="progress-blob a" />
              <div className="progress-blob b" />
              <div className="progress-inner">
                <div className="pct-number">
                  {pctInt}
                  <small>%</small>
                </div>
                <div className="progress-bar">
                  <div className="fill" style={{ width: `${shownPct}%` }} />
                </div>
                <div className="progress-msg">{msg}</div>
                <div className="scan-pills">
                  {STEPS.map((s) => (
                    <span key={s.label} className={`scan-pill${pct >= s.at ? ' on' : ''}`}>
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="card">
              <div className="error-box">
                <strong>분석하다가 문제가 생겼습니다.</strong>
                <br />
                {error}
              </div>
              <button className="btn btn-ghost btn-block" onClick={reset}>
                처음으로 돌아가기
              </button>
            </div>
          )}

          {phase === 'done' && result && (
            <div className="results">
              <div className={`verdict ${result.groups.length === 0 ? 'clean' : 'dirty'}`}>
                <span className="v-icon">{result.groups.length === 0 ? '✓' : '!'}</span>
                {result.groups.length === 0
                  ? `문장 ${result.totalSentences.toLocaleString()}개를 모두 검사했습니다. 겹치는 문장이 하나도 없습니다.`
                  : `문장 ${result.totalSentences.toLocaleString()}개를 모두 검사했고, 이 중 ${result.duplicateSentenceCount.toLocaleString()}개가 다른 곳과 똑같습니다. 아래에서 확인해 주세요.`}
              </div>

              <div className="stat-row">
                {[
                  {
                    label: '검사한 파일',
                    value: result.fileStats.length,
                    unit: '개',
                    tip: '이번 검사에 올린 파일 수입니다.',
                  },
                  {
                    label: '총 검사한 문장',
                    value: result.totalSentences,
                    unit: '개',
                    tip: '파일에서 찾은 문장을 하나도 빠짐없이 읽고 서로 비교한 수입니다. 제목이나 이름처럼 문장이 아닌 글만 빼고 전부 검사했어요.',
                  },
                  {
                    label: '의심되는 문장',
                    value: result.duplicateSentenceCount,
                    unit: '개',
                    tip: '총 검사한 문장 가운데 다른 곳과 똑같아서 확인이 필요한 문장 수입니다. 어디에 있는지는 아래 표에 나와요.',
                  },
                  {
                    label: '다른 파일과 겹침',
                    value: result.groups.filter((g) => g.crossFile).length,
                    unit: '건',
                    tip: '서로 다른 파일 사이에서 겹친 문장 수입니다. 한 파일 안에서만 반복된 것보다 더 주의가 필요해요.',
                  },
                ].map((s) => (
                  <div className="stat-pill" key={s.label}>
                    <div className="s-label">{s.label}</div>
                    <div className="s-value">
                      <CountUp value={s.value} />
                      <small> {s.unit}</small>
                    </div>
                    <div className="stat-tip" role="tooltip">
                      {s.tip}
                    </div>
                  </div>
                ))}
              </div>

              {(headerSkipped > 0 || labelSkipped > 0 || result.formatReview?.reviewed > 0) && (
                <p className="skip-note">
                  {(headerSkipped > 0 || labelSkipped > 0) && (
                    <>
                      제목이나 이름처럼 문장이 아닌 글{' '}
                      {(headerSkipped + labelSkipped).toLocaleString()}건은 검사하지
                      않았습니다.{' '}
                    </>
                  )}
                  {(result.formatReview?.missingPeriodRestored ?? 0) > 0 &&
                    `마침표가 빠진 문장 ${result.formatReview.missingPeriodRestored.toLocaleString()}건은 AI가 찾아서 함께 검사했습니다.`}
                  {result.formatReview?.headerReincluded > 0 &&
                    ` 표 첫 줄에 섞여 있던 문장 ${result.formatReview.headerReincluded.toLocaleString()}건도 함께 검사했습니다.`}
                  {result.formatReview?.error &&
                    ` (AI 서식 검토는 건너뛰었습니다: ${result.formatReview.error})`}
                </p>
              )}

              {result.groups.length > 0 && (
                <div className="table-scroll">
                  <table className="dup">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>중복 문장</th>
                        <th>횟수</th>
                        <th>발견 위치</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.groups.map((g, i) => (
                        <tr
                          key={i}
                          title="누르면 문장이 복사됩니다"
                          onClick={() => copySentence(g.sentence)}
                        >
                          <td className="t-num">{i + 1}</td>
                          <td>
                            <div>{g.sentence}</div>
                            {(g.crossFile || g.missingPeriod) && (
                              <div className="tag-row">
                                {g.crossFile && <span className="cross-tag">파일 간 중복</span>}
                                {g.missingPeriod && <span className="mp-tag">마침표 누락</span>}
                              </div>
                            )}
                          </td>
                          <td className="t-count">{g.count}회</td>
                          <td>
                            {g.occurrences.slice(0, 8).map((o, j) => (
                              <div className="loc-line" key={j}>
                                <span className="loc-file">{o.file}</span>
                                <span className="loc-pos">
                                  {o.location}
                                  {o.missingPeriod && ' · 마침표 누락'}
                                </span>
                              </div>
                            ))}
                            {g.occurrences.length > 8 && (
                              <div className="loc-more">
                                외 {g.occurrences.length - 8}곳 — 전체 목록은 다운로드 파일에 있습니다
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {result.missingPeriods?.length > 0 && (
                <div className="mp-card">
                  <h3>
                    마침표 누락 의심 문장
                    <span className="mp-count">{result.missingPeriods.length}건</span>
                  </h3>
                  <p className="mp-desc">
                    문장은 완결되어 보이는데 끝에 마침표가 없습니다. 기록을 다듬을 때 함께
                    확인해 보세요. (중복 여부와 관계없이 비교에는 포함했습니다)
                  </p>
                  <ul>
                    {result.missingPeriods.slice(0, 30).map((m, i) => (
                      <li key={i}>
                        <span className="mp-sentence">{m.sentence}</span>
                        <span className="mp-locs">
                          {m.occurrences
                            .slice(0, 4)
                            .map((o) => `${o.file} · ${o.location}`)
                            .join(', ')}
                          {m.occurrences.length > 4 && ` 외 ${m.occurrences.length - 4}곳`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {result.missingPeriods.length > 30 && (
                    <p className="mp-desc">
                      외 {result.missingPeriods.length - 30}건 — 전체 목록은 다운로드 파일에
                      있습니다.
                    </p>
                  )}
                </div>
              )}

              <div className="ai-card">
                <h3>
                  AI 종합 의견 <span className="ai-model">{result.ai?.model || 'Solar 3 Pro'}</span>
                </h3>
                {result.ai?.text ? (
                  <ul className="ai-list">
                    {result.ai.text
                      .split('\n')
                      .map((line) => line.replace(/^\s*[-·•]\s*/, '').trim())
                      .filter(Boolean)
                      .map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                  </ul>
                ) : (
                  <pre>{`AI 의견을 작성하지 못했습니다. (사유: ${result.ai?.error || '알 수 없는 오류'})`}</pre>
                )}
              </div>

              <div className="dl-row">
                <button className="btn btn-black" onClick={downloadXlsx} disabled={!!downloading}>
                  {downloading === 'xlsx' ? '만드는 중…' : '엑셀로 내려받기 ↓'}
                </button>
                <button className="btn btn-ghost" onClick={downloadPdf} disabled={!!downloading}>
                  {downloading === 'pdf' ? '만드는 중…' : 'PDF로 내려받기 ↓'}
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {toast && (
        <div className="toast" key={toast.id}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
