FROM node:22-alpine AS client
RUN npm install -g pnpm@9.15.2
WORKDIR /build/client
COPY vibe-music-client/package.json vibe-music-client/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY vibe-music-client/ .
ENV VITE_APP_BASE_API=/api
RUN pnpm build
FROM node:22-alpine AS admin
RUN npm install -g pnpm@9.15.2
WORKDIR /build/admin
COPY vibe-music-admin/package.json vibe-music-admin/pnpm-lock.yaml vibe-music-admin/.npmrc ./
RUN pnpm install --frozen-lockfile
COPY vibe-music-admin/ .
ENV VITE_APP_BASE_API=/api
RUN pnpm build
FROM nginx:1.28-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/proxy.conf /etc/nginx/proxy-fmp.conf
COPY --from=client /build/client/dist /usr/share/nginx/html/client
COPY --from=admin /build/admin/dist /usr/share/nginx/html/admin
EXPOSE 80 81
