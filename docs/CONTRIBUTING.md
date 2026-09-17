# Contributing

1. Fork the project and create a focused branch.
2. Run `npm install`, then `npm test` and `npm run build`.
3. Add or update a fixture in `examples/` for parser or nesting changes.
4. Keep geometry units in millimetres and algorithms deterministic.
5. Open a pull request with a short description, test output, and screenshots for UI changes.

Please do not commit generated `dist/` changes unless the release explicitly requires a portable offline build. Security issues should be reported privately to the repository maintainers.
