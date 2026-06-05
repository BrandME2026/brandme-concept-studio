import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Display sans — sustituto open-source de "The Future" (DESIGN.md together.ai).
const inter = Inter({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Mono en mayúsculas — sustituto de "PP Neue Montreal Mono" para eyebrows y labels.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "BrandMe Concept — propón un diseño desde cualquier URL",
  description:
    "Pega una URL, extrae su diseño y genera una propuesta inspirada: DESIGN.md + preview en vivo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-ink font-display">
        {children}
      </body>
    </html>
  );
}
