import JsonLd from "@/components/site/JsonLd";
import Hero from "@/components/home/Hero";
import AppShowcase from "@/components/home/AppShowcase";
import Insights from "@/components/home/Insights";
import ActivityStrip from "@/components/home/ActivityStrip";
import Comparison from "@/components/home/Comparison";
import EnhanceModels from "@/components/home/EnhanceModels";
import Capabilities from "@/components/home/Capabilities";
import Features from "@/components/home/Features";
import CodeSample from "@/components/home/CodeSample";
import { getLatestRelease } from "@/lib/github";

export const revalidate = 300;

export default async function HomePage() {
  const release = await getLatestRelease();

  return (
    <>
      <JsonLd />
      <Hero release={release} />
      <AppShowcase />
      <Insights />
      <ActivityStrip />
      <Comparison />
      <EnhanceModels />
      <Capabilities />
      <Features />
      <CodeSample />
    </>
  );
}
