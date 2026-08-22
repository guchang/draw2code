export const CREATE_ACTIONS = [
  'start',
  'propose_question',
  'synthesize',
  'answer',
  'skip',
  'revise',
  'rename',
  'resume',
  'list',
  'confirm',
  'abandon',
  'archive',
] as const

export type CreateAction = typeof CREATE_ACTIONS[number]
