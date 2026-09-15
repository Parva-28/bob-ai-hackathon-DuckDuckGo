const pptxgen = require("pptxgenjs");
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";            // 13.33 x 7.5
pres.author = "Team DuckDuckGo";
pres.title  = "YieldGuard";

const INK="0E1C2B", DEEP="17405C", TEAL="1B8A8F", AMBER="E0913A",
      CRIM="B3402F", WHITE="FFFFFF", PAPER="F4F7F9", MUTED="6A7B87", LINE="D6DEE4";
const H="Cambria", B="Calibri";
const W=13.33, HT=7.5;

// ── wafer-map motif: the repeated visual element across the deck ────────────
function wafer(slide,cx,cy,d,pattern,{base=TEAL,defect=CRIM,bg=null,alpha=0}={}){
  const r=d/2;
  if(bg) slide.addShape(pres.ShapeType.ellipse,{x:cx-r,y:cy-r,w:d,h:d,fill:{color:bg},line:{color:base,width:1.25}});
  else   slide.addShape(pres.ShapeType.ellipse,{x:cx-r,y:cy-r,w:d,h:d,fill:{color:base,transparency:88},line:{color:base,width:1.25}});
  const dot=(px,py,s)=>{ // px,py in -1..1 unit disc
    if(px*px+py*py>0.93) return;
    slide.addShape(pres.ShapeType.ellipse,
      {x:cx+px*r-s/2,y:cy+py*r-s/2,w:s,h:s,fill:{color:defect},line:{color:defect,width:0}});
  };
  const s=Math.max(0.035,d*0.045);
  const rnd=(n=>{let x=n;return()=>((x=x*16807%2147483647)/2147483647);})(7);
  if(pattern==="center"){for(let i=0;i<26;i++){const a=rnd()*6.283,rr=rnd()*0.32;dot(Math.cos(a)*rr,Math.sin(a)*rr,s);}}
  if(pattern==="edge"){for(let i=0;i<30;i++){const a=(i/30)*6.283,rr=0.80+rnd()*0.08;dot(Math.cos(a)*rr,Math.sin(a)*rr,s);}}
  if(pattern==="scratch"){for(let i=0;i<16;i++){const t=-0.7+i*0.09;dot(t,t*0.55+0.05,s);}}
  if(pattern==="nearfull"){for(let i=0;i<70;i++){const a=rnd()*6.283,rr=Math.sqrt(rnd())*0.9;dot(Math.cos(a)*rr,Math.sin(a)*rr,s);}}
  if(pattern==="random"){for(let i=0;i<18;i++){const a=rnd()*6.283,rr=Math.sqrt(rnd())*0.88;dot(Math.cos(a)*rr,Math.sin(a)*rr,s);}}
}
const dark = s => s.background={color:INK};
function title(slide,t,sub,onDark){
  slide.addText(t,{x:0.7,y:0.42,w:11.4,h:0.85,fontFace:H,fontSize:38,bold:true,
    color:onDark?WHITE:INK,isTextBox:true,margin:0});
  if(sub) slide.addText(sub,{x:0.7,y:1.26,w:11.4,h:0.4,fontFace:B,fontSize:15,
    color:onDark?"9FB3C2":MUTED,isTextBox:true,margin:0});
}
function card(slide,x,y,w,h,fill){
  const isDark = fill && fill!==WHITE;
  const opt={x,y,w,h,rectRadius:0.04,fill:{color:fill||WHITE},
    line:{color:isDark?fill:LINE,width:1}};
  // Shadows only on light cards: on a dark card LibreOffice renders the outer
  // shadow as a pale band along the top edge, which reads as a glitch.
  if(!isDark) opt.shadow={type:"outer",color:"9AA9B4",blur:10,offset:2,angle:90,opacity:0.22};
  slide.addShape(pres.ShapeType.roundRect,opt);
}
function chip(slide,x,y,txt,col){
  slide.addShape(pres.ShapeType.roundRect,{x,y,w:0.42,h:0.42,rectRadius:0.5,
    fill:{color:col},line:{color:col,width:0}});
  slide.addText(txt,{x,y,w:0.42,h:0.42,fontFace:B,fontSize:13,bold:true,color:WHITE,
    align:"center",valign:"middle",isTextBox:true,margin:0});
}

/* 1 ─ TITLE */
let s=pres.addSlide(); dark(s);
wafer(s,10.9,3.75,4.6,"center",{base:"2E6B7E",defect:TEAL,bg:"142B3D"});
s.addText("YieldGuard",{x:0.85,y:2.05,w:8.2,h:1.25,fontFace:H,fontSize:60,bold:true,color:WHITE,isTextBox:true,margin:0});
s.addText("Wafer Yield Root Cause & Defect Pattern Analyser",
  {x:0.85,y:3.25,w:8.2,h:0.55,fontFace:B,fontSize:21,color:"9FB3C2",isTextBox:true,margin:0});
s.addText("Ranked root causes that cite their evidence — and admit when they don't know.",
  {x:0.85,y:3.9,w:8.2,h:0.45,fontFace:B,fontSize:15,italic:true,color:AMBER,isTextBox:true,margin:0});
s.addText("Team DuckDuckGo   ·   Track: AI   ·   IBM Bob AI Hackathon 2026",
  {x:0.85,y:5.5,w:8.2,h:0.4,fontFace:B,fontSize:13,color:"7C93A4",isTextBox:true,margin:0});
s.addNotes("Title. Keep it to one breath — the demo is the evidence, not the deck.");

/* 2 ─ PROBLEM */
s=pres.addSlide(); s.background={color:PAPER};
title(s,"A 1% yield drop costs tens of millions a month","And the cause takes weeks to find by hand");
const probs=[["$","At 3nm, one point of yield is tens of millions of dollars per month"],
  ["3","Root cause hides across thousands of sensors, hundreds of steps, three disconnected systems"],
  ["⏱","Engineers correlate it manually — days to weeks, while the line keeps running"],
  ["!","Nobody flags the lots that are about to fail; you only look after test comes back"]];
probs.forEach((p,i)=>{const y=2.0+i*1.12;
  chip(s,0.75,y+0.05,p[0],i===3?AMBER:DEEP);
  s.addText(p[1],{x:1.45,y:y,w:7.3,h:0.9,fontFace:B,fontSize:15,color:INK,isTextBox:true,margin:0,valign:"middle"});});
card(s,9.25,2.0,3.35,4.1);
s.addText("LOST REVENUE",{x:9.45,y:2.25,w:2.95,h:0.3,fontFace:B,fontSize:11,bold:true,color:MUTED,charSpacing:1,isTextBox:true,margin:0});
s.addText("every day",{x:9.45,y:2.6,w:2.95,h:0.9,fontFace:H,fontSize:40,bold:true,color:CRIM,isTextBox:true,margin:0});
s.addText("of delay is wafers still running through a process nobody has fixed yet.",
  {x:9.45,y:3.55,w:2.95,h:1.0,fontFace:B,fontSize:14,color:INK,isTextBox:true,margin:0});
wafer(s,10.9,5.4,1.1,"nearfull",{base:CRIM,defect:CRIM,bg:WHITE});
s.addNotes("The last bullet is the half of the brief most teams skip because it is harder to demo. Flag it now — we come back to it on slide 5.");

/* 3 ─ WHY NOT SOLVED */
s=pres.addSlide(); s.background={color:PAPER};
title(s,"Why this isn't already solved","We know the field — and we're aiming at the blocker it actually reports");
card(s,0.75,2.05,5.75,2.15);
s.addText("What exists",{x:1.0,y:2.3,w:5.2,h:0.35,fontFace:B,fontSize:13,bold:true,color:TEAL,charSpacing:1,isTextBox:true,margin:0});
s.addText([{text:"Yield platforms surface correlations well — and stop there",options:{bullet:true,breakLine:true}},
  {text:"Pre-run prediction is mature: Virtual Metrology, SEMI E133",options:{bullet:true,breakLine:true}},
  {text:"Tignis and INFICON already ship it in production fabs",options:{bullet:true}}],
  {x:1.0,y:2.7,w:5.25,h:1.35,fontFace:B,fontSize:14,color:INK,isTextBox:true,margin:0,paraSpaceAfter:6});
card(s,0.75,4.45,5.75,2.15);
s.addText("What's missing",{x:1.0,y:4.7,w:5.2,h:0.35,fontFace:B,fontSize:13,bold:true,color:AMBER,charSpacing:1,isTextBox:true,margin:0});
s.addText([{text:"The last mile: correlation → ranked, cited hypothesis → action",options:{bullet:true,breakLine:true}},
  {text:"Cross-module fusion — map, sensors and route reasoned together",options:{bullet:true,breakLine:true}},
  {text:"A forward-looking predictor combined with an agentic layer",options:{bullet:true}}],
  {x:1.0,y:5.1,w:5.25,h:1.35,fontFace:B,fontSize:14,color:INK,isTextBox:true,margin:0,paraSpaceAfter:6});
card(s,6.95,2.05,5.65,4.55,INK);
s.addText("The gap is not accuracy.\nIt is trust.",{x:7.25,y:2.35,w:5.05,h:0.95,fontFace:H,fontSize:26,bold:true,color:WHITE,isTextBox:true,margin:0});
s.addText("Best published rare-class model on fab sensor data:",
  {x:7.25,y:3.45,w:5.05,h:0.35,fontFace:B,fontSize:13,color:"9FB3C2",isTextBox:true,margin:0});
s.addText("0.96",{x:7.25,y:3.85,w:2.3,h:0.85,fontFace:H,fontSize:46,bold:true,color:TEAL,isTextBox:true,margin:0});
s.addText("recall",{x:7.25,y:4.68,w:2.3,h:0.3,fontFace:B,fontSize:12,color:"9FB3C2",isTextBox:true,margin:0});
s.addText("0.66",{x:9.85,y:3.85,w:2.3,h:0.85,fontFace:H,fontSize:46,bold:true,color:AMBER,isTextBox:true,margin:0});
s.addText("precision",{x:9.85,y:4.68,w:2.3,h:0.3,fontFace:B,fontSize:12,color:"9FB3C2",isTextBox:true,margin:0});
s.addText("1 in 3 flagged lots is a false alarm. The binding constraint is an engineer's triage time — so a flag they can't verify is a flag they learn to ignore.",
  {x:7.25,y:5.15,w:5.05,h:1.2,fontFace:B,fontSize:14,color:"CFDCE4",isTextBox:true,margin:0});
s.addNotes("Lead with the prior art rather than letting a fab-side judge catch it. Naming Virtual Metrology and SEMI E133 reads as fluency. Then re-aim at what the IRDS practitioner survey actually names as the blocker: trust, model maintenance, and the absence of a prediction-quality metric.");

/* 4 ─ WHAT WE BUILT */
s=pres.addSlide(); s.background={color:PAPER};
title(s,"An engineer asks Bob a question","Bob gathers the evidence and answers with citations");
const feats=[["1","Classify","Wafer-map defect pattern from WM-811K"],
  ["2","Score","Sensor anomaly across SECOM's 590 features"],
  ["3","Retrieve","Precedent cases and live equipment telemetry"],
  ["4","Rank","Root causes — every one citing a named source"],
  ["5","Act","Specific corrective actions, prioritised"],
  ["6","Predict","Upcoming lots flagged before they run"]];
feats.forEach((f,i)=>{const cx=0.75+(i%3)*4.05, cy=2.15+Math.floor(i/3)*2.15;
  card(s,cx,cy,3.75,1.85);
  chip(s,cx+0.28,cy+0.3,f[0],i===5?AMBER:TEAL);
  s.addText(f[1],{x:cx+0.85,y:cy+0.3,w:2.6,h:0.42,fontFace:B,fontSize:17,bold:true,color:INK,isTextBox:true,margin:0,valign:"middle"});
  s.addText(f[2],{x:cx+0.28,y:cy+0.88,w:3.2,h:0.8,fontFace:B,fontSize:13,color:MUTED,isTextBox:true,margin:0});});
s.addNotes("Emphasise that Bob decides which tools to call and in what order. This is not a fixed pipeline with a chat box bolted on.");

/* 5 ─ THREE NON-OBVIOUS THINGS */
s=pres.addSlide(); s.background={color:PAPER};
title(s,"Three things that make it non-obvious","Each one is testable, and the eval suite asserts on it");
const three=[["scratch","Absence of signal is evidence",
  "Clean process sensors on a scratch pattern point toward mechanical handling. We cite \"no deviation\" as a positive finding, not a gap.",TEAL],
 ["nearfull","Built to be honestly uncertain",
  "Measurement-artifact hypotheses are confidence-capped. Competing precedents cap it further — and say so in the evidence.",AMBER],
 ["edge","Risk before the lot runs",
  "No wafer map, no test data. Two of four evidence inputs are null by construction, so the reasoning must change shape.",DEEP]];
three.forEach((t,i)=>{const cx=0.75+i*4.05;
  card(s,cx,2.05,3.75,4.35);
  wafer(s,cx+1.875,3.05,1.35,t[0],{base:t[3],defect:t[3],bg:PAPER});
  s.addText(t[1],{x:cx+0.28,y:3.92,w:3.2,h:0.72,fontFace:B,fontSize:16,bold:true,color:INK,isTextBox:true,margin:0,valign:"top"});
  s.addText(t[2],{x:cx+0.28,y:4.62,w:3.2,h:1.55,fontFace:B,fontSize:13,color:MUTED,isTextBox:true,margin:0,valign:"top"});});
s.addNotes("Case 3c asserts a confidence CEILING — a confident answer fails the test even when the named cause is right. That is the clearest way to say we test for honesty, not just accuracy.");

/* 6 ─ ARCHITECTURE */
s=pres.addSlide(); s.background={color:PAPER};
title(s,"Bob orchestrates. The server exposes.","9 MCP tools over stdio — Bob chooses and chains them");
const flow=[["Engineer","natural language",MUTED],["IBM Bob","agent loop · ORCHESTRATOR",DEEP],
  ["MCP Server","9 tools · stdio",TEAL],["Models","CNN · Isolation Forest · cases",MUTED],
  ["watsonx.ai","Granite reasoning",AMBER]];
flow.forEach((f,i)=>{const cx=0.75+i*2.48;
  card(s,cx,2.35,2.2,1.5,i===1?DEEP:WHITE);
  s.addText(f[0],{x:cx+0.12,y:2.55,w:1.96,h:0.42,fontFace:B,fontSize:15,bold:true,
    color:i===1?WHITE:INK,align:"center",isTextBox:true,margin:0});
  s.addText(f[1],{x:cx+0.12,y:3.0,w:1.96,h:0.7,fontFace:B,fontSize:11,
    color:i===1?"9FB3C2":MUTED,align:"center",isTextBox:true,margin:0});
  if(i<4) s.addText("→",{x:cx+2.2,y:2.8,w:0.3,h:0.5,fontFace:B,fontSize:20,color:TEAL,align:"center",isTextBox:true,margin:0});});
card(s,0.75,4.3,11.85,2.05,INK);
s.addText("rank_root_causes takes evidence as ARGUMENTS",
  {x:1.1,y:4.55,w:11.1,h:0.42,fontFace:H,fontSize:20,bold:true,color:WHITE,isTextBox:true,margin:0});
s.addText("Bob calls classify, score, retrieve and query_telemetry, then passes all four results in. The server never chains its own tools — if it fetched its own inputs, Bob would be a chat skin over a fixed pipeline. That distinction is visible in the code, and it is the one a judge should check.",
  {x:1.1,y:5.05,w:11.1,h:1.1,fontFace:B,fontSize:14,color:"CFDCE4",isTextBox:true,margin:0});
s.addNotes("Point at the Bob→rank_root_causes edge. An earlier revision of our own diagram had the server reading its own tools; we caught it and corrected it, because it quietly demotes Bob.");

/* 7 ─ CASE 6C */
s=pres.addSlide(); dark(s);
s.addText("The case that proves it reasons",{x:0.75,y:0.55,w:8.6,h:0.75,fontFace:H,fontSize:36,bold:true,color:WHITE,isTextBox:true,margin:0});
s.addText("Case 6c — Near-full failure",{x:0.75,y:1.32,w:8.6,h:0.4,fontFace:B,fontSize:15,color:AMBER,isTextBox:true,margin:0});
wafer(s,11.1,2.75,2.7,"nearfull",{base:CRIM,defect:CRIM,bg:"142B3D"});
s.addText("Almost every die fails",{x:9.5,y:4.3,w:3.2,h:0.35,fontFace:B,fontSize:13,color:"9FB3C2",align:"center",isTextBox:true,margin:0});
const beats=[["Obvious answer","A catastrophic process excursion. Scrap the lot.",MUTED],
  ["What the evidence says","The anomaly sits on the test head. Process sensors are quiet.",TEAL],
  ["Top hypothesis","\"Possible test-equipment measurement artifact — the wafers may be fine.\"",AMBER],
  ["Recommendation","Hold and retest. Do not scrap.",WHITE]];
beats.forEach((b,i)=>{const y=2.1+i*1.08;
  s.addText(b[0].toUpperCase(),{x:0.75,y:y,w:2.5,h:0.3,fontFace:B,fontSize:10,bold:true,color:"7C93A4",charSpacing:1,isTextBox:true,margin:0});
  s.addText(b[1],{x:0.75,y:y+0.3,w:8.3,h:0.62,fontFace:B,fontSize:15,color:b[2],isTextBox:true,margin:0});});
s.addText("Confidence capped at 0.70 — a claim that the measurement is wrong is a claim the data is untrustworthy.",
  {x:0.75,y:6.5,w:11.8,h:0.5,fontFace:B,fontSize:14,italic:true,color:AMBER,isTextBox:true,margin:0});
s.addNotes("This is the slide that separates diagnosis from relabeled anomaly detection. A system tuned for confident output gets this backwards and scraps good material. Do not rush it — it is the strongest 45 seconds in the submission.");

/* 8 ─ IBM INTEGRATION */
s=pres.addSlide(); s.background={color:PAPER};
title(s,"IBM technology integration","Bob is load-bearing, not name-dropped");
const ibm=[["IBM Bob","Interaction surface AND orchestrator. .bob/mcp.json registers our MCP server; .bob/skills/yieldguard teaches Bob both workflows."],
  ["MCP","9 tools over stdio with schemas Bob can read. Verified with a real handshake in test_stdio.py."],
  ["watsonx.ai · Granite","The reasoning behind rank_root_causes — called from inside our MCP server, not from Bob's prompt."]];
ibm.forEach((t,i)=>{const y=2.1+i*1.45;
  card(s,0.75,y,7.6,1.25);
  s.addText(t[0],{x:1.05,y:y+0.14,w:7.0,h:0.38,fontFace:B,fontSize:16,bold:true,color:TEAL,isTextBox:true,margin:0});
  s.addText(t[1],{x:1.05,y:y+0.52,w:7.0,h:0.62,fontFace:B,fontSize:13,color:MUTED,isTextBox:true,margin:0});});
card(s,8.75,2.1,3.85,4.25,INK);
s.addText("Bob → MCP → our server → Granite",{x:9.0,y:2.4,w:3.35,h:0.85,fontFace:B,fontSize:16,bold:true,color:WHITE,isTextBox:true,margin:0});
s.addText("Bob routes across its own models. watsonx.ai is something our server calls — that direction matters, and it is why the reasoning lives behind a tool rather than in a prompt.",
  {x:9.0,y:3.35,w:3.35,h:1.6,fontFace:B,fontSize:13,color:"CFDCE4",isTextBox:true,margin:0});
s.addText("7 of 8 tools real",{x:9.0,y:5.15,w:3.35,h:0.45,fontFace:H,fontSize:22,bold:true,color:TEAL,isTextBox:true,margin:0});
s.addText("pipeline_status reports it honestly, every run.",{x:9.0,y:5.65,w:3.35,h:0.55,fontFace:B,fontSize:12,color:"9FB3C2",isTextBox:true,margin:0});
s.addNotes("Show the architecture diagram here, not a logo. Say the direction out loud: Bob to MCP to our server to Granite. It shows we understand the stack rather than listing it.");

/* 9 ─ IMPACT + LIMITS */
s=pres.addSlide(); dark(s);
s.addText("Impact — and what we won't claim",{x:0.75,y:0.55,w:11.8,h:0.8,fontFace:H,fontSize:36,bold:true,color:WHITE,isTextBox:true,margin:0});
s.addText("IMPACT",{x:0.75,y:1.75,w:5.6,h:0.3,fontFace:B,fontSize:11,bold:true,color:TEAL,charSpacing:1,isTextBox:true,margin:0});
s.addText([{text:"Root cause in minutes with a cited evidence trail, not days of manual correlation",options:{bullet:true,breakLine:true}},
  {text:"Pre-run triage on lots not yet committed to the line",options:{bullet:true,breakLine:true}},
  {text:"Every engineer verdict feeds back into the case store",options:{bullet:true,breakLine:true}},
  {text:"Advisory by design — never a closed-loop control action",options:{bullet:true}}],
  {x:0.75,y:2.15,w:5.6,h:2.6,fontFace:B,fontSize:14,color:"CFDCE4",isTextBox:true,margin:0,paraSpaceAfter:9});
s.addText("WHAT WE WON'T CLAIM",{x:6.95,y:1.75,w:5.6,h:0.3,fontFace:B,fontSize:11,bold:true,color:AMBER,charSpacing:1,isTextBox:true,margin:0});
s.addText([{text:"SECOM and WM-811K are unrelated datasets — paired cases are constructed",options:{bullet:true,breakLine:true}},
  {text:"Anomaly detector measures recall 0.286 / precision 0.194 on held-out data",options:{bullet:true,breakLine:true}},
  {text:"The wafer classifier is untrained — we report no macro-F1",options:{bullet:true,breakLine:true}},
  {text:"Confidence is a relative ranking, not a calibrated probability",options:{bullet:true}}],
  {x:6.95,y:2.15,w:5.6,h:2.6,fontFace:B,fontSize:14,color:"CFDCE4",isTextBox:true,margin:0,paraSpaceAfter:9});
card(s,0.75,5.05,11.8,1.6,"1B3A52");
s.addText("A system whose whole value is honest, evidence-cited reasoning cannot begin by overclaiming its own provenance.",
  {x:1.1,y:5.35,w:11.1,h:1.0,fontFace:H,fontSize:19,italic:true,color:WHITE,isTextBox:true,margin:0});
s.addNotes("End on the limits deliberately. The entire value proposition is honest, evidence-cited reasoning — a pitch that overclaims contradicts the product. Call pipeline_status live if a judge asks how much is real.");

pres.writeFile({fileName:"slides.pptx"}).then(()=>console.log("wrote slides.pptx"));
