# Contributing

AskDocs is currently a solo portfolio project. If you'd like to contribute or have suggestions:

1. Open an issue describing the feature or bug
2. Fork the repository
3. Create a feature branch (`git checkout -b feature/your-feature`)
4. Commit with clear messages following conventional commits (`feat:`, `fix:`, `docs:`, `chore:`)
5. Open a Pull Request

## Development Setup

See the [Getting Started](README.md#getting-started) section in the main README.

## Code Standards

- **Backend:** PEP 8 via ruff, type hints on all function signatures, structured logging with `get_logger(__name__)`
- **Frontend:** TypeScript strict mode, ESLint with Next.js config, no `any` unless genuinely unavoidable
- **Testing:** Tests required for new features — run `pytest -v` (backend) and `npm run build` (frontend) before submitting
- **Commits:** Follow [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
