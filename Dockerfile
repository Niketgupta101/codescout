# syntax=docker/dockerfile:1.10.0

ARG NODE_VERSION=20-alpine

# Build stage
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

# Set higher memory limit for TypeScript compilation
ENV NODE_OPTIONS="--max-old-space-size=8192"

# Install dependencies needed for building
COPY --link package.json yarn.lock ./
RUN yarn install --frozen-lockfile --check-files

# Copy source and build
COPY --link . .
RUN npx prisma generate
RUN yarn build

# Production stage
FROM node:${NODE_VERSION} AS runtime

WORKDIR /app

# Set higher memory limit for build
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Copy only what's needed for production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --link package.json prisma/schema.prisma ./

# Expose port
EXPOSE 4000
ENV PORT=4000
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Run migrations then start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]