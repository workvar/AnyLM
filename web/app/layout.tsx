import type { Metadata } from "next";
import { Space_Grotesk, Manrope } from "next/font/google";
import "./globals.css";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import Analytics from "@/components/site/Analytics";
import AppAnalytics from "@/components/site/AppAnalytics";
import { getVerification, resolveMetadataBase } from "@/lib/seo";
import {
  DESCRIPTION,
  PRODUCT_NAME,
  SITE_URL,
  TAGLINE,
} from "@/lib/config";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const metadataBase = await resolveMetadataBase();
  const titleDefault = TAGLINE;

  return {
    metadataBase,
    title: {
      default: titleDefault,
      template: `%s · ${PRODUCT_NAME}`,
    },
    description: DESCRIPTION,
    applicationName: PRODUCT_NAME,
    keywords: [
      "AnyLM",
      "local LLM",
      "Ollama",
      "RAG",
      "OpenAI compatible",
      "desktop AI",
      "privacy",
      "multi agent",
      "model router",
    ],
    authors: [{ name: "Yash Aryan" }],
    creator: "Yash Aryan",
    openGraph: {
      type: "website",
      url: metadataBase,
      siteName: PRODUCT_NAME,
      title: titleDefault,
      description: DESCRIPTION,
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: `${PRODUCT_NAME} — one endpoint for every local model`,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: titleDefault,
      description: DESCRIPTION,
      images: ["/og.png"],
    },
    icons: {
      icon: [
        { url: "/favicon.ico" },
        { url: "/favicon.png", sizes: "32x32", type: "image/png" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    },
    manifest: "/site.webmanifest",
    alternates: {
      // Prefer configured brand/canonical host when set; else request origin.
      canonical: SITE_URL || metadataBase.origin,
    },
    verification: getVerification(),
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="grain min-h-dvh antialiased">
        <Analytics />
        <AppAnalytics />
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
