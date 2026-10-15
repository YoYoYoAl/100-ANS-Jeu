"""Transcrit la chanson « Le Roué du ciel » avec horodatage par mot (Whisper), pour la découper en citations.
Sortie : audio/chanson/mots.json (liste de segments avec mots, début, fin en secondes)."""
import json, pathlib, subprocess
from faster_whisper import WhisperModel
R = pathlib.Path(__file__).resolve().parent.parent
m = WhisperModel("medium", device="cpu", compute_type="int8")
for src in sorted((R / "audio/chanson").glob("*.mp3")):
    dest = R / f"audio/chanson/mots_{src.stem}.json"
    if dest.exists():
        continue
    paroles = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format_tags=lyrics-eng", "-of", "default=nw=1:nk=1", str(src)],
                             capture_output=True, text=True).stdout
    invite = " ".join(l for l in paroles.splitlines() if l and not l.startswith("[") and "]" not in l)[:800]
    segs, _ = m.transcribe(str(src), language="fr", word_timestamps=True, initial_prompt=invite, condition_on_previous_text=False, vad_filter=False)
    out = [dict(debut=s.start, fin=s.end, texte=s.text, mots=[dict(m=w.word, d=w.start, f=w.end) for w in (s.words or [])]) for s in segs]
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(src.name)
    for s in out: print(f'{s["debut"]:7.2f} {s["fin"]:7.2f} {s["texte"]}')
