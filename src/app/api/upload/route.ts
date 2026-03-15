import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.MINIO_REGION || "us-east-1",
  endpoint: process.env.MINIO_ENDPOINT,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || "",
    secretAccessKey: process.env.MINIO_SECRET_KEY || "",
  },
  forcePathStyle: true, // Necessário para MinIO e similares
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }

    const bucketName = process.env.MINIO_BUCKET_NAME || "chatwoot-wrapper";
    // Tenta usar MINIO_PUBLIC_URL para a URL final (útil se o MinIO expõe via proxy) ou fallback pro ENDPOINT
    const publicUrlBase = process.env.MINIO_PUBLIC_URL || process.env.MINIO_ENDPOINT;

    const uploadedUrls: string[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      
      const fileExt = file.name.split('.').pop() || '';
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
      
      const finalFileName = `${uniqueId}-${safeName}`;

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: finalFileName,
        Body: buffer,
        ContentType: file.type,
      });

      await s3Client.send(command);

      // Constrói a URL pública final
      const fileUrl = `${publicUrlBase}/${bucketName}/${finalFileName}`;
      uploadedUrls.push(fileUrl);
    }

    return NextResponse.json({ success: true, urls: uploadedUrls });
  } catch (error: any) {
    console.error("Erro no upload MinIO:", error);
    return NextResponse.json({ error: error.message || "Falha no upload" }, { status: 500 });
  }
}
