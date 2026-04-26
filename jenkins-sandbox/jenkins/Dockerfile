FROM jenkins/jenkins:lts

USER root

# --- Base dependencies ---
RUN DEBIAN_FRONTEND=noninteractive apt-get update && apt-get install -y \
    curl wget unzip python3 python3-pip python3-yaml jq git \
    ca-certificates gnupg lsb-release \
    libglib2.0-0 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libdbus-1-3 libxkbcommon0 libx11-6 libxcomposite1 \
    libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libatspi2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# --- slapd: install debconf-utils first, pre-configure, then install slapd ---
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y debconf-utils \
    && echo "slapd slapd/internal/adminpw password admin123" | debconf-set-selections \
    && echo "slapd slapd/internal/generated_adminpw password admin123" | debconf-set-selections \
    && echo "slapd slapd/password1 password admin123" | debconf-set-selections \
    && echo "slapd slapd/password2 password admin123" | debconf-set-selections \
    && echo "slapd slapd/domain string sum.local" | debconf-set-selections \
    && echo "slapd shared/organization string Sum" | debconf-set-selections \
    && echo "slapd slapd/backend string MDB" | debconf-set-selections \
    && echo "slapd slapd/purge_database boolean true" | debconf-set-selections \
    && echo "slapd slapd/move_old_database boolean true" | debconf-set-selections \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y slapd ldap-utils \
    && rm -rf /var/lib/apt/lists/*

# --- Node.js 20 ---
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# --- Playwright ---
RUN mkdir -p /app/playwright/tests /app/playwright/reports
WORKDIR /app/playwright
RUN npm init -y \
    && npm install @playwright/test \
    && npx playwright install --with-deps chromium

# --- JMeter ---
ENV JMETER_VERSION=5.6.3
RUN mkdir -p /app/jmeter \
    && curl -fsSL "https://archive.apache.org/dist/jmeter/binaries/apache-jmeter-${JMETER_VERSION}.tgz" \
    | tar -xz -C /app/jmeter --strip-components=1

# --- ZAP ---
ENV ZAP_VERSION=2.17.0
RUN mkdir -p /app/zap/wrk \
    && curl -fsSL "https://github.com/zaproxy/zaproxy/releases/download/v${ZAP_VERSION}/ZAP_${ZAP_VERSION}_Linux.tar.gz" \
    -o /tmp/zap.tar.gz \
    && tar -xz -C /tmp -f /tmp/zap.tar.gz \
    && mv /tmp/ZAP_${ZAP_VERSION}/* /app/zap/ \
    && rm -rf /tmp/zap.tar.gz /tmp/ZAP_${ZAP_VERSION} \
    && pip3 install --break-system-packages zaproxy python-owasp-zap-v2.4 \
    && curl -fsSL "https://raw.githubusercontent.com/zaproxy/zaproxy/main/docker/zap-baseline.py" \
    -o /app/zap/zap-baseline.py \
    && curl -fsSL "https://raw.githubusercontent.com/zaproxy/zaproxy/main/docker/zap-full-scan.py" \
    -o /app/zap/zap-full-scan.py \
    && curl -fsSL "https://raw.githubusercontent.com/zaproxy/zaproxy/main/docker/zap-api-scan.py" \
    -o /app/zap/zap-api-scan.py \
    && curl -fsSL "https://raw.githubusercontent.com/zaproxy/zaproxy/main/docker/zap_common.py" \
    -o /app/zap/zap_common.py \
    && chmod +x /app/zap/zap-baseline.py /app/zap/zap-full-scan.py /app/zap/zap-api-scan.py


RUN ln -sf /usr/bin/python3 /usr/bin/python

# --- SonarQube Scanner (CLI) ---
ENV SONAR_SCANNER_VERSION=6.2.1.4610
RUN set -e; \
    ARCH=$(uname -m); \
    if [ "$ARCH" = "aarch64" ]; then ARCH_SUFFIX="linux-aarch64"; else ARCH_SUFFIX="linux-x64"; fi; \
    curl -fsSL "https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-${SONAR_SCANNER_VERSION}-${ARCH_SUFFIX}.zip" \
    -o /tmp/sonar-scanner.zip \
    && unzip /tmp/sonar-scanner.zip -d /app \
    && mv /app/sonar-scanner-${SONAR_SCANNER_VERSION}-${ARCH_SUFFIX} /app/sonar-scanner \
    && rm /tmp/sonar-scanner.zip


ENV PATH="/app/playwright/node_modules/.bin:/app/jmeter/bin:/app/zap:/app/sonar-scanner/bin:${PATH}"

# --- Jenkins plugins (pre-install all required plugins) ---
COPY jenkins-sandbox/jenkins/plugins.txt /usr/share/jenkins/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/plugins.txt

# --- Inventory scanner scripts ---
COPY jenkins-sandbox/jenkins/sh/ /usr/local/lib/inventory/
RUN chmod +x /usr/local/lib/inventory/*.sh

# --- JCasC + seed job (baked into image, outside the jenkins_home volume) ---
RUN mkdir -p /etc/jenkins/casc_configs
COPY jenkins-sandbox/jenkins/jenkins.yaml /etc/jenkins/casc_configs/jenkins.yaml
COPY jenkins-sandbox/jenkins/seed.groovy /etc/jenkins/seed.groovy
COPY jenkins-sandbox/jenkins/Jenkinsfie /etc/jenkins/Jenkinsfie
ENV CASC_JENKINS_CONFIG=/etc/jenkins/casc_configs/jenkins.yaml \
    LDAP_DOMAIN=sum.local \
    LDAP_USERS=admin,dev \
    LDAP_PASSWORDS=admin123,dev123

COPY jenkins-sandbox/jenkins/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

USER jenkins
ENTRYPOINT ["/usr/local/bin/start.sh"]
