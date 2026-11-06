export const COUNTRY_ROUND = "where_in_world";
export const COUNTRY_POINTS = [10, 8, 6, 4, 2] as const;
export type CountryQuestionFields = {
  country_clues?: string[];
  country_clue_index?: number;
  country_aliases?: string[];
  country_flag_src?: string | null;
  country_flag_clue_index?: number;
};
export const COUNTRY_FLAGS = [
  { country: "Japan", src: "/country-flags/01.svg" },
  { country: "Italy", src: "/country-flags/02.svg" },
  { country: "France", src: "/country-flags/03.svg" },
  { country: "Thailand", src: "/country-flags/04.svg" },
  { country: "United Arab Emirates", src: "/country-flags/05.svg" },
] as const;
export function countryPoints(index: unknown): number {
  return typeof index === "number" && Number.isInteger(index) ? COUNTRY_POINTS[index] ?? 0 : 0;
}
export function isCountryQuestion(q: { round_type?: unknown } | null | undefined): boolean {
  return q?.round_type === COUNTRY_ROUND;
}
const normalise = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[.'’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export function countryAnswerPoints(answer: { answer_text: string; country_clue_index?: number | null }, q: CountryQuestionFields & { correct_answer: string }): number {
  return countryGuessCorrect(answer.answer_text, q) ? countryPoints(answer.country_clue_index) : 0;
}
export function countryGuessCorrect(answer: string, q: CountryQuestionFields & { correct_answer: string }): boolean {
  const guess = normalise(answer);
  return !!guess && [q.correct_answer, ...(Array.isArray(q.country_aliases) ? q.country_aliases : [])].some(value => typeof value === "string" && normalise(value) === guess);
}
export function countryQuestionError(q: CountryQuestionFields & { correct_answer?: unknown; question_type?: unknown; round_type?: unknown }): string | null {
  if (!isCountryQuestion(q) || q.question_type !== "text_answer" || !String(q.correct_answer || "").trim()) return "Choose a country answer.";
  if (!Array.isArray(q.country_clues) || q.country_clues.length !== 5 || q.country_clues.some(c => typeof c !== "string" || !c.trim()) || new Set(q.country_clues.map(c => c.trim().toLowerCase())).size !== 5) return "Add five different clues, hardest first and easiest last.";
  if (q.country_aliases !== undefined && (!Array.isArray(q.country_aliases) || q.country_aliases.some(a => typeof a !== "string" || !a.trim()))) return "Accepted country names must be non-empty text.";
  if (q.country_flag_src && (!COUNTRY_FLAGS.some(f => f.src === q.country_flag_src) || !Number.isInteger(q.country_flag_clue_index) || (q.country_flag_clue_index ?? -1) < 0 || (q.country_flag_clue_index ?? 5) > 4)) return "Choose a supported flag and the clue that reveals it.";
  return null;
}

// Fixed packs use stable geography and familiar landmarks, with no paid AI calls.
// Each final clue names a recognisable capital; none requires British knowledge.
export const COUNTRY_PACKS: ReadonlyArray<{ country: string; aliases?: string[]; clues: readonly string[] }> = [
  { country: "Japan", clues: ["I have a northern island called Hokkaido.", "My traditional inns are called ryokan.", "My high-speed trains are known as Shinkansen.", "Mount Fuji is one of my best-known landmarks.", "My capital is Tokyo."] },
  { country: "Brazil", aliases: ["Brasil"], clues: ["The Pantanal wetlands cover part of my territory.", "My official language is Portuguese.", "Much of the Amazon rainforest lies within my borders.", "Rio de Janeiro is home to my Christ the Redeemer statue.", "My capital is Brasília."] },
  { country: "Egypt", clues: ["The ancient city of Thebes lies within my borders.", "Much of my land is desert, but a major river supports my farms.", "The Nile flows through me towards the Mediterranean Sea.", "The pyramids of Giza and the Great Sphinx are here.", "My capital is Cairo."] },
  { country: "Australia", clues: ["My island state lies south of my mainland.", "The ancient rock formation Uluru is one of my landmarks.", "The Great Barrier Reef lies off my northeast coast.", "Kangaroos and koalas are native to me.", "My capital is Canberra; Sydney is my largest city."] },
  { country: "Canada", clues: ["My territory includes the northern part of the Rocky Mountains.", "My two official languages are English and French.", "I share the Great Lakes with the United States.", "A red maple leaf is at the centre of my flag.", "My capital is Ottawa."] },
  { country: "Italy", aliases: ["Italia"], clues: ["Two independent countries, San Marino and Vatican City, are surrounded by my territory.", "The islands of Sicily and Sardinia belong to me.", "My outline on a map resembles a boot.", "Venice, Florence and the Leaning Tower of Pisa are here.", "My capital is Rome, home of the Colosseum."] },
  { country: "India", aliases: ["Bharat"], clues: ["The Western Ghats mountain range runs along part of my western coast.", "Hindi and English are used by my central government.", "Mumbai is home to my Hindi-language film industry.", "The Taj Mahal stands in my city of Agra.", "My capital is New Delhi."] },
  { country: "Mexico", aliases: ["México"], clues: ["My Yucatán Peninsula has many natural sinkholes called cenotes.", "I have coastlines on both the Pacific Ocean and the Gulf of Mexico.", "The ancient Maya city of Chichén Itzá is here.", "Mariachi music and Día de los Muertos are associated with me.", "My capital is Mexico City."] },
  { country: "Kenya", clues: ["My name is also the name of my highest mountain.", "The Great Rift Valley runs through me.", "The Maasai Mara is one of my best-known wildlife reserves.", "I am an East African country crossed by the Equator.", "My capital is Nairobi."] },
  { country: "France", clues: ["The Loire Valley is famous for my historic châteaux.", "My island of Corsica lies in the Mediterranean Sea.", "The Tour de France cycling race is named after me.", "The Louvre museum and the Eiffel Tower are here.", "My capital is Paris."] },
  { country: "New Zealand", aliases: ["NZ", "Aotearoa"], clues: ["My indigenous Māori people call me Aotearoa.", "The strait between my two main islands is named after James Cook.", "Many outdoor scenes in The Lord of the Rings films were shot here.", "My flightless kiwi bird gives my people a nickname.", "My capital is Wellington; Auckland is my largest city."] },
  { country: "Peru", aliases: ["Perú"], clues: ["Lake Titicaca lies on my border with Bolivia.", "My coastal desert contains the ancient Nazca Lines.", "Cusco was once the capital of the Inca Empire here.", "The Inca site of Machu Picchu is in my Andes mountains.", "My capital is Lima."] },
  { country: "Thailand", clues: ["Chiang Mai is a major city in my mountainous north.", "My traditional New Year water festival is called Songkran.", "I was formerly known as Siam.", "Pad Thai and tom yum soup come from my cuisine.", "My capital is Bangkok."] },
  { country: "South Africa", aliases: ["Republic of South Africa", "RSA"], clues: ["The Drakensberg mountain range forms part of my border with Lesotho.", "My coast meets both the Atlantic and Indian oceans.", "Table Mountain overlooks one of my major cities.", "Nelson Mandela became my president in 1994.", "Pretoria, Cape Town and Bloemfontein are traditionally known as my three capitals."] },
  { country: "Greece", aliases: ["Hellas"], clues: ["My monasteries at Meteora stand on tall rock pillars.", "Crete is my largest island.", "The ancient Olympic Games began here.", "The Parthenon stands on my Acropolis.", "My capital is Athens."] },
  { country: "China", aliases: ["People's Republic of China", "PRC"], clues: ["The Yangtze River flows through my territory.", "My city of Xi'an is famous for its Terracotta Army.", "Giant pandas are native to me.", "My Great Wall is one of the world's best-known landmarks.", "My capital is Beijing."] },
  { country: "United Arab Emirates", aliases: ["UAE", "U.A.E.", "The United Arab Emirates"], clues: ["My seven constituent emirates formed a federation in 1971–72.", "My city of Al Ain is known for its historic oasis.", "The Sheikh Zayed Grand Mosque is one of my landmarks.", "Dubai and its Burj Khalifa are here.", "My capital is Abu Dhabi."] },
  { country: "Spain", aliases: ["España", "Espana"], clues: ["My Canary Islands lie in the Atlantic off northwest Africa.", "The Camino de Santiago pilgrimage routes cross my territory.", "Flamenco developed in my southern region of Andalusia.", "Barcelona is home to my Sagrada Família basilica.", "My capital is Madrid."] },
  { country: "Argentina", clues: ["The Iberá wetlands lie in my northeast.", "My land includes much of the southern region of Patagonia.", "Aconcagua, the highest mountain outside Asia, is here.", "Lionel Messi was born in my city of Rosario.", "My capital is Buenos Aires."] },
  { country: "South Korea", aliases: ["Republic of Korea", "Korea Republic", "ROK"], clues: ["Jeju is my largest island.", "My writing system is called Hangul.", "Kimchi is a staple of my cuisine.", "BTS and BLACKPINK are music groups from here.", "My capital is Seoul."] },
];

export function buildCountryQuestions(count: number, previous: Array<{ round_type?: unknown; correct_answer?: unknown }> = [], random = Math.random) {
  const used = new Set(previous.filter(isCountryQuestion).map(q => normalise(String(q.correct_answer || ""))));
  const available = COUNTRY_PACKS.filter(p => !used.has(normalise(p.country)) && !(p.aliases || []).some(a => used.has(normalise(a))));
  const shuffled = [...available];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const selected = shuffled.slice(0, Math.max(0, Math.min(5, Math.floor(count))));
  // Include a visual clue when an unused flag pack is available.
  if (selected.length && !selected.some(p => COUNTRY_FLAGS.some(f => f.country === p.country))) {
    const withFlag = shuffled.find(p => COUNTRY_FLAGS.some(f => f.country === p.country));
    if (withFlag) selected[selected.length - 1] = withFlag;
  }
  return selected.map(p => ({
    _uid: crypto.randomUUID(), question_text: "Name the country.", question_type: "text_answer", round_type: COUNTRY_ROUND,
    correct_answer: p.country, country_aliases: [...(p.aliases || [])], country_clues: [...p.clues],
    country_flag_src: COUNTRY_FLAGS.find(f => f.country === p.country)?.src ?? null,
    country_flag_clue_index: 3,
    option_a: null, option_b: null, option_c: null, option_d: null, option_e: null, option_f: null,
    explanation: "", difficulty: "mixed",
  }));
}
