/* ===================================================================
   LULU TRAJET · V6
   Point d'entrée. Modules ES natifs, aucun outil de construction.

   Ce fichier ne contient AUCUNE règle pédagogique. Il orchestre :
   il demande un exercice au moteur de séance, le joue via la machine
   audio, transmet le résultat au modèle de preuves, et peint l'écran.

   La séparation est volontaire. Chaque fois qu'une règle a vécu dans
   ce fichier, elle a fini par diverger de celle que les tests
   vérifiaient.
   =================================================================== */

import * as C from "./content/index.js";
import * as Ex from "./content/exercices.js";
import * as S from "./core/state.js";
import * as Sess from "./core/session.js";
import * as Sched from "./core/scheduler.js";
import * as Preuve from "./core/preuve.js";
import * as Profil from "./core/profil.js";
import { restituer } from "./core/restitution.js";
import * as Machine from "./audio/machine.js";
import * as Tts from "./audio/tts.js";
import * as Micro from "./audio/mic.js";
import * as VoixModele from "./audio/voix-modele.js";
import * as Tentatives from "./audio/tentative.js";
import { jouer, reussie as lectureReussie } from "./audio/lecture.js";
import * as Moteur from "./speech/engine.js";
import { NATURE } from "./speech/engine.js";
import * as Providers from "./speech/provider.js";
import * as Prononciation from "./speech/prononciation.js";
import { creerLuxasr } from "./speech/providers/index.js";
import { creerNavigateur, creerAucun } from "./speech/providers/repli.js";
import * as Plateforme from "./platform/index.js";
import * as Diagnostic from "./ui/diagnostic.js";
import { TYPES } from "./content/exercices.js";

export const VERSION = "6.0.0";

const $ = (id) => document.getElementById(id);
const echapper = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- état d'exécution ---------- */

let plateforme = null;
let audio = null;
let jetonAudio = 0;
let seance = null;
let jetonSeance = 0;
let enPause = false;
let exerciceCourant = null;
let sautEnAttente = false;
let filtreContenu = "tout";

export const ISSUE = { TERMINE: "termine", PAUSE: "pause", SAUTE: "saute", ABANDONNE: "abandonne" };

/* ===================================================================
   DÉMARRAGE
   =================================================================== */

export async function initialiser() {
  plateforme = Plateforme.detecter();
  S.brancherStockage(plateforme.stockage);
  await S.charger();

  // Fournisseurs de reconnaissance. L'ordre est la seule chose à
  // changer le jour où un nouveau moteur devient disponible.
  Providers.reinitialiser();
  Providers.enregistrer(creerLuxasr({
    jeton: async () => "",
    // Tant que l'autorisation d'intégration n'est pas obtenue, ce
    // fournisseur se déclare indisponible et dit pourquoi.
    autorise: () => false
  }));
  Providers.enregistrer(creerNavigateur({ langue: "de-DE" }));
  Providers.enregistrer(creerAucun());
  Providers.definirOrdre(["luxasr", "navigateur", "aucun"]);

  // Voix du modèle. L'audio natif passe devant dès qu'un fichier existe.
  VoixModele.reinitialiser();
  VoixModele.enregistrer(VoixModele.creerAudioNatif({
    resoudre: async (phrase, vitesse) => {
      const a = phrase?.audio;
      if (!a) return null;
      return vitesse === "lent" ? (a.lent || a.normal || null) : (a.normal || null);
    },
    lecteur: async (url, opt) => {
      const r = await jouer(await (await fetch(url)).blob(), opt);
      return { joue: lectureReussie(r), cause: r.etat, dureeMs: r.dureeMs };
    }
  }));
  VoixModele.enregistrer(VoixModele.creerSynthese({ tts: Tts }));

  Tentatives.brancherStockage(null);   // aucun disque tant qu'il n'y a pas consentement
  await Tentatives.definirConsentement(!!S.state().reglages.conserverMaVoix);

  await Tts.preparer();
  brancherInterface();
  peindre();
  enregistrerServiceWorker();
}

/* ===================================================================
   SÉANCE
   =================================================================== */

export async function demarrerSeance(duree) {
  if (audio?.occupe()) { alerte("Une séance est déjà en cours."); return; }

  const minutes = duree === "trajet" ? Number(S.state().reglages.duree || 20) : Number(duree) || 10;
  const mode = duree === "trajet" ? Sess.MODES.TRAJET : Sess.MODES.APPRENTISSAGE;

  audio = Machine.creer({ onEtat: () => {} });
  const dep = await audio.demarrer();
  if (!dep.ok) {
    audio = null;
    alerte(dep.cause === "contexte_audio_endormi"
      ? "Le moteur audio n'a pas démarré. Touche l'écran, puis réessaie."
      : "Une séance est déjà en cours.");
    return;
  }
  jetonAudio = dep.jeton;
  await plateforme.audio.preparerSession("mixte");
  await plateforme.audio.gardeEveil(true);

  const niveau = S.state().parcours.niveau || 1;
  const disponibles = C.phrases().filter((p) => p.niveau <= niveau);

  const s = Sess.creerSeance({
    mode,
    dureeMinutes: minutes,
    phrases: disponibles,
    dialogues: C.dialoguesDuNiveau(niveau),
    progressionDe: (id) => S.progressionDe(id),
    profil: S.state().profilVocal
  });

  if (!s.file.length && !s.recyclage.length) {
    await audio.terminer("aucun_contenu");
    audio = null;
    alerte("Aucun contenu disponible pour ce mode.");
    return;
  }

  seance = s;
  jetonSeance += 1;
  enPause = false;
  exerciceCourant = null;
  sautEnAttente = false;

  $("seance").classList.add("on");
  document.body.style.overflow = "hidden";
  $("sPause").textContent = "Pause";
  $("sMode").textContent = mode === Sess.MODES.TRAJET ? "Mode trajet" : `Séance ${minutes} min`;

  Sess.demarrer(seance);
  activerCommandesSysteme();

  await audio.direConsigne(mode === Sess.MODES.TRAJET
    ? "Mode trajet. Pose le téléphone. Réponds toujours à voix haute."
    : "On commence. Réponds à voix haute.");

  await boucle(jetonSeance);
}

async function boucle(jeton) {
  while (seance && jeton === jetonSeance) {
    if (sautEnAttente && exerciceCourant) {
      Sess.sauterExercice(seance, exerciceCourant);
      exerciceCourant = null;
      sautEnAttente = false;
      majBandeau();
      continue;
    }
    if (enPause) { await patienter(180); continue; }

    const ex = exerciceCourant || Sess.prochain(seance);
    if (!ex) break;
    exerciceCourant = ex;
    majBandeau();

    audio?.reinitialiserMotif();
    const t0 = Date.now();
    const issue = await jouerExercice(ex, jeton);

    if (!seance || jeton !== jetonSeance) return;
    if (issue === ISSUE.ABANDONNE) return;
    if (issue === ISSUE.PAUSE) continue;          // rien n'est consommé
    if (issue === ISSUE.SAUTE) {
      Sess.sauterExercice(seance, ex);
      exerciceCourant = null;
      sautEnAttente = false;
      continue;
    }
    Sess.terminerExercice(seance, ex, Date.now() - t0);
    noterReprise(ex);
    exerciceCourant = null;
  }
  if (seance && jeton === jetonSeance) await clore();
}

function issueCourante() {
  const m = audio?.motif();
  if (m === Machine.MOTIF.PAUSE) return ISSUE.PAUSE;
  if (m === Machine.MOTIF.SUIVANT) return ISSUE.SAUTE;
  if (m === Machine.MOTIF.SORTIE || m === Machine.MOTIF.SYSTEME) return ISSUE.ABANDONNE;
  if (!seance) return ISSUE.ABANDONNE;
  return ISSUE.TERMINE;
}

/* ---------- Un exercice ---------- */

async function jouerExercice(ex, jeton) {
  const vivant = () => seance && jeton === jetonSeance && (!audio || audio.vivant(jetonAudio));

  if (ex.type === TYPES.ECOUTE_DIALOGUE.id) return jouerDialogue(ex, jeton);
  if (ex.type === TYPES.DIALOGUE.id) return jouerTourDeDialogue(ex, jeton);

  const p = ex.it;
  if (!p) return ISSUE.TERMINE;

  /* --- Exercices d'écoute : aucune parole demandée --- */
  if (ex.type === TYPES.ECOUTE.id || ex.type === TYPES.ECOUTE_LENTE.id) {
    const lent = ex.type === TYPES.ECOUTE_LENTE.id;
    scene({ phase: lent ? "Écoute, lentement" : "Écoute", lb: p.lb, ph: p.ph });
    await direModele(p, lent ? "lent" : "normal");
    if (!vivant()) return issueCourante();
    scene({ phase: "Ce que ça veut dire", lb: p.lb, ph: p.ph, fr: p.fr });
    await audio.direConsigne(p.fr);
    if (!vivant()) return issueCourante();
    // Une écoute ne fait monter AUCUNE dimension. Elle est comptée
    // comme exposition, et rien d'autre.
    S.enregistrerExposition(p.id);
    return issueCourante();
  }

  /* --- Répétition : le modèle d'abord, puis la voix de l'apprenant --- */
  if (ex.type === TYPES.REPETITION.id) {
    scene({ phase: "Répète après moi", lb: p.lb, ph: p.ph });
    await direModele(p, "normal");
    if (!vivant()) return issueCourante();
    return await tourDeParole(ex, p, { consigne: "", montrerReponse: true, jeton });
  }

  /* --- Compréhension : on entend, on doit dire le sens --- */
  if (ex.type === TYPES.COMPREHENSION.id) {
    scene({ phase: "Qu'est-ce que ça veut dire ?", lb: p.lb });
    await direModele(p, "normal");
    if (!vivant()) return issueCourante();
    await audio.attendreUtilisateur(2600);
    if (!vivant()) return issueCourante();
    scene({ phase: "Le sens", lb: p.lb, ph: p.ph, fr: p.fr });
    await audio.direConsigne(p.fr);
    if (!vivant()) return issueCourante();
    S.enregistrerExposition(p.id);
    return issueCourante();
  }

  /* --- Nombre --- */
  if (ex.type === TYPES.NOMBRE.id) {
    scene({ phase: "Quel nombre ?", lb: p.lb });
    await direModele(p, "normal");
    if (!vivant()) return issueCourante();
    await audio.attendreUtilisateur(2400);
    if (!vivant()) return issueCourante();
    scene({ phase: "Réponse", lb: p.lb, fr: p.fr });
    await audio.direConsigne(p.fr);
    S.enregistrerExposition(p.id);
    return issueCourante();
  }

  /* --- Variation : même structure, autre mot --- */
  if (ex.type === TYPES.VARIATION.id) {
    const autre = C.parId(ex.idAutre);
    scene({ phase: "Même structure", consigne: autre ? `Tu sais dire : ${autre.fr}. Maintenant dis : ${p.fr}` : `Comment dis-tu : ${p.fr} ?` });
    if (autre) { await direModele(autre, "normal"); if (!vivant()) return issueCourante(); }
    return await tourDeParole(ex, p, { consigne: `Comment dis-tu : ${p.fr} ?`, montrerReponse: true, jeton });
  }

  /* --- Discrimination : deux formes proches --- */
  if (ex.type === TYPES.DISCRIMINATION.id) {
    const autre = C.parId(ex.idAutre);
    if (autre) {
      scene({ phase: "Deux phrases proches", consigne: "Écoute la différence." });
      await direModele(p, "normal"); if (!vivant()) return issueCourante();
      await audio.direConsigne(p.fr); if (!vivant()) return issueCourante();
      await direModele(autre, "normal"); if (!vivant()) return issueCourante();
      await audio.direConsigne(autre.fr); if (!vivant()) return issueCourante();
    }
    return await tourDeParole(ex, p, { consigne: `Maintenant dis : ${p.fr}`, montrerReponse: true, jeton });
  }

  /* --- Rappel, production, fluidité, test différé : parler d'abord --- */
  const rapide = ex.type === TYPES.FLUIDITE.id;
  const phases = {
    [TYPES.RAPPEL.id]: "Retrouve la phrase",
    [TYPES.PRODUCTION.id]: "À toi",
    [TYPES.FLUIDITE.id]: "Vite, sans réfléchir",
    [TYPES.TEST_DIFFERE.id]: "Contrôle"
  };
  scene({ phase: phases[ex.type] || "À toi", consigne: `Comment dis-tu : ${p.fr} ?` });
  await audio.direConsigne(rapide ? p.fr : `Comment dis-tu : ${p.fr} ?`);
  if (!vivant()) return issueCourante();
  return await tourDeParole(ex, p, { consigne: "", montrerReponse: true, rapide, jeton });
}

/**
 * Tour de parole complet : capture, reconnaissance, verdict, écriture,
 * puis restitution retour → ta voix → modèle.
 */
async function tourDeParole(ex, p, { montrerReponse, rapide, jeton }) {
  const vivant = () => seance && jeton === jetonSeance && (!audio || audio.vivant(jetonAudio));
  const reg = S.state().reglages;

  await audio.attendreUtilisateur(rapide ? 250 : 600);
  if (!vivant()) return issueCourante();

  $("sEcoute").classList.add("on");
  $("sNiveau").classList.add("on");

  const r = await Moteur.evaluerReponse(p, {
    capturer: (o) => audio.capturerReponse(o),
    idSession: seance.idSession,
    idExercice: ex.id || `${p.id}:${ex.type}`,
    prefere: reg.reconnaissance || "auto",
    profil: reg.profilAudio,
    attenteMaxMs: rapide ? Math.max(2500, reg.attenteMaxMs - 1200) : reg.attenteMaxMs,
    paroleMaxMs: reg.paroleMaxMs,
    contexte: C.vocabulaireDuPaquet(p.paquet, 30),
    enLigne: navigator.onLine !== false,
    plateforme: plateforme.id,
    onNiveau: peindreNiveau,
    annule: () => !vivant() || enPause
  });

  $("sEcoute").classList.remove("on");
  $("sNiveau").classList.remove("on");
  if (!vivant()) return issueCourante();

  seance.tentatives += 1;
  if (r.fiable) seance.probantes += 1;
  if (r.nature === NATURE.REUSSITE) seance.reussites += 1;

  scene({
    phase: libellePhase(r),
    classe: classePhase(r),
    lb: montrerReponse ? p.lb : "",
    ph: montrerReponse ? p.ph : "",
    fr: p.fr,
    // « Entendu » n'apparaît QUE s'il y a eu une transcription réelle.
    entendu: r.transcripts.length ? (r.match?.texte || "") : "",
    note: noteDe(r)
  });

  ecrirePreuve(ex, p, r);
  S.noterProfil(r);

  if (r.vad) {
    S.enregistrerRythme(p.id, {
      attemptDetected: !!r.speechDetected,
      speechDurationMs: r.speechMs,
      rhythmSimilarity: 0,
      syllabicGroups: r.rythme?.noyaux || 0,
      localAudioQuality: Math.max(0, Math.min(1, (r.snrDb || 0) / 40))
    });
  }

  // Retour, ta voix, puis le modèle. Le dernier son entendu est
  // toujours la forme cible, jamais l'erreur de l'apprenant.
  await restituer({
    audio,
    item: p,
    vivant,
    resultat: {
      engine: r.providerId === "aucun" || !r.transcripts.length ? "local" : (r.probant ? "cloud" : "browser"),
      fiable: r.fiable,
      correct: r.nature === NATURE.REUSSITE,
      messageRythme: r.messageRythme || ""
    },
    messageVerdict: r.message,
    echoActive: !!reg.echo,
    // L'écho reçoit le Blob de CETTE tentative, par son identifiant.
    rejouer: () => rejouerMaVoix(r.attemptId)
  });

  return issueCourante();
}

/**
 * Écriture pédagogique.
 * Une seule porte d'entrée, un seul test à écrire pour la garder fermée.
 */
function ecrirePreuve(ex, p, r) {
  if (!r.ecrivable) return { ecrit: false, raison: "non_probant" };
  const dim = ex.dim || Ex.typeDe(ex.type)?.dim;
  if (!dim) return { ecrit: false, raison: "type_sans_dimension" };
  const w = S.enregistrerPreuve(p.id, {
    dim,
    source: Preuve.SOURCE.TRANSCRIPTION,
    reussi: r.nature === NATURE.REUSSITE,
    avecIndice: ex.type === TYPES.REPETITION.id,   // le modèle a été entendu juste avant
    latenceMs: r.totalMs,
    attemptId: r.attemptId
  });
  // Produire depuis le français sans modèle prouve aussi le rappel.
  if (w.ecrit && r.nature === NATURE.REUSSITE && dim === Preuve.DIM.PRODUCTION && ex.type !== TYPES.REPETITION.id) {
    S.enregistrerPreuve(p.id, {
      dim: Preuve.DIM.RAPPEL, source: Preuve.SOURCE.TRANSCRIPTION,
      reussi: true, avecIndice: false, latenceMs: r.totalMs, attemptId: r.attemptId
    });
  }
  return w;
}

async function rejouerMaVoix(attemptId) {
  const blob = Tentatives.blobDe(attemptId);
  if (!blob) {
    afficherNote("Aucun enregistrement à réécouter pour cette tentative.");
    return null;
  }
  const res = await audio.rejouerVoix(blob);
  if (!lectureReussie(res)) afficherNote(res.message || "Ta voix n'a pas pu être rejouée.");
  return res;
}

/* ---------- Dialogues ---------- */

async function jouerDialogue(ex, jeton) {
  const vivant = () => seance && jeton === jetonSeance && (!audio || audio.vivant(jetonAudio));
  const d = ex.dialogue;
  scene({ phase: "Conversation", consigne: d.t });
  await audio.direConsigne("Écoute cette conversation. Essaie de saisir le sens général.");
  if (!vivant()) return issueCourante();
  for (const rep of d.l) {
    if (!vivant()) return issueCourante();
    scene({ phase: rep.q === "A" ? "Lui" : "Toi", lb: rep.lb, fr: rep.fr });
    await VoixModele.dire({ lb: rep.lb }, { vitesse: "normal" });
    if (!vivant()) return issueCourante();
    await audio.direConsigne(rep.fr);
  }
  return issueCourante();
}

async function jouerTourDeDialogue(ex, jeton) {
  const vivant = () => seance && jeton === jetonSeance && (!audio || audio.vivant(jetonAudio));
  const d = ex.dialogue;
  const tour = typeof ex.tour === "number" ? ex.tour : d.l.findIndex((r) => r.q === "B");
  const avant = d.l[tour - 1];
  const attendu = d.l[tour];
  if (!attendu) return ISSUE.TERMINE;

  scene({ phase: "À toi de répondre", consigne: d.t });
  if (avant) {
    scene({ phase: "Il te dit", lb: avant.lb, fr: avant.fr });
    await VoixModele.dire({ lb: avant.lb }, { vitesse: "normal" });
    if (!vivant()) return issueCourante();
  }
  const phrase = { id: `${d.id}:${tour}`, lb: attendu.lb, fr: attendu.fr, ph: "", alt: [], paquet: "", syl: null };
  return await tourDeParole({ ...ex, dim: TYPES.DIALOGUE.dim }, phrase, { montrerReponse: true, jeton });
}

/* ---------- Voix du modèle ---------- */

async function direModele(phrase, vitesse) {
  const r = await VoixModele.dire(phrase, { vitesse });
  if (r.avertissement) afficherNote(r.avertissement);
  return r;
}

/* ---------- Clôture ---------- */

async function clore() {
  const b = Sess.bilan(seance);
  scene({ phase: "Bilan", consigne: texteBilan(b) });
  await audio?.direConsigne(texteBilan(b));

  const j = S.state().journal;
  const auj = new Date().toLocaleDateString("fr-FR");
  if (j.last !== auj) {
    const hier = new Date(Date.now() - 86400000).toLocaleDateString("fr-FR");
    j.streak = j.last === hier ? (j.streak || 0) + 1 : 1;
  }
  j.sessions = (j.sessions || 0) + 1;
  j.minutes = (j.minutes || 0) + b.minutes;
  j.last = auj;
  j.hist = j.hist || {};
  const cle = Sched.aujourdHui();
  j.hist[cle] = (j.hist[cle] || 0) + b.minutes;

  S.noterReprise({ mode: seance.mode, position: seance.index, minutes: b.minutesCible, terminee: true });
  await S.sauver({ immediat: true });
  await terminerSeance("fin");
}

function texteBilan(b) {
  const parts = [`Séance terminée. ${b.exercices} exercices en ${b.minutes} minutes.`];
  if (b.probantes > 0) parts.push(`${b.reussites} réponses justes sur ${b.probantes} vérifiées.`);
  else parts.push("Aucune réponse n'a pu être vérifiée par un moteur. Ta progression n'a pas bougé pour autant.");
  if (b.nouvellesIntroduites) parts.push(`${b.nouvellesIntroduites} nouvelles phrases ouvertes.`);
  parts.push("À bientôt.");
  return parts.join(" ");
}

export async function terminerSeance(raison = "sortie") {
  jetonSeance += 1;
  const s = seance;
  seance = null;
  exerciceCourant = null;
  enPause = false;
  if (s) S.noterReprise({ mode: s.mode, position: s.index, minutes: Math.round(s.cibleMs / 60000), terminee: raison === "fin" });
  try { await audio?.terminer(raison); } catch (_) {}
  audio = null;
  await plateforme?.audio.gardeEveil(false);
  await plateforme?.audio.libererSession();
  $("seance").classList.remove("on");
  document.body.style.overflow = "";
  await S.sauver({ immediat: true });
  peindre();
}

/* ===================================================================
   AFFICHAGE DE LA SÉANCE
   =================================================================== */

function scene({ phase = "", classe = "", consigne = "", lb = "", ph = "", fr = "", entendu = "", note = "" }) {
  const ph_ = $("sPhase");
  ph_.textContent = phase;
  ph_.className = "s-phase" + (classe ? " " + classe : "");
  poser("sConsigne", consigne);
  poser("sLb", lb);
  poser("sPh", ph);
  poser("sFr", fr);
  poser("sEntendu", entendu);
  $("sNote").textContent = note || "";
}

function poser(id, texte) {
  const el = $(id);
  if (!el) return;
  el.textContent = texte || "";
  el.classList.toggle("on", !!texte);
}

const afficherNote = (t) => { const el = $("sNote"); if (el) el.textContent = t || ""; };

function libellePhase(r) {
  if (r.nature === NATURE.REUSSITE) return "C'est ça";
  if (r.nature === NATURE.ERREUR_UTILISATEUR) return "Pas encore";
  if (r.nature === NATURE.PANNE_TECHNIQUE) return "Problème technique";
  return "Non vérifié";
}
const classePhase = (r) =>
  r.nature === NATURE.REUSSITE ? "ok"
  : r.nature === NATURE.ERREUR_UTILISATEUR ? "ko"
  : "att";

/**
 * Note affichée sous le verdict.
 * Elle explique la NATURE de ce qui s'est passé. Une panne n'est
 * jamais formulée comme une faute.
 */
function noteDe(r) {
  if (r.nature === NATURE.PANNE_TECHNIQUE) return `${r.message} ${r.detail || r.error || ""}`.trim();
  if (r.nature === NATURE.INCERTITUDE_MOTEUR) {
    if (r.detailRythme) return `${r.message} Rythme mesuré, les mots ne sont pas analysés : ${r.detailRythme}`;
    return r.message;
  }
  if (!r.probant && r.transcripts.length) return r.reserve || "";
  return "";
}

function peindreNiveau({ db }) {
  const el = $("sNiveau");
  if (!el) return;
  const pct = Math.max(0, Math.min(100, Math.round(((db + 70) / 55) * 100)));
  el.style.setProperty("--niveau", pct + "%");
}

function majBandeau() {
  if (!seance) return;
  $("sTemps").textContent = `${Math.ceil(Sess.restantMs(seance) / 60000)} min restantes`;
  $("sPosition").textContent = `${seance.index + 1} sur ${seance.file.length}`;
  $("sPiste").style.width = Math.round(Sess.progressionTemps(seance) * 100) + "%";
}

function noterReprise(ex) {
  if (!seance) return;
  S.noterReprise({
    mode: seance.mode,
    idPhrase: ex.it?.id || "",
    position: seance.index,
    minutes: Math.round(seance.cibleMs / 60000),
    terminee: false
  });
}

/* ===================================================================
   INTERFACE PRINCIPALE
   =================================================================== */

export function peindre() {
  const niveau = S.state().parcours.niveau || 1;
  const phrases = C.phrases().filter((p) => p.niveau <= niveau);
  const tb = Sched.tableauDeBord(C.phrases(), (id) => S.progressionDe(id));

  $("compteur").innerHTML = S.state().journal.sessions
    ? `${Math.round(S.state().journal.minutes)} min<br>${S.state().journal.streak || 0} jours de suite`
    : "";

  $("kpiRevoir").textContent = tb.aRevoir;
  $("kpiSolides").textContent = tb.solides;

  $("pRencontrees").textContent = tb.rencontrees;
  $("pComprises").textContent = tb.comprises;
  $("pRappelees").textContent = tb.rappelees;
  $("pProduites").textContent = tb.produites;
  $("pSolides").textContent = tb.solides;
  $("pSolidesDetail").textContent = `sur ${tb.total} phrases du programme`;
  $("pJauge").style.width = Math.round((tb.solides / Math.max(1, tb.total)) * 100) + "%";

  const r = S.state().reprise;
  const btnR = $("btnReprendre");
  if (r?.dateMs && !r.terminee) {
    btnR.hidden = false;
    $("reprendreDetail").textContent = `Séance ${r.minutes || 20} min, interrompue`;
  } else btnR.hidden = true;

  $("avisPrononciation").innerHTML =
    `<b>${echapper(Prononciation.MESSAGE_INDISPONIBLE)}</b><br>${echapper(Prononciation.EXPLICATION)}`;

  $("limitesHonnetes").innerHTML = LIMITES.map((l) => `• ${echapper(l)}`).join("<br>");

  peindreParcours();
  peindreDifficultes();
  peindreContenu();
  peindreAvisVoix();
  peindreEnregistrements();
  peindreProviders();
  peindreReglages();
}

const LIMITES = [
  "La prononciation n'est pas notée. Aucun outil ne sait le faire en luxembourgeois aujourd'hui.",
  "Les phrases ne sont pas encore vérifiées par un locuteur. Chaque phrase indique son statut.",
  "Aucun enregistrement de locuteur luxembourgeois n'est livré. Le modèle est dit par la voix du téléphone.",
  "En navigateur, la voix s'arrête quand l'écran se verrouille.",
  "La reconnaissance luxembourgeoise demande une autorisation qui n'est pas encore obtenue."
];

function peindreParcours() {
  const niveauCourant = S.state().parcours.niveau || 1;
  let html = "";
  for (const n of C.NIVEAUX()) {
    const paquets = C.paquetsDuNiveau(n.n);
    const phrases = paquets.flatMap((pk) => C.phrasesDuPaquet(pk.id));
    const solides = phrases.filter((p) => Sched.estSolide(S.progressionDe(p.id))).length;
    const ouvert = n.n <= niveauCourant;
    html += `<div class="rang">
      <div class="rang-c">
        <div class="rang-t">${echapper(n.titre)}</div>
        <div class="rang-d">${echapper(n.but)}</div>
        <div class="jauge"><span style="width:${Math.round(solides / Math.max(1, phrases.length) * 100)}%"></span></div>
      </div>
      <div class="etiq ${ouvert ? (n.n === niveauCourant ? "cours" : "ok") : ""}">${ouvert ? (n.n === niveauCourant ? "En cours" : "Ouvert") : "À venir"}</div>
    </div>`;
  }
  $("listeParcours").innerHTML = html;
}

function peindreDifficultes() {
  const resume = Profil.resume(S.state().profilVocal, (id) => C.parId(id)?.paquet || "");
  const bloc = [];

  if (!resume.tentatives) {
    bloc.push(`<div class="p">Rien à afficher pour l'instant. Cette page se remplit à partir de tes tentatives réelles.</div>`);
  } else {
    if (resume.difficiles.length) {
      bloc.push(`<div class="h2">Phrases souvent ratées</div>` + resume.difficiles.slice(0, 8).map((d) => {
        const p = C.parId(d.id);
        return p ? `<div class="rang"><div class="rang-c"><div class="rang-t">${echapper(p.lb)}</div><div class="rang-d">${echapper(p.fr)}</div></div><div class="etiq ko">${d.echecs} ratés</div></div>` : "";
      }).join(""));
    }
    if (resume.nonReconnues.length) {
      bloc.push(`<div class="h2">Phrases que le moteur ne reconnaît pas</div>
        <div class="p">Ce n'est pas une information sur toi, mais sur l'outil. Le moteur n'a jamais entendu de luxembourgeois parlé par un francophone.</div>`
        + resume.nonReconnues.slice(0, 6).map((d) => {
          const p = C.parId(d.id);
          return p ? `<div class="rang"><div class="rang-c"><div class="rang-t">${echapper(p.lb)}</div></div><div class="etiq">${d.incertitudes} fois</div></div>` : "";
        }).join(""));
    }
    bloc.push(`<div class="h2">Sons difficiles</div><div class="p">${echapper(resume.raisonSonsVides)}</div>`);
  }
  $("listeDifficultes").innerHTML = bloc.join("");
}

function peindreContenu() {
  const st = C.statuts();
  $("avisContenu").innerHTML =
    `<b>Statut du contenu.</b> ${st.verified} vérifiées, ${st.reviewing} en cours, ${st.unverified} à vérifier, sur ${C.phrases().length}.<br>
     Aucune phrase n'est marquée vérifiée automatiquement. Contrôle sur <a href="https://lod.lu" target="_blank" rel="noopener">lod.lu</a>, puis note la source.`;

  const q = ($("recherche")?.value || "").trim().toLowerCase();
  let liste = C.phrases();
  if (filtreContenu === "derive") liste = liste.filter((p) => p.derive);
  else if (filtreContenu !== "tout") liste = liste.filter((p) => S.statutDe(p) === filtreContenu);
  if (q) liste = liste.filter((p) => p.lb.toLowerCase().includes(q) || p.fr.toLowerCase().includes(q));

  $("listePhrases").innerHTML = liste.slice(0, 120).map(fiche).join("")
    || `<div class="p">Aucun résultat.</div>`;
  if (liste.length > 120) {
    $("listePhrases").innerHTML += `<div class="p">${liste.length - 120} autres phrases. Affine ta recherche.</div>`;
  }
}

function fiche(p) {
  const st = S.statutDe(p);
  const e = S.progressionDe(p.id);
  const niveauMot = Sched.estSolide(e) ? "Solide" : (Sched.estNeuve(e) ? "Pas encore vue" : "En cours");
  const racine = p.lb.replace(/^(ech|du|hie|hien|si|mir|dir|Dir|d'|de |den |e |eng )\s*/i, "").split(/[ ,?…]/)[0].replace(/^d'/, "");
  return `<div class="fiche">
    <div class="fiche-lb">${echapper(p.lb)}</div>
    ${p.ph ? `<div class="fiche-ph">${echapper(p.ph)}</div>` : ""}
    <div class="fiche-fr">${echapper(p.fr)}</div>
    ${p.tr ? `<div class="fiche-tr">Astuce : ${echapper(p.tr)}</div>` : ""}
    <div class="fiche-out">
      <button class="mini" data-dire="${echapper(p.id)}">Écouter</button>
      <a class="mini" href="https://lod.lu/search?q=${encodeURIComponent(racine)}" target="_blank" rel="noopener">lod.lu</a>
      <span class="etiq ${st === "verified" ? "ok" : st === "reviewing" ? "cours" : ""}">${st === "verified" ? "Vérifiée" : st === "reviewing" ? "En cours" : "À vérifier"}</span>
      ${p.derive ? `<span class="etiq">Dérivée</span>` : ""}
      <span class="etiq">${niveauMot}</span>
      <button class="mini" data-statut="${echapper(p.id)}">Changer le statut</button>
    </div>
  </div>`;
}

function peindreAvisVoix() {
  VoixModele.etat({ lb: "Moien" }).then((v) => {
    const el = $("avisVoix");
    if (!el) return;
    el.className = v.luxembourgeoisReel ? "avis" : "avis grave";
    el.innerHTML = v.retenu
      ? `<b>Voix du modèle.</b> ${echapper(v.retenu.libelle)}.${v.avertissement ? "<br>" + echapper(v.avertissement) : ""}`
      : `<b>Aucune voix disponible.</b> Installe une voix dans les réglages de ton téléphone.`;
    const note = $("noteVoixLb");
    if (note) note.textContent = v.avertissement || "";
  });
}

function peindreEnregistrements() {
  const inv = Tentatives.inventaire();
  $("avisMaVoix").innerHTML = inv.consentement
    ? `<b>Conservation active.</b> ${inv.epinglees} enregistrements épinglés, ${inv.enMemoire} en mémoire, ${Math.round(inv.octets / 1024)} ko. Tu peux tout effacer à tout moment.`
    : `<b>Rien n'est conservé.</b> Tes enregistrements vivent en mémoire le temps de la séance, puis disparaissent. Ils ne sont envoyés nulle part tant qu'aucune reconnaissance vocale n'est active.`;

  $("listeEnregistrements").innerHTML = inv.liste.slice(0, 12).map((t) => {
    const p = C.parId(t.idPhrase);
    return `<div class="rang">
      <div class="rang-c">
        <div class="rang-t">${echapper(p?.lb || t.idPhrase || "Tentative")}</div>
        <div class="rang-d">${new Date(t.horodatage).toLocaleString("fr-FR")} · ${Math.round(t.octets / 1024)} ko · ${echapper(t.etat)}</div>
      </div>
      <button class="mini" data-ecouter="${echapper(t.attemptId)}">Écouter</button>
      <button class="mini" data-supprimer="${echapper(t.attemptId)}">Supprimer</button>
    </div>`;
  }).join("");
}

function peindreProviders() {
  Providers.etatComplet().then((etats) => {
    $("listeProviders").innerHTML = etats.map((e) => `<div class="rang">
      <div class="rang-c">
        <div class="rang-t">${echapper(e.nom)}</div>
        <div class="rang-d">${echapper(e.resume || "")}${e.probant ? "" : " Ne peut jamais faire baisser ta progression."}</div>
      </div>
      <div class="etiq ${e.ok ? "ok" : "ko"}">${e.ok ? "Actif" : "Inactif"}</div>
    </div>`).join("");
  });
}

function peindreReglages() {
  const r = S.state().reglages;
  $("bEcho").setAttribute("aria-pressed", r.echo ? "true" : "false");
  $("bConserver").setAttribute("aria-pressed", r.conserverMaVoix ? "true" : "false");
  $("rgVitesse").value = r.vitesseVoix;
  $("rgAttente").value = r.attenteMaxMs;
  $("selProfil").value = r.profilAudio;
  $("valVitesse").textContent = r.vitesseVoix < 0.7 ? "lente" : r.vitesseVoix < 0.95 ? "normale" : "rapide";
  $("valAttente").textContent = (r.attenteMaxMs / 1000).toFixed(1) + " secondes";
}

/* ===================================================================
   ÉVÉNEMENTS
   =================================================================== */

function brancherInterface() {
  document.querySelectorAll(".ong button").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll(".ong button").forEach((x) => x.setAttribute("aria-selected", "false"));
      b.setAttribute("aria-selected", "true");
      document.querySelectorAll(".vue").forEach((v) => v.classList.remove("on"));
      $("v-" + b.dataset.vue)?.classList.add("on");
      if (b.dataset.vue === "voix") Tts.chargerVoix();
      window.scrollTo(0, 0);
    };
  });

  document.querySelectorAll("[data-seance]").forEach((b) => {
    b.onclick = () => demarrerSeance(b.dataset.seance);
  });
  $("btnReprendre").onclick = () => demarrerSeance(S.state().reprise.minutes || 20);

  $("sQuitter").onclick = () => terminerSeance("sortie");
  $("sPause").onclick = async () => {
    enPause = !enPause;
    $("sPause").textContent = enPause ? "Reprendre" : "Pause";
    if (enPause) await audio?.pause(); else audio?.reprendre();
  };
  $("sSuivant").onclick = async () => { sautEnAttente = true; await audio?.sauter(); };
  $("sRepeter").onclick = async () => {
    const r = await audio?.repeter();
    if (r && !r.ok) afficherNote("Je ne peux pas répéter pendant que je t'écoute.");
  };

  $("recherche").oninput = peindreContenu;
  document.querySelectorAll("#filtres [data-filtre]").forEach((b) => {
    b.onclick = () => {
      filtreContenu = b.dataset.filtre;
      document.querySelectorAll("#filtres [data-filtre]").forEach((x) => x.classList.remove("actif"));
      b.classList.add("actif");
      peindreContenu();
    };
  });

  $("btnDiag").onclick = lancerDiagnostic;

  $("bEcho").onclick = async () => {
    S.state().reglages.echo = !S.state().reglages.echo;
    await S.sauver(); peindreReglages();
  };
  $("bConserver").onclick = async () => {
    const nouveau = !S.state().reglages.conserverMaVoix;
    if (nouveau && !confirm("Conserver certains de tes enregistrements sur cet appareil ? Tu pourras les écouter et les effacer à tout moment.")) return;
    S.state().reglages.conserverMaVoix = nouveau;
    await Tentatives.definirConsentement(nouveau);
    await S.sauver();
    peindreReglages(); peindreEnregistrements();
  };
  $("btnEffacerVoix").onclick = async () => {
    if (!confirm("Effacer tous tes enregistrements ? C'est immédiat et définitif.")) return;
    const n = await Tentatives.toutSupprimer();
    peindreEnregistrements();
    alerte(`${n} enregistrements effacés.`);
  };

  $("rgVitesse").oninput = (e) => { S.state().reglages.vitesseVoix = parseFloat(e.target.value); peindreReglages(); };
  $("rgAttente").oninput = (e) => { S.state().reglages.attenteMaxMs = parseInt(e.target.value, 10); peindreReglages(); };
  ["rgVitesse", "rgAttente"].forEach((id) => { $(id).onchange = () => S.sauver(); });
  $("selProfil").onchange = async (e) => { S.state().reglages.profilAudio = e.target.value; await S.sauver(); };
  $("selVoixLb").onchange = async (e) => { S.state().reglages.voixLb = e.target.value; await S.sauver(); Tts.chargerVoix(); };
  $("selVoixFr").onchange = async (e) => { S.state().reglages.voixFr = e.target.value; await S.sauver(); Tts.chargerVoix(); };

  $("btnExport").onclick = exporter;
  $("btnImport").onclick = () => $("fichierImport").click();
  $("fichierImport").onchange = (e) => { if (e.target.files[0]) importer(e.target.files[0]); };
  $("btnRaz").onclick = async () => {
    if (!confirm("Effacer toute la progression et tous les enregistrements ?")) return;
    S.reinitialiserProgression();
    await Tentatives.toutSupprimer();
    peindre();
  };

  document.addEventListener("click", async (e) => {
    const d = e.target.closest("[data-dire]");
    if (d) { const p = C.parId(d.dataset.dire); if (p) await VoixModele.dire(p, { vitesse: "normal" }); return; }
    const s = e.target.closest("[data-statut]");
    if (s) { changerStatut(s.dataset.statut); return; }
    const ec = e.target.closest("[data-ecouter]");
    if (ec) { const b = Tentatives.blobDe(ec.dataset.ecouter); if (b) await jouer(b); else alerte("Cet enregistrement n'est plus en mémoire."); return; }
    const su = e.target.closest("[data-supprimer]");
    if (su) { await Tentatives.supprimer(su.dataset.supprimer); peindreEnregistrements(); return; }
  });

  // Interruption système : appel, Siri, passage en arrière-plan.
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden && seance && !plateforme.capacites().audioArrierePlan) {
      enPause = true;
      $("sPause").textContent = "Reprendre";
      await audio?.interrompre("arriere_plan");
    }
  });
}

function changerStatut(id) {
  const p = C.parId(id);
  if (!p) return;
  const actuel = S.statutDe(p);
  const suivant = actuel === "unverified" ? "reviewing" : actuel === "reviewing" ? "verified" : "unverified";
  let source = "";
  if (suivant === "verified") {
    source = prompt("Source de la vérification, obligatoire. Par exemple : lod.lu, entrée « Moien », consultée le 16 août 2026.") || "";
    if (!source.trim()) { alerte("Sans source, le statut vérifié est refusé."); return; }
  }
  const r = S.definirStatut(id, suivant, { source });
  if (!r.ok) { alerte(r.raison === "source_obligatoire" ? "Une source est obligatoire." : "Statut refusé."); return; }
  peindreContenu();
}

async function lancerDiagnostic() {
  const el = $("resultatDiag");
  el.innerHTML = `<div class="diag-l"><div class="diag-p">·</div><div class="diag-c">Test en cours. Parle quand on te le demande.</div></div>`;
  const symbole = { oui: "✓", non: "✕", indisponible: "—", a_verifier: "?" };
  const r = await Diagnostic.lancer({
    plateforme,
    progres: (_, lignes) => {
      el.innerHTML = lignes.map((l) => `<div class="diag-l" data-etat="${l.etat}">
        <div class="diag-p">${symbole[l.etat] || "·"}</div>
        <div class="diag-c">
          <div>${echapper(l.titre)}</div>
          ${l.detail ? `<div class="diag-d">${echapper(l.detail)}</div>` : ""}
          ${l.action ? `<div class="diag-a">${echapper(l.action)}</div>` : ""}
        </div></div>`).join("");
    }
  });
  if (r.premierBlocage) {
    el.innerHTML += `<div class="diag-l" data-etat="non"><div class="diag-p">!</div><div class="diag-c">
      <div>Premier point à régler</div>
      <div class="diag-d">${echapper(r.premierBlocage.titre)}. ${echapper(r.premierBlocage.action || r.premierBlocage.detail)}</div>
    </div></div>`;
  }
}

function exporter() {
  const donnees = S.exporter();
  const blob = new Blob([JSON.stringify(donnees, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `lulu-trajet-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

function importer(fichier) {
  const fr = new FileReader();
  fr.onload = async () => {
    try {
      const r = await S.importer(JSON.parse(String(fr.result)));
      if (!r.ok) { alerte(r.raison === "schema_incompatible" ? "Cette sauvegarde vient d'une autre version." : "Fichier illisible."); return; }
      peindre();
      alerte(`Sauvegarde restaurée. ${r.expressions} expressions.`);
    } catch (_) { alerte("Fichier illisible."); }
  };
  fr.readAsText(fichier);
}

function activerCommandesSysteme() {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: "LULU Trajet", artist: "Séance de luxembourgeois", album: "LULU"
    });
    navigator.mediaSession.setActionHandler("play", () => { enPause = false; audio?.reprendre(); $("sPause").textContent = "Pause"; });
    navigator.mediaSession.setActionHandler("pause", async () => { enPause = true; await audio?.pause(); $("sPause").textContent = "Reprendre"; });
    navigator.mediaSession.setActionHandler("nexttrack", async () => { sautEnAttente = true; await audio?.sauter(); });
    navigator.mediaSession.setActionHandler("previoustrack", () => audio?.repeter());
  } catch (_) {}
}

function enregistrerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!location.protocol.startsWith("http")) return;
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

const patienter = (ms) => new Promise((r) => setTimeout(r, ms));
function alerte(message) {
  const el = $("avisBlocage");
  if (!el) return;
  el.hidden = false;
  el.textContent = message;
  setTimeout(() => { el.hidden = true; }, 6000);
}

if (typeof document !== "undefined" && !globalThis.__LULU_TEST__) {
  initialiser().catch((e) => {
    console.error(e);
    const el = document.getElementById("avisBlocage");
    if (el) { el.hidden = false; el.textContent = "Démarrage impossible : " + (e?.message || e); }
  });
}
