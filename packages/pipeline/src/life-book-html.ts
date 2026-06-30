import { readFile } from "node:fs/promises";
import type { CompleteLifeChapter, LifeBookPage, LifeBookRunSnapshot } from "@short-drama/domain";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function text(value?: string): string {
  return escapeHtml(value || "");
}

function prose(value?: string): string {
  return text(value).replaceAll("\n", "<br/>");
}

async function imgSrc(localPath?: string, imageUrl?: string): Promise<string> {
  if (!localPath) return imageUrl || "";
  const bytes = await readFile(localPath);
  const ext = localPath.endsWith(".jpg") || localPath.endsWith(".jpeg") ? "jpeg" : localPath.endsWith(".webp") ? "webp" : "png";
  return `data:image/${ext};base64,${bytes.toString("base64")}`;
}

function pageShell(className: string, content: string, attrs = ""): string {
  return `<article class="page ${className}"${attrs ? ` ${attrs}` : ""}>${content}</article>`;
}

function emptyPage(): string {
  return pageShell("page-empty", `<div class="empty-mark">✦</div>`);
}

function scoreConstellation(snapshot: LifeBookRunSnapshot): string {
  const scores = snapshot.script?.scores || [];
  if (!scores.length) return "";
  return `<div class="score-constellation">${scores.map((score) => `<span><b>${text(score.label)}</b>${score.value}</span>`).join("")}</div>`;
}

function chapterList(chapters: CompleteLifeChapter[]): string {
  if (!chapters.length) return `<p class="muted">章节仍在墨水中浮现。</p>`;
  return `<ol class="toc-list">${chapters.map((chapter) => `<li><button type="button" data-goto-chapter="${text(chapter.chapterId)}"><span>${text(chapter.ageRange)}</span><b>${text(chapter.title)}</b><em>${text(chapter.selectedChoiceLabel)}</em></button></li>`).join("")}</ol>`;
}

function imageFrame(src: string, alt: string, caption?: string, className = ""): string {
  const classes = `image-frame${className ? ` ${className}` : ""}`;
  if (!src) {
    return `<div class="${classes} image-frame-empty"><span>ILLUSTRATION<br/>PENDING</span></div>`;
  }
  return `<figure class="${classes}"><img src="${src}" alt="${text(alt)}"/>${caption ? `<figcaption>${text(caption)}</figcaption>` : ""}</figure>`;
}

async function storyPage(page: LifeBookPage, artifactPathById: (artifactId: string) => Promise<string | undefined>): Promise<string> {
  const src = page.imageArtifactId ? await imgSrc(await artifactPathById(page.imageArtifactId), page.imageUrl) : page.imageUrl || "";
  return pageShell("page-illustration", `
    <div class="page-corner">${String(page.pageIndex + 1).padStart(2, "0")}</div>
    ${imageFrame(src, page.title, page.caption)}
    <div class="scene-card">
      <p class="eyebrow">ILLUSTRATED MEMORY</p>
      <h3>${text(page.title)}</h3>
      <p>${text(page.sceneText || page.caption)}</p>
    </div>
  `);
}

async function buildPages(snapshot: LifeBookRunSnapshot, artifactPathById: (artifactId: string) => Promise<string | undefined>): Promise<string[]> {
  const script = snapshot.script;
  const chapters = script?.chapters ?? [];
  const anchor = snapshot.anchorPack?.anchors[0];
  const anchorSrc = anchor?.artifactId ? await imgSrc(await artifactPathById(anchor.artifactId), anchor.imageUrl) : anchor?.imageUrl || "";
  const pages: string[] = [];

  pages.push(pageShell("page-title", `
    <p class="eyebrow">PRIVATE LIFE DOSSIER</p>
    <p class="large-prose">${text(script?.logline || snapshot.persona.coreTension)}</p>
    <div class="identity-grid">
      <span><b>年代</b>${text(snapshot.persona.era)}</span>
      <span><b>地点</b>${text(snapshot.persona.location)}</span>
      <span><b>身份</b>${text(snapshot.persona.identity)}</span>
      <span><b>阶层</b>${text(snapshot.persona.socialClass)}</span>
    </div>
  `));

  pages.push(pageShell("page-portrait", `
    ${imageFrame(anchorSrc, snapshot.persona.title, undefined, "image-frame-anchor")}
  `));

  pages.push(pageShell("page-toc", `
    <p class="eyebrow">TABLE OF FATE</p>
    <h2>命运目录</h2>
    ${chapterList(chapters)}
  `, "data-toc-page"));

  pages.push(pageShell("page-prose", `
    <p class="eyebrow">WORLD BIBLE</p>
    <h2>世界与暗流</h2>
    <p>${text(script?.worldview || snapshot.persona.coreTension)}</p>
    <hr/>
    <p>${text(script?.lifeArc || "人生弧线尚未写定。")}</p>
    <p>${text(script?.relationshipArc || "关系暗线仍藏在阴影中。")}</p>
  `));

  if (script?.fullText) {
    pages.push(pageShell("page-manuscript", `
      <p class="eyebrow">COMPLETE MANUSCRIPT</p>
      <h2>完整人生剧本</h2>
      <div class="scroll-prose">${prose(script.fullText)}</div>
    `));
    pages.push(pageShell("page-vellum", `
      <p class="seal">人生不是答案，而是每一次选择留下的铜锈。</p>
      <div class="constraints">${snapshot.persona.constraints.map((item) => `<span>${text(item)}</span>`).join("")}</div>
    `));
  }

  for (const chapter of chapters) {
    pages.push(pageShell("page-chapter", `
      <p class="eyebrow">CHAPTER ${String(chapter.chapterIndex + 1).padStart(2, "0")}</p>
      <h2>${text(chapter.title)}</h2>
      <p class="age-range">${text(chapter.ageRange)}</p>
      <p class="choice-ribbon">选择：${text(chapter.selectedChoiceLabel)}</p>
      <p>${text(chapter.summary)}</p>
    `, `data-chapter-id="${text(chapter.chapterId)}"`));

    pages.push(pageShell("page-prose", `
      <p class="eyebrow">INNER MONOLOGUE</p>
      <h2>${text(chapter.title)}</h2>
      <div class="chapter-meta">
        <span>${text(chapter.characterMoment)}</span>
        <span>${text(chapter.emotionalTurn)}</span>
        <span>${text(chapter.consequence)}</span>
      </div>
      <p>${prose(chapter.fullText || chapter.summary)}</p>
      <blockquote>${text(chapter.cliffhanger)}</blockquote>
    `));

    for (const page of chapter.pages) {
      pages.push(await storyPage(page, artifactPathById));
    }
  }

  pages.push(pageShell("page-ending", `
    <p class="eyebrow">FINAL ACT</p>
    <h2>终章</h2>
    <p class="large-prose">${text(script?.ending || "这本书等待最后一笔落下。")}</p>
    <blockquote>${text(script?.epitaph || "愿你在另一种人生里，看见自己。")}</blockquote>
    ${scoreConstellation(snapshot)}
  `));

  return pages;
}

function buildSpreads(pages: string[]): string {
  const spreads: string[] = [];
  for (let i = 0; i < pages.length; i += 2) {
    spreads.push(`<section class="spread${i === 0 ? " is-active" : ""}" data-spread="${i / 2}">${pages[i]}${pages[i + 1] || emptyPage()}</section>`);
  }
  return spreads.join("\n");
}

export async function renderLifeBookHtml(snapshot: LifeBookRunSnapshot, artifactPathById: (artifactId: string) => Promise<string | undefined>): Promise<string> {
  const title = snapshot.script?.title || snapshot.persona.title;
  const logline = snapshot.script?.logline || snapshot.persona.coreTension;
  const pages = await buildPages(snapshot, artifactPathById);
  const spreads = buildSpreads(pages);
  const totalSpreads = Math.max(1, Math.ceil(pages.length / 2));

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${text(title)}</title>
<style>
:root{--ink:#06070b;--velvet:#130d19;--midnight:#080d18;--brass:#d6ad62;--brass2:#f6d78b;--copper:#9f5d2a;--iron:#1b1b20;--paper:#efe1bf;--paper2:#c9ae78;--blood:#5b1218;--mist:rgba(255,255,255,.08);--shadow:rgba(0,0,0,.72)}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#02030a;color:#f7edcf}body{font-family:Baskerville,"Iowan Old Style","Palatino Linotype","Songti SC",serif;overflow-x:hidden}.world{position:relative;min-height:100vh;padding:28px;background:radial-gradient(circle at 50% -10%,rgba(246,215,139,.22),transparent 28%),radial-gradient(circle at 12% 18%,rgba(91,18,24,.42),transparent 28%),radial-gradient(circle at 88% 12%,rgba(45,31,73,.42),transparent 32%),linear-gradient(135deg,#02030a 0%,#0a0d16 48%,#030309 100%)}.world:before{content:"";position:fixed;inset:0;pointer-events:none;background:repeating-radial-gradient(circle at 22% 30%,rgba(255,255,255,.035) 0 1px,transparent 1px 4px),radial-gradient(circle at 50% 50%,transparent 35%,rgba(0,0,0,.72) 100%);mix-blend-mode:screen;opacity:.55}.world:after{content:"";position:fixed;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(255,255,255,.02),transparent 8%,rgba(0,0,0,.12) 9%,transparent 10%);background-size:42px 100%;opacity:.25}.cover-stage,.reader-stage{position:relative;z-index:1;min-height:calc(100vh - 56px);display:grid;place-items:center}.reader-stage{display:none}.reader-stage.is-open{display:grid}.closed-book{position:relative;width:min(560px,88vw);aspect-ratio:3/4;max-height:calc(100vh - 76px);padding:70px 54px 54px;border-radius:22px 34px 34px 22px;overflow:hidden;background:radial-gradient(ellipse at 28% 18%,rgba(255,219,140,.08),transparent 34%),radial-gradient(ellipse at 72% 72%,rgba(0,0,0,.28),transparent 42%),repeating-linear-gradient(96deg,rgba(255,255,255,.025) 0 1px,transparent 1px 7px),repeating-linear-gradient(8deg,rgba(0,0,0,.12) 0 2px,transparent 2px 18px),linear-gradient(90deg,#10080a 0 8%,#241014 9%,#35161a 34%,#1a0b10 100%);box-shadow:0 48px 130px var(--shadow),inset 0 0 0 2px rgba(166,116,55,.18),inset 28px 0 48px rgba(0,0,0,.62),inset -18px -12px 60px rgba(0,0,0,.28);cursor:pointer;transform:none;transition:transform .8s ease,filter .8s ease}.closed-book:hover{transform:translateY(-6px);filter:brightness(1.06)}.closed-book:before{content:"";position:absolute;inset:24px;border:1px solid rgba(171,126,62,.46);border-radius:16px 26px 26px 16px;box-shadow:inset 0 0 0 5px rgba(58,33,20,.46),0 0 26px rgba(122,84,43,.12);background:linear-gradient(115deg,transparent 0 16%,rgba(255,235,170,.035) 17%,transparent 19% 45%,rgba(0,0,0,.16) 46%,transparent 48% 100%),radial-gradient(ellipse at 18% 82%,rgba(255,226,150,.045),transparent 30%);mix-blend-mode:screen}.closed-book:after{content:"";position:absolute;top:38px;bottom:38px;left:70px;width:1px;background:linear-gradient(transparent,var(--brass2),transparent);opacity:.7}.spine{position:absolute;left:0;top:0;bottom:0;width:54px;border-radius:22px 0 0 22px;background:linear-gradient(90deg,#070508,#201014,#080508);box-shadow:inset -10px 0 18px rgba(246,215,139,.12)}.cover-content{position:absolute;z-index:2;inset:70px 48px 54px 92px;text-align:center;display:grid;gap:18px;align-content:center;justify-items:center;overflow:hidden}.eyebrow{margin:0;color:#c9a561;font:800 12px/1.4 ui-sans-serif,system-ui;letter-spacing:.28em;text-transform:uppercase}.cover-title,.page h2{font-family:"Snell Roundhand","Zapfino",Baskerville,"Songti SC",cursive}.cover-title{margin:0;max-width:100%;font-size:clamp(28px,4.4vw,46px);line-height:1.12;color:transparent;background:linear-gradient(120deg,#5d3519,#c49a56 38%,#7e4a25 72%,#d2b16c);-webkit-background-clip:text;background-clip:text;text-shadow:0 0 12px rgba(120,82,39,.12);overflow-wrap:anywhere;word-break:break-word;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}.cover-logline{max-width:92%;font-size:16px;line-height:1.62;color:#b9a171;text-shadow:0 2px 14px #000;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}.constraints span{border:1px solid rgba(214,173,98,.32);border-radius:999px;padding:7px 12px;background:rgba(6,7,11,.42);color:#f4dfad}.open-cta,.nav button{border:1px solid rgba(246,215,139,.48);border-radius:999px;padding:12px 20px;color:#12080b;background:linear-gradient(135deg,#8f5425,#f6d78b 46%,#9f5d2a);font-weight:900;letter-spacing:.08em;box-shadow:0 14px 36px rgba(0,0,0,.36);cursor:pointer}.open-cta{justify-self:center;margin-top:12px}.reader-shell{width:min(1500px,96vw);display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:18px}.reader-top{display:grid;place-items:center;gap:10px;padding:0 10px}.reader-title{text-align:center}.reader-title h1{margin:4px 0 0;font-size:clamp(24px,3.4vw,40px);font-weight:500;color:#d7b46c}.reader-title p{margin:5px 0 0;color:#bda878}.book{position:relative;width:min(1500px,96vw);aspect-ratio:4/3;max-height:calc(100vh - 190px);min-height:680px;padding:28px;border-radius:28px;background:linear-gradient(90deg,#1a0e12,#08070b 50%,#1a0e12);box-shadow:0 36px 120px var(--shadow),inset 0 0 0 1px rgba(246,215,139,.16);overflow:hidden}.book:before{content:"";position:absolute;left:50%;top:28px;bottom:28px;width:34px;transform:translateX(-50%);background:radial-gradient(ellipse at center,rgba(0,0,0,.58),transparent 72%);z-index:3;pointer-events:none}.spread{display:none;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;height:100%;min-height:0;animation:turn .5s ease}.spread.is-active{display:grid}@keyframes turn{from{opacity:.2;transform:perspective(1400px) rotateY(var(--turn,5deg)) translateY(8px)}to{opacity:1;transform:none}}.page{position:relative;overflow-y:auto;overflow-x:hidden;height:100%;min-height:0;border-radius:18px;padding:34px;background:linear-gradient(135deg,rgba(255,247,222,.96),rgba(219,195,137,.96));color:#1f140d;box-shadow:inset 0 0 38px rgba(88,55,18,.24),0 22px 50px rgba(0,0,0,.32);font-size:16px;line-height:1.55;scrollbar-width:thin;scrollbar-color:rgba(95,55,22,.45) rgba(95,55,22,.08)}.page::-webkit-scrollbar{width:9px}.page::-webkit-scrollbar-track{background:rgba(95,55,22,.08);border-radius:999px}.page::-webkit-scrollbar-thumb{background:rgba(95,55,22,.42);border-radius:999px}.page:before{content:"";position:fixed;inset:auto;pointer-events:none;background:none}.page>*{position:relative;z-index:1}.page h2{margin:8px 0 16px;font-size:clamp(24px,2.4vw,36px);line-height:1.12;color:#4b2411}.large-prose{font-size:19px;line-height:1.52}.identity-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:28px}.identity-grid span,.chapter-meta span{display:grid;gap:4px;padding:14px;border:1px solid rgba(75,36,17,.2);border-radius:14px;background:rgba(255,255,255,.22)}.identity-grid b{font:800 11px/1.2 ui-sans-serif,system-ui;letter-spacing:.18em;color:#8d4d1f}.image-frame{margin:0;position:relative;border:9px solid #3a2115;border-image:linear-gradient(135deg,#3a2115,#d6ad62,#70401e) 1;background:#120d0b;box-shadow:0 24px 46px rgba(54,30,12,.28),inset 0 0 0 1px rgba(246,215,139,.3)}.image-frame img{display:block;width:100%;height:min(520px,52vh);object-fit:contain;background:#120d0b;filter:saturate(.92) contrast(1.05)}.image-frame-anchor{min-height:100%;display:grid;place-items:center}.image-frame-anchor img{height:auto;max-height:none;object-fit:contain;background:#120d0b}.image-frame figcaption{padding:12px 14px;color:#f2dfaf;background:linear-gradient(90deg,#1d120d,#422614);font-size:14px}.image-frame-empty{height:420px;display:grid;place-items:center;color:#d6ad62;letter-spacing:.2em;text-align:center}.hand-note{font-family:"Snell Roundhand","Zapfino",cursive;font-size:24px;color:#5b2a14;transform:rotate(-2deg)}.toc-list{list-style:none;margin:24px 0 0;padding:0;display:grid;gap:12px}.toc-list li{border-bottom:1px dotted rgba(75,36,17,.35);padding-bottom:12px}.toc-list button{display:grid;grid-template-columns:92px 1fr;gap:12px;width:100%;border:0;background:transparent;color:inherit;text-align:left;padding:0;cursor:pointer;font:inherit}.toc-list button:hover b{color:#8d4d1f;text-decoration:underline}.toc-list span{color:#8d4d1f;font-weight:900}.toc-list b{font-size:19px}.toc-list em{grid-column:2;color:#6b4a2d}.muted{color:#725235}.scroll-prose{max-height:none;overflow:visible;padding-right:0}.seal{display:grid;place-items:center;min-height:48vh;border:1px solid rgba(75,36,17,.22);border-radius:50%;padding:40px;text-align:center;font-size:30px;color:#5b1218}.constraints{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}.constraints span{color:#4b2411;background:rgba(255,255,255,.28);border-color:rgba(75,36,17,.18)}.age-range{font-size:28px;color:#8d4d1f}.choice-ribbon{display:inline-block;background:#4b2411;color:#f4dfad;border-radius:999px;padding:8px 14px}.chapter-meta{display:grid;gap:10px;margin:20px 0}blockquote{margin:24px 0 0;padding:18px 22px;border-left:4px solid #9f5d2a;background:rgba(75,36,17,.08);font-size:20px}.page-illustration{display:grid;grid-template-rows:auto auto;align-content:start;gap:14px;background:linear-gradient(135deg,#1a1010,#332011);color:#f6e7bf}.page-illustration h3{margin:4px 0 8px;color:#f6d78b;font-size:28px}.page-illustration .image-frame img{height:auto;max-height:none;object-fit:contain}.scene-card{padding:18px;border:1px solid rgba(246,215,139,.24);border-radius:16px;background:rgba(0,0,0,.2)}.page-corner{position:absolute;right:24px;top:22px;color:rgba(246,215,139,.48);font-size:46px;font-weight:900}.page-ending{text-align:center}.score-constellation{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px;margin-top:28px}.score-constellation span{display:grid;place-items:center;min-height:96px;border-radius:50%;background:radial-gradient(circle,#f6d78b,#9f5d2a);color:#1f140d;font-weight:900}.score-constellation b{font-size:12px;letter-spacing:.08em}.page-empty{display:grid;place-items:center}.empty-mark{font-size:64px;color:rgba(75,36,17,.18)}.nav{display:flex;align-items:center;justify-content:center;gap:18px}.nav button:disabled{opacity:.42;cursor:not-allowed}.counter{min-width:110px;text-align:center;color:#c9a561;font-weight:900;letter-spacing:.16em}.toc-jump{position:fixed;right:24px;bottom:22px;z-index:5;border:1px solid rgba(171,126,62,.42);border-radius:999px;padding:11px 16px;color:#d2b16c;background:rgba(14,10,12,.72);box-shadow:0 14px 38px rgba(0,0,0,.38);backdrop-filter:blur(8px);cursor:pointer;font-weight:800;letter-spacing:.08em}.toc-jump:hover{color:#ead49a;border-color:rgba(210,177,108,.7)}.hint{position:fixed;left:24px;bottom:18px;color:rgba(201,165,97,.54);font-size:13px;z-index:2}@media(max-width:900px){.world{padding:12px}.closed-book{width:min(520px,92vw);aspect-ratio:3/4;padding:58px 34px}.cover-content{inset:58px 30px 42px 70px}.cover-title{font-size:clamp(24px,7vw,38px)}.reader-top{display:grid;justify-items:center}.book{width:96vw;aspect-ratio:auto;height:auto;max-height:none;min-height:70vh;padding:12px;overflow:visible}.book:before{display:none}.spread{grid-template-columns:1fr;height:auto;min-height:auto}.page{height:auto;min-height:70vh;padding:30px}.image-frame img{height:auto}.hint{display:none}}
</style>
</head>
<body>
<main class="world">
  <section class="cover-stage" id="coverStage">
    <div class="closed-book" id="openBook" role="button" tabindex="0" aria-label="翻开人生故事书">
      <div class="spine"></div>
      <div class="cover-content">
        <p class="eyebrow">LIFE BOOK STUDIO</p>
        <h1 class="cover-title">${text(title)}</h1>
        <p class="cover-logline">${text(logline)}</p>
        <button class="open-cta" type="button">翻开人生篇章</button>
      </div>
    </div>
  </section>
  <section class="reader-stage" id="readerStage" aria-hidden="true">
    <div class="reader-shell">
      <header class="reader-top">
        <div class="reader-title"><p class="eyebrow">今天你要体验的人生副本是——</p><h1>${text(title)}</h1><p>${text(logline)}</p></div>
      </header>
      <div class="book" id="book">${spreads}</div>
      <nav class="nav" aria-label="翻页">
        <button type="button" id="prevPage">上一页</button>
        <div class="counter"><span id="currentPage">1</span> / ${totalSpreads}</div>
        <button type="button" id="nextPage">下一页</button>
      </nav>
    </div>
    <button class="toc-jump" type="button" id="tocJump">回到目录</button>
  </section>
  <div class="hint">← → 键翻页 · 点击封面打开</div>
</main>
<script>
(function(){
  var coverStage=document.getElementById('coverStage');
  var readerStage=document.getElementById('readerStage');
  var openBook=document.getElementById('openBook');
  var prev=document.getElementById('prevPage');
  var next=document.getElementById('nextPage');
  var tocJump=document.getElementById('tocJump');
  var current=document.getElementById('currentPage');
  var spreads=Array.prototype.slice.call(document.querySelectorAll('.spread'));
  var index=0;
  function show(i,dir){
    index=Math.max(0,Math.min(spreads.length-1,i));
    spreads.forEach(function(spread,n){spread.classList.toggle('is-active',n===index);spread.style.setProperty('--turn',dir==='back'?'-7deg':'7deg');});
    current.textContent=String(index+1);
    prev.disabled=index===0;
    next.disabled=index===spreads.length-1;
  }
  function spreadIndexForChapter(chapterId){
    var page=document.querySelector('[data-chapter-id="'+chapterId+'"]');
    var spread=page&&page.closest('.spread');
    return spread?spreads.indexOf(spread):-1;
  }
  function spreadIndexForToc(){
    var page=document.querySelector('[data-toc-page]');
    var spread=page&&page.closest('.spread');
    return spread?spreads.indexOf(spread):0;
  }
  function open(){coverStage.style.display='none';readerStage.classList.add('is-open');readerStage.setAttribute('aria-hidden','false');show(index,'forward');}
  function close(){readerStage.classList.remove('is-open');readerStage.setAttribute('aria-hidden','true');coverStage.style.display='grid';}
  openBook.addEventListener('click',open);
  openBook.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
  document.querySelectorAll('[data-goto-chapter]').forEach(function(button){button.addEventListener('click',function(){var target=spreadIndexForChapter(button.getAttribute('data-goto-chapter'));if(target>=0)show(target,target<index?'back':'forward');});});
  tocJump.addEventListener('click',function(){var target=spreadIndexForToc();show(target,target<index?'back':'forward');});
  prev.addEventListener('click',function(){show(index-1,'back');});
  next.addEventListener('click',function(){show(index+1,'forward');});
  document.addEventListener('keydown',function(event){if(!readerStage.classList.contains('is-open'))return;if(event.key==='ArrowLeft')show(index-1,'back');if(event.key==='ArrowRight')show(index+1,'forward');if(event.key==='Escape')close();});
  show(0,'forward');
})();
</script>
</body>
</html>`;
}
