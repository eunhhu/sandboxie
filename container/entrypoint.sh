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

# Always ensure .zshrc exists
if [ ! -f "/home/${SANDBOX_USER}/.zshrc" ]; then
    cat > /home/${SANDBOX_USER}/.zshrc << 'EOF'
# Basic zsh configuration
autoload -Uz compinit && compinit
autoload -U colors && colors

# History settings
HISTFILE=~/.zsh_history
HISTSIZE=10000
SAVEHIST=10000
setopt SHARE_HISTORY
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_SPACE

# Prompt
PROMPT='%F{green}%n@%m%f:%F{blue}%~%f%# '

# Aliases
alias ll='ls -lah'
alias la='ls -A'
alias l='ls -CF'

# Bun
export BUN_INSTALL="/usr/local"
export PATH="$BUN_INSTALL/bin:$PATH"

# npm global without sudo
export NPM_CONFIG_PREFIX="$HOME/.npm-global"
export PATH="$HOME/.npm-global/bin:$PATH"

# pip user install
export PATH="$HOME/.local/bin:$PATH"
alias python='python3'
alias pip='pip3 --user'
alias pip3='pip3 --user'
EOF

    chown ${SANDBOX_USER}:${SANDBOX_USER} /home/${SANDBOX_USER}/.zshrc

    # Create npm global directory
    mkdir -p /home/${SANDBOX_USER}/.npm-global
    chown ${SANDBOX_USER}:${SANDBOX_USER} /home/${SANDBOX_USER}/.npm-global
fi

exec /usr/sbin/sshd -D
