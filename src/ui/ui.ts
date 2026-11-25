// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// The renderer's own words (buttons, labels), per language. The article text comes from the dh JSON.
export type Ui = {
  back: string; next: string; play: string; pause: string; step: string; changed: string; line: string; lines: string; pinned: string;
  theFile: string; swipe: string; theChange: string; after: string; table: string; no3d: string; loading3d: string;
  forPeople: string; llmSkips: string; llmShort: string; llmInstead: string; llmHere: string; onThisPage: string;
  sampleKicker: string; readLlm: string; codeCited: string; theme: string; skip: string; foot: string; llmKicker: string;
  nav: Record<"overview" | "article" | "llmView" | "format" | "tokens", string>;
  marks: Record<string, string>;
  files: string; close: string; original: string; before: string; after2: string; beforeAfter: string; explorer: string; more: string;
  terminal: string; replay: string; reset: string; chart: string; pick: string; asIs: string; textInstead: string; nothing: string; source: string; rendered: string;
  asData: string; asSteps: string; unwrapped: string;
  // the animation stage (format version 4)
  camera: string; zoomIn: string; zoomOut: string; fitAll: string; backToStory: string; inside: string; noNote: string; exploreHint: string; allSteps: string;
  // format version 5: the 2D/3D toggle and layers
  foldLines: string; show3d: string; show2d: string; hint3d: string; layer: string;
  // format version 8: tier list and alignment grid
  tapNote: string; asLines: string;
  // format version 7: moving through the stage, a line under it; the reset button
  hintOff: string; hintOn: string; hintOff3d: string; hintOn3d: string; resetView: string; stageLabel: string;
  // format version 8: the line under the stage on a phone (touch), and its note about shaded edges
  hintDiagram?: string; hintGrid?: string; hintTable?: string; hintTouch?: string; hintTouchOn?: string; hintTouch3d?: string; hintTouchOn3d?: string; hintMore?: string;
  // format version 9: the phone's line under the stage is one short line; the ? button beside it shows the whole of it
  // format version 10: candlestick key and table words
  marksKey?: string; candleUp?: string; candleDown?: string; candlePeriod?: string; candleWords?: Record<string, string>;
  hintShort?: string; hintShortOn?: string; hintShort3d?: string; hintShortOn3d?: string; howTo?: string;
  // format version 10: the chip on a caption inside a scene of its own
  inScene?: string;
};

export const LANGS: { code: string; name: string; font?: string; dir?: "rtl"; html?: string }[] = [
  { code: "en", name: "English" },
  { code: "zh-Hans", name: "简体中文", font: "Noto+Sans+SC:wght@300;400;500;600" },
  { code: "es", name: "Español" },
  { code: "hi", name: "हिन्दी", font: "Noto+Sans+Devanagari:wght@300;400;500;600" },
  { code: "pt", name: "Português", html: "pt-BR" },
  { code: "bn", name: "বাংলা", font: "Noto+Sans+Bengali:wght@300;400;500;600" },
];

const en: Ui = {
  tapNote: "Tap or hover an item with a dot to read its note.", asLines: "its tiers, one line each",
  foldLines: "… {n} lines",
  candleUp: "Up: the close is at or above the open", candleDown: "Down: the close is below the open", candlePeriod: "period", candleWords: { open: "Open", high: "High", low: "Low", close: "Close" },
  hintOff: "Drag to move · click the stage to use the wheel and the arrow keys", hintOn: "Drag, scroll or arrow keys: move · Ctrl + scroll, pinch or + −: zoom · Esc: back to the story", hintOff3d: "Drag to turn, right-drag or Shift + drag to move · click the stage to use the wheel and the keys", hintOn3d: "Drag: turn · right-drag, Shift + drag or two fingers: move · wheel or pinch: zoom · arrows, W A S D: move · + −: zoom · Esc: back", resetView: "Reset the view", stageLabel: "The stage: drag, scroll or use the arrow keys to move",
  back: "← Back", next: "Next →", play: "▶ Play", pause: "❚❚ Pause", step: "Step", changed: "changed", line: "line", lines: "lines", pinned: "pinned at",
  theFile: "The file", swipe: "↔ Swipe the stage to see all of it", theChange: "the change", after: "the file after it", table: "Show the numbers as a table",
  no3d: "This 3D stage needs WebGL, which this browser does not offer. The captions below still tell the story.", loading3d: "Loading the 3D stage…",
  forPeople: "For people", llmSkips: "LLMs skip this part: the author marked it as not needed by them.", llmShort: "LLMs read a short text instead.",
  llmInstead: "What an LLM reads instead", llmHere: "What an LLM reads here", onThisPage: "On this page",
  sampleKicker: "Sample article · DurianMarkdown", readLlm: "The LLM view →", codeCited: "Code this page cites", theme: "Switch light or dark",
  skip: "Skip to the text", foot: "A sample of DurianMarkdown. The code is cited at pinned commits.", llmKicker: "The LLM view",
  nav: { overview: "Overview", article: "Article", llmView: "LLM view", format: "Format", tokens: "Tokens" },
  marks: { added: "added", changed: "changed", removed: "removed", kept: "kept", conflict: "conflict", new: "new", generated: "generated", edited: "edited" },
  files: "Files", close: "Close", original: "The files as they are", before: "Before", after2: "After", beforeAfter: "Before or after the edit", explorer: "Explorer", more: "more files, not shown", terminal: "Terminal", replay: "↻ Replay", reset: "Reset", chart: "Chart", pick: "Pick one:", asIs: "as it is", textInstead: "the :::llm text in its place", nothing: "nothing: for people only", source: "Source", rendered: "Rendered",
  asData: "its data, as a table", asSteps: "what it starts with, then its step captions as a numbered list", unwrapped: "the headings and their text",
  camera: "Camera", zoomIn: "Zoom in", zoomOut: "Zoom out", fitAll: "Show everything", backToStory: "Back to the story", inside: "in", noNote: "No note.", exploreHint: "Drag to move · pinch or Ctrl + wheel to zoom · click a thing", allSteps: "All steps",
  show3d: "Show in 3D", show2d: "Show flat (2D)", hint3d: "Drag to turn · Shift + drag or two fingers to move · pinch or Ctrl + wheel to zoom · click a thing or a layer", layer: "layer",
};

export const UI: Record<string, Ui> = {
  en,
  "zh-Hans": {
  "hintOff": "拖动可移动 · 点击舞台后可用滚轮和方向键",
  "hintOn": "拖动、滚动或方向键：移动 · Ctrl + 滚动、捏合或 + −：缩放 · Esc：回到剧情",
  "hintOff3d": "拖动可旋转，右键拖动或 Shift + 拖动可移动 · 点击舞台后可用滚轮和按键",
  "hintOn3d": "拖动：旋转 · 右键拖动、Shift + 拖动或双指：移动 · 滚轮或捏合：缩放 · 方向键、W A S D：移动 · + −：缩放 · Esc：返回",
  "resetView": "重置视图",
  "stageLabel": "舞台：拖动、滚动或用方向键移动",
    ...en, foldLines: "… {n} 行", back: "← 上一步", next: "下一步 →", play: "▶ 播放", pause: "❚❚ 暂停", step: "步骤", changed: "已变", line: "行", lines: "行", pinned: "固定于",
    theFile: "文件", swipe: "↔ 左右滑动查看完整舞台", theChange: "改动", after: "改动后的文件", table: "以表格显示数字",
    no3d: "此 3D 舞台需要 WebGL，但此浏览器不支持。下面的说明文字仍讲述了全过程。", loading3d: "正在加载 3D 舞台…",
    forPeople: "给人看的", llmSkips: "LLM 跳过此部分：作者标明 LLM 不需要它。", llmShort: "LLM 读的是一段简短文字。",
    llmInstead: "LLM 读到的替代文字", llmHere: "LLM 在此读到的文字", onThisPage: "本页内容",
    sampleKicker: "示例文章 · DurianMarkdown", readLlm: "LLM 视图 →", codeCited: "本页引用的代码", theme: "切换浅色或深色",
    skip: "跳到正文", foot: "DurianMarkdown 示例。代码引用固定在指定提交。", llmKicker: "LLM 视图",
    nav: { overview: "概览", article: "文章", llmView: "LLM 视图", format: "格式", tokens: "Token" },
    marks: { added: "新增", changed: "已改", removed: "已删", kept: "保留", conflict: "冲突" , new: "新增", generated: "生成" },
    files: "文件", close: "关闭", original: "文件原样", before: "改前", after2: "改后", beforeAfter: "改动前或改动后", explorer: "资源管理器", more: "更多文件，未显示", terminal: "终端", replay: "↻ 重放", reset: "重置", chart: "图表", pick: "请选择：",
  },
  es: {
    ...en, foldLines: "… {n} líneas", back: "← Atrás", next: "Siguiente →", play: "▶ Reproducir", pause: "❚❚ Pausa", step: "Paso", changed: "cambió", line: "línea", lines: "líneas", pinned: "fijado en",
    theFile: "El archivo", swipe: "↔ Desliza el escenario para verlo entero", theChange: "el cambio", after: "el archivo después", table: "Ver los números en una tabla",
    no3d: "Este escenario 3D necesita WebGL, que este navegador no ofrece. Los textos de abajo cuentan la historia igual.", loading3d: "Cargando el escenario 3D…",
    forPeople: "Para personas", llmSkips: "Los LLM se saltan esta parte: el autor la marcó como innecesaria para ellos.", llmShort: "Los LLM leen un texto breve en su lugar.",
    llmInstead: "Lo que lee un LLM en su lugar", llmHere: "Lo que lee un LLM aquí", onThisPage: "En esta página",
    sampleKicker: "Artículo de ejemplo · DurianMarkdown", readLlm: "La vista para LLM →", codeCited: "Código que cita esta página", theme: "Cambiar a claro u oscuro",
    skip: "Ir al texto", foot: "Un ejemplo de DurianMarkdown. El código se cita en commits fijos.", llmKicker: "La vista para LLM",
    nav: { overview: "Resumen", article: "Artículo", llmView: "Vista LLM", format: "Formato", tokens: "Tokens" },
    marks: { added: "añadido", changed: "cambiado", removed: "eliminado", kept: "sin cambios", conflict: "conflicto" , new: "nuevo", generated: "generado" },
    files: "Archivos", close: "Cerrar", original: "Los archivos tal como están", before: "Antes", after2: "Después", beforeAfter: "Antes o después del cambio", explorer: "Explorador", more: "más archivos, no se muestran", terminal: "Terminal", replay: "↻ Repetir", reset: "Restablecer", chart: "Gráfico", pick: "Elige una:",
  },
  hi: {
    ...en, foldLines: "… {n} पंक्तियाँ", back: "← पीछे", next: "आगे →", play: "▶ चलाएँ", pause: "❚❚ रोकें", step: "चरण", changed: "बदला", line: "पंक्ति", lines: "पंक्तियाँ", pinned: "स्थिर कमिट",
    theFile: "फ़ाइल", swipe: "↔ पूरा मंच देखने के लिए स्वाइप करें", theChange: "बदलाव", after: "बदलाव के बाद फ़ाइल", table: "संख्याएँ तालिका में देखें",
    no3d: "इस 3D मंच के लिए WebGL चाहिए, जो यह ब्राउज़र नहीं देता। नीचे के कैप्शन फिर भी पूरी बात बताते हैं।", loading3d: "3D मंच लोड हो रहा है…",
    forPeople: "लोगों के लिए", llmSkips: "LLM यह हिस्सा छोड़ देते हैं: लेखक ने इसे उनके लिए अनावश्यक बताया है।", llmShort: "LLM इसकी जगह एक छोटा पाठ पढ़ते हैं।",
    llmInstead: "इसकी जगह LLM क्या पढ़ता है", llmHere: "यहाँ LLM क्या पढ़ता है", onThisPage: "इस पेज पर",
    sampleKicker: "नमूना लेख · DurianMarkdown", readLlm: "LLM व्यू →", codeCited: "इस पेज में उद्धृत कोड", theme: "हल्का या गहरा रंग",
    skip: "पाठ पर जाएँ", foot: "DurianMarkdown का एक नमूना। कोड स्थिर कमिट पर उद्धृत है।", llmKicker: "LLM व्यू",
    nav: { overview: "सारांश", article: "लेख", llmView: "LLM व्यू", format: "फ़ॉर्मेट", tokens: "टोकन" },
    marks: { added: "जोड़ा", changed: "बदला", removed: "हटाया", kept: "रखा", conflict: "टकराव" , new: "नया", generated: "जनरेट किया" },
    files: "फ़ाइलें", close: "बंद करें", original: "फ़ाइलें जैसी हैं", before: "पहले", after2: "बाद में", beforeAfter: "बदलाव से पहले या बाद", explorer: "एक्सप्लोरर", more: "और फ़ाइलें, दिखाई नहीं गईं", terminal: "टर्मिनल", replay: "↻ फिर चलाएँ", reset: "रीसेट", chart: "चार्ट", pick: "एक चुनें:",
  },
  pt: {
    ...en, foldLines: "… {n} linhas", back: "← Voltar", next: "Avançar →", play: "▶ Reproduzir", pause: "❚❚ Pausar", step: "Passo", changed: "mudou", line: "linha", lines: "linhas", pinned: "fixado em",
    theFile: "O arquivo", swipe: "↔ Deslize o palco para ver tudo", theChange: "a mudança", after: "o arquivo depois", table: "Ver os números numa tabela",
    no3d: "Este palco 3D precisa de WebGL, que este navegador não oferece. As legendas abaixo contam a história mesmo assim.", loading3d: "Carregando o palco 3D…",
    forPeople: "Para pessoas", llmSkips: "Os LLMs pulam esta parte: o autor a marcou como desnecessária para eles.", llmShort: "Os LLMs leem um texto curto no lugar.",
    llmInstead: "O que um LLM lê no lugar", llmHere: "O que um LLM lê aqui", onThisPage: "Nesta página",
    sampleKicker: "Artigo de exemplo · DurianMarkdown", readLlm: "A visão para LLM →", codeCited: "Código citado nesta página", theme: "Mudar para claro ou escuro",
    skip: "Ir para o texto", foot: "Um exemplo de DurianMarkdown. O código é citado em commits fixos.", llmKicker: "A visão para LLM",
    nav: { overview: "Visão geral", article: "Artigo", llmView: "Visão LLM", format: "Formato", tokens: "Tokens" },
    marks: { added: "adicionado", changed: "alterado", removed: "removido", kept: "mantido", conflict: "conflito" , new: "novo", generated: "gerado" },
    files: "Arquivos", close: "Fechar", original: "Os arquivos como estão", before: "Antes", after2: "Depois", beforeAfter: "Antes ou depois da mudança", explorer: "Explorador", more: "mais arquivos, não mostrados", terminal: "Terminal", replay: "↻ Repetir", reset: "Redefinir", chart: "Gráfico", pick: "Escolha uma:",
  },
  bn: {
    ...en, foldLines: "… {n} লাইন", back: "← পিছনে", next: "পরের ধাপ →", play: "▶ চালান", pause: "❚❚ থামান", step: "ধাপ", changed: "বদলেছে", line: "লাইন", lines: "লাইন", pinned: "স্থির কমিট",
    theFile: "ফাইল", swipe: "↔ পুরো মঞ্চ দেখতে সোয়াইপ করুন", theChange: "পরিবর্তন", after: "পরিবর্তনের পরে ফাইল", table: "সংখ্যাগুলো টেবিলে দেখুন",
    no3d: "এই 3D মঞ্চের জন্য WebGL দরকার, যা এই ব্রাউজারে নেই। নিচের ক্যাপশনগুলো তবুও পুরো ঘটনা বলে।", loading3d: "3D মঞ্চ লোড হচ্ছে…",
    forPeople: "মানুষের জন্য", llmSkips: "LLM এই অংশ বাদ দেয়: লেখক এটিকে তাদের জন্য অপ্রয়োজনীয় বলে চিহ্নিত করেছেন।", llmShort: "LLM এর বদলে একটি ছোট লেখা পড়ে।",
    llmInstead: "এর বদলে LLM যা পড়ে", llmHere: "এখানে LLM যা পড়ে", onThisPage: "এই পাতায়",
    sampleKicker: "নমুনা লেখা · DurianMarkdown", readLlm: "LLM ভিউ →", codeCited: "এই পাতায় উদ্ধৃত কোড", theme: "হালকা বা গাঢ় রং",
    skip: "লেখায় যান", foot: "DurianMarkdown-র একটি নমুনা। কোড স্থির কমিটে উদ্ধৃত।", llmKicker: "LLM ভিউ",
    nav: { overview: "সারসংক্ষেপ", article: "লেখা", llmView: "LLM ভিউ", format: "ফরম্যাট", tokens: "টোকেন" },
    marks: { added: "যোগ হয়েছে", changed: "বদলেছে", removed: "সরানো হয়েছে", kept: "রাখা হয়েছে", conflict: "সংঘাত" , new: "নতুন", generated: "তৈরি করা" },
    files: "ফাইল", close: "বন্ধ করুন", original: "ফাইলগুলো যেমন আছে", before: "আগে", after2: "পরে", beforeAfter: "পরিবর্তনের আগে বা পরে", explorer: "এক্সপ্লোরার", more: "আরও ফাইল, দেখানো হয়নি", terminal: "টার্মিনাল", replay: "↻ আবার চালান", reset: "রিসেট", chart: "চার্ট", pick: "একটি বেছে নিন:",
  },
};

// format version 4: the animation stage's words and the "edited" chip, per language (machine translated; not yet read by a native speaker)
const V4: Record<string, Record<string, string>> = {
 "zh-Hans": {
  "camera": "镜头",
  "zoomIn": "放大",
  "zoomOut": "缩小",
  "fitAll": "显示全部",
  "backToStory": "回到剧情",
  "inside": "位于",
  "noNote": "没有注释。",
  "exploreHint": "拖动可平移 · 捏合或 Ctrl + 滚轮可缩放 · 点击事物查看",
  "allSteps": "所有步骤",
  "edited": "已编辑",
  "asSteps": "它开始时的内容，然后是按编号列出的各步骤说明文字"
 },
 "es": {
  "hintOff": "Arrastra para mover · haz clic en el escenario para usar la rueda y las flechas",
  "hintOn": "Arrastra, desplaza o usa las flechas: mover · Ctrl + rueda, pellizca o + −: zoom · Esc: volver a la historia",
  "hintOff3d": "Arrastra para girar; clic derecho o Shift + arrastrar para mover · haz clic en el escenario para usar la rueda y las teclas",
  "hintOn3d": "Arrastrar: girar · clic derecho, Shift + arrastrar o dos dedos: mover · rueda o pellizco: zoom · flechas, W A S D: mover · + −: zoom · Esc: volver",
  "resetView": "Restablecer la vista",
  "stageLabel": "El escenario: arrastra, desplaza o usa las flechas para moverte",
  "camera": "Cámara",
  "zoomIn": "Acercar",
  "zoomOut": "Alejar",
  "fitAll": "Mostrar todo",
  "backToStory": "Volver a la historia",
  "inside": "en",
  "noNote": "Sin nota.",
  "exploreHint": "Arrastra para mover · pellizca o Ctrl + rueda para hacer zoom · haz clic en algo",
  "allSteps": "Todos los pasos",
  "edited": "editado",
  "asSteps": "con qué empieza, luego los títulos de sus pasos como una lista numerada"
 },
 "hi": {
  "hintOff": "हिलाने के लिए खींचें · व्हील और तीर कुंजियों के लिए मंच पर क्लिक करें",
  "hintOn": "खींचें, स्क्रॉल करें या तीर कुंजियाँ: हिलाएँ · Ctrl + स्क्रॉल, पिंच या + −: ज़ूम · Esc: कहानी पर वापस",
  "hintOff3d": "घुमाने के लिए खींचें; हिलाने के लिए राइट-ड्रैग या Shift + खींचें · व्हील और कुंजियों के लिए मंच पर क्लिक करें",
  "hintOn3d": "खींचें: घुमाएँ · राइट-ड्रैग, Shift + खींचें या दो उँगलियाँ: हिलाएँ · व्हील या पिंच: ज़ूम · तीर, W A S D: हिलाएँ · + −: ज़ूम · Esc: वापस",
  "resetView": "दृश्य फिर से सेट करें",
  "stageLabel": "मंच: हिलाने के लिए खींचें, स्क्रॉल करें या तीर कुंजियाँ दबाएँ",
  "camera": "कैमरा",
  "zoomIn": "ज़ूम इन",
  "zoomOut": "ज़ूम आउट",
  "fitAll": "सब कुछ दिखाएँ",
  "backToStory": "कहानी पर वापस",
  "inside": "में",
  "noNote": "कोई नोट नहीं।",
  "exploreHint": "हिलाने के लिए खींचें · ज़ूम के लिए पिंच या Ctrl + व्हील · किसी चीज़ को क्लिक करें",
  "allSteps": "सारे चरण",
  "edited": "संपादित",
  "asSteps": "यह जिससे शुरू होता है, फिर उसके चरणों के कैप्शन एक क्रमांकित सूची के रूप में"
 },
 "pt": {
  "hintOff": "Arraste para mover · clique no palco para usar a roda e as setas",
  "hintOn": "Arraste, role ou use as setas: mover · Ctrl + roda, pinça ou + −: zoom · Esc: voltar à história",
  "hintOff3d": "Arraste para girar; botão direito ou Shift + arrastar para mover · clique no palco para usar a roda e as teclas",
  "hintOn3d": "Arrastar: girar · botão direito, Shift + arrastar ou dois dedos: mover · roda ou pinça: zoom · setas, W A S D: mover · + −: zoom · Esc: voltar",
  "resetView": "Redefinir a vista",
  "stageLabel": "O palco: arraste, role ou use as setas para mover",
  "camera": "Câmera",
  "zoomIn": "Ampliar",
  "zoomOut": "Reduzir",
  "fitAll": "Mostrar tudo",
  "backToStory": "Voltar para a história",
  "inside": "em",
  "noNote": "Sem nota.",
  "exploreHint": "Arraste para mover · pinça ou Ctrl + roda do mouse para ampliar · clique numa coisa",
  "allSteps": "Todas as etapas",
  "edited": "editado",
  "asSteps": "o que o palco mostra no início, depois as legendas das etapas como uma lista numerada"
 },
 "bn": {
  "hintOff": "সরাতে টানুন · চাকা আর তীর কী ব্যবহার করতে মঞ্চে ক্লিক করুন",
  "hintOn": "টানুন, স্ক্রোল করুন বা তীর কী: সরান · Ctrl + স্ক্রোল, পিঞ্চ বা + −: জুম · Esc: গল্পে ফিরুন",
  "hintOff3d": "ঘোরাতে টানুন; সরাতে ডান-টান বা Shift + টান · চাকা আর কী ব্যবহার করতে মঞ্চে ক্লিক করুন",
  "hintOn3d": "টান: ঘোরান · ডান-টান, Shift + টান বা দুই আঙুল: সরান · চাকা বা পিঞ্চ: জুম · তীর, W A S D: সরান · + −: জুম · Esc: ফিরুন",
  "resetView": "দৃশ্য আবার সাজান",
  "stageLabel": "মঞ্চ: সরাতে টানুন, স্ক্রোল করুন বা তীর কী ব্যবহার করুন",
  "camera": "ক্যামেরা",
  "zoomIn": "জুম ইন",
  "zoomOut": "জুম আউট",
  "fitAll": "সবকিছু দেখান",
  "backToStory": "গল্পে ফিরে যান",
  "inside": "ভেতরে",
  "noNote": "কোনো নোট নেই।",
  "exploreHint": "সরাতে ড্র্যাগ করুন · জুম করতে পিঞ্চ করুন বা Ctrl + হুইল ঘোরান · কোনো জিনিসে ক্লিক করুন",
  "allSteps": "সব ধাপ",
  "edited": "সম্পাদিত",
  "asSteps": "শুরুতে কী আছে, তারপর এর ধাপের ক্যাপশনগুলো একটি নম্বরযুক্ত তালিকা হিসেবে"
 }
};
for (const [l, w] of Object.entries(V4)) { const { edited, ...rest } = w; Object.assign(UI[l], rest); UI[l].marks = { ...UI[l].marks, edited }; }

// format version 5: the 2D/3D toggle and the word "layer" (machine translated; not yet read by a native speaker)
const V5: Record<string, Partial<Ui>> = {
  "zh-Hans": { show3d: "以 3D 显示", show2d: "以平面 (2D) 显示", hint3d: "拖动可旋转 · Shift + 拖动或双指可平移 · 捏合或 Ctrl + 滚轮可缩放 · 点击事物或某一层", layer: "层" },
  es: { show3d: "Ver en 3D", show2d: "Ver plano (2D)", hint3d: "Arrastra para girar · Mayús + arrastrar o dos dedos para mover · pellizca o Ctrl + rueda para hacer zoom · haz clic en algo o en una capa", layer: "capa" },
  hi: { show3d: "3D में दिखाएँ", show2d: "सपाट (2D) दिखाएँ", hint3d: "घुमाने के लिए खींचें · हिलाने के लिए Shift + खींचें या दो उँगलियाँ · ज़ूम के लिए पिंच या Ctrl + व्हील · किसी चीज़ या परत को क्लिक करें", layer: "परत" },
  pt: { show3d: "Ver em 3D", show2d: "Ver plano (2D)", hint3d: "Arraste para girar · Shift + arrastar ou dois dedos para mover · pinça ou Ctrl + roda para ampliar · clique numa coisa ou numa camada", layer: "camada" },
  bn: { show3d: "3D-তে দেখান", show2d: "সমতলে (2D) দেখান", hint3d: "ঘোরাতে ড্র্যাগ করুন · সরাতে Shift + ড্র্যাগ বা দুই আঙুল · জুম করতে পিঞ্চ বা Ctrl + হুইল · কোনো জিনিস বা স্তরে ক্লিক করুন", layer: "স্তর" },
};
for (const [l, w] of Object.entries(V5)) Object.assign(UI[l], w);

// format version 8: the animation stage on a phone says how to move it by touch (machine translated; not yet read by a
// native speaker)
const V8_TOUCH: Record<string, Partial<Ui>> = {
  en: { hintShort: "Tap, then drag to move", hintShortOn: "Drag: move · pinch: zoom", hintShort3d: "Drag to turn", hintShortOn3d: "1 finger: turn · 2: move, zoom", howTo: "How to move", hintTouch: "Tap the stage, then drag with one finger to move · pinch to zoom", hintTouchOn: "One finger: move · two fingers: zoom · tap outside the stage to scroll the page", hintTouch3d: "Drag sideways to turn · tap the stage, then one finger turns and two fingers move and zoom", hintTouchOn3d: "One finger: turn · two fingers: move and zoom · tap outside the stage to scroll the page", hintMore: "a shaded edge has more that way" },
  "zh-Hans": { hintShort: "轻点后拖动来移动", hintShortOn: "拖动：移动 · 捏合：缩放", hintShort3d: "拖动可旋转", hintShortOn3d: "单指：旋转 · 双指：移动、缩放", howTo: "如何移动", hintTouch: "轻点舞台，再用一根手指拖动来移动 · 双指捏合可缩放", hintTouchOn: "单指：移动 · 双指：缩放 · 轻点舞台外可滚动页面", hintTouch3d: "横向拖动可旋转 · 轻点舞台后，单指旋转，双指移动和缩放", hintTouchOn3d: "单指：旋转 · 双指：移动和缩放 · 轻点舞台外可滚动页面", hintMore: "有阴影的边缘外还有内容" },
  es: { hintShort: "Toca y arrastra para mover", hintShortOn: "Arrastra: mover · pellizca: zoom", hintShort3d: "Arrastra para girar", hintShortOn3d: "1 dedo: girar · 2: mover, zoom", howTo: "Cómo moverse", hintTouch: "Toca el escenario y arrastra con un dedo para mover · pellizca para hacer zoom", hintTouchOn: "Un dedo: mover · dos dedos: zoom · toca fuera del escenario para desplazar la página", hintTouch3d: "Arrastra de lado para girar · toca el escenario: un dedo gira, dos dedos mueven y hacen zoom", hintTouchOn3d: "Un dedo: girar · dos dedos: mover y zoom · toca fuera del escenario para desplazar la página", hintMore: "un borde sombreado tiene más en esa dirección" },
  hi: { hintShort: "टैप करें, फिर खींचें", hintShortOn: "खींचें: हिलाएँ · पिंच: ज़ूम", hintShort3d: "घुमाने के लिए खींचें", hintShortOn3d: "1 उँगली: घुमाएँ · 2: हिलाएँ, ज़ूम", howTo: "कैसे हिलाएँ", hintTouch: "मंच पर टैप करें, फिर हिलाने के लिए एक उँगली से खींचें · ज़ूम के लिए पिंच करें", hintTouchOn: "एक उँगली: हिलाएँ · दो उँगलियाँ: ज़ूम · पेज स्क्रॉल करने के लिए मंच के बाहर टैप करें", hintTouch3d: "घुमाने के लिए बगल में खींचें · मंच पर टैप करें: एक उँगली घुमाती है, दो उँगलियाँ हिलाती और ज़ूम करती हैं", hintTouchOn3d: "एक उँगली: घुमाएँ · दो उँगलियाँ: हिलाएँ और ज़ूम · पेज स्क्रॉल करने के लिए मंच के बाहर टैप करें", hintMore: "छायांकित किनारे के पार और भी है" },
  pt: { hintShort: "Toque e arraste para mover", hintShortOn: "Arraste: mover · pinça: zoom", hintShort3d: "Arraste para girar", hintShortOn3d: "1 dedo: girar · 2: mover, zoom", howTo: "Como mover", hintTouch: "Toque no palco e arraste com um dedo para mover · faça pinça para ampliar", hintTouchOn: "Um dedo: mover · dois dedos: zoom · toque fora do palco para rolar a página", hintTouch3d: "Arraste para o lado para girar · toque no palco: um dedo gira, dois dedos movem e ampliam", hintTouchOn3d: "Um dedo: girar · dois dedos: mover e zoom · toque fora do palco para rolar a página", hintMore: "uma borda sombreada tem mais nessa direção" },
  bn: { hintShort: "ট্যাপ করে টানুন", hintShortOn: "টানুন: সরান · পিঞ্চ: জুম", hintShort3d: "ঘোরাতে টানুন", hintShortOn3d: "১ আঙুল: ঘোরান · ২: সরান, জুম", howTo: "কীভাবে সরাবেন", hintTouch: "মঞ্চে ট্যাপ করুন, তারপর সরাতে এক আঙুলে টানুন · জুম করতে পিঞ্চ করুন", hintTouchOn: "এক আঙুল: সরান · দুই আঙুল: জুম · পাতা স্ক্রল করতে মঞ্চের বাইরে ট্যাপ করুন", hintTouch3d: "ঘোরাতে পাশে টানুন · মঞ্চে ট্যাপ করুন: এক আঙুলে ঘোরে, দুই আঙুলে সরে ও জুম হয়", hintTouchOn3d: "এক আঙুল: ঘোরান · দুই আঙুল: সরান ও জুম · পাতা স্ক্রল করতে মঞ্চের বাইরে ট্যাপ করুন", hintMore: "ছায়া দেওয়া কিনারার ওপারে আরও আছে" },
};
// a diagram wider than a phone keeps its words readable and scrolls sideways inside its box (format version 8)
const V8_DIAGRAM: Record<string, string> = { en: "↔ Swipe to see the whole diagram", "zh-Hans": "↔ 左右滑动查看完整图表", es: "↔ Desliza para ver el diagrama entero", hi: "↔ पूरा चित्र देखने के लिए स्वाइप करें", pt: "↔ Deslize para ver o diagrama inteiro", bn: "↔ পুরো চিত্র দেখতে সোয়াইপ করুন" };
for (const [l, w] of Object.entries(V8_TOUCH)) if (UI[l]) Object.assign(UI[l], w);
for (const [l, w] of Object.entries(V8_DIAGRAM)) if (UI[l]) UI[l].hintDiagram = w;
// format version 10: an animation's scene inside a scene: the chip on its captions says the reader is inside it
// (machine translated; not yet read by a native speaker)
const V10_SCENES: Record<string, string> = { en: "Inside", "zh-Hans": "内部", es: "Dentro", hi: "अंदर", pt: "Dentro", bn: "ভেতরে" };
// format version 10: the line under an alignment grid that is wider than a phone (machine translated; not yet read by a native speaker)
const V10_GRID: Record<string, string> = { en: "↔ Swipe the grid to see all of it", "zh-Hans": "↔ 左右滑动查看完整网格", es: "↔ Desliza la cuadrícula para verla entera", hi: "↔ पूरा ग्रिड देखने के लिए स्वाइप करें", pt: "↔ Deslize a grade para ver tudo", bn: "↔ পুরো গ্রিড দেখতে সোয়াইপ করুন" };
for (const [l, w] of Object.entries(V10_GRID)) if (UI[l]) UI[l].hintGrid = w;
const V10_TABLE: Record<string, string> = { en: "↔ Swipe the table to see all of it", "zh-Hans": "↔ 左右滑动查看完整表格", es: "↔ Desliza la tabla para verla entera", hi: "↔ पूरी तालिका देखने के लिए स्वाइप करें", pt: "↔ Deslize a tabela para ver tudo", bn: "↔ পুরো টেবিল দেখতে সোয়াইপ করুন" };
for (const [l, w] of Object.entries(V10_TABLE)) if (UI[l]) UI[l].hintTable = w;
for (const [l, w] of Object.entries(V10_SCENES)) if (UI[l]) (UI[l] as any).inScene = w;
