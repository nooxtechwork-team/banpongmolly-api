# --- Build Stage ---
FROM node:20-alpine AS builder
WORKDIR /app
# ติดตั้ง pnpm
RUN npm i -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# --- Production Stage ---
FROM node:20-alpine AS runner
WORKDIR /app
RUN npm i -g pnpm
COPY package.json pnpm-lock.yaml ./
# ลงเฉพาะ production dependencies เพื่อให้ตู้เบาที่สุด
RUN pnpm install --prod --frozen-lockfile
COPY --from=builder /app/dist ./dist

EXPOSE 3001
# รันด้วย node ตรงๆ ดึง Logs ออกมาหา Coolify UI ได้ 100%
CMD ["node", "dist/main.js"]