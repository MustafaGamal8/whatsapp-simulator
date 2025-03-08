### Stage 1: Build the application
FROM node:18-bullseye AS build

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm install --production

# Copy application files and build the project
COPY . .
RUN npm run build

### Stage 2: Create a minimal production image
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
  && rm -rf /var/lib/apt/lists/*

# Copy built files from the build stage
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

# Set environment variables for production
ENV NODE_ENV=production

# Expose the necessary port
EXPOSE 3000

# Start the NestJS application
CMD ["node", "dist/main.js"]
