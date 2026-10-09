import type { Representation } from '@foldkit-mde/core/plugins'

export const markdown: Representation<string> = { id: 'markdown', project: (source) => source }
