FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build
FROM node:18-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/build ./build
ENV PORT=8080
EXPOSE 8080
CMD ["serve", "-s", "build", "-l", "8080"]