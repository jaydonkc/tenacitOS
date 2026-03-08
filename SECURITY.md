# Security Policy

## Supported Versions

Currently supporting:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it by:

1. **Email**: security@openclaw.ai (or create a private security advisory on GitHub)
2. **Do NOT** open a public issue
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work with you to resolve the issue.

## Security Best Practices

### For Deployment

1. **Network Access**
   - TenacitOS does not ship with built-in dashboard authentication
   - Keep it behind a VPN, firewall, private network, or reverse proxy access control
   - Prefer binding the app to localhost when possible

2. **Secrets**
   - Never commit `.env.local` to git
   - Protect `OPENCLAW_GATEWAY_TOKEN` if gateway auth is enabled
   - Rotate any exposed API tokens promptly

3. **File Permissions**
   - Ensure `.env.local` is readable only by the app user:
     ```bash
     chmod 600 .env.local
     ```
   - Lock down credentials directory:
     ```bash
     chmod 700 ~/.openclaw/credentials
     ```

4. **Reverse Proxy**
   - Always use HTTPS in production (Caddy auto-handles this)
   - Configure IP allowlists or access control if exposing publicly
   - Add rate limiting at the proxy layer if needed

5. **OpenClaw Gateway**
   - Keep gateway on loopback (127.0.0.1) if possible
   - Configure `trustedProxies` if behind a reverse proxy
   - Review security audit output: `openclaw status`

### For Development

1. **Never commit:**
   - `.env.local` (passwords, secrets)
   - `data/*.json` (operational data)
   - `data/*.db` (usage metrics)
   - Real usernames, emails, tokens

2. **Use branding config:**
   - Import from `src/config/branding.ts`
   - Use environment variables
   - Never hardcode personal info

3. **Dependencies:**
   - Run `npm audit` regularly
   - Update dependencies: `npm update`
   - Review Dependabot alerts

4. **Code Review:**
   - No `eval()` or `Function()` with user input
   - Validate and sanitize all input
   - Use parameterized queries (SQLite prepared statements)
   - Escape user-generated content in UI

## Known Security Considerations

### Authentication

- No app-level authentication is bundled
- Deploy behind your own access controls if the UI is reachable outside localhost
- TODO: Add optional auth integrations if public deployment becomes a target

### Data Storage

- Local JSON files (not encrypted at rest)
- SQLite database (not encrypted)
- TODO: Add encryption for sensitive data

### Network

- Gateway API exposed on loopback by default
- Control UI exposed via reverse proxy
- TODO: Add mTLS for gateway communication

## Security Checklist

Before deploying to production:

- [ ] Restricted dashboard access with network controls or reverse proxy auth
- [ ] Set file permissions on `.env.local` (600)
- [ ] Configured HTTPS via reverse proxy
- [ ] Reviewed `openclaw status` security audit
- [ ] Updated all npm dependencies
- [ ] Ran `npm audit fix`
- [ ] Configured firewall (UFW, iptables, etc.)
- [ ] Enabled fail2ban or similar (if public-facing)
- [ ] Configured backup for `data/` directory
- [ ] Documented incident response plan

## Responsible Disclosure

We follow coordinated vulnerability disclosure:

1. Reporter notifies us privately
2. We confirm and develop a fix
3. We release a patched version
4. Disclosure is made public after patch is available

Thank you for helping keep Mission Control secure! 🔒
