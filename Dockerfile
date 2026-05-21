# ==========================================
# STAGE 1: BUILD & INSTALL DEPENDENCIES
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy dependency definitions
COPY package*.json ./

# Install all dependencies (including devDependencies for testing/builds)
RUN npm ci

# Copy application source code
COPY . .

# ==========================================
# STAGE 2: PRODUCTION RUNTIME
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Copy package definitions
COPY package*.json ./

# Install production-only dependencies
RUN npm ci --only=production

# Copy built artifacts/source files from Stage 1
COPY --from=builder /usr/src/app/config ./config
COPY --from=builder /usr/src/app/controllers ./controllers
COPY --from=builder /usr/src/app/engine ./engine
COPY --from=builder /usr/src/app/middleware ./middleware
COPY --from=builder /usr/src/app/models ./models
COPY --from=builder /usr/src/app/routes ./routes
COPY --from=builder /usr/src/app/scripts ./scripts
COPY --from=builder /usr/src/app/utils ./utils
COPY --from=builder /usr/src/app/server.js ./server.js
COPY --from=builder /usr/src/app/swagger_output.json ./swagger_output.json

# Use standard non-root user provided by node image for security compliance
USER node

# Expose default backend port
EXPOSE 5000

# Start production server
CMD ["node", "server.js"]
