# Dockerfile
FROM node:22-alpine

# Create non-root user for security
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

ENV NODE_ENV=production

# Render sets PORT at runtime; server.js uses process.env.PORT
# EXPOSE is documentation-only for Render, but helps locally
EXPOSE 10000

# Drop privileges
USER app

CMD ["node", "server.js"]
