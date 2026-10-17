import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { slugify, shortHash } from "@/lib/seo/text";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/**
 * POST /api/upload
 *
 * Accepts a multipart file upload or a base64 data URL, normalises it to a
 * responsive-ready JPEG (max 1600px on the long edge, sRGB, quality 82) and
 * returns the public path plus intrinsic dimensions — the dimensions are what
 * let next/image reserve space and keep CLS at zero on the product page.
 */
export async function POST(request: NextRequest) {
  await ensureCatalogue();
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const contentType = request.headers.get("content-type") ?? "";

  let buffer: Buffer | null = null;
  let baseName = "upload";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "No file field named `file` was found." }, { status: 400 });
      buffer = Buffer.from(await file.arrayBuffer());
      baseName = file.name;
    } else {
      const body = (await request.json()) as { dataUrl?: string; base64?: string; name?: string };
      const raw = body.dataUrl ?? body.base64 ?? "";
      if (!raw) return NextResponse.json({ error: "Provide a multipart `file` or a JSON `dataUrl`." }, { status: 400 });
      buffer = Buffer.from(raw.replace(/^data:image\/[a-z+]+;base64,/i, ""), "base64");
      baseName = body.name ?? "upload";
    }
  } catch (error) {
    return NextResponse.json({ error: `Upload failed: ${(error as Error).message}` }, { status: 400 });
  }

  if (!buffer || !buffer.length) return NextResponse.json({ error: "Empty upload." }, { status: 400 });

  const name = `${slugify(path.basename(baseName, path.extname(baseName))).slice(0, 48) || "image"}-${shortHash(`${baseName}:${buffer.length}:${Date.now()}`, 6)}.jpg`;
  const target = path.join(UPLOAD_DIR, name);

  try {
    const image = sharp(buffer).rotate().resize({ width: 1600, height: 2000, fit: "inside", withoutEnlargement: true });
    const output = await image.jpeg({ quality: 82, mozjpeg: true, progressive: true }).toFile(target);
    return NextResponse.json(
      {
        src: `/uploads/${name}`,
        width: output.width,
        height: output.height,
        bytes: output.size,
        format: "jpeg",
        alt: "",
        note: "Add descriptive alt text — the optimizer will generate one automatically if left empty.",
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json({ error: `Image processing failed: ${(error as Error).message}` }, { status: 422 });
  }
}

export async function GET() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const files = await fs.readdir(UPLOAD_DIR);
  return NextResponse.json({
    count: files.filter((f) => f !== ".gitkeep").length,
    files: files.filter((f) => f !== ".gitkeep").map((f) => ({ src: `/uploads/${f}` })),
  });
}
