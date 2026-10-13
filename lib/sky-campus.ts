export type SkyCampusToolCard = {
  id: 'mr-citations' | 'rockstar-amc' | 'rockstar-patent-assistant';
  title: string;
  description: string;
  cost: string;
  processing: string;
  href: string;
};

export const SKY_CAMPUS_ENTRIES = {
  columbia: {
    id: 'columbia',
    name: 'Columbia',
    heading: 'Sky for Columbia students',
    description: 'A small set of free tools for organizing research, planning work, and preparing invention notes.',
    privacyUrl: 'https://avocadomini.si/privacy/',
    tools: [
      {
        id: 'mr-citations',
        title: 'Citations',
        description: 'Collect inline Markdown citations into a clear Sources section.',
        cost: 'Free',
        processing: 'Runs in your browser. Source text is not sent to external services.',
        href: '/sky/tools/mr-citations?lang=en&entry=columbia-card',
      },
      {
        id: 'rockstar-amc',
        title: 'AMC',
        description: 'Turn a goal into a reviewable plan with clear work and check points.',
        cost: 'Free',
        processing: 'Planning screen only. It does not call an LLM or paid external runner.',
        href: '/sky/tools/rockstar-amc?lang=en&entry=columbia-card',
      },
      {
        id: 'rockstar-patent-assistant',
        title: 'Patent Assistant',
        description: 'Create a local invention assessment and an English draft packet.',
        cost: 'Free',
        processing: 'The card entry creates a draft in your browser; online AI research is disabled.',
        href: '/sky/tools/rockstar-patent-assistant?lang=en&entry=columbia-card',
      },
    ] satisfies SkyCampusToolCard[],
  },
} as const;

export function isColumbiaCardEntry(value: unknown) {
  return value === 'columbia-card';
}
