# WeatherSafetyOS MCP — Streamable HTTP(stateless). PlayMCP in KC Git-소스 빌드 대상.
# MUST build linux/amd64 (KC는 arm64 반려). 로컬:
#   docker build --platform linux/amd64 -t weathersafetyos-mcp .
#   docker run -p 8080:8080 weathersafetyos-mcp
FROM --platform=linux/amd64 node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM --platform=linux/amd64 node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
# 이 MCP는 API 키를 갖지 않는다(공개 코어 Worker만 호출). 코어 주소만 주입 가능.
ENV WSOS_BACKEND="https://weathersafetyos.oneul-suncare.workers.dev"
EXPOSE 8080
CMD ["node", "dist/server.js"]
