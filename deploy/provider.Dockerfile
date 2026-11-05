FROM node:22-alpine
WORKDIR /app
COPY vibe-music-provider/package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node vibe-music-provider/*.mjs ./
USER node
ENV HOST=0.0.0.0 PORT=3001
EXPOSE 3001
CMD ["node","server.mjs"]
