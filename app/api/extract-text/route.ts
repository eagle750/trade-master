import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Max file size: 10 MB */
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 413 });
    }

    const name = file.name.toLowerCase();
    const buf  = Buffer.from(await file.arrayBuffer());
    let text   = '';

    if (name.endsWith('.pdf')) {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
      const result   = await pdfParse(buf);
      text           = result.text;

    } else if (name.endsWith('.docx')) {
      const mammoth = require('mammoth') as {
        extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
      };
      const result = await mammoth.extractRawText({ buffer: buf });
      text         = result.value;

    } else if (name.endsWith('.txt')) {
      text = buf.toString('utf-8');

    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Upload a PDF, DOCX, or TXT file.' },
        { status: 415 }
      );
    }

    /* Clean up extracted text: collapse whitespace, trim */
    const cleaned = text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
      .slice(0, 5000); /* soft cap — same as textarea */

    if (!cleaned) {
      return NextResponse.json({ error: 'No readable text found in the file.' }, { status: 422 });
    }

    return NextResponse.json({ text: cleaned, charCount: cleaned.length });

  } catch (err) {
    return NextResponse.json(
      { error: 'Text extraction failed', detail: String(err) },
      { status: 500 }
    );
  }
}
