# Stage 1: Build backend TypeScript
FROM node:20-slim AS backend-build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY shared/ ./shared/
COPY scheduler/ ./scheduler/
COPY cost-control/ ./cost-control/
COPY services/ ./services/
COPY src/ ./src/

RUN npx tsc

# Stage 2: Build Next.js web UI
FROM node:20-slim AS webui-build

WORKDIR /app/web-ui
COPY web-ui/package.json web-ui/package-lock.json ./
RUN npm ci

COPY web-ui/ ./

ARG BUILD_TAG=dev
ENV NEXT_PUBLIC_BUILD_TAG=$BUILD_TAG

# Empty string means relative URLs - works behind nginx reverse proxy
ENV NEXT_PUBLIC_API_URL=""
RUN npm run build

# Stage 3: Production image
FROM node:20-slim AS production

WORKDIR /app

# Copy backend build
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=backend-build /app/dist/ ./dist/

# Copy Next.js standalone build
COPY --from=webui-build /app/web-ui/.next/standalone ./web-ui-standalone/
COPY --from=webui-build /app/web-ui/.next/static ./web-ui-standalone/.next/static

# Install Claude CLI
RUN npm install -g @anthropic-ai/claude-code

# Copy scripts
COPY scripts/ ./scripts/

# Create non-root user so Claude CLI allows --dangerously-skip-permissions
RUN groupadd -r autobot && useradd -r -g autobot -m -d /home/autobot autobot

# Create data and logs directories owned by autobot
RUN mkdir -p data logs tasks && chown -R autobot:autobot data logs tasks

# Environment defaults
ENV NODE_ENV=production
ENV WEB_UI_HOST=0.0.0.0
ENV WEB_UI_PORT=7600
ENV WEBUI_PORT=7601

EXPOSE 7600 7601

# Start both backend and web UI
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
