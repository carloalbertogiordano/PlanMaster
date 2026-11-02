import { DEFAULT_CONFIG, type Analysis } from '../core/index.js';
import { fillTemplate, lanesText, peopleText } from './prompts.js';
import type { SetupAssessment } from './setup.js';

/** The one prompt of the guided setup, filled in with the state of the project. */
export function buildSetupPrompt(template: string, assessment: SetupAssessment, analysis: Analysis | undefined): string {
  const config = analysis?.config ?? DEFAULT_CONFIG;
  return fillTemplate(template, {
    SITUATION: situationOf(assessment),
    LANES: analysis ? lanesText(analysis) : '(no lanes yet)',
    PEOPLE: peopleText(config.people),
    DONE_WINDOW_DAYS: String(config.doneVisibleDays),
  });
}

function situationOf({ headline, problems }: SetupAssessment): string {
  if (problems.length === 0) return headline;
  return [headline, 'Problems found:', ...problems.map((problem) => `- ${problem}`)].join('\n');
}
