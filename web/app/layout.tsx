import type { Metadata } from "next";
import { Space_Grotesk, Manrope } from "next/font/google";
import "./globals.css";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import Analytics from "@/components/site/Analytics";
import {
  SITE_URL,
  DEFAULT_DESCRIPTION,
  DEFAULT_KEYWORDS,
  getVerification,
} from "@/lib/seo";
import { PRODUCT_NAME, TAGLINE } from "@/lib/config";

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

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${PRODUCT_NAME} — ${TAGLINE}`,
    template: `%s · ${PRODUCT_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  keywords: DEFAULT_KEYWORDS,
  applicationName: PRODUCT_NAME,
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: PRODUCT_NAME,
    title: `${PRODUCT_NAME} — ${TAGLINE}`,
    description: DEFAULT_DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: PRODUCT_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${PRODUCT_NAME} — ${TAGLINE}`,
    description: DEFAULT_DESCRIPTION,
    images: ["/og.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  verification: getVerification(),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="grain min-h-dvh antialiased">
        <Analytics />
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
