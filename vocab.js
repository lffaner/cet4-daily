/* Daily new words and spaced review, layered over the existing saved record. */
(() => {
  const core = window.CET4VocabCore;
  const source = window.CET4_VOCAB;
  if (!core || !Array.isArray(source) || source.length < 1000) {
    $('wordFeedback').textContent = '扩展词库加载失败，仍可使用原有单词。请联网刷新后重试。';
    return;
  }
  const legacy = new Map(raw.map(row => [row[0].toLowerCase(), row]));
  const bank = source.filter(row => !legacy.has(row[0]));
  const lookup = new Map(bank.map(row => [row[0], row]));
  for (const [word, row] of legacy) lookup.set(word, [word, row[2], row[4], row[5], 0, row[1]]);
  const root = $('words');
  root.innerHTML = `<div class="panel vocab-panel">
    <div class="flex"><h2 class="grow">每日刷词</h2><span class="tag" id="vTotal"></span></div>
    <p class="small muted" id="vPlan"></p>
    <div class="vocab-tabs" role="group" aria-label="单词模式">
      <button type="button" data-v-mode="today">今日学习</button>
      <button type="button" data-v-mode="weak">还不会</button>
      <button type="button" data-v-mode="legacy">原有词</button>
    </div>
    <div class="bar"><div id="vBar"></div></div>
    <p class="small muted" id="vPosition"></p>
    <button type="button" class="card vocab-card" id="vCard" aria-label="翻开单词卡"></button>
    <div class="vocab-sound"><button type="button" id="vSpeak">🔊 发音</button><button type="button" id="vSlow">慢速</button></div>
    <div class="vocab-answers"><button type="button" class="primary" id="vKnown">认识</button><button type="button" id="vWeak">再记一次</button></div>
    <div class="vocab-move"><button type="button" id="vPrev">上一词</button><button type="button" id="vSkip">暂时跳过</button></div>
    <p class="small muted" id="vFeedback" role="status" aria-live="polite"></p>
    <button type="button" id="vMore" class="hidden">再学 25 个新词</button>
    <p class="small muted vocab-source">词表来自 <a href="https://github.com/exam-data/CETVocabulary" target="_blank" rel="noopener">CETVocabulary</a>，数据按 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a> 使用。例句部分由来源项目生成；此处不是官方词频或真题原句。</p>
  </div>`;
  const getDate = () => $('studyDate').value;
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch { $('vFeedback').textContent = '保存失败，请到学习记录页导出备份并检查浏览器存储空间。'; return false; }
  }
  function dayPlan() {
    const date = getDate();
    const fresh = !state.vocab?.days?.[date];
    const day = core.ensureDay(state, date, bank);
    if (fresh) persist();
    return day;
  }
  window.getVocabTask = () => {
    const info = core.stats(dayPlan());
    return info;
  };
  const modes = ['today', 'weak', 'legacy'];
  state.tasks ||= {};
  state.wordRounds ||= [];
  core.ensure(state, getDate());
  if (!modes.includes(state.vocab.ui.mode)) state.vocab.ui.mode = 'today';
  let flipped = false;
  let feedback = '';
  function weakWords() {
    return Object.entries(state.vocab.cards)
      .filter(([, card]) => card.status === 'weak')
      .sort((a, b) => String(a[1].due || '').localeCompare(String(b[1].due || '')))
      .map(([word]) => word);
  }
  function current() {
    const mode = state.vocab.ui.mode;
    if (mode === 'today') {
      const day = dayPlan();
      return { item: day.queue[day.cursor], index: day.cursor, total: day.queue.length };
    }
    const words = mode === 'weak' ? weakWords() : [...legacy.keys()];
    const index = Math.max(0, Math.min(words.length - 1, state.vocab.ui.positions[mode] || 0));
    return { item: words[index] ? { word: words[index], kind: mode } : null, index, total: words.length };
  }
  function checkCompletion() {
    const day = dayPlan();
    const s = core.stats(day);
    if (!s.newTotal || s.newDone < s.newTotal || s.reviewDone < s.reviewTotal || s.retryPending) return;
    const date = getDate();
    const tasks = state.tasks[date] || [false, false, false];
    tasks[0] = true; state.tasks[date] = tasks;
    if (!day.logged) {
      const choices = day.newIds.map(word => day.answers[`new:${word}`]);
      state.wordRounds.push({ date, mode: '每日刷词', total: s.newTotal + s.reviewTotal,
        reviewed: s.newDone + s.reviewDone, known: choices.filter(x => x === 'known').length,
        weak: choices.filter(x => x === 'weak').length, time: new Date().toISOString(), autoSaved: true });
      day.logged = true;
    }
    persist();
  }
  renderWord = function() {
    const day = dayPlan();
    const s = core.stats(day);
    const mode = state.vocab.ui.mode;
    const { item, index, total } = current();
    $('vTotal').textContent = `${bank.length} 个新词`; 
    $('vPlan').textContent = `今日新词 ${s.newDone}/${s.newTotal} · 到期复习 ${s.reviewDone}/${s.reviewTotal}` + (s.retryPending ? ` · 再记 ${s.retryPending}` : '');
    $('vBar').style.width = (day.queue.length ? (day.queue.length - s.remaining) / day.queue.length * 100 : 0) + '%';
    root.querySelectorAll('[data-v-mode]').forEach(button => button.classList.toggle('on', button.dataset.vMode === mode));
    $('vMore').classList.toggle('hidden', mode !== 'today' || s.remaining > 0 || s.newTotal === 0);
    $('vKnown').disabled = $('vWeak').disabled = $('vSpeak').disabled = $('vSlow').disabled = !item;
    $('vPrev').disabled = !item || index <= 0;
    $('vSkip').disabled = !item || total <= 1;
    if (!item) {
      $('vPosition').textContent = mode === 'today' ? '今日任务完成' : '没有符合条件的单词';
      $('vCard').innerHTML = mode === 'today'
        ? '<div class="vocab-empty"><strong>今天的词刷完了 ✓</strong><p>明天会分配下一批新词；到期旧词也会自动加入复习。</p></div>'
        : '<div class="vocab-empty"><strong>这里暂时没有单词</strong><p>继续学习，标为“再记一次”的词会出现在这里。</p></div>';
      $('vCard').disabled = true;
      return;
    }
    $('vCard').disabled = false;
    const row = lookup.get(item.word);
    const card = state.vocab.cards[item.word];
    const kind = item.kind === 'new' ? '新词' : item.kind === 'review' ? '到期复习' : item.kind === 'retry' ? '再练一遍' : item.kind === 'legacy' ? '原有词' : '还不会';
    $('vPosition').textContent = `${kind} · 第 ${index + 1}/${total} 张` + (card?.due ? ` · 下次复习 ${card.due}` : '');
    $('vCard').innerHTML = `<div class="word">${escapeHTML(item.word)}</div>` +
      (row?.[5] ? `<div class="ipa">${escapeHTML(row[5])}</div>` : '') +
      (flipped ? `<div class="answer"><strong>${escapeHTML(row?.[1] || '暂无释义')}</strong></div>` +
        (row?.[2] ? `<p>${escapeHTML(row[2])}</p>` : '') +
        (row?.[3] ? `<p class="muted">${escapeHTML(row[3])}</p>` : '') : '<p class="muted">先猜意思，轻点卡片翻开</p>');
    $('vFeedback').textContent = feedback;
  };
  function speak(rate) {
    const item = current().item;
    if (!item) return;
    if (!('speechSynthesis' in window)) { $('vFeedback').textContent = '当前浏览器不支持系统发音。'; return; }
    try {
      speechSynthesis.cancel();
      const speech = new SpeechSynthesisUtterance(item.word);
      speech.lang = 'en-US'; speech.rate = rate;
      const voices = speechSynthesis.getVoices();
      const voice = voices.find(v => v.lang === 'en-US') || voices.find(v => v.lang.startsWith('en'));
      if (voice) speech.voice = voice;
      speech.onerror = () => { $('vFeedback').textContent = '发音失败，请检查音量或系统语音设置。'; };
      speechSynthesis.speak(speech);
    } catch { $('vFeedback').textContent = '发音暂不可用。'; }
  }
  function mark(choice) {
    const { item, index } = current();
    if (!item) return;
    const date = getDate();
    core.answer(state, date, item, choice);
    state.dailyWordMarks ||= {};
    state.dailyWordMarks[date] ||= {};
    state.dailyWordMarks[date][item.word] = choice;
    if (item.kind === 'legacy') state.vocab.ui.positions.legacy = Math.min(index + 1, legacy.size - 1);
    if (item.kind === 'weak') state.vocab.ui.positions.weak = choice === 'weak' ? index + 1 : index;
    feedback = choice === 'weak' ? '已加入明日复习，并排到今天末尾再练一次' : '已保存；按 1、3、7 天安排复习';
    flipped = false;
    checkCompletion();
    persist(); renderWord(); renderToday();
  }
  $('vCard').onclick = () => { flipped = !flipped; renderWord(); };
  $('vSpeak').onclick = () => speak(0.95);
  $('vSlow').onclick = () => speak(0.72);
  $('vKnown').onclick = () => mark('known');
  $('vWeak').onclick = () => mark('weak');
  $('vPrev').onclick = () => {
    if (state.vocab.ui.mode === 'today') dayPlan().cursor = Math.max(0, dayPlan().cursor - 1);
    else { const mode = state.vocab.ui.mode; state.vocab.ui.positions[mode] = Math.max(0, (state.vocab.ui.positions[mode] || 0) - 1); }
    flipped = false; feedback = ''; persist(); renderWord();
  };
  $('vSkip').onclick = () => {
    if (state.vocab.ui.mode === 'today') {
      const day = dayPlan();
      day.cursor = core.pendingIndex(day, day.cursor + 1);
    } else {
      const mode = state.vocab.ui.mode;
      const size = mode === 'weak' ? weakWords().length : legacy.size;
      state.vocab.ui.positions[mode] = (state.vocab.ui.positions[mode] + 1) % size;
    }
    flipped = false; feedback = ''; persist(); renderWord();
  };
  root.querySelectorAll('[data-v-mode]').forEach(button => button.onclick = () => {
    state.vocab.ui.mode = button.dataset.vMode;
    flipped = false; feedback = ''; persist(); renderWord();
  });
  $('vMore').onclick = () => {
    const count = core.extendDay(state, getDate(), bank, 25);
    feedback = count ? `已加入 ${count} 个新词` : '词库已学完，可以继续复习旧词。';
    flipped = false; persist(); renderWord(); renderToday();
  };
  const oldRenderToday = renderToday;
  renderToday = function() {
    oldRenderToday();
    if (!root.classList.contains('hidden')) renderWord();
  };
  const oldImport = $('importFile').onchange;
  $('importFile').onchange = async event => {
    await oldImport(event);
    state.tasks ||= {};
    state.wordRounds ||= [];
    core.ensure(state, getDate());
    dayPlan(); renderWord(); renderToday();
  };
  dayPlan(); renderWord(); renderToday();
})();
