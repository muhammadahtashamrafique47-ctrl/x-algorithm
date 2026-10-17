import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { slugify, shortHash } from "@/lib/seo/text";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Media storage.
 *
 * Serverless platforms (Vercel, Netlify, Cloudflare) mount the deployment
 * **read-only**, so `public/uploads` cannot be written there. Hosts with a disk
 * or volume mount it at this path; `UPLOAD_URL_PREFIX` is the public path media
 * is served from, which is what external storage (S3, Cloudinary, UploadThing)
 * needs. When nothing is writable the endpoint answers 503 with an actionable
 * message instead of throwing a 500 — see DEPLOYMENT.md.
 */
// Statically resolvable on purpose: an env-derived path here makes Turbopack
// trace the whole project into the server bundle. Hosts with a persistent disk
// mount it at this path (the Dockerfile symlinks both to /data) — see
// DEPLOYMENT.md. UPLOAD_URL_PREFIX stays configurable because it is a public
// URL, not a filesystem path, and is what external media storage needs.
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const UPLOAD_URL_PREFIX = (process.env.UPLOAD_URL_PREFIX?.trim() || "/uploads").replace(/\/$/, "");

/**
 * Writability is discovered from the real upload, never from a probe file: a
 * dynamic probe makes Turbopack trace the whole project, and `mkdir` succeeds on
 * an existing directory even when the mount is read-only, so it proves nothing.
 * `null` means no upload has been attempted yet on this instance.
 */
let knownWritable: boolean | null = null;

const READ_ONLY_CODES = new Set(["EROFS", "EACCES", "EPERM", "ENOTSUP"]);

const isReadOnlyError = (error: unknown) =>
  READ_ONLY_CODES.has((error as NodeJS.ErrnoException)?.code ?? "");

const readOnlyStorageResponse = () =>
  NextResponse.json(
    {
      error: "Media storage is read-only on this host.",
      detail:
        "Serverless platforms mount the deployment read-only, so uploaded images cannot be saved. " +
        "Mount a volume or persistent disk at public/uploads (Render, Fly.io, Railway, a VPS), or store " +
        "media externally (S3, Cloudinary, UploadThing) and set UPLOAD_URL_PREFIX to its public path.",
      dir: UPLOAD_DIR,
      docs: "/DEPLOYMENT.md",
    },
    { status: 503 },
  );

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
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error) {
    if (isReadOnlyError(error)) {
      knownWritable = false;
      return readOnlyStorageResponse();
    }
  }
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
    knownWritable = true;
    return NextResponse.json(
      {
        src: `${UPLOAD_URL_PREFIX}/${name}`,
        width: output.width,
        height: output.height,
        bytes: output.size,
        format: "jpeg",
        alt: "",
        note: "Add descriptive alt text — the optimizer will generate one automatically if left empty.",
        storage: UPLOAD_DIR,
      },
      { status: 201 },
    );
  } catch (error) {
    // A read-only mount only reveals itself when the real file is written.
    if (isReadOnlyError(error)) {
      knownWritable = false;
      return readOnlyStorageResponse();
    }
    return NextResponse.json({ error: `Image processing failed: ${(error as Error).message}` }, { status: 422 });
  }
}

export async function GET() {
  let files: string[] = [];
  try {
    files = await fs.readdir(UPLOAD_DIR);
  } catch {
    /* no media directory on this instance */
  }
  const named = files.filter((f) => f !== ".gitkeep");
  return NextResponse.json({
    count: named.length,
    files: named.map((f) => ({ src: `${UPLOAD_URL_PREFIX}/${f}` })),
    dir: UPLOAD_DIR,
    // null until an upload has actually been attempted on this instance.
    writable: knownWritable,
  });
}
