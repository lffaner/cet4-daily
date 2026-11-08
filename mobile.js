/* Phone-first navigation and resumable practice. Existing cet4-personal-v3 data stays in place. */
(() => {
  const step = type => type === 'listening' ? 3 : 2;
  const title = { today: '今日', words: '单词', listening: '听力', reading: '阅读', review: '错题' };
  const icon = { today: '⌂', words: 'Aa', listening: '♫', reading: '▤', review: '↻' };
  const toast = document.createElement('div');
  toast.className = 'app-toast'; toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite');
  document.body.append(toast);
  let toastTimer;
  function feedback(message) {
    toast.textContent = message; toast.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 1900);
  }
  function chinaToday() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const get = key => parts.find(p => p.type === key).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch { feedback('保存失败，请到记录页导出备份'); return false; }
  }
  state.studyProgress ||= {};
  state.studyUi ||= {};
  state.dailyWordMarks ||= {};
  state.autoWordDays ||= {};
  const progress = (type, paper) => {
    state.studyProgress[type] ||= {};
    return state.studyProgress[type][paper] ||= { offset: 0, choices: {} };
  };
  function syncDate() {
    const next = chinaToday();
    if ($('studyDate').value !== next) { $('studyDate').value = next; renderToday(); if (document.querySelector('#review:not(.hidden)')) renderReviewListSafe(); }
  }
  function renderReviewListSafe() { document.querySelector('#reviewFilters button.on')?.click(); }

  document.querySelectorAll('#nav button').forEach(b => {
    if (title[b.dataset.tab]) { b.textContent = title[b.dataset.tab]; b.dataset.icon = icon[b.dataset.tab]; }
  });
  const home = $('today');
  home.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  const homePanel = document.createElement('div');
  homePanel.className = 'panel';
  home.insertBefore(homePanel, home.firstChild);
  const oldRenderToday = renderToday;
  renderToday = function() {
    oldRenderToday();
    const d = $('studyDate').value;
    $('daysLeft').textContent = Math.max(0, Math.round((Date.UTC(2026, 11, 12) - Date.parse(d + 'T00:00:00Z')) / 86400000));
    const done = state.tasks[d] || [false, false, false];
    const due = Object.values(state.mistakes || {}).filter(x => x && !x.mastered && x.due && x.due <= d).length;
    const last = state.studyUi.lastTab;
    const resume = ['words', 'listening', 'reading', 'review'].includes(last) ? last : (due ? 'review' : 'words');
    const labels = [['单词', '复习 5 个词', 'words'], ['听力', '完成一组真题', 'listening'], ['阅读', '完成一组真题', 'reading']];
    homePanel.innerHTML = `<div class="home-date">${escapeHTML(d)} · 北京时间 · 距考试 ${$('daysLeft').textContent} 天</div>` +
      `<h2 class="home-title">今天学一点</h2><p class="muted small">已完成 ${done.filter(Boolean).length}/3 项${due ? ` · ${due} 道错题待复习` : ''}</p>` +
      `<button class="home-continue" data-go="${resume}"><span>继续${resume === 'review' ? '错题复习' : resume === 'words' ? '背单词' : resume === 'listening' ? '听力练习' : '阅读练习'}</span><span>›</span></button>` +
      labels.map(([name, hint, tab], i) => `<button class="home-task ${done[i] ? 'done' : ''}" data-go="${tab}"><span><strong>${name}</strong><span>${hint}</span></span><span class="status">${done[i] ? '已完成 ✓' : '开始 ›'}</span></button>`).join('') +
      (due ? `<button class="home-task" data-go="review"><span><strong>待复习错题</strong><span>${due} 道待测</span></span><span class="status">开始 ›</span></button>` : '') +
      '<p class="small muted"><button data-go="history">学习记录与备份</button> <button data-go="help">使用说明</button></p>';
    homePanel.querySelectorAll('[data-go]').forEach(b => b.onclick = () => showTab(b.dataset.go));
  };
  $('studyDate').value = chinaToday();

  const oldShowTab = showTab;
  showTab = function(id) {
    oldShowTab(id);
    if (id !== 'today') { state.studyUi.lastTab = id; persist(); }
    if ((id === 'listening' || id === 'reading') && indexLoaded && !active[id]) loadExam(id);
    if (id === 'listening' && active.listening && $('audioArea').classList.contains('hidden') && getAudio($('listenPaper').value)) setupAudio($('listenPaper').value);
    if (id === 'today') renderToday();
  };
  const oldRenderQuiz = renderQuiz;
  renderQuiz = function(type) {
    oldRenderQuiz(type);
    const root = $(type === 'listening' ? 'listenQuiz' : 'readQuiz');
    const paper = $(type === 'listening' ? 'listenPaper' : 'readPaper').value;
    if (!paper || !root.querySelector('.quiz-item')) return;
    const session = progress(type, paper);
    root.querySelectorAll('.quiz-item').forEach(item => {
      const prior = session.choices[item.dataset.no];
      if (prior) item.querySelector(`[data-opt="${prior}"]`)?.click();
      item.querySelectorAll('[data-opt]').forEach(button => button.addEventListener('click', () => {
        session.choices[item.dataset.no] = button.dataset.opt;
        if (persist()) { const note = root.querySelector('#quizResult'); if (note) note.textContent = '作答已暂存，核对后自动记入成绩。'; }
      }));
    });
    root.querySelector('#checkQuiz')?.addEventListener('click', () => {
      if (root.dataset.autoSaved !== 'yes') return;
      if (/保存失败/.test($(type === 'listening' ? 'listenSaved' : 'readSaved').textContent)) return;
      root.querySelectorAll('.quiz-item').forEach(item => delete session.choices[item.dataset.no]);
      session.offset = Math.min(offsets[type] + step(type), type === 'listening' ? 25 : 10);
      const i = type === 'listening' ? 1 : 2;
      const day = $('studyDate').value;
      const tasks = state.tasks[day] || [false, false, false]; tasks[i] = true; state.tasks[day] = tasks;
      persist(); renderToday(); feedback('已核对并保存，错题已加入复习');
    });
    if (type === 'reading') ensureReadingSwitch();
  };
  const oldNext = next;
  next = function(type) {
    const before = offsets[type];
    oldNext(type);
    if (offsets[type] !== before) {
      const paper = $(type === 'listening' ? 'listenPaper' : 'readPaper').value;
      progress(type, paper).offset = offsets[type]; persist();
      if (type === 'reading') setReadingView('questions');
    }
  };
  loadExam = function(type) {
    const select = $(type === 'listening' ? 'listenPaper' : 'readPaper');
    const paper = select.value;
    if (!paper) { feedback('题库尚未加载，请点重试'); return; }
    state.studyUi[type + 'Paper'] = paper; persist();
    const status = $(type === 'listening' ? 'listenStatus' : 'readStatus');
    status.textContent = '正在加载试卷…';
    fetchPaper(paper, (err, data) => {
      if (err) { status.textContent = '加载失败，请检查网络后重试。'; showRetry(type); return; }
      active[type] = data;
      offsets[type] = Math.max(0, Math.min(+progress(type, paper).offset || 0, type === 'listening' ? 25 : 10));
      status.textContent = `${data.label} ${data.set} · 已恢复到第 ${offsets[type] + 1} 题`;
      if (type === 'listening') setupAudio(paper);
      renderQuiz(type);
      if (type === 'reading') setReadingView('questions');
    });
  };
  function showRetry(type) {
    const id = type === 'listening' ? 'retryListening' : 'retryReading';
    let button = $(id);
    if (!button) { button = document.createElement('button'); button.id = id; button.className = 'retry-inline'; button.textContent = '重试加载'; $(type === 'listening' ? 'listenStatus' : 'readStatus').after(button); }
    button.onclick = () => { button.remove(); if (!indexLoaded) initPapers(); else loadExam(type); };
  }
  document.querySelectorAll('.paperSelect').forEach(sel => {
    sel.addEventListener('change', () => loadExam(sel.id === 'listenPaper' ? 'listening' : 'reading'));
    new MutationObserver(() => {
      if (!sel.options.length) return;
      const type = sel.id === 'listenPaper' ? 'listening' : 'reading';
      if (state.studyUi[type + 'Paper'] && [...sel.options].some(o => o.value === state.studyUi[type + 'Paper'])) sel.value = state.studyUi[type + 'Paper'];
      if (!document.getElementById(type).classList.contains('hidden') && !active[type]) loadExam(type);
    }).observe(sel, { childList: true });
  });
  const indexStatus = new MutationObserver(() => {
    if (!indexLoaded && /无法加载|失败/.test($('listenStatus').textContent)) showRetry('listening');
    if (!indexLoaded && /无法加载|失败/.test($('readStatus').textContent)) showRetry('reading');
  });
  indexStatus.observe($('listenStatus'), { childList: true }); indexStatus.observe($('readStatus'), { childList: true });
  function ensureReadingSwitch() {
    if ($('readingSwitch')) return;
    const bar = document.createElement('div'); bar.id = 'readingSwitch'; bar.className = 'reading-switch';
    bar.innerHTML = '<button type="button" data-reading-view="questions">题目</button><button type="button" data-reading-view="passage">阅读原文</button>';
    $('readPassage').before(bar);
    bar.querySelectorAll('button').forEach(b => b.onclick = () => setReadingView(b.dataset.readingView));
    setReadingView('questions');
  }
  function setReadingView(view) {
    $('reading').dataset.view = view;
    $('readingSwitch')?.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.readingView === view));
    if (view === 'passage') $('readPassage').querySelector('details')?.setAttribute('open', '');
  }
  const oldMark = mark;
  if (['review', 'priority', 'extra', 'weak'].includes(state.studyUi.wordMode)) $('wordMode').value = state.studyUi.wordMode;
  wIndex = Math.max(0, +state.studyUi.wordIndex || 0);
  renderWord();
  const saveWordPosition = () => {
    state.studyUi.wordMode = $('wordMode').value;
    state.studyUi.wordIndex = wIndex;
    persist();
  };
  $('wordMode').addEventListener('change', saveWordPosition);
  $('prevWord').addEventListener('click', saveWordPosition);
  $('nextWord').addEventListener('click', saveWordPosition);
  mark = function(value) {
    const word = pool()[wIndex]?.[0];
    const mode = $('wordMode').value;
    const before = wIndex;
    oldMark(value);
    if (!word) return;
    const day = $('studyDate').value;
    state.dailyWordMarks[day] ||= {};
    state.dailyWordMarks[day][word] = value;
    const count = Object.keys(state.dailyWordMarks[day]).length;
    if (count >= 5 && !state.autoWordDays[day]) {
      const values = Object.values(state.dailyWordMarks[day]);
      state.wordRounds.push({ date: day, mode, total: 5, reviewed: 5, known: values.filter(v => v === 'known').length, weak: values.filter(v => v === 'weak').length, time: new Date().toISOString(), autoSaved: true });
      state.autoWordDays[day] = true;
      const tasks = state.tasks[day] || [false, false, false]; tasks[0] = true; state.tasks[day] = tasks;
      feedback('已复习 5 个词，今日单词任务完成');
    } else feedback('已标记并保存');
    persist(); renderToday();
    const length = pool().length;
    if (length) {
      wIndex = mode === 'weak' && value === 'known' ? Math.min(before, length - 1) : Math.min(before + 1, length - 1);
      flipped = false; renderWord();
    }
    saveWordPosition();
  };
  $('wordSummary').textContent = '标记后自动保存，并进入下一张；满 5 个词计入今日任务。';
  $('wordCard').setAttribute('aria-label', '点击翻卡查看释义');
  $('wordFeedback').setAttribute('role', 'status');
  $('audioPlayer').addEventListener('error', () => { $('audioHint').textContent = '音频播放失败，请重试或打开音频来源页。'; });
  $('audioPlayer').setAttribute('playsinline', '');
  renderToday();
  setInterval(syncDate, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncDate(); });
  window.addEventListener('pageshow', syncDate);
})();
