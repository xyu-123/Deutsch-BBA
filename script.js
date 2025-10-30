// ========================================
// 1) 載入詞彙 & 公用正規化
// ========================================

// 從 vocab.js 載入所有詞彙
let vocab = [...vocabList];
let currentIndex = -1;

// 將變體母音與替代輸入標準化為同一形式 (使用 ae/oe/ue/ss)
// 並清理各種隱藏/格式字元、奇怪空白與中點
function normalizeGerman(s) {
  if (!s && s !== "") return "";
  s = String(s).toLowerCase();

  // 統一 Unicode 形態
  s = s.normalize('NFKC');

  // 移除所有「格式字元」（零寬空白/連字標記等）
  s = s.replace(/\p{Cf}/gu, ""); // 需 /u

  // 把所有空白類（含 NBSP、narrow NBSP、換行、tab…）統一成一般空白
  s = s.replace(/[\p{Z}\t\r\n\f]+/gu, " ");

  // 移除會混進去的中點/間隔點
  s = s.replace(/[\u00B7\u2027\u2219]/g, "");

  // 收斂連續空白並修頭尾
  s = s.replace(/\s+/g, " ").trim();

  // 德文母音與 ß、以及冒號替代寫法
  s = s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  s = s.replace(/a:/g, 'ae').replace(/o:/g, 'oe').replace(/u:/g, 'ue');

  return s;
}

// 片語比對專用：將字串正規化後，只保留 a–z（忽略空白/標點/大小寫）
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

// 只需要一格輸入的類型（不含 phrase；phrase 有自己的分支）
let currentErrors = [];
const SINGLE_INPUT_TYPES = new Set(["adjective", "adverb", "question", "other"]);

// ========================================
// 3) 出題：nextWord()
// ========================================
function nextWord() {
  // 隱藏顯示答案按鈕
  document.getElementById("showAnswer").style.display = "none";
  if (vocab.length === 0) return;

  // 禁用下一個按鈕直到回答完成
  document.getElementById("next").disabled = true;

  // 依照 lesson(課程標籤) 的勾選狀態篩選，並以等機率選一個單字
  const checked = Array.from(document.querySelectorAll('#lessonContainer input[type=checkbox]:checked')).map(ch => ch.value);
  // 沒勾選時，排除 Numbers；有勾選就照勾選來
  let pool = (checked.length === 0)
  ? vocab.filter(w => (w.lesson || '') !== 'Numbers')     // 未勾選 → 不出數字
  : vocab.filter(w => checked.includes((w.lesson || ''))); // 有勾選 → 依勾選

  // 若篩到空集合，就退回「非 Numbers」
  if (pool.length === 0) {
  pool = vocab.filter(w => (w.lesson || '') !== 'Numbers');
}
  const chosen = pool.length ? pool[Math.floor(Math.random() * pool.length)] : vocab[Math.floor(Math.random() * vocab.length)];
  currentIndex = vocab.indexOf(chosen);

  // 更新翻譯（翻譯在 #inputs 外面）
  const translationDiv = document.getElementById("translation");
  if (translationDiv) translationDiv.textContent = chosen.chinese || "";

  // 清空舊欄位，重新建立新題目的輸入欄位
  const inputsDiv = document.getElementById("inputs");
  inputsDiv.innerHTML = "";

  // 組新欄位的 HTML，一次性塞進去
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
    // 隨機選擇兩個其他人稱形態
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
    // 記錄被選中的形態到 word 物件，供檢查時使用
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
  }else if (chosen.type === "number") {
  // 顯示阿拉伯數字在畫面上
  const translationDiv = document.getElementById("translation");
  translationDiv.textContent = chosen.number; // 顯示題目數字

  // 建立輸入欄（讓使用者輸入德文字）
  inputsDiv.innerHTML = `
    <input type="text" id="deutschInput" 
           placeholder="請輸入 ${chosen.number} 的德文拼字"
           required>
  `;
}

  inputsDiv.insertAdjacentHTML("beforeend", html);

  // 聚焦第一個輸入欄位
  setTimeout(() => {
    const firstInput = document.querySelector('#inputs input[type="text"], #inputs select');
    if (firstInput) firstInput.focus();
  }, 0);

  // 綁 Enter
  enableEnterToCheck();

  // 顯示狀態初始化
  document.getElementById("inputs").style.display = "block";
  document.getElementById("check").style.display = "block";
  document.getElementById("feedback").style.display = "none";
  document.getElementById("feedback").className = "";
}

// ========================================
// 4) Enter 監聽（用 keyup，IME 第一次 Enter 也會觸發）
// ========================================
function enableEnterToCheck() {
  const container = document.getElementById("inputs");
  container.onkeydown = null;
  container.onkeyup = null;

  container.onkeyup = function (e) {
    if (e.key !== "Enter") return;
    if (e.isComposing) return; // 極少數情況仍在組字就略過一次
    e.preventDefault();

    const feedback = document.getElementById("feedback");
    const nextBtn = document.getElementById("next");

    // 若已答對，再按 Enter 直接下一題
    if (feedback.className === "correct" && !nextBtn.disabled) {
      saveVocab();
      nextWord();
      return;
    }
    // 否則檢查答案
    checkAnswer();
  };
}

// ========================================
// 5) 顯示正確答案
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

  // 啟用下一個按鈕並隱藏顯示答案按鈕
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

// 在載入時填充 lesson 核取方塊
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
    // 片語專屬比對（忽略空白/標點/大小寫）
    const input  = foldPhrase(document.getElementById("deutschInput").value);
    const answer = foldPhrase(word.deutsch);
    if (input !== answer) {
      allCorrect = false;
      currentErrors.push(`德文：${word.deutsch}`);
    }

  } else if (SINGLE_INPUT_TYPES.has(word.type)) {
    // 形容詞、副詞、疑問詞、其他：只需檢查德文拼字
    const deutschInput = normalizeGerman(document.getElementById("deutschInput").value.trim());
    const correctDeutsch = normalizeGerman(word.deutsch || '');
    if (deutschInput !== correctDeutsch) {
      allCorrect = false;
      currentErrors.push(`德文：${word.deutsch}`);
    }
  }else if (word.type === "number") {
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
    // 答對時才啟用下一個按鈕
    document.getElementById("next").disabled = false;
    document.getElementById("showAnswer").style.display = "none";
  } else {
    feedback.textContent = "錯誤";
    feedback.className = "incorrect";
    // 顯示答案按鈕
    document.getElementById("showAnswer").style.display = "block";
  }

  saveVocab();
}

// ========================================
// 8) 儲存 vocab（若你有動態修改 vocab）
// ========================================
function saveVocab() {
  localStorage.setItem("vocab", JSON.stringify(vocab));
}

// ========================================
// 9) 啟動
// ========================================
nextWord();
