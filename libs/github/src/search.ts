import { searchTerms } from "@lib/db-models";

// Whether `text` holds every word of `q`, ignoring case: how an autocomplete
// narrows a list GitHub cannot search for it.
export function matchesEveryWord(text: string, q: string): boolean {
  const haystack = text.toLowerCase();
  return searchTerms(q).every((word) => haystack.includes(word.toLowerCase()));
}
