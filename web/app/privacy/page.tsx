import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/config";

export const metadata: Metadata = {
  title: "Privacy",
  description: `How ${PRODUCT_NAME} handles account data and local inference.`,
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 pb-24 pt-32">
      <p className="text-sm text-[var(--color-slime)]">Legal</p>
      <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-4 text-[var(--color-mist)]">
        Last updated: 8 August 2026. {PRODUCT_NAME} is built local-first. This page explains what
        stays on your machine and what account services touch.
      </p>

      <section className="mt-12 space-y-4">
        <h2 className="font-display text-xl font-semibold">Inference stays local</h2>
        <p className="leading-relaxed text-[var(--color-mist)]">
          Chat and embeddings run through models you host with Ollama (or other local backends the
          app is configured to use). Prompt text and retrieved document chunks used for generation
          are not sent to {PRODUCT_NAME} cloud inference — there is no hosted model API in the
          product path.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="font-display text-xl font-semibold">What lives on your device</h2>
        <p className="leading-relaxed text-[var(--color-mist)]">
          Projects, threads, messages, attached references, embeddings, generated artifacts, and
          settings are stored in the app&apos;s local data directory on your computer. Uninstalling
          the app or clearing that directory removes them.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="font-display text-xl font-semibold">Accounts and cloud services</h2>
        <p className="leading-relaxed text-[var(--color-mist)]">
          Sign-in (email/password, Google, GitHub) uses Firebase Authentication. Organisation
          membership, policy, and cooperative usage records may be stored in Firebase Firestore so
          limits and roles can sync across devices for the signed-in account. Firebase processes
          that account data under Google&apos;s terms for the project that hosts {PRODUCT_NAME}.
        </p>
        <p className="leading-relaxed text-[var(--color-mist)]">
          Session tokens on the device are kept in the OS keystore when available (Keychain / DPAPI
          / libsecret), with a restricted file fallback only where no keyring exists.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="font-display text-xl font-semibold">Website and downloads</h2>
        <p className="leading-relaxed text-[var(--color-mist)]">
          The marketing site at anylm.app serves product pages and resolves download links from
          public GitHub Releases. Standard web server and CDN logs may include IP address, user
          agent, and requested URLs. We do not use the site to run third-party advertising pixels.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="font-display text-xl font-semibold">Updates</h2>
        <p className="leading-relaxed text-[var(--color-mist)]">
          When auto-update is enabled, the desktop app checks GitHub Releases for new installers.
          That check reveals that a machine requested update metadata; it does not upload chat
          content.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="font-display text-xl font-semibold">Contact</h2>
        <p className="leading-relaxed text-[var(--color-mist)]">
          Privacy or security questions:{" "}
          <a className="text-white underline-offset-4 hover:underline" href="mailto:yasharyan307@outlook.com">
            yasharyan307@outlook.com
          </a>
          . Security reports should follow{" "}
          <a
            className="text-white underline-offset-4 hover:underline"
            href="https://github.com/workvar/AnyLM/blob/main/SECURITY.md"
            target="_blank"
            rel="noreferrer"
          >
            SECURITY.md
          </a>
          .
        </p>
      </section>
    </article>
  );
}
