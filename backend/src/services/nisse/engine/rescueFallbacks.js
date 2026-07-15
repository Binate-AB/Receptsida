// ============================================
// Nisse Engine — Deterministic rescue fallbacks
// Canned, safe fixes for the most common kitchen
// problems. Used when AI is unavailable or fails —
// the rescue button must ALWAYS answer.
// ============================================

const FALLBACKS = [
  {
    match: ['bränns', 'bränd', 'bränt', 'brinner', 'vidbränd', 'vidbränt'],
    assessment: 'Ingen fara — det går nästan alltid att rädda.',
    actions: [
      { text: 'Dra av kärlet från värmen direkt.', urgent: true },
      { text: 'Rör INTE om — häll över allt som inte sitter fast i botten till ett rent kärl.', urgent: true },
      { text: 'Smaka av: lite bränd smak kan maskeras med en skvätt grädde, tomat eller syra.', urgent: false },
    ],
    voiceCue: 'Dra av kärlet från plattan direkt. Rör inte om, utan häll över det som inte fastnat till ett rent kärl.',
  },
  {
    match: ['salt', 'för salt', 'översaltad', 'översaltat'],
    assessment: 'För salt går ofta att balansera.',
    actions: [
      { text: 'Späd med vatten, osaltad buljong, grädde eller krossade tomater beroende på rätt.', urgent: false },
      { text: 'Lägg i en rå, skalad potatis och låt sjuda 10 minuter — den suger upp en del salt.', urgent: false },
      { text: 'En tsk socker eller en skvätt syra (citron/vinäger) balanserar sältan.', urgent: false },
    ],
    voiceCue: 'Späd med lite vatten eller grädde, och balansera med en gnutta socker eller citron.',
  },
  {
    match: ['tunn', 'för tunn', 'rinnig', 'vattnig'],
    assessment: 'Såsen går att reda på flera sätt.',
    actions: [
      { text: 'Låt sjuda utan lock 5–10 minuter så vätskan kokar bort.', urgent: false },
      { text: 'Red med maizena: rör ut 1 msk i lite KALLT vatten, vispa ner och sjud ett par minuter.', urgent: false },
    ],
    voiceCue: 'Låt såsen sjuda utan lock en stund, eller red den med lite maizena utrörd i kallt vatten.',
  },
  {
    match: ['tjock', 'för tjock', 'stabbig'],
    assessment: 'Enkelt fixat.',
    actions: [
      { text: 'Vispa i lite vätska i taget — vatten, buljong, mjölk eller pastavatten — tills konsistensen är rätt.', urgent: false },
    ],
    voiceCue: 'Vispa i lite vätska i taget tills konsistensen känns rätt.',
  },
  {
    match: ['klump', 'klumpig', 'klumpar'],
    assessment: 'Klumpar går oftast att rädda.',
    actions: [
      { text: 'Ta kastrullen från värmen och vispa kraftigt.', urgent: true },
      { text: 'Envisa klumpar: sila såsen eller kör snabbt med stavmixer.', urgent: false },
    ],
    voiceCue: 'Ta kastrullen från värmen och vispa kraftigt. Om klumparna är envisa, sila såsen.',
  },
  {
    match: ['fastnar', 'fastnat', 'sitter fast', 'kladdar'],
    assessment: 'Pannan är troligen för torr eller för het.',
    actions: [
      { text: 'Sänk värmen ett snäpp och tillsätt lite mer smör eller olja.', urgent: true },
      { text: 'Låt maten ligga — den släpper ofta själv när ytan fått stekyta.', urgent: false },
    ],
    voiceCue: 'Sänk värmen lite och tillsätt mer smör eller olja. Ha tålamod — den släpper när ytan är klar.',
  },
  {
    match: ['klart', 'klar', 'färdig', 'genomstekt', 'rosa'],
    assessment: 'Så här kontrollerar du.',
    actions: [
      { text: 'Kyckling/fläsk: skär i den tjockaste biten — köttet ska vara helt vitt/grått utan rosa, saften klar. Med termometer: 72–74°C.', urgent: false },
      { text: 'Fisk: klar när den flagar sig lätt med gaffel och är ogenomskinlig.', urgent: false },
    ],
    voiceCue: 'Skär i den tjockaste biten. Kyckling ska vara helt vit utan rosa, och fisk ska flaga sig lätt.',
  },
];

/**
 * Deterministic rescue lookup. Always returns an answer;
 * the generic fallback covers unmatched problems.
 *
 * @param {string} problemText
 * @returns {{ assessment: string, actions: Array<{text, urgent}>, voiceCue: string, source: 'fallback' }}
 */
export function rescueFallback(problemText) {
  const text = String(problemText || '').toLowerCase();

  for (const fb of FALLBACKS) {
    if (fb.match.some((m) => text.includes(m))) {
      return { assessment: fb.assessment, actions: fb.actions, voiceCue: fb.voiceCue, source: 'fallback' };
    }
  }

  return {
    assessment: 'Lugnt — det mesta går att lösa.',
    actions: [
      { text: 'Ta det som är på värmen åt sidan så inget förvärras medan du tänker.', urgent: true },
      { text: 'Smaka och titta: för torrt → vätska/fett; för blött → sjud av; smaklöst → salt + syra.', urgent: false },
    ],
    voiceCue: 'Ta kärlet åt sidan först. Smaka sedan av: vätska om det är torrt, sjud av om det är blött, salt och syra om det är smaklöst.',
    source: 'fallback',
  };
}
