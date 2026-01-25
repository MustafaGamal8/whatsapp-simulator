# Base image with Node 18 (compatible with NestJS + Puppeteer)
FROM node:18-bullseye

# Set working directory
WORKDIR /app

# Install required dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
  wget \
  curl \
  unzip \
  libnss3 \
  libxss1 \
  libasound2 \
  fonts-liberation \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libgbm-dev \
  libgtk-3-0 \
  libpangocairo-1.0-0 \
  libx11-xcb1 \
  libxcb-dri3-0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libxshmfence1 \
  xdg-utils \
  chromium \
  && rm -rf /var/lib/apt/lists/*

# Create the data directory for WhatsApp session
RUN mkdir -p /app/data && chmod -R 777 /app/data

# Enable Corepack and PNPM
RUN corepack enable
ENV PUPPETEER_SKIP_DOWNLOAD=false

# Copy package.json and pnpm-lock.yaml for caching
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Install Puppeteer Chrome browser explicitly
RUN pnpm exec puppeteer browsers install chrome

# Copy app source
COPY . .

# Build NestJS app
RUN pnpm exec nest build

# Expose port
EXPOSE 3000

# Set production env
ENV NODE_ENV=production

# Run the app
CMD ["node", "dist/main.js"]
