document.addEventListener('DOMContentLoaded', () => {
  const quizForm = document.getElementById('quiz-form');
  if (quizForm) quizForm.addEventListener('submit', e => e.preventDefault());
});
// ========================================
// 0) iPhone / Safari：關閉預測、自動更正、大寫、拼字
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
}

function hardenInputsIn(container = document) {
  container.querySelectorAll('#inputs input, #inputs textarea').forEach(hardenInput);
}

// 在載入後監看 #inputs：動態新增的輸入框也會自動加上屬性
document.addEventListener('DOMContentLoaded', () => {
  const box = document.getElementById('inputs');
  if (!box) return;
  hardenInputsIn(box);
  const mo = new MutationObserver(() => hardenInputsIn(box));
  mo.observe(box, { childList: true, subtree: true });
});

// ========================================
// 1) 載入詞彙 & 公用正規化
// ========================================
let vocab = [...vocabList];
let currentIndex = -1;

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
// 2) 事件綁定
// ========================================
document.getElementById("next").addEventListener("click", nextWord);
document.getElementById("check").addEventListener("click", checkAnswer);
document.getElementById("showAnswer").addEventListener("click", showAnswer);

let currentErrors = [];
const SINGLE_INPUT_TYPES = new Set(["adjective", "adverb", "question", "other"]);

// ========================================
// 3) 出題
// ========================================
function nextWord() {
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
// 4) Enter 鍵行為修正版
// ========================================let correctConfirmed = false;

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
        nextWord();
        return;
      }
    }

    checkAnswer();
  };
}

// ========================================
// 5) 顯示答案
// ========================================
function showAnswer() {
  const word = vocab[currentIndex];
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
// 6) 課程標籤
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
// 7) 檢查答案
// ========================================
function checkAnswer() {
  const word = vocab[currentIndex];
  const feedback = document.getElementById("feedback");
  feedback.style.display = "block";
  let allCorrect = true;
  currentErrors = [];

  const isEmpty = val => val === null || val === undefined || normalizeGerman(val) === "";

  if (word.type === "noun") {
    const genderInput = document.getElementById("genderInput").value;
    const deutschRaw = document.getElementById("deutschInput").value.trim();
    const pluralRaw = document.getElementById("pluralInput").value.trim();

    const deutschInput = normalizeGerman(deutschRaw);
    const pluralInput = normalizeGerman(pluralRaw);

    const correctGender = word.gender || 'none';
    const correctDeutsch = normalizeGerman(word.deutsch || '');
    const correctPlural = normalizeGerman(word.plural || '');

    // 性別
    if (genderInput !== correctGender) {
      allCorrect = false;
      currentErrors.push(`性別：${correctGender}`);
    }

    // 單數
    if (isEmpty(deutschRaw) || deutschInput !== correctDeutsch) {
      allCorrect = false;
      currentErrors.push(`德文：${word.deutsch}`);
    }

    // 複數
    if (word.countable) {
      if (isEmpty(pluralRaw)) {
        allCorrect = false;
        currentErrors.push(`複數：${word.plural}`);
      } else {
        const correctPluralAlt = normalizeGerman(word.Pl || '');
        if (pluralInput !== correctPlural && (word.Pl === undefined || pluralInput !== correctPluralAlt)) {
          allCorrect = false;
          const pluralAnswers = [word.plural];
          if (word.Pl) pluralAnswers.push(word.Pl);
          currentErrors.push(`複數：${pluralAnswers.join(' 或 ')}`);
        }
      }
    }

  } else if (word.type === "verb") {
    const infinitivRaw = document.getElementById("infinitivInput").value.trim();
    const infinitivInput = normalizeGerman(infinitivRaw);
    const correctInfinitiv = normalizeGerman(word.infinitiv || '');
    if (isEmpty(infinitivRaw) || infinitivInput !== correctInfinitiv) {
      allCorrect = false;
      currentErrors.push(`原形：${word.infinitiv}`);
    }

    for (const form of word.selectedForms) {
      const valRaw = document.getElementById(form + "Input").value.trim();
      const val = normalizeGerman(valRaw);
      const correct = normalizeGerman(word[form] || '');
      if (isEmpty(valRaw) || val !== correct) {
        allCorrect = false;
        currentErrors.push(`${form}：${word[form]}`);
      }
    }

  } else if (word.type === "country") {
    const numberSel = document.getElementById("numberInput")?.value;
    const deutschRaw = document.getElementById("deutschInput").value.trim();
    const deutschInput = normalizeGerman(deutschRaw);
    const correctDeutsch = normalizeGerman(word.deutsch || '');

    if (word.countable) {
      const correctPlural = word.plural ? "複數" : "單數";
      if (numberSel !== (word.plural ? "plural" : "singular")) {
        allCorrect = false;
        currentErrors.push(`單複數：${correctPlural}`);
      }
    }

    if (isEmpty(deutschRaw) || deutschInput !== correctDeutsch) {
      allCorrect = false;
      currentErrors.push(`德文：${word.deutsch}`);
    }

  } else if (word.type === "phrase") {
    const raw = document.getElementById("deutschInput").value.trim();
    const input = foldPhrase(raw);
    const answer = foldPhrase(word.deutsch);
    if (isEmpty(raw) || input !== answer) {
      allCorrect = false;
      currentErrors.push(`德文：${word.deutsch}`);
    }

  } else if (SINGLE_INPUT_TYPES.has(word.type)) {
    const raw = document.getElementById("deutschInput").value.trim();
    const input = normalizeGerman(raw);
    const correct = normalizeGerman(word.deutsch || '');
    if (isEmpty(raw) || input !== correct) {
      allCorrect = false;
      currentErrors.push(`德文：${word.deutsch}`);
    }

  } else if (word.type === "number") {
    const raw = document.getElementById("deutschInput").value.trim();
    const input = normalizeGerman(raw);
    const correct = normalizeGerman(word.deutsch || '');
    if (isEmpty(raw) || input !== correct) {
      allCorrect = false;
      currentErrors.push(`數字 ${word.number} 的正確德文：${word.deutsch}`);
    }
  }

  // 結果顯示
  if (allCorrect) {
    feedback.textContent = "正確";
    feedback.className = "correct";
    document.getElementById("next").disabled = false;
    document.getElementById("showAnswer").style.display = "none";
  } else {
    feedback.textContent = "錯誤";
    feedback.className = "incorrect";
    document.getElementById("showAnswer").style.display = "block";
    document.getElementById("next").disabled = true; // 防止錯誤時跳題
  }
  // 🚫 鎖住自動換題（即使有其他 setTimeout）
  clearTimeout(window.nextWordTimer);
  window.nextWordTimer = null;
  saveVocab();
}

// ========================================
// 8) 儲存 vocab
// ========================================
function saveVocab() {
  localStorage.setItem("vocab", JSON.stringify(vocab));
}

// ========================================
// 9) 啟動
// ========================================
nextWord();
