import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Dynamic import to avoid bundling issues
    const pdfParse = (await import('pdf-parse')).default;

    const pdfData = await pdfParse(buffer, {
      // Attempt to preserve layout structure
      normalizeWhitespace: false,
    });

    // Also try to extract any structured metadata from the PDF
    const metadata = {
      pages: pdfData.numpages,
      info: pdfData.info || {},
    };

    return NextResponse.json({
      text: pdfData.text,
      metadata,
      fileName: file.name,
    });
  } catch (error: unknown) {
    console.error('PDF parsing error:', error);
    const message = error instanceof Error ? error.message : 'Failed to parse PDF';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
