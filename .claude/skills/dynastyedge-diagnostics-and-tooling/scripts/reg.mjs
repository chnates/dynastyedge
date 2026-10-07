// reg.mjs — registers THE repo resolver hook (scripts/loader.mjs at the repo
// root). Kept so every documented command keeps working:
//
//   node --import ./.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs your-script.mjs
//
// The hook used to be copied here; since 2026-10-07 (CODE-REVIEW-1 #13) there
// is one implementation. Prefer `node --import ./scripts/register.mjs` in new
// docs.
import { register } from 'node:module'
register('../../../../scripts/loader.mjs', import.meta.url)
