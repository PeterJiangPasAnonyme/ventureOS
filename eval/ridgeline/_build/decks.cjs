const pptxgen = require("/tmp/ridgeline-pptx/node_modules/pptxgenjs");
const path = require("path");

const THEME = {
  name: "Ridgeline",
  headFontFace: "Georgia",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1C1917",
    lt1: "F7F4EF",
    dk2: "3F4A3C",
    lt2: "E7E2D8",
    accent1: "9A3412",
    accent2: "1F4D3A",
    accent3: "C4B8A5",
    accent4: "44403C",
    accent5: "78716C",
    accent6: "B45309",
    hlink: "1F4D3A",
    folHlink: "9A3412",
  },
};

function shadow() {
  return { type: "outer", color: "1C1917", blur: 10, opacity: 0.12, offset: 4, angle: 90 };
}

async function deck(file, slides) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.author = "Ridgeline";
  pres.title = slides.title;
  pres.subject = slides.date;
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;

  pres.defineSlideMaster({
    title: "Title",
    background: { color: C.text2 },
    objects: [
      { rect: { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: C.accent1 } } },
    ],
  });
  pres.defineSlideMaster({
    title: "Content",
    background: { color: C.background1 },
    objects: [
      { rect: { x: 0, y: 7.22, w: 13.3, h: 0.28, fill: { color: C.text2 } } },
    ],
    slideNumber: { x: 12.4, y: 7.24, w: 0.7, h: 0.22, color: C.background1, fontFace: THEME.bodyFontFace, fontSize: 10 },
  });

  pres.addSection({ title: slides.date });

  const title = pres.addSlide({ masterName: "Title", sectionTitle: slides.date });
  title.addText(slides.kicker, {
    x: 0.7, y: 1.8, w: 10, h: 0.4,
    fontFace: THEME.bodyFontFace, fontSize: 14, color: C.accent3, isTextBox: true, margin: 0,
  });
  title.addText(slides.headline, {
    x: 0.7, y: 2.3, w: 11, h: 1.6,
    fontFace: THEME.headFontFace, fontSize: 40, color: C.background1, isTextBox: true, margin: 0,
  });
  title.addText(slides.footer, {
    x: 0.7, y: 6.4, w: 10, h: 0.4,
    fontFace: THEME.bodyFontFace, fontSize: 14, color: C.accent3, isTextBox: true, margin: 0,
  });

  for (const s of slides.body) {
    const slide = pres.addSlide({ masterName: "Content", sectionTitle: slides.date });
    slide.addText(s.title, {
      x: 0.55, y: 0.35, w: 12, h: 0.6,
      fontFace: THEME.headFontFace, fontSize: 28, color: C.text2, isTextBox: true, margin: 0,
    });
    if (s.cards) {
      s.cards.forEach((card, i) => {
        const x = 0.55 + i * 4.15;
        slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
          x, y: 1.4, w: 3.9, h: 4.8,
          fill: { color: C.background2 }, rectRadius: 0.08,
          shadow: shadow(),
        });
        slide.addText(card.k, {
          x: x + 0.25, y: 1.65, w: 3.4, h: 0.8,
          fontFace: THEME.bodyFontFace, fontSize: 14, color: C.accent1, isTextBox: true, margin: 0,
        });
        slide.addText(card.v, {
          x: x + 0.25, y: 2.5, w: 3.4, h: 1.3,
          fontFace: THEME.headFontFace, fontSize: 28, color: C.text1, isTextBox: true, margin: 0,
        });
        slide.addText(card.d, {
          x: x + 0.25, y: 4.0, w: 3.4, h: 1.8,
          fontFace: THEME.bodyFontFace, fontSize: 14, color: C.text2, isTextBox: true, margin: 0,
        });
      });
    } else {
      slide.addText(s.lines.map((text, i) => ({
        text,
        options: { bullet: false, breakLine: i !== s.lines.length - 1 },
      })), {
        x: 0.55, y: 1.3, w: 12, h: 5.4,
        fontFace: THEME.bodyFontFace, fontSize: 20, color: C.text1, paraSpaceAfter: 14, isTextBox: true,
      });
    }
  }

  await pres.writeFile({ fileName: file });
  const { applyTheme } = require("/Users/peterjiangmacbookpro/.claude/skills/synced/d11063db-c603-46c7-ad3e-94b5887f4fbf_1ee7eedb-641d-4d67-8454-0af67411f815/pptx/scripts/apply_theme.js");
  await applyTheme(file, THEME);
  console.log(file);
}

const out = path.resolve(__dirname, "..", "decks");

async function main() {
await deck(path.join(out, "Ridgeline-investor-deck-2026-01.pptx"), {
  title: "Ridgeline investor deck January 2026",
  date: "January 2026",
  kicker: "JANUARY 2026  ·  CONFIDENTIAL",
  headline: "Book the mountain.\nNot the tab explosion.",
  footer: "Series B materials  ·  figures are the working draft, Q4 not closed",
  body: [
    {
      title: "What we sell",
      lines: [
        "A skier enters dates, a home airport, Epic or Ikon or a day ticket, and a level.",
        "We rank the resorts. Then we sell the package: room, lift or pass-day, transfer.",
        "Flights are the next checkout step. Gear is on the roadmap for this year.",
        "Snow Pass is the daily alert. 48,000 subscribers.",
      ],
    },
    {
      title: "Q4, as this deck stated it",
      cards: [
        { k: "GROSS BOOKINGS", v: "$42M", d: "Q4 2025. December close was still open when this went out." },
        { k: "TAKE RATE", v: "11%", d: "Commission on a booking, as stated for the round." },
        { k: "SNOW PASS", v: "48,000", d: "Paying subscribers. Pulled for this draft, not refreshed." },
      ],
    },
    {
      title: "Who else is in the trip",
      lines: [
        "WeSki sells the flight, the stay, and the transfer. About $8M of revenue.",
        "Ski.com is a person who plans the trip, with Expedia on the lodging. About $15M.",
        "OnTheSnow is search and snow. The traffic note was 1.7 million visits. The revenue note was under $1M. Both were left on the slide.",
        "Mindtrip was included as “AI travel.” It is not a ski product.",
      ],
    },
    {
      title: "Still on the list in January",
      lines: [
        "Flights inside the package.",
        "A gear shop.",
        "Our own resort reviews, instead of the partner feed.",
        "None of these had an owner or a date on this slide.",
      ],
    },
  ],
});

await deck(path.join(out, "Ridgeline-investor-deck-2026-09.pptx"), {
  title: "Ridgeline investor deck September 2026",
  date: "September 2026",
  kicker: "SEPTEMBER 2026  ·  FOR THE NOVEMBER 6 MEETING",
  headline: "The season is the business.\nThe package starts at the hill.",
  footer: "Draft  ·  round numbers  ·  Q3 close was not on this version",
  body: [
    {
      title: "What we sell now",
      lines: [
        "Rank by travel time, open terrain, and the forecast.",
        "Package is lodging, lift or pass-day, and the ground transfer.",
        "The flight is not in the package. The skier names the airport they already booked.",
        "No gear shop. Reviews on the page are still a partner feed.",
      ],
    },
    {
      title: "The round numbers on this draft",
      cards: [
        { k: "TRAILING BOOKINGS", v: "$120M", d: "Gross bookings. Not marked as a quarter, a season, or twelve months." },
        { k: "TAKE RATE", v: "~10%", d: "No quarter named under the rate." },
        { k: "SNOW PASS / CASH", v: "55,000  ·  $18M", d: "Subscribers, and cash on hand." },
      ],
    },
    {
      title: "Competition, this version",
      lines: [
        "WeSki: flight, stay, transfer. Revenue on this deck is $5–6M, estimated.",
        "Ski.com: expert planner, Expedia lodging. Under $5M.",
        "OnTheSnow stays a snow product, not a package.",
        "Mindtrip is listed under AI travel. It is not a ski site.",
      ],
    },
    {
      title: "November 6",
      lines: [
        "The meeting is with the growth investor. No partner name on this draft.",
        "Q3 is not in the appendix. The draft was sent before that close was walked.",
        "Ikon pass-days are not mentioned. The rank refresh is a single bullet: “before Thanksgiving.”",
        "There is no slide that says the take rate is changing.",
      ],
    },
  ],
});
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
