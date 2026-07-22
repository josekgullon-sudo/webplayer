const search = document.getElementById('search');
const cards = Array.from(document.querySelectorAll('.card'));
const catButtons = Array.from(document.querySelectorAll('.cat'));
let activeCat = 'all';

function applyFilters() {
  const term = search.value.trim().toLowerCase();
  for (const card of cards) {
    const matchesCat = activeCat === 'all' || card.dataset.cat === activeCat;
    const matchesTerm = !term || card.dataset.name.includes(term);
    card.style.display = matchesCat && matchesTerm ? '' : 'none';
  }
}

search.addEventListener('input', applyFilters);
for (const btn of catButtons) {
  btn.addEventListener('click', () => {
    activeCat = btn.dataset.cat;
    catButtons.forEach((b) => b.classList.toggle('active', b === btn));
    applyFilters();
  });
}
