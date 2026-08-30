// ============================================================
// WEDDING PLANNER — single configuration file.
// Fork the repo, edit this file, deploy your own Apps Script
// (see SETUP.md) and you have your own RSVP site.
// ============================================================

const CONFIG = {
  // URL of your deployed Google Apps Script Web App.
  // Leave empty ("") for DEMO MODE: the site runs with fake data
  // so you can preview it before any backend setup.
  gasUrl: "https://script.google.com/macros/s/AKfycbzXJzZQUhaK_FKSZn_s8jQaxCmkeqUeDsLakbM-ni5vdObCDk4tcMwgwr1kPtnfOhRFfQ/exec",

  // PRIVACY: dates, venues and program below are FICTIONAL demo placeholders —
  // the real ones live in the Google Sheet (Config tab, site_* keys) and are
  // fetched at runtime. Put your names here (or leave a placeholder and set
  // couple_names in the Sheet if you don't want them in your repo).
  coupleNames: "Wafa & Lorenzo",
  defaultLang: "fr",             // "fr" or "en"

  // Countries offered in the RSVP dropdown (value kept as the label).
  countries: {
    fr: ["Allemagne", "Tunisie", "France", "Royaume-Uni", "Hongrie", "Espagne"],
    en: ["Germany", "Tunisia", "France", "United Kingdom", "Hungary", "Spain"]
  },

  // The two weddings. Keys "bretagne" / "tunis" are used internally;
  // real dates/places come from the Sheet (Config: bretagne_date_fr, …).
  events: {
    bretagne: {
      dateLabel: { fr: "date à venir", en: "date to come" },
      place: { fr: "Bretagne, France", en: "Brittany, France" },
      color: "#2563eb" // blue
    },
    tunis: {
      dateLabel: { fr: "date à venir", en: "date to come" },
      place: { fr: "Tunisie", en: "Tunisia" },
      color: "#ea580c" // orange
    }
  },

  // Timeline "our story" — fictional demo; real items come from the Sheet
  // (Config keys timeline_fr / timeline_en, see SETUP.md). Photos are polaroids;
  // an item without a photo shows a botanical ornament instead.
  timeline: {
    fr: [
      { date: "2019", text: "Notre rencontre", media: [] },
      { date: "2026", text: "La demande", media: [] },
      { date: "2027", text: "Deux mariages, deux pays", media: [] }
    ],
    en: [
      { date: "2019", text: "How we met", media: [] },
      { date: "2026", text: "The proposal", media: [] },
      { date: "2027", text: "Two weddings, two countries", media: [] }
    ]
  },

  // All user-facing texts, FR + EN.
  texts: {
    fr: {
      title: "Bienvenue au mariage de",
      intro: "Joignez-vous à nous pour célébrer notre amour.",
      programTitle: "Le programme",
      timelineTitle: "Notre histoire",
      bretagneTitle: "Bretagne",
      bretagneDesc: "Cérémonie et fête.",
      tunisTitle: "Tunisie",
      tunisDesc: "Les traditions d'abord, puis le mariage.",
      tunisDays: [
        "Journées traditionnelles (détails selon votre invitation)",
        "Dernier jour : le mariage"
      ],
      rules: "Mariage entre adultes : sans enfants, et sans chiens.",
      noToken: "Pour répondre, utilisez le lien personnel que nous vous avons envoyé. Vous ne le retrouvez pas ? Écrivez-nous !",
      badToken: "Ce lien ne semble pas valide. Vérifiez le message que nous vous avons envoyé, ou écrivez-nous.",
      loading: "Chargement…",
      hello: "Bonjour",
      pollBanner: "Première étape : dites-nous où vous iriez. Ce n'est pas encore la réponse définitive — elle nous aide à réserver.",
      rsvpBanner: "C'est la vraie réponse cette fois : elle est définitive 24 h après envoi.",
      step2Title: "",
      plusOneLabel: "Je viens accompagné(e) (+1)",
      cityLabel: "Votre ville",
      countryLabel: "Votre pays",
      countryPlaceholder: "Choisir…",
      step3Title: "Votre choix",
      choiceQuestionPoll: "Où iriez-vous ?",
      choiceQuestionRsvp: "Où venez-vous ?",
      choiceBretagne: "Bretagne",
      choiceTunis: "Tunisie",
      choiceDecline: "Je ne pourrai pas venir",
      vipIntro: "Vous êtes invité(e) aux deux mariages ! Répondez pour chacun :",
      vipYes: "J'y serai",
      vipMaybe: "Pas encore sûr",
      vipNo: "Non",
      maybeShort: "peut-être",
      placesLeft: "places restantes",
      full: "complet",
      step4Title: "Détails Tunisie",
      earlyArrivalQ: "Serez-vous là pour les journées traditionnelles ou seulement le mariage ?",
      earlyYes: "Toutes les journées, traditions comprises",
      earlyNo: "Seulement le jour du mariage",
      hammamQ: "Hammam (hommes et femmes séparés) — vous en êtes ?",
      soireeQ: "Soirée de la femme (robes traditionnelles) — vous en êtes ?",
      yes: "Oui",
      no: "Non",
      noteLabel: "Un mot pour nous ? (optionnel)",
      submit: "Envoyer ma réponse",
      update: "Modifier ma réponse",
      next: "Continuer",
      back: "Retour",
      successTitle: "Merci !",
      successBody: "Votre réponse est bien enregistrée.",
      editUntil: "Vous pouvez la modifier jusqu'au",
      editClosed: "Le délai de modification de 24 h est passé. Pour tout changement, écrivez-nous directement.",
      errCapacity: "Ce lieu est complet, désolés. Écrivez-nous, on trouvera une solution.",
      errGeneric: "Une erreur est survenue. Réessayez, ou écrivez-nous.",
      alreadyAnswered: "Votre réponse actuelle :",
      required: "Merci de remplir ce champ."
    },
    en: {
      title: "Welcome to the wedding of",
      intro: "Join us in celebrating our love.",
      programTitle: "The program",
      timelineTitle: "Our story",
      bretagneTitle: "Brittany",
      bretagneDesc: "Ceremony and party.",
      tunisTitle: "Tunisia",
      tunisDesc: "Traditions first, then the wedding.",
      tunisDays: [
        "Traditional days (details depend on your invitation)",
        "Last day: the wedding"
      ],
      rules: "Adults-only wedding: no children, no dogs.",
      noToken: "To answer, use the personal link we sent you. Can't find it? Message us!",
      badToken: "This link doesn't look valid. Check the message we sent you, or contact us.",
      loading: "Loading…",
      hello: "Hello",
      pollBanner: "First step: tell us where you would go. Not binding yet — it helps us book.",
      rsvpBanner: "This is the real answer: it becomes final 24h after you send it.",
      step2Title: "",
      plusOneLabel: "I'm bringing a guest (+1)",
      cityLabel: "Your city",
      countryLabel: "Your country",
      countryPlaceholder: "Choose…",
      step3Title: "Your choice",
      choiceQuestionPoll: "Where would you go?",
      choiceQuestionRsvp: "Where are you coming?",
      choiceBretagne: "Brittany",
      choiceTunis: "Tunisia",
      choiceDecline: "I won't be able to come",
      vipIntro: "You are invited to both weddings! Answer for each:",
      vipYes: "I'll be there",
      vipMaybe: "Not sure yet",
      vipNo: "No",
      maybeShort: "maybe",
      placesLeft: "places left",
      full: "full",
      step4Title: "Tunisia details",
      earlyArrivalQ: "Will you be there for the traditional days or only the wedding?",
      earlyYes: "All the days, traditions included",
      earlyNo: "Only the wedding day",
      hammamQ: "Hammam (men and women separated) — are you in?",
      soireeQ: "Women's ceremony (traditional dresses) — are you in?",
      yes: "Yes",
      no: "No",
      noteLabel: "A word for us? (optional)",
      submit: "Send my answer",
      update: "Update my answer",
      next: "Continue",
      back: "Back",
      successTitle: "Thank you!",
      successBody: "Your answer is saved.",
      editUntil: "You can change it until",
      editClosed: "The 24h modification window has closed. For any change, contact us directly.",
      errCapacity: "This venue is full, sorry. Message us and we'll figure something out.",
      errGeneric: "Something went wrong. Try again, or contact us.",
      alreadyAnswered: "Your current answer:",
      required: "Please fill in this field."
    }
  }
};
