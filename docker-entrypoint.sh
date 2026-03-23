#!/bin/sh
set -e

# Verifica se a variável DATABASE_URL existe
if [ -z "$DATABASE_URL" ]; then
  echo "❌ Erro: DATABASE_URL não definida."
  exit 1
fi

echo "🔄 Sincronizando schema do banco (prisma db push)..."

npx prisma db push --accept-data-loss

echo "✅ Schema sincronizado com sucesso."

# Start Worker in Background
echo "🚀 Starting Background Worker..."
# Use /tmp for logs as we are running as non-root (nextjs user)
nohup npx tsx src/worker.ts > /tmp/worker.log 2>&1 &

echo "🚀 Iniciando servidor Next.js..."
exec node server.js