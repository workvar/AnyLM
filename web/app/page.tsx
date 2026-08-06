import Hero from "@/components/home/Hero";
import MonsterScroll from "@/components/home/MonsterScroll";
import Features from "@/components/home/Features";
import CodeSample from "@/components/home/CodeSample";
import { getLatestRelease } from "@/lib/github";

export const revalidate = 300;

export default async function HomePage() {
  const release = await getLatestRelease();

  return (
    <>
      <Hero release={release} />
      <MonsterScroll />
      <Features />
      <CodeSample />
    </>
  );
}
