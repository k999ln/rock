import { CAMPUSES, CAMPUS_IDS, type CampusId } from './campus.ts';

export type CampusStarter = {
  title: string;
  description: string;
  kind: string;
  fields: [string, string, string];
  prompts: [string, string, string];
  mode: string;
};
export const CAMPUS_STARTERS: Record<CampusId, CampusStarter> = {
  nyu: {
    title: 'Make your next project happen.',
    description:
      'Shape a film, an AI experiment, or a startup with a clear brief.',
    kind: 'Creative project brief',
    fields: ['The idea', 'Who you need', 'Your first milestone'],
    prompts: [
      'A short film, AI prototype, or startup…',
      'An editor, designer, developer…',
      'What could you make together this week?',
    ],
    mode: 'creative',
  },
  fit: {
    title: 'Give your work a point of view.',
    description:
      'Turn a collection, shoot, or brand idea into a portfolio-ready plan.',
    kind: 'Creative direction brief',
    fields: [
      'Concept & audience',
      'Visual direction & deliverables',
      'Collaborators & next step',
    ],
    prompts: [
      'Who is this collection or campaign for?',
      'Mood, materials, formats, and pieces…',
      'Stylist, photographer, model, and first shoot…',
    ],
    mode: 'creative',
  },
  columbia: {
    title: 'Start with a better question.',
    description:
      'Build a research plan with evidence, collaborators, and a concrete next step.',
    kind: 'Research brief',
    fields: [
      'Research question',
      'Sources & evidence to check',
      'Method & next milestone',
    ],
    prompts: [
      'What do you want to understand?',
      'Citations, datasets, and gaps to investigate…',
      'How will you test it, and with whom?',
    ],
    mode: 'research',
  },
  fordham: {
    title: 'Turn purpose into a project.',
    description:
      'Plan a community initiative, career project, or student venture.',
    kind: 'Community project brief',
    fields: [
      'Purpose & community',
      'People & resources',
      'First action & success measure',
    ],
    prompts: [
      'Who will this help, and how?',
      'Partners, skills, and resources you need…',
      'A practical first step and how to measure it…',
    ],
    mode: 'career',
  },
  johnjay: {
    title: 'Make a case for change.',
    description:
      'Structure a civic-tech or policy project around evidence and impact.',
    kind: 'Civic project brief',
    fields: [
      'Problem & affected community',
      'Evidence & open questions',
      'Proposed action & impact',
    ],
    prompts: [
      'Describe a public-interest problem…',
      'Public sources and assumptions to verify…',
      'What can your team test or build?',
    ],
    mode: 'justice',
  },
};
export const CAMPUS_TASK_EXAMPLES: Record<CampusId, { label: string; prompt: string }[]> = {
  nyu: [
    { label: 'Film collaboration', prompt: 'I am making a short documentary about student housing. Help me scope the shoot, define roles for an editor and researcher, and plan a first week.' },
    { label: 'AI prototype', prompt: 'I want to prototype an accessibility tool for New York students. Help me compare two approaches, define a small test, and identify the collaborators I need.' },
    { label: 'Student event', prompt: 'I want to organize a student founder meetup. Help me plan the format, outreach, venue questions, and a realistic first milestone.' },
  ],
  fit: [
    { label: 'Portfolio shoot', prompt: 'I have a three-look sustainable fashion collection. Help me build a portfolio shoot brief with styling, crew roles, deliverables, and a first production day.' },
    { label: 'Creative team', prompt: 'I want to make a streetwear campaign. Help me define the visual direction and a collaboration brief for a photographer, model, and stylist.' },
    { label: 'Brand case study', prompt: 'Help me organize a client-ready branding case study: concept, audience, design decisions, visual evidence, and what to improve next.' },
  ],
  columbia: [
    { label: 'Research plan', prompt: 'I want to study urban heat and housing. Help me frame a research question, identify public datasets, set evidence criteria, and plan a first milestone.' },
    { label: 'Policy analysis', prompt: 'Help me turn a policy question into testable hypotheses, a source-review checklist, and a clear list of open assumptions.' },
    { label: 'Research team', prompt: 'I am starting an interdisciplinary research project. Help me define collaborator roles, methods, deliverables, and an initial work plan.' },
  ],
  fordham: [
    { label: 'Community project', prompt: 'I want to launch a community project in New York. Help me define whom it serves, the partners needed, a first pilot, and how to measure progress.' },
    { label: 'Career project', prompt: 'Help me turn my interests and skills into a focused internship search plan with a portfolio story and outreach milestones.' },
    { label: 'Student venture', prompt: 'I have a student venture idea. Help me test the problem, find a small group of collaborators, and plan a low-cost first experiment.' },
  ],
  johnjay: [
    { label: 'Civic-tech pilot', prompt: 'I want to prototype a civic-tech tool for a public-interest problem. Help me define affected users, evidence, safeguards, and a limited pilot.' },
    { label: 'Policy source review', prompt: 'Help me organize a policy source review: the question, primary sources to verify, competing interpretations, and unanswered points.' },
    { label: 'Public-service team', prompt: 'I want to form a student team around a justice project. Help me define roles, community input, measurable outcomes, and a first meeting.' },
  ],
};
export const CAMPUS_TOOL_STARTERS: Record<CampusId, { id: 'mr-free-article' | 'mr-citations' | 'rockstar-patent-assistant' | 'rockstar-legal-intake' | 'fashion-brand-ops' | 'coconala'; label: string; use: string }[]> = {
  nyu: [
    { id: 'mr-free-article', label: 'Shape a story', use: 'Prepare a shareable version of your writing.' },
    { id: 'mr-citations', label: 'Organize sources', use: 'Make research links easier to review.' },
    { id: 'rockstar-patent-assistant', label: 'Develop an invention', use: 'Draft an invention packet in your browser.' },
  ],
  fit: [
    { id: 'mr-free-article', label: 'Build your editorial', use: 'Prepare a shareable story for your work.' },
    { id: 'mr-citations', label: 'Credit your references', use: 'Organize research links for a project.' },
    { id: 'fashion-brand-ops', label: 'Plan a brand', use: 'Try the browser brand-operations flow.' },
  ],
  columbia: [
    { id: 'mr-citations', label: 'Review citations', use: 'Organize source links for research.' },
    { id: 'rockstar-patent-assistant', label: 'Draft invention notes', use: 'Prepare a local invention assessment.' },
    { id: 'mr-free-article', label: 'Share a finding', use: 'Prepare a public version of your writing.' },
  ],
  fordham: [
    { id: 'mr-free-article', label: 'Tell the story', use: 'Prepare a shareable project article.' },
    { id: 'mr-citations', label: 'Check your sources', use: 'Keep the evidence links together.' },
    { id: 'coconala', label: 'Review a project', use: 'Check a client opportunity before committing.' },
  ],
  johnjay: [
    { id: 'mr-citations', label: 'Track evidence', use: 'Organize policy and civic source links.' },
    { id: 'rockstar-legal-intake', label: 'Frame a legal question', use: 'Prepare a private local intake draft.' },
    { id: 'mr-free-article', label: 'Explain an idea', use: 'Prepare a shareable public summary.' },
  ],
};
export function campusSkyPath(campus: CampusId) {
  return `/sky/campus/${campus}`;
}
export function findCampus(value: string) {
  return CAMPUS_IDS.includes(value as CampusId)
    ? CAMPUSES[value as CampusId]
    : null;
}
export function buildCampusBrief(campus: CampusId, values: string[]) {
  const starter = CAMPUS_STARTERS[campus];
  if (
    values.length !== 3 ||
    values.some(
      (value) =>
        typeof value !== 'string' || !value.trim() || value.length > 500,
    )
  )
    throw new Error('Complete all three fields (up to 500 characters each).');
  return `${starter.kind} · ${CAMPUSES[campus].shortName}\n\n${starter.fields.map((field, i) => `${field}\n${values[i].trim()}`).join('\n\n')}`;
}
