import "./globals.css";

import type { ReactNode } from "react";

export const metadata = {
  title: "Life Book Studio",
  description: "Complete life storybook generation and daily publishing workspace",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: "Inter, Arial, sans-serif", background: "#0b1020", color: "#f5f7fb" }}>
        {children}
      </body>
    </html>
  );
}
