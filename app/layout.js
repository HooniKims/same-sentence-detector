import './globals.css';

export const metadata = {
  metadataBase: new URL('https://samesam.netlify.app'),
  title: '같은 문장 찾기 | 생활기록부 중복 문장 점검',
  description: '과목별 세부능력 및 특기사항 엑셀 파일을 올리면 같은 문장과 문장 부호 의심 부분을 찾아주는 교사용 점검 도구입니다.',
  openGraph: {
    title: '생활기록부 문장, 혹시 겹치지는 않았을까요?',
    description: '반별 과목 세특 엑셀 파일을 한 번에 올리고 같은 문장과 발견 위치를 확인하세요.',
    type: 'website',
    locale: 'ko_KR',
    images: [
      {
        url: '/og.png',
        width: 1731,
        height: 909,
        alt: '생활기록부 중복 문장 점검 서비스 같은 문장 찾기',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '생활기록부 문장, 혹시 겹치지는 않았을까요?',
    description: '반별 과목 세특 엑셀 파일을 한 번에 올리고 같은 문장과 발견 위치를 확인하세요.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
