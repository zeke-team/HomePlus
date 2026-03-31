# Contributing to HomePlus

Thank you for your interest in contributing to HomePlus!

## Development Setup

```bash
git clone https://github.com/yourusername/homeplus.git
cd homeplus
npm install
npm run dev    # Start in development mode
```

## Code Style

- Use 2 spaces for indentation
- Use `const` and `let` — no `var`
- Use ES6+ features (arrow functions, destructuring, async/await)
- Maximum line length: 100 characters
- Always use semicolons

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add user session persistence
fix: resolve WebSocket reconnection race condition
docs: update API documentation
refactor: simplify chat-service message handling
test: add unit tests for weather detection
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes with passing tests
4. Commit with a clear message following Conventional Commits
5. Push and open a Pull Request

## Reporting Issues

Bug reports and feature requests are welcome. Please include:

- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Node.js version and platform

## Testing

```bash
npm test          # Run all tests
npm run test:watch # Watch mode for development
```

---

Thank you to all contributors!
