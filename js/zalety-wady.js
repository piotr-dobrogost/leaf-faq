// Strona /zalety-wady/: suwaki wag i werdykt „kupować czy nie”. Wagi pamiętamy w przeglądarce czytelnika.
(() => {
  const sliders = [...document.querySelectorAll('.zw-weight input[type="range"]')];
  if (!sliders.length) return;
  const KEY = "zalety-wady-wagi";
  const TIE = 0.05;
  const text = document.getElementById("zw-text");
  const score = document.getElementById("zw-score");
  const diffEl = document.getElementById("zw-diff");
  const box = document.getElementById("zw-verdict");
  const barPro = box.querySelector(".zw-bar-pro");
  const barCon = box.querySelector(".zw-bar-con");

  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    for (const s of sliders) if (s.id in saved) s.value = saved[s.id];
  } catch (e) {}

  function update() {
    let pro = 0, con = 0;
    const saved = {};
    for (const s of sliders) {
      const v = +s.value;
      s.nextElementSibling.value = v;
      s.style.setProperty("--fill", v * 10 + "%");
      saved[s.id] = v;
      if (s.dataset.kind === "zalety") pro += v; else con += v;
    }
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {}
    const total = pro + con;
    barPro.style.width = total ? (pro / total) * 100 + "%" : "50%";
    barCon.style.width = total ? (con / total) * 100 + "%" : "50%";
    const diff = pro - con;
    // Styk pasków do 5% szerokości od środka (pole 45–55%, czyli różnica do 10% sumy wag) to jeszcze równowaga.
    const verdict = !total ? "none" : Math.abs(diff) <= 2 * TIE * total ? "tie" : diff > 0 ? "buy" : "skip";
    box.dataset.verdict = verdict;
    text.textContent = {
      none: "Ustaw suwaki, żeby zobaczyć wynik",
      tie: "Zalety i wady się równoważą – decyzja należy do Ciebie",
      buy: "Kupuj – w Twoim przypadku przeważają zalety",
      skip: "Nie kupuj – w Twoim przypadku przeważają wady",
    }[verdict];
    score.textContent = `zalety ${pro} : wady ${con}`;
    // Różnica stoi nad miejscem, w którym czerwony pasek (wady, z lewej) styka się z zielonym (zalety, z prawej).
    diffEl.textContent = `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${Math.abs(diff)}`;
    diffEl.style.setProperty("--pos", total ? (con / total) * 100 + "%" : "50%");
  }

  // Werdykt przykleja się tuż pod belką strony, której wysokość zależy od szerokości ekranu.
  const header = document.querySelector(".site-header");
  const setTop = () => box.style.setProperty("--zw-top", (header ? header.offsetHeight : 0) + 8 + "px");
  setTop();
  addEventListener("resize", setTop);

  document.getElementById("zw-cols").addEventListener("input", e => { if (e.target.type === "range") update(); });
  document.getElementById("zw-reset").addEventListener("click", () => { for (const s of sliders) s.value = 5; update(); });
  update();
})();
