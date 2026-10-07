/* ==========================================================================
   Taste of Recovery 2027 — app content
   --------------------------------------------------------------------------
   Everything guests read in the app lives here: schedule, courses, chefs,
   auction lots and feedback questions. Edit this file to update the app.
   Chef names, photos and times are placeholders until they're confirmed.
   ========================================================================== */

export const EVENT = {
  name: "Taste of Recovery",
  year: 2027,
  venue: "Recovery Nexus",
  city: "Colorado Springs",
  // Gala night; the countdown and "happening now" use this.
  galaStart: "2027-06-17T18:00:00-06:00",
  timezone: "America/Denver",
  donateUrl: "/donate.html",
};

/* Times are local (Mountain). `start`/`end` drive the "Now" and "Up next" tags. */
export const SCHEDULE = [
  {
    id: "wed", date: "2027-06-16", label: "Wed · Jun 16", name: "Arrive & prep",
    items: [
      { start: "09:00", end: "17:00", when: "All day", title: "Guests and chefs fly in", body: "Out-of-town guests arrive in Colorado Springs and settle in. Room block details are shared with ticket holders." },
      { start: "13:00", end: "17:00", when: "Afternoon", title: "Chefs source and shop", body: "Competing chefs pick up the ingredients they need for their course." },
      { start: "17:00", end: "22:00", when: "Evening", title: "Prep begins", body: "Chefs get a head start on stocks, cures, doughs and ferments ahead of competition night." },
    ],
  },
  {
    id: "thu", date: "2027-06-17", label: "Thu · Jun 17", name: "Golf & gala",
    items: [
      { start: "08:00", end: "13:00", when: "8:00 AM", title: "Golf tournament", body: "Tee off together, with closest-to-the-pin and longest-drive contests on the course." },
      { start: "08:00", end: "17:30", when: "All day", title: "Chefs in the kitchen", body: "All ten chefs are at Recovery Nexus preparing their courses." },
      { start: "13:00", end: "17:30", when: "Afternoon", title: "Back to the hotel", body: "A short break after golf to rest and change into black tie." },
      { start: "18:00", end: "19:00", when: "6:00 PM", title: "Doors open · silent auction opens", body: "Find your seat, browse the lots, and place your first bids from this app.", highlight: true },
      { start: "19:00", end: "21:30", when: "7:00 PM", title: "Ten blind courses", body: "Plates arrive with no name attached. Taste, take notes, and save your vote for the end.", highlight: true },
      { start: "21:00", end: "21:30", when: "9:00 PM", title: "Silent auction closes", body: "Final bids. Winners get a text and a Pay button in the app." },
      { start: "21:30", end: "21:50", when: "9:30 PM", title: "Voting", body: "Open the Vote tab and pick your favorite course. One vote per guest." },
      { start: "21:50", end: "23:00", when: "9:50 PM", title: "The reveal", body: "Chefs are unmasked, the votes are counted, and the winner is engraved on the trophy.", highlight: true },
    ],
  },
  {
    id: "fri", date: "2027-06-18", label: "Fri · Jun 18", name: "Travel home",
    items: [
      { start: "08:00", end: "18:00", when: "All day", title: "Travel home", body: "Guests and chefs head home with a curated gift bag, carry-on friendly, including small-batch jam and hot sauce made by Chef Brian." },
      { start: "09:00", end: "23:59", when: "Anytime", title: "Share your feedback", body: "Five quick questions in the app help us plan 2028." },
    ],
  },
];

export const COURSES = [
  "Amuse-bouche", "Crudo", "Soup", "Salad", "Pasta",
  "Vegetable", "Fish", "Intermezzo", "Main", "Dessert",
].map((name, i) => ({ no: i + 1, name }));

/* Chefs. `course` is secret until the reveal: the app only shows it once an
   admin reveals the results. Bios and photos are placeholders. */
export const CHEFS = [
  { id: "c01", name: "Chef to be announced", program: "Treatment program", city: "", course: 1, bio: "Bio coming soon. Every competing chef cooks three meals a day for people in treatment." },
  { id: "c02", name: "Chef to be announced", program: "Treatment program", city: "", course: 2, bio: "Bio coming soon." },
  { id: "c03", name: "Chef to be announced", program: "Treatment program", city: "", course: 3, bio: "Bio coming soon." },
  { id: "c04", name: "Chef to be announced", program: "Treatment program", city: "", course: 4, bio: "Bio coming soon." },
  { id: "c05", name: "Chef to be announced", program: "Treatment program", city: "", course: 5, bio: "Bio coming soon." },
  { id: "c06", name: "Chef to be announced", program: "Treatment program", city: "", course: 6, bio: "Bio coming soon." },
  { id: "c07", name: "Chef Brian Meiler", program: "Recovery Nexus", city: "Colorado Springs", course: 7, bio: "Maker of the small-batch jam and hot sauce in every guest's gift bag. Full bio coming soon." },
  { id: "c08", name: "Chef to be announced", program: "Treatment program", city: "", course: 8, bio: "Bio coming soon." },
  { id: "c09", name: "Chef to be announced", program: "Treatment program", city: "", course: 9, bio: "Bio coming soon." },
  { id: "c10", name: "Chef to be announced", program: "Treatment program", city: "", course: 10, bio: "Bio coming soon." },
];

/* Silent auction. Amounts in whole dollars. `start` is the opening bid,
   `step` the minimum raise. Values and photos are placeholders. */
export const LOTS = [
  { id: "lot-01", no: 1, title: "Vermejo Park Ranch", where: "New Mexico", feature: true, start: 2500, step: 250, value: "", body: "A multi-night stay at Ted Turner's 550,000-acre private luxury guest ranch." },
  { id: "lot-02", no: 2, title: "Duck & goose hunt", where: "Northern California", start: 750, step: 50, value: "", body: "A guided waterfowl hunt." },
  { id: "lot-03", no: 3, title: "Guided fly fishing", where: "Arkansas", start: 500, step: 50, value: "", body: "A guided day on the water." },
  { id: "lot-04", no: 4, title: "Guided fly fishing", where: "Taos, New Mexico", start: 500, step: 50, value: "", body: "A guided day on the water." },
  { id: "lot-05", no: 5, title: "Guided fly fishing", where: "Virginia", start: 500, step: 50, value: "", body: "A guided day on the water." },
  { id: "lot-06", no: 6, title: "Whitewater rafting", where: "Colorado", start: 400, step: 25, value: "", body: "Hosted by Adventure Recovery." },
  { id: "lot-07", no: 7, title: "Surfing experience", where: "", start: 400, step: 25, value: "", body: "Hosted by Waves to Recovery." },
  { id: "lot-08", no: 8, title: "Denver Broncos tickets", where: "Denver", start: 300, step: 25, value: "", body: "Game-day seats." },
];

export const FEEDBACK = [
  { id: "overall", type: "stars", label: "How would you rate the evening overall?" },
  { id: "highlight", type: "choice", label: "What was the highlight for you?", options: ["The food", "The reveal", "Silent auction", "Golf", "The people", "Music"] },
  { id: "return", type: "choice", label: "Would you come back for Taste of Recovery 2028?", options: ["Definitely", "Maybe", "Probably not"] },
  { id: "app", type: "stars", label: "How easy was this app to use?" },
  { id: "improve", type: "text", label: "Anything we should do differently next year?", optional: true },
];
