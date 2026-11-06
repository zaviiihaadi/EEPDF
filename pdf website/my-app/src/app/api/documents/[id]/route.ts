import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const STORAGE_DIR = path.join(process.cwd(), ".data", "uploads");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  try {
    const metadata = await readFile(path.join(STORAGE_DIR, `${id}.json`), "utf8");
    return NextResponse.json(JSON.parse(metadata), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
}
