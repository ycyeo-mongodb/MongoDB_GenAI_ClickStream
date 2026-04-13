import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeafyTelco — Clickstream & GenAI Workshop",
  description:
    "LeafyTelco: Real-time clickstream analytics and personalization powered by MongoDB Atlas, Vector Search, and Agentic AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
