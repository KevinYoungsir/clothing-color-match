# Contributing to Clothing Color Match Studio

Thank you for considering a contribution. Clothing Color Match Studio aims to be a practical, reusable open-source reference for garment color calibration, segmentation-assisted masking, and safe human-in-the-loop image processing.

## Ways to Contribute

Contributions are welcome in areas such as:

- garment segmentation and mask quality evaluation
- image processing and Lab-based color transfer
- difficult-case handling for hangers, clips, edge-touching garments, closeups, and complex backgrounds
- frontend UX for ROI and mask editing
- batch export and performance
- tests, regression tooling, and release validation
- documentation, examples, and onboarding
- accessibility, localization, and desktop packaging

## Before You Start

For substantial changes, open an issue first and describe:

1. the problem or use case
2. the proposed approach
3. how the change affects safety gates, masks, color transfer, or exports
4. how you plan to validate the change

Small documentation fixes can be submitted directly as a pull request.

## Development Setup

### Frontend

```bash
npm install
npm run dev
```

### Optional FastAPI AI server

The backend lives in `ai-server/`. Use Python 3.11 or 3.12 and follow the setup instructions in `README.md`.

Model files, API keys, test images containing private data, debug output, and local environment files must not be committed.

## Validation

At minimum, run:

```bash
npm run build
npm run verify:export
```

For backend changes, also run Python syntax checks and the relevant verification scripts documented in `README.md` and `ai-server/`.

For changes that affect masks, ROI behavior, color transfer, or export output, include a short validation note in the pull request.

## Safety and Product Principles

The project intentionally uses a human-in-the-loop workflow. Contributions should preserve these principles:

- AI or multimodal analysis is assistive, not an unreviewed final authority.
- Low-confidence or risky masks should fail safely instead of silently entering color transfer.
- Manual mask correction must remain available for difficult cases.
- Color transfer should only affect validated garment regions.
- API keys and provider secrets must remain backend-only and must never be committed.
- Do not weaken safety gates solely to make a difficult sample pass.

If a contribution changes one of these guarantees, explain the reason and add appropriate validation.

## Pull Request Guidelines

Please keep pull requests focused and include:

- a clear summary
- the user or developer problem being solved
- key files or components changed
- validation performed
- known limitations or follow-up work
- security or privacy implications when relevant

Prefer small, reviewable changes over large unrelated batches.

## Commit Messages

Concise conventional-style messages are encouraged, for example:

```text
feat: add mask quality metric
fix: prevent stale export after ROI change
test: add garment regression case
docs: clarify local model setup
```

## Reporting Security Issues

Please do not open a public issue for a vulnerability that could expose secrets, private images, or unsafe execution paths. See `SECURITY.md` for the reporting process.

## License

By contributing, you agree that your contributions will be licensed under the repository's MIT License.
