FROM node:18-slim

# Install build tools for node-pty
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    bash \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json ./
COPY client/package.json ./client/

# Install server dependencies
RUN npm install --production=false

# Install and build client
WORKDIR /app/client
RUN npm install && npm run build

# Copy source code
WORKDIR /app
COPY . .

# Create workspace directory
RUN mkdir -p /tmp/arena-workspace

ENV NODE_ENV=production
ENV PORT=3000
ENV WORKSPACE_DIR=/tmp/arena-workspace

EXPOSE 3000

CMD ["node", "server/index.js"]
