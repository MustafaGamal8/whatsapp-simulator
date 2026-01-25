FROM node:18-bullseye

WORKDIR /app

RUN apt-get update && apt-get install -y \
  wget curl unzip libnss3 libxss1 libasound2 fonts-liberation \
  libatk1.0-0 libatk-bridge2.0-0 libcups2 libgbm-dev libgtk-3-0 \
  libpangocairo-1.0-0 libx11-xcb1 libxcb-dri3-0 libxcomposite1 \
  libxdamage1 libxfixes3 libxrandr2 libxshmfence1 xdg-utils \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm exec nest build

EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "dist/main.js"]
