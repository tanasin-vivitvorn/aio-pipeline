FROM ubuntu:22.04

# --- Base tools + Node 20 ---
RUN apt-get update && apt-get install -y \
    curl ca-certificates gnupg unzip lsb-release \
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y nodejs \
 && rm -rf /var/lib/apt/lists/*

# --- Install Docker CLI + Compose Plugin ---
RUN apt-get update && apt-get install -y ca-certificates curl gnupg lsb-release \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
      gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
 && chmod a+r /etc/apt/keyrings/docker.gpg \
 && echo \
   "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
   https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
   > /etc/apt/sources.list.d/docker.list \
 && apt-get update \
 && apt-get install -y docker-ce-cli docker-compose-plugin \
 && rm -rf /var/lib/apt/lists/*

# Verify installations
RUN docker --version && docker compose version

# --- App ---
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY server.js ./

EXPOSE 9000
CMD ["node", "server.js"]

