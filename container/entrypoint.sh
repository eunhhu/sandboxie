#!/bin/bash
set -e

SANDBOX_USER="${SANDBOX_USER:-sandbox}"
SANDBOX_PASSWORD="${SANDBOX_PASSWORD:-password}"

if ! id "$SANDBOX_USER" &>/dev/null; then
    useradd -m -s /usr/bin/zsh "$SANDBOX_USER"
    echo "${SANDBOX_USER}:${SANDBOX_PASSWORD}" | chpasswd

    echo "${SANDBOX_USER} ALL=(ALL) NOPASSWD: /usr/bin/apt, /usr/bin/apt-get" > /etc/sudoers.d/${SANDBOX_USER}
    chmod 0440 /etc/sudoers.d/${SANDBOX_USER}
fi

exec /usr/sbin/sshd -D
