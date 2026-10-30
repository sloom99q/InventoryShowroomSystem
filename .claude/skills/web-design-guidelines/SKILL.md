---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance (accessibility, focus states, forms, typography, tables/number formatting, motion, dark mode, i18n). Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
  vendored: "Local pinned copy. Upstream skill fetches guidelines from GitHub at runtime; this copy reads guidelines.md instead (vercel-labs/web-interface-guidelines@434b7f91364665f2f733b310ec54809bf8f37937)."
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read the pinned rules in [guidelines.md](./guidelines.md) (in this skill's directory). Do NOT fetch them from the network.
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in guidelines.md
4. Output findings in the terse `file:line` format described in guidelines.md

## Usage

When a user provides a file or pattern argument:
1. Read `guidelines.md`
2. Read the specified files
3. Apply all rules from the guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.

## Project notes

- Where this checklist conflicts with the project's own copy/tone rules (e.g. "Title Case for headings/buttons" vs. the frontend-design skill's sentence-case guidance), the project's documented convention wins; flag inconsistency rather than enforcing Title Case.
- To refresh the rules, a human should diff the upstream `command.md` against `guidelines.md` and update the pinned commit in README.md.
