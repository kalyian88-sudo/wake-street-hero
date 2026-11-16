/**
 * НАДБАВКИ И ПРОЦЕНТЫ к очкам трюков. Меняй числа — логика (src/tricks/resolve.ts) подхватит.
 * Сами трюки, их названия и базовые очки — в src/data/tricks.ts.
 */
import type { RailStance } from '../types';

export const TRICK_TUNING = {
  /** Длинный грэб: до +60% к очкам грэба, если держать grabHoldFull секунд. */
  grabHoldBonus: 0.6,
  grabHoldFull: 1.0,
  /** Множитель очков инверта за количество оборотов: 1, дабл, трипл (если для дабла нет своей строки в таблице). */
  invertCount: [1, 2.6, 4.5],
  /** То же для флипов вейкскейта (дабл-кикфлип и т.п.). */
  flipCount: [1, 2.2, 3.6],
  /** Надбавка за связку разных элементов в одном вылете: 2 элемента +10%, 3 — +25%, 4 и больше — +40%. */
  stack: [0, 0, 0.1, 0.25, 0.4],
  /** Вылет из свитча / приземление в свитч. */
  switchTakeoff: 0.2,
  switchLanding: 0.1,
  /**
   * Амплитуда: от heightFrom до heightFull метров набегает до +30%, за время в воздухе — ещё до +15%.
   * Обычный поп с воды (до ~1,6 м, ~1,2 с) бонуса не даёт — нужен кикер. Меньше bigAirMin бонус не пишется.
   */
  heightFrom: 1.8,
  heightFull: 4.2,
  heightBonus: 0.3,
  airTimeFrom: 1.25,
  airTimeFull: 2.0,
  airTimeBonus: 0.15,
  bigAirMin: 0.03,
  /** Каждые 180° сверх самого большого спина в таблице. */
  spinExtraPer180: 800,
  /** Простой вылет без трюка: очки за метр высоты и потолок. */
  airPerMetre: 30,
  airMax: 150,
  /** Рейлы: очки за метр в каждой стойке. */
  railPerMetre: { fifty: 40, boardslide: 60, lipslide: 60, noseslide: 70, tailslide: 70, nosepress: 50, tailpress: 50 } satisfies Record<RailStance, number>,
  /** Тип фигуры: перила сложнее, толстая труба проще. */
  railKind: { rail: 1, ledge: 0.9, pipe: 0.8, handrail: 1.25 },
  /** Пресс: до +50% к очкам рейла, если держать pressFull секунд. */
  pressBonus: 0.5,
  pressFull: 1.0,
  /** Валлрайд: очки за секунду на стене (не дольше wallMaxTime). */
  wallPerSecond: 250,
  wallMaxTime: 3,
  /** Пороги очков для «уровня» трюка 2, 3, 4, 5 (размер всплывающей надписи, реакция зрителей, повтор). */
  tiers: [250, 600, 1100, 1900],
};

/**
 * Флипы, которые складываются в один: кикфлип + шоув-ит за один вылет считается как 360 флип.
 * `into` — id строки таблицы.
 */
export const FLIP_MERGES: { parts: [string, string]; into: string }[] = [{ parts: ['kickflip', 'shuvit'], into: 'treflip' }];
