import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YieldGuard — Analyst Console",
  description: "AI-powered wafer yield root-cause analysis for semiconductor fabs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-ink text-text antialiased">
        {children}
      </body>
    </html>
  );
}
