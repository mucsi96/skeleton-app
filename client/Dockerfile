# Produces the static release artifact; nginx is only the local/E2E origin.
FROM docker.io/library/node:26 AS build

WORKDIR /workspace

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build


FROM docker.io/library/nginx:1.31.7
LABEL org.opencontainers.image.source="https://github.com/mucsi96/skeleton-app"

RUN apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/*

RUN rm -rf /usr/share/nginx/html/*
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/dist /usr/share/nginx/html

CMD ["nginx", "-g", "daemon off;"]
