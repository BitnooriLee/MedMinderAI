import { NextResponse } from "next/server";

import { MAX_PRESCRIPTION_IMAGE_BYTES } from "@/lib/server/prescription-upload-limit";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/octet-stream",
]);

/**
 * Secured multipart probe: validates request reaches the function and size rules match production analyze.
 * Disabled unless `SMOKE_TEST_SECRET` is set (Vercel env for CI / manual smoke only).
 */
export async function POST(request: Request) {
  const secret = process.env.SMOKE_TEST_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, code: "DISABLED" }, { status: 404 });
  }

  const auth = request.headers.get("authorization")?.trim() ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "BODY_PARSE_FAILED",
        message: "Could not parse multipart body (hosting body limit or truncated request).",
        maxBytes: MAX_PRESCRIPTION_IMAGE_BYTES,
      },
      { status: 413 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, code: "INVALID_INPUT", message: "Expected form field `file`." },
      { status: 400 }
    );
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_INPUT",
        message: "Unsupported type for smoke probe.",
        receivedType: file.type,
      },
      { status: 400 }
    );
  }

  const receivedBytes = file.size;
  const withinLimit =
    receivedBytes > 0 && receivedBytes <= MAX_PRESCRIPTION_IMAGE_BYTES;

  return NextResponse.json({
    ok: true,
    receivedBytes,
    maxBytes: MAX_PRESCRIPTION_IMAGE_BYTES,
    withinLimit,
    rejectedAsTooLarge: !withinLimit,
  });
}
