const INTENT_RULES = [
  {
    id: "translate",
    patterns: [/\btranslate\b/i, /\btranslation\b/i, /បកប្រែ/u]
  },
  {
    id: "summarize",
    patterns: [/\bsummar(?:y|ize|ise)\b/i, /សង្ខេប/u]
  },
  {
    id: "rewrite",
    patterns: [
      /\brewrite\b/i,
      /\brephrase\b/i,
      /\bpolish\b/i,
      /សរសេរឡើងវិញ/u,
      /កែសម្រួល/u
    ]
  },
  {
    id: "continue_story",
    patterns: [
      /\bcontinue\b/i,
      /\bnext chapter\b/i,
      /\bnext scene\b/i,
      /បន្តរឿង/u,
      /បន្តជំពូក/u,
      /បន្តឈុត/u
    ]
  },
  {
    id: "create_character",
    patterns: [
      /\bcreate (?:a )?character\b/i,
      /\bcharacter profile\b/i,
      /បង្កើតតួអង្គ/u,
      /ប្រវត្តិតួអង្គ/u
    ]
  },
  {
    id: "create_outline",
    patterns: [
      /\boutline\b/i,
      /\bstory plan\b/i,
      /\bchapter plan\b/i,
      /គ្រោងរឿង/u,
      /គ្រោងជំពូក/u
    ]
  },
  {
    id: "check_continuity",
    patterns: [
      /\bcontinuity\b/i,
      /\binconsisten(?:cy|t)\b/i,
      /\bplot hole\b/i,
      /ភាពស៊ីសង្វាក់/u,
      /ខុសគ្នាក្នុងសាច់រឿង/u,
      /ចន្លោះសាច់រឿង/u
    ]
  },
  {
    id: "question_about_story",
    patterns: [
      /\bwhat happened\b/i,
      /\bwho is\b/i,
      /\bwhy did\b/i,
      /ក្នុងរឿង/u,
      /តួអង្គណា/u,
      /ហេតុអ្វីតួ/u
    ]
  },
  {
    id: "write_story",
    patterns: [
      /\bwrite (?:a )?(?:story|scene|chapter|novel)\b/i,
      /\bcreate (?:a )?(?:story|scene|chapter|novel)\b/i,
      /សរសេររឿង/u,
      /សរសេរជំពូក/u,
      /សរសេរឈុត/u,
      /បង្កើតរឿង/u
    ]
  }
];

const INTENT_INSTRUCTIONS = {
  normal_chat:
    "Answer naturally and directly. Use remembered preferences only when they are relevant.",
  write_story:
    "Create polished story prose. Preserve established names, facts, point of view, tone, relationships, and story rules.",
  continue_story:
    "Continue from the latest established scene without restarting or contradicting prior events. Preserve pacing and unresolved threads.",
  rewrite:
    "Rewrite only the requested material while preserving meaning, names, facts, point of view, and constraints unless the user asks to change them.",
  summarize: [
    "Create a selective summary, not a rewrite or scene-by-scene retelling.",
    "Keep only the central events, decisions, facts, causes, outcomes, and unresolved points.",
    "Aim for roughly 15 to 25 percent of the source length unless the user requests another size.",
    "Do not copy full paragraphs from the source.",
    "Remove repetition, decorative wording, most dialogue, examples, and minor details unless they are essential.",
    "Use concise sections or bullets when they improve clarity.",
    "Separate confirmed facts from interpretation and never invent missing events."
  ].join(" "),
  translate:
    "Translate faithfully into the requested language while preserving names, tone, formatting, and story meaning.",
  create_character:
    "Create a consistent character profile with role, motivation, personality, relationships, strengths, flaws, and story function.",
  create_outline:
    "Create a structured outline with clear progression, turning points, conflicts, and continuity with known story facts.",
  check_continuity:
    "Act as a continuity editor. Identify contradictions, timeline problems, name changes, relationship conflicts, and unresolved plot logic.",
  question_about_story:
    "Answer from supplied conversation and remembered story facts. Clearly say when the available story context does not contain the answer."
};

export function detectChatIntent(message) {
  const text = typeof message === "string" ? message.trim() : "";

  if (!text) {
    return "normal_chat";
  }

  for (const rule of INTENT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule.id;
    }
  }

  return "normal_chat";
}

export function getIntentInstruction(intent) {
  return INTENT_INSTRUCTIONS[intent] || INTENT_INSTRUCTIONS.normal_chat;
}
