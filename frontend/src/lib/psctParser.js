// Deterministic PSCT (Problem-Solving Card Text) parser — browser-safe ESM.
//
// Turns a card's printed effect text into a normalized breakdown WITHOUT an LLM
// and WITHOUT stored data: it runs at render time on the card's `desc`. Pure
// string/regex — safe in SSR and the browser.
//
// Returns { summary, effects: [{ box?, segments:[{label,text}] }], tags }.
// Multi-effect cards are split into separate effect groups; Pendulum cards are
// split into their two text boxes.
//
// PSCT structure exploited:
//   - a colon separates activation timing/condition (trigger) from the rest
//   - a semicolon separates the cost/requirement from the resolution effect
//   - each effect is (usually) one sentence; bullets (●) list sub-effects
//   - usage limits and locks are their own sentences

const MONSTER_TYPES =
  "Plant|Dragon|Warrior|Spellcaster|Fairy|Fiend|Zombie|Machine|Aqua|Pyro|Rock|Winged Beast|Insect|Thunder|Beast-Warrior|Beast|Dinosaur|Sea Serpent|Fish|Reptile|Psychic|Wyrm|Cyberse|Illusion|Fusion|Synchro|Xyz|XYZ|Link|Ritual|Pendulum|Tuner";

const COST_VERB =
  /\b(discard|send [^;]*?to the (?:GY|Graveyard)|pay \d|pay half|Tribute|banish [^;]*?from your (?:hand|field|side|Deck|GY|Graveyard))/i;

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const clean = (s) => (s || "").replace(/\s+/g, " ").replace(/^[,;:\s]+|[,;\s]+$/g, "").trim();

const isRestriction = (s) =>
  /\bcan only use (?:this|each|the)[^.]*?\beffect[^.]*?\bonce per turn\b/i.test(s) ||
  /^You can only (?:use|activate|Special Summon)[^.]*?\bonce per turn\b/i.test(s);

const isDownside = (s) =>
  /\bfor the rest of this turn\b[^.]*?\bcan only\b/i.test(s) ||
  /\bcan only Special Summon\b[^.]*?monsters/i.test(s) ||
  /\bthis card cannot (?:attack|be|declare)\b/i.test(s);

// Split text into sentences without breaking mid-clause: boundary = period
// followed by whitespace and a capital/quote/bullet.
function splitSentences(text) {
  return text
    .split(/(?<=[.])\s+(?=[A-Z("●])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Parse ONE effect sentence/clause into ordered segments.
function parseEffectBlock(block) {
  const segments = [];
  let body = clean(block);
  let trigger = null;
  let condition = null;

  const ci = body.indexOf(": ");
  if (ci > 0 && ci < 90) {
    const head = clean(body.slice(0, ci));
    body = clean(body.slice(ci + 1));
    if (/^(When|During|At|Each time|Each turn)/i.test(head)) trigger = head;
    else if (/^(If|While|As long as)/i.test(head)) condition = head;
    else trigger = head;
  }

  let cost = null;
  let target = null;
  let effect = body;
  const si = body.indexOf("; ");
  if (si > 0) {
    const pre = clean(body.slice(0, si));
    effect = clean(body.slice(si + 1));
    const tm = pre.match(/target ([^;]*)/i);
    let rest = pre;
    if (tm) {
      target = "Target " + clean(tm[1]);
      rest = clean(pre.replace(/,?\s*then\s+target [^;]*/i, "").replace(/target [^;]*/i, ""));
    }
    rest = clean(rest.replace(/^You can\s+/i, ""));
    if (COST_VERB.test(rest)) cost = rest;
    else if (!target && rest && /^(If|While|As long as)/i.test(rest)) condition = condition || rest;
  } else {
    const m = body.match(/^(?:You can\s+)?((?:discard|send|pay|Tribute|banish)[^,]*),?\s+then\s+(.*)$/i);
    if (m && COST_VERB.test(m[1])) {
      cost = clean(m[1].replace(/^You can\s+/i, ""));
      effect = clean(m[2]);
    } else {
      effect = clean(body.replace(/^You can\s+/i, ""));
    }
  }

  if (trigger) segments.push({ label: "trigger", text: cap(trigger) });
  if (condition) segments.push({ label: "condition", text: cap(condition) });
  if (cost) segments.push({ label: "cost", text: cap(cost) });
  if (target) segments.push({ label: "target", text: cap(target) });
  if (effect) segments.push({ label: "effect", text: cap(effect) });
  return segments;
}

// All segments from a run of text, flattened into one list (for a single bullet
// option that may carry its own restriction sentence).
function segmentsOf(text) {
  return parseSentencesToEffects(text).flatMap((g) => g.segments);
}

// A run of sentences → one effect group per activation sentence; restriction /
// downside sentences attach to the current (or first) group.
function parseSentencesToEffects(text) {
  const groups = [];
  let cur = null;
  const orphan = [];
  for (const s of splitSentences(text)) {
    if (isRestriction(s)) {
      (cur ? cur.segments : orphan).push({ label: "restriction", text: clean(s) });
      continue;
    }
    if (isDownside(s)) {
      (cur ? cur.segments : orphan).push({ label: "downside", text: clean(s) });
      continue;
    }
    cur = { segments: parseEffectBlock(s) };
    groups.push(cur);
  }
  if (orphan.length) (groups[0] || groups[groups.push({ segments: [] }) - 1]).segments.push(...orphan);
  return groups;
}

// Bullets have two meanings in PSCT:
//   A) chooser:  "[cost], then activate 1 of these effects: ● A ● B"  → pick one
//   B) sub-effect: "[main effect], apply this effect: ● C"            → C extends the effect
// We discriminate on the lead-in wording so the lead isn't lost.
function parseBulleted(text) {
  const idx = text.search(/●/);
  let lead = clean(text.slice(0, idx));
  const opts = text.slice(idx).split(/●/).map(clean).filter(Boolean);

  // Inline "(but you can only use … once per turn)" restriction.
  const sharedRestr = [];
  lead = lead.replace(/\(but you can only use[^)]*\)/i, (m) => {
    sharedRestr.push({ label: "restriction", text: clean(m.replace(/^\(|\)$/g, "")) });
    return "";
  });

  const isChooser =
    /\b(?:activate|apply) (?:1|one) of these effects/i.test(lead) ||
    /(?:these|the following) effects?\s*:?\s*$/i.test(lead.replace(/\([^)]*\)/g, "").trim());

  let groups;
  if (isChooser) {
    lead = clean(lead.replace(/,?\s*then (?:activate|apply) (?:1|one) of these effects/i, "").replace(/[;:]\s*$/, ""));
    const sharedCost = COST_VERB.test(lead) ? [{ label: "cost", text: cap(clean(lead.replace(/^You can\s+/i, ""))) }] : [];
    groups = opts.map((o) => ({ segments: [...sharedCost, ...segmentsOf(o)] }));
  } else {
    // Lead is a real effect; bullets are sub-effects appended to the last lead group.
    lead = clean(lead.replace(/,?\s*(?:and if you do(?: that)?, )?apply this effect[^:]*:?\s*$/i, ""));
    groups = parseSentencesToEffects(lead);
    if (!groups.length) groups.push({ segments: [] });
    const last = groups[groups.length - 1];
    for (const o of opts) last.segments.push(...segmentsOf(o));
  }
  if (sharedRestr.length) groups[groups.length - 1].segments.push(...sharedRestr);
  return groups;
}

function parseBox(text, box) {
  text = clean(text);
  if (!text) return [];
  const groups = /●/.test(text) ? parseBulleted(text) : parseSentencesToEffects(text);
  if (box) for (const g of groups) g.box = box;
  return groups;
}

// Strip Konami clarification notes and leading classification parentheticals.
function stripNotes(raw) {
  raw = raw.replace(/\s*[*●]?\s*The above text is[\s\S]*$/i, "");
  raw = raw.replace(/^\s*\([^)]*?(?:always treated as|This card's name)[^)]*\)\s*/i, "");
  return raw;
}

function splitPendulum(raw) {
  const r = raw.replace(/\[\s*Pendulum Effect\s*\]/i, "").trim();
  const parts = r.split(/\[\s*Monster Effect\s*\]/i);
  const pend = clean(parts[0].replace(/-{3,}/g, " "));
  const mon = clean((parts[1] || "").replace(/-{3,}/g, " "));
  return [pend, mon];
}

function extractTags(desc, effects) {
  const tags = {};
  if (/once per turn/i.test(desc)) tags.oncePerTurn = true;
  if (/\(Quick Effect\)/i.test(desc)) tags.quickEffect = true;
  if (/from your hand/i.test(desc)) tags.fromHand = true;
  if (/\bnegate/i.test(desc)) tags.negates = true;
  if (/\bbanish/i.test(desc)) tags.banishes = true;
  if (/\bdestroy/i.test(desc)) tags.destroys = true;
  if (/\bdraw \d/i.test(desc)) tags.draws = true;
  if (/Special Summon/i.test(desc)) tags.specialSummons = true;
  const lock = desc.match(
    new RegExp(`can only Special Summon ((?:${MONSTER_TYPES})(?:[ ,/and]+(?:${MONSTER_TYPES}))*) monsters`, "i")
  );
  if (lock) {
    const types = lock[1].split(/[ ,/]+|\band\b/).map((s) => s.trim()).filter(Boolean);
    if (types.length) tags.lock = types;
  }
  const eff = effects.flatMap((g) => g.segments).find((s) => s.label === "effect");
  if (eff) {
    const v = eff.text.toLowerCase();
    if (/special summon this card/.test(v)) tags.effectType = "special_summon_self";
    else if (/special summon/.test(v)) tags.effectType = "special_summon";
    else if (/^draw/.test(v)) tags.effectType = "draw";
    else if (/negate/.test(v)) tags.effectType = "negate";
    else if (/^(add|search)/.test(v) || /to your hand/.test(v)) tags.effectType = "search";
    else if (/send .* to the (gy|graveyard)/.test(v)) tags.effectType = "send_to_gy";
    else if (/destroy/.test(v)) tags.effectType = "destroy";
  }
  return tags;
}

export function parseCardText(desc) {
  if (!desc || typeof desc !== "string") return { summary: "", effects: [], tags: {} };
  let raw = desc.replace(/\r/g, "").replace(/[•]/g, "●");
  raw = stripNotes(raw).replace(/\s+/g, " ").trim();

  let effects = [];
  if (/\[\s*Pendulum Effect\s*\]/i.test(raw)) {
    const [pend, mon] = splitPendulum(raw);
    effects.push(...parseBox(pend, "Pendulum Effect"), ...parseBox(mon, "Monster Effect"));
  } else {
    effects.push(...parseBox(raw, null));
  }
  effects = effects.filter((g) => g.segments.length);

  const tags = extractTags(desc, effects);
  const firstEffect = effects.flatMap((g) => g.segments).find((s) => s.label === "effect");
  const summary = firstEffect ? firstEffect.text.replace(/\s+/g, " ").slice(0, 140) : "";

  return { summary, effects, tags };
}
