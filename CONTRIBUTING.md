# Contributing to Vikunja MCP

Thank you for your interest in contributing to the Vikunja MCP Server! This project aims to provide a high-quality Model Context Protocol integration for Vikunja task management.

## Development Setup

### Prerequisites
- Node.js 20+ (LTS versions only)
- npm 10+
- A Vikunja instance for testing (optional but recommended)

### Getting Started
1. Fork the repository
2. Clone your fork
   ```bash
   git clone <your-fork-url>
   cd vikunja-mcp
   ```
3. Install dependencies
   ```bash
   npm install
   ```
4. Copy the environment example
   ```bash
   cp .env.example .env
   # Edit .env with your Vikunja instance details
   ```
5. Run tests to ensure everything works
   ```bash
   npm test
   ```

## Development Workflow

### Running in Development Mode
```bash
npm run dev
```

### Code Quality Standards
This project maintains high quality standards:
- **Test Coverage**: We maintain 95%+ test coverage
- **Type Safety**: TypeScript in strict mode
- **Linting**: ESLint with TypeScript rules
- **Formatting**: Prettier for consistent style

Before submitting code, ensure:
```bash
npm run lint        # No linting errors
npm run typecheck   # TypeScript compiles
npm test           # All tests pass
npm run test:coverage  # Coverage meets thresholds
```

### Testing
- Write tests for all new functionality
- Place tests in `tests/` directory following existing patterns
- Use descriptive test names
- Mock external dependencies appropriately
- Run `npm run test:watch` during development

## Making Changes

### Code Style
- Follow existing patterns in the codebase
- Use descriptive variable and function names
- Add JSDoc comments for public APIs
- Keep functions focused and small
- Use TypeScript types, avoid `any`

### Commit Messages
- Use clear, descriptive commit messages
- Start with a verb (Add, Fix, Update, etc.)
- Reference issues when applicable: "Fix: Issue #123"
- Keep the first line under 72 characters

### Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write code
   - Add tests
   - Update documentation

3. **Verify quality**
   ```bash
   npm run format     # Format code
   npm run lint       # Check linting
   npm test          # Run tests
   npm run build     # Ensure it builds
   ```

4. **Update documentation**
   - Update README.md if adding features
   - Update CHANGELOG.md with your changes
   - Add JSDoc comments for new functions

5. **Submit PR**
   - Push to your fork
   - Create PR with clear description
   - Reference any related issues
   - Ensure CI passes

### PR Requirements
- All tests must pass
- No linting errors
- Coverage thresholds met
- Documentation updated
- CHANGELOG.md updated

## Architecture Guidelines

### Tool Structure
Each MCP tool should:
- Have a single responsibility
- Use subcommands for related operations
- Return standardized responses
- Handle errors gracefully
- Include comprehensive tests

### Error Handling
- Use typed errors from `types/errors.ts`
- Provide helpful error messages
- Include workarounds for known API limitations
- Log errors appropriately

### Testing Philosophy
- Test behavior, not implementation
- Mock external dependencies
- Test error cases thoroughly
- Maintain high coverage without sacrificing quality

## Reporting Issues

### Bug Reports
Include:
- Vikunja version
- Node.js version
- Steps to reproduce
- Expected vs actual behavior
- Error messages/logs

### Feature Requests
- Check existing issues first
- Explain the use case
- Suggest implementation approach
- Consider Node-RED integration implications

## Community

### Getting Help
- Check existing issues and PRs
- Read the comprehensive test suite for examples
- Review VIKUNJA_API_ISSUES.md for known limitations

### Code of Conduct
- Be respectful and constructive
- Welcome newcomers
- Focus on the code, not the person
- Assume good intentions

## Recognition

Contributors will be:
- Credited in release notes
- Listed in the README (for significant contributions)
- Thanked publicly in project announcements

## Repository

This project is developed on GitHub. All issues, pull requests, and discussions should happen here.

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License.

---

Thank you for contributing to make Vikunja MCP better! 🚀
