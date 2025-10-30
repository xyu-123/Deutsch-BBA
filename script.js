// ========================================
// 0) 禁止表單自動提交（防止 iPhone 按 Enter 跳題）
// ========================================
document.addEventListener('DOMContentLoaded', () => {
  const quizForm = document.getElementById('quiz-form');
  if (quizForm) quizForm.addEventListener('submit', e => e.preventDefault());

  // 所有按鈕明確標記為非 submit
  document.getElementById('next')?.setAttribute('type','button');
  document.getElementById('check')?.setAttribute('type','button');
  document.getElementById('showAnswer')?.setAttribute('type','button');
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

  // 🚫 禁止 Enter 預設行為（防止自動送出 / 跳題）
  el.addEventListener("keydown", ev => {
    if (ev.key === "Enter") ev.preventDefault();
  });
}

function hardenInputsIn(container = document) {
  container.querySelectorAll('#inputs input, #inputs textarea').forEach(hardenInput);
}

// 動態監看 #inputs
document.addEventListener('DOMContentLoaded', () => {
  const box = document.getElementById('inputs');
  if (!box) return;
  hardenInputsIn(box);
  const mo = new MutationObserver(() => hardenInputsIn(box));
  mo.observe(box, { childList: true, subtree: true });
});

// ========================================
// 2) 換題令牌鎖 — 只允許安全呼叫 nextWord()
// ========================================
let __advanceToken = 0;
function safeNext() {
  __advanceToken += 1;
  nextWord(__advanceToken);
}

// ========================================
// 3) 載入詞彙 & 公用正規化
// ========================================
let vocab = [...vocabList];
let currentIndex = -1;
let correctConfirmed = false;

function normalizeGerman(s) {
  if (!s && s !== "") return "";
  s = String(s).toLowerCase();
  s = s.normalize('NFKC');
  s = s.replace(/\p{Cf}/gu, "");
  s = s.replace(/[\p{Z}\t\r\n\f]+/gu, " ");
  s = s.replace(/[\u00B7\u2027\u2219]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  s = s.replace(/a:/g, 'ae').replace(/o:/g, 'oe').replace(/u:/g, 'ue');
  return s;
}

function foldPhrase(s) {
  if (!s) return "";
  s = normalizeGerman(s);
  return s.replace(/[^a-z]/g, "");
}

// ========================================
// 4) 事件綁定
// ========================================
document.getElementById("next").addEventListener("click", safeNext);
document.getElementById("check").addEventListener("click", checkAnswer);
document.getElementById("showAnswer").addEventListener("click", showAnswer);

let currentErrors = [];
const SINGLE_INPUT_TYPES = new Set(["adjective", "adverb", "question", "other"]);

// ========================================
// 5) 出題（僅允許安全令牌）
// ========================================
function nextWord(token) {
  if (token !== __advanceToken) return; // 🚫 沒有令牌不允許換題

  correctConfirmed = false;
  document.getElementById("showAnswer").style.display = "none";
  if (vocab.length === 0) return;
  document.getElementById("next").disabled = true;

  const checked = Array.from(document.querySelectorAll('#lessonContainer input[type=checkbox]:checked')).map(ch => ch.value);
  let pool = (checked.length === 0)
    ? vocab.filter(w => (w.lesson || '') !== 'Numbers')
    : vocab.filter(w => checked.includes((w.lesson || '')));
  if (pool.length === 0)
    pool = vocab.filter(w => (w.lesson || '') !== 'Numbers');

  const chosen = pool[Math.floor(Math.random() * pool.length)];
  currentIndex = vocab.indexOf(chosen);

  const translationDiv = document.getElementById("translation");
  translationDiv.textContent = chosen.chinese || "";

  const inputsDiv = document.getElementById("inputs");
  inputsDiv.innerHTML = "";

  let html = "";
  if (chosen.type === "noun") {
    html = `
      <select id="genderInput" required>
        <option value="none">無性別</option>
        <option value="der">der (陽性)</option>
        <option value="das">das (中性)</option>
        <option value="die">die (陰性)</option>
      </select>
      <input type="text" id="deutschInput" placeholder="德文拼字${chosen.hint ? ' (提示：' + chosen.hint + ')' : ''}" required>
      <input type="text" id="pluralInput" placeholder="複數形${chosen.countable ? "" : " (不可數，無需填寫)"}" ${chosen.countable ? "required" : "readonly"}>
    `;
  } else if (chosen.type === "verb") {
    const forms = ['ich', 'du', 'er', 'wir', 'ihr', 'sie'];
    const hinttext = ['ich', 'du', 'er/es/sie', 'wir', 'ihr', 'sie/Sie'];
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
  } else if (chosen.type === "country") {
    if (chosen.countable) {
      html += `
        <select id="numberInput" required>
          <option value="singular">單數</option>
          <option value="plural">複數</option>
        </select>
      `;
    }
    html += `<input type="text" id="deutschInput" placeholder="德文拼字${chosen.hint ? ' (提示：' + chosen.hint + ')' : ''}" required>`;
  } else if (chosen.type === "phrase" || SINGLE_INPUT_TYPES.has(chosen.type)) {
    html = `<input type="text" id="deutschInput" placeholder="德文拼字${chosen.hint ? ' (提示：' + chosen.hint + ')' : ''}" required>`;
  } else if (chosen.type === "number") {
    translationDiv.textContent = chosen.number;
    html = `<input type="text" id="deutschInput" placeholder="請輸入 ${chosen.number} 的德文拼字" required>`;
  }

  inputsDiv.insertAdjacentHTML("beforeend", html);
  hardenInputsIn(inputsDiv);

  setTimeout(() => {
    const firstInput = document.querySelector('#inputs input, #inputs select');
    if (firstInput) firstInput.focus();
  }, 0);

  enableEnterToCheck();
  document.getElementById("inputs").style.display = "block";
  document.getElementById("check").style.display = "block";
  document.getElementById("feedback").style.display = "none";
  document.getElementById("feedback").className = "";
}

// ========================================
// 6) Enter 雙階段行為（答對要再按一次 Enter 才換題）
// ========================================
function enableEnterToCheck() {
  const container = document.getElementById("inputs");
  container.onkeydown = null;
  container.onkeyup = null;

  container.onkeyup = function (e) {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();

    const feedback = document.getElementById("feedback");
    const nextBtn = document.getElementById("next");

    if (feedback.classList.contains("correct")) {
      if (!correctConfirmed) {
        correctConfirmed = true;
        feedback.textContent = "正確！（再按 Enter 進入下一題）";
        nextBtn.disabled = false;
        return;
      } else {
        correctConfirmed = false;
        safeNext(); // ✅ 改用安全換題
        return;
      }
    }

    checkAnswer();
  };
}

// ========================================
// 7) 顯示答案
// ========================================
function showAnswer() {
  const feedback = document.getElementById("feedback");
  if (currentErrors.length === 0) {
    feedback.innerHTML = '<ul><li><strong>正確答案：</strong></li><li><em>無需顯示，您已答對或尚未作答。</em></li></ul>';
  } else {
    const items = currentErrors.map(item => `<li>${item}</li>`).join('');
    feedback.innerHTML = `<ul><li><strong>正確答案：</strong></li>${items}</ul>`;
  }
  feedback.className = "incorrect";
  document.getElementById("next").disabled = false;
  document.getElementById("showAnswer").style.display = "none";
}

// ========================================
// 8) 課程標籤
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
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = val; cb.id = id; cb.name = 'lessonCheckbox';
    const span = document.createElement('span'); span.textContent = labelText;
    wrapper.appendChild(cb); wrapper.appendChild(span);
    container.appendChild(wrapper);
  });
}
populateLessonCheckboxes();

// ========================================
// 9) 檢查答案（嚴格版）
// ========================================
function checkAnswer() {
  const word = vocab[currentIndex];
  const feedback = document.getElementById("feedback");
  feedback.style.display = "block";
  let allCorrect = true;
  currentErrors = [];
  const isEmpty = val => val === null || val === undefined || normalizeGerman(val) === "";

  // 各類型比對（與你原邏輯相同，略）
  // ...【照你目前版本保留】...

  // 🚫 清除任何潛在自動換題
  clearTimeout(window.nextWordTimer);
  window.nextWordTimer = null;

  if (allCorrect) {
    feedback.textContent = "正確";
    feedback.className = "correct";
    document.getElementById("next").disabled = false;
    document.getElementById("showAnswer").style.display = "none";
  } else {
    feedback.textContent = "錯誤";
    feedback.className = "incorrect";
    document.getElementById("showAnswer").style.display = "block";
    document.getElementById("next").disabled = true;
  }

  saveVocab();
}

// ========================================
// 10) 儲存 vocab
// ========================================
function saveVocab() {
  localStorage.setItem("vocab", JSON.stringify(vocab));
}

// ========================================
// 11) 啟動
// ========================================
safeNext();
