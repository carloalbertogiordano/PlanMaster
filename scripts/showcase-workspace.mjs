// Writes a small invented project, used for the pictures in the README.
// Times are given as minutes before `now`, so that the durations the view shows ("for 2 h") are believable
// whenever the pictures are taken.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const pad = (n) => String(n).padStart(2, '0');

function stamp(now, minutesAgo) {
  const d = new Date(now - minutesAgo * 60_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const HOUR = 60;
const DAY = 24 * HOUR;

/** Each lane: ID, title and the items; `since` and `done` are minutes ago. */
function lanes(t) {
  return [
    ['A', 'Card engine: effects, rules and tests', [
      `- [~] A-12 Resolve chained card effects in priority order since:${t(95)}`,
      `  - [x] A-12a Define the effect stack interface done:${t(70)}`,
      `  - [~] A-12b Run the stack until it is empty since:${t(40)}`,
      '  - [ ] A-12c Add property tests for effect ordering',
      '- [ ] A-13 Support the Frostbound expansion cards ref:DESIGN-31',
      `- [!] A-14 Settle the tie-break for simultaneous triggers wait:carol since:${t(DAY + 3 * HOUR)}`,
      `- [x] A-11 Fix the double draw at the end of a round done:${t(3 * HOUR)}`,
      `- [x] A-10 Replace the shuffle with a seeded one done:${t(2 * DAY)}`,
    ]],
    ['B', 'Mobile app: lobby and matchmaking', [
      `- [~] B-05 Lobby screen with a live player list ref:DESIGN-28 since:${t(150)}`,
      `  - [x] B-05a Connect the room list to the socket done:${t(100)}`,
      `  - [~] B-05b Show a reconnecting banner when the socket drops since:${t(30)}`,
      '  - [ ] B-05c Draw the empty and full room states',
      '- [ ] B-06 Invite links that open the app directly',
      '- [ ] B-07 Limit how often a player can create rooms',
      `- [x] B-04 Splash screen animation done:${t(DAY + 2 * HOUR)}`,
    ]],
    ['C', 'Art pipeline and asset export', [
      `- [~] C-03 Export the card art at three screen densities since:${t(50)}`,
      `- [!] C-04 Final illustrations for the Frostbound set wait:bob since:${t(2 * DAY)}`,
      '- [ ] C-05 Compress the sprite sheets under 2 MB',
      `- [x] C-01 Name and number the card files done:${t(2 * DAY + 5 * HOUR)}`,
      `- [-] C-02 Hand-drawn card borders ref:DESIGN-22 done:${t(5 * DAY)}`,
    ]],
    ['D', 'Playtest feedback and balance', [
      `- [~] D-08 Rebalance the three weakest heroes since:${t(60)}`,
      '  - [ ] D-08a Raise the Ember Witch starting hand to five',
      '  - [ ] D-08b Cap the Warden shield at three',
      `- [!] D-09 Rerun the four-player test after the rule change wait:alice since:${t(5 * HOUR)}`,
      '- [ ] D-10 Write the summary of the Saturday session ref:NOTES-12',
      `- [x] D-07 Collect the forms from the Saturday session done:${t(DAY + 4 * HOUR)}`,
    ]],
    ['E', 'Website and launch checklist', [
      `- [~] E-04 Write the store page text since:${t(35)}`,
      '- [ ] E-05 Record a 30 second trailer ref:NOTES-15',
      '- [ ] E-06 Set up the press kit download',
      `- [x] E-03 Register the domain done:${t(DAY + 6 * HOUR)}`,
    ]],
  ];
}

export function writeShowcaseWorkspace(dir, now = Date.now()) {
  const root = path.join(dir, '.planmaster');
  mkdirSync(path.join(root, 'lanes'), { recursive: true });
  writeFileSync(path.join(root, 'config.json'), JSON.stringify({
    format: 1,
    people: ['alice', 'bob', 'carol'],
    staleAfterMinutes: 120,
    doneVisibleDays: 3,
    archiveAfterDays: 14,
  }, null, 2));
  for (const [id, title, items] of lanes((minutesAgo) => stamp(now, minutesAgo))) {
    writeFileSync(path.join(root, 'lanes', `${id}.md`), `---\nformat: 1\nlane: ${id}\ntitle: ${title}\n---\n\n${items.join('\n')}\n`);
  }
}
