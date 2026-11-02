FROM node:22-alpine

WORKDIR /app

# 国内自建时可 --build-arg NPM_REGISTRY=https://registry.npmmirror.com
ARG NPM_REGISTRY=https://registry.npmjs.org

ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --registry="${NPM_REGISTRY}"

COPY server ./server
COPY public ./public

# 上传目录（头像等），配合 volume 持久化
RUN mkdir -p /app/data/uploads && chown -R node:node /app

USER node
EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1

CMD ["node", "server/index.js"]
