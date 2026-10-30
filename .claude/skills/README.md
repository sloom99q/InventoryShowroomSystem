# Project skills (Claude Code)

Project-scoped agent skills for building the Showroom Vehicle Inventory UI
(React + TS + Vite + Tailwind + shadcn/ui + Lucide; dark graphite automotive SaaS look,
data-dense tables, forms). Installed 2026-10-30 by copying vetted folders from pinned
upstream commits. No `npx skills add` lockfile or node_modules were created.

Every file in these folders was reviewed before install. Nothing here asks for secrets,
sends telemetry, pipes curl to a shell, or contains obfuscated code.

| Skill (folder) | Source | Commit | License | Role |
|---|---|---|---|---|
| `frontend-design` | https://github.com/anthropics/skills/tree/main/skills/frontend-design | `ca45fc496a3436251f191354091d557da31c15b5` | Apache-2.0 (LICENSE.txt) | Sets the visual direction. Pushes toward an intentional, subject-specific look (palette, type scale, layout plan, then a self-critique pass) and away from templated "AI SaaS" defaults. Prose only, no scripts. |
| `shadcn` | https://github.com/shadcn-ui/ui/tree/main/skills/shadcn | `96da9cc7f1aa10580a3741664e2a77c721206c00` | MIT (LICENSE.md) | Official shadcn/ui skill. Covers CLI usage, semantic tokens, FieldGroup/Field forms, composition rules, theming/customization and DESIGN.md-to-theme mapping. |
| `web-design-guidelines` | https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines + rules from https://github.com/vercel-labs/web-interface-guidelines (`command.md`) | skill `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62`, rules `434b7f91364665f2f733b310ec54809bf8f37937` | MIT | Review and audit checklist for accessibility, focus, forms, `tabular-nums` number columns, motion, dark mode, `Intl` formatting and anti-patterns. Outputs `file:line` findings. |
| `ui-ux-pro-max` | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (`.claude/skills/ui-ux-pro-max`) | `28b3b8dee8c976df4fa3e94aed4e092ad43fcb03` | MIT (LICENSE) | Offline, searchable UX/a11y database: 119 UX guidelines, font pairings, chart guidance, and stack rules for `react`, `shadcn` and `html-tailwind`. Uses a Python stdlib-only BM25 search script with no network access and no dependencies. |
| `vercel-react-best-practices` | https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices | `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62` | MIT (in frontmatter and repo README) | React performance rules: re-renders, bundle size, waterfalls, client data fetching. Large inventory tables need these. The Next.js/server rules can be ignored for this Vite SPA. |
| `vercel-composition-patterns` | https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns | `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62` | MIT (in frontmatter and repo README) | Component API design: compound components, explicit variants instead of boolean props, context interfaces, React 19 (no forwardRef). Used for the app's own reusable components, such as the data table, VIN fields and filters. |

## Which skill decides what

- **Aesthetics and visual identity:** `frontend-design` decides. `ui-ux-pro-max --design-system`
  returns generic palettes and patterns. A test query for an "automotive inventory dashboard"
  suggested a hero/landing pattern, so use its output only as a reference. Do not treat it
  as the design.
- **Component usage and styling mechanics:** `shadcn`.
- **Quality gate before calling UI done:** `web-design-guidelines`, then `ui-ux-pro-max` `--domain ux`
  or `--stack shadcn` lookups for specific concerns.
- **Copy casing:** this project uses sentence case, as `frontend-design` recommends. Ignore the
  Title Case line in `web-design-guidelines`.

## Local modifications (deviations from upstream)

1. `web-design-guidelines/SKILL.md` was rewritten so the agent reads a **pinned local
   `guidelines.md`** instead of using WebFetch on a mutable `raw.githubusercontent.com` URL at
   runtime. Remote, unpinned instructions are a supply-chain risk. `guidelines.md` is
   upstream `command.md` copied verbatim at `434b7f9`.
2. `ui-ux-pro-max/SKILL.md`: script paths `${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/...`
   were replaced with the project-relative `.claude/skills/ui-ux-pro-max/...`. That variable
   is only set for plugin installs. Only the 4 runtime scripts were copied (`core.py`,
   `design_system.py`, `reasoning_contract.py`, `search.py`). The dev-only `tests/` and
   `validate_data.py` were left out. Run from the repo root with `python3`. System Python
   3.15 works because the scripts use only the standard library.
3. `shadcn`: `evals/` and `agents/openai.yml` were left out because Claude Code doesn't use
   them. Folder names `vercel-react-best-practices` and `vercel-composition-patterns` were
   renamed to match each skill's frontmatter `name`.

## Known behaviours to be aware of

- `shadcn/SKILL.md` contains a dynamic-context line, ``!`npx shadcn@latest info --json` ``. When
  the skill loads, it runs the official shadcn CLI from npm (unpinned `@latest`) to read
  `components.json`. The project uses this CLI anyway. To avoid fetching from npm, pin it, for
  example `npx shadcn@<version>`, after the frontend is scaffolded. Its `allowed-tools` covers
  only `npx/pnpm dlx/bunx shadcn@latest *`.
- `shadcn/mcp.md` describes an optional shadcn MCP server. Nothing is configured automatically.

## Considered and not installed

- `nextlevelbuilder` sibling skills (`design`, `brand`, `banner-design`, `slides`, `ui-styling`,
  `design-system`): marketing and brand oriented, and they overlap with the skills above.
- `anthropics/skills` `web-artifacts-builder` and `canvas-design`: built for artifacts and posters,
  not a Vite app.
- Low-install or unknown-author forks found via `npx skills find`, such as copies of
  `frontend-design`, `ui-ux-pro-max` mirrors, `tailwind-v4-shadcn` and `shadcn-component-boundaries`.
  The originals above come from reputable sources.

## Updating

Re-clone upstream, diff each folder against this one, re-read any changed scripts, re-apply the
local modifications above, and update the commit hashes in this table.
