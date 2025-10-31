/* ==========================================================================
 *  Quiz App (Stable & Clean Single File) + TTS (de-DE)
 *  - iOS/Safari proof: block Enter/NumpadEnter, disable autocorrect/capitalize
 *  - Token-locked nextWord()
 *  - MutationObserver-safe with de-dup (dataset.hardened)
 *  - TTS: German voice pick, autoplay toggle, speak button
 *  - All bindings after DOMContentLoaded; null-safe; no global leaks
 * ========================================================================== */
(() => {
  'use strict';

  // -----------------------------
  // State
  // -----------------------------
  let vocab = Array.isArray(window.vocabList) ? [...window.vocabList] : [];
  let currentIndex = -1;
  let correctConfirmed = false;
  let currentErrors = [];
  let advanceToken = 0; // 換題令牌

  const SINGLE_INPUT_TYPES = new Set(['adjective', 'adverb', 'question', 'other']);

  // -----------------------------
  // Utils
  // -----------------------------
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  function normalizeGerman(s) {
    if (!s && s !== '') return '';
    s = String(s).toLowerCase();
    s = s.normalize('NFKC');
    s = s.replace(/\p{Cf}/gu, '');
    s = s.replace(/[\p{Z}\t\r\n\f]+/gu, ' ');
    s = s.replace(/[\u00B7\u2027\u2219]/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
    s = s.replace(/a:/g, 'ae').replace(/o:/g, 'oe').replace(/u:/g, 'ue');
    return s;
  }

  function foldPhrase(s) {
    return normalizeGerman(s).replace(/[^a-z]/g, '');
  }

  function isBlankRequired(el) {
    if (!el) return true;
    const v = el.value != null ? String(el.value) : '';
    return normalizeGerman(v) === '';
  }

  function saveVocab() {
    try { localStorage.setItem('vocab', JSON.stringify(vocab)); } catch {}
  }

  // -----------------------------
  // TTS（德文發音）模組
  // -----------------------------
  const TTS = { enabled: true, voice: null, rate: 1.0, pitch: 1.0, ready: false };

  function pickGermanVoice() {
    const synth = window.speechSynthesis;
    if (!synth) return null;
    const voices = synth.getVoices?.() || [];
    if (!voices.length) return null;
    const byLang = l => voices.find(v => v.lang?.toLowerCase() === l);
    return (
      byLang('de-de') ||
      byLang('de-at') ||
      byLang('de-ch') ||
      voices.find(v => /^de(\-|_)/i.test(v.lang)) ||
      null
    );
  }

  function initTTS() {
    if (!('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    const ensure = () => {
      const v = pickGermanVoice();
      if (v) { TTS.voice = v; TTS.ready = true; return true; }
      return false;
    };
    if (!ensure()) {
      const onVoices = () => { if (ensure()) synth.removeEventListener('voiceschanged', onVoices); };
      synth.addEventListener('voiceschanged', onVoices);
      synth.getVoices?.();
    }
  }

  function speakDE(text, opts = {}) {
  const force = opts.force === true;
  if ((!TTS.enabled && !force) || !text) return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  try { synth.cancel(); } catch {}
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  if (TTS.voice) u.voice = TTS.voice;
  u.rate = TTS.rate;
  u.pitch = TTS.pitch;
  synth.speak(u);
}

  function textForSpeak(word) {
    if (!word) return '';
    if (word.type === 'noun') {
      const art = (word.gender === 'der' || word.gender === 'die' || word.gender === 'das') ? word.gender : '';
      return [art, word.deutsch].filter(Boolean).join(' ');
    }
    if (word.type === 'verb') return word.infinitiv || word.deutsch || '';
    if (word.type === 'number') return word.deutsch || String(word.number);
    return word.deutsch || '';
  }

  // -----------------------------
  // Input Hardening (iOS/Safari)
  // -----------------------------
  function hardenInput(el) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    if (el.dataset.hardened === '1') return; // 去重
    el.dataset.hardened = '1';

    el.autocomplete = 'off';
    el.autocapitalize = 'off';
    el.setAttribute('autocorrect', 'off');
    el.spellcheck = false;
    el.inputMode = 'text';
    el.enterKeyHint = 'done';

    // 避免被 Safari 當成特殊欄位
    if (!el.name || /^(email|username|name)$/i.test(el.name)) {
      el.name = 'ans_' + Math.random().toString(36).slice(2);
    }

    // 阻止 Enter / NumpadEnter 造成預設提交或跳題
    el.addEventListener('keydown', ev => {
      if ((ev.key === 'Enter' || ev.key === 'NumpadEnter') && !ev.ctrlKey && !ev.metaKey) {
        ev.preventDefault();
      }
    }, { passive: false });
  }

  function hardenInputsIn(container = document) {
    container.querySelectorAll('#inputs input, #inputs textarea').forEach(hardenInput);
  }

  // -----------------------------
  // Lesson Checkboxes
  // -----------------------------
  function populateLessonCheckboxes() {
    const container = $('#lessonContainer');
    if (!container) return;
    const set = new Set();
    vocab.forEach(w => set.add((w.lesson !== undefined ? w.lesson : '')));
    container.innerHTML = '';
    Array.from(set).forEach(lesson => {
      const val = lesson || '';
      const labelText = lesson === '' ? '未分類' : lesson;
      const wrapper = document.createElement('label');
      Object.assign(wrapper.style, {
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '4px 6px', border: '1px solid #ddd', borderRadius: '6px', background: '#fff'
      });
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = val; cb.name = 'lessonCheckbox';
      const span = document.createElement('span'); span.textContent = labelText;
      wrapper.append(cb, span);
      container.appendChild(wrapper);
    });
  }

  // -----------------------------
  // Token-locked Next
  // -----------------------------
  function safeNext() {
    advanceToken += 1;
    nextWord(advanceToken);
  }

  // -----------------------------
  // Build/Show Answers
  // -----------------------------
  function buildCorrectAnswers(word) {
    const list = [];
    if (!word) return list;

    if (word.type === 'noun') {
      const g = word.gender || 'none';
      const gLabel = { none: '無性別', der: 'der (陽性)', das: 'das (中性)', die: 'die (陰性)' }[g] || g;
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
      for (const f of ['ich','du','er','wir','ihr','sie']) {
        if (word[f]) list.push(`${f}：${word[f]}`);
      }
    } else if (word.type === 'country') {
      if (word.deutsch) list.push(`德文：${word.deutsch}`);
      if (word.countable) list.push(`單複數：${word.plural ? '複數' : '單數'}`);
    } else if (word.type === 'phrase') {
      if (word.deutsch) list.push(`德文：${word.deutsch}`);
    } else if (word.type === 'number') {
      if (word.deutsch) list.push(`數字 ${word.number} 的正確德文：${word.deutsch}`);
    } else {
      if (word.deutsch) list.push(`德文：${word.deutsch}`);
    }
    return list;
  }

  function showAnswer() {
    const feedback = $('#feedback');
    const nextBtn = $('#next');
    const showBtn = $('#showAnswer');
    if (!feedback || !nextBtn || !showBtn) return;

    feedback.style.display = 'block';
    if (currentErrors.length === 0) {
      feedback.innerHTML = '<ul><li><strong>正確答案：</strong></li><li><em>無需顯示，您已答對或尚未作答。</em></li></ul>';
    } else {
      const items = currentErrors.map(item => `<li>${item}</li>`).join('');
      feedback.innerHTML = `<ul><li><strong>正確答案：</strong></li>${items}</ul>`;
    }
    feedback.className = 'incorrect';
    nextBtn.disabled = false;
    showBtn.style.display = 'none';

    // 顯示答案後也發音（方便對照）
    const wordForTTS2 = vocab[currentIndex];
    speakDE(textForSpeak(wordForTTS2));
  }

  function dontKnow() {
    const word = vocab[currentIndex];
    currentErrors = buildCorrectAnswers(word);
    showAnswer();
    const dkBtn = $('#dontKnow');
    if (dkBtn) dkBtn.style.display = 'none';
  }

  // -----------------------------
  // Enter behavior in #inputs
  // -----------------------------
  function enableEnterToCheck() {
    const container = $('#inputs');
    if (!container) return;

    container.onkeydown = null;
    container.onkeyup = null;

    container.onkeyup = function (e) {
      if ((e.key !== 'Enter' && e.key !== 'NumpadEnter') || e.isComposing) return;
      e.preventDefault();

      const feedback = $('#feedback');
      const nextBtn = $('#next');
      if (!feedback || !nextBtn) return;

      if (feedback.classList.contains('correct')) {
        if (!correctConfirmed) {
          correctConfirmed = true;
          feedback.textContent = '正確！（再按 Enter 進入下一題）';
          nextBtn.disabled = false;
          return;
        } else {
          correctConfirmed = false;
          safeNext();
          return;
        }
      }
      checkAnswer();
    };
  }

  // -----------------------------
  // nextWord (token-protected)
  // -----------------------------
  function nextWord(token) {
    if (token !== advanceToken) return; // 無令牌不換題

    correctConfirmed = false;
    const showBtn = $('#showAnswer');
    if (showBtn) showBtn.style.display = 'none';
    if (vocab.length === 0) return;

    const nextBtn = $('#next');
    if (nextBtn) nextBtn.disabled = true;

    // 依課程勾選篩選；未勾選時排除 Numbers 題
    const checked = $$(`#lessonContainer input[type=checkbox]:checked`).map(ch => ch.value);
    let pool = (checked.length === 0)
      ? vocab.filter(w => (w.lesson || '') !== 'Numbers')
      : vocab.filter(w => checked.includes((w.lesson || '')));
    if (pool.length === 0) pool = vocab.filter(w => (w.lesson || '') !== 'Numbers');

    const chosen = pool[Math.floor(Math.random() * pool.length)];
    currentIndex = vocab.indexOf(chosen);

    const translationDiv = $('#translation');
    if (translationDiv) {
      translationDiv.textContent = (chosen.type === 'number') ? String(chosen.number) : (chosen.chinese || '');
    }

    // 重建輸入區
    const inputsDiv = $('#inputs');
    if (!inputsDiv) return;
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
    } else {
      html = `<input type="text" id="deutschInput" placeholder="答案" required>`;
    }

    inputsDiv.insertAdjacentHTML('beforeend', html);
    hardenInputsIn(inputsDiv);

    // 聚焦第一欄
    setTimeout(() => {
      const firstInput = document.querySelector('#inputs input, #inputs select');
      if (firstInput) firstInput.focus();
    }, 0);

    enableEnterToCheck();

    const checkBtn = $('#check');
    const dkBtn = $('#dontKnow');
    const feedback = $('#feedback');
    if ($('#inputs')) $('#inputs').style.display = 'block';
    if (checkBtn) checkBtn.style.display = 'block';
    if (dkBtn) dkBtn.style.display = 'block';
    if (feedback) {
      feedback.style.display = 'none';
      feedback.className = '';
    }

    // 出題後自動發音
    const wordForTTS = vocab[currentIndex];
    speakDE(textForSpeak(wordForTTS));
  }

  // -----------------------------
  // checkAnswer
  // -----------------------------
  function checkAnswer() {
    const word = vocab[currentIndex];
    const feedback = $('#feedback');
    const showBtn = $('#showAnswer');
    const nextBtn = $('#next');

    if (!feedback || !showBtn || !nextBtn) return;

    if (!word) {
      feedback.textContent = '（無題目）';
      feedback.className = 'incorrect';
      feedback.style.display = 'block';
      showBtn.style.display = 'none';
      return;
    }

    feedback.style.display = 'block';
    currentErrors = [];
    const missing = [];

    // 必填檢查
    if (word.type === 'noun') {
      const di = $('#deutschInput');
      const pi = $('#pluralInput');
      const gi = $('#genderInput');
      if (isBlankRequired(di)) missing.push('德文拼字');
      if (word.countable && isBlankRequired(pi)) missing.push('複數形');
      if ((word.gender || 'none') !== 'none' && (!gi || gi.value === '')) missing.push('性別');
    } else if (word.type === 'verb') {
      const ii = $('#infinitivInput');
      if (isBlankRequired(ii)) missing.push('原形(Infinitiv)');
      if (Array.isArray(word.selectedForms)) {
        for (const f of word.selectedForms) {
          const el = $('#' + f + 'Input');
          if (isBlankRequired(el)) missing.push(f);
        }
      }
    } else if (word.type === 'country') {
      const di = $('#deutschInput');
      if (isBlankRequired(di)) missing.push('德文拼字');
      if (word.countable) {
        const ni = $('#numberInput');
        if (!ni || (ni.value !== 'singular' && ni.value !== 'plural')) missing.push('單/複數');
      }
    } else if (word.type === 'number' || word.type === 'phrase' || SINGLE_INPUT_TYPES.has(word.type)) {
      const di = $('#deutschInput');
      if (isBlankRequired(di)) missing.push('德文拼字');
    }

    if (missing.length > 0) {
      feedback.textContent = '請先填完： ' + missing.join('、');
      feedback.className = 'incorrect';
      showBtn.style.display = 'none';
      return;
    }

    // 實際比對
    if (word.type === 'noun') {
      const genderInput  = ($('#genderInput') || {}).value || 'none';
      const deutschInput = normalizeGerman(($('#deutschInput') || {}).value?.trim() ?? '');
      const pluralInput  = normalizeGerman((($('#pluralInput') || {}).value ?? '').trim());

      const correctGender  = word.gender || 'none';
      const correctDeutsch = normalizeGerman(word.deutsch || '');
      const correctPlural  = normalizeGerman(word.plural || '');
      const correctPluralAlt = normalizeGerman(word.Pl || '');

      if (correctGender !== 'none' && genderInput !== correctGender) {
        currentErrors.push(`性別：${correctGender}`);
      }
      if (deutschInput !== correctDeutsch) {
        currentErrors.push(`德文：${word.deutsch}`);
      }
      if (word.countable) {
        const okPlural = pluralInput === correctPlural || (word.Pl !== undefined && pluralInput === correctPluralAlt);
        if (!okPlural) {
          const pluralAnswers = [word.plural];
          if (word.Pl) pluralAnswers.push(word.Pl);
          currentErrors.push(`複數：${pluralAnswers.join(' 或 ')}`);
        }
      }

    } else if (word.type === 'verb') {
      const infinitivInput = normalizeGerman(($('#infinitivInput') || {}).value?.trim() ?? '');
      const correctInfinitiv = normalizeGerman(word.infinitiv || '');
      if (infinitivInput !== correctInfinitiv) currentErrors.push(`原形：${word.infinitiv}`);

      if (Array.isArray(word.selectedForms)) {
        for (const form of word.selectedForms) {
          const input  = normalizeGerman((($('#' + form + 'Input') || {}).value ?? '').trim());
          const correct = normalizeGerman(word[form] || '');
          if (input !== correct) currentErrors.push(`${form}：${word[form]}`);
        }
      }

    } else if (word.type === 'country') {
      const deutschInput = normalizeGerman(($('#deutschInput') || {}).value?.trim() ?? '');
      const correctDeutsch = normalizeGerman(word.deutsch || '');
      if (deutschInput !== correctDeutsch) currentErrors.push(`德文：${word.deutsch}`);

      if (word.countable) {
        const numberSelected = ($('#numberInput') || {}).value;
        const should = word.plural ? 'plural' : 'singular';
        if (numberSelected !== should) currentErrors.push(`單複數：${word.plural ? '複數' : '單數'}`);
      }

    } else if (word.type === 'phrase') {
      const input  = foldPhrase((($('#deutschInput') || {}).value ?? ''));
      const answer = foldPhrase(word.deutsch || '');
      if (input !== answer) currentErrors.push(`德文：${word.deutsch}`);

    } else if (word.type === 'number') {
      const inp  = normalizeGerman((($('#deutschInput') || {}).value ?? '').trim());
      const main = normalizeGerman(word.deutsch || '');
      if (inp !== main) currentErrors.push(`數字 ${word.number} 的正確德文：${word.deutsch}`);

    } else if (SINGLE_INPUT_TYPES.has(word.type)) {
      const deutschInput = normalizeGerman((($('#deutschInput') || {}).value ?? '').trim());
      const correctDeutsch = normalizeGerman(word.deutsch || '');
      if (deutschInput !== correctDeutsch) currentErrors.push(`德文：${word.deutsch}`);
    } else {
      currentErrors.push('未知題型：' + word.type);
    }

    // 判定
    if (currentErrors.length === 0) {
      feedback.textContent = '正確';
      feedback.className = 'correct';
      nextBtn.disabled = false;
      showBtn.style.display = 'none';
    } else {
      feedback.textContent = '錯誤';
      feedback.className = 'incorrect';
      showBtn.style.display = 'block';
      nextBtn.disabled = true;
    }

    saveVocab();
  }

  // -----------------------------
  // Initialization (DOM Ready)
  // -----------------------------
  document.addEventListener('DOMContentLoaded', () => {
    const quizForm = $('#quiz-form');
    if (quizForm) {
      quizForm.addEventListener('submit', e => e.preventDefault());
      // 最後一道牆：表單層攔 Enter / NumpadEnter
      quizForm.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === 'NumpadEnter') && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
          e.preventDefault();
        }
      }, { passive: false });
      quizForm.setAttribute('novalidate', 'novalidate');
      quizForm.setAttribute('autocomplete', 'off');
    }

    // 明確標示按鈕為非 submit
    ['next','check','showAnswer','dontKnow'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.setAttribute('type', 'button');
    });

    // 綁定按鈕（存在才綁）
    $('#next')?.addEventListener('click', safeNext);
    $('#check')?.addEventListener('click', checkAnswer);
    $('#showAnswer')?.addEventListener('click', showAnswer);
    $('#dontKnow')?.addEventListener('click', dontKnow);

    // 動態監看 #inputs
    const box = $('#inputs');
    if (box) {
      hardenInputsIn(box);
      const mo = new MutationObserver(() => hardenInputsIn(box));
      mo.observe(box, { childList: true, subtree: true });
    }

    populateLessonCheckboxes();

    // --- 初始化 TTS，並在首次互動時確保可用（iOS 友善） ---
    initTTS();
    ['click','touchstart','keydown'].forEach(ev =>
      document.addEventListener(ev, initTTS, { once: true, passive: true })
    );

    // --- 建立「🔊 發音」按鈕與「自動發音」開關 ---
    (function mountSpeakControls(){
      const controls = document.getElementById('controls') || document.body;

      // 發音按鈕
      const speakBtn = document.createElement('button');
      speakBtn.id = 'speakBtn';
      speakBtn.type = 'button';
      speakBtn.textContent = '🔊 發音';
      speakBtn.style.marginLeft = '8px';
      speakBtn.addEventListener('click', () => {
        const word = vocab[currentIndex];
        speakDE(textForSpeak(word));
      });

      // 自動發音開關
      const toggleWrap = document.createElement('label');
      toggleWrap.style.marginLeft = '8px';
      toggleWrap.style.userSelect = 'none';
      const autoCk = document.createElement('input');
      autoCk.type = 'checkbox';
      autoCk.id = 'autoSpeak';
      autoCk.checked = true;
      autoCk.addEventListener('change', () => { TTS.enabled = autoCk.checked; });
      toggleWrap.appendChild(autoCk);
      toggleWrap.appendChild(document.createTextNode(' 自動發音'));

      // 插到「檢查」按鈕旁邊；找不到就加在 controls
      const anchor = document.getElementById('check') || controls.lastElementChild;
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(speakBtn, anchor.nextSibling);
        speakBtn.parentNode.insertBefore(toggleWrap, speakBtn.nextSibling);
      } else {
        controls.append(speakBtn, toggleWrap);
      }
    })();

    // 起題（若頁面載入時 vocab 為空，這裡不會出錯，只是不出題）
    safeNext();
  });
})();
