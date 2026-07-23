const search = document.getElementById('search');
const cards = Array.from(document.querySelectorAll('.card'));
const catButtons = Array.from(document.querySelectorAll('.cat'));
const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const emptyTerm = document.getElementById('empty-term');
const catTitle = document.getElementById('cat-title');
const catCount = document.getElementById('cat-count');

let activeCat = 'all';

function applyFilters() {
  const term = search.value.trim().toLowerCase();
  let visibles = 0;
  for (const card of cards) {
    const okCat = activeCat === 'all' || card.dataset.cat === activeCat;
    const okTerm = !term || card.dataset.name.includes(term);
    const show = okCat && okTerm;
    card.hidden = !show;
    if (show) visibles += 1;
  }
  catCount.textContent = `${visibles} en directo`;
  if (visibles === 0 && term) {
    empty.hidden = false;
    emptyTerm.textContent = `«${search.value.trim()}»`;
    grid.hidden = true;
  } else {
    empty.hidden = true;
    grid.hidden = false;
  }
}

search.addEventListener('input', applyFilters);

for (const btn of catButtons) {
  btn.addEventListener('click', () => {
    activeCat = btn.dataset.cat;
    catButtons.forEach((b) => b.classList.toggle('active', b === btn));
    const label = btn.dataset.cat === 'all'
      ? 'Todos los canales'
      : btn.querySelector('span').textContent.trim();
    catTitle.textContent = label;
    applyFilters();
  });
}
