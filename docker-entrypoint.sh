#!/bin/sh
set -e

# Verifica se a variável DATABASE_URL existe
if [ -z "$DATABASE_URL" ]; then
  echo "❌ Erro: DATABASE_URL não definida."
  exit 1
fi

echo "🔄 Rodando Prisma Migrations..."
# Roda as migrações de produção (não cria arquivos, só aplica no banco)
npx prisma migrate deploy

echo "✅ Migrations aplicadas com sucesso."

echo "🚀 Iniciando servidor Next.js..."
# Executa o comando original do container
exec node server.js