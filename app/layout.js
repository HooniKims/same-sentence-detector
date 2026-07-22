import './globals.css';

export const metadata = {
  title: '무엇이 무엇이 똑같을까',
  description: '여러 문서를 한 번에 올려 완전히 동일한 문장을 찾아내는 서비스',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
