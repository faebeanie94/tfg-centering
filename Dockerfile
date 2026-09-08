# Build frontend
FROM node:20-alpine AS frontend-build

WORKDIR /build

COPY package*.json ./
RUN npm ci

COPY src ./src
COPY public ./public
COPY tsconfig.json vite.config.ts index.html ./

RUN npm run build

# Build final image
FROM node:20-alpine

WORKDIR /app

# Copy server files
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci --only=production

# Copy server source
COPY server/src ./src
COPY server/middleware ./middleware
COPY server/services ./services
COPY server/api ./api

# Copy .env if it exists (optional for secrets)
COPY server/.env* ./

# Copy built frontend from build stage
COPY --from=frontend-build /build/dist ./dist

WORKDIR /app

EXPOSE 3001

CMD ["node", "server/src/server.js"]
