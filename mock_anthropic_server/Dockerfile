FROM node:25-slim AS build-deps
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm ci
COPY . ./

FROM node:25-slim
RUN apt-get update && apt-get install -y curl
COPY --from=build-deps /usr/src/app/package.json ./package.json
COPY --from=build-deps /usr/src/app/tsconfig.json ./tsconfig.json
COPY --from=build-deps /usr/src/app/node_modules ./node_modules
COPY --from=build-deps /usr/src/app/src ./src

CMD ["npm", "start"]
