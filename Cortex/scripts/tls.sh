#!/usr/bin/env bash
# =============================================================================
# Cortex - Let's Encrypt certificate via the certbot container (webroot).
#
#   tls.sh issue <hostname>   first certificate (nginx must be serving the
#                             site-http template, which answers ACME on :80)
#   tls.sh renew              cron: weekly; reloads nginx only after a renewal
#
# Then switch nginx to TLS in Cortex/docker/.env:
#   NGINX_SITE=tls
#   CORTEX_PUBLIC_HOST=<hostname>
# and recreate it:  docker compose -f Cortex/docker/docker-compose.prod.yml up -d nginx
# =============================================================================
set -Eeuo pipefail

CERTBOT=(docker run --rm
    -v /opt/cortex/letsencrypt:/etc/letsencrypt
    -v /opt/cortex/acme:/var/www/certbot
    certbot/certbot)

case "${1:-}" in
    issue)
        host="${2:?usage: tls.sh issue <hostname>}"
        "${CERTBOT[@]}" certonly --webroot -w /var/www/certbot -d "$host" \
            --agree-tos --register-unsafely-without-email --non-interactive
        ;;
    renew)
        "${CERTBOT[@]}" renew --webroot -w /var/www/certbot --quiet \
            --deploy-hook "touch /etc/letsencrypt/.renewed"
        if [[ -e /opt/cortex/letsencrypt/.renewed ]]; then
            docker exec cortex-nginx nginx -s reload
            docker run --rm -v /opt/cortex/letsencrypt:/le alpine rm -f /le/.renewed
        fi
        ;;
    *)
        echo "usage: tls.sh issue <hostname> | tls.sh renew" >&2
        exit 64
        ;;
esac
