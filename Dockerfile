FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM deps AS builder
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/data ./data

EXPOSE 3000
CMD ["npm", "start"]
