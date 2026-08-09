import { buildSoftwareJsonLd } from "@/lib/seo";

export default function JsonLd() {
  const data = buildSoftwareJsonLd();
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
