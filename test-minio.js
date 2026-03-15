const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: '.env' });

async function testMinio() {
    console.log('🧪 Iniciando teste de conexão com MinIO...');
    console.log(`Endpoint configurado: ${process.env.MINIO_ENDPOINT}`);
    console.log(`Bucket configurado: ${process.env.MINIO_BUCKET_NAME}`);

    const s3Client = new S3Client({
        region: process.env.MINIO_REGION || 'us-east-1',
        endpoint: process.env.MINIO_ENDPOINT,
        credentials: {
            accessKeyId: process.env.MINIO_ACCESS_KEY || '',
            secretAccessKey: process.env.MINIO_SECRET_KEY || '',
        },
        forcePathStyle: true,
    });

    try {
        const testContent = 'Este é um arquivo de teste gerado pelo SaaS Wrapper para validar a conexão S3/MinIO.';
        const buffer = Buffer.from(testContent, 'utf-8');
        const fileName = `teste-conexao-${Date.now()}.txt`;

        const command = new PutObjectCommand({
            Bucket: process.env.MINIO_BUCKET_NAME,
            Key: fileName,
            Body: buffer,
            ContentType: 'text/plain',
        });

        console.log(`Enviando arquivo: ${fileName}...`);
        await s3Client.send(command);

        const publicUrlBase = process.env.MINIO_PUBLIC_URL || process.env.MINIO_ENDPOINT;
        const finalUrl = `${publicUrlBase}/${process.env.MINIO_BUCKET_NAME}/${fileName}`;

        console.log('✅ SUCESSO! A conexão com o MinIO está funcionando perfeitamente.');
        console.log(`🔗 O arquivo de teste foi salvo em: ${finalUrl}`);

    } catch (error) {
        console.error('❌ ERRO AO CONECTAR COM MINIO:');
        console.error(error.message);
        if (error.Code) console.error(`Código de erro S3: ${error.Code}`);
    }
}

testMinio();
