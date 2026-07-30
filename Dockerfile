# --- Build Stage ---
FROM node:20-alpine AS builder
WORKDIR /app
# ติดตั้ง pnpm
RUN npm i -g pnpm
COPY package.json pnpm-lock.yaml ./
# Alpine ใช้ musl — ไม่ดาวน์โหลด bundled Chrome ตอน build
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build \
    && mkdir -p dist/scripts \
    && pnpm exec tsc scripts/purge-old-logs.ts \
    --outDir dist/scripts \
    --rootDir scripts \
    --module commonjs \
    --moduleResolution node \
    --esModuleInterop \
    --target ES2023 \
    --skipLibCheck \
    --declaration false \
    --sourceMap false

# --- Production Stage ---
FROM node:20-alpine AS runner
WORKDIR /app

# Chromium สำหรับ Puppeteer PDF (ใบเสร็จ / รายงาน) + timezone ไทย
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    tzdata

ENV TZ=Asia/Bangkok \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN npm i -g pnpm
COPY package.json pnpm-lock.yaml ./
# ลงเฉพาะ production dependencies เพื่อให้ตู้เบาที่สุด
RUN pnpm install --prod --frozen-lockfile
COPY --from=builder /app/dist ./dist

EXPOSE 3001
# รันด้วย node ตรงๆ ดึง Logs ออกมาหา Coolify UI ได้ 100%
CMD ["node", "dist/src/main.js"]
