# Nisse — Produktvision V2

> Detta dokument styr produktlöfte, säkerhet, användarvärde, tonalitet och långsiktiga principer.
> Vad som får byggas i nuvarande fas styrs av `docs/NISSE_MVP_90_DAYS.md`. Hur agenten arbetar i
> repot styrs av `CLAUDE.md`. Vid konflikt: vision > MVP-definition > arbetsregler — men en
> funktion som MVP-definitionen exkluderar byggs inte nu, oavsett vad visionen beskriver.

## 1. Vad Nisse är

Nisse är **hushållets intelligenta matassistent**. Nisse ska minska det mentala och praktiska
arbete som krävs för att få en fungerande middag på bordet.

**Det operativa produktlöftet:**

> "Nisse omvandlar kvällens osäkerhet till en accepterad och genomförbar middagsplan på under
> 30 sekunder och hjälper hushållet hålla planen tills maten står på bordet."

Nisse ska bära en del av hushållets matansvar. Det innebär att Nisse ska:

1. förstå hushållets grundläggande behov
2. förstå kvällens aktuella situation
3. fatta ett tydligt rekommenderat beslut
4. synliggöra sina viktigaste antaganden
5. låta användaren korrigera antaganden med minimal friktion
6. hjälpa användaren genom tillagningen
7. hantera enkla avvikelser
8. lära sig av utfallet

## 2. Vad Nisse inte är

- en traditionell receptbank
- en AI-receptgenerator
- en inspirationsfeed
- en sökmotor med hundratals alternativ
- ett administrativt lagerhanteringssystem

Beslutsbördan är fienden. Nisse fattar som standard ett rekommenderat beslut och låter användaren
korrigera — inte tvärtom.

## 3. Prioriterad målgrupp

Svenska barnfamiljer med två arbetande vuxna.

Typisk situation: begränsad energi efter arbetsdagen · maten behöver bli klar relativt snabbt ·
barn och vuxna har delvis olika preferenser · hushållet vill undvika flera separata maträtter ·
användaren vill inte välja mellan ett stort antal recept · användaren vill få ett rimligt beslut
och gå vidare.

**Optimeringsprincip:** en gemensam måltidsgrund, enkla personliga variationer (barnportions-
avstickare) och minsta möjliga beslutbörda.

## 4. Säkerhet och förtroende — absoluta regler

1. Allergier får **aldrig** behandlas som preferenser.
2. Allergifiltrering ska vara **deterministisk** — en språkmodell får aldrig ensam avgöra om en
   rätt är säker för en allergiker.
3. Nisse får inte gissa att mat är säker, och får inte rekommendera tveksamma råvaror som säkra.
4. Kritiska (avgörande) ingredienser ska verifieras före tillagning.
5. Osäkerhet ska ge **robustare** rekommendationer — inte fler frågor.
6. Fel ska erkännas kort och följas av en räddningsplan.
7. Användaren får aldrig skuldbeläggas för att inventeringen är fel.
8. Fortsatt hjälp får aldrig kräva att användaren administrerar ett fullständigt lager.

## 5. Antagandeekonomi

Information klassas i tre nivåer:

| Nivå | Princip | Exempel |
|---|---|---|
| 1 | **Verifiera alltid** | allergier, medicinska kostbegränsningar, matsäkerhetskritisk info, avgörande ingredienser före tillagningsstart |
| 2 | **Anta, men visa** | sannolika basvaror, tidsfönster, energinivå, portionsstorlek, budgetkänslighet, barnens tolerans |
| 3 | **Anta tyst** | detaljer som inte påverkar utfallet meningsfullt |

I normalfallet ställer Nisse **högst en verifierande fråga per middagsbeslut**. Kräver
rekommendationen fler frågor väljer Nisse i stället en mer robust rätt med färre osäkra beroenden.

Basvaruantaganden beskrivs som *"en transparent initial heuristik för vanligt förekommande svenska
basvaror"* — aldrig som "statistisk standardmodell" utan validerade data. Alla initiala antaganden
har låg/måttlig confidence och kan korrigeras med ett tryck.

## 6. UX-principer

Gränssnittet ska vara: mobile first · lugnt · snabbt · handlingsorienterat · lätt att förstå under
stress · möjligt att använda med en hand · tydligt på avstånd i köket · fritt från onödig text och
konfiguration.

**Tonalitet:** trygg, konkret, realistisk, kortfattad, icke-dömande, utan överdriven entusiasm.

Bra: *"Jag föreslår kycklingpasta. Den passar tiden ni har, kan delas i en mild barnportion och
kräver få avgörande ingredienser."*

Dåligt: *"Här är tio inspirerande AI-genererade rätter som hela familjen kommer att älska."*

## 7. Teknisk grundprincip

Generativ AI och deterministisk affärslogik är strikt separerade.

**AI får användas för:** tolkning av fritext, korta motiveringar, kontrollerad språkvariation,
strukturering av användarens situation.

**Deterministisk kod styr:** allergifiltrering, absoluta begränsningar, portionsberäkning,
ingrediensnormalisering, receptkandidater, ranking, robusthetsbedömning, substitutioner,
barnportionsavstickare, timers, analytics, behörigheter, säkerhetsregler.

All AI-output som påverkar systemets funktion returneras som strukturerad data, valideras med
schema, har timeout/retry/fallback, loggar fel utan hemligheter och kan ersättas av deterministisk
standardlogik. AI-leverantören ligger bakom ett interface (`backend/src/services/nisse/ai/client.js`)
och kan bytas utan att kärnlogiken skrivs om.

## 8. Inlärning

Nisse lär sig av utfall, inte av påståenden. Hushållsmodellen uppdaterar successivt:
rättpreferenser, avvisade rätter, basvarukonfidens, realistiska tidsantaganden,
portionsantaganden och fungerande barnanpassningar.

**Inlärningens effekt måste vara mätbar** (t.ex. lägre korrigeringsgrad, färre upprepade
avvisningar, högre förstaförslagsacceptans vecka 2 vs vecka 1). Nisse gör inga påståenden om
personalisering som inte kan observeras i data.

## 9. Långsiktig riktning (utanför nuvarande fas)

Framtida faser kan omfatta t.ex. köksinventering med lägre friktion, butiksintegration,
veckooptimering och restloop — men bara när kilen (se `NISSE_MVP_90_DAYS.md`) har bevisat
kärnhypotesen. Ingen framtida funktion implementeras utan uttryckligt nytt beslut.
