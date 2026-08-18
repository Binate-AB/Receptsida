#!/usr/bin/env python3
# ============================================
# G0 CHECKLIST — fillable PDF (AcroForm) builder
# ============================================
# Renders a truly fillable PDF (clickable checkboxes + text fields) from the
# engine-derived model emitted by gen-g0-checklist-draft12.mjs. The allergen
# data is NOT re-derived here — this script only lays out what the engine
# produced (single source of truth stays in the Node/engine side).
#
# Usage: python3 gen-g0-checklist-pdf.py <model.json> <out.pdf>

import json, sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    Flowable, PageBreak, KeepTogether,
)

MODEL, OUT = sys.argv[1], sys.argv[2]
data = json.load(open(MODEL))
COMMIT = data.get("commit", "okänd")
TITLE = data.get("title", "12 nya rätter")
MODE = data.get("mode", "new")
DISHES = data["dishes"]

styles = getSampleStyleSheet()
P = ParagraphStyle("body", parent=styles["Normal"], fontSize=8.5, leading=11)
PS = ParagraphStyle("small", parent=P, fontSize=7.8, leading=9.5)
H2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=14, textColor=colors.HexColor("#009466"), spaceAfter=2)
H3 = ParagraphStyle("h3", parent=styles["Heading3"], fontSize=10.5, spaceBefore=8, spaceAfter=2)
H4 = ParagraphStyle("h4", parent=P, fontSize=7.5, textColor=colors.HexColor("#555555"))
INTRO = ParagraphStyle("intro", parent=P, fontSize=8.3, leading=11)

GREEN = colors.HexColor("#009466")
GRID = colors.HexColor("#999999")
HEADBG = colors.HexColor("#eef3f0")
FREEBG = colors.HexColor("#fff7e6")


class CheckBox(Flowable):
    def __init__(self, name, size=10):
        self.name, self.size = name, size
        self.width = self.height = size

    def wrap(self, *_):
        return self.width, self.height

    def draw(self):
        self.canv.acroForm.checkbox(
            name=self.name, x=0, y=0, size=self.size, buttonStyle="check",
            borderWidth=0.7, borderColor=colors.grey, fillColor=colors.white,
            forceBorder=True, relative=True,
        )


class TextField(Flowable):
    def __init__(self, name, width, height=13, fontSize=8, multiline=False):
        self.name, self.width, self.height = name, width, height
        self.fontSize, self.multiline = fontSize, multiline

    def wrap(self, *_):
        return self.width, self.height

    def draw(self):
        self.canv.acroForm.textfield(
            name=self.name, x=0, y=0, width=self.width, height=self.height,
            borderWidth=0.5, borderColor=colors.HexColor("#aaaaaa"),
            fillColor=colors.white, fontSize=self.fontSize,
            fieldFlags=("multiline" if self.multiline else ""),
            forceBorder=True, relative=True,
        )


def cb_label(name, label, cbsize=10):
    """A checkbox followed by a text label, as a 2-col mini table."""
    t = Table([[CheckBox(name, cbsize), Paragraph(label, PS)]], colWidths=[cbsize + 4, None])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


def dish_flow(idx, d):
    flow = []
    flow.append(Paragraph(d["title"], H2))
    flow.append(Paragraph(f"Recept för {d['servings']} portioner.", P))
    flow.append(Spacer(1, 4))

    # Ingredient columns (three side-by-side lists)
    ing_cells = []
    for title, items, fmt in [
        ("Obligatoriska", d["required"], lambda i: f"{i['name']} — {i['amount']}"),
        ("Valfria", d["optional"], lambda i: f"{i['name']} — {i['amount']}"),
        ("Substitutionsalternativ", d["subs"], lambda i: f"Istället för {i['from']}: {i['name']}"),
    ]:
        inner = "<br/>".join(fmt(i) for i in items) if items else "(inga)"
        ing_cells.append(Paragraph(f"<b>{title}</b><br/>{inner}", PS))
    ing = Table([ing_cells], colWidths=[175, 175, 175])
    ing.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (0, -1), 0)]))
    flow.append(ing)

    # Fråga A
    flow.append(Paragraph("Fråga A — är listan komplett?", H3))
    flow.append(Paragraph("Saknas ingredienser som en normal tillagning innehåller? (buljong/fond, matfett, kryddblandningar, spad/vätska)", PS))
    flow.append(Spacer(1, 2))
    flow.append(TextField(f"d{idx}_A", width=525, height=34, multiline=True))
    flow.append(Spacer(1, 2))

    # Fråga B
    flow.append(Paragraph("Fråga B — stämmer allergenbedömningen per ingrediens?", H3))
    flow.append(Paragraph('▲ = bedömd helt fri — granskningens viktigaste rader (en felaktig "Fri" är det vi jagar).', PS))
    head = [Paragraph(f"<b>{h}</b>", PS) for h in ["Ingrediens", "Vår bedömning", "Avser EU-14-grupp(er)", "Stämmer", "Fel — rätt vore"]]
    rows = [head]
    free_idx = []
    for r, row in enumerate(d["bRows"]):
        nm = ("▲ " if row["free"] else "") + row["name"] + (" (valfri)" if row["optional"] else "")
        rows.append([
            Paragraph(nm, PS), Paragraph(row["text"], PS), Paragraph(row["groups"], PS),
            CheckBox(f"d{idx}_bB_{r}_ok"), TextField(f"d{idx}_bB_{r}_fix", width=80, height=12, fontSize=7),
        ])
        if row["free"]:
            free_idx.append(r + 1)
    tb = Table(rows, colWidths=[120, 150, 120, 45, 90], repeatRows=1)
    st = [
        ("GRID", (0, 0), (-1, -1), 0.4, GRID), ("BACKGROUND", (0, 0), (-1, 0), HEADBG),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (3, 0), (3, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]
    for fi in free_idx:
        st.append(("BACKGROUND", (0, fi), (-1, fi), FREEBG))
    tb.setStyle(TableStyle(st))
    flow.append(tb)

    # Fråga C
    flow.append(Paragraph("Fråga C — industriprodukter (kräver förpackningskoll?)", H3))
    if not d["cRows"]:
        flow.append(Paragraph("Inga uppenbart industriberedda ingredienser identifierades automatiskt. Kontrollera ändå själv.", PS))
    else:
        crows = [[Paragraph(f"<b>{h}</b>", PS) for h in ["Industriprodukt", "Varför listad", "Ja", "Nej", "Osäker"]]]
        for r, row in enumerate(d["cRows"]):
            crows.append([
                Paragraph(row["name"], PS), Paragraph(row["cat"], PS),
                CheckBox(f"d{idx}_cC_{r}_ja"), CheckBox(f"d{idx}_cC_{r}_nej"), CheckBox(f"d{idx}_cC_{r}_os"),
            ])
        ct = Table(crows, colWidths=[165, 150, 70, 70, 70], repeatRows=1)
        ct.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.4, GRID), ("BACKGROUND", (0, 0), (-1, 0), HEADBG),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (2, 0), (-1, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        flow.append(ct)

    # Decision + comment
    flow.append(Paragraph("Beslut för denna rätt", H3))
    dec = Table([[
        cb_label(f"d{idx}_dec_ok", "Godkänd utan anmärkning"),
        cb_label(f"d{idx}_dec_fix", "Godkänd efter rättelser"),
        cb_label(f"d{idx}_dec_no", "Underkänd"),
    ]], colWidths=[190, 175, 130])
    dec.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    flow.append(dec)
    flow.append(Spacer(1, 3))
    flow.append(Paragraph("Kommentar:", PS))
    flow.append(TextField(f"d{idx}_comment", width=525, height=26, multiline=True))
    return flow


story = []
# Intro box + EU-14
intro_txt = (
    ("<b>Re-granskning:</b> dessa rätter är redan aktiva i appen (tidigare grandfathrade). Syftet är att "
     "ersätta den retroaktiva stämpeln med ett riktigt granskningsspår — bekräfta att allergendatan stämmer, "
     "eller flagga rättelser.<br/>" if MODE == "review" else "") +
    "<b>Till dig som granskar:</b> Du behöver bara din livsmedelskunskap. Per rätt: läs ingredienslistan, "
    "svara på Fråga A (saknas något?), gå igenom Fråga B rad för rad, och Fråga C (bör en beredd produkt kräva "
    "förpackningskoll?). Sätt sist ett beslut.<br/>"
    '<b>Det vi jagar:</b> en ingrediens vi felaktigt kallat <b>Fri</b> (▲) som kan innehålla ett allergen. Att fela '
    "åt det försiktiga hållet är ok. <b>Är du osäker — markera Osäker, gissa aldrig till Fri.</b><br/>"
    "<b>EU:s 14 allergengrupper:</b> Gluten · Kräftdjur · Ägg · Fisk · Jordnötter · Soja · Mjölk · Nötter · Selleri · "
    "Senap · Sesam · Svaveldioxid/sulfit · Lupin · Blötdjur. (Laktos hör inte hit — intoleransmarkör, skild från mjölkprotein.)"
)
story.append(Paragraph("Nisse — Allergengranskning (checklista) · %s" % TITLE, styles["Title"]))
box = Table([[Paragraph(intro_txt, INTRO)]], colWidths=[525])
box.setStyle(TableStyle([
    ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#cfe6d8")),
    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f2f8f4")),
    ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
]))
story.append(box)
story.append(Spacer(1, 6))

for idx, d in enumerate(DISHES):
    story.append(KeepTogether(dish_flow(idx, d)))
    story.append(PageBreak())

# Sign-off
story.append(Paragraph(f"Sign-off — hela granskningen ({len(DISHES)} rätter)", H2))
so_head = [Paragraph(f"<b>{h}</b>", PS) for h in ["", "Namn", "Datum", "Roll (granskare / expertstöd)"]]
so_rows = [so_head]
for pi, who in enumerate(["Person 1", "Person 2"]):
    so_rows.append([
        Paragraph(who, PS), TextField(f"so{pi}_namn", 170, 15), TextField(f"so{pi}_datum", 90, 15),
        TextField(f"so{pi}_roll", 170, 15),
    ])
so = Table(so_rows, colWidths=[60, 185, 100, 180])
so.setStyle(TableStyle([
    ("GRID", (0, 0), (-1, -1), 0.4, GRID), ("BACKGROUND", (0, 0), (-1, 0), HEADBG),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
]))
story.append(so)
story.append(Spacer(1, 6))
summ = Table([[
    Paragraph("<b>Sammanfattande beslut:</b>", PS),
    cb_label("summ_all", f"Alla {len(DISHES)} godkända"),
    cb_label("summ_fix", "Godkända med rättelser"),
    cb_label("summ_no", "Vissa underkända"),
]], colWidths=[110, 140, 160, 115])
summ.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
story.append(summ)
story.append(Spacer(1, 8))
story.append(Paragraph(f"Granskad mot commit: <font face='Courier'>{COMMIT}</font>", P))


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.grey)
    canvas.drawRightString(A4[0] - 15 * mm, 10 * mm, f"Sida {doc.page}  ·  commit {COMMIT}")
    canvas.restoreState()


doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=14 * mm, bottomMargin=14 * mm, title="Nisse — Allergenchecklista (12 nya rätter)")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=footer)])
doc.build(story)
print(f"✓ Skrev {OUT} (ifyllbar PDF, commit {COMMIT})")
