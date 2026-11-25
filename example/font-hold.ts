// The example's font hold: the page column waits at most 1 s for the faces the package measures its words with (CSS
// holds it hidden for 1 s; this ends the hold as soon as Poppins 400, 500 and 600 (and the used maths faces) are loaded, or at 1 s). Hidden, not
// removed: nothing moves when it shows. Without the script the CSS hold still ends at 1 s.
// (a called function, not a bare import: the package marks only CSS and the stage as having side effects)
export function holdFonts() {
  const ready = () => document.documentElement.classList.add("fonts-ready");
  const names = ["400 12px Poppins", "500 12px Poppins", "600 12px Poppins"];
  if (document.querySelector("math")) names.push("400 12px KaTeX_Main", "italic 400 12px KaTeX_Main");
  const faces = names.map((f) => document.fonts?.load(f));
  Promise.race([Promise.all(faces), new Promise((r) => setTimeout(r, 1000))]).then(ready, ready);
}
