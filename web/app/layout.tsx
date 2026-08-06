import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import { PRODUCT_NAME, TAGLINE } from "@/lib/config";

export const metadata: Metadata = {
  title: {
    default: `${PRODUCT_NAME} — ${TAGLINE}`,
    template: `%s · ${PRODUCT_NAME}`,
  },
  description:
    "AnyLM is a background router for local LLMs. It pools every model already installed on your machine behind one OpenAI-compatible endpoint, so no app ever loads the same weights twice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="grain min-h-screen antialiased">
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
