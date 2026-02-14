#!/bin/sh
set -e

# Verifica se a variável DATABASE_URL existe
if [ -z "$DATABASE_URL" ]; then
  echo "❌ Erro: DATABASE_URL não definida."
  exit 1
fi

echo "🔄 Rodando Prisma Migrations (Usando binário local)..."

# MUDANÇA AQUI: Usamos npx para garantir que o prisma carregue o config.ts via tsx/jiti
npx prisma migrate deploy

echo "✅ Migrations aplicadas com sucesso."

# Start Worker in Background
echo "🚀 Starting Background Worker..."
# Use /tmp for logs as we are running as non-root (nextjs user)
nohup npx tsx src/worker.ts > /tmp/worker.log 2>&1 &

echo "🚀 Iniciando servidor Next.js..."
exec node server.js