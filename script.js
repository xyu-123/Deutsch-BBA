// ========================================
// 0) 禁止表單自動提交（防 iPhone Enter 跳題）+ 初始設定
// ========================================
document.addEventListener('DOMContentLoaded', () => {
  const quizForm = document.getElementById('quiz-form');
  if (quizForm) quizForm.addEventListener('submit', e => e.preventDefault());

  // 所有按鈕明確標記為非 submit
  ['next','check','showAnswer','dontKnow'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.setAttribute('type','button');
  });

  // ⚠️ 不要在這裡隱藏 #check，讓出題時決定顯示狀態
});

// ========================================
// 1) iPhone / Safari：關閉預測、自動更正、大寫、拼字
// ========================================
function hardenInput(el) {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  el.autocomplete = 'off';
  el.autocapitalize = 'off';
  el.setAttribute('autocorrect', 'off');
  el.spellcheck = false;
  el.inputMode = 'text';
  el.enterKeyHint = 'done';
  if (!el.name || /^(email|username|name)$/i.test(el.name)) {
    el.name = 'ans_' + Math.random().toString(36).slice(2);
  }
  el.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') ev.preventDefault();
  });
}
function hardenInputsIn(container = document) {
  container.querySelectorAll('#inputs input, #inputs textarea').forEach(hardenInput);
}
document.addEventListener('DOMContentLoaded', () => {
  const box = document.getElementById('inputs');
  if (!box) return;
  hardenInputsIn(box);
  const mo = new MutationObserver(() => hardenInputsIn(box));
  mo.observe(box, { childList: true, subtree: true });
});

// ========================================
// 2) 狀態
// ========================================
let vocab = Array.isArray(window.vocabList) ? [...window.vocabList] : [];
let currentIndex = -1;
let currentErrors = [];
const SINGLE_INPUT_TYPES = new Set(['adjective','adverb','question','other','phrase']);

// ========================================
// 3) 正規化工具
// ========================================
function normalizeGerman(s) {
  if (!s && s !== '') return '';
  s = String(s).toLowerCase()
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/[\p{Z}\t\r\n\f]+/gu, ' ')
    .replace(/[\u00B7\u2027\u2219]/g, '')
    .replace(/\s+/g, ' ').trim()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/a:/g,'ae').replace(/o:/g,'oe').replace(/u:/g,'ue');
  return s;
}
function foldPhrase(s) { return normalizeGerman(s).replace(/[^a-z]/g, ''); }
function isBlankRequired(el) {
  if (!el) return true;
  const v = el.value != null ? String(el.value) : '';
  return normalizeGerman(v) === '';
}

// ========================================
// 4) 事件綁定
// ========================================
document.getElementById('next').addEventListener('click', nextWord);
document.getElementById('check').addEventListener('click', checkAnswer);
document.getElementById('showAnswer').addEventListener('click', showAnswer);
document.getElementById('dontKnow').addEventListener('click', dontKnow);

// ========================================
// 5) 課程篩選
// ========================================
function populateLessonCheckboxes() {
  const container = document.getElementById('lessonContainer');
  if (!container) return;
  const set = new Set();
  vocab.forEach(w => set.add((w.lesson !== undefined ? w.lesson : '')));
  container.innerHTML = '';
  Array.from(set).forEach(lesson => {
    const val = lesson || '';
    const labelText = lesson === '' ? '未分類' : lesson;
    const id = `lesson_${labelText.replace(/\s+/g,'_')}`;
    const wrapper = document.createElement('label');
    wrapper.style.display = 'inline-flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '6px';
    wrapper.style.padding = '4px 6px';
    wrapper.style.border = '1px solid #ddd';
    wrapper.style.borderRadius = '6px';
    wrapper.style.background = '#fff';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = val; cb.id = id; cb.name = 'lessonCheckbox';
    const span = document.createElement('span'); span.textContent = labelText;
    wrapper.appendChild(cb); wrapper.appendChild(span);
    container.appendChild(wrapper);
  });
}
populateLessonCheckboxes();

// ========================================
// 6) 出題
// ========================================
function nextWord() {
  const showBtn = document.getElementById('showAnswer');
  const dontBtn = document.getElementById('dontKnow');
  const checkBtn = document.getElementById('check');
  const nextBtn = document.getElementById('next');
  const feedback = document.getElementById('feedback');

  // 按鈕狀態
  showBtn.style.display = 'none';
  dontBtn.style.display = 'block';
  feedback.style.display = 'none';
  feedback.className = '';
  nextBtn.disabled = true;

  // ✅ 這裡顯示「檢查」按鈕（關鍵）
  if (checkBtn) {
    checkBtn.style.display = 'block';
    checkBtn.disabled = false;
    checkBtn.removeAttribute('hidden');
  }

  if (vocab.length === 0) return;

  // 篩選 pool（未勾選就用全部）
  const checked = Array.from(document.querySelectorAll('#lessonContainer input[type=checkbox]:checked')).map(ch => ch.value);
  const pool = checked.length ? vocab.filter(w => checked.includes((w.lesson || ''))) : vocab;

  if (pool.length === 0) {
    document.getElementById('translation').textContent = '（目前篩選沒有條目）';
    document.getElementById('inputs').style.display = 'none';
    return;
  }

  const chosen = pool[Math.floor(Math.random() * pool.length)];
  currentIndex = vocab.indexOf(chosen);

  // 題面
  const translationDiv = document.getElementById('translation');
  translationDiv.textContent = (chosen.type === 'number') ? String(chosen.number) : (chosen.chinese || '');

  // 動態輸入欄位
  const inputsDiv = document.getElementById('inputs');
  inputsDiv.innerHTML = '';

  let html = '';
  if (chosen.type === 'noun') {
    html = `
      <select id="genderInput" required>
        <option value="none">無性別</option>
        <option value="der">der (陽性)</option>
        <option value="das">das (中性)</option>
        <option value="die">die (陰性)</option>
      </select>
      <input type="text" id="deutschInput" placeholder="德文拼字${chosen.hint ? ' (提示：' + chosen.hint + ')' : ''}" required>
      <input type="text" id="pluralInput" placeholder="複數形${chosen.countable ? '' : ' (不可數，無需填寫)'}" ${chosen.countable ? 'required' : 'readonly'}>
    `;
  } else if (chosen.type === 'verb') {
    const forms = ['ich','du','er','wir','ihr','sie'];
    const hinttext = ['ich','du','er/es/sie','wir','ihr','sie/Sie'];
    const selected = [];
    const placeholderselected = [];
    while (selected.length < 2) {
      const idx = Math.floor(Math.random() * forms.length);
      if (!selected.includes(forms[idx])) {
        selected.push(forms[idx]);
        placeholderselected.push(hinttext[idx]);
      }
    }
    chosen.selectedForms = selected;
    html = `
      <input type="text" id="infinitivInput" placeholder="原形 (Infinitiv)${chosen.hint ? ' (提示：' + chosen.hint + ')' : ''}" required>
      <input type="text" id="${selected[0]}Input" placeholder="${placeholderselected[0]}" required>
      <input type="text" id="${selected[1]}Input" placeholder="${placeholderselected[1]}" required>
    `;
  } else if (chosen.type === 'country') {
    if (chosen.countable) {
      html += `
        <select id="numberInput" required>
          <option value="singular">單數</option>
          <option value="plural">複數</option>
        </select>
      `;
    }
    html += `<input type="text" id="deutschInput" placeholder="德文拼字${chosen.hint ? ' (提示：' + chosen.hint + ')' : ''}" required>`;
  } else if (chosen.type === 'phrase' || SINGLE_INPUT_TYPES.has(chosen.type)) {
    html = `<input type="text" id="deutschInput" placeholder="德文拼字${chosen.hint ? ' (提示：' + chosen.hint + ')' : ''}" required>`;
  } else if (chosen.type === 'number') {
    html = `<input type="text" id="deutschInput" placeholder="請輸入 ${chosen.number} 的德文拼字" required>`;
  }

  inputsDiv.insertAdjacentHTML('beforeend', html);
  inputsDiv.style.display = 'block';
  hardenInputsIn(inputsDiv);

  setTimeout(() => {
    const firstInput = document.querySelector('#inputs input, #inputs select');
    if (firstInput) firstInput.focus();
  }, 0);
}

// ========================================
// 7) 檢查答案
// ========================================
function checkAnswer() {
  const word = vocab[currentIndex];
  const feedback = document.getElementById('feedback');
  const showBtn = document.getElementById('showAnswer');

  if (!word) return;

  feedback.style.display = 'block';
  feedback.className = '';
  currentErrors = [];

  // 必填檢查
  const missing = [];
  if (word.type === 'noun') {
    const di = document.getElementById('deutschInput');
    const pi = document.getElementById('pluralInput');
    const gi = document.getElementById('genderInput');
    if (isBlankRequired(di)) missing.push('德文拼字');
    if (word.countable && isBlankRequired(pi)) missing.push('複數形');
    if ((word.gender || 'none') !== 'none' && (!gi || gi.value === '')) missing.push('性別');
  } else if (word.type === 'verb') {
    const ii = document.getElementById('infinitivInput');
    if (isBlankRequired(ii)) missing.push('原形(Infinitiv)');
    if (Array.isArray(word.selectedForms)) {
      for (const f of word.selectedForms) {
        const el = document.getElementById(f + 'Input');
        if (isBlankRequired(el)) missing.push(f);
      }
    }
  } else if (word.type === 'country') {
    const di = document.getElementById('deutschInput');
    if (isBlankRequired(di)) missing.push('德文拼字');
    if (word.countable) {
      const ni = document.getElementById('numberInput');
      if (!ni || (ni.value !== 'singular' && ni.value !== 'plural')) missing.push('單/複數');
    }
  } else if (word.type === 'number' || word.type === 'phrase' || SINGLE_INPUT_TYPES.has(word.type)) {
    const di = document.getElementById('deutschInput');
    if (isBlankRequired(di)) missing.push('德文拼字');
  }

  if (missing.length > 0) {
    feedback.textContent = '請先填完：' + missing.join('、');
    feedback.className = 'incorrect';
    showBtn.style.display = 'none';
    return;
  }

  // 比對
  if (word.type === 'noun') {
    const genderInput  = (document.getElementById('genderInput') || {}).value || 'none';
    const deutschInput = normalizeGerman(document.getElementById('deutschInput').value.trim());
    const pluralInput  = normalizeGerman((document.getElementById('pluralInput') || { value: '' }).value.trim());

    const correctGender  = word.gender || 'none';
    const correctDeutsch = normalizeGerman(word.deutsch || '');
    const correctPlural  = normalizeGerman(word.plural || '');
    const correctPluralAlt = normalizeGerman(word.Pl || '');

    if (correctGender !== 'none' && genderInput !== correctGender)
      currentErrors.push(`性別：${correctGender}`);
    if (deutschInput !== correctDeutsch)
      currentErrors.push(`德文：${word.deutsch}`);
    if (word.countable) {
      const okPlural = (pluralInput === correctPlural) || (word.Pl !== undefined && pluralInput === correctPluralAlt);
      if (!okPlural) {
        const pluralAnswers = [word.plural];
        if (word.Pl) pluralAnswers.push(word.Pl);
        currentErrors.push(`複數：${pluralAnswers.join(' 或 ')}`);
      }
    }
  } else if (word.type === 'verb') {
    const infinitivInput = normalizeGerman(document.getElementById('infinitivInput').value.trim());
    const correctInfinitiv = normalizeGerman(word.infinitiv || '');
    if (infinitivInput !== correctInfinitiv) currentErrors.push(`原形：${word.infinitiv}`);
    for (const form of word.selectedForms) {
      const input  = normalizeGerman(document.getElementById(form + 'Input').value.trim());
      const correct = normalizeGerman(word[form] || '');
      if (input !== correct) currentErrors.push(`${form}：${word[form]}`);
    }
  } else if (word.type === 'country') {
    const deutschInput = normalizeGerman(document.getElementById('deutschInput').value.trim());
    const correctDeutsch = normalizeGerman(word.deutsch || '');
    if (deutschInput !== correctDeutsch) currentErrors.push(`德文：${word.deutsch}`);
    if (word.countable) {
      const numberSelected = (document.getElementById('numberInput') || {}).value;
      const should = word.plural ? 'plural' : 'singular';
      if (numberSelected !== should) currentErrors.push(`單複數：${word.plural ? '複數' : '單數'}`);
    }
  } else if (word.type === 'phrase') {
    const input  = foldPhrase(document.getElementById('deutschInput').value);
    const answer = foldPhrase(word.deutsch);
    if (input !== answer) currentErrors.push(`德文：${word.deutsch}`);
  } else if (SINGLE_INPUT_TYPES.has(word.type) || word.type === 'number') {
    const deutschInput = normalizeGerman(document.getElementById('deutschInput').value.trim());
    const correctDeutsch = normalizeGerman(word.deutsch || '');
    if (deutschInput !== correctDeutsch) {
      if (word.type === 'number')
        currentErrors.push(`數字 ${word.number} 的正確德文：${word.deutsch}`);
      else
        currentErrors.push(`德文：${word.deutsch}`);
    }
  }

  // 結果
  if (currentErrors.length === 0) {
    feedback.textContent = '正確';
    feedback.className = 'correct';
    document.getElementById('next').disabled = false;
    showBtn.style.display = 'none';
  } else {
    feedback.textContent = '錯誤';
    feedback.className = 'incorrect';
    showBtn.style.display = 'block';
    document.getElementById('next').disabled = true;
  }
}

// ========================================
// 8) 顯示答案 / 不知道
// ========================================
function buildCorrectAnswers(word) {
  const list = [];
  if (!word) return list;
  if (word.type === 'noun') {
    const g = word.gender || 'none';
    const gLabel = {none: '無性別', der: 'der (陽性)', das: 'das (中性)', die: 'die (陰性)'}[g] || g;
    if (g !== 'none') list.push(`性別：${gLabel}`);
    if (word.deutsch) list.push(`德文：${word.deutsch}`);
    if (word.countable) {
      const pluralAns = [];
      if (word.plural) pluralAns.push(word.plural);
      if (word.Pl) pluralAns.push(word.Pl);
      if (pluralAns.length) list.push(`複數：${pluralAns.join(' 或 ')}`);
    }
  } else if (word.type === 'verb') {
    if (word.infinitiv) list.push(`原形：${word.infinitiv}`);
    for (const f of ['ich','du','er','wir','ihr','sie']) if (word[f]) list.push(`${f}：${word[f]}`);
  } else if (word.type === 'country') {
    if (word.deutsch) list.push(`德文：${word.deutsch}`);
    if (word.countable) list.push(`單複數：${word.plural ? '複數' : '單數'}`);
  } else if (word.type === 'number') {
    if (word.deutsch) list.push(`數字 ${word.number} 的正確德文：${word.deutsch}`);
  } else {
    if (word.deutsch) list.push(`德文：${word.deutsch}`);
  }
  return list;
}
function showAnswer() {
  const feedback = document.getElementById('feedback');
  const items = buildCorrectAnswers(vocab[currentIndex]);
  feedback.style.display = 'block';
  feedback.className = 'incorrect';
  feedback.innerHTML = `<ul><li><strong>正確答案：</strong></li>${items.map(it=>`<li>${it}</li>`).join('')}</ul>`;
  document.getElementById('next').disabled = false;
  document.getElementById('showAnswer').style.display = 'none';
}
function dontKnow() {
  showAnswer();
  document.getElementById('dontKnow').style.display = 'none';
}

// ========================================
// 9) 啟動
// ========================================
nextWord();
