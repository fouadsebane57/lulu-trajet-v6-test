import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import * as SessionIOS from "../src/audio/session-ios.js";

function avecAudioSession(fn) {
  const faux = { type: "auto", state: "active" };
  SessionIOS.injecterPourTest(faux);
  try { return fn(faux); }
  finally { SessionIOS.injecterPourTest(undefined); }
}

test("la lecture force navigator.audioSession en playback quand l'API existe", () => {
  avecAudioSession((s) => {
    const r = SessionIOS.preparerLecture();
    assert.equal(s.type, "playback");
    assert.equal(r.supporte, true);
    assert.equal(r.type, "playback");
  });
});

test("la capture force navigator.audioSession en play-and-record", () => {
  avecAudioSession((s) => {
    SessionIOS.preparerCapture();
    assert.equal(s.type, "play-and-record");
  });
});

test("la fin rend la catégorie audio au navigateur", () => {
  avecAudioSession((s) => {
    SessionIOS.preparerLecture();
    SessionIOS.reinitialiser();
    assert.equal(s.type, "auto");
  });
});

test("l'absence d'AudioSession ne casse jamais l'application", () => {
  SessionIOS.injecterPourTest(null);
  try {
    const r = SessionIOS.preparerLecture();
    assert.equal(r.supporte, false);
    assert.equal(r.type, "indisponible");
  } finally { SessionIOS.injecterPourTest(undefined); }
});

test("le micro bascule vers capture puis restaure explicitement playback après capture", () => {
  const source = fs.readFileSync(new URL("../src/audio/mic.js", import.meta.url), "utf8");
  assert.match(source, /SessionIOS\.preparerCapture\(\)/);
  assert.match(source, /rendreAudioAuSysteme[\s\S]*SessionIOS\.preparerLecture\(\)/);
});

test("Blob et TTS réaffirment playback juste avant leur sortie", () => {
  const coord = fs.readFileSync(new URL("../src/audio/coordinateur.js", import.meta.url), "utf8");
  const tts = fs.readFileSync(new URL("../src/audio/tts.js", import.meta.url), "utf8");
  assert.match(coord, /jouerBlob[\s\S]*SessionIOS\.preparerLecture\(\)/);
  assert.match(tts, /function dire[\s\S]*SessionIOS\.preparerLecture\(\)/);
});

test("la lecture manuelle P0 ne lance plus un silence avant le Blob réel", () => {
  const p0 = fs.readFileSync(new URL("../src/audio/test-p0.js", import.meta.url), "utf8");
  const bloc = p0.match(/export function lireEnregistrement[\s\S]*?\/\* ===================================================================\n   TEST 2/)[0];
  assert.match(bloc, /preparerLectureDirecte\(\)/);
  assert.doesNotMatch(bloc, /deverrouiller\(\)/);
});
