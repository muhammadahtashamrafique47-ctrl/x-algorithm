/**
 * Deterministic text/NLP primitives shared by the SEO engine.
 *
 * No network, no external model weights: everything here is pure functions so
 * results are reproducible across runs, markets and CI.
 */

export const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "than", "so", "as", "of", "at", "by", "for",
  "with", "about", "against", "between", "into", "through", "during", "before", "after", "above",
  "below", "to", "from", "up", "down", "in", "out", "on", "off", "over", "under", "again",
  "further", "once", "here", "there", "when", "where", "why", "how", "all", "any", "both", "each",
  "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same",
  "too", "very", "s", "t", "just", "don", "now", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "having", "do", "does", "did", "doing", "would", "should",
  "could", "will", "shall", "can", "may", "might", "must", "it", "its", "this", "that", "these",
  "those", "i", "you", "he", "she", "we", "they", "them", "his", "her", "our", "your", "their",
]);

export function lower(input: string): string {
  return (input ?? "").toLowerCase();
}

export function tokenize(input: string): string[] {
  return lower(input)
    .replace(/[^a-z0-9\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function contentWords(input: string): string[] {
  return tokenize(input).filter((w) => !STOPWORDS.has(w) && w.length > 1);
}

/** Lightweight suffix-stripping stemmer (Porter-inspired, deterministic). */
export function stem(word: string): string {
  let w = lower(word).trim();
  if (w.length <= 3) return w;
  const rules: [RegExp, string][] = [
    [/(ies)$/i, "y"], [/(sses)$/i, "ss"], [/(ves)$/i, "f"], [/(eed)$/i, "ee"],
    [/(ing)$/i, ""], [/(edly)$/i, ""], [/(ed)$/i, ""], [/(ly)$/i, ""],
    [/(ness)$/i, ""], [/(ment)$/i, ""], [/(ation)$/i, "ate"], [/(tion)$/i, "t"],
    [/(hood)$/i, ""], [/(ful)$/i, ""], [/(est)$/i, ""], [/(er)$/i, ""],
  ];
  for (const [re, rep] of rules) {
    if (re.test(w) && w.replace(re, rep).length >= 3) {
      w = w.replace(re, rep);
      break;
    }
  }
  if (/(.)\1{2,}$/.test(w)) w = w.replace(/(.)\1{2,}$/, "$1$1");
  if (/(ss)$/.test(w) === false && /(s)$/.test(w) && !/(us|is)$/.test(w)) w = w.replace(/s$/, "");
  return w;
}

export function slugify(input: string, maxLen = 64): string {
  const slug = lower(input)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen)
    .replace(/-+$/g, "");
  return slug || "product";
}

export function ngrams(tokens: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(" "));
  return out;
}

export function sentences(text: string): string[] {
  return (text ?? "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

function countSyllables(word: string): number {
  const w = lower(word).replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

/** Flesch Reading Ease (0-100, higher = easier). */
export function readingEase(text: string): number {
  const words = tokenize(text);
  const sents = sentences(text);
  if (!words.length || !sents.length) return 0;
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const score =
    206.835 - 1.015 * (words.length / sents.length) - 84.6 * (syllables / words.length);
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

export function wordCount(text: string): number {
  return tokenize(text).length;
}

export function avgSentenceLength(text: string): number {
  const s = sentences(text);
  return s.length ? Math.round((wordCount(text) / s.length) * 10) / 10 : 0;
}

/** Keyword density as a percentage of total tokens. */
export function density(text: string, term: string): number {
  const tokens = tokenize(text);
  if (!tokens.length) return 0;
  const termTokens = tokenize(term);
  if (termTokens.length === 1) {
    const hits = tokens.filter((t) => stem(t) === stem(termTokens[0])).length;
    return (hits / tokens.length) * 100;
  }
  const needle = termTokens.map(stem).join(" ");
  const hay = tokens.map(stem).join(" ");
  const hits = hay.split(needle).length - 1;
  return (hits * termTokens.length) / tokens.length * 100;
}

export function termFrequency(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of tokens) {
    const s = stem(t);
    freq.set(s, (freq.get(s) ?? 0) + 1);
  }
  return freq;
}

export function tfidfVector(text: string, idf: Map<string, number>): Map<string, number> {
  const tokens = contentWords(text);
  const tf = termFrequency(tokens);
  const vec = new Map<string, number>();
  const max = Math.max(1, ...tf.values());
  for (const [term, count] of tf) {
    vec.set(term, (count / max) * (idf.get(term) ?? Math.log(2)));
  }
  return vec;
}

export function buildIdf(documents: string[]): Map<string, number> {
  const N = Math.max(1, documents.length);
  const df = new Map<string, number>();
  for (const doc of documents) {
    const seen = new Set(contentWords(doc).map(stem));
    for (const term of seen) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [term, count] of df) idf.set(term, Math.log(1 + N / count));
  return idf;
}

export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  if (!a.size || !b.size) return 0;
  let dot = 0;
  for (const [term, weight] of a) {
    const other = b.get(term);
    if (other) dot += weight * other;
  }
  const norm = (v: Map<string, number>) => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0));
  const na = norm(a);
  const nb = norm(b);
  return na && nb ? dot / (na * nb) : 0;
}

/** FNV-1a 32-bit — used for stable, dependency-free fingerprinting. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function shortHash(input: string, len = 10): string {
  return hashString(input).toString(36).padStart(7, "0").slice(0, len);
}

/** Stable pseudo-random in [0,1) derived from a seed string. */
export function seededRandom(seed: string): number {
  return (hashString(seed) % 100000) / 100000;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function round(value: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function titleCase(input: string): string {
  return input
    .split(/\s+/)
    .map((w, i) => {
      if (i > 0 && STOPWORDS.has(w) && w.length < 5) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

/** Trim a string to a target pixel-ish budget using character counts (SERP-safe). */
export function truncateToChars(input: string, max: number): string {
  const clean = (input ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).replace(/[,\-–—|]+$/, "")}…`;
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

export function pct(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0;
}

/** Levenshtein distance — used for typo/near-duplicate detection in search logs. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = curr;
  }
  return prev[n];
}
