export const FREE_SPACE = "FREE" as const;
export type CardCell = number | typeof FREE_SPACE;
export type Card = CardCell[][];
export type BingoPattern = "ROW" | "COLUMN" | "DIAGONAL" | "FOUR CORNERS" | null;
export type CheckBingoResult = {
  isBingo: boolean;
  pattern: BingoPattern;
};

const GRID_SIZE = 5;
const MAX_NUMBER = 75;
const CENTER_INDEX = 2;
const COLUMN_RANGES = [
  [1, 15],
  [16, 30],
  [31, 45],
  [46, 60],
  [61, 75],
] as const;

function shuffleNumbers(numbers: number[]) {
  const shuffled = [...numbers];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function buildColumn(start: number, end: number, count: number) {
  return shuffleNumbers(
    Array.from({ length: end - start + 1 }, (_, index) => start + index),
  )
    .slice(0, count)
    .sort((left, right) => left - right);
}

function isMarked(value: CardCell, calledSet: Set<number>) {
  return value === FREE_SPACE || calledSet.has(value);
}

function hasCompleteLine(line: CardCell[], calledSet: Set<number>) {
  return line.every((value) => isMarked(value, calledSet));
}

function getColumn(card: Card, columnIndex: number) {
  return card.map((row) => row[columnIndex]);
}

function getDiagonals(card: Card) {
  const main = card.map((row, index) => row[index]);
  const anti = card.map((row, index) => row[GRID_SIZE - 1 - index]);
  return [main, anti];
}

export function createShuffledNumbers(): number[] {
  return shuffleNumbers(
    Array.from({ length: MAX_NUMBER }, (_, index) => index + 1),
  );
}

export function generateCard(): Card {
  const columns = COLUMN_RANGES.map(([start, end], columnIndex) => {
    if (columnIndex !== CENTER_INDEX) return buildColumn(start, end, GRID_SIZE);

    const values = buildColumn(start, end, GRID_SIZE - 1);
    return [
      values[0],
      values[1],
      FREE_SPACE,
      values[2],
      values[3],
    ] satisfies CardCell[];
  });

  return Array.from({ length: GRID_SIZE }, (_, rowIndex) =>
    columns.map((column) => column[rowIndex]),
  );
}

export function drawNextNumber(
  remainingNumbers: number[],
  calledNumbers: number[],
): {
  remainingNumbers: number[];
  calledNumbers: number[];
  drawnNumber: number | null;
} {
  if (remainingNumbers.length === 0) {
    return {
      remainingNumbers: [...remainingNumbers],
      calledNumbers: [...calledNumbers],
      drawnNumber: null,
    };
  }

  const [drawnNumber, ...nextRemainingNumbers] = remainingNumbers;
  return {
    remainingNumbers: nextRemainingNumbers,
    calledNumbers: [...calledNumbers, drawnNumber],
    drawnNumber,
  };
}

export function checkBingo(card: Card, calledNumbers: number[]): CheckBingoResult {
  const calledSet = new Set(calledNumbers);

  if (card.some((row) => hasCompleteLine(row, calledSet))) {
    return { isBingo: true, pattern: "ROW" };
  }
  if (
    Array.from({ length: GRID_SIZE }, (_, index) => getColumn(card, index)).some(
      (column) => hasCompleteLine(column, calledSet),
    )
  ) {
    return { isBingo: true, pattern: "COLUMN" };
  }
  if (getDiagonals(card).some((line) => hasCompleteLine(line, calledSet))) {
    return { isBingo: true, pattern: "DIAGONAL" };
  }

  const corners = [card[0][0], card[0][4], card[4][0], card[4][4]];
  if (hasCompleteLine(corners, calledSet)) {
    return { isBingo: true, pattern: "FOUR CORNERS" };
  }
  return { isBingo: false, pattern: null };
}

/*
const card = generateCard();
const shuffledNumbers = createShuffledNumbers();
const drawResult = drawNextNumber(shuffledNumbers, []);
const rowWin = checkBingo(
  [
    [1, 16, 31, 46, 61],
    [2, 17, 32, 47, 62],
    [3, 18, FREE_SPACE, 48, 63],
    [4, 19, 33, 49, 64],
    [5, 20, 34, 50, 65],
  ],
  [3, 18, 48, 63],
);
const fourCornersWin = checkBingo(
  [
    [1, 16, 31, 46, 61],
    [2, 17, 32, 47, 62],
    [3, 18, FREE_SPACE, 48, 63],
    [4, 19, 33, 49, 64],
    [5, 20, 34, 50, 65],
  ],
  [1, 61, 5, 65],
);
*/
