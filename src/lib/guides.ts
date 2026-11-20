/**
 * Every guide in Lichess's Learn section.
 *
 * Lichess serves its lessons from its own interactive board app and sends
 * `X-Frame-Options: DENY`, so the lessons cannot be embedded here. CocoaChess
 * hosts the catalogue and sends you to the lesson itself.
 */

export interface GuideLesson {
  title: string;
  blurb: string;
  href: string;
}

export interface GuideGroup {
  id: string;
  title: string;
  kicker: string;
  intro: string;
  lessons: GuideLesson[];
}

const LEARN = 'https://lichess.org/learn#/';

function basics(): GuideLesson[] {
  const steps: [string, string][] = [
    ['The rook', 'It moves in straight lines'],
    ['The bishop', 'It moves diagonally'],
    ['The queen', 'Queen = rook + bishop'],
    ['The king', 'The most important piece'],
    ['The knight', 'It moves in an L shape'],
    ['The pawn', 'It moves forward only'],
    ['Capture', 'Take the enemy pieces'],
    ['Protection', 'Keep your pieces safe'],
    ['Combat', 'Capture and defend pieces'],
    ['Check in one', "Attack the opponent's king"],
    ['Out of check', 'Defend your king'],
    ['Mate in one', "Defeat the opponent's king"],
    ['Board setup', 'How the game starts'],
    ['Castling', 'The special king move'],
    ['En passant', 'The special pawn move'],
    ['Stalemate', 'The game is a draw'],
    ['Piece value', 'Evaluate piece strength'],
    ['Check in two', 'Two moves to give a check'],
  ];
  return steps.map(([title, blurb], index) => ({ title, blurb, href: `${LEARN}${index + 1}` }));
}

export const GUIDE_GROUPS: GuideGroup[] = [
  {
    id: 'basics',
    title: 'Chess basics',
    kicker: 'Start here',
    intro: 'Eighteen short chapters that teach the rules by making you play the moves. No reading required.',
    lessons: basics(),
  },
  {
    id: 'checkmates',
    title: 'Checkmates',
    kicker: 'Practice',
    intro: 'Mating patterns worth recognising on sight, from a lone queen to knight-and-bishop.',
    lessons: [
      {
        title: 'Piece Checkmates I',
        blurb: 'Basic checkmates',
        href: 'https://lichess.org/practice/checkmates/practicestnampiececheckmatesi/BJy6fEDf',
      },
      {
        title: 'Piece Checkmates II',
        blurb: 'Challenging checkmates',
        href: 'https://lichess.org/practice/checkmates/practicestnampiececheckmatesii/Rg2cMBZ6',
      },
      {
        title: 'Checkmate Patterns I',
        blurb: 'Recognise the patterns',
        href: 'https://lichess.org/practice/checkmates/practicestnamcheckmatepatternsi/fE4k21MW',
      },
      {
        title: 'Checkmate Patterns II',
        blurb: 'Recognise the patterns',
        href: 'https://lichess.org/practice/checkmates/practicestnamcheckmatepatternsii/8yadFPpU',
      },
      {
        title: 'Checkmate Patterns III',
        blurb: 'Recognise the patterns',
        href: 'https://lichess.org/practice/checkmates/practicestnamcheckmatepatternsiii/PDkQDt6u',
      },
      {
        title: 'Checkmate Patterns IV',
        blurb: 'Recognise the patterns',
        href: 'https://lichess.org/practice/checkmates/practicestnamcheckmatepatternsiv/96Lij7wH',
      },
      {
        title: 'Knight & Bishop Mate',
        blurb: 'Interactive lesson',
        href: 'https://lichess.org/practice/checkmates/practicestnamknightandbishopmate/ByhlXnmM',
      },
    ],
  },
  {
    id: 'tactics',
    title: 'Fundamental tactics',
    kicker: 'Practice',
    intro: 'The motifs behind most tactics you will meet in your own games.',
    lessons: [
      {
        title: 'The Pin',
        blurb: 'Pin it to win it',
        href: 'https://lichess.org/practice/fundamental-tactics/practicestnamthepin/9ogFv8Ac',
      },
      {
        title: 'The Skewer',
        blurb: 'Yum - skewers!',
        href: 'https://lichess.org/practice/fundamental-tactics/practicestnamtheskewer/tuoBxVE5',
      },
      {
        title: 'The Fork',
        blurb: 'Use the fork, Luke',
        href: 'https://lichess.org/practice/fundamental-tactics/practicestnamthefork/Qj281y1p',
      },
      {
        title: 'Discovered Attacks',
        blurb: 'Including discovered checks',
        href: 'https://lichess.org/practice/fundamental-tactics/practicestnamdiscoveredattacks/MnsJEWnI',
      },
      {
        title: 'Double Check',
        blurb: 'A very powerful tactic',
        href: 'https://lichess.org/practice/fundamental-tactics/practicestnamdoublecheck/RUQASaZm',
      },
      {
        title: 'Overloaded Pieces',
        blurb: 'They have too much work',
        href: 'https://lichess.org/practice/fundamental-tactics/practicestnamoverloadedpieces/o734CNqp',
      },
      {
        title: 'Zwischenzug',
        blurb: 'In-between moves',
        href: 'https://lichess.org/practice/fundamental-tactics/practicestnamzwischenzug/ITWY4GN2',
      },
      {
        title: 'X-Ray',
        blurb: 'Attacking through an enemy piece',
        href: 'https://lichess.org/practice/fundamental-tactics/practicestnamxray/lyVYjhPG',
      },
    ],
  },
  {
    id: 'advanced-tactics',
    title: 'Advanced tactics',
    kicker: 'Practice',
    intro: 'Sharper motifs: sacrifices, deflection and moves that are hard to see coming.',
    lessons: [
      {
        title: 'Zugzwang',
        blurb: 'Being forced to move',
        href: 'https://lichess.org/practice/advanced-tactics/practicestnamzugzwang/9cKgYrHb',
      },
      {
        title: 'Interference',
        blurb: 'Interpose a piece to great effect',
        href: 'https://lichess.org/practice/advanced-tactics/practicestnaminterference/g1fxVZu9',
      },
      {
        title: 'Greek Gift',
        blurb: 'Study the greek gift sacrifice',
        href: 'https://lichess.org/practice/advanced-tactics/practicestnamgreekgift/s5pLU7Of',
      },
      {
        title: 'Deflection',
        blurb: 'Distracting a defender',
        href: 'https://lichess.org/practice/advanced-tactics/practicestnamdeflection/kdKpaYLW',
      },
      {
        title: 'Attraction',
        blurb: 'Lure a piece to a bad square',
        href: 'https://lichess.org/practice/advanced-tactics/practicestnamattraction/jOZejFWk',
      },
      {
        title: 'Under promotion',
        blurb: 'Promote - but not to a queen!',
        href: 'https://lichess.org/practice/advanced-tactics/practicestnamunderpromotion/49fDW0wP',
      },
      {
        title: 'Desperado',
        blurb: 'A piece is lost, but it can still help',
        href: 'https://lichess.org/practice/advanced-tactics/practicestnamdesperado/0YcGiH4Y',
      },
      {
        title: 'Counter Check',
        blurb: 'Respond to a check with a check',
        href: 'https://lichess.org/practice/advanced-tactics/practicestnamcountercheck/CgjKPvxQ',
      },
      {
        title: 'Undermining',
        blurb: 'Remove the defending piece',
        href: 'https://lichess.org/practice/advanced-tactics/practicestnamundermining/udx042D6',
      },
      {
        title: 'Clearance',
        blurb: 'Get out of the way!',
        href: 'https://lichess.org/practice/advanced-tactics/practicestnamclearance/Grmtwuft',
      },
    ],
  },
  {
    id: 'pawn-endgames',
    title: 'Pawn endgames',
    kicker: 'Practice',
    intro: 'King and pawn endings decide a surprising number of games. Learn the few positions that matter.',
    lessons: [
      {
        title: 'Key Squares',
        blurb: 'Reach a key square',
        href: 'https://lichess.org/practice/pawn-endgames/practicestnamkeysquares/xebrDvFe',
      },
      {
        title: 'Opposition',
        blurb: 'Take the opposition',
        href: 'https://lichess.org/practice/pawn-endgames/practicestnamopposition/A4ujYOer',
      },
      {
        title: '7th-Rank Rook Pawn',
        blurb: 'Versus a Queen',
        href: 'https://lichess.org/practice/pawn-endgames/practicestnam7thrankrookpawn/pt20yRkT',
      },
    ],
  },
  {
    id: 'rook-endgames',
    title: 'Rook endgames',
    kicker: 'Practice',
    intro: 'The most common endgame type in chess, and the one where practical knowledge pays best.',
    lessons: [
      {
        title: 'Basic Rook Endgames',
        blurb: 'Lucena and Philidor',
        href: 'https://lichess.org/practice/rook-endgames/practicestnambasicrookendgames/pqUSUw8Y',
      },
      {
        title: 'Intermediate Rook Endings',
        blurb: 'Broaden your knowledge',
        href: 'https://lichess.org/practice/rook-endgames/practicestnamintermediaterookendings/heQDnvq7',
      },
      {
        title: 'Practical Rook Endings',
        blurb: 'Rook endings with several pawns',
        href: 'https://lichess.org/practice/rook-endgames/practicestnampracticalrookendings/wS23j5Tm',
      },
    ],
  },
  {
    id: 'trainers',
    title: 'Trainers',
    kicker: 'Every day',
    intro: 'Short, repeatable drills that build board vision faster than reading about it.',
    lessons: [
      {
        title: 'Coordinates',
        blurb: 'Name any square without thinking',
        href: 'https://lichess.org/training/coordinate',
      },
      {
        title: 'Puzzle themes',
        blurb: 'Drill one motif at a time',
        href: 'https://lichess.org/training/themes',
      },
      {
        title: 'Puzzle streak',
        blurb: 'One puzzle a day, no mistakes allowed',
        href: 'https://lichess.org/streak',
      },
      {
        title: 'Study',
        blurb: 'Community-written studies and courses',
        href: 'https://lichess.org/study',
      },
    ],
  },
];

export const GUIDE_COUNT = GUIDE_GROUPS.reduce((total, group) => total + group.lessons.length, 0);
