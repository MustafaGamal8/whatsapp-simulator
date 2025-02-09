# Use a base image with Chromium support
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

# Copy package.json and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy application files
COPY . .

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
