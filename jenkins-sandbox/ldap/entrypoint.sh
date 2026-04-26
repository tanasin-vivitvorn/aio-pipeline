#!/bin/bash
set -e

DOMAIN="${LDAP_DOMAIN:-sum.local}"
ADMIN_PW="${LDAP_ADMIN_PASSWORD:-admin123}"
USERS="${LDAP_USERS:-admin,dev}"
PASSWORDS="${LDAP_PASSWORDS:-admin123,dev123}"

# Build base DN from domain (sum.local -> dc=sum,dc=local)
BASE_DN="dc=$(echo "$DOMAIN" | sed 's/\./,dc=/g')"
ADMIN_DN="cn=admin,${BASE_DN}"

echo "==> Configuring slapd for domain: ${DOMAIN} (${BASE_DN})"

# Reconfigure slapd non-interactively
debconf-set-selections <<EOF
slapd slapd/internal/generated_adminpw password ${ADMIN_PW}
slapd slapd/internal/adminpw password ${ADMIN_PW}
slapd slapd/password2 password ${ADMIN_PW}
slapd slapd/password1 password ${ADMIN_PW}
slapd slapd/domain string ${DOMAIN}
slapd shared/organization string Sum
slapd slapd/backend string MDB
slapd slapd/purge_database boolean true
slapd slapd/move_old_database boolean true
EOF

dpkg-reconfigure -f noninteractive slapd 2>/dev/null

# Start slapd temporarily to seed users
slapd -h "ldap://127.0.0.1:389/" -u openldap -g openldap &
SLAPD_PID=$!

# Wait for slapd to be ready
echo "==> Waiting for slapd to start..."
for i in $(seq 1 20); do
    ldapsearch -x -H ldap://127.0.0.1:389 -b "${BASE_DN}" -D "${ADMIN_DN}" \
        -w "${ADMIN_PW}" "(objectClass=*)" dn > /dev/null 2>&1 && break
    sleep 1
done

# Add OU structure
echo "==> Creating OUs..."
ldapadd -x -H ldap://127.0.0.1:389 -D "${ADMIN_DN}" -w "${ADMIN_PW}" <<EOF 2>/dev/null || true
dn: ou=users,${BASE_DN}
objectClass: organizationalUnit
ou: users

dn: ou=groups,${BASE_DN}
objectClass: organizationalUnit
ou: groups
EOF

# Seed users
echo "==> Seeding users..."
IFS=',' read -ra USER_LIST <<< "$USERS"
IFS=',' read -ra PASS_LIST <<< "$PASSWORDS"

for i in "${!USER_LIST[@]}"; do
    USERNAME="${USER_LIST[$i]}"
    PASSWORD="${PASS_LIST[$i]:-changeme}"
    echo "  -> Adding user: ${USERNAME}"
    ldapadd -x -H ldap://127.0.0.1:389 -D "${ADMIN_DN}" -w "${ADMIN_PW}" <<EOF 2>/dev/null || true
dn: cn=${USERNAME},ou=users,${BASE_DN}
objectClass: inetOrgPerson
cn: ${USERNAME}
sn: ${USERNAME}
uid: ${USERNAME}
mail: ${USERNAME}@${DOMAIN}
userPassword: ${PASSWORD}
EOF
done

# Stop the background slapd
kill "$SLAPD_PID" 2>/dev/null || true
wait "$SLAPD_PID" 2>/dev/null || true

echo "==> Starting slapd in foreground on port 389..."
exec /usr/sbin/slapd -h "ldap:///" -u openldap -g openldap -d 0
