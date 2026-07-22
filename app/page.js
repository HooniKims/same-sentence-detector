const ANALYZE_URL = '/analyze';

const features = [
  {
    number: '01',
    title: '파일 안팎의 같은 문장',
    body: '한 반 안에서 반복된 문장과 여러 반 파일 사이에 겹친 문장을 함께 찾아 위치까지 알려드립니다.',
  },
  {
    number: '02',
    title: '문장 부호 점검',
    body: '마침표가 빠졌거나 문장 중간에 잘못 찍힌 것으로 보이는 부분도 따로 모아 확인할 수 있습니다.',
  },
  {
    number: '03',
    title: '한눈에 보는 결과',
    body: '검사한 문장 수와 의심 문장, 발견 위치를 화면에서 보고 엑셀 또는 PDF로 내려받을 수 있습니다.',
  },
];

const steps = [
  {
    label: '내려받기',
    title: '과목별 세부능력 및 특기사항 엑셀을 준비합니다',
    body: '업무 화면의 ‘과목별 세부능력 및 특기사항’ 메뉴에서 반별 엑셀 파일을 내려받아 주세요.',
  },
  {
    label: '올리기',
    title: '여러 반 파일을 한 번에 올립니다',
    body: '파일을 끌어다 놓거나 눌러 선택할 수 있습니다. xlsx, xls, csv, pdf, hwpx 형식을 지원합니다.',
  },
  {
    label: '확인하기',
    title: '분석 결과와 발견 위치를 확인합니다',
    body: '겹치는 문장과 문장 부호 의심 부분을 살펴보고, 필요한 경우 결과 파일을 내려받아 검토합니다.',
  },
];

export default function GuideHome() {
  return (
    <main className="guide-page">
      <div className="guide-orb guide-orb-a" aria-hidden="true" />
      <div className="guide-orb guide-orb-b" aria-hidden="true" />

      <header className="guide-nav">
        <a className="guide-brand" href="#top" aria-label="같은 문장 찾기 홈">
          <span className="guide-brand-mark">같</span>
          <span>같은 문장 찾기</span>
        </a>
        <nav aria-label="주요 메뉴">
          <a href="#how">사용 방법</a>
          <a href="#result">결과 안내</a>
          <a href="#faq">자주 묻는 질문</a>
        </nav>
        <a className="guide-nav-cta" href={ANALYZE_URL}>
          바로 검사하기 <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section className="guide-hero" id="top">
        <div className="guide-hero-copy">
          <div className="guide-eyebrow">
            <span className="guide-live-dot" />
            과목별 세부능력 및 특기사항 문장 점검 도구
          </div>
          <h1>
            생활기록부 문장,
            <br />
            <span>혹시 겹치지는 않았을까요?</span>
          </h1>
          <p>
            반별로 내려받은 엑셀 파일을 한 번에 올리면 같은 문장을 찾아
            <br className="desktop-break" />
            어느 학생의 어느 항목인지 보기 쉽게 알려드립니다.
          </p>
          <div className="guide-hero-actions">
            <a className="guide-primary" href={ANALYZE_URL}>
              지금 바로 검사하기 <span aria-hidden="true">→</span>
            </a>
            <a className="guide-url" href={ANALYZE_URL}>
              samesam.netlify.app/analyze <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="guide-trust-row" aria-label="서비스 특징">
            <span>✓ 여러 파일 한 번에</span>
            <span>✓ 원본 파일 수정 없음</span>
            <span>✓ 엑셀·PDF 결과 저장</span>
          </div>
        </div>

        <div className="guide-hero-visual" aria-label="분석 결과 예시">
          <div className="guide-window-bar">
            <span />
            <span />
            <span />
            <em>문장 점검 결과</em>
          </div>
          <div className="guide-summary-card">
            <div className="guide-summary-check">✓</div>
            <div>
              <small>분석을 마쳤습니다</small>
              <strong>검사 결과가 한눈에</strong>
            </div>
          </div>
          <div className="guide-stat-grid">
            <div><span>검사한 파일</span><strong>5<small>개</small></strong></div>
            <div><span>검사한 문장</span><strong>703<small>개</small></strong></div>
            <div><span>의심 문장</span><strong>0<small>개</small></strong></div>
          </div>
          <div className="guide-duplicate-card">
            <div className="guide-duplicate-top">
              <span>중복 문장</span>
              <b>발견 위치까지 표시</b>
            </div>
            <p>같은 문장을 누르면 바로 복사할 수 있어요.</p>
            <div className="guide-line"><i /><span /></div>
            <div className="guide-line short"><i /><span /></div>
          </div>
          <div className="guide-float-label">AI 문장 부호 점검</div>
        </div>
      </section>

      <section className="guide-intro" aria-labelledby="intro-title">
        <p className="guide-section-kicker">왜 만들었나요?</p>
        <div>
          <h2 id="intro-title">한 문장씩 눈으로 대조하는 일을<br />조금 더 가볍게.</h2>
          <p>
            여러 반의 기록을 마무리할 때, 비슷한 문장이 있는지 일일이 찾기는 어렵습니다.
            이 도구는 문장을 빠짐없이 읽고 서로 비교해 선생님이 확인해야 할 곳만 모아 보여드립니다.
          </p>
        </div>
      </section>

      <section className="guide-feature-grid" aria-label="주요 기능">
        {features.map((feature) => (
          <article className="guide-feature" key={feature.number}>
            <span>{feature.number}</span>
            <h3>{feature.title}</h3>
            <p>{feature.body}</p>
          </article>
        ))}
      </section>

      <section className="guide-how" id="how" aria-labelledby="how-title">
        <div className="guide-section-heading">
          <p className="guide-section-kicker">사용 방법</p>
          <h2 id="how-title">딱 세 단계면 됩니다</h2>
          <p>별도의 설치나 회원가입 없이, 내려받은 파일 그대로 시작하세요.</p>
        </div>
        <div className="guide-steps">
          {steps.map((step, index) => (
            <article className="guide-step" key={step.label}>
              <div className="guide-step-number">{index + 1}</div>
              <span>{step.label}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="guide-demo" id="result" aria-labelledby="demo-title">
        <div className="guide-demo-copy">
          <p className="guide-section-kicker">실제 사용 화면</p>
          <h2 id="demo-title">파일을 올리고,<br />결과만 확인하세요</h2>
          <p>
            테스트용 1학년 국어 과목 세특 엑셀 5개를 실제로 분석했습니다.
            원본을 바꾸지 않고 문장 수, 중복 여부, 문장 부호 의심 부분을 정리해 보여줍니다.
          </p>
          <a className="guide-text-link" href={ANALYZE_URL}>내 파일로 직접 확인하기 →</a>
        </div>
        <div className="guide-demo-gallery">
          <figure className="guide-shot guide-shot-wide">
            <img src="/guide-upload.jpg" alt="과목별 세부능력 및 특기사항 엑셀 파일 5개를 올린 화면" />
            <figcaption><b>01</b> 반별 엑셀 파일을 한 번에 선택</figcaption>
          </figure>
          <figure className="guide-shot guide-shot-progress">
            <img src="/guide-progress.jpg" alt="파일을 읽고 문장을 대조하는 분석 진행 화면" />
            <figcaption><b>02</b> 파일 읽기부터 AI 점검까지 자동 분석</figcaption>
          </figure>
          <figure className="guide-shot guide-shot-result">
            <img src="/guide-result.jpg" alt="5개 파일의 703개 문장을 분석한 결과 요약 화면" />
            <figcaption><b>03</b> 검사 수와 의심 문장을 한눈에 확인</figcaption>
          </figure>
        </div>
      </section>

      <section className="guide-result-explain" aria-labelledby="result-title">
        <div>
          <p className="guide-section-kicker">결과는 이렇게 읽어요</p>
          <h2 id="result-title">수정할 곳을 찾는 데<br />필요한 정보만</h2>
        </div>
        <div className="guide-result-list">
          <div>
            <span>같은 문장</span>
            <p>똑같은 문장과 반복 횟수, 발견된 파일과 학생 위치를 함께 표시합니다.</p>
          </div>
          <div>
            <span>문장 부호</span>
            <p>마침표 누락이나 문장 중간의 잘못된 마침표처럼 다시 볼 부분을 따로 모읍니다.</p>
          </div>
          <div>
            <span>결과 저장</span>
            <p>전체 목록이 필요하면 엑셀 또는 PDF로 내려받아 편한 방식으로 검토할 수 있습니다.</p>
          </div>
        </div>
      </section>

      <section className="guide-faq" id="faq" aria-labelledby="faq-title">
        <div className="guide-section-heading left">
          <p className="guide-section-kicker">자주 묻는 질문</p>
          <h2 id="faq-title">사용 전에 궁금한 점</h2>
        </div>
        <div className="guide-faq-list">
          <details>
            <summary>어떤 파일을 올리면 되나요?<span>＋</span></summary>
            <p>‘과목별 세부능력 및 특기사항’ 메뉴에서 내려받은 반별 엑셀 파일을 그대로 올리면 됩니다. xlsx 외에도 xls, csv, pdf, hwpx 파일을 지원합니다.</p>
          </details>
          <details>
            <summary>여러 반 파일을 같이 검사할 수 있나요?<span>＋</span></summary>
            <p>네. 여러 파일을 한 번에 선택하면 한 파일 안의 반복뿐 아니라 서로 다른 파일 사이의 같은 문장도 함께 찾습니다.</p>
          </details>
          <details>
            <summary>원본 엑셀 파일이 바뀌지는 않나요?<span>＋</span></summary>
            <p>바뀌지 않습니다. 원본은 그대로 두고, 분석 결과만 화면과 별도의 결과 파일로 제공합니다.</p>
          </details>
          <details>
            <summary>결과가 곧 오류라는 뜻인가요?<span>＋</span></summary>
            <p>아닙니다. 같은 문장이나 문장 부호 의심 부분을 검토 대상으로 보여드리는 도구입니다. 최종 판단과 수정은 문맥을 살펴본 뒤 선생님께서 해주세요.</p>
          </details>
        </div>
      </section>

      <section className="guide-final-cta">
        <div className="guide-final-icon" aria-hidden="true">문장<br />✓</div>
        <p>기록을 마무리하기 전, 한 번 더 안심할 수 있도록</p>
        <h2>지금 내 파일을 확인해 보세요.</h2>
        <a className="guide-primary dark" href={ANALYZE_URL}>
          같은 문장 찾기 시작 <span aria-hidden="true">→</span>
        </a>
        <span>samesam.netlify.app/analyze</span>
      </section>

      <footer className="guide-footer">
        <div className="guide-brand">
          <span className="guide-brand-mark">같</span>
          <span>같은 문장 찾기</span>
        </div>
        <p>과목별 세부능력 및 특기사항 문장 점검을 위한 교사용 도구</p>
        <a href={ANALYZE_URL}>서비스 열기 ↗</a>
      </footer>
    </main>
  );
}
