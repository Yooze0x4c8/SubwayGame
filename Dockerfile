# ---- build stage ----
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/
RUN npm ci

COPY . .
# tsc -b builds shared + server
RUN npm run build
# vite build for the React client
RUN npm run build --workspace=packages/client

# ---- runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/
RUN npm ci --omit=dev

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/dist  ./packages/server/dist
COPY --from=builder /app/packages/client/dist  ./packages/client/dist
COPY --from=builder /app/data                  ./data

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "packages/server/dist/index.js"]
