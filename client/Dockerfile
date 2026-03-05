FROM node:25 AS build

WORKDIR /workspace

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build


FROM nginx:1.29.5

RUN apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/*

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/dist /usr/share/nginx/html

CMD ["nginx", "-g", "daemon off;"]
