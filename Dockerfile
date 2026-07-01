# Dockerfile
# Stage 1: Dependencias y compilar la aplicación
FROM node:20-alpine AS builder

# better-sqlite3 requiere python, make y g++ para compilar nativamente
# git + openssh-client: resolver dependencias privadas (@ai4u/*) por git+ssh durante npm ci
RUN apk add --no-cache python3 make g++ libc6-compat git openssh-client

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json* ./

# Instalar dependencias. Se reenvia el ssh-agent del host (--mount=type=ssh) solo
# durante este RUN para clonar los repos privados @ai4u/*; la llave NO queda en la imagen.
# --mount=type=cache evita que el cache npm ocupe espacio del overlay filesystem del builder.
# Requiere construir con: docker compose build --ssh default  (el compose ya lo declara).
RUN --mount=type=ssh --mount=type=cache,target=/root/.npm \
    mkdir -p -m 0700 ~/.ssh && \
    ssh-keyscan -t ed25519,rsa github.com >> ~/.ssh/known_hosts 2>/dev/null && \
    npm ci

# Copiar resto del código fuente del proyecto
COPY . .

# Deshabilitar telemetría de Next.js durante build
ENV NEXT_TELEMETRY_DISABLED=1

# Compilar Next.js (esto generará .next/standalone si lo configuramos en next.config.ts)
# --mount=type=tmpfs evita que el cache de Next.js ocupe espacio del overlay durante el build
RUN --mount=type=tmpfs,target=/app/.next/cache npm run build

# Stage 2: Imagen de producción mínima
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Usaremos NEXT_STANDALONE para iniciar usando el servidor nativo
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Instalar posibles dependencias de runtime nativas requeridas
# poppler-utils: pdftoppm convierte páginas PDF a PNG para análisis visual con Claude
# font-liberation + ttf-dejavu: fuentes Helvetica-compatibles requeridas para renderizar PDFs
RUN apk add --no-cache libc6-compat poppler-utils font-liberation ttf-dejavu fontconfig \
    && fc-cache -f

# Copiar carpeta public (Next.js requiere esto)
COPY --from=builder /app/public ./public

# Crear directorios y transferir ownership al usuario node (UID 1000)
RUN mkdir -p .next .data && chown -R node:node /app

# Las apps 'standalone' agrupan los node_modules necesarios.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3000

CMD ["node", "server.js"]
