import { after, NextResponse } from "next/server";
import { documentExists, readOcrStatus, runAdobeOcr } from "@/lib/adobe-ocr";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id) || !(await documentExists(id))) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  return NextResponse.json(await readOcrStatus(id), { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id) || !(await documentExists(id))) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const status = await readOcrStatus(id);
  if (status.status === "completed") return NextResponse.json(status, { status: 200, headers: { "Cache-Control": "private, no-store" } });
  after(() => runAdobeOcr(id));
  return NextResponse.json({ status: "processing", startedAt: new Date().toISOString() }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
}
