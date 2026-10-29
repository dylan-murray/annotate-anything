import Link from "next/link";
import { Annotate } from "annotate-anything/next/client";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, font: "16px/1.5 system-ui, sans-serif" }}>
        <header style={{ display: "flex", gap: 16, padding: "12px 16px", borderBottom: "1px solid #ddd" }}>
          <strong>Next fixture</strong>
          <Link href="/">Home</Link>
          <Link href="/about">About</Link>
        </header>
        <main style={{ padding: "24px 16px" }}>{children}</main>
        <Annotate scope="next" />
      </body>
    </html>
  );
}
