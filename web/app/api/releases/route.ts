import { NextResponse } from "next/server";
import { getAllReleases } from "@/lib/github";

export const revalidate = 300;

export async function GET() {
  const releases = await getAllReleases();
  return NextResponse.json({ releases });
}
