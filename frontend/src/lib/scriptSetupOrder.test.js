import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// A watcher cannot read a ref declared below it.
//
// `computed(() => x.value)` is lazy: the getter waits until something renders.
// `watch(() => x.value, cb)` is not — Vue runs the source getter once, there and
// then, to capture the initial value. Putting one above its own `const` throws
// "Cannot access 'x' before initialization" during setup, which does not fail
// the component, it fails the *page*: the route renders blank.
//
// This shipped. TradeDetailPage got a price watcher 23 lines above the
// `const proposal` it read, and every trade proposal became a white screen.
// Nothing caught it — the route is not prerendered so the build never mounted
// it, and there are no component tests. Hence a static check.
//
// Deliberately narrow: it only looks at `watch(() => IDENT...` , the shape that
// bit us, and only complains when IDENT is declared later in the same block. A
// prop, an import or a store has no `const` below the watcher, so it is quiet.

const SRC = new URL("../", import.meta.url).pathname;

function vueFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) vueFiles(full, out);
    else if (entry.endsWith(".vue")) out.push(full);
  }
  return out;
}

/** The `<script setup>` body, or "" when the file has none. */
function scriptSetup(source) {
  const m = source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/);
  return m ? m[1] : "";
}

/**
 * Watchers whose source getter reads an identifier declared further down.
 * Returns [{ ident, watchAt, declaredAt }].
 */
export function lateReads(block) {
  const problems = [];
  const watchRe = /\bwatch\(\s*\(\s*\)\s*=>\s*([A-Za-z_$][\w$]*)/g;
  for (const m of block.matchAll(watchRe)) {
    const ident = m[1];
    const declRe = new RegExp(`^\\s*(?:const|let|var)\\s+${ident}\\b`, "m");
    const decl = block.match(declRe);
    if (!decl) continue;                       // imported, prop, or global
    if (decl.index > m.index) {
      problems.push({ ident, watchAt: m.index, declaredAt: decl.index });
    }
  }
  return problems;
}

describe("lateReads spots a watcher reading a ref declared below it", () => {
  it("flags the shape that blanked the trade page", () => {
    const block = `
      const prices = ref(new Map());
      watch(() => proposal.value?.id, async () => {});
      const proposal = ref(null);
    `;
    expect(lateReads(block).map(p => p.ident)).toEqual(["proposal"]);
  });

  it("is quiet when the ref is declared first", () => {
    const block = `
      const proposal = ref(null);
      watch(() => proposal.value?.id, async () => {});
    `;
    expect(lateReads(block)).toEqual([]);
  });

  it("ignores computed, which is lazy and may read anything", () => {
    const block = `
      const total = computed(() => payload.value.length);
      const payload = computed(() => []);
    `;
    expect(lateReads(block)).toEqual([]);
  });

  it("ignores an identifier with no declaration in the block", () => {
    // props, imports, globals
    const block = `watch(() => props.modelValue, () => {});`;
    expect(lateReads(block)).toEqual([]);
  });

  it("ignores a multi-source array watcher, which cannot hoist-read either way", () => {
    const block = `
      const a = ref(1); const b = ref(2);
      watch([a, b], () => {});
    `;
    expect(lateReads(block)).toEqual([]);
  });
});

describe("no component watches a ref it has not declared yet", () => {
  it("holds across every .vue file", () => {
    const offenders = [];
    for (const file of vueFiles(SRC)) {
      const problems = lateReads(scriptSetup(readFileSync(file, "utf8")));
      for (const p of problems) offenders.push(`${relative(SRC, file)}: watch reads '${p.ident}' before its declaration`);
    }
    expect(offenders).toEqual([]);
  });
});
