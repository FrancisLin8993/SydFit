# Stage 1: build — needs typescript (a dev dependency) and the full src/ tree
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json .
COPY src/ ./src/
RUN npm run build

# Stage 2: runtime — only prod deps + compiled output, no TypeScript toolchain
FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

EXPOSE 8080
CMD ["node", "dist/index.js"]