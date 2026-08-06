import Hero from "@/components/home/Hero";
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
      <Hero release={release} />
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
