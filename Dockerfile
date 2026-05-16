FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --production=false

COPY tsconfig.json ./
COPY scripts/ ./scripts/
COPY src/ ./src/

RUN npm run build

# Prune dev dependencies
RUN npm prune --production

ENV MCP_TRANSPORT=http
ENV PORT=8080
ENV SPRAAY_GATEWAY_URL=https://gateway.spraay.app

EXPOSE 8080

CMD ["node", "dist/index.js"]
