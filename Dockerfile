# ETAPA 1: Base
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# ETAPA 2: Dependências
FROM base AS deps
COPY package.json package-lock.json* ./
# Instala todas as dependências (incluindo devDependencies para ter o CLI do Prisma)
RUN npm ci

# ETAPA 3: Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Gera o cliente do Prisma
RUN npx prisma generate

# Faz o build do Next.js
RUN npm run build

# ETAPA 4: Runner (Imagem final de produção)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

# Cria usuário seguro
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# ========================================================
# MUDANÇAS IMPORTANTES AQUI
# ========================================================

# 1. Copia a pasta public
COPY --from=builder /app/public ./public

# 1.1 Copia a pasta src (Necessário para o worker)
COPY --from=builder /app/src ./src

# 2. Copia a pasta prisma (Necessário para rodar migrations)
COPY --from=builder /app/prisma ./prisma
COPY prisma.config.ts ./

# Instala prisma CLI e tsx para rodar migrations em produção
RUN npm install prisma@7.4.0 @prisma/client@7.4.0 @prisma/adapter-pg@7.4.0 pg tsx dotenv --no-save

# 3. Copia o build otimizado
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 4. Copia o script de Entrypoint e dá permissão de execução
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Muda para o usuário seguro
USER nextjs

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Usa o script como ponto de entrada
ENTRYPOINT ["./docker-entrypoint.sh"]
