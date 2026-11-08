/* Persistent vocabulary scheduler. All additions live inside cet4-personal-v3. */
((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CET4VocabCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const addDays = (date, days) => {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
  };
  const key = item => `${item.kind}:${item.word}`;
  function ensure(state, date) {
    if (!state.vocab || typeof state.vocab !== 'object' || Array.isArray(state.vocab))
      state.vocab = { version: 1, cards: {}, days: {}, ui: { mode: 'today', positions: {} } };
    const v = state.vocab;
    if (!v.cards || typeof v.cards !== 'object') v.cards = {};
    if (!v.days || typeof v.days !== 'object') v.days = {};
    if (!v.ui || typeof v.ui !== 'object') v.ui = { mode: 'today', positions: {} };
    v.ui.positions ||= {};
    // Old known/weak marks remain untouched and become eligible for review.
    for (const [word, mark] of Object.entries(state.marks || {})) {
      if (!v.cards[word] && (mark === 'known' || mark === 'weak'))
        v.cards[word] = { status: mark, stage: mark === 'known' ? 3 : 0,
          due: mark === 'weak' ? date : null, legacy: true, attempts: 0 };
    }
    return v;
  }
  function ensureDay(state, date, bank, dailyTarget = 25) {
    const v = ensure(state, date);
    if (v.days[date]) return v.days[date];
    const pending = [];
    for (const prior of Object.keys(v.days).filter(d => d < date).sort())
      for (const word of v.days[prior].newIds || [])
        if (!v.cards[word] && !pending.includes(word)) pending.push(word);
    const newIds = pending.slice(0, dailyTarget);
    for (const row of bank) {
      const word = row[0];
      if (newIds.length >= dailyTarget) break;
      if (!v.cards[word] && !newIds.includes(word)) newIds.push(word);
    }
    const reviewIds = Object.entries(v.cards)
      .filter(([word, card]) => card.due && card.due <= date && !newIds.includes(word))
      .sort((a, b) => String(a[1].due).localeCompare(String(b[1].due)) || a[0].localeCompare(b[0]))
      .map(([word]) => word);
    const queue = reviewIds.map(word => ({ word, kind: 'review' }))
      .concat(newIds.map(word => ({ word, kind: 'new' })));
    return v.days[date] = { newIds, reviewIds, queue, answers: {}, cursor: 0, logged: false };
  }
  function stats(day) {
    const answers = day.answers || {};
    return {
      newDone: day.newIds.filter(word => answers[`new:${word}`]).length,
      newTotal: day.newIds.length,
      reviewDone: day.reviewIds.filter(word => answers[`review:${word}`]).length,
      reviewTotal: day.reviewIds.length,
      retryPending: day.queue.filter(item => item.kind === 'retry' && !answers[key(item)]).length,
      remaining: day.queue.filter(item => !answers[key(item)]).length
    };
  }
  function pendingIndex(day, from = 0) {
    for (let i = Math.max(0, from); i < day.queue.length; i++)
      if (!day.answers[key(day.queue[i])]) return i;
    for (let i = 0; i < Math.max(0, from); i++)
      if (!day.answers[key(day.queue[i])]) return i;
    return day.queue.length;
  }
  function answer(state, date, item, choice) {
    if (!['known', 'weak'].includes(choice)) throw new Error('Invalid answer');
    const v = ensure(state, date);
    const day = v.days[date];
    if (!day) throw new Error('Missing daily plan');
    const old = v.cards[item.word] || { stage: 0, attempts: 0 };
    let stage = old.stage || 0;
    let due;
    if (choice === 'weak') { stage = 0; due = addDays(date, 1); }
    else if (item.kind === 'new' || item.kind === 'legacy' || item.kind === 'retry') {
      stage = 0; due = addDays(date, 1);
    } else {
      stage = Math.min(stage + 1, 3);
      due = stage === 1 ? addDays(date, 3) : stage === 2 ? addDays(date, 7) : null;
    }
    v.cards[item.word] = { ...old, status: choice, stage, due, lastSeen: date,
      attempts: (old.attempts || 0) + 1 };
    state.marks ||= {};
    state.marks[item.word] = choice;
    if (item.kind !== 'legacy' && item.kind !== 'weak') {
      day.answers[key(item)] = choice;
      if (choice === 'weak' && item.kind !== 'retry' && !day.queue.some(x => x.word === item.word && x.kind === 'retry'))
        day.queue.push({ word: item.word, kind: 'retry' });
      day.cursor = pendingIndex(day, day.cursor + 1);
    }
    return v.cards[item.word];
  }
  function extendDay(state, date, bank, amount = 25) {
    const day = ensureDay(state, date, bank);
    const next = [];
    for (const row of bank) {
      if (next.length >= amount) break;
      const word = row[0];
      if (!state.vocab.cards[word] && !day.newIds.includes(word)) next.push(word);
    }
    day.newIds.push(...next);
    day.queue.push(...next.map(word => ({ word, kind: 'new' })));
    day.cursor = pendingIndex(day, day.cursor);
    day.logged = false;
    return next.length;
  }
  return { addDays, ensure, ensureDay, stats, pendingIndex, answer, extendDay, key };
});
