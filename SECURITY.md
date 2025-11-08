# Security Policy

## Supported Versions

Currently supporting:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

The Vikunja MCP Server team takes security seriously. If you discover a security vulnerability, please follow these steps:

### 1. Do NOT Create a Public Issue

Security vulnerabilities should never be reported via public GitHub issues as this could put users at risk.

### 2. Report Privately

Please report security vulnerabilities via one of these methods:

- **GitHub Security Advisories**: [Report a vulnerability](https://github.com/democratize-technology/vikunja-mcp/security/advisories/new) (Recommended)
- **Direct Contact**: Contact the maintainer directly through GitHub

### 3. Provide Details

Include as much information as possible:

- Type of vulnerability
- Affected versions
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### 4. Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 5 business days
- **Resolution Target**: Depends on severity
  - Critical: 7 days
  - High: 14 days
  - Medium: 30 days
  - Low: Next release

## Security Best Practices for Users

### API Token Security

- Never commit API tokens to version control
- Use environment variables for tokens
- Rotate tokens regularly
- Use tokens with minimum required permissions

### Environment Security

```bash
# Good - Use environment variables
VIKUNJA_API_TOKEN=tk_your_token_here

# Bad - Never hardcode tokens
apiToken: "tk_actual_token" # Don't do this!
```

### JWT Token Handling

- JWT tokens expire - this is a security feature
- Never share JWT tokens
- Extract fresh tokens when needed
- Don't store JWT tokens in version control

### MCP Client Configuration

When configuring MCP clients:

1. Store configuration files securely
2. Use appropriate file permissions
3. Don't share configuration with tokens
4. Review configuration before sharing

## Known Security Considerations

### 1. Token Exposure in Logs

The MCP server is careful to:
- Never log full authentication tokens
- Mask sensitive data in debug output
- Use structured logging to stderr only

### 2. Input Validation

All inputs are validated using:
- Zod schemas for type safety
- ID validation for numeric inputs
- Date format validation (ISO 8601)
- Hex color format validation
- Strict JSON array validation to prevent injection attacks

### 2.1. JSON Injection Protection

The MCP server implements strict validation for JSON array inputs in filter operations:

- **Schema Validation**: Only accepts arrays starting with `[` and ending with `]`
- **Size Limits**: Maximum 200 characters, 100 array items
- **Type Restrictions**: Only allows strings, numbers, and null values
- **Content Validation**: Rejects dangerous patterns like `__proto__`, `constructor`, `function`, `eval`
- **Number Validation**: Rejects `NaN`, `Infinity`, and extremely large numbers

This prevents prototype pollution, code injection, and DoS attacks through malicious JSON payloads.

### 3. No Direct Database Access

The MCP server:
- Only communicates via Vikunja API
- Inherits Vikunja's security model
- Cannot bypass Vikunja permissions

## Security Updates

Subscribe to security updates:
1. Watch the GitHub repository
2. Enable GitHub security alerts
3. Monitor NPM advisories

## Acknowledgments

We appreciate responsible disclosure of security vulnerabilities. Contributors who report valid security issues will be acknowledged in release notes (unless they prefer to remain anonymous).

## Contact

For sensitive security matters that cannot be disclosed publicly, please use GitHub Security Advisories or contact the maintainer directly through GitHub.
