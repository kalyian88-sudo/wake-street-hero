/**
 * КАТАЛОГ ШМОТА WHY NOT — магазин игры целиком описан в этом файле.
 * Николай, здесь можно менять всё: названия, описания, цены, характеристики, цвета и ссылки.
 * Код игры трогать не нужно — после правки достаточно пересобрать (`npm run build`).
 *
 * ── Поля товара ──────────────────────────────────────────────────────────────────────────────
 *   id          Внутренний код. У уже существующих товаров НЕ МЕНЯТЬ: он записан в сохранениях
 *               игроков. Для новых — любое уникальное слово латиницей, например 'wb_summer26'.
 *   category    Раздел магазина: 'bindings' (крепления), 'wakeboard', 'wakeskate',
 *               'vest' (жилет), 'helmet' (шлем или кепка), 'apparel' (одежда).
 *   name        Название: { ru: '…', en: '…' }.
 *   desc        Описание в карточке товара, тоже на двух языках.
 *   price       Цена в игровых монетах. 0 = стартовый шмот, он есть у игрока с самого начала.
 *   stats       На сколько товар сдвигает характеристики райдера. База — 5 из 10, итог всегда 0..10.
 *                 pop     — высота вылета
 *                 spin    — скорость вращений
 *                 rail    — баланс на рейле
 *                 landing — мягкость приземления (прощает недокрут)
 *                 catch   — окно ловли доски на вейкскейте
 *               Пример: { rail: 2, pop: -1 } — заметно лучше на рейлах, чуть ниже вылет.
 *               Разумные значения — от -1 до +2 на товар: разница видна, баланс цел.
 *   look        Внешний вид в игре:
 *                 primary / secondary / accent — цвета 0xRRGGBB (красный бренда — 0xe30613);
 *                 graphic — рисунок: 'logo', 'stripe', 'split', 'camo', 'wood', 'fade',
 *                           'checker', 'plain', 'flames', 'tape'.
 *   url         Куда ведёт кнопка «Смотреть на сайте». Строку можно убрать — тогда откроется
 *               главная сайта (BRAND.siteUrl в src/config.ts).
 *   unlockLevel С какого уровня райдера товар можно купить (необязательно). Уровни —
 *               в src/career/progress.ts.
 *   apparelKind Только для одежды: 'shorts', 'wetsuit', 'tee' или 'hoodie'.
 *   headKind    Только для раздела 'helmet': 'helmet' (шлем) или 'cap' (кепка).
 *
 * ── Как поменять ссылку ──────────────────────────────────────────────────────────────────────
 *   Найди товар и впиши адрес страницы:   url: 'https://whynotwake.com/…',
 *   Адрес сайта для всех товаров сразу меняется в src/config.ts (BRAND.siteUrl).
 *
 * ── Как добавить товар ───────────────────────────────────────────────────────────────────────
 *   Скопируй любой блок { … }, из того же раздела, поставь новый id, название, цену и цифры.
 *   Товар сам появится в магазине в своём разделе, в том порядке, в каком стоит в этом файле.
 *
 * ── Чего не делать ───────────────────────────────────────────────────────────────────────────
 *   Не удаляй и не переименовывай стартовые товары (price: 0) — их id перечислены
 *   в STARTER_GEAR (src/config.ts), с ними игрок начинает игру.
 *
 * Экономика для ориентира: хороший заезд приносит 100–150 монет, каждая цель спота — ещё 100–180.
 * Средний товар (600–900) покупается за 4–6 хороших заездов, топовый (2500+) — к концу города.
 */
import { BRAND, NEUTRAL_STATS } from '../config';
import type { BoardKind, EquippedGear, GearCategory, GearItem, GearStats } from '../types';

/** Адрес по умолчанию для кнопки «Смотреть на сайте». */
const SITE = BRAND.siteUrl;

// Цвета бренда и пара акцентных.
const RED = BRAND.colors.red;
const DARK = BRAND.colors.dark;
const BLACK = BRAND.colors.darker;
const GREY = BRAND.colors.grey;
const WHITE = BRAND.colors.white;
const TEAL = 0x19b5a5;
const YELLOW = 0xffc400;
const ORANGE = 0xff5a1f;
const OLIVE = 0x5b6b3a;
const SAND = 0xd9c7a3;
const NAVY = 0x1f2a44;

export const GEAR: GearItem[] = [
  // ══════════════════════════════════════════════════════ КРЕПЛЕНИЯ WHY NOT ══
  {
    id: 'bd_classic',
    category: 'bindings',
    name: { ru: 'WHY NOT Classic', en: 'WHY NOT Classic' },
    desc: {
      ru: 'Крепы, с которых начинают. Держат ногу, прощают ошибки и ничего не требуют взамен.',
      en: 'The bindings you start in. They hold your foot, forgive mistakes and ask for nothing back.',
    },
    price: 0,
    stats: {},
    look: { primary: DARK, secondary: RED, accent: WHITE, graphic: 'logo' },
    url: SITE,
  },
  {
    id: 'bd_jib',
    category: 'bindings',
    name: { ru: 'WHY NOT Jib Soft', en: 'WHY NOT Jib Soft' },
    desc: {
      ru: 'Мягкий флекс для рейлов и прессов: стопа гнётся, доска слушается. В поп отдают чуть меньше.',
      en: 'Soft flex for rails and presses: the foot bends, the board listens. A little less snap in the pop.',
    },
    price: 700,
    stats: { rail: 1.5, landing: 0.5, pop: -0.5 },
    look: { primary: WHITE, secondary: DARK, accent: RED, graphic: 'stripe' },
    url: SITE,
  },
  {
    id: 'bd_lock',
    category: 'bindings',
    name: { ru: 'WHY NOT Lockdown', en: 'WHY NOT Lockdown' },
    desc: {
      ru: 'Жёсткая колодка: весь заряд каната уходит в вылет. На рейлах с ними придётся поработать.',
      en: 'Stiff chassis: every bit of rope load goes into the pop. Rails will make you work for it.',
    },
    price: 1500,
    stats: { pop: 1.5, spin: 0.5, rail: -1 },
    look: { primary: RED, secondary: BLACK, accent: WHITE, graphic: 'split' },
    url: SITE,
    unlockLevel: 3,
  },
  {
    id: 'bd_hero',
    category: 'bindings',
    name: { ru: 'WHY NOT Hero Pro', en: 'WHY NOT Hero Pro' },
    desc: {
      ru: 'Верх линейки. Высоко вылетают, быстро крутят и мягко принимают — в них выигрывают улицы.',
      en: 'Top of the line. Big pop, fast spins, soft landings — the pair that wins streets.',
    },
    price: 3000,
    stats: { pop: 1, spin: 1, landing: 1.5 },
    look: { primary: BLACK, secondary: RED, accent: YELLOW, graphic: 'fade' },
    url: SITE,
    unlockLevel: 6,
  },

  // ══════════════════════════════════════════════════════════════ ВЕЙКБОРДЫ ══
  {
    id: 'wb_street',
    category: 'wakeboard',
    name: { ru: 'WHY NOT Street', en: 'WHY NOT Street' },
    desc: {
      ru: 'Универсальная стрит-доска без сюрпризов. На ней делается всё — просто не на максимум.',
      en: 'An all-round street board with no surprises. Does everything — just not to the max.',
    },
    price: 0,
    stats: {},
    look: { primary: RED, secondary: DARK, accent: WHITE, graphic: 'logo' },
    url: SITE,
  },
  {
    id: 'wb_butter',
    category: 'wakeboard',
    name: { ru: 'WHY NOT Butter', en: 'WHY NOT Butter' },
    desc: {
      ru: 'Гнётся как линейка и липнет к рейлам, прессы получаются сами. Расплата — вылет пониже.',
      en: 'Bends like a ruler and sticks to rails, presses happen by themselves. The price is a lower pop.',
    },
    price: 800,
    stats: { rail: 2, landing: 0.5, pop: -1 },
    look: { primary: TEAL, secondary: WHITE, accent: YELLOW, graphic: 'tape' },
    url: SITE,
  },
  {
    id: 'wb_boost',
    category: 'wakeboard',
    name: { ru: 'WHY NOT Boost', en: 'WHY NOT Boost' },
    desc: {
      ru: 'Жёсткий рокер, который выстреливает с любого кикера. Для больших вращений, не для долгих слайдов.',
      en: 'A stiff rocker that fires off any kicker. Built for big spins, not for long slides.',
    },
    price: 1600,
    stats: { pop: 2, spin: 0.5, rail: -1, landing: -0.5 },
    look: { primary: BLACK, secondary: RED, accent: ORANGE, graphic: 'flames' },
    url: SITE,
    unlockLevel: 3,
  },
  {
    id: 'wb_hero',
    category: 'wakeboard',
    name: { ru: 'WHY NOT Hero', en: 'WHY NOT Hero' },
    desc: {
      ru: 'Доска уровня Street Hero: вылет, вращение и мягкий приезд в одном корпусе. Без слабых мест.',
      en: 'A Street Hero grade board: pop, spin and soft landings in one shape. No weak spots.',
    },
    price: 3200,
    stats: { pop: 1.5, spin: 1.5, rail: 0.5, landing: 1 },
    look: { primary: WHITE, secondary: RED, accent: BLACK, graphic: 'split' },
    url: SITE,
    unlockLevel: 6,
  },

  // ═════════════════════════════════════════════════════════════ ВЕЙКСКЕЙТЫ ══
  {
    id: 'ws_plank',
    category: 'wakeskate',
    name: { ru: 'WHY NOT Plank', en: 'WHY NOT Plank' },
    desc: {
      ru: 'Дерево, шкурка и ничего лишнего. Честный вейкскейт, на котором учатся ловить доску.',
      en: 'Wood, grip and nothing else. An honest wakeskate to learn your catches on.',
    },
    price: 0,
    stats: {},
    look: { primary: SAND, secondary: DARK, accent: RED, graphic: 'wood' },
    url: SITE,
  },
  {
    id: 'ws_flick',
    category: 'wakeskate',
    name: { ru: 'WHY NOT Flick', en: 'WHY NOT Flick' },
    desc: {
      ru: 'Глубокий конкейв: флипы крутятся резче, а доска сама возвращается под ноги.',
      en: 'Deep concave: flips snap round faster and the board finds its way back under your feet.',
    },
    price: 900,
    stats: { catch: 1.5, spin: 1, pop: -0.5 },
    look: { primary: RED, secondary: WHITE, accent: BLACK, graphic: 'checker' },
    url: SITE,
  },
  {
    id: 'ws_carbon',
    category: 'wakeskate',
    name: { ru: 'WHY NOT Carbon Deck', en: 'WHY NOT Carbon Deck' },
    desc: {
      ru: 'Композит: лёгкий, пружинит и ловится почти сам. Вейкскейт для тех, кто уже не падает.',
      en: 'Composite: light, springy and practically catches itself. A deck for riders who stopped falling.',
    },
    price: 2600,
    stats: { pop: 1.5, catch: 2, rail: 1, landing: 0.5 },
    look: { primary: BLACK, secondary: ORANGE, accent: WHITE, graphic: 'fade' },
    url: SITE,
    unlockLevel: 5,
  },

  // ═════════════════════════════════════════════════════════════════ ЖИЛЕТЫ ══
  {
    id: 'vest_basic',
    category: 'vest',
    name: { ru: 'Жилет WHY NOT', en: 'WHY NOT Vest' },
    desc: {
      ru: 'Обычный жилет: держит на воде и не мешает кататься. Красный, чтобы филмер тебя не потерял.',
      en: 'A plain vest: keeps you afloat and out of your own way. Red, so the filmer never loses you.',
    },
    price: 0,
    stats: {},
    look: { primary: RED, secondary: DARK, accent: WHITE, graphic: 'logo' },
    url: SITE,
  },
  {
    id: 'vest_impact',
    category: 'vest',
    name: { ru: 'Жилет WHY NOT Impact', en: 'WHY NOT Impact Vest' },
    desc: {
      ru: 'Толстая пена на спине и рёбрах: жёсткие приезды и бетон переносятся легче. Немного сковывает.',
      en: 'Thick foam over the back and ribs: hard landings and concrete hurt less. A touch restrictive.',
    },
    price: 600,
    stats: { landing: 1.5, spin: -0.5 },
    look: { primary: OLIVE, secondary: BLACK, accent: RED, graphic: 'camo' },
    url: SITE,
  },
  {
    id: 'vest_comp',
    category: 'vest',
    name: { ru: 'Жилет WHY NOT Comp Lite', en: 'WHY NOT Comp Lite Vest' },
    desc: {
      ru: 'Тонкий соревновательный жилет. Ничего не мешает крутить, руки свободны для грэбов и ловли.',
      en: 'A thin comp vest. Nothing gets in the way of your spins, arms free for grabs and catches.',
    },
    price: 1500,
    stats: { spin: 1, landing: 0.5, catch: 0.5 },
    look: { primary: WHITE, secondary: RED, accent: DARK, graphic: 'stripe' },
    url: SITE,
    unlockLevel: 4,
  },

  // ═════════════════════════════════════════════════════════ ШЛЕМЫ И КЕПКИ ══
  {
    id: 'helmet_basic',
    category: 'helmet',
    headKind: 'helmet',
    name: { ru: 'Шлем WHY NOT', en: 'WHY NOT Helmet' },
    desc: {
      ru: 'Шлем. На стрите без него никак: вода мягкая, а гранит — нет.',
      en: 'A helmet. Non-negotiable on street: the water is soft, the granite is not.',
    },
    price: 0,
    stats: {},
    look: { primary: DARK, secondary: GREY, accent: RED, graphic: 'logo' },
    url: SITE,
  },
  {
    id: 'cap_crew',
    category: 'helmet',
    headKind: 'cap',
    name: { ru: 'Кепка WHY NOT Crew', en: 'WHY NOT Crew Cap' },
    desc: {
      ru: 'Кепка команды. Голова лёгкая, стиль на месте — а приземляться теперь надо аккуратнее.',
      en: 'The crew cap. Light head, style intact — and now you really have to land properly.',
    },
    price: 350,
    stats: { spin: 0.5, landing: -0.5 },
    look: { primary: RED, secondary: WHITE, accent: BLACK, graphic: 'logo' },
    url: SITE,
  },
  {
    id: 'helmet_pro',
    category: 'helmet',
    headKind: 'helmet',
    name: { ru: 'Шлем WHY NOT Pro', en: 'WHY NOT Pro Helmet' },
    desc: {
      ru: 'Лёгкая скорлупа с мягким вкладышем. С ним спокойнее на рейлах и на жёстких приездах.',
      en: 'A light shell with a soft liner. Calmer on rails and when the landing gets rough.',
    },
    price: 1200,
    stats: { landing: 1, rail: 0.5 },
    look: { primary: WHITE, secondary: BLACK, accent: RED, graphic: 'checker' },
    url: SITE,
    unlockLevel: 3,
  },

  // ════════════════════════════════════════════════════════════════ ОДЕЖДА ══
  {
    id: 'shorts_basic',
    category: 'apparel',
    apparelKind: 'shorts',
    name: { ru: 'Бордшорты WHY NOT', en: 'WHY NOT Boardshorts' },
    desc: {
      ru: 'Сохнут за пять минут. Классика тёплой воды и первых заездов.',
      en: 'Dry in five minutes. The warm-water classic for your first sessions.',
    },
    price: 0,
    stats: {},
    look: { primary: DARK, secondary: RED, accent: WHITE, graphic: 'stripe' },
    url: SITE,
  },
  {
    id: 'tee_logo',
    category: 'apparel',
    apparelKind: 'tee',
    name: { ru: 'Футболка WHY NOT Logo', en: 'WHY NOT Logo Tee' },
    desc: {
      ru: 'Белый хлопок и большой логотип. Катать в футболке — отдельный вид свободы.',
      en: 'White cotton, big logo. Riding in a tee is its own kind of freedom.',
    },
    price: 300,
    stats: { rail: 0.5, catch: 0.5 },
    look: { primary: WHITE, secondary: DARK, accent: RED, graphic: 'logo' },
    url: SITE,
  },
  {
    id: 'hoodie_street',
    category: 'apparel',
    apparelKind: 'hoodie',
    name: { ru: 'Худи WHY NOT Street', en: 'WHY NOT Street Hoodie' },
    desc: {
      ru: 'Мокрое худи и ночной спот. Крутить в нём тяжелее, зато на рейле ты как дома.',
      en: 'A soaked hoodie and a night spot. Heavier to spin in, but on a rail you are right at home.',
    },
    price: 800,
    stats: { rail: 1, landing: 0.5, spin: -0.5 },
    look: { primary: BLACK, secondary: GREY, accent: RED, graphic: 'tape' },
    url: SITE,
  },
  {
    id: 'wetsuit_pro',
    category: 'apparel',
    apparelKind: 'wetsuit',
    name: { ru: 'Гидрик WHY NOT 3/2', en: 'WHY NOT 3/2 Wetsuit' },
    desc: {
      ru: 'Тянется во все стороны и греет, когда вода уже совсем не Пхукет. Всего понемногу — в плюс.',
      en: 'Stretches every way and keeps you warm when the water is nothing like Phuket. A bit better at everything.',
    },
    price: 1400,
    stats: { pop: 0.5, spin: 0.5, landing: 0.5, catch: 0.5 },
    look: { primary: NAVY, secondary: BLACK, accent: RED, graphic: 'split' },
    url: SITE,
    unlockLevel: 4,
  },
];

// ─────────────────────────────────────────────────── дальше — код, не данные ──

/** Shop sections in display order. */
export const GEAR_CATEGORIES: readonly GearCategory[] = ['bindings', 'wakeboard', 'wakeskate', 'vest', 'helmet', 'apparel'];

export const STAT_KEYS: readonly (keyof GearStats)[] = ['pop', 'spin', 'rail', 'landing', 'catch'];

const BY_ID = new Map<string, GearItem>(GEAR.map((g) => [g.id, g]));

export function getGear(id: string | null | undefined): GearItem | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** Items of one shop section, in catalogue order. */
export function gearInCategory(category: GearCategory): GearItem[] {
  return GEAR.filter((g) => g.category === category);
}

/** Target of the "Смотреть на сайте" button. */
export function gearUrl(item: GearItem | null | undefined): string {
  return item?.url || BRAND.siteUrl;
}

/**
 * Totals (0..10, 5 = neutral) for the equipped set when riding `board`:
 * neutral + the board of that kind + bindings (wakeboard only — a wakeskate has none) + vest + helmet + apparel.
 */
export function computeStats(equipped: EquippedGear, board: BoardKind): GearStats {
  const out: GearStats = { ...NEUTRAL_STATS };
  const worn = [
    board === 'wakeboard' ? equipped.wakeboard : equipped.wakeskate,
    board === 'wakeboard' ? equipped.bindings : null,
    equipped.vest,
    equipped.helmet,
    equipped.apparel,
  ];
  for (const id of worn) {
    const item = getGear(id);
    if (!item) continue;
    for (const key of STAT_KEYS) out[key] += item.stats[key] ?? 0;
  }
  for (const key of STAT_KEYS) out[key] = Math.min(10, Math.max(0, out[key]));
  return out;
}
