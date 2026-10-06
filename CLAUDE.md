# CLAUDE.md — V16 Project

Behavioral guidelines for AI coding assistance in this project.

## 1. Think Before Coding

Before implementing:
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so.
- If something is unclear, stop and ask.

## 2. Simplicity First

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" that wasn't requested.
- If you write 200 lines and it could be 50, rewrite it.

## 3. Surgical Changes

When editing existing code:
- Don't improve adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

Transform tasks into verifiable goals:
- "Fix the bug" → reproduce it first, then fix
- "Add feature" → define what done looks like before coding

## Project Stack

- React + TypeScript
- Supabase (PostgreSQL)
- Vercel deployment
- Tailwind CSS

## Key Files

- `pages/` — page components (Dashboard, BackorderAnalytics, Ordering, etc.)
- `components/` — shared UI components
- `utils/` — business logic (searchLogic, inventoryEngine, supabase)
- `hooks/` — custom React hooks
- `types/inventory.ts` — core data types

## Code Graph — read before every task

`.understand-anything/knowledge-graph.json` maps every file, function, import, layer and a guided tour.
Before planning or editing, query it to find the files involved and everything that depends on them
(don't load the whole JSON — it's ~400 KB):

```bash
# files/functions matching a keyword, with summary
node -e "const g=require('./.understand-anything/knowledge-graph.json'),q=process.argv[1].toLowerCase();g.nodes.filter(n=>(n.id+n.summary).toLowerCase().includes(q)).slice(0,30).forEach(n=>console.log(n.id,'—',n.summary))" ordering
# who imports / is imported by a file (impact check before editing)
node -e "const g=require('./.understand-anything/knowledge-graph.json'),f='file:'+process.argv[1];g.edges.filter(e=>e.type==='imports'&&(e.source===f||e.target===f)).forEach(e=>console.log(e.source,'->',e.target))" utils/inventoryEngine.ts
```

Graph built at commit in `.understand-anything/meta.json`; if files changed since, trust the code over the graph
and refresh with `/understand` (incremental).
