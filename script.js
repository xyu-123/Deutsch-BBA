// ========================================
// 0) iPhone / Safari：關閉預測、拼字、自動更正/大寫
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
// 3) 出題：nextWord()
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

  const chosen = pool.length ? pool[Math.floor(Math.random() * pool.length)] : vocab[Math.floor(Math.random() * vocab.length)];
  currentIndex = vocab.indexOf(chosen);

  const translationDiv = document.getElementById("translation");
  if (translationDiv) translationDiv.textContent = chosen.chinese || "";

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
    html += `
      <input type="text" id="deutschInput" placeholder="德文拼字${chosen.hint ? ' (提示：' + chosen.hint + ')' : ''}" required>
    `;
  } else if (chosen.type === "phrase" || SINGLE_INPUT_TYPES.has(chosen.type)) {
    html = `
      <input type="text" id="deutschInput" placeholder="德文拼字${chosen.hint ? ' (提示：' + chosen.hint + ')' : ''}" required>
    `;
  } else if (chosen.type === "number") {
    const translationDiv = document.getElementById("translation");
    translationDiv.textContent = chosen.number;
    inputsDiv.innerHTML = `
      <input type="text" id="deutschInput"
             placeholder="請輸入 ${chosen.number} 的德文拼字"
             required>
    `;
  }

  inputsDiv.insertAdjacentHTML("beforeend", html);
  hardenInputsIn(inputsDiv); // ← 這行保證每次出題都自動關閉預測功能

  setTimeout(() => {
    const firstInput = document.querySelector('#inputs input[type="text"], #inputs select');
    if (firstInput) firstInput.focus();
  }, 0);

  enableEnterToCheck();
  document.getElementById("inputs").style.display = "block";
  document.getElementById("check").style.display = "block";
  document.getElementById("feedback").style.display = "none";
  document.getElementById("feedback").className = "";
}

// ========================================
// 4) Enter 監聽
// ========================================
function enableEnterToCheck() {
  const container = document.getElementById("inputs");
  container.onkeydown = null;
  container.onkeyup = null;

  container.onkeyup = function (e) {
    if (e.key !== "Enter") return;
    if (e.isComposing) return;
    e.preventDefault();

    const feedback = document.getElementById("feedback");
    const nextBtn = document.getElementById("next");

    if (feedback.className === "correct" && !nextBtn.disabled) {
      saveVocab();
      nextWord();
      return;
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
    feedback.innerHTML = '<ul style="text-align:left; display:inline-block; margin:8px 0 0 0; padding-left:18px;"><li><strong>正確答案：</strong></li><li><em>無需顯示，您已答對或尚未作答。</em></li></ul>';
  } else {
    const items = currentErrors.map(item => `<li>${item}</li>`).join('');
    feedback.innerHTML = `<ul style="text-align:left; display:inline-block; margin:8px 0 0 0; padding:8px 12px; padding-left:18px;">` +
                         `<li><strong>正確答案：</strong></li>` +
                         `${items}</ul>`;
  }
  feedback.className = "incorrect";

  document.getElementById("next").disabled = false;
  document.getElementById("showAnswer").style.display = "none";
}

// ========================================
// 6) 課程標籤核取方塊
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
    cb.type = 'checkbox';
    cb.value = val;
    cb.id = id;
    cb.name = 'lessonCheckbox';

    const span = document.createElement('span');
    span.textContent = labelText;

    wrapper.appendChild(cb);
    wrapper.appendChild(span);
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

  if (word.type === "noun") {
    const genderInput = document.getElementById("genderInput").value;
    const deutschInputRaw = document.getElementById("deutschInput").value.trim();
    const pluralInputRaw = document.getElementById("pluralInput").value.trim();

    const deutschInput = normalizeGerman(deutschInputRaw);
    const pluralInput = normalizeGerman(pluralInputRaw);

    const correctGender = word.gender || 'none';
    const correctDeutsch = normalizeGerman(word.deutsch || '');
    const correctPlural = normalizeGerman(word.plural || '');

    if (genderInput !== correctGender) {
      allCorrect = false;
      currentErrors.push(`性別：${correctGender}`);
    }
    if (deutschInput !== correctDeutsch) {
      allCorrect = false;
      currentErrors.push(`德文：${word.deutsch}`);
    }
    if (word.countable) {
      const correctPluralAlt = normalizeGerman(word.Pl || '');
      if (pluralInput !== correctPlural && (word.Pl === undefined || pluralInput !== correctPluralAlt)) {
        allCorrect = false;
        const pluralAnswers = [word.plural];
        if (word.Pl) pluralAnswers.push(word.Pl);
        currentErrors.push(`複數：${pluralAnswers.join(' 或 ')}`);
      }
    }
  } else if (word.type === "verb") {
    const infinitivInput = normalizeGerman(document.getElementById("infinitivInput").value.trim());
    const correctInfinitiv = normalizeGerman(word.infinitiv || '');
    if (infinitivInput !== correctInfinitiv) {
      allCorrect = false;
      currentErrors.push(`原形：${word.infinitiv}`);
    }
    for (const form of word.selectedForms) {
      const input = normalizeGerman(document.getElementById(form + "Input").value.trim());
      const correct = normalizeGerman(word[form] || '');
      if (input !== correct) {
        allCorrect = false;
        currentErrors.push(`${form}：${word[form]}`);
      }
    }
  } else if (word.type === "country") {
    const numberSelected = document.getElementById("numberInput") ? document.getElementById("numberInput").value : null;
    const deutschInput = normalizeGerman(document.getElementById("deutschInput").value.trim());
    const correctDeutsch = normalizeGerman(word.deutsch || '');
    if (word.countable) {
      const correctPlural = word.plural ? `複數` : `單數`;
      if (numberSelected !== (word.plural ? "plural" : "singular")) {
        allCorrect = false;
        currentErrors.push(`單複數：${correctPlural}`);
      }
    }
    if (deutschInput !== correctDeutsch) {
      allCorrect = false;
      currentErrors.push(`德文：${word.deutsch}`);
    }
  } else if (word.type === "phrase") {
    const input  = foldPhrase(document.getElementById("deutschInput").value);
    const answer = foldPhrase(word.deutsch);
    if (input !== answer) {
      allCorrect = false;
      currentErrors.push(`德文：${word.deutsch}`);
    }
  } else if (SINGLE_INPUT_TYPES.has(word.type)) {
    const deutschInput = normalizeGerman(document.getElementById("deutschInput").value.trim());
    const correctDeutsch = normalizeGerman(word.deutsch || '');
    if (deutschInput !== correctDeutsch) {
      allCorrect = false;
      currentErrors.push(`德文：${word.deutsch}`);
    }
  } else if (word.type === "number") {
    const inputRaw = document.getElementById("deutschInput").value.trim();
    const inp = normalizeGerman(inputRaw);
    const main = normalizeGerman(word.deutsch || "");
    if (inp !== main) {
      allCorrect = false;
      currentErrors.push(`數字 ${word.number} 的正確德文：${word.deutsch}`);
    }
  }

  if (allCorrect) {
    feedback.textContent = "正確";
    feedback.className = "correct";
    document.getElementById("next").disabled = false;
    document.getElementById("showAnswer").style.display = "none";
  } else {
    feedback.textContent = "錯誤";
    feedback.className = "incorrect";
    document.getElementById("showAnswer").style.display = "block";
  }

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
