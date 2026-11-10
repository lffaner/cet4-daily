/* Paper-based practice. All new records extend the existing cet4-personal-v3 object. */
(() => {
  const $s = id => document.getElementById(id);
  const esc = value => escapeHTML(value == null ? '' : String(value));
  const dateCN = () => {
    const parts = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const get = name => parts.find(x => x.type===name).value;
    return get('year')+'-'+get('month')+'-'+get('day');
  };
  const plusDays = n => { const [y,m,d] = dateCN().split('-').map(Number); return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10); };
  const ranges = { full:[1,25], A:[1,7], B:[8,15], C:[16,25], RA:[26,35], RB:[36,45], RC:[46,55] };
  const labels = { full:'整套听力模拟', A:'Section A · 新闻', B:'Section B · 长对话', C:'Section C · 篇章', RA:'阅读 A · 选词填空', RB:'阅读 B · 长篇匹配', RC:'阅读 C · 仔细阅读' };
  const reasons = ['单词没听出 / 不认识','句子没听懂','没有抓住转折或关键信息','被干扰选项误导','阅读定位错误','推断或理解错误','粗心 / 其他'];
  let current = null, paper = null, player = null, hls = null, tick = null, lastSavedAudio = 0;
  const verifiedShares = {}, shareChecks = {};

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch { alert('保存失败。请到学习记录导出备份，并检查浏览器存储空间。'); return false; }
  }
  function sessions() { if (!state.examSessions || typeof state.examSessions !== 'object' || Array.isArray(state.examSessions)) state.examSessions = {}; return state.examSessions; }
  function sessionKey(id, mode, piece) { return [id, mode, piece == null ? 'all' : piece].join('|'); }
  function audioFor(id) { return (window.__CET4_AUDIO || {})[id] || (window.__CET4_AUDIO || {})[verifiedShares[id]] || null; }
  function resolveAudio(id, p, done) {
    if (audioFor(id)) return done(audioFor(id));
    const shared=(window.__CET4_INDEX||[]).find(x=>x.id===id)?.share;
    if(!shared || shareChecks[id]===false) return done(null);
    fetchPaper(shared,(err,source)=>{
      const same=!err && source && Array.from({length:25},(_,i)=>{
        const a=p.questions.find(q=>q.no===i+1), b=source.questions.find(q=>q.no===i+1);
        return a && b && a.stem===b.stem && a.answer===b.answer;
      }).every(Boolean);
      shareChecks[id]=same;
      if(same) verifiedShares[id]=shared;
      done(audioFor(id));
    });
  }
  function piecesFor(id) { return audioFor(id)?.pieces || []; }
  function pieceRange(piece) {
    const m = String(piece?.label || '').match(/(\d+)\s*[–—-]\s*(\d+)\s*题/);
    return m ? [+m[1], +m[2]] : null;
  }
  function matchingPiece(id, no) {
    const audio = audioFor(id);
    if (!audio || !/^https:\/\//.test(audio.m3u8 || '')) return null;
    const piece = (audio.pieces || []).find(p => { const r = pieceRange(p); return r && no >= r[0] && no <= r[1] && Number.isFinite(+p.start) && +p.end > +p.start; });
    return piece ? {url:audio.m3u8, page:audio.page || '', label:piece.label, start:+piece.start, end:+piece.end} : null;
  }
  function sectionSegment(id,mode) {
    if (!['A','B','C'].includes(mode)) return null;
    const [first,last]=ranges[mode];
    const pieces=piecesFor(id).filter(p=>{const r=pieceRange(p);return r && r[0]>=first && r[1]<=last && Number.isFinite(+p.start) && +p.end>+p.start;});
    return pieces.length ? {label:labels[mode],start:+pieces[0].start,end:+pieces[pieces.length-1].end} : null;
  }
  function makeStudio(type) {
    const section = $s(type);
    const legacy = section.firstElementChild;
    legacy.classList.add('studio-legacy');
    legacy.hidden = true;
    const host = document.createElement('div');
    host.className = 'panel studio';
    host.id = type === 'listening' ? 'listenStudio' : 'readStudio';
    section.insertBefore(host, legacy);
    const old = document.createElement('button');
    old.className = 'studio-old-link';
    old.textContent = '查看原有分组练习';
    old.onclick = () => { legacy.hidden = !legacy.hidden; old.textContent = legacy.hidden ? '查看原有分组练习' : '收起原有分组练习'; };
    section.append(old);
    return host;
  }
  const listeningHost = makeStudio('listening');
  const readingHost = makeStudio('reading');

  function paperOptions(selected) {
    const index = window.__CET4_INDEX || [];
    return index.map(p => `<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.label+' '+p.set)}</option>`).join('');
  }
  function latestDraft(type) {
    return Object.values(state.examSessions || {}).filter(s => s && !s.completedAt && (type === 'listening' ? s.mode === 'full' || ['A','B','C'].includes(s.mode) : /^R/.test(s.mode)))
      .sort((a,b) => String(b.updatedAt||b.startedAt).localeCompare(String(a.updatedAt||a.startedAt)))[0] || null;
  }
  function picker(type) {
    const host = type === 'listening' ? listeningHost : readingHost;
    const saved = state.studyUi?.[type+'Paper'] || '2025-12-1';
    const draft = latestDraft(type);
    host.innerHTML = `<div class="studio-head"><div><span class="studio-eyebrow">按真题套次保存</span><h2>${type==='listening'?'听力训练':'阅读训练'}</h2><p class="muted small">${type==='listening'?'整套 25 题连续听，日常可按 Section 或原音频片段练习。':'保留原文与题号，按 Section A/B/C 分别练习。'}</p></div></div>
      ${draft ? `<button class="studio-resume" id="${type}Resume">继续上次 · ${esc(draft.paper)} · ${esc(labels[draft.mode])}</button>` : ''}
      <label class="studio-field">选择真题<select id="${type}StudioPaper">${paperOptions(saved)}</select></label>
      <div class="studio-mode-grid">${(type==='listening'?['full','A','B','C']:['RA','RB','RC']).map(mode => `<button data-studio-mode="${mode}"><b>${esc(labels[mode])}</b><span>${ranges[mode][0]}—${ranges[mode][1]} 题</span></button>`).join('')}</div>
      ${type==='listening'?'<div id="pieceChoices"></div>':''}
      <p class="small muted">题目和音频链接在使用时从<a href="https://github.com/123xzw999/cet4-exam-quiz" target="_blank" rel="noopener">来源仓库</a>加载。音频能否播放会在本机加载时显示。</p>
      <p class="studio-message" id="${type}StudioMessage" role="status"></p>`;
    host.querySelectorAll('[data-studio-mode]').forEach(btn => btn.onclick = () => start(host.querySelector('select').value, btn.dataset.studioMode));
    host.querySelector('select').onchange = e => {
      state.studyUi ||= {}; state.studyUi[type+'Paper'] = e.target.value; persist();
      if (type === 'listening') renderPieces(e.target.value);
    };
    if (draft) $s(type+'Resume').onclick = () => start(draft.paper,draft.mode,draft.pieceIndex,true);
    if (type === 'listening') renderPieces(host.querySelector('select').value);
  }
  function renderPieces(id) {
    const target = $s('pieceChoices');
    if (!target) return;
    const shared=(window.__CET4_INDEX||[]).find(x=>x.id===id)?.share;
    if(shared && !shareChecks[id] && shareChecks[id]!==false) {
      target.innerHTML='<p class="small muted">正在核对这套题与共用音频的题号…</p>';
      shareChecks[id]='loading';
      fetchPaper(id,(err,p)=>{ if(err){shareChecks[id]=false;return renderPieces(id);} resolveAudio(id,p,()=>{if($s('listeningStudioPaper')?.value===id)renderPieces(id);}); });
      return;
    }
    const pieces = piecesFor(id);
    target.innerHTML = '<h3>按原音频片段练</h3>' + (pieces.length
      ? '<div class="studio-piece-grid">' + pieces.map((p,i) => `<button data-piece="${i}">${esc(p.label)}</button>`).join('') + '</div>'
      : '<p class="small muted">本套未提供可确认对应的音频片段。题目仍可练习，音频请到来源页核对。</p>');
    target.querySelectorAll('[data-piece]').forEach(btn => btn.onclick = () => start(id,'piece',+btn.dataset.piece));
  }
  function ensureIndex() {
    if (!window.__CET4_INDEX?.length) {
      listeningHost.innerHTML = '<h2>听力训练</h2><p>真题目录加载中…</p>';
      readingHost.innerHTML = '<h2>阅读训练</h2><p>真题目录加载中…</p>';
      setTimeout(ensureIndex,500); return;
    }
    picker('listening'); picker('reading');
    if (!window.__CET4_AUDIO) {
      let attempts=0;
      const check=setInterval(()=>{
        if(window.__CET4_AUDIO || ++attempts>=20) {
          clearInterval(check);
          renderPieces($s('listeningStudioPaper')?.value);
        }
      },500);
    }
  }
  function pauseClock() {
    if (!current) return;
    current.elapsedMs = (current.elapsedMs||0) + Math.max(0,Date.now()-(current.clockStart||Date.now()));
    current.clockStart = null;
    current.updatedAt = new Date().toISOString();
    persist();
    clearInterval(tick); tick = null;
  }
  function startClock() {
    if (!current || current.completedAt || current.clockStart) return;
    current.clockStart = Date.now();
    tick = setInterval(() => {
      const ms=(current.elapsedMs||0)+Date.now()-current.clockStart;
      const el=$s('studioTimer'); if(el) el.textContent = '用时 '+Math.floor(ms/60000)+'分'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'秒';
      if (Math.floor(ms/10000)!==Math.floor((ms-1000)/10000)) persist();
    },1000);
  }
  function cleanupAudio() {
    if (player) { player.pause(); player.removeAttribute('src'); player.load(); player=null; }
    if (hls) { hls.destroy(); hls=null; }
  }
  async function start(id, mode, pieceIndex=null, resume=false) {
    const type = mode === 'full' || mode === 'piece' || ['A','B','C'].includes(mode) ? 'listening' : 'reading';
    const host = type === 'listening' ? listeningHost : readingHost;
    if (current) { pauseClock(); cleanupAudio(); }
    const message = $s(type+'StudioMessage'); if (message) message.textContent='正在加载真题…';
    fetchPaper(id,(err,p) => {
      if (err || !p) { if (message) message.textContent='试卷加载失败，请检查网络后重试。'; return; }
      resolveAudio(id,p,()=>{
        paper=p;
        const piece = mode==='piece' ? piecesFor(id)[pieceIndex] : null;
        const range = mode==='piece' ? pieceRange(piece) : ranges[mode];
        if (!range) { if(message) message.textContent='这段音频的题号无法确认，已停止加载。'; return; }
        const base = sessionKey(id,mode,pieceIndex);
        let s=resume ? Object.values(sessions()).filter(x=>x && !x.completedAt && x.paper===id && x.mode===mode && x.pieceIndex===pieceIndex)
          .sort((a,b)=>String(b.updatedAt||b.startedAt).localeCompare(String(a.updatedAt||a.startedAt)))[0] : null;
        if (!s) {
          const key=base+'|'+Date.now();
          s={id:key,paper:id,mode,pieceIndex,range,answers:{},notes:{},startedAt:new Date().toISOString(),elapsedMs:0,question:range[0],audioTime:null,completedAt:null};
          sessions()[key]=s;
        }
        current=s; current.clockStart=null; current.question=Math.max(range[0],Math.min(range[1],+current.question||range[0]));
        state.studyUi ||= {}; state.studyUi.lastExam=s.id; state.studyUi.lastTab=type; state.studyUi[type+'Paper']=id;
        persist(); showTab(type); renderSession(); startClock();
      });
    });
  }
  function question() { return paper?.questions?.find(q => q.no === current?.question); }
  function qList() { return paper?.questions?.filter(q => q.no>=current.range[0] && q.no<=current.range[1]) || []; }
  function passageFor(q) {
    if (q.passage) return q.passage;
    const first = q.no>=46 ? (q.no<=50?46:51) : current.range[0];
    return paper.questions.find(x => x.no===first)?.passage || '';
  }
  function cleanOption(value) {
    const text=String(value||'');
    const spill=text.length>200 ? text.match(/^(.{1,200}?[.!?])\s+\d+\s+[A-Z]/) : null;
    return spill ? spill[1] : text;
  }
  function optionsFor(q) {
    if (q.part==='matching') return (q.paraOptions||'ABCDEFGHIJKLMNO'.split('')).map(x=>[x,x+' 段']);
    if (q.part==='cloze') return (q.options||[]).map((x,i)=>[String.fromCharCode(65+i),cleanOption(x).replace(/^[A-O]\)\s*/, '')]);
    return (q.options||[]).map((x,i)=>[String.fromCharCode(65+i),cleanOption(x)]);
  }
  function renderSession() {
    const type = /^R/.test(current.mode)?'reading':'listening';
    const host=type==='reading'?readingHost:listeningHost;
    const q=question(); if(!q) { host.innerHTML='<p>该题数据缺失，请换一套试卷。</p>'; return; }
    const audioPanel=type==='listening'?$s('studioAudio'):null;
    if(audioPanel) audioPanel.remove();
    const list=qList(), count=list.filter(x=>current.answers[x.no]).length;
    const ptxt = type==='reading' ? passageFor(q) : '';
    const audio = type==='listening' ? audioFor(current.paper) : null;
    const seg = current.mode==='piece' ? piecesFor(current.paper)[current.pieceIndex] : sectionSegment(current.paper,current.mode);
    const title = current.mode==='piece' ? seg?.label || '音频片段' : labels[current.mode];
    host.innerHTML = `<div class="studio-top"><button id="studioExit">‹ 返回</button><span>${esc(paper.label+' '+paper.set)}</span></div>
      <h2>${esc(title)}</h2><div class="studio-progress"><span>已选 ${count}/${list.length}</span><span id="studioTimer"></span></div>
      <div class="bar"><div style="width:${count/list.length*100}%"></div></div>
      ${type==='listening' ? '<div id="studioAudio"></div>' : ''}
      <div class="studio-steps"><button id="studioPrev" ${q.no===current.range[0]?'disabled':''}>上一题</button><span>第 ${q.no} 题 · ${current.range[0]}—${current.range[1]}</span><button id="studioNext" ${q.no===current.range[1]?'disabled':''}>下一题</button></div>
      ${ptxt ? `<details class="studio-passage" open><summary>阅读原文 · 第 ${q.no<=35?'26—35':q.no<=45?'36—45':q.no<=50?'46—50':'51—55'} 题</summary><div>${esc(ptxt)}</div></details>` : type==='reading' ? '<p class="note small">来源题库未提供这一部分的原文，请打开原站核对。</p>' : ''}
      <div class="studio-question"><b>Q${q.no}. ${esc(q.stem)}</b><div class="studio-options">${optionsFor(q).map(([letter,label])=>`<button data-answer="${letter}" class="${current.answers[q.no]===letter?'selected':''}">${letter}. ${esc(label)}</button>`).join('')}</div></div>
      ${type==='reading' ? `<label class="studio-field">定位笔记（自动保存）<textarea id="studioNote" placeholder="记录段落或定位句">${esc(current.notes[q.no]||'')}</textarea></label>` : ''}
      <div class="studio-bottom"><button id="studioSubmit" class="primary">交卷并查看结果</button><span>退出后可从上次位置继续</span></div>`;
    $s('studioExit').onclick=exitSession;
    $s('studioPrev').onclick=()=>move(-1); $s('studioNext').onclick=()=>move(1);
    host.querySelectorAll('[data-answer]').forEach(btn=>btn.onclick=()=>{
      current.answers[q.no]=btn.dataset.answer; current.updatedAt=new Date().toISOString(); persist(); renderSession();
    });
    if ($s('studioNote')) $s('studioNote').oninput=e=>{current.notes[q.no]=e.target.value; current.updatedAt=new Date().toISOString(); persist();};
    $s('studioSubmit').onclick=submit;
    if (type==='listening') {
      if(audioPanel) $s('studioAudio').replaceWith(audioPanel);
      else renderAudio(audio,seg);
    }
  }
  function move(delta) { if(!current)return; current.question=Math.max(current.range[0],Math.min(current.range[1],current.question+delta)); current.updatedAt=new Date().toISOString(); persist(); renderSession(); }
  function exitSession() { pauseClock(); cleanupAudio(); const type=/^R/.test(current.mode)?'reading':'listening'; current=null; paper=null; picker(type); renderToday(); }
  function renderAudio(audio,seg) {
    const box=$s('studioAudio'); if(!box) return;
    if (!audio || !/^https:\/\//.test(audio.m3u8||'') || (current.mode!=='full' && !seg)) {
      box.innerHTML='<p class="note small">本套没有可确认对应的音频链接。可继续做题，或到来源页查找录音。</p>'; return;
    }
    const start=seg?+seg.start:0, end=seg?+seg.end:Infinity;
    box.innerHTML=`<div class="studio-audio-status"><span>原套音频 · ${seg?esc(seg.label):'连续播放'}</span><span id="audioLoadState">准备加载</span></div>
      <audio id="studioPlayer" preload="none" playsinline></audio>
      <div class="studio-audio-buttons"><button id="studioPlay">播放 / 暂停</button>${current.mode==='full'?'':'<button id="studioReplay">从本段开头重听</button>'}<a href="${esc(audio.page||audio.m3u8)}" target="_blank" rel="noopener">音频来源页</a></div>
      <p class="small muted">音频来自第三方，需联网。只有本机实际加载成功后才显示“可播放”。</p>`;
    cleanupAudio(); player=$s('studioPlayer');
    const status=$s('audioLoadState');
    player.oncanplay=()=>{if(status)status.textContent='可播放';};
    player.onerror=()=>{if(status)status.textContent='加载失败 · 请打开来源页';};
    player.ontimeupdate=()=>{
      if (!current || !player) return;
      if(player.currentTime>=end){player.pause(); status.textContent='本段播放完毕';}
      if(Math.abs(player.currentTime-lastSavedAudio)>5){current.audioTime=player.currentTime; lastSavedAudio=player.currentTime; persist();}
    };
    player.onended=()=>{if(status)status.textContent='播放完毕';};
    function attach() {
      if (!player) return;
      if(player.canPlayType('application/vnd.apple.mpegurl')) {player.src=audio.m3u8;player.load();}
      else if(window.Hls?.isSupported()) {
        hls=new Hls({enableWorker:false}); hls.loadSource(audio.m3u8); hls.attachMedia(player);
        hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal && status)status.textContent='加载失败 · 请打开来源页';});
      } else status.textContent='当前浏览器不支持该音频';
    }
    if (player.canPlayType('application/vnd.apple.mpegurl') || window.Hls) attach();
    else loadScript('https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js',e=>e?status.textContent='播放器加载失败':attach());
    const seek=()=>{const pos=current.audioTime!=null?+current.audioTime:start; if(player.readyState>=1)player.currentTime=Math.max(start,Math.min(pos,end));};
    player.addEventListener('loadedmetadata',seek,{once:true});
    $s('studioPlay').onclick=()=>{
      if(!player)return;
      if(player.paused) player.play().catch(()=>{status.textContent='播放失败 · 请打开来源页';});
      else player.pause();
    };
    if($s('studioReplay')) $s('studioReplay').onclick=()=>{current.audioTime=start;player.currentTime=start;player.play().catch(()=>{status.textContent='播放失败 · 请打开来源页';});};
  }
  function submit() {
    const list=qList(), answered=list.filter(q=>current.answers[q.no]).length;
    if (answered<list.length && !confirm(`还有 ${list.length-answered} 题未选，确定交卷吗？`)) return;
    pauseClock(); cleanupAudio();
    const stamp=new Date().toISOString(), date=dateCN();
    state.attempts ||= []; state.mistakes ||= {}; state.logs ||= [];
    let correct=0;
    for(const q of list) {
      const choice=current.answers[q.no]||'', right=choice===q.answer;
      if(right)correct++;
      const type=q.no<=25?'listening':'reading', id=type+':'+current.paper+':'+q.no;
      state.attempts.push({id,type,paper:current.paper,no:q.no,choice,answer:q.answer,correct:right,date,time:stamp,mode:current.mode,session:current.id});
      if(choice && !right) {
        const prior=state.mistakes[id]||{};
        state.mistakes[id]={...prior,id,type,paper:current.paper,no:q.no,stem:q.stem||'',options:(q.options||q.paraOptions||[]).map(cleanOption),answer:q.answer,answerText:q.answerText||'',explain:q.explain||{},passage:type==='reading'?passageFor(q):'',firstWrong:prior.firstWrong||stamp,lastWrong:stamp,lastChoice:choice,reason:prior.reason||'',reasonNote:prior.reasonNote||'',stage:0,due:plusDays(1),mastered:false,reviewCount:prior.reviewCount||0,audio:type==='listening'?matchingPiece(current.paper,q.no):null};
      }
    }
    state.logs.push({date,type:/^R/.test(current.mode)?'reading':'listening',paper:current.paper,correct,total:list.length,answered,time:stamp,autoSaved:true,mode:current.mode,questions:list.map(q=>q.no)});
    current.completedAt=stamp; current.results={correct,answered,total:list.length}; current.clockStart=null;
    state.tasks ||= {}; const task=state.tasks[date]||[false,false,false]; task[/^R/.test(current.mode)?2:1]=true; state.tasks[date]=task;
    if (!persist()) return;
    showResults();
  }
  function showResults() {
    const type=/^R/.test(current.mode)?'reading':'listening',host=type==='reading'?readingHost:listeningHost;
    const result=current.results,list=qList();
    host.innerHTML=`<button id="resultBack">‹ 返回真题</button><h2>${esc(paper.label+' '+paper.set)} · ${esc(labels[current.mode]||'音频片段')}</h2>
      <div class="studio-result"><strong>${result.correct}/${result.total}</strong><span>已作答 ${result.answered} 题 · 逐题结果已保存</span></div>
      <p class="small muted">错因请按真实情况填写，系统不会猜测。错题将于第 1、3、7 天安排复测。</p>
      ${list.map(q=>{const choice=current.answers[q.no]||'',right=choice===q.answer,id=(q.no<=25?'listening':'reading')+':'+current.paper+':'+q.no;
        return `<details class="studio-result-item" ${choice&&!right?'open':''}><summary>Q${q.no} · ${choice?right?'正确':'答错':'未作答'} · 你的选择 ${esc(choice||'—')} / 答案 ${esc(q.answer)}</summary>
          <p>${esc(q.stem)}</p><p class="answer">正确答案：${esc(q.answer)} ${esc(q.answerText||'')}</p>
          ${Object.entries(q.explain||{}).map(([k,v])=>`<p><b>${esc(k)}：</b>${esc(v)}</p>`).join('')}
          ${choice&&!right ? `<label class="studio-field">错因<select data-reason="${esc(id)}"><option value="">待填写</option>${reasons.map(r=>`<option value="${esc(r)}" ${state.mistakes[id]?.reason===r?'selected':''}>${esc(r)}</option>`).join('')}</select></label><label class="studio-field">补充笔记<textarea data-reason-note="${esc(id)}">${esc(state.mistakes[id]?.reasonNote||'')}</textarea></label>` : ''}
        </details>`}).join('')}`;
    $s('resultBack').onclick=()=>{const t=type; current=null;paper=null;picker(t);renderToday();};
    host.querySelectorAll('[data-reason]').forEach(el=>el.onchange=()=>{const x=state.mistakes[el.dataset.reason];if(x){x.reason=el.value;persist();}});
    host.querySelectorAll('[data-reason-note]').forEach(el=>el.oninput=()=>{const x=state.mistakes[el.dataset.reasonNote];if(x){x.reasonNote=el.value;persist();}});
    renderToday();
  }
  function uniqueUnion(a,b) {
    const out=Array.isArray(a)?a.slice():[], seen=new Set(out.map(x=>JSON.stringify(x)));
    for(const x of Array.isArray(b)?b:[]) {const k=JSON.stringify(x);if(!seen.has(k)){seen.add(k);out.push(x);}}
    return out;
  }
  function mergeSafe(currentData, imported) {
    if (Array.isArray(currentData) || Array.isArray(imported)) return uniqueUnion(currentData,imported);
    if (currentData && typeof currentData==='object' && imported && typeof imported==='object') {
      const out={...imported,...currentData};
      for(const k of Object.keys(imported)) if(Object.prototype.hasOwnProperty.call(currentData,k)) out[k]=mergeSafe(currentData[k],imported[k]);
      return out;
    }
    return currentData===undefined?imported:currentData;
  }
  // The former import handler replaced the entire object. Merge is additive; current values win conflicts.
  $s('importFile').onchange=async e=>{
    const file=e.target.files?.[0]; if(!file)return;
    try {
      const incoming=JSON.parse(await file.text());
      if(!incoming || typeof incoming!=='object' || !Array.isArray(incoming.logs) || !incoming.marks || typeof incoming.marks!=='object') throw Error('文件不是本站学习记录');
      const merged=mergeSafe(state,incoming);
      const serialized=JSON.stringify(merged);
      localStorage.setItem(KEY,serialized);
      state=merged;
      renderHistory(); renderToday(); picker('listening'); picker('reading');
      alert('导入完成：旧记录与当前记录已合并。建议立即导出一份新备份。');
    } catch(err) {alert('导入失败，当前记录未更改：'+err.message);}
    e.target.value='';
  };
  const historyNote=document.createElement('p');
  historyNote.className='small muted';
  historyNote.textContent='导入会合并记录，当前字段优先；不会清空已有题组日志、逐题答案、单词和错题。旧版仅保存题组分数的记录仍按题组显示。';
  $s('history').querySelector('.panel').insertBefore(historyNote,$s('logList'));
  const historyDetails=document.createElement('div');
  historyDetails.id='studioHistory';
  $s('history').querySelector('.panel').append(historyDetails);
  $s('help').querySelector('.panel').innerHTML=`<h2>使用说明</h2><ol>
    <li>从首页进入听力或阅读，先选真题套次。听力可选完整 25 题、Section A/B/C，或来源标注的八个音频片段。</li>
    <li>作答和阅读定位笔记会自动暂存。整套模拟只显示题目与选项，交卷前不显示答案和解析；退出后可继续。</li>
    <li>交卷后会保存逐题选择和正确性。答错时可填写真实错因；错题本按 1、3、7 天安排复测，并可重听对应段落。</li>
    <li>学习记录页可导出 JSON 备份。导入会合并，当前记录优先。旧版只有题组分数的日志仍可查看，无法推断当时每题的答案。</li>
    <li>记录保存在当前浏览器的 <code>cet4-personal-v3</code> 中。同一网址在 iPhone 和电脑上不会自动同步；换设备需手动导出、导入。</li>
  </ol><div class="note small">真题、解析与音频由第三方提供，本站按需加载链接，不在本仓库复制全部内容。音频在本机实际加载后才标为可播放；部分试卷共用录音时，本站先比对听力 25 题的题干和答案，再开放该音频。题库可能存在排版错误，请以原题来源核对。</div>
  <p><a href="https://github.com/123xzw999/cet4-exam-quiz" target="_blank" rel="noopener">题库来源</a> · <a href="https://123xzw999.github.io/cet4-exam-quiz/" target="_blank" rel="noopener">原站</a></p>`;
  const priorRenderHistory=renderHistory;
  renderHistory=function(){
    priorRenderHistory();
    const completed=Object.values(state.examSessions||{}).filter(s=>s?.completedAt).sort((a,b)=>String(b.completedAt).localeCompare(String(a.completedAt)));
    historyDetails.innerHTML='<h3>整套与分段练习 · 逐题记录</h3>'+(completed.length
      ? completed.map(s=>`<div class="studio-history-card"><b>${esc(s.paper)} · ${esc(labels[s.mode]||piecesFor(s.paper)[s.pieceIndex]?.label||'音频片段')}</b><span>${esc(s.completedAt.slice(0,10))} · ${s.results?.correct||0}/${s.results?.total||0}</span><button data-history-run="${esc(s.id)}">查看逐题作答</button></div>`).join('')
      : '<p class="small muted">新模式的逐题结果会显示在这里。旧题组日志仍在上方；没有逐题答案的旧记录无法还原。</p>');
    historyDetails.querySelectorAll('[data-history-run]').forEach(btn=>btn.onclick=()=>{
      const s=state.examSessions[btn.dataset.historyRun];
      const attempts=(state.attempts||[]).filter(a=>a.session===s.id);
      const detail=document.createElement('div');detail.className='studio-history-detail';
      detail.innerHTML=attempts.map(a=>`<div>Q${a.no} · ${a.choice? a.correct?'正确':'答错':'未作答'} · 选择 ${esc(a.choice||'—')} / 答案 ${esc(a.answer||'—')}
        ${state.mistakes?.[a.id]?.reason && !a.correct ? ' · 错因：'+esc(state.mistakes[a.id].reason):''}</div>`).join('');
      btn.parentElement.querySelector('.studio-history-detail')?.remove();
      btn.parentElement.append(detail);
    });
  };
  const priorShowTab=showTab;
  showTab=function(id){
    const activeType=current ? (/^R/.test(current.mode)?'reading':'listening') : null;
    if(activeType && id!==activeType){pauseClock(); if(player)player.pause();}
    priorShowTab(id);
    if(activeType && id===activeType)startClock();
  };
  const oldToday=renderToday;
  renderToday=function(){
    oldToday();
    const panel=$s('today').querySelector('.panel:not(.hidden)');
    if(!panel)return;
    const date=dateCN(), due=Object.values(state.mistakes||{}).filter(x=>x&&!x.mastered&&x.due&&x.due<=date).length;
    const last=state.studyUi?.lastExam && state.examSessions?.[state.studyUi.lastExam];
    const resume=last&&!last.completedAt?last:latestDraft('listening')||latestDraft('reading');
    panel.innerHTML=`<div class="home-date">${esc(date)} · 北京时间</div><h2 class="home-title">今天练什么</h2>
      ${resume?`<button class="home-continue" id="studioHomeResume"><span>继续上次 · ${esc(resume.paper)} · ${esc(labels[resume.mode]||'音频片段')}</span><span>›</span></button>`:''}
      <div class="studio-home-grid"><button data-home="words"><b>单词</b><span>今日新词与到期复习</span></button>
      <button data-home="listening"><b>整套听力</b><span>25 题 · 连续播放</span></button>
      <button data-home="reading"><b>阅读分项</b><span>原文、定位笔记</span></button>
      <button data-home="review"><b>错题复测</b><span>${due} 道今日到期</span></button></div>
      <p class="small muted">练习自动暂存；交卷后才显示答案。<button data-home="history">记录与备份</button></p>`;
    panel.querySelectorAll('[data-home]').forEach(b=>b.onclick=()=>showTab(b.dataset.home));
    if(resume)$s('studioHomeResume').onclick=()=>start(resume.paper,resume.mode,resume.pieceIndex,true);
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseClock();else startClock();});
  window.addEventListener('pagehide',pauseClock);
  ensureIndex(); renderToday();
})();
