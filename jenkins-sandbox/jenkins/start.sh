#!/bin/bash

ADMIN_PW="${LDAP_ADMIN_PASSWORD:-admin123}"
USERS="${LDAP_USERS:-admin,dev}"
PASSWORDS="${LDAP_PASSWORDS:-admin123,dev123}"
BASE_DN="dc=sum,dc=local"
ADMIN_DN="cn=admin,${BASE_DN}"

setup_ldap() {
    echo "==> Checking runtime user: $(id)"

    echo "==> Starting slapd..."
    mkdir -p /var/run/slapd
    chown openldap:openldap /var/run/slapd 2>/dev/null || true

    # Start slapd and capture output for diagnosis
    /usr/sbin/slapd -h "ldap://127.0.0.1:389/" -u openldap -g openldap -d 0 \
        > /tmp/slapd-start.log 2>&1 &
    SLAPD_PID=$!
    sleep 2

    if ! kill -0 "${SLAPD_PID}" 2>/dev/null; then
        echo "==> slapd failed to stay running. Output:"
        cat /tmp/slapd-start.log
        return 1
    fi

    echo "==> slapd started (PID ${SLAPD_PID})"

    echo "==> Waiting for slapd..."
    for i in $(seq 1 15); do
        ldapsearch -x -H ldap://127.0.0.1:389 \
            -D "${ADMIN_DN}" -w "${ADMIN_PW}" \
            -b "${BASE_DN}" "(objectClass=*)" dn > /dev/null 2>&1 && break
        sleep 2
    done

    echo "==> Seeding OUs..."
    ldapadd -x -H ldap://127.0.0.1:389 -D "${ADMIN_DN}" -w "${ADMIN_PW}" 2>/dev/null <<EOF || true
dn: ou=users,${BASE_DN}
objectClass: organizationalUnit
ou: users

dn: ou=groups,${BASE_DN}
objectClass: organizationalUnit
ou: groups
EOF

    echo "==> Seeding users..."
    IFS=',' read -ra USER_LIST <<< "$USERS"
    IFS=',' read -ra PASS_LIST <<< "$PASSWORDS"
    for i in "${!USER_LIST[@]}"; do
        U="${USER_LIST[$i]}"
        P="${PASS_LIST[$i]:-changeme}"
        ldapadd -x -H ldap://127.0.0.1:389 -D "${ADMIN_DN}" -w "${ADMIN_PW}" 2>/dev/null <<EOF || true
dn: cn=${U},ou=users,${BASE_DN}
objectClass: inetOrgPerson
cn: ${U}
sn: ${U}
uid: ${U}
mail: ${U}@sum.local
userPassword: ${P}
EOF
        echo "  -> ${U}"
    done

    echo "==> LDAP ready"
}

setup_ldap || echo "WARNING: LDAP setup failed — Jenkins will start without LDAP"

echo "==> Starting ZAP daemon..."
mkdir -p /var/jenkins_home/zap-session
/app/zap/zap.sh -daemon \
    -port 8090 \
    -host 127.0.0.1 \
    -dir /var/jenkins_home/zap-session \
    -config api.disablekey=true \
    -config connection.timeoutInSecs=60 \
    >> /var/jenkins_home/zap-daemon.log 2>&1 &
echo "==> ZAP PID: $!"

echo "==> Starting Jenkins..."
exec /usr/bin/tini -- /usr/local/bin/jenkins.sh
