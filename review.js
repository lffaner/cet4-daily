/* Wrong-answer practice. The existing cet4-personal-v3 record is extended in place. */
(() => {
  const DAY = 86400000;
  const REASONS = ['单词没听出 / 不认识', '句子没听懂', '没有抓住转折或关键信息', '被干扰选项误导', '阅读定位错误', '推断或理解错误', '粗心 / 其他'];
  const originalRenderQuiz = renderQuiz;
  const originalShowTab = showTab;
  const originalImport = $('importFile').onchange;
  let filter = 'due';
  let selectedId = '';
  let reviewHls = null;

  function ensureData() {
    if (!Array.isArray(state.attempts)) state.attempts = [];
    if (!state.mistakes || typeof state.mistakes !== 'object' || Array.isArray(state.mistakes)) state.mistakes = {};
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (e) { alert('浏览器存储空间不足或不可用。请先导出学习记录备份。'); return false; }
  }
  function today() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const value = name => parts.find(part => part.type === name).value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  }
  function addDays(n) {
    const [year, month, day] = today().split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + n)).toISOString().slice(0, 10);
  }
  function key(type, paper, no) { return type + ':' + paper + ':' + no; }
  function label(type) { return type === 'listening' ? '听力' : '阅读'; }
  function html(s) { return escapeHTML(s); }
  function snapshot(q, passage) {
    return { stem: q.stem || '', options: q.options || [], answer: q.answer,
      answerText: q.answerText || '', explain: q.explain || {}, passage: passage || '' };
  }
  function matchingPiece(paper, no) {
    // Only the paper's own audio is safe to call a corresponding recording.
    const audio = (window.__CET4_AUDIO || {})[paper];
    if (!audio || !/^https:\/\//.test(audio.m3u8 || '')) return null;
    const piece = (audio.pieces || []).find(p => {
      const m = String(p.label || '').match(/(\d+)\s*[–—-]\s*(\d+)\s*题/);
      return m && no >= +m[1] && no <= +m[2] &&
        Number.isFinite(+p.start) && Number.isFinite(+p.end) && +p.end > +p.start;
    });
    return piece ? { url: audio.m3u8, page: audio.page || '', label: piece.label,
      start: +piece.start, end: +piece.end } : null;
  }
  function savedPiece(x) {
    const p = matchingPiece(x.paper, x.no) || x.audio;
    return p && /^https:\/\//.test(p.url || '') && Number.isFinite(+p.start) &&
      Number.isFinite(+p.end) && +p.end > +p.start ? p : null;
  }
  // Shared links in the source index can refer to another set. Do not present them as this set's audio.
  getAudio = id => (window.__CET4_AUDIO || {})[id] || null;
  renderQuiz = function(type) {
    originalRenderQuiz(type);
    const root = $(type === 'listening' ? 'listenQuiz' : 'readQuiz');
    const check = root.querySelector('#checkQuiz');
    if (!check) return;
    root.dataset.autoSaved = '';
    check.addEventListener('click', () => {
      if (root.dataset.autoSaved === 'yes' || root.dataset.checked !== 'yes') return;
      ensureData();
      const paper = $(type === 'listening' ? 'listenPaper' : 'readPaper').value;
      const questions = (active[type]?.questions || []).filter(q =>
        type === 'listening' ? q.no >= 1 && q.no <= 25 : q.no >= 46 && q.no <= 55);
      const subset = questions.slice(offsets[type], offsets[type] + (type === 'listening' ? 3 : 2));
      const timestamp = new Date().toISOString();
      const date = $('studyDate').value || today();
      let answered = 0, correct = 0;
      subset.forEach(q => {
        const el = [...root.querySelectorAll('.quiz-item')].find(x => +x.dataset.no === q.no);
        if (!el) return;
        const choice = el.dataset.choice || '';
        const answer = String(q.answer || '').toUpperCase();
        const valid = /^[A-P]$/.test(answer) && answer.charCodeAt(0) - 65 < (q.options || []).length;
        if (choice) answered++;
        if (valid && choice === answer) correct++;
        const id = key(type, paper, q.no);
        state.attempts.push({ id, type, paper, no: q.no, choice, answer: valid ? answer : '',
          correct: valid && choice === answer, date, time: timestamp });
        if (!valid || !choice || choice === answer) return;
        const passage = type === 'reading'
          ? q.passage || questions.find(x => x.no === (q.no <= 50 ? 46 : 51))?.passage || '' : '';
        const old = state.mistakes[id];
        state.mistakes[id] = { id, type, paper, no: q.no, ...snapshot(q, passage),
          firstWrong: old?.firstWrong || timestamp, lastWrong: timestamp,
          lastChoice: choice, reason: old?.reason || '', reasonNote: old?.reasonNote || '',
          stage: 0, due: addDays(1), mastered: false, reviewCount: old?.reviewCount || 0,
          audio: type === 'listening' ? matchingPiece(paper, q.no) : null };
      });
      state.logs.push({ date, type, paper, correct, total: subset.length, answered,
        time: timestamp, autoSaved: true, questions: subset.map(q => q.no) });
      root.dataset.autoSaved = 'yes';
      check.disabled = true;
      check.textContent = '已核对并自动保存';
      const saved = persist();
      const result = root.querySelector('#quizResult');
      if (result) result.textContent = saved
        ? `已作答 ${answered}/${subset.length} · 正确 ${correct}/${subset.length}。逐题结果已自动保存；错题已加入错题本。`
        : '核对完成，但保存失败。请导出备份并检查浏览器存储空间。';
      if (saved && result && subset.some(q => {
        const el = [...root.querySelectorAll('.quiz-item')].find(x => +x.dataset.no === q.no);
        return el?.dataset.choice && el.dataset.choice !== q.answer;
      })) {
        const jump = document.createElement('button');
        jump.textContent = '去错题本重练';
        jump.onclick = () => { filter = type; showTab('review'); };
        result.append(' ', jump);
      }
      $(type === 'listening' ? 'listenSaved' : 'readSaved').textContent =
        saved ? '✓ 本组逐题结果已自动保存' : '保存失败';
      renderToday();
      renderReviewList();
    });
  };
  showTab = function(id) {
    if (id !== 'review') cleanupAudio();
    originalShowTab(id);
    if (id === 'review') renderReviewList();
  };
  $('saveListening').remove();
  $('saveReading').remove();
  $('listenSaved').textContent = '核对答案后自动保存，无需另点保存。';
  $('readSaved').textContent = '核对答案后自动保存，无需另点保存。';

  function entries() { ensureData(); return Object.values(state.mistakes).filter(x => x && x.id); }
  function due(x) { return !x.mastered && x.due && x.due <= today(); }
  function status(x) {
    if (x.mastered) return '已完成 1 / 3 / 7 天复测';
    return (due(x) ? '今日待测' : '下次复测 ' + (x.due || '待安排')) +
      ' · ' + (x.stage === 0 ? '第 1 天' : x.stage === 1 ? '第 3 天' : '第 7 天');
  }
  function renderReviewList() {
    const all = entries();
    $('reviewStats').innerHTML =
      `<div class="stat"><strong>${all.filter(x => x.type === 'listening' && !x.mastered).length}</strong>听力待巩固</div>` +
      `<div class="stat"><strong>${all.filter(x => x.type === 'reading' && !x.mastered).length}</strong>阅读待巩固</div>` +
      `<div class="stat"><strong>${all.filter(due).length}</strong>今日待测</div>`;
    document.querySelectorAll('#reviewFilters button').forEach(b => b.classList.toggle('on', b.dataset.filter === filter));
    const shown = all.filter(x => filter === 'all' ? true : filter === 'due' ? due(x) : x.type === filter)
      .sort((a, b) => (a.mastered - b.mastered) || String(a.due || '9999').localeCompare(String(b.due || '9999')) || a.no - b.no);
    $('reviewList').innerHTML = shown.length ? shown.map(x =>
      `<div class="review-card"><h3>${label(x.type)} · ${html(x.paper)} · 第 ${html(x.no)} 题</h3>` +
      `<div>${html(x.stem)}</div><div class="review-meta">${html(status(x))} · 上次选择 ${html(x.lastChoice || '未作答')}</div>` +
      `<div class="review-actions"><button data-review-id="${html(x.id)}">重练这题</button></div></div>`).join('')
      : '<p class="muted">这里暂无错题或今日待测题。旧版只保存了整组分数，无法还原当时具体错了哪题；新核对的题会自动记录。</p>';
    $('reviewList').querySelectorAll('[data-review-id]').forEach(b => b.onclick = () => openReview(b.dataset.reviewId));
  }
  document.querySelectorAll('#reviewFilters button').forEach(b => b.onclick = () => {
    filter = b.dataset.filter;
    selectedId = '';
    cleanupAudio();
    $('reviewDetail').innerHTML = '';
    renderReviewList();
  });
  function cleanupAudio() {
    const p = $('reviewAudio');
    if (p) { p.pause(); p.removeAttribute('src'); }
    if (reviewHls) { reviewHls.destroy(); reviewHls = null; }
  }
  function audioMarkup(x) {
    const piece = savedPiece(x);
    if (!piece) return '<div class="note small">这套题没有可确认对应的音频段落。请到原题来源核对；本站不会借用其他套音频冒充。</div>';
    return `<div class="note small">对应段落：${html(piece.label)}（同一段落含多题，不是单题剪辑）。外部音频可能因网络或浏览器限制无法播放。</div>` +
      '<audio id="reviewAudio" controls preload="none"></audio>' +
      `<div class="review-actions"><button id="replayClip">从段落开头重听</button>` +
      (piece.page ? `<a href="${html(piece.page)}" target="_blank" rel="noopener">打开音频来源页</a>` : '') +
      '</div><p class="small muted" id="reviewAudioStatus" aria-live="polite"></p>';
  }
  function openReview(id) {
    ensureData();
    const x = state.mistakes[id];
    if (!x) return;
    selectedId = id;
    cleanupAudio();
    const root = $('reviewDetail');
    const passage = x.type === 'reading' ? (x.passage
      ? `<details><summary>查看对应阅读原文</summary><div class="review-passage">${html(x.passage)}</div></details>`
      : '<div class="note small">原题数据没有可读取的阅读原文，请到原站核对；这里不会补写原文。</div>') : '';
    root.innerHTML = `<div class="review-card"><h3>${label(x.type)} · ${html(x.paper)} · 第 ${html(x.no)} 题</h3>` +
      `<p class="review-meta">${html(status(x))} · 首次做错：${html((x.firstWrong || '').slice(0, 10))}</p>` +
      (x.type === 'listening' ? audioMarkup(x) : passage) +
      `<p><strong>${html(x.stem)}</strong></p><div class="review-options">` +
      (x.options || []).map((opt, i) => `<button class="choice" data-review-choice="${String.fromCharCode(65 + i)}">${String.fromCharCode(65 + i)}. ${html(opt)}</button>`).join('') +
      `</div><label class="review-field">这次错在哪里？<select id="reasonSelect"><option value="">请选择错因</option>` +
      REASONS.map(r => `<option value="${html(r)}" ${x.reason === r ? 'selected' : ''}>${html(r)}</option>`).join('') +
      `</select></label><label class="review-field">补充线索（可选）<textarea id="reasonNote" placeholder="哪句没听清？哪个选项误导了你？">${html(x.reasonNote || '')}</textarea></label>` +
      '<div class="review-actions"><button class="primary" id="submitReview" disabled>提交复测并看解析</button><button id="backReview">返回错题列表</button></div>' +
      '<div id="reviewFeedback" class="review-feedback" aria-live="polite"></div></div>';
    $('reviewList').classList.add('hidden');
    root.classList.remove('hidden');
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    let choice = '';
    root.querySelectorAll('[data-review-choice]').forEach(b => b.onclick = () => {
      choice = b.dataset.reviewChoice;
      root.querySelectorAll('[data-review-choice]').forEach(t => t.classList.toggle('selected', t === b));
      $('submitReview').disabled = false;
    });
    $('reasonSelect').onchange = saveReason;
    $('reasonNote').onchange = saveReason;
    let noteTimer;
    $('reasonNote').oninput = () => { clearTimeout(noteTimer); noteTimer = setTimeout(saveReason, 350); };
    $('backReview').onclick = () => {
      cleanupAudio(); selectedId = ''; root.innerHTML = ''; $('reviewList').classList.remove('hidden');
      renderReviewList();
    };
    $('submitReview').onclick = () => submitReview(choice);
    if (x.type === 'listening' && savedPiece(x)) setupReviewAudio(x);
  }
  function saveReason() {
    const x = state.mistakes[selectedId];
    if (!x) return;
    x.reason = $('reasonSelect')?.value || '';
    x.reasonNote = $('reasonNote')?.value.trim() || '';
    persist();
  }
  function explanation(x) {
    const parts = Object.entries(x.explain || {}).map(([k, v]) =>
      `<p><b>${html(k)}：</b>${html(String(v))}</p>`).join('');
    return `<div class="answer"><b>正确答案：${html(x.answer)}</b> · ${html(x.answerText || '')}</div>` +
      (parts || '<p class="muted">原题数据没有提供解析，请到来源页核对。</p>');
  }
  function submitReview(choice) {
    const x = state.mistakes[selectedId];
    if (!x || !choice) return;
    saveReason();
    const right = choice === x.answer;
    x.reviewCount = (x.reviewCount || 0) + 1;
    x.lastReview = new Date().toISOString();
    x.lastReviewChoice = choice;
    if (right) {
      x.stage = Math.min(3, (x.stage || 0) + 1);
      x.mastered = x.stage >= 3;
      x.due = x.mastered ? null : addDays(x.stage === 1 ? 3 : 7);
    } else {
      x.stage = 0; x.mastered = false; x.due = addDays(1); x.lastWrong = x.lastReview;
      x.lastChoice = choice;
    }
    state.attempts.push({ id: x.id, type: x.type, paper: x.paper, no: x.no,
      choice, answer: x.answer, correct: right, review: true, date: today(), time: x.lastReview });
    const saved = persist();
    $('reviewFeedback').innerHTML = `<div class="note"><b>${right ? '这次答对了' : '这次仍需巩固'}</b> · ${html(status(x))}</div>` +
      explanation(x) + (saved ? '<p class="small muted">复测结果和错因已自动保存。</p>' : '<p class="small">保存失败，请导出备份。</p>');
    $('submitReview').disabled = true;
    $('submitReview').textContent = '本次已提交';
    document.querySelectorAll('#reviewDetail [data-review-choice]').forEach(b => {
      b.disabled = true;
      if (b.dataset.reviewChoice === x.answer) b.classList.add('good');
      else if (b.dataset.reviewChoice === choice) b.classList.add('bad');
    });
    renderReviewList();
  }
  function setupReviewAudio(x) {
    const piece = savedPiece(x);
    const player = $('reviewAudio');
    if (!piece || !player) return;
    const statusEl = $('reviewAudioStatus');
    player.addEventListener('timeupdate', () => {
      if (player.currentTime >= piece.end) { player.pause(); player.currentTime = piece.start; }
    });
    player.addEventListener('error', () => { statusEl.textContent = '音频无法播放，请打开来源页核对。'; });
    const attach = () => {
      if (player.canPlayType('application/vnd.apple.mpegurl')) { player.src = piece.url; return; }
      if (window.Hls && Hls.isSupported()) {
        reviewHls = new Hls({ enableWorker: false });
        reviewHls.loadSource(piece.url);
        reviewHls.attachMedia(player);
        reviewHls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) statusEl.textContent = '音频加载失败，请打开来源页核对。';
        });
      } else statusEl.textContent = '当前浏览器不支持该音频格式，请打开来源页。';
    };
    if (window.Hls || player.canPlayType('application/vnd.apple.mpegurl')) attach();
    else loadScript('https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js',
      err => err ? statusEl.textContent = '播放器加载失败，请打开来源页。' : attach());
    $('replayClip').onclick = () => {
      if (!player.currentSrc && !player.src && !reviewHls) { statusEl.textContent = '音频尚未准备好，请打开来源页。'; return; }
      const play = () => {
        try { player.currentTime = piece.start; } catch {}
        player.play().catch(() => { statusEl.textContent = '播放失败，请点击播放器播放键或打开来源页。'; });
      };
      if (player.readyState >= 1) play();
      else player.addEventListener('loadedmetadata', play, { once: true });
    };
  }
  $('importFile').onchange = async e => {
    await originalImport(e);
    ensureData();
    renderReviewList();
  };
  ensureData();
  renderReviewList();
})();


