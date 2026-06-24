import { DecisionComparison } from "./types";

export class DecisionComparator {
  constructor() {}

  /**
   * Compares two decision outcomes. Matches intents, actions, and calculates similarity.
   */
  public compare(decisionA: string, decisionB: string): DecisionComparison {
    if (!decisionA || !decisionB) {
      return {
        similarityScore: 0,
        intentMatch: false,
        actionMatch: false,
        rawDiff: "One or both decisions are empty."
      };
    }

    const cleanA = decisionA.toLowerCase().trim();
    const cleanB = decisionB.toLowerCase().trim();

    // 1. Text Similarity Score: Word overlap coefficient
    const wordsA = cleanA.split(/\s+/).filter(w => w.length > 2);
    const wordsB = cleanB.split(/\s+/).filter(w => w.length > 2);
    
    let matches = 0;
    for (const w of wordsA) {
      if (cleanB.includes(w)) matches++;
    }

    const totalWords = Math.max(1, Array.from(new Set([...wordsA, ...wordsB])).length);
    const similarity = matches / totalWords;

    // 2. Intent Overlap Match Heuristics
    const intents = ["billing", "appointment", "booking", "support", "escalate", "refund"];
    let intentMatch = false;

    for (const intent of intents) {
      if (cleanA.includes(intent) && cleanB.includes(intent)) {
        intentMatch = true;
        break;
      }
    }
    
    // Default intent match if texts are identical
    if (cleanA === cleanB) {
      intentMatch = true;
    }

    // 3. Action Matching Heuristics
    const actionKeywords = ["execute", "schedule", "db", "write", "call", "escalate", "alert"];
    let actionMatch = false;

    for (const keyword of actionKeywords) {
      if (cleanA.includes(keyword) && cleanB.includes(keyword)) {
        actionMatch = true;
        break;
      }
    }

    if (cleanA === cleanB) {
      actionMatch = true;
    }

    // 4. Raw Diff
    const rawDiff = cleanA === cleanB 
      ? "Decisions are identical." 
      : `Diff: A=[${decisionA}] | B=[${decisionB}]`;

    return {
      similarityScore: Math.round(similarity * 100) / 100,
      intentMatch,
      actionMatch,
      rawDiff
    };
  }
}
