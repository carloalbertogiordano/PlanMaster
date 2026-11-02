import * as vscode from 'vscode';
import { assessSetup, shouldOfferSetup, type SetupAssessment, type UserInterface } from '../app/index.js';
import type { WorkspaceInstance } from './instance.js';
import { uriOf } from './uris.js';
import { VsCodeWorkspaceFiles } from './workspace-files.js';

const NOW = 'Set up now';
const LATER = 'Not now';
const NEVER = 'Don’t ask again';

export interface CoordinatorDeps {
  storage: vscode.Memento;
  instanceFor(folder: vscode.WorkspaceFolder): WorkspaceInstance | undefined;
  createUi(folder: vscode.WorkspaceFolder): UserInterface;
  /** Starts the guided setup for a folder. */
  runSetup(folder: vscode.WorkspaceFolder): Promise<unknown>;
  /** Called when the assessment of a folder changed, so that the view can be redrawn. */
  onChange(): void;
  log(message: string): void;
}

/**
 * Keeps, for every workspace folder, an up-to-date answer to "does this
 * project need the guided setup?", and mentions it to the user once.
 */
export class SetupCoordinator {
  private readonly deps: CoordinatorDeps;
  private readonly assessments = new Map<string, SetupAssessment>();
  private readonly sequence = new Map<string, number>();
  private readonly offered = new Set<string>();

  constructor(deps: CoordinatorDeps) {
    this.deps = deps;
  }

  assessmentFor(folder: vscode.WorkspaceFolder): SetupAssessment | undefined {
    return this.assessments.get(folder.uri.toString());
  }

  /** Forgets what was already offered in this session, so that the offer can be made again. */
  resetOffers(): void {
    this.offered.clear();
  }

  /** Looks at the project again; redraws the view if the answer changed and offers setup if it helps. */
  async evaluate(folder: vscode.WorkspaceFolder): Promise<void> {
    const key = folder.uri.toString();
    const turn = (this.sequence.get(key) ?? 0) + 1;
    this.sequence.set(key, turn);

    const instance = this.deps.instanceFor(folder);
    const files = new VsCodeWorkspaceFiles(folder.uri);
    const configError = instance?.configError;
    const assessment = assessSetup({
      hasWorkspaceDir: instance !== undefined || (await exists(folder, '.planmaster')),
      analysis: instance?.analysis,
      claudeMd: await files.read('CLAUDE.md'),
      ...(configError === undefined ? {} : { configError }),
    });
    if (this.sequence.get(key) !== turn) return;

    const changed = JSON.stringify(this.assessments.get(key)) !== JSON.stringify(assessment);
    this.assessments.set(key, assessment);
    if (changed) this.deps.onChange();
    // The offer waits for the user, possibly for ever, so it must not hold up whoever asked for the assessment.
    void this.offerIfUseful(folder, assessment).catch((error: unknown) => { this.deps.log(`PlanMaster: ${error instanceof Error ? error.message : String(error)}`); });
  }

  private async offerIfUseful(folder: vscode.WorkspaceFolder, assessment: SetupAssessment): Promise<void> {
    const key = folder.uri.toString();
    const dismissedForever = this.deps.storage.get<boolean>(dismissalKey(key)) === true;
    const looksLikeClaudeProject = (await exists(folder, 'CLAUDE.md')) || (await exists(folder, '.claude'));
    if (!shouldOfferSetup(assessment, { dismissedForever, offeredThisSession: this.offered.has(key), looksLikeClaudeProject })) return;

    this.offered.add(key);
    const choice = await this.deps.createUi(folder).offer(`${assessment.headline} ${assessment.detail}`, [NOW, LATER, NEVER]);
    if (choice === NOW) await this.deps.runSetup(folder);
    else if (choice === NEVER) await this.deps.storage.update(dismissalKey(key), true);
  }
}

const dismissalKey = (folderKey: string): string => `planmaster.setupDismissed:${folderKey}`;

async function exists(folder: vscode.WorkspaceFolder, path: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uriOf(folder.uri, path));
    return true;
  } catch {
    return false;
  }
}
