FROM node:20-alpine AS frontend-build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

# Copy backend dependencies
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY server/src ./src
COPY server/db ./db

# Copy built frontend from previous stage
COPY --from=frontend-build /app/dist ./dist

# Copy environment setup
COPY server/.env.example ./
RUN if [ ! -f .env ]; then cp .env.example .env; fi

EXPOSE 8080

# Create entrypoint script that writes GCP key from env var to file
RUN echo '#!/bin/sh\n\
if [ -n "$GCP_KEY_FILE" ]; then\n\
  echo "$GCP_KEY_FILE" > /app/gcs-key.json\n\
  export GCP_KEY_FILE=/app/gcs-key.json\n\
fi\n\
exec node src/server.js' > /entrypoint.sh && chmod +x /entrypoint.sh

# Start backend server (which will serve frontend)
CMD ["/entrypoint.sh"]
