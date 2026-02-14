#!/bin/sh
set -e

# Verifica se a variável DATABASE_URL existe
if [ -z "$DATABASE_URL" ]; then
  echo "❌ Erro: DATABASE_URL não definida."
  exit 1
fi

echo "🔄 Rodando Prisma Migrations (Usando binário local)..."

# MUDANÇA AQUI: Usamos o caminho direto em vez de npx
./node_modules/.bin/prisma migrate deploy

echo "✅ Migrations aplicadas com sucesso."

echo "🚀 Iniciando servidor Next.js..."
exec node server.js