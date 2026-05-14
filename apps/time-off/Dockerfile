FROM node:20-alpine AS builder
WORKDIR /app
# Build tools needed for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN mkdir -p data logs
# Runtime native libs for better-sqlite3
RUN apk add --no-cache libstdc++
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/src/main"]
