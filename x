<?xml version="1.0" encoding="utf-8" ?>
<qdbapi>
	<action>API_GetDBPage</action>
	<errcode>0</errcode>
	<errtext>No error</errtext>
	<pagebody>
<BR/>
<BR/>
<BR/>
<BR/>
<BR/>
<BR/>
<BR/>
<BR/>
<BR/>
&lt;!DOCTYPE html&gt;<BR/>
&lt;html lang=&quot;en&quot;&gt;<BR/>
&lt;head&gt;<BR/>
&lt;meta charset=&quot;UTF-8&quot;&gt;<BR/>
&lt;meta name=&quot;viewport&quot; content=&quot;width=device-width, initial-scale=1.0&quot;&gt;<BR/>
&lt;title&gt;Byrdson — Puerto Rico Command Center&lt;/title&gt;<BR/>
&lt;!-- ============================================================<BR/>
     BYRDSON SERVICES / EXCELLO HOMES<BR/>
     MASTER DASHBOARD  ·  Quickbase Code Page<BR/>
     ------------------------------------------------------------<BR/>
     HOW IT WORKS<BR/>
       • Shows a grid of panels (one per dashboard).<BR/>
       • Click a panel  -&gt; that dashboard opens IN THE SAME PAGE<BR/>
         inside a frame, with a &quot;Back to menu&quot; button.<BR/>
       • No page reload, no leaving the dashboard.<BR/>
     &gt;&gt;&gt; THE ONLY THING YOU NEED TO EDIT IS THE  DASHBOARDS  ARRAY<BR/>
         BELOW (in the SCRIPT section near the bottom).  Paste each<BR/>
         existing dashboard&#039;s Code Page URL into the &quot;url&quot; field.<BR/>
     ============================================================ --&gt;<BR/>
&lt;style&gt;<BR/>
  :root{<BR/>
    --navy:#0f2438;<BR/>
    --navy-2:#16344f;<BR/>
    --blue:#2f6fb0;<BR/>
    --blue-light:#4f93d8;<BR/>
    --gold:#d8a23a;<BR/>
    --bg:#eef2f6;<BR/>
    --card:#ffffff;<BR/>
    --ink:#1d2b39;<BR/>
    --muted:#6a7b8c;<BR/>
    --line:#dde5ed;<BR/>
    --radius:14px;<BR/>
    --shadow:0 6px 22px rgba(15,36,56,.10);<BR/>
    --shadow-hover:0 14px 34px rgba(15,36,56,.20);<BR/>
  }<BR/>
  *{box-sizing:border-box}<BR/>
  html,body{margin:0;padding:0}<BR/>
  body{<BR/>
    font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Helvetica,Arial,sans-serif;<BR/>
    background:var(--bg);<BR/>
    color:var(--ink);<BR/>
    -webkit-font-smoothing:antialiased;<BR/>
  }<BR/>
  /* ---------- Top bar ---------- */<BR/>
  .topbar{<BR/>
    background:linear-gradient(135deg,var(--navy) 0%,var(--navy-2) 100%);<BR/>
    color:#fff;<BR/>
    padding:18px 26px;<BR/>
    display:flex;align-items:center;gap:16px;<BR/>
    box-shadow:0 2px 10px rgba(0,0,0,.18);<BR/>
    position:sticky;top:0;z-index:50;<BR/>
  }<BR/>
  .brand-logo{<BR/>
    height:40px;width:auto;flex:none;display:block;<BR/>
    background:#fff;border-radius:8px;padding:6px 10px;<BR/>
    box-shadow:0 3px 8px rgba(0,0,0,.22);<BR/>
  }<BR/>
  .brand-text h1{margin:0;font-size:18px;font-weight:700;letter-spacing:.3px}<BR/>
  .brand-text p{margin:0;font-size:12px;color:#a9c0d6;letter-spacing:1px;text-transform:uppercase;font-weight:600}<BR/>
  .topbar .spacer{flex:1}<BR/>
  .back-btn{<BR/>
    display:none;align-items:center;gap:8px;<BR/>
    background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);<BR/>
    color:#fff;font-size:13px;font-weight:600;cursor:pointer;<BR/>
    padding:9px 16px;border-radius:9px;transition:.18s;<BR/>
  }<BR/>
  .back-btn:hover{background:rgba(255,255,255,.22)}<BR/>
  a.back-btn{text-decoration:none}<BR/>
  .back-btn svg{width:15px;height:15px}<BR/>
  .crumb{display:none;font-size:13px;color:#bcd2e6}<BR/>
  .crumb b{color:#fff}<BR/>
  /* ---------- Live KTO strip ---------- */<BR/>
  .kto-strip{<BR/>
    display:none;align-items:center;gap:22px;flex-wrap:wrap;<BR/>
    background:linear-gradient(135deg,#12283e 0%,#1d3f5e 100%);<BR/>
    color:#fff;border-radius:var(--radius);padding:16px 22px;margin:0 2px 26px;<BR/>
    box-shadow:var(--shadow);text-decoration:none;transition:transform .18s,box-shadow .18s;<BR/>
  }<BR/>
  .kto-strip:hover{transform:translateY(-2px);box-shadow:var(--shadow-hover)}<BR/>
  .kto-strip.ready{display:flex}<BR/>
  .kto-lead{display:flex;flex-direction:column;gap:2px;min-width:190px}<BR/>
  .kto-eyebrow{font-size:11px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:var(--gold)}<BR/>
  .kto-sub{font-size:13px;color:#bcd2e6}<BR/>
  .kto-stats{display:flex;gap:26px;flex-wrap:wrap;flex:1}<BR/>
  .kto-stat{display:flex;flex-direction:column;gap:1px}<BR/>
  .kto-num{font-size:24px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}<BR/>
  .kto-num.warn{color:#f6c453}<BR/>
  .kto-num.crit{color:#ff8f7a}<BR/>
  .kto-lbl{font-size:11px;color:#a9c0d6;letter-spacing:.4px;text-transform:uppercase;font-weight:600}<BR/>
  .kto-go{font-size:13px;font-weight:600;color:#cfe0f0;white-space:nowrap}<BR/>
  .stage-strip{background:linear-gradient(135deg,#3d2a0b 0%,#7a4c0e 100%)}<BR/>
  .stage-strip .kto-sub{color:#efd9b3}<BR/>
  .stage-strip .kto-lbl{color:#e4c995}<BR/>
  .stage-strip .kto-go{color:#f5e6c8}<BR/>
  @media (max-width:760px){.kto-stats{gap:18px}.kto-num{font-size:20px}}<BR/>
  /* ---------- Menu (grid) view ---------- */<BR/>
  #menuView{padding:30px 26px 50px;max-width:1180px;margin:0 auto}<BR/>
  .hero{margin:6px 2px 26px}<BR/>
  .hero h2{margin:0;font-size:24px;font-weight:700;color:var(--navy)}<BR/>
  .hero p{margin:6px 0 0;font-size:14px;color:var(--muted);max-width:640px}<BR/>
  .grid{<BR/>
    display:grid;<BR/>
    grid-template-columns:repeat(auto-fill,minmax(270px,1fr));<BR/>
    gap:20px;<BR/>
  }<BR/>
  .panel{<BR/>
    background:var(--card);border:1px solid var(--line);<BR/>
    border-radius:var(--radius);padding:22px 22px 20px;<BR/>
    cursor:pointer;text-align:left;width:100%;<BR/>
    box-shadow:var(--shadow);transition:transform .18s,box-shadow .18s,border-color .18s;<BR/>
    position:relative;overflow:hidden;<BR/>
    display:flex;flex-direction:column;min-height:182px;<BR/>
  }<BR/>
  .panel:before{<BR/>
    content:&quot;&quot;;position:absolute;left:0;top:0;height:100%;width:5px;<BR/>
    background:var(--accent,var(--blue));<BR/>
  }<BR/>
  .panel:hover{transform:translateY(-4px);box-shadow:var(--shadow-hover);border-color:var(--accent,var(--blue))}<BR/>
  .panel:focus-visible{outline:3px solid var(--blue-light);outline-offset:2px}<BR/>
  a.panel{text-decoration:none;color:inherit}<BR/>
  .p-icon{<BR/>
    width:48px;height:48px;border-radius:12px;flex:none;<BR/>
    background:var(--accent-soft,#eaf2fb);color:var(--accent,var(--blue));<BR/>
    display:flex;align-items:center;justify-content:center;margin-bottom:14px;<BR/>
  }<BR/>
  .p-icon svg{width:26px;height:26px}<BR/>
  .panel h3{margin:0 0 6px;font-size:17px;font-weight:700;color:var(--navy)}<BR/>
  .panel p{margin:0;font-size:13px;line-height:1.5;color:var(--muted);flex:1}<BR/>
  .p-open{<BR/>
    margin-top:14px;font-size:12.5px;font-weight:700;color:var(--accent,var(--blue));<BR/>
    display:flex;align-items:center;gap:6px;letter-spacing:.3px;<BR/>
  }<BR/>
  .p-open svg{width:14px;height:14px;transition:transform .18s}<BR/>
  .panel:hover .p-open svg{transform:translateX(4px)}<BR/>
  .footer-note{margin:30px 2px 0;font-size:12px;color:var(--muted)}<BR/>
  .section-title{<BR/>
    margin:30px 2px 14px;font-size:13px;font-weight:800;letter-spacing:1.2px;<BR/>
    text-transform:uppercase;color:var(--navy);display:flex;align-items:center;gap:12px;<BR/>
  }<BR/>
  #sections &gt; .section-title:first-child{margin-top:4px}<BR/>
  .section-title:after{content:&quot;&quot;;flex:1;height:1px;background:var(--line)}<BR/>
  /* ---------- Frame (report) view ---------- */<BR/>
  #frameView{display:none;flex-direction:column;position:fixed;inset:0;top:78px;background:#fff}<BR/>
  .frame-wrap{position:relative;flex:1;min-height:0}<BR/>
  #frameView iframe{width:100%;height:100%;border:0;display:block}<BR/>
  .frame-loading{<BR/>
    position:absolute;inset:0;display:flex;align-items:center;justify-content:center;<BR/>
    flex-direction:column;gap:14px;color:var(--muted);font-size:14px;background:#fff;<BR/>
  }<BR/>
  .spinner{<BR/>
    width:34px;height:34px;border-radius:50%;<BR/>
    border:3px solid var(--line);border-top-color:var(--blue);<BR/>
    animation:spin .8s linear infinite;<BR/>
  }<BR/>
  @keyframes spin{to{transform:rotate(360deg)}}<BR/>
  @media (max-width:560px){<BR/>
    .topbar{padding:14px 16px}<BR/>
    #menuView{padding:22px 16px 40px}<BR/>
    .crumb{display:none !important}<BR/>
  }<BR/>
&lt;/style&gt;<BR/>
&lt;/head&gt;<BR/>
&lt;body&gt;<BR/>
  &lt;!-- ============ TOP BAR ============ --&gt;<BR/>
  &lt;div class=&quot;topbar&quot;&gt;<BR/>
    &lt;img class=&quot;brand-logo&quot;<BR/>
         src=&quot;https://byrdsonservices.com/wp-content/uploads/2013/10/cropped-cropped-cropped-cropped-ByrdsonServicesLogoHort2.png&quot;<BR/>
         alt=&quot;Byrdson Services&quot;&gt;<BR/>
    &lt;div class=&quot;brand-text&quot;&gt;<BR/>
      &lt;p&gt;Puerto Rico Command Center&lt;/p&gt;<BR/>
    &lt;/div&gt;<BR/>
    &lt;div class=&quot;spacer&quot;&gt;&lt;/div&gt;<BR/>
    &lt;span class=&quot;crumb&quot; id=&quot;crumb&quot;&gt;&lt;/span&gt;<BR/>
    &lt;a class=&quot;back-btn&quot; id=&quot;newTabBtn&quot; target=&quot;_blank&quot; rel=&quot;noopener noreferrer&quot;&gt;<BR/>
      &lt;svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2.4&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;&gt;&lt;path d=&quot;M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6&quot;/&gt;&lt;path d=&quot;M15 3h6v6&quot;/&gt;&lt;path d=&quot;M10 14L21 3&quot;/&gt;&lt;/svg&gt;<BR/>
      Open in a new tab<BR/>
    &lt;/a&gt;<BR/>
    &lt;button class=&quot;back-btn&quot; id=&quot;backBtn&quot; onclick=&quot;showMenu()&quot;&gt;<BR/>
      &lt;svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2.4&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;&gt;&lt;path d=&quot;M15 18l-6-6 6-6&quot;/&gt;&lt;/svg&gt;<BR/>
      Back to menu<BR/>
    &lt;/button&gt;<BR/>
  &lt;/div&gt;<BR/>
  &lt;!-- ============ MENU (GRID) VIEW ============ --&gt;<BR/>
  &lt;div id=&quot;menuView&quot;&gt;<BR/>
    &lt;div class=&quot;hero&quot;&gt;<BR/>
      &lt;h2&gt;Pick your lane&lt;/h2&gt;<BR/>
      &lt;p&gt;Coordinators, Permits, Finance, Closeout. Each panel opens right here; use &lt;b&gt;Back to menu&lt;/b&gt; to return. Start with &lt;b&gt;My Work&lt;/b&gt;.&lt;/p&gt;<BR/>
    &lt;/div&gt;<BR/>
    &lt;!-- Live KTO closeout status. Reads KTO Readiness with the signed-in QB session<BR/>
         (same legacy-API pattern as pages 89/91/102) - no user token prompt. --&gt;<BR/>
    &lt;a class=&quot;kto-strip&quot; id=&quot;ktoStrip&quot; href=&quot;https://byrdsonservices.quickbase.com/db/buskqh26r?a=dbpage&amp;pageID=105&quot;&gt;<BR/>
      &lt;div class=&quot;kto-lead&quot;&gt;<BR/>
        &lt;span class=&quot;kto-eyebrow&quot;&gt;Key Turnover &amp;mdash; live&lt;/span&gt;<BR/>
        &lt;span class=&quot;kto-sub&quot; id=&quot;ktoSub&quot;&gt;Loading closeout queue&amp;hellip;&lt;/span&gt;<BR/>
      &lt;/div&gt;<BR/>
      &lt;div class=&quot;kto-stats&quot; id=&quot;ktoStats&quot;&gt;&lt;/div&gt;<BR/>
      &lt;span class=&quot;kto-go&quot;&gt;Open KTO Queue &amp;rsaquo;&lt;/span&gt;<BR/>
    &lt;/a&gt;<BR/>
<BR/>
    &lt;!-- Live PR stage funnel. Reads Jobs PR Stage (fid 1474) with the signed-in session. Hidden unless the read succeeds. --&gt;<BR/>
    &lt;a class=&quot;kto-strip stage-strip&quot; id=&quot;stageStrip&quot; href=&quot;https://byrdsonservices.quickbase.com/db/buskqh27b?a=q&amp;query={35.EX.&#039;OPEN&#039;}AND{11.EX.&#039;Puerto Rico&#039;}AND{1474.XEX.&#039;&#039;}&amp;clist=6.490.34.880.1474.1476.1477.1295.1116.1136&amp;slist=1475.1477&amp;options=sortorder-D&quot;&gt;<BR/>
      &lt;div class=&quot;kto-lead&quot;&gt;<BR/>
        &lt;span class=&quot;kto-eyebrow&quot;&gt;Open PR jobs by stage &amp;mdash; live&lt;/span&gt;<BR/>
        &lt;span class=&quot;kto-sub&quot; id=&quot;stageSub&quot;&gt;Loading stages&amp;hellip;&lt;/span&gt;<BR/>
      &lt;/div&gt;<BR/>
      &lt;div class=&quot;kto-stats&quot; id=&quot;stageStats&quot;&gt;&lt;/div&gt;<BR/>
      &lt;span class=&quot;kto-go&quot;&gt;Open the list &amp;rsaquo;&lt;/span&gt;<BR/>
    &lt;/a&gt;<BR/>
    &lt;div id=&quot;sections&quot;&gt;&lt;!-- sections injected by JS --&gt;&lt;/div&gt;<BR/>
    &lt;div class=&quot;footer-note&quot; id=&quot;footNote&quot;&gt;&lt;/div&gt;<BR/>
  &lt;/div&gt;<BR/>
  &lt;!-- ============ FRAME (REPORT) VIEW ============ --&gt;<BR/>
  &lt;div id=&quot;frameView&quot;&gt;<BR/>
    &lt;div class=&quot;frame-wrap&quot;&gt;<BR/>
      &lt;div class=&quot;frame-loading&quot; id=&quot;frameLoading&quot;&gt;&lt;div class=&quot;spinner&quot;&gt;&lt;/div&gt;&lt;span&gt;Loading dashboard…&lt;/span&gt;&lt;/div&gt;<BR/>
      &lt;iframe id=&quot;dashFrame&quot; title=&quot;Dashboard&quot; referrerpolicy=&quot;same-origin&quot;&gt;&lt;/iframe&gt;<BR/>
    &lt;/div&gt;<BR/>
  &lt;/div&gt;<BR/>
&lt;script&gt;<BR/>
/* ================================================================<BR/>
   ▼▼▼  EDIT ONLY THIS LIST  ▼▼▼<BR/>
   For each dashboard, paste its Quickbase Code Page URL into &quot;url&quot;.<BR/>
   A code-page URL usually looks like:<BR/>
     https://YOURREALM.quickbase.com/db/APP_DBID?a=dbpage&amp;pageID=12<BR/>
   (You can also use a relative URL like  /db/APP_DBID?a=dbpage&amp;pageID=12 )<BR/>
   Add or remove items freely — the grid rebuilds automatically.<BR/>
   ================================================================ */<BR/>
const QB = &quot;https://byrdsonservices.quickbase.com/db/buskqh26r?a=dbpage&amp;pageID=&quot;;<BR/>
/* Lanes, one per role. Order inside a lane = the order people use them on a normal day.<BR/>
   Rebuilt 2026-08-22: orphaned pages 41 and 75 linked, 57/58 merged into 118, permits put on one lane. */<BR/>
const DASHBOARDS = [<BR/>
    { key:&quot;prtransition&quot;, section:&quot;Coordinators — every case, every day&quot;,<BR/>
          title:&quot;PR EXISTING PROJECT WORK QUEUE&quot;,<BR/>
    desc:&quot;Start here to bring existing Puerto Rico projects up to date, confirm Canopy stage and route, attach evidence, and send the transition for review.&quot;,<BR/>
    url:&quot;https://byrdsonservices.quickbase.com/db/buskqh26r/ad506c1a-ac25-4967-b1e0-5f1d7f38d591?a=showpage&amp;pageIdV2=52d055d1-9a0a-4a62-98cf-29eceb37c42c&quot;, color:&quot;#b4235a&quot;, soft:&quot;#fde7f0&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M4 5h16v14H4z&quot;/&gt;&lt;path d=&quot;M8 9h8M8 13h8&quot;/&gt;&#039; },<BR/>
/* ---------------- Coordinators ---------------- */<BR/>
  { key:&quot;mywork&quot;, section:&quot;Coordinators — every case, every day&quot;,<BR/>
    title:&quot;My Work — everything you owe&quot;,<BR/>
    desc:&quot;Opens straight onto your own list from your Quickbase sign-in. Every open item you own across every case, most overdue first.&quot;,<BR/>
    url:QB+&quot;114&quot;, color:&quot;#1d4e89&quot;, soft:&quot;#e2eaf4&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M9 11l3 3 8-8&quot;/&gt;&lt;path d=&quot;M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11&quot;/&gt;&#039; },<BR/>
  { key:&quot;precontasks&quot;, section:&quot;Coordinators — every case, every day&quot;,<BR/>
    title:&quot;My Precon Tasks — what is on your plate&quot;,<BR/>
    desc:&quot;Your open pre-construction tasks across every case, most urgent first, with the internal target date worked out from the Task Order. Coordinators, permits and PM seats are assigned; pick a person to see theirs.&quot;,<BR/>
    url:QB+&quot;119&quot;, color:&quot;#9c6511&quot;, soft:&quot;#f7ebd5&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M9 11l3 3 8-8&quot;/&gt;&lt;path d=&quot;M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11&quot;/&gt;&#039; },<BR/>
  { key:&quot;grantsigning&quot;, section:&quot;Coordinators — every case, every day&quot;,<BR/>
    title:&quot;Grant Signing Day Sheet&quot;,<BR/>
    desc:&quot;Every home still waiting on the Grant Agreement signature: schedule the visit, check off the no-price scope and plans, mark it signed.&quot;,<BR/>
    url:QB+&quot;122&quot;, color:&quot;#0f6b47&quot;, soft:&quot;#dcefe6&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M12 19l7-7 3 3-7 7-3-3z&quot;/&gt;&lt;path d=&quot;M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z&quot;/&gt;&#039; },<BR/>
  { key:&quot;directives&quot;, section:&quot;Coordinators — every case, every day&quot;,<BR/>
    title:&quot;Field Directives — site notes the sub must act on&quot;,<BR/>
    desc:&quot;Every open directive on every PR case: drafts pulled from daily logs to review and send, subs that owe an answer, work reported done that needs a site check, escalations. Raise new ones from the Case Cockpit.&quot;,<BR/>
    url:QB+&quot;137&quot;, color:&quot;#a93226&quot;, soft:&quot;#f7e2df&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M4 4h16v12H8l-4 4z&quot;/&gt;&lt;path d=&quot;M8 8h8M8 12h5&quot;/&gt;&#039; },<BR/>
  { key:&quot;sitewalks&quot;, section:&quot;Coordinators — every case, every day&quot;,<BR/>
    title:&quot;Site Walk Scheduler — get the walk on the calendar&quot;,<BR/>
    desc:&quot;Every reconstruction and repair case still waiting for its initial site walk: homeowner phone, log each call, set the date. Estimator and superintendent get calendar invites; the shared PR site-visit calendar updates by itself; unanswered homeowners get flagged.&quot;,<BR/>
    url:QB+&quot;138&quot;, color:&quot;#0f6b47&quot;, soft:&quot;#dcefe6&quot;,<BR/>
    icon:&#039;&lt;rect x=&quot;3&quot; y=&quot;4&quot; width=&quot;18&quot; height=&quot;18&quot; rx=&quot;2&quot;/&gt;&lt;path d=&quot;M16 2v4M8 2v4M3 10h18&quot;/&gt;&lt;path d=&quot;M9 16l2 2 4-4&quot;/&gt;&#039; },<BR/>
  { key:&quot;playbook&quot;, section:&quot;Coordinators — every case, every day&quot;,<BR/>
    title:&quot;How This System Works&quot;,<BR/>
    desc:&quot;The playbook: awards, draws, the construction clock, weather delays, change orders, and every automatic email — in plain language.&quot;,<BR/>
    url:QB+&quot;121&quot;, color:&quot;#1f6feb&quot;, soft:&quot;#e3edfb&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M4 19.5A2.5 2.5 0 0 1 6.5 17H20&quot;/&gt;&lt;path d=&quot;M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z&quot;/&gt;&#039; },<BR/>
  { key:&quot;cockpit&quot;, section:&quot;Coordinators — every case, every day&quot;,<BR/>
    title:&quot;Case Cockpit — one project&quot;,<BR/>
    desc:&quot;One page per case: milestone ladder with dates, what is next and who owns it, binder and documents, roof and bond chain, what is blocking.&quot;,<BR/>
    url:QB+&quot;113&quot;, color:&quot;#0f766e&quot;, soft:&quot;#e0f2f0&quot;,<BR/>
    icon:&#039;&lt;rect x=&quot;3&quot; y=&quot;3&quot; width=&quot;18&quot; height=&quot;18&quot; rx=&quot;2&quot;/&gt;&lt;path d=&quot;M3 9h18&quot;/&gt;&lt;path d=&quot;M9 21V9&quot;/&gt;&#039; },<BR/>
  { key:&quot;prstage&quot;, section:&quot;Coordinators — every case, every day&quot;,<BR/>
    title:&quot;Open PR Jobs by Stage&quot;,<BR/>
    desc:&quot;Every open Puerto Rico job with its stage (read from Canopy, nobody types it) and how many days it has been there. Longest-waiting first.&quot;,<BR/>
    url:&quot;https://byrdsonservices.quickbase.com/db/buskqh27b?a=q&amp;query={35.EX.&#039;OPEN&#039;}AND{11.EX.&#039;Puerto Rico&#039;}AND{1474.XEX.&#039;&#039;}&amp;clist=6.490.34.880.1474.1476.1477.1295.1116.1136&amp;slist=1475.1477&amp;options=sortorder-D&quot;,<BR/>
    color:&quot;#b8741a&quot;, soft:&quot;#f7ebd5&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M4 19h16&quot;/&gt;&lt;path d=&quot;M6 16V9&quot;/&gt;&lt;path d=&quot;M10 16V5&quot;/&gt;&lt;path d=&quot;M14 16v-6&quot;/&gt;&lt;path d=&quot;M18 16v-3&quot;/&gt;&#039; },<BR/>
  { key:&quot;casedocs&quot;, section:&quot;Coordinators — every case, every day&quot;,<BR/>
    title:&quot;Case Documents — everything one house needs&quot;,<BR/>
    desc:&quot;Every document a case will ever need, in one list, with what is already on file and what is missing. Says what is not set up rather than pretending nothing is needed.&quot;,<BR/>
    url:QB+&quot;117&quot;, color:&quot;#1b7f5a&quot;, soft:&quot;#dff0e8&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z&quot;/&gt;&lt;path d=&quot;M14 2v6h6&quot;/&gt;&lt;path d=&quot;M9 15l2 2 4-4&quot;/&gt;&#039; },<BR/>
  { key:&quot;precon&quot;, section:&quot;Coordinators — every case, every day&quot;,<BR/>
    title:&quot;Precon Command&quot;,<BR/>
    desc:&quot;Every PR case in pre-construction: stage, task progress, permits, kickback SLAs. Filter by PM firm, employee, stage.&quot;,<BR/>
    url:QB+&quot;55&quot;, color:&quot;#e4573d&quot;, soft:&quot;#fdeeea&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M9 11l3 3 8-8&quot;/&gt;&lt;path d=&quot;M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9&quot;/&gt;&#039; },<BR/>
  { key:&quot;prschedule&quot;, section:&quot;Coordinators — every case, every day&quot;,<BR/>
    title:&quot;PR Schedule Spine&quot;,<BR/>
    desc:&quot;Per-job schedule items, phase gates and task actions for Puerto Rico templates.&quot;,<BR/>
    url:QB+&quot;41&quot;, color:&quot;#5b4fcf&quot;, soft:&quot;#e9e7f8&quot;,<BR/>
    icon:&#039;&lt;rect x=&quot;3&quot; y=&quot;4&quot; width=&quot;18&quot; height=&quot;18&quot; rx=&quot;2&quot;/&gt;&lt;path d=&quot;M16 2v4M8 2v4M3 10h18&quot;/&gt;&#039; },<BR/>
  { key:&quot;prscoping&quot;, section:&quot;Coordinators — every case, every day&quot;,<BR/>
    title:&quot;Scoping&quot;,<BR/>
    desc:&quot;Feasibility, Xactimate scopes, takeoffs and pre-construction scope reviews, from the Canopy scoping export.&quot;,<BR/>
    url:&quot;https://byrdsonservices.quickbase.com/db/buskqh26r?a=dbpage&amp;pagename=PR_Scoping_Dashboard.html&quot;,<BR/>
    color:&quot;#2aa6a0&quot;, soft:&quot;#e3f4f3&quot;,<BR/>
    icon:&#039;&lt;circle cx=&quot;11&quot; cy=&quot;11&quot; r=&quot;7&quot;/&gt;&lt;path d=&quot;M21 21l-4.3-4.3&quot;/&gt;&#039; },<BR/>
  { key:&quot;canopystatus&quot;, section:&quot;Coordinators — every case, every day&quot;,<BR/>
    title:&quot;Canopy Case Status (NTP clocks)&quot;,<BR/>
    desc:&quot;Construction clocks, permit deadlines and milestone ages over the Canopy all-cases export. Check the export date before quoting a number.&quot;,<BR/>
    url:QB+&quot;28&quot;, color:&quot;#3d7ea6&quot;, soft:&quot;#e7f1f8&quot;,<BR/>
    icon:&#039;&lt;circle cx=&quot;12&quot; cy=&quot;12&quot; r=&quot;9&quot;/&gt;&lt;path d=&quot;M12 7v5l3 3&quot;/&gt;&#039; },<BR/>
  { key:&quot;engplans&quot;, section:&quot;Coordinators — every case, every day&quot;,<BR/>
    title:&quot;Engineering Plans Documents&quot;,<BR/>
    desc:&quot;Engineering set-of-plans documents per case (PR Tracker). Same page as Paypoint Documents, different view.&quot;,<BR/>
    url:QB+&quot;118&amp;view=engplans&quot;, color:&quot;#6b6a2e&quot;, soft:&quot;#efeedd&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M3 3h18v18H3z&quot;/&gt;&lt;path d=&quot;M3 9h18M9 21V9&quot;/&gt;&#039; },<BR/>
<BR/>
  /* ---------------- Permits ---------------- */<BR/>
  { key:&quot;recyclingplans&quot;, section:&quot;Permits&quot;,<BR/>
    title:&quot;Recycling Plans (DRNA)&quot;,<BR/>
    desc:&quot;The Plan de Reduccion, Reutilizacion y Reciclaje filed per case with DRNA at construccion@drna.pr.gov. Open a case&#039;s plan and press Generar Formulario DRNA to print the completed application and the carta de compromiso. A plan is one of the five documents an OGPe permit package needs.&quot;,<BR/>
    url:&quot;https://byrdsonservices.quickbase.com/db/bwa4yn4gi?a=q&amp;query={3.GT.0}&amp;clist=31.16.29.17.28.23&amp;slist=29&amp;opts=nos.&quot;, color:&quot;#166534&quot;, soft:&quot;#dcf0e2&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M7 19a4 4 0 0 1-3.4-6.1L7 7&quot;/&gt;&lt;path d=&quot;M17 5a4 4 0 0 1 3.4 6.1L17 17&quot;/&gt;&lt;path d=&quot;M9 21l-2-2 2-2&quot;/&gt;&lt;path d=&quot;M15 3l2 2-2 2&quot;/&gt;&#039; },<BR/>
  { key:&quot;wastehaulers&quot;, section:&quot;Permits&quot;,<BR/>
    title:&quot;Waste haulers &amp; disposal sites&quot;,<BR/>
    desc:&quot;DRNA-permitted collection companies and the landfills and markets they deliver to. Pick from here on a recycling plan so the permit number is never retyped.&quot;,<BR/>
    url:&quot;https://byrdsonservices.quickbase.com/db/bwa4ynmxi?a=q&amp;query={3.GT.0}&amp;clist=6.7.8.9.10.14&amp;slist=6&amp;opts=nos.&quot;, color:&quot;#6b7280&quot;, soft:&quot;#eceef1&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M3 7h13v8H3z&quot;/&gt;&lt;path d=&quot;M16 10h4l1 3v2h-5z&quot;/&gt;&lt;circle cx=&quot;7&quot; cy=&quot;18&quot; r=&quot;1.6&quot;/&gt;&lt;circle cx=&quot;18&quot; cy=&quot;18&quot; r=&quot;1.6&quot;/&gt;&#039; },<BR/>
  { key:&quot;pmnotes&quot;, section:&quot;Field Ops&quot;,<BR/>
    title:&quot;Job Notes — what the PMs can see&quot;,<BR/>
    desc:&quot;Smartsheet stays as the window ICF, IEM and Tetra Tech read our job notes through. This shows whether what they can see is current: the newest site note a person wrote in Quickbase against the last one published to them. System-generated log entries are excluded so it compares real site narrative with real site narrative.&quot;,<BR/>
    url:QB+&quot;129&quot;, color:&quot;#7c2d12&quot;, soft:&quot;#f3e3d8&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M4 4h13l3 3v13H4z&quot;/&gt;&lt;path d=&quot;M8 10h8M8 14h6&quot;/&gt;&#039; },<BR/>
  { key:&quot;permitcompliance&quot;, section:&quot;Permits&quot;,<BR/>
    title:&quot;Permits &amp; Compliance — the daily worklist&quot;,<BR/>
    desc:&quot;Every permit package and what it is still missing, plus which subcontractor Fondo policies do not cover their award. Click a red document chip and the PDF uploads straight onto the case. This replaces the Smartsheet permit and insurance trackers.&quot;,<BR/>
    url:QB+&quot;124&quot;, color:&quot;#0f766e&quot;, soft:&quot;#dcf1ee&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M9 11l3 3L22 4&quot;/&gt;&lt;path d=&quot;M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11&quot;/&gt;&#039; },<BR/>
  { key:&quot;permitrunner&quot;, section:&quot;Permits&quot;,<BR/>
    title:&quot;In-House Permit Runner&quot;,<BR/>
    desc:&quot;File permits ourselves, no PA: the 13 steps in order with due dates, what is next on every case, correction notices on the 48-hour clock, and a one-click switch to take any PA case in-house. Our engineer seals the plans either way.&quot;,<BR/>
    url:QB+&quot;123&quot;, color:&quot;#6d28d9&quot;, soft:&quot;#ece6f8&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M9 11l3 3 8-8&quot;/&gt;&lt;path d=&quot;M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11&quot;/&gt;&#039; },<BR/>
  { key:&quot;permitcases&quot;, section:&quot;Permits&quot;,<BR/>
    title:&quot;Permit Cases — system of record&quot;,<BR/>
    desc:&quot;Station pipeline, kickbacks, filed and issued dates and the coordinator on each case. Precon Command reads the same table.&quot;,<BR/>
    url:&quot;https://byrdsonservices.quickbase.com/db/bv68ybxt4?a=q&amp;query={8.XEX.&#039;&#039;}&amp;clist=6.8.9.34.11.63.71.31.32&amp;slist=8.6&quot;,<BR/>
    color:&quot;#9c6511&quot;, soft:&quot;#f7ebd5&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M9 12l2 2 4-4&quot;/&gt;&lt;path d=&quot;M12 2l7 4v6c0 5-3.5 9-7 10-3.5-1-7-5-7-10V6z&quot;/&gt;&#039; },<BR/>
  { key:&quot;directory&quot;, section:&quot;Finance — awards, draws, invoices&quot;,<BR/>
    title:&quot;Directory &amp; Documents&quot;,<BR/>
    desc:&quot;Byrdson&#039;s contact book and the controlled-document register, searchable in one place instead of two Smartsheets. Contacts are cross-checked against the purchase-order vendor records, so where the phone book and the vendor file disagree about who to write to, it says so rather than leaving it to be found by an email that goes nowhere.&quot;,<BR/>
    url:QB+&quot;132&quot;, color:&quot;#3f6212&quot;, soft:&quot;#e7efdc&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M4 4h13l3 3v13H4z&quot;/&gt;&lt;path d=&quot;M8 9h8M8 13h8M8 17h5&quot;/&gt;&#039; },<BR/>
<BR/>
  /* ---------------- Finance ---------------- */<BR/>
  { key:&quot;scopechange&quot;, section:&quot;Finance — awards, draws, invoices&quot;,<BR/>
    title:&quot;Scope Changes&quot;,<BR/>
    desc:&quot;Every scope change in flight, oldest first, next to what its job is worth and what we have already committed to spend on it — the one thing the Smartsheet can never show. Assign it, price it, note it and send it to QC without leaving Quickbase. Eight have never been assigned, the oldest waiting eighteen days.&quot;,<BR/>
    url:QB+&quot;131&quot;, color:&quot;#7a5c1c&quot;, soft:&quot;#f3ebd8&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M12 20h9&quot;/&gt;&lt;path d=&quot;M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z&quot;/&gt;&#039; },<BR/>
  { key:&quot;integrity&quot;, section:&quot;Finance — awards, draws, invoices&quot;,<BR/>
    title:&quot;Data Integrity&quot;,<BR/>
    desc:&quot;Eleven checks, run live against the app every time you open it: template purchase orders that were never filled in, duplicates still counting as money, vendors nobody can write to, task orders the program cut after we committed. It exists because a number reached a screen before anyone looked at the records behind it — three jobs read as underwater by $218,845 that had never been paid a cent.&quot;,<BR/>
    url:QB+&quot;133&quot;, color:&quot;#155e75&quot;, soft:&quot;#daecf2&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M12 3l7 4v5c0 5-3 8.5-7 9.5C8 20.5 5 17 5 12V7z&quot;/&gt;&lt;path d=&quot;M9.5 12.5l2 2 3.5-4&quot;/&gt;&#039; },<BR/>
  { key:&quot;jobpnl&quot;, section:&quot;Finance — awards, draws, invoices&quot;,<BR/>
    title:&quot;Job Profitability&quot;,<BR/>
    desc:&quot;What each job is worth against everything we have committed to spend on it. Contract value comes from the program task order — a number that only exists in Quickbase because we migrated All Cases Export. Sorted worst first, so the jobs already committed past their contract are at the top. Click a job for the purchase orders and card spend behind the figure. Margin is before Byrdson\&#039;s own labour.&quot;,<BR/>
    url:QB+&quot;130&quot;, color:&quot;#b42318&quot;, soft:&quot;#f7e2e0&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M3 3v18h18&quot;/&gt;&lt;path d=&quot;M7 15l4-5 3 3 5-7&quot;/&gt;&#039; },<BR/>
  { key:&quot;subinsurance&quot;, section:&quot;Finance — awards, draws, invoices&quot;,<BR/>
    title:&quot;Subcontractor Insurance &amp; Audit Credit&quot;,<BR/>
    desc:&quot;Every subcontractor policy we hold, and how much of what we paid them was actually performed while a certificate was in force. What is not evidenced gets rated as Byrdson&#039;s own work at our GL and auto audit.&quot;,<BR/>
    url:QB+&quot;125&quot;, color:&quot;#155e75&quot;, soft:&quot;#dbeef4&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M12 2l7 4v6c0 5-3.5 9-7 10-3.5-1-7-5-7-10V6z&quot;/&gt;&lt;path d=&quot;M9 12l2 2 4-4&quot;/&gt;&#039; },<BR/>
  { key:&quot;insurancedocs&quot;, section:&quot;Finance — awards, draws, invoices&quot;,<BR/>
    title:&quot;Insurance Documents&quot;,<BR/>
    desc:&quot;Every insurance document Byrdson holds, with the file one click away. The Fondo (CFSE) poliza issued per case — all 64 submissions and 78 files from the Insurance Policy Submittal Smartsheet — alongside the subcontractors&#039; own general liability, workers&#039; comp and COI certificates, and the policies read out of them. Says plainly where each file is stored.&quot;,<BR/>
    url:QB+&quot;134&quot;, color:&quot;#0f766e&quot;, soft:&quot;#d7eeeb&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M12 3l7 4v5c0 5-3 8.5-7 9.5C8 20.5 5 17 5 12V7z&quot;/&gt;&lt;path d=&quot;M8 12h8M12 8v8&quot;/&gt;&#039; },<BR/>
  { key:&quot;coiintake&quot;, section:&quot;Finance — awards, draws, invoices&quot;,<BR/>
    title:&quot;COI Intake — file a certificate&quot;,<BR/>
    desc:&quot;The inbound side of the insurance chase. Every subcontractor with live Puerto Rico work, what we actually hold for them, and what it is costing in held first payments. When a certificate comes back, file it here in one step — the PDF is stored on the vendor and the policy is marked verified by a person.&quot;,<BR/>
    url:QB+&quot;127&quot;, color:&quot;#0e7490&quot;, soft:&quot;#d9eff4&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M12 3l7 4v5c0 5-3 8.5-7 9.5C8 20.5 5 17 5 12V7z&quot;/&gt;&lt;path d=&quot;M12 8v6&quot;/&gt;&lt;path d=&quot;M9 11h6&quot;/&gt;&#039; },<BR/>
  { key:&quot;ccreceipts&quot;, section:&quot;Finance — awards, draws, invoices&quot;,<BR/>
    title:&quot;Credit Card Receipts — submit &amp; review&quot;,<BR/>
    desc:&quot;Replaces the Smartsheet receipt form. Submit a company-card receipt with the file attached, and — unlike the old form — tie it to the job it belongs to instead of typing the case number into the note. All 92 historic receipts and 106 files were migrated on 24 Aug 2026 and reconcile to the cent.&quot;,<BR/>
    url:QB+&quot;128&quot;, color:&quot;#7c3aed&quot;, soft:&quot;#eae4fb&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M2 7h20v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z&quot;/&gt;&lt;path d=&quot;M2 11h20&quot;/&gt;&lt;path d=&quot;M6 16h4&quot;/&gt;&#039; },<BR/>
  { key:&quot;subsaward&quot;, section:&quot;Finance — awards, draws, invoices&quot;,<BR/>
    title:&quot;Contractor Award — Start Here&quot;,<BR/>
    desc:&quot;Open the Case Cockpit, select the project, then use + Sub Award. Canopy source, compliance, independent review, approval and controlled letter delivery are enforced.&quot;,<BR/>
    url:QB+&quot;113&quot;,<BR/>
    color:&quot;#1d4e89&quot;, soft:&quot;#e2eaf4&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M12 2l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L3 9l6-1z&quot;/&gt;&#039; },<BR/>
  { key:&quot;paypoints&quot;, section:&quot;Finance — awards, draws, invoices&quot;,<BR/>
    title:&quot;Paypoint Documents&quot;,<BR/>
    desc:&quot;Pay point documents per case (PR Tracker). Same page as Engineering Plans, different view.&quot;,<BR/>
    url:QB+&quot;118&amp;view=paypoints&quot;, color:&quot;#2e7d4f&quot;, soft:&quot;#e2f1e7&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M12 1v22&quot;/&gt;&lt;path d=&quot;M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6&quot;/&gt;&#039; },<BR/>
  { key:&quot;invoicetracker&quot;, section:&quot;Finance — awards, draws, invoices&quot;,<BR/>
    title:&quot;Puerto Rico Invoice Tracker&quot;,<BR/>
    desc:&quot;Pick a PR job and see its owner invoices, with a prefilled add-invoice link.&quot;,<BR/>
    url:&quot;https://byrdsonservices.quickbase.com/db/buskqh26r?a=dbpage&amp;pagename=Puerto_Rico_Invoice_Tracker.html&quot;,<BR/>
    color:&quot;#0f766e&quot;, soft:&quot;#e0f2f0&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M4 4h16v16H4z&quot;/&gt;&lt;path d=&quot;M8 9h8M8 13h8M8 17h4&quot;/&gt;&#039; },<BR/>
  { key:&quot;oikanban&quot;, section:&quot;Finance — awards, draws, invoices&quot;,<BR/>
    title:&quot;Owner Invoices Kanban&quot;,<BR/>
    desc:&quot;Drag owner invoices between Submitted, Program Approved and Paid; edit amounts inline. This page writes to Owner Invoices.&quot;,<BR/>
    url:QB+&quot;75&quot;, color:&quot;#a8322d&quot;, soft:&quot;#f6e3e2&quot;,<BR/>
    icon:&#039;&lt;rect x=&quot;3&quot; y=&quot;3&quot; width=&quot;5&quot; height=&quot;18&quot; rx=&quot;1&quot;/&gt;&lt;rect x=&quot;10&quot; y=&quot;3&quot; width=&quot;5&quot; height=&quot;12&quot; rx=&quot;1&quot;/&gt;&lt;rect x=&quot;17&quot; y=&quot;3&quot; width=&quot;4&quot; height=&quot;8&quot; rx=&quot;1&quot;/&gt;&#039; },<BR/>
  { key:&quot;backcharge&quot;, section:&quot;Finance — awards, draws, invoices&quot;,<BR/>
    title:&quot;CM-Furnished &amp; Back-Charges&quot;,<BR/>
    desc:&quot;CM-furnished purchases and back-charge deductions against sub draws.&quot;,<BR/>
    url:QB+&quot;110&quot;, color:&quot;#9c6511&quot;, soft:&quot;#f7ebd5&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M3 6h18&quot;/&gt;&lt;path d=&quot;M5 6l1 14h12l1-14&quot;/&gt;&lt;path d=&quot;M10 11v5M14 11v5&quot;/&gt;&#039; },<BR/>
  { key:&quot;subperf&quot;, section:&quot;Finance — awards, draws, invoices&quot;,<BR/>
    title:&quot;Sub Performance&quot;,<BR/>
    desc:&quot;180-day clocks per sub, milestone pace, failed inspections and $500 charges.&quot;,<BR/>
    url:QB+&quot;120&quot;, color:&quot;#0f6b47&quot;, soft:&quot;#dcefe6&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M4 20V10M10 20V4M16 20v-7M22 20H2&quot;/&gt;&#039; },<BR/>
  { key:&quot;trackerdocs&quot;, section:&quot;Coordinators — every case, every day&quot;,<BR/>
    title:&quot;Tracker Documents&quot;,<BR/>
    desc:&quot;Paypoint packages, engineering plans and form links from the Puerto Rico Tracker — the old Paypoints and Engineering pages both point here.&quot;,<BR/>
    url:QB+&quot;118&quot;, color:&quot;#0369a1&quot;, soft:&quot;#e0f0fa&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z&quot;/&gt;&lt;path d=&quot;M14 2v6h6&quot;/&gt;&#039; },<BR/>
  { key:&quot;finanalytics&quot;, section:&quot;Analytics — money &amp; progress&quot;,<BR/>
    title:&quot;PR Financial (AP &amp; Vendors)&quot;,<BR/>
    desc:&quot;Committed vs invoiced vs paid, AP aging, top vendors and spend categories across the PR portfolio.&quot;,<BR/>
    url:QB+&quot;31&quot;, color:&quot;#16697a&quot;, soft:&quot;#e0eff3&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6&quot;/&gt;&#039; },<BR/>
  { key:&quot;profitability&quot;, section:&quot;Analytics — money &amp; progress&quot;,<BR/>
    title:&quot;PR Profitability&quot;,<BR/>
    desc:&quot;Contract value, committed POs and gross profit per job, by program and job type.&quot;,<BR/>
    url:QB+&quot;32&quot;, color:&quot;#0f6b47&quot;, soft:&quot;#dcefe6&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M4 20V10M10 20V4M16 20v-7M22 20H2&quot;/&gt;&#039; },<BR/>
  { key:&quot;pmdash&quot;, section:&quot;Analytics — money &amp; progress&quot;,<BR/>
    title:&quot;PM Dashboard (All Cases)&quot;,<BR/>
    desc:&quot;Every Canopy case by status, team workload, cost variance and award mix.&quot;,<BR/>
    url:QB+&quot;33&quot;, color:&quot;#5b4fcf&quot;, soft:&quot;#e9e7f8&quot;,<BR/>
    icon:&#039;&lt;circle cx=&quot;12&quot; cy=&quot;12&quot; r=&quot;10&quot;/&gt;&lt;path d=&quot;M12 6v6l4 2&quot;/&gt;&#039; },<BR/>
  { key:&quot;dailylogs&quot;, section:&quot;Analytics — money &amp; progress&quot;,<BR/>
    title:&quot;Daily Logs&quot;,<BR/>
    desc:&quot;Field logging coverage and freshness per case, with the most recent site notes.&quot;,<BR/>
    url:QB+&quot;34&quot;, color:&quot;#b45309&quot;, soft:&quot;#f7ebd5&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z&quot;/&gt;&lt;path d=&quot;M8 13h8M8 17h5&quot;/&gt;&#039; },<BR/>
  { key:&quot;prinventory&quot;, section:&quot;Finance — awards, draws, invoices&quot;,<BR/>
    title:&quot;Inventory Tracker&quot;,<BR/>
    desc:&quot;PR warehouse: receive, issue, order, count, house material sets.&quot;,<BR/>
    url:QB+&quot;109&quot;, color:&quot;#5b4fcf&quot;, soft:&quot;#e9e7f8&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M21 8l-9-5-9 5v8l9 5 9-5z&quot;/&gt;&lt;path d=&quot;M3 8l9 5 9-5&quot;/&gt;&lt;path d=&quot;M12 13v8&quot;/&gt;&#039; },<BR/>
  { key:&quot;selections&quot;, section:&quot;Finance — awards, draws, invoices&quot;,<BR/>
    title:&quot;Homeowner Selections&quot;,<BR/>
    desc:&quot;Selections per case with the material takeoff lines behind each one.&quot;,<BR/>
    url:QB+&quot;112&quot;, color:&quot;#2aa6a0&quot;, soft:&quot;#e3f4f3&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M4 4h16v16H4z&quot;/&gt;&lt;path d=&quot;M9 9l2 2 4-4&quot;/&gt;&lt;path d=&quot;M9 15l2 2 4-4&quot;/&gt;&#039; },<BR/>
<BR/>
  /* ---------------- Closeout ---------------- */<BR/>
  { key:&quot;ktohome&quot;, section:&quot;Closeout &amp; Warranty (KTO)&quot;,<BR/>
    title:&quot;KTO Home — start here&quot;,<BR/>
    desc:&quot;Every open closeout case and what it still owes: certifications, binder sections, diligences.&quot;,<BR/>
    url:QB+&quot;105&quot;, color:&quot;#12283e&quot;, soft:&quot;#e3e8ee&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M3 11l9-8 9 8&quot;/&gt;&lt;path d=&quot;M5 10v10h14V10&quot;/&gt;&#039; },<BR/>
  { key:&quot;handout&quot;, section:&quot;Closeout &amp; Warranty (KTO)&quot;,<BR/>
    title:&quot;Hand Out Work — assign it and date it&quot;,<BR/>
    desc:&quot;Give open work a named person and a real due date, one case or one seat at a time. The only page that assigns.&quot;,<BR/>
    url:QB+&quot;116&quot;, color:&quot;#9c6511&quot;, soft:&quot;#f7ebd5&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2&quot;/&gt;&lt;circle cx=&quot;9&quot; cy=&quot;7&quot; r=&quot;4&quot;/&gt;&lt;path d=&quot;M19 8v6&quot;/&gt;&lt;path d=&quot;M22 11h-6&quot;/&gt;&#039; },<BR/>
  { key:&quot;ktoqueue&quot;, section:&quot;Closeout &amp; Warranty (KTO)&quot;,<BR/>
    title:&quot;KTO Queue&quot;,<BR/>
    desc:&quot;Post-substantial cases: fill the gaps that block certifications, case by case.&quot;,<BR/>
    url:QB+&quot;102&quot;, color:&quot;#1d4e89&quot;, soft:&quot;#e2eaf4&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M8 6h13M8 12h13M8 18h13&quot;/&gt;&lt;path d=&quot;M3 6h.01M3 12h.01M3 18h.01&quot;/&gt;&#039; },<BR/>
  { key:&quot;ktoboard&quot;, section:&quot;Closeout &amp; Warranty (KTO)&quot;,<BR/>
    title:&quot;KTO Closeout Board&quot;,<BR/>
    desc:&quot;One case: readiness, the nine PRDOH documents, binder progress, signatures.&quot;,<BR/>
    url:QB+&quot;89&quot;, color:&quot;#0f766e&quot;, soft:&quot;#e0f2f0&quot;,<BR/>
    icon:&#039;&lt;rect x=&quot;3&quot; y=&quot;3&quot; width=&quot;18&quot; height=&quot;18&quot; rx=&quot;2&quot;/&gt;&lt;path d=&quot;M7 8h10M7 12h10M7 16h6&quot;/&gt;&#039; },<BR/>
  { key:&quot;fileevidence&quot;, section:&quot;Closeout &amp; Warranty (KTO)&quot;,<BR/>
    title:&quot;File Evidence&quot;,<BR/>
    desc:&quot;Upload a signed certification, a binder section or a diligence document to the case&#039;s KTO Closeout folder in Drive.&quot;,<BR/>
    url:QB+&quot;104&quot;, color:&quot;#1b7f5a&quot;, soft:&quot;#dff0e8&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4&quot;/&gt;&lt;path d=&quot;M17 8l-5-5-5 5&quot;/&gt;&lt;path d=&quot;M12 3v12&quot;/&gt;&#039; },<BR/>
  { key:&quot;ktomgmt&quot;, section:&quot;Closeout &amp; Warranty (KTO)&quot;,<BR/>
    title:&quot;KTO Management Dashboard&quot;,<BR/>
    desc:&quot;Portfolio view: closeout pipeline, exceptions queue, generation log.&quot;,<BR/>
    url:QB+&quot;91&quot;, color:&quot;#3d7ea6&quot;, soft:&quot;#e7f1f8&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M4 19h16&quot;/&gt;&lt;path d=&quot;M6 16V9M10 16V5M14 16v-6M18 16v-3&quot;/&gt;&#039; },<BR/>
  { key:&quot;warrantybinder&quot;, section:&quot;Closeout &amp; Warranty (KTO)&quot;,<BR/>
    title:&quot;Warranty Binder Schedule&quot;,<BR/>
    desc:&quot;Binder sections per case, what is filed, what inherits from the equipment library.&quot;,<BR/>
    url:QB+&quot;93&quot;, color:&quot;#6b6a2e&quot;, soft:&quot;#efeedd&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M4 19.5A2.5 2.5 0 0 1 6.5 17H20&quot;/&gt;&lt;path d=&quot;M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z&quot;/&gt;&#039; },<BR/>
  { key:&quot;ktoequipment&quot;, section:&quot;Closeout &amp; Warranty (KTO)&quot;,<BR/>
    title:&quot;Equipment &amp; Serials&quot;,<BR/>
    desc:&quot;Installed equipment per case with model and serial, matched to the library.&quot;,<BR/>
    url:QB+&quot;92&quot;, color:&quot;#5b4fcf&quot;, soft:&quot;#e9e7f8&quot;,<BR/>
    icon:&#039;&lt;circle cx=&quot;12&quot; cy=&quot;12&quot; r=&quot;3&quot;/&gt;&lt;path d=&quot;M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z&quot;/&gt;&#039; },<BR/>
<BR/>
  /* ---------------- Subcontractor Award System ---------------- */<BR/>
  { key:&quot;subsawardapp&quot;, section:&quot;Subcontractor Award System&quot;,<BR/>
    title:&quot;Subcontractor Award System&quot;,<BR/>
    desc:&quot;Upload a scope export, work out the award, create the purchase order, cost item and bills, and send the award letter.&quot;,<BR/>
    url:&quot;https://subs-award.vercel.app/&quot;, color:&quot;#1F3864&quot;, soft:&quot;#e3e8f2&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z&quot;/&gt;&lt;path d=&quot;M14 2v6h6&quot;/&gt;&lt;path d=&quot;M9 15l2 2 4-4&quot;/&gt;&#039; },<BR/>
  { key:&quot;fondoreview&quot;, section:&quot;Subcontractor Award System&quot;,<BR/>
    title:&quot;Fondo Polizas to Review&quot;,<BR/>
    desc:&quot;Polizas subcontractors have sent in: read the document, then approve it or send it back.&quot;,<BR/>
    url:&quot;https://subs-award.vercel.app/fondo/review&quot;, color:&quot;#0f766e&quot;, soft:&quot;#e0f2f0&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z&quot;/&gt;&lt;path d=&quot;M9 12l2 2 4-4&quot;/&gt;&#039; },<BR/>
<BR/>
  /* ---------------- Tools ---------------- */<BR/>
  { key:&quot;vendoraccess&quot;, section:&quot;Tools &amp; Utilities&quot;,<BR/>
    title:&quot;Vendor Access Manager&quot;,<BR/>
    desc:&quot;Invite and manage sub/vendor access.&quot;,<BR/>
    url:&quot;https://byrdsonservices.quickbase.com/db/buskqh26r?a=dbpage&amp;pagename=Vendor%20Access%20Manager.html&quot;,<BR/>
    color:&quot;#1d4e89&quot;, soft:&quot;#e2eaf4&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2&quot;/&gt;&lt;circle cx=&quot;9&quot; cy=&quot;7&quot; r=&quot;4&quot;/&gt;&lt;path d=&quot;M22 21v-2a4 4 0 0 0-3-3.9&quot;/&gt;&#039; },<BR/>
  { key:&quot;raindelay&quot;, section:&quot;Tools &amp; Utilities&quot;,<BR/>
    title:&quot;Rain Delay Report Generator&quot;,<BR/>
    desc:&quot;Generate rain delay reports for weather-impacted schedule days. (Opens in a new tab.)&quot;,<BR/>
    url:&quot;https://sites.google.com/byrdsonservices.com/raindelaytool/home&quot;, external:true,<BR/>
    color:&quot;#3d7ea6&quot;, soft:&quot;#e7f1f8&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M20 16.2A5 5 0 0018 7h-1.26A8 8 0 104 15.25&quot;/&gt;&lt;path d=&quot;M8 19v2M12 19v3M16 19v2&quot;/&gt;&#039; },<BR/>
  { key:&quot;wikiPR&quot;, section:&quot;Tools &amp; Utilities&quot;,<BR/>
    title:&quot;Byrdson WIKI&quot;,<BR/>
    desc:&quot;Process notes and how-tos.&quot;,<BR/>
    url:QB+&quot;77&quot;, color:&quot;#6b6a2e&quot;, soft:&quot;#efeedd&quot;,<BR/>
    icon:&#039;&lt;path d=&quot;M4 19.5A2.5 2.5 0 0 1 6.5 17H20&quot;/&gt;&lt;path d=&quot;M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z&quot;/&gt;&#039; }<BR/>
];<BR/>
<BR/>
/* ▲▲▲  STOP EDITING  ▲▲▲ ============================================ */<BR/>
/* ---- render panels grouped into sections ---- */<BR/>
const sectionsEl = document.getElementById(&#039;sections&#039;);<BR/>
const SVG = inner =&gt; &#039;&lt;svg viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;&gt;&#039;+inner+&#039;&lt;/svg&gt;&#039;;<BR/>
const arrow = SVG(&#039;&lt;path d=&quot;M5 12h14&quot;/&gt;&lt;path d=&quot;M13 6l6 6-6 6&quot;/&gt;&#039;);<BR/>
const order=[], groups={};<BR/>
DASHBOARDS.forEach(d=&gt;{const sec=d.section||&#039;Dashboards&#039;;if(!groups[sec]){groups[sec]=[];order.push(sec);}groups[sec].push(d);});<BR/>
order.forEach(sec=&gt;{<BR/>
  const h=document.createElement(&#039;h3&#039;);h.className=&#039;section-title&#039;;h.textContent=sec;sectionsEl.appendChild(h);<BR/>
  const g=document.createElement(&#039;div&#039;);g.className=&#039;grid&#039;;sectionsEl.appendChild(g);<BR/>
  groups[sec].forEach(d=&gt;{<BR/>
    const label=d.external?&#039;Open tool&#039;:&#039;Open&#039;;<BR/>
    const b=document.createElement(d.external?&#039;a&#039;:&#039;button&#039;);<BR/>
    b.className=&#039;panel&#039;;<BR/>
    b.style.setProperty(&#039;--accent&#039;,d.color);<BR/>
    b.style.setProperty(&#039;--accent-soft&#039;,d.soft);<BR/>
    if(d.external){ b.href=d.url; b.target=&#039;_blank&#039;; b.rel=&#039;noopener noreferrer&#039;; }<BR/>
    else { b.onclick=()=&gt;openDash(d.key); }<BR/>
    b.innerHTML=&#039;&lt;div class=&quot;p-icon&quot;&gt;&#039;+SVG(d.icon)+&#039;&lt;/div&gt;&#039;+<BR/>
      &#039;&lt;h3&gt;&#039;+d.title+&#039;&lt;/h3&gt;&#039;+<BR/>
      &#039;&lt;p&gt;&#039;+d.desc+&#039;&lt;/p&gt;&#039;+<BR/>
      &#039;&lt;div class=&quot;p-open&quot;&gt;&#039;+label+&#039; &#039;+arrow+&#039;&lt;/div&gt;&#039;;<BR/>
    g.appendChild(b);<BR/>
  });<BR/>
});<BR/>
/* ---- navigation logic (same-page swap) ---- */<BR/>
const menuView=document.getElementById(&#039;menuView&#039;);<BR/>
const frameView=document.getElementById(&#039;frameView&#039;);<BR/>
const frame=document.getElementById(&#039;dashFrame&#039;);<BR/>
const loading=document.getElementById(&#039;frameLoading&#039;);<BR/>
const backBtn=document.getElementById(&#039;backBtn&#039;);<BR/>
const newTabBtn=document.getElementById(&#039;newTabBtn&#039;);<BR/>
const crumb=document.getElementById(&#039;crumb&#039;);<BR/>
function openDash(key){<BR/>
  const d=DASHBOARDS.find(x=&gt;x.key===key);<BR/>
  if(!d) return;<BR/>
  if(!d.url || d.url.startsWith(&#039;PASTE_&#039;)){<BR/>
    alert(&#039;No URL set yet for &quot;&#039;+d.title+&#039;&quot;.\n\nOpen this code page and paste the dashboard\&#039;s Code Page URL into the DASHBOARDS list.&#039;);<BR/>
    return;<BR/>
  }<BR/>
  if(d.external){ window.open(d.url,&#039;_blank&#039;,&#039;noopener&#039;); return; }<BR/>
  loading.style.display=&#039;flex&#039;;<BR/>
  frame.src=d.url;<BR/>
  frame.onload=()=&gt;{ loading.style.display=&#039;none&#039;; };<BR/>
  menuView.style.display=&#039;none&#039;;<BR/>
  frameView.style.display=&#039;flex&#039;;<BR/>
  backBtn.style.display=&#039;flex&#039;;<BR/>
  /* This page is sandboxed without allow-downloads, so a download started<BR/>
     inside the embedded frame silently does nothing. Always offer the way out. */<BR/>
  newTabBtn.href=d.url; newTabBtn.style.display=&#039;flex&#039;;<BR/>
  crumb.style.display=&#039;inline&#039;;<BR/>
  crumb.innerHTML=&#039;Dashboards&amp;nbsp; / &amp;nbsp;&lt;b&gt;&#039;+d.title+&#039;&lt;/b&gt;&#039;;<BR/>
  if(location.hash!==&#039;#&#039;+key) history.replaceState(null,&#039;&#039;,&#039;#&#039;+key);<BR/>
  window.scrollTo(0,0);<BR/>
}<BR/>
function showMenu(){<BR/>
  frameView.style.display=&#039;none&#039;;<BR/>
  frame.src=&#039;about:blank&#039;;<BR/>
  menuView.style.display=&#039;block&#039;;<BR/>
  backBtn.style.display=&#039;none&#039;;<BR/>
  newTabBtn.style.display=&#039;none&#039;; newTabBtn.removeAttribute(&#039;href&#039;);<BR/>
  crumb.style.display=&#039;none&#039;;<BR/>
  history.replaceState(null,&#039;&#039;,&#039;#&#039;);<BR/>
}<BR/>
/* deep-link support: open with #operations etc. */<BR/>
window.addEventListener(&#039;DOMContentLoaded&#039;,()=&gt;{<BR/>
  const h=location.hash.replace(&#039;#&#039;,&#039;&#039;);<BR/>
  if(h &amp;&amp; DASHBOARDS.some(d=&gt;d.key===h)) openDash(h);<BR/>
});<BR/>
/* footer hint shows which panels still need a URL */<BR/>
const missing=DASHBOARDS.filter(d=&gt;!d.url||d.url.startsWith(&#039;PASTE_&#039;)).map(d=&gt;d.title);<BR/>
document.getElementById(&#039;footNote&#039;).textContent =<BR/>
  missing.length ? &#039;⚠ URLs still needed for: &#039;+missing.join(&#039;, &#039;)+&#039;. Edit the DASHBOARDS list in this code page.&#039; : &#039;&#039;;<BR/>
/* ---- live KTO closeout numbers -------------------------------------------<BR/>
   Uses the signed-in Quickbase session (credentials:&#039;same-origin&#039;), the same<BR/>
   way pages 89/91/102 do, so nobody is asked to paste a user token here.<BR/>
   The strip stays hidden unless the read succeeds - a dead query must never<BR/>
   leave a wrong number on the command centre. -------------------------------*/<BR/>
(function(){<BR/>
  var APPTOKEN=&#039;c3ehy5gdh85tybw592yedx9u9vw&#039;, T_READINESS=&#039;bv9yseirg&#039;;<BR/>
  var F_COORD=128, F_BLOCKED=147, F_DAYS=149, F_INQUEUE=152;<BR/>
  function q(dbid,clist,query){<BR/>
    var xml=&#039;&lt;qdbapi&gt;&lt;apptoken&gt;&#039;+APPTOKEN+&#039;&lt;/apptoken&gt;&lt;clist&gt;&#039;+clist+&#039;&lt;/clist&gt;&lt;fmt&gt;structured&lt;/fmt&gt;&#039;+<BR/>
            (query?&#039;&lt;query&gt;&#039;+query+&#039;&lt;/query&gt;&#039;:&#039;&#039;)+&#039;&lt;/qdbapi&gt;&#039;;<BR/>
    return fetch(&#039;/db/&#039;+dbid,{method:&#039;POST&#039;,credentials:&#039;same-origin&#039;,<BR/>
      headers:{&#039;Content-Type&#039;:&#039;application/xml&#039;,&#039;QUICKBASE-ACTION&#039;:&#039;API_DoQuery&#039;},body:xml})<BR/>
      .then(function(r){return r.text();}).then(function(t){<BR/>
        var d=new DOMParser().parseFromString(t,&#039;text/xml&#039;);<BR/>
        var ec=d.querySelector(&#039;errcode&#039;);<BR/>
        if(ec&amp;&amp;ec.textContent!==&#039;0&#039;) throw new Error(&#039;errcode &#039;+ec.textContent);<BR/>
        return Array.prototype.slice.call(d.querySelectorAll(&#039;record&#039;));<BR/>
      });<BR/>
  }<BR/>
  function val(rec,fid){var e=rec.querySelector(&#039;f[id=&quot;&#039;+fid+&#039;&quot;]&#039;);return e?e.textContent:&#039;&#039;;}<BR/>
  q(T_READINESS,[F_COORD,F_BLOCKED,F_DAYS,F_INQUEUE].join(&#039;.&#039;),&#039;{&#039;+F_INQUEUE+&#039;.EX.1}&#039;)<BR/>
    .then(function(recs){<BR/>
      var waiting=recs.length, oldest=0, blocked=0, unassigned=0;<BR/>
      recs.forEach(function(r){<BR/>
        var d=parseFloat(val(r,F_DAYS))||0; if(d&gt;oldest) oldest=d;<BR/>
        if((parseFloat(val(r,F_BLOCKED))||0)&gt;0) blocked++;<BR/>
        if(!val(r,F_COORD).trim()) unassigned++;<BR/>
      });<BR/>
      var stats=[<BR/>
        {n:waiting,    l:&#039;packages waiting&#039;},<BR/>
        {n:oldest+&#039;d&#039;, l:&#039;oldest in queue&#039;, c:oldest&gt;180?&#039;crit&#039;:(oldest&gt;90?&#039;warn&#039;:&#039;&#039;)},<BR/>
        {n:blocked,    l:&#039;blocked on data&#039;, c:blocked&gt;0?&#039;warn&#039;:&#039;&#039;},<BR/>
        {n:unassigned, l:&#039;no coordinator&#039;,  c:unassigned&gt;0?&#039;crit&#039;:&#039;&#039;}<BR/>
      ];<BR/>
      document.getElementById(&#039;ktoStats&#039;).innerHTML=stats.map(function(s){<BR/>
        return &#039;&lt;div class=&quot;kto-stat&quot;&gt;&lt;span class=&quot;kto-num &#039;+(s.c||&#039;&#039;)+&#039;&quot;&gt;&#039;+s.n+<BR/>
               &#039;&lt;/span&gt;&lt;span class=&quot;kto-lbl&quot;&gt;&#039;+s.l+&#039;&lt;/span&gt;&lt;/div&gt;&#039;;<BR/>
      }).join(&#039;&#039;);<BR/>
      document.getElementById(&#039;ktoSub&#039;).textContent = waiting<BR/>
        ? &#039;Cases past substantial inspection awaiting turnover&#039;<BR/>
        : &#039;Nothing waiting on closeout right now&#039;;<BR/>
      document.getElementById(&#039;ktoStrip&#039;).classList.add(&#039;ready&#039;);<BR/>
    })<BR/>
    .catch(function(e){ if(window.console) console.log(&#039;[PR Command Center] KTO strip skipped:&#039;,e.message); });<BR/>
})();<BR/>
/* ---- live PR stage funnel (Jobs fid 1474, formula from Canopy summaries) ---- */<BR/>
(function(){<BR/>
  var T_JOBS=&#039;buskqh27b&#039;, F_STAGE=1474, F_DAYS=1477;<BR/>
  var xml=&#039;&lt;qdbapi&gt;&lt;apptoken&gt;&#039;+&#039;c3ehy5gdh85tybw592yedx9u9vw&#039;+&#039;&lt;/apptoken&gt;&lt;clist&gt;&#039;+F_STAGE+&#039;.&#039;+F_DAYS+&#039;&lt;/clist&gt;&lt;fmt&gt;structured&lt;/fmt&gt;&#039;+<BR/>
          &quot;&lt;query&gt;{35.EX.&#039;OPEN&#039;}AND{11.EX.&#039;Puerto Rico&#039;}&lt;/query&gt;&lt;/qdbapi&gt;&quot;;<BR/>
  fetch(&#039;/db/&#039;+T_JOBS,{method:&#039;POST&#039;,credentials:&#039;same-origin&#039;,<BR/>
    headers:{&#039;Content-Type&#039;:&#039;application/xml&#039;,&#039;QUICKBASE-ACTION&#039;:&#039;API_DoQuery&#039;},body:xml})<BR/>
  .then(function(r){return r.text();}).then(function(t){<BR/>
    var d=new DOMParser().parseFromString(t,&#039;text/xml&#039;);<BR/>
    var ec=d.querySelector(&#039;errcode&#039;); if(ec&amp;&amp;ec.textContent!==&#039;0&#039;) throw new Error(&#039;errcode &#039;+ec.textContent);<BR/>
    var recs=Array.prototype.slice.call(d.querySelectorAll(&#039;record&#039;));<BR/>
    if(!recs.length) throw new Error(&#039;no rows&#039;);<BR/>
    var order=[&#039;1&#039;,&#039;3&#039;,&#039;4&#039;,&#039;5&#039;,&#039;6&#039;,&#039;8&#039;], names={&#039;1&#039;:&#039;Intake&#039;,&#039;3&#039;:&#039;Design&#039;,&#039;4&#039;:&#039;Permit&#039;,&#039;5&#039;:&#039;NTP&#039;,&#039;6&#039;:&#039;Construction&#039;,&#039;8&#039;:&#039;Closeout&#039;};<BR/>
    var counts={}, old={}, unlinked=0;<BR/>
    recs.forEach(function(r){<BR/>
      var s=r.querySelector(&#039;f[id=&quot;&#039;+F_STAGE+&#039;&quot;]&#039;); s=s?s.textContent:&#039;&#039;;<BR/>
      var k=s.charAt(0);<BR/>
      var days=parseFloat((r.querySelector(&#039;f[id=&quot;&#039;+F_DAYS+&#039;&quot;]&#039;)||{}).textContent)||0;<BR/>
      if(!s){return;}<BR/>
      if(k===&#039;0&#039;){unlinked++;return;}<BR/>
      if(names[k]){counts[k]=(counts[k]||0)+1; if(days&gt;180) old[k]=(old[k]||0)+1;}<BR/>
    });<BR/>
    var stats=order.map(function(k){<BR/>
      var n=counts[k]||0, o=old[k]||0;<BR/>
      return &#039;&lt;div class=&quot;kto-stat&quot;&gt;&lt;span class=&quot;kto-num &#039;+(o&gt;0?&#039;warn&#039;:&#039;&#039;)+&#039;&quot;&gt;&#039;+n+&#039;&lt;/span&gt;&lt;span class=&quot;kto-lbl&quot;&gt;&#039;+names[k]+(o?&#039; · &#039;+o+&#039; over 180d&#039;:&#039;&#039;)+&#039;&lt;/span&gt;&lt;/div&gt;&#039;;<BR/>
    });<BR/>
    if(unlinked) stats.push(&#039;&lt;div class=&quot;kto-stat&quot;&gt;&lt;span class=&quot;kto-num crit&quot;&gt;&#039;+unlinked+&#039;&lt;/span&gt;&lt;span class=&quot;kto-lbl&quot;&gt;not linked to Canopy&lt;/span&gt;&lt;/div&gt;&#039;);<BR/>
    document.getElementById(&#039;stageStats&#039;).innerHTML=stats.join(&#039;&#039;);<BR/>
    var counted=recs.length-recs.filter(function(r){var e=r.querySelector(&#039;f[id=&quot;&#039;+F_STAGE+&#039;&quot;]&#039;);return !(e&amp;&amp;e.textContent);}).length;<BR/>
    document.getElementById(&#039;stageSub&#039;).textContent=counted+&#039; open Puerto Rico cases (templates excluded). Stage comes from Canopy status; the day count from the last Canopy status change where one exists.&#039;;<BR/>
    document.getElementById(&#039;stageStrip&#039;).classList.add(&#039;ready&#039;);<BR/>
  })<BR/>
  .catch(function(e){ if(window.console) console.log(&#039;[PR Command Center] stage strip skipped:&#039;,e.message); });<BR/>
})();<BR/>
&lt;/script&gt;<BR/>
&lt;/body&gt;<BR/>
&lt;/html&gt;<BR/>
	<BR/>
	<BR/>
	<BR/>
	<BR/>
	<BR/>
	<BR/>
	<BR/>
	<BR/>
	<BR/>
	<BR/>
	<BR/>
	<BR/>
	<BR/>
	<BR/>
	<BR/>
	<BR/>
	<BR/>
	<BR/>
	<BR/>
	<BR/>
	<BR/>
	<BR/>
	<BR/>
	
	</pagebody>
</qdbapi>
