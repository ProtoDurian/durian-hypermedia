// The Trusted Types control page's script: a plain string into innerHTML must be refused and reported.
const box = document.getElementById("box")!;
try { box.innerHTML = "<b>plain string</b>"; (window as any).__ttAssigned = true; } catch { (window as any).__ttThrew = true; }
