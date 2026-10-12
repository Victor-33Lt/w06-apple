(() => {
  "use strict";

  const SIZE = 8;
  const GAME_SECONDS = 120;
  const POINTS_PER_NUMBER = 10;
  const GOLD_BONUS = 50;
  const SPECIAL_CHANCE = 0.07;

  const boardElement = document.getElementById("board");
  const scoreElement = document.getElementById("score");
  const timerElement = document.getElementById("timer");
  const bestElement = document.getElementById("best");
  const messageElement = document.getElementById("message");
  const overlay = document.getElementById("overlay");
  const endTitle = document.getElementById("endTitle");
  const endMessage = document.getElementById("endMessage");

  // 숫자판과 특수 사과 종류를 별도로 관리합니다.
  let board = [];
  let specialBoard = [];
  let cells = [];
  let selected = [];

  let score = 0;
  let best = loadBest();
  let timeLeft = GAME_SECONDS;
  let playing = false;
  let dragging = false;
  let lastTick = 0;
  let timerId = null;
  let boardLocked = false;

  bestElement.textContent = best;

  function loadBest() {
    try {
      return Number(localStorage.getItem("sum10-best")) || 0;
    } catch {
      return 0;
    }
  }

  function saveBest() {
    try {
      localStorage.setItem("sum10-best", String(best));
    } catch {
      // 저장할 수 없는 환경에서는 기록 저장을 생략합니다.
    }
  }

  function randomNumber() {
    return Math.floor(Math.random() * 9) + 1;
  }

  function randomSpecial() {
    if (Math.random() >= SPECIAL_CHANCE) {
      return null;
    }

    const types = ["gold", "bomb", "ice"];

    return types[Math.floor(Math.random() * types.length)];
  }

  function specialEmoji(type) {
    switch (type) {
      case "gold":
        return "💛";
      case "bomb":
        return "💣";
      case "ice":
        return "🧊";
      default:
        return "🍎";
    }
  }

  function renderCell(r, c, animate = false) {
    const cell = cells[r][c];
    const type = specialBoard[r][c];
    const number = board[r][c];

    cell.classList.remove(
      "empty",
      "removing",
      "selected",
      "special-gold",
      "special-bomb",
      "special-ice",
      "falling"
    );

    if (type) {
      cell.classList.add(`special-${type}`);
    }

    cell.innerHTML =
      `${specialEmoji(type)}<span>${number}</span>`;

    cell.setAttribute(
      "aria-label",
      `${type ? "특수 사과 " : "일반 사과 "}${number}`
    );

    if (animate) {
      // 애니메이션을 다시 실행합니다.
      void cell.offsetWidth;
      cell.classList.add("falling");
    }
  }

  function createBoard() {
    board = Array.from(
      { length: SIZE },
      () => Array.from({ length: SIZE }, randomNumber)
    );

    specialBoard = Array.from(
      { length: SIZE },
      () => Array.from({ length: SIZE }, randomSpecial)
    );

    boardElement.innerHTML = "";
    cells = [];

    for (let r = 0; r < SIZE; r++) {
      cells[r] = [];

      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement("div");

        cell.className = "cell";
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.setAttribute("role", "button");

        boardElement.appendChild(cell);
        cells[r][c] = cell;

        renderCell(r, c);
      }
    }
  }

  function updateStats() {
    scoreElement.textContent = score;
    bestElement.textContent = best;

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    timerElement.textContent =
      `${String(minutes).padStart(2, "0")}:` +
      `${String(seconds).padStart(2, "0")}`;

    timerElement.classList.toggle(
      "urgent",
      timeLeft <= 10
    );
  }

  function showMessage(text) {
    messageElement.textContent = text;
  }

  function samePosition(a, b) {
    return a.r === b.r && a.c === b.c;
  }

  function isAdjacent(a, b) {
    const rowDiff = Math.abs(a.r - b.r);
    const colDiff = Math.abs(a.c - b.c);

    return (
      rowDiff <= 1 &&
      colDiff <= 1 &&
      rowDiff + colDiff > 0
    );
  }

  function selectedSum() {
    return selected.reduce(
      (sum, pos) => sum + board[pos.r][pos.c],
      0
    );
  }

  function renderSelection() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        cells[r][c].classList.remove("selected");
      }
    }

    for (const pos of selected) {
      cells[pos.r][pos.c].classList.add("selected");
    }
  }

  function clearSelection() {
    selected = [];
    renderSelection();
  }

  function startSelection(pos) {
    if (
      !playing ||
      boardLocked ||
      board[pos.r][pos.c] === 0
    ) {
      return;
    }

    selected = [pos];
    dragging = true;

    renderSelection();
    showMessage(`합계: ${selectedSum()} / 10`);
  }

  function extendSelection(pos) {
    if (!dragging || !playing || boardLocked) return;

    const last = selected[selected.length - 1];

    if (samePosition(last, pos)) return;

    // 직전 칸으로 돌아가면 선택을 한 단계 취소합니다.
    if (
      selected.length > 1 &&
      samePosition(selected[selected.length - 2], pos)
    ) {
      selected.pop();
      renderSelection();
      showMessage(`합계: ${selectedSum()} / 10`);
      return;
    }

    // 이미 선택한 칸은 다시 선택할 수 없습니다.
    if (selected.some(item => samePosition(item, pos))) {
      return;
    }

    if (
      board[pos.r][pos.c] === 0 ||
      !isAdjacent(last, pos)
    ) {
      return;
    }

    const sum = selectedSum() + board[pos.r][pos.c];

    if (sum > 10) {
      showMessage("합이 10을 넘어요!");
      return;
    }

    selected.push(pos);
    renderSelection();
    showMessage(`합계: ${sum} / 10`);
  }

  function finishSelection() {
    if (!dragging) return;

    dragging = false;

    if (
      !playing ||
      boardLocked ||
      selected.length === 0
    ) {
      return;
    }

    const sum = selectedSum();

    if (sum === 10) {
      removeSelected();
    } else {
      clearSelection();

      if (sum < 10) {
        showMessage("합이 10이 아니에요. 다시 연결해 보세요!");
      }
    }
  }

  // 선택한 사과와 특수 효과로 제거될 사과를 계산합니다.
  function getRemovalPositions() {
    const removed = new Map();

    function addPosition(r, c) {
      if (
        r < 0 ||
        r >= SIZE ||
        c < 0 ||
        c >= SIZE ||
        board[r][c] === 0
      ) {
        return;
      }

      removed.set(`${r},${c}`, { r, c });
    }

    // 직접 선택한 사과
    for (const pos of selected) {
      addPosition(pos.r, pos.c);
    }

    // 선택한 특수 사과의 효과
    for (const pos of selected) {
      const type = specialBoard[pos.r][pos.c];

      if (type === "bomb") {
        // 폭탄: 주변 8칸 제거
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;

            addPosition(pos.r + dr, pos.c + dc);
          }
        }
      }

      if (type === "ice") {
        // 얼음: 해당 열 전체 제거
        for (let r = 0; r < SIZE; r++) {
          addPosition(r, pos.c);
        }
      }
    }

    return [...removed.values()];
  }

  function removeSelected() {
    if (selected.length === 0 || boardLocked) return;

    boardLocked = true;

    // 제거할 사과와 특수 효과를 먼저 확정합니다.
    const removedPositions = getRemovalPositions();

    let goldCount = 0;

    for (const pos of removedPositions) {
      if (specialBoard[pos.r][pos.c] === "gold") {
        goldCount++;
      }

      cells[pos.r][pos.c].classList.add("removing");
    }

    // 제거된 사과마다 10점, 황금 사과마다 추가 50점
    const earnedPoints =
      removedPositions.length * POINTS_PER_NUMBER +
      goldCount * GOLD_BONUS;

    score += earnedPoints;

    if (score > best) {
      best = score;
      saveBest();
    }

    updateStats();
    clearSelection();

    let message = `성공! +${earnedPoints}점`;

    if (goldCount > 0) {
      message += " 💛 황금 사과 보너스!";
    }

    if (removedPositions.some(pos =>
      specialBoard[pos.r][pos.c] === "bomb"
    )) {
      message += " 💣 폭발!";
    }

    if (removedPositions.some(pos =>
      specialBoard[pos.r][pos.c] === "ice"
    )) {
      message += " 🧊 얼음 효과!";
    }

    showMessage(message);

    window.setTimeout(() => {
      // 제거된 사과를 빈칸으로 만듭니다.
      for (const pos of removedPositions) {
        board[pos.r][pos.c] = 0;
        specialBoard[pos.r][pos.c] = null;
      }

      // 사과를 아래로 떨어뜨리고 위쪽을 리필합니다.
      dropAndRefill();

      boardLocked = false;

      if (playing) {
        showMessage(
          `🍎 사과 리필 완료! +${earnedPoints}점`
        );
      }
    }, 160);
  }

  function dropAndRefill() {
    for (let c = 0; c < SIZE; c++) {
      let writeRow = SIZE - 1;

      // 기존 사과와 특수 효과 정보를 함께 아래로 이동합니다.
      for (let r = SIZE - 1; r >= 0; r--) {
        if (board[r][c] !== 0) {
          board[writeRow][c] = board[r][c];
          specialBoard[writeRow][c] = specialBoard[r][c];

          writeRow--;
        }
      }

      // 비어 있는 위쪽 칸에 새 사과를 생성합니다.
      for (let r = writeRow; r >= 0; r--) {
        board[r][c] = randomNumber();
        specialBoard[r][c] = randomSpecial();
      }
    }

    // 변경된 게임판을 화면에 반영합니다.
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        renderCell(r, c, true);
      }
    }
  }

  function endGame() {
    playing = false;
    dragging = false;
    boardLocked = false;

    clearSelection();

    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }

    updateStats();

    endTitle.textContent = "게임 종료!";
    endMessage.innerHTML =
      `최종 점수: <strong>${score}점</strong><br>` +
      `최고 점수: <strong>${best}점</strong><br>` +
      "다시 도전해서 기록을 갱신해 보세요!";

    overlay.hidden = false;
  }

  function startGame() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }

    score = 0;
    timeLeft = GAME_SECONDS;
    selected = [];
    dragging = false;
    boardLocked = false;
    playing = true;

    overlay.hidden = true;

    createBoard();
    updateStats();

    showMessage("드래그해서 합계 10을 만들어 보세요!");

    lastTick = Date.now();

    timerId = setInterval(() => {
      if (!playing) return;

      const now = Date.now();
      const elapsed = Math.floor((now - lastTick) / 1000);

      if (elapsed >= 1) {
        timeLeft = Math.max(0, timeLeft - elapsed);
        lastTick += elapsed * 1000;

        updateStats();
      }

      if (timeLeft <= 0) {
        endGame();
      }
    }, 100);
  }

  // 마우스와 터치를 모두 지원합니다.
  boardElement.addEventListener("pointerdown", event => {
    const cell = event.target.closest(".cell");

    if (!cell) return;

    event.preventDefault();

    startSelection({
      r: Number(cell.dataset.row),
      c: Number(cell.dataset.col)
    });
  });

  boardElement.addEventListener("pointermove", event => {
    if (!dragging) return;

    const element = document.elementFromPoint(
      event.clientX,
      event.clientY
    );

    const cell = element?.closest(".cell");

    if (!cell || !boardElement.contains(cell)) return;

    extendSelection({
      r: Number(cell.dataset.row),
      c: Number(cell.dataset.col)
    });
  });

  window.addEventListener("pointerup", finishSelection);
  window.addEventListener("pointercancel", finishSelection);

  document
    .getElementById("restart")
    .addEventListener("click", startGame);

  document
    .getElementById("overlayRestart")
    .addEventListener("click", startGame);

  document.getElementById("clear").addEventListener("click", () => {
    if (!playing || boardLocked) return;

    dragging = false;
    clearSelection();

    showMessage("선택을 취소했어요.");
  });

  startGame();
})();