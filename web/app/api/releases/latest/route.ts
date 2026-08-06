import { NextResponse } from "next/server";
import { getLatestRelease } from "@/lib/github";

export const revalidate = 300;

export async function GET() {
  const release = await getLatestRelease();
  if (!release) {
    return NextResponse.json({ error: "No published release yet." }, { status: 404 });
  }
  return NextResponse.json({ release });
}
