# --- Build Stage ---
    FROM node:20-alpine AS builder
    WORKDIR /app
    
    # ติดตั้ง pnpm
    RUN npm i -g pnpm
    
    # คัดลอกไฟล์จัดการ Dependencies
    COPY package.json pnpm-lock.yaml ./
    
    # ติดตั้ง dependencies ทั้งหมดรวมถึง devDependencies เพื่อใช้ในการบิลด์
    RUN pnpm install --frozen-lockfile
    
    # คัดลอกโค้ดทั้งหมดและทำการบิลด์
    COPY . .
    RUN pnpm build
    
    # เคลียร์ devDependencies ออก ให้เหลือเฉพาะ production dependencies ในโฟลเดอร์ node_modules
    # ท่านี้ช่วยให้ไม่ต้องรัน install ซ้ำใน stage ถัดไป และประหยัดเวลามาก
    RUN pnpm prune --prod
    
    # --- Production Stage ---
    FROM node:20-alpine AS runner
    WORKDIR /app
    
    # กำหนดเป็น production environment
    ENV NODE_ENV=production
    
    # ไม่จำเป็นต้องติดตั้ง pnpm ในตู้ runner แล้ว เพราะเราจะรันด้วย node ตรงๆ
    # คัดลอก package.json, node_modules (ที่ถูก prune แล้ว) และ dist มาจากตู้ builder
    COPY package.json ./
    COPY --from=builder /app/node_modules ./node_modules
    COPY --from=builder /app/dist ./dist
    
    # ถ้าในโปรเจกต์มีพวก Prisma ORM ให้เปิด COPY บรรทัดข้างล่างนี้ด้วยครับ (ถ้าไม่มีให้ลบออกได้)
    # COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
    
    EXPOSE 3001
    
    # รันแอปพลิเคชัน
    CMD ["node", "dist/main.js"]