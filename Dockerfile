# Dev image for the plancia playground + test runner.
# Not a production artifact: the library itself ships as an npm package (dist/).
FROM node:22-alpine

WORKDIR /app

# Install deps first for layer caching.
COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# Default: Vite dev server (playground). Overridden by the `test` service.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
