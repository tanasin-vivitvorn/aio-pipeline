FROM debian:bookworm-slim

RUN DEBIAN_FRONTEND=noninteractive apt-get update && apt-get install -y \
    slapd ldap-utils \
    && rm -rf /var/lib/apt/lists/*

ENV LDAP_DOMAIN=sum.local \
    LDAP_USERS=admin,dev \
    LDAP_PASSWORDS=admin123,dev123

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 389

ENTRYPOINT ["/entrypoint.sh"]
