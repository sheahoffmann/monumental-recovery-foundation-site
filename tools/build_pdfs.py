"""Build the applicant and clinician fillable PDFs for Monumental Recovery Foundation.

Writes assets/scholarship-application.pdf and assets/clinical-recommendation.pdf.
Edit the wording in applicant() / clinician() below, then run:

    pip install reportlab
    python3 tools/build_pdfs.py <dir with DejaVuSans*.ttf and DejaVuSerif-Bold.ttf> assets/logo.png assets

DejaVu fonts are free (dejavu-fonts.github.io); matplotlib also bundles them.
"""
import re
import sys
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import Color
from reportlab.lib.utils import ImageReader

FONT_DIR = sys.argv[1]
LOGO = sys.argv[2]
OUT_DIR = sys.argv[3]

pdfmetrics.registerFont(TTFont("Sans", f"{FONT_DIR}/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("Sans-Bold", f"{FONT_DIR}/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Sans-Oblique", f"{FONT_DIR}/DejaVuSans-Oblique.ttf"))
pdfmetrics.registerFont(TTFont("Serif-Bold", f"{FONT_DIR}/DejaVuSerif-Bold.ttf"))

INK = Color(0x1a / 255, 0x1a / 255, 0x1a / 255)
GREY = Color(0x66 / 255, 0x66 / 255, 0x66 / 255)
RULE = Color(0.741, 0.741, 0.741)
BAND = Color(0.949, 0.949, 0.941)
FIELD_BG = Color(0.969, 0.976, 0.988)
FIELD_BORDER = Color(0.604, 0.655, 0.722)

PAGE_W, PAGE_H = 612, 792
LEFT, RIGHT = 54, 558
FIELD_X = 264
LABEL_W = 200
BOTTOM_LIMIT = 735
TOP_START = 70


class Doc:
    def __init__(self, path, title, running_title):
        self.c = canvas.Canvas(path, pagesize=(PAGE_W, PAGE_H))
        self.c.setTitle(title)
        self.c.setAuthor("Monumental Recovery Foundation")
        self.title = title
        self.running_title = running_title
        self.page = 1
        self.y = 0
        self.n = 0
        self.names = set()
        self.first_page()

    # -- coordinates ------------------------------------------------------
    @staticmethod
    def Y(y):
        return PAGE_H - y

    # -- page furniture ---------------------------------------------------
    def footer(self):
        c = self.c
        c.setStrokeColor(RULE)
        c.setLineWidth(0.5)
        c.line(LEFT, self.Y(748), RIGHT, self.Y(748))
        c.setFont("Sans", 7.5)
        c.setFillColor(GREY)
        c.drawString(LEFT, self.Y(760), f"Monumental Recovery Foundation  ·  {self.running_title}  ·  Confidential")
        c.drawRightString(RIGHT, self.Y(760), f"Page {self.page}")

    def first_page(self):
        c = self.c
        logo = ImageReader(LOGO)
        iw, ih = logo.getSize()
        w = 230
        h = w * ih / iw
        c.drawImage(logo, (PAGE_W - w) / 2, self.Y(63 + h), w, h, mask="auto")
        c.setFont("Serif-Bold", 16)
        c.setFillColor(INK)
        c.drawCentredString(PAGE_W / 2, self.Y(144), self.title)
        self.y = 175

    def new_page(self):
        self.footer()
        self.c.showPage()
        self.page += 1
        c = self.c
        c.setFont("Serif-Bold", 9)
        c.setFillColor(INK)
        c.drawString(LEFT, self.Y(43), "MONUMENTAL RECOVERY FOUNDATION")
        c.setFont("Sans", 8)
        c.setFillColor(GREY)
        c.drawRightString(RIGHT, self.Y(43), self.running_title)
        c.setStrokeColor(RULE)
        c.setLineWidth(1)
        c.line(LEFT, self.Y(50), RIGHT, self.Y(50))
        self.y = TOP_START

    def need(self, h):
        if self.y + h > BOTTOM_LIMIT:
            self.new_page()

    def finish(self):
        self.footer()
        self.c.save()

    # -- text helpers -----------------------------------------------------
    @staticmethod
    def wrap(text, font, size, width):
        words = text.split()
        lines, cur = [], ""
        for w in words:
            trial = (cur + " " + w).strip()
            if pdfmetrics.stringWidth(trial, font, size) <= width or not cur:
                cur = trial
            else:
                lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        return lines

    def text_lines(self, lines, x, y_top, font, size, leading, color=INK):
        c = self.c
        c.setFont(font, size)
        c.setFillColor(color)
        for i, line in enumerate(lines):
            c.drawString(x, self.Y(y_top + size * 0.78 + i * leading), line)

    def fname(self, label):
        self.n += 1
        base = re.sub(r"[^A-Za-z0-9]+", "_", label).strip("_")[:40] or "Field"
        name = f"{base}_{self.n}"
        self.names.add(name)
        return name

    # -- form widgets -----------------------------------------------------
    def textbox(self, label, x, y_top, w, h, multiline=False):
        c = self.c
        c.setFillColor(FIELD_BG)
        c.setStrokeColor(FIELD_BORDER)
        c.setLineWidth(0.6)
        c.rect(x + 0.3, self.Y(y_top + h - 0.3), w - 0.6, h - 0.6, fill=1, stroke=1)
        c.acroForm.textfield(
            name=self.fname(label), tooltip=label, x=x, y=self.Y(y_top + h), width=w, height=h,
            fontName="Helvetica", fontSize=9, borderWidth=0.6, borderColor=FIELD_BORDER,
            fillColor=FIELD_BG, textColor=INK, forceBorder=True,
            fieldFlags="multiline" if multiline else "", maxlen=None if multiline else 200,
        )

    def checkbox(self, label, x, y_top, size=9):
        c = self.c
        c.setFillColor(FIELD_BG)
        c.setStrokeColor(FIELD_BORDER)
        c.setLineWidth(0.6)
        c.rect(x + 0.3, self.Y(y_top + size - 0.3), size - 0.6, size - 0.6, fill=1, stroke=1)
        c.acroForm.checkbox(
            name=self.fname(label), tooltip=label, x=x, y=self.Y(y_top + size), size=size,
            buttonStyle="check", borderWidth=0.6, borderColor=FIELD_BORDER, fillColor=FIELD_BG,
            textColor=INK, forceBorder=True,
        )

    # -- blocks -----------------------------------------------------------
    def band(self, title):
        self.need(22 + 11 + 40)
        if self.y > TOP_START:
            self.y += 12
        c = self.c
        c.setFillColor(BAND)
        c.rect(LEFT, self.Y(self.y + 22), RIGHT - LEFT, 22, fill=1, stroke=0)
        c.setFont("Sans-Bold", 11.5)
        c.setFillColor(INK)
        c.drawString(62, self.Y(self.y + 15.5), title)
        self.y += 33

    def para(self, text, font="Sans", size=9.5, gap=7, x=LEFT, width=RIGHT - LEFT, color=INK):
        lines = self.wrap(text, font, size, width)
        h = len(lines) * 13
        self.need(h)
        self.text_lines(lines, x, self.y, font, size, 13, color)
        self.y += h + gap

    def subhead(self, text, gap=7):
        self.need(17 + 25)
        self.text_lines([text], LEFT, self.y, "Sans-Bold", 10, 13)
        self.y += 10 + gap

    def items(self, entries, numbered=False):
        for i, text in enumerate(entries, 1):
            lines = self.wrap(text, "Sans", 9.5, RIGHT - 70)
            h = len(lines) * 13
            self.need(h)
            marker = f"{i}." if numbered else "•"
            self.text_lines([marker], 56, self.y, "Sans", 9.5, 13)
            self.text_lines(lines, 70, self.y, "Sans", 9.5, 13)
            self.y += h + 3
        self.y += 6

    def field(self, label, short=False):
        lines = self.wrap(label, "Sans", 9, LABEL_W)
        h = max(23, len(lines) * 11 + 12)
        self.need(h)
        self.text_lines(lines, LEFT, self.y + 3.8, "Sans", 9, 11)
        self.textbox(label, FIELD_X, self.y, 218 if short else RIGHT - FIELD_X, 16)
        self.y += h

    def choices(self, label, options, x0=FIELD_X, label_width=LABEL_W):
        """options: list of strings; a string ending in ':' gets an inline text box."""
        lines = self.wrap(label, "Sans", 9, label_width) if label else []
        # lay out options into rows
        rows, row, x = [], [], x0
        for opt in options:
            other = opt.endswith(":")
            w = 13 + pdfmetrics.stringWidth(opt, "Sans", 9) + (100 if other else 0)
            if row and x + w > RIGHT:
                rows.append(row)
                row, x = [], x0
            row.append((opt, other, x))
            x += w + 12
        rows.append(row)
        h = max(len(rows) * 17 + 8, len(lines) * 11 + 14)
        self.need(h)
        if lines:
            self.text_lines(lines, LEFT, self.y + 3.8, "Sans", 9, 11)
        for r, row in enumerate(rows):
            top = self.y + 0.5 + r * 17
            for opt, other, ox in row:
                self.checkbox(f"{label or 'Option'} {opt}", ox, top)
                self.text_lines([opt], ox + 13, top + 0.8, "Sans", 9, 11)
                if other:
                    tw = pdfmetrics.stringWidth(opt, "Sans", 9)
                    self.textbox(f"{label} {opt}", ox + 13 + tw + 4, top - 3.5, 92, 16)
        self.y += h

    def textarea(self, label, height, fill=False):
        if fill and BOTTOM_LIMIT - self.y - 12 >= 220:
            height = min(height, BOTTOM_LIMIT - self.y - 12)
        self.need(height + 10)
        self.textbox(label, LEFT, self.y, RIGHT - LEFT, height, multiline=True)
        self.y += height + 12

    def checklist(self, entries):
        for text in entries:
            lines = self.wrap(text, "Sans", 9.5, RIGHT - 72)
            h = len(lines) * 13 + 5
            self.need(h)
            self.checkbox(text[:60], LEFT, self.y + 1.5)
            self.text_lines(lines, 72, self.y, "Sans", 9.5, 13)
            self.y += h
        self.y += 6

    def initials(self, entries):
        for text in entries:
            lines = self.wrap(text, "Sans", 9.5, RIGHT - 126)
            h = max(30, len(lines) * 13 + 14)
            self.need(h)
            self.textbox("Initials: " + text[:50], LEFT, self.y, 54, 18)
            self.text_lines(lines, 126, self.y + 1, "Sans", 9.5, 13)
            self.y += h
        self.y += 4

    def prior_table(self, rows=4):
        cols = [(LEFT, 186, "Program"), (248, 120, "Level of care"), (376, 92, "Dates")]
        self.need(20 + rows * 27)
        c = self.c
        c.setFont("Sans-Bold", 8.5)
        c.setFillColor(GREY)
        for x, w, t in cols:
            c.drawString(x, self.Y(self.y + 8), t)
        c.drawString(478, self.Y(self.y + 8), "Completed?")
        self.y += 14
        for i in range(1, rows + 1):
            for x, w, t in cols:
                self.textbox(f"Prior treatment {i} {t}", x, self.y, w, 18)
            for j, opt in enumerate(("Yes", "No")):
                ox = 478 + j * 42
                self.checkbox(f"Prior treatment {i} completed {opt}", ox, self.y + 4.5)
                self.text_lines([opt], ox + 13, self.y + 5.3, "Sans", 9, 11)
            self.y += 27
        self.y += 4


def applicant(path):
    d = Doc(path, "Scholarship Application", "Scholarship Application")
    d.band("Before you apply")
    d.para("The Monumental Recovery Foundation helps men with a substance use disorder attend high-quality "
           "extended care treatment they could not otherwise afford. Scholarships are paid directly to the "
           "treatment program, never to the applicant or his family.")
    d.subhead("Who can apply")
    d.items(["Men age 18 or older with a substance use disorder",
             "Who have been recommended for extended care by a licensed clinician",
             "Who cannot cover the full cost of treatment after insurance and family resources"])
    d.subhead("How to apply")
    d.items(["Complete Sections 1 through 6 and Section 8. Type your answers into this form on your computer "
             "and save it.",
             "Ask your clinician, therapist, physician, or interventionist to complete the separate Clinical "
             "Recommendation form at monumentalrecovery.org/apply.html. Your clinician submits it to us directly.",
             "Gather the documents listed in Section 7.",
             "Return to monumentalrecovery.org/apply.html and press Submit to upload this completed form. Upload "
             "your Section 7 documents there too if they are PDFs, or email them to give@monumentalrecovery.org. "
             "A family member or referring professional may help you, but you must sign the application yourself."],
            numbered=True)
    d.subhead("What happens next")
    d.items(["Within 2 business days, you will receive an email confirming receipt, your application ID number, "
             "and anything that is missing.",
             "Once your application is complete, our board of directors reviews it at its next meeting.",
             "You will be notified of the decision in writing within 3 business days of the vote."])
    d.subhead("Your privacy")
    d.para("Your application is confidential. It is reviewed only by the Foundation's board of directors and is "
           "identified by an ID number, not your name. We do not share your information with anyone outside the "
           "Foundation except the treatment program, and only as you authorize in Section 8.")
    d.para("If you are in crisis or thinking about harming yourself, call or text 988 (Suicide & Crisis "
           "Lifeline) or call 911. Do not wait for a scholarship decision to get help.", font="Sans-Bold")

    d.band("Section 1: Applicant information")
    for f in ["Full legal name", "Preferred name", "Date of birth", "Mailing address", "City, state, ZIP",
              "Mobile phone", "Email", "Best way and time to reach you"]:
        d.field(f)
    d.choices("May we leave a voicemail or text?", ["Yes", "No"])
    d.choices("Current living situation", ["Own or rent", "With family", "Sober living", "In treatment now",
                                           "Unhoused", "Other:"])
    d.choices("Employment status", ["Full-time", "Part-time", "Unemployed", "Student", "On leave"])
    d.choices("Veteran?", ["Yes", "No"])
    d.field("How did you hear about the Foundation?")
    d.subhead("Emergency contact")
    for f in ["Name", "Relationship to you", "Phone", "Email"]:
        d.field(f)
    d.choices("May we contact this person about your application?", ["Yes", "No"])
    d.subhead("Referring professional (if any)")
    for f in ["Name and title", "Organization", "Phone and email"]:
        d.field(f)

    d.band("Section 2: Treatment request")
    d.para("Tell us where you hope to go. If you do not have a program in mind, check \"No preference\" and the "
           "Foundation will help identify an approved program that fits your clinical needs.")
    d.choices("Preferred program name", ["Recovery Nexus", "Other:", "No preference"])
    d.field("Program location (city, state)")
    d.field("Program contact (admissions name, phone, email)")
    d.choices("Level of care", ["Residential", "Extended care", "Sober living with clinical services", "Not sure"])
    d.choices("Have you been accepted or scheduled for admission?", ["Yes, admission date:", "Pending", "Not yet"])
    for f in ["Expected length of stay", "Total estimated cost of treatment ($)", "Amount covered by insurance ($)",
              "Amount you or your family can pay ($)", "Scholarship amount requested ($)"]:
        d.field(f)
    d.choices("Are you applying to other scholarships or funds?", ["No", "Yes, which:"])

    d.band("Section 3: Substance use and treatment history")
    d.para("There are no wrong answers here. Honest answers help the board understand what kind of care will help "
           "you most. Past treatment never disqualifies you.")
    d.choices("Substances you are seeking treatment for", ["Alcohol", "Opioids", "Stimulants", "Cannabis",
                                                           "Benzodiazepines", "Other:"])
    for f in ["How long has substance use been a problem for you?", "Date of last use (approximate)",
              "Are you currently in detox or treatment? Where?"]:
        d.field(f)
    d.choices("Will you need medical detox before admission?", ["Yes", "No", "Not sure"])
    d.choices("Are you currently on medication for addiction treatment (for example, buprenorphine, naltrexone)?",
              ["Yes", "No"])
    d.subhead("Prior treatment (list the most recent first)")
    d.prior_table()
    d.subhead("Other information that affects your care")
    d.choices("Do you have pending legal matters that could affect your ability to attend treatment "
              "(court dates, probation requirements)?", ["No", "Yes, describe:"])
    d.choices("Are there medical or mental health needs the program should know about? (Your clinician can "
              "describe these in the Clinical Recommendation.)", ["No", "Yes"])

    d.band("Section 4: Financial information")
    d.para("Scholarships go to applicants who cannot cover treatment on their own. Please answer as accurately as "
           "you can and attach the proof listed in Section 7.")
    for f in ["Household size (including you)", "Your annual income before taxes ($)",
              "Total household annual income before taxes ($)"]:
        d.field(f)
    d.choices("Sources of income", ["Wages", "Self-employment", "Disability or SSI", "Unemployment",
                                    "Family support", "None", "Other:"])
    d.choices("Health insurance", ["None", "Private", "Medicaid", "Medicare", "VA/TRICARE", "Other:"])
    d.field("Insurance company and member ID")
    d.choices("Has insurance approved or denied coverage for this treatment?",
              ["Approved", "Denied", "Pending", "Not submitted"])
    for f in ["Savings and other assets available for treatment ($)",
              "Can family or others contribute? How much ($)?",
              "Monthly obligations you must keep paying during treatment (rent, child support, other) ($)"]:
        d.field(f)
    d.need(130)
    d.subhead("Describe your financial situation (optional)")
    d.para("Tell us anything the numbers above do not show, such as job loss, medical debt, or people who depend "
           "on you.")
    d.textarea("Describe your financial situation", 90)

    d.band("Section 5: Personal statement")
    d.para("In your own words, about one page, tell us:")
    d.items(["How important is recovery to you, and why?",
             "What do you hope to achieve through sobriety, for yourself, your relationships, your work, and your "
             "future?",
             "What would it mean to you to receive this scholarship?"], numbered=True)
    d.para("You may write below or attach a separate page. Spelling and grammar do not matter; honesty does.")
    d.textarea("Personal statement", 330, fill=True)

    d.band("Section 6: Relationship disclosure")
    d.para("The Foundation must make every decision fairly and without favoritism. A \"yes\" below does not "
           "disqualify you; it lets the right board members step aside from your review.")
    d.para("Current directors: William Bunnett, Drew Gold, Cam Black, Tracey Moore, and Kaira Bird.")
    d.choices("Are you related to, or do you have a personal or business relationship with, any Foundation "
              "director or staff member?", ["No", "Yes, who and how:"])
    d.choices("Have you received services from, or been referred by, a Foundation director?", ["No", "Yes, who:"])
    d.choices("Are you a current or former client or employee of Recovery Nexus or Pikes Peak Therapeutic "
              "Services?", ["No", "Yes, dates:"])
    d.choices("Is your preferred program Recovery Nexus?", ["No", "Yes"])
    d.para("Your choice of program does not affect the board's decision. Every award is based on need and "
           "clinical fit.", font="Sans-Oblique", color=GREY)

    d.band("Section 7: Required attachments")
    d.para("Your application is reviewed only when everything below is received. Copies or clear phone photos are "
           "fine.")
    d.checklist(["Copy of a government-issued photo ID",
                 "Proof of income: most recent tax return, or 2 recent pay stubs, or a benefits letter. If you have "
                 "no income, a signed statement explaining how you support yourself.",
                 "Insurance card (front and back), if insured",
                 "Insurance approval or denial letter for this treatment, if available",
                 "Clinical recommendation (submitted by your clinician, or a separate letter)",
                 "Program cost estimate or admission letter from your preferred program, if you have one",
                 "Personal statement (Section 5 or a separate page)",
                 "Signed consent and release of information (Section 8)"])

    d.band("Section 8: Certification, consent and signature")
    d.para("Please read each statement and write your initials in the box beside it.")
    d.initials(["The information in this application is true and complete to the best of my knowledge. False "
                "information may result in denial or cancellation of an award.",
                "I understand that a scholarship is not guaranteed, and that the board's decision is final.",
                "I understand that any award is paid directly to the treatment program, never to me or my family.",
                "I understand that if I leave treatment early, unused funds are returned to the Foundation to help "
                "other men.",
                "I consent to the Foundation storing my application and sharing it with its board of directors "
                "for review.",
                "I authorize the Foundation to contact my clinician and preferred program to verify the information "
                "in this application."])
    d.subhead("Authorization to release information")
    d.para("If I am awarded a scholarship, I authorize my treatment program to disclose to the Monumental Recovery "
           "Foundation only the following: my admission date, confirmation that I am in care, my discharge date and "
           "type, and billing information for the scholarship. This information will be used only to administer my "
           "scholarship. I may revoke this authorization in writing at any time, except for information already "
           "released. Unless revoked, it expires 12 months after my discharge.")
    d.para("I understand my treatment program may ask me to sign its own release form that meets federal "
           "confidentiality rules (42 CFR Part 2) before it shares any information.")
    d.subhead("Optional: follow-up contact")
    d.checklist(["I agree that the Foundation may contact me after treatment to ask how I am doing. My answers will "
                 "be reported only in summary, without my name."])
    d.need(90)
    d.subhead("Signature")
    d.field("Applicant signature")
    d.field("Printed name")
    d.field("Date", short=True)

    d.band("For Foundation use only")
    d.field("Application ID", short=True)
    for f in ["Date received", "Acknowledgment sent", "Date complete", "Screened by / date"]:
        d.field(f)
    d.choices("Eligibility", ["Meets criteria", "Does not meet:"])
    d.choices("Program on Approved Program List", ["Yes", "Needs vetting"])
    d.field("Directors recused")
    d.field("Meeting date and vote (for–against–abstain)")
    d.choices("Decision", ["Approved", "Denied", "Withdrawn"])
    d.field("Amount awarded ($)", short=True)
    d.field("Decision letter sent", short=True)
    d.finish()


def clinician(path):
    d = Doc(path, "Clinical Recommendation", "Clinical Recommendation")
    d.band("For the clinician")
    d.para("Thank you for helping. The person named below is applying for a Monumental Recovery Foundation "
           "scholarship, which helps men with a substance use disorder attend high-quality extended care treatment "
           "they could not otherwise afford. Scholarships are paid directly to the treatment program.")
    d.para("This form is to be completed by a licensed professional (physician, psychiatrist, psychologist, LPC, "
           "LCSW, LAC, LMFT, or equivalent) who has evaluated the applicant. You may attach a letter or assessment "
           "instead of completing every field.")
    d.subhead("How to submit")
    d.items(["Type your answers into this form on your computer and save it.",
             "Return to monumentalrecovery.org/apply.html and press Submit to upload it, or email it to "
             "give@monumentalrecovery.org with the applicant's name in the subject line.",
             "Please send it directly to the Foundation rather than returning it to the applicant."], numbered=True)
    d.para("Everything you send is kept with the applicant's confidential file and reviewed only by the "
           "Foundation's board of directors.", font="Sans-Oblique", color=GREY)

    d.band("Applicant")
    d.field("Applicant's full name")
    d.field("Applicant's date of birth", short=True)

    d.band("Clinician information")
    for f in ["Clinician name and credentials", "License number and state", "Organization", "Phone", "Email"]:
        d.field(f)

    d.band("Clinical recommendation")
    for f in ["Date of evaluation", "How long have you known or treated the applicant?",
              "Substance use disorder diagnosis (DSM-5) and severity",
              "Co-occurring mental health or medical conditions relevant to placement",
              "ASAM level of care recommended", "Recommended length of stay"]:
        d.field(f)
    d.choices("Is extended care clinically appropriate for this applicant?", ["Yes", "No"])
    d.field("Programs you recommend, if any")
    d.need(160)
    d.subhead("Clinical rationale")
    d.para("Briefly explain why this level of care is recommended and what risks the applicant faces without it.")
    d.textarea("Clinical rationale", 150)

    d.band("Clinician attestation")
    d.para("I attest that I am licensed in good standing, that I evaluated this applicant, and that the information "
           "above is accurate to the best of my knowledge.")
    d.field("Clinician signature")
    d.field("Date", short=True)
    d.finish()


applicant(f"{OUT_DIR}/scholarship-application.pdf")
clinician(f"{OUT_DIR}/clinical-recommendation.pdf")
print("built")
